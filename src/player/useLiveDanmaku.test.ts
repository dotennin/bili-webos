import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { React, act, flush, render } from '../test/reactTestUtils.ts';
import { buildLiveDanmakuPacket } from './liveDanmakuProtocol.ts';

const apiPath = new URL('../api/client.ts', import.meta.url).pathname;
const realApi = await import(apiPath);
const originalWebSocket = globalThis.WebSocket;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;
const originalDateNow = Date.now;
const originalWarn = console.warn;

let getLiveDanmakuInfo;
let sockets;
let intervals;
let now;
let latestState;

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    FakeWebSocket.instances.push(this);
  }

  send(packet) {
    this.sent.push(packet);
  }

  close() {
    this.closed = true;
  }
}

async function importFreshHook() {
  return import(`./useLiveDanmaku.ts?t=${Date.now()}-${Math.random()}`);
}

function Probe({ roomId = 1, enabled = true }) {
  const { useLiveDanmaku } = latestState.module;
  latestState.value = useLiveDanmaku(roomId, enabled);
  return React.createElement(
    'probe',
    {},
    JSON.stringify(latestState.value),
  );
}

async function renderProbe(props = {}) {
  latestState = { module: await importFreshHook(), value: null };
  const renderer = await render(React.createElement(Probe, props));
  await flush();
  await flush();
  return renderer;
}

beforeEach(() => {
  getLiveDanmakuInfo = mock(async () => ({
    data: {
      token: 'token-test',
      host_list: [{ host: 'danmaku.test', wss_port: 2245 }],
    },
  }));
  sockets = FakeWebSocket.instances = [];
  intervals = [];
  now = 1_000;
  Date.now = () => now;
  console.warn = mock(() => {});
  globalThis.WebSocket = FakeWebSocket;
  globalThis.setInterval = (fn, delay) => {
    const item = { fn, delay, cleared: false };
    intervals.push(item);
    return item;
  };
  globalThis.clearInterval = (item) => {
    if (item) item.cleared = true;
  };

  mock.module(apiPath, () => ({
    ...realApi,
    getLiveDanmakuInfo,
  }));
});

afterEach(() => {
  mock.restore();
  mock.module(apiPath, () => realApi);
  if (typeof originalWebSocket === 'undefined') delete globalThis.WebSocket;
  else globalThis.WebSocket = originalWebSocket;
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
  Date.now = originalDateNow;
  console.warn = originalWarn;
});

test('useLiveDanmaku stays unavailable when websocket or auth info is missing', async () => {
  delete globalThis.WebSocket;
  const noSocket = await renderProbe();
  expect(latestState.value.available).toBe(false);
  expect(String(noSocket.container.textContent)).toContain('"danmakus":[]');
  expect(console.warn).toHaveBeenCalled();

  globalThis.WebSocket = FakeWebSocket;
  getLiveDanmakuInfo.mockResolvedValueOnce({ data: { host_list: [] } });
  await renderProbe();
  expect(latestState.value.available).toBe(false);
  expect(sockets).toHaveLength(0);
});

test('useLiveDanmaku connects, parses live messages, and cleans up', async () => {
  const renderer = await renderProbe({ roomId: 88, enabled: true });
  expect(getLiveDanmakuInfo).toHaveBeenCalledWith(88);
  expect(sockets[0].url).toBe('wss://danmaku.test:2245/sub');

  await act(async () => {
    sockets[0].onopen();
    await flush();
  });
  expect(latestState.value.available).toBe(true);
  expect(sockets[0].sent.length).toBe(2);
  expect(intervals[0].delay).toBe(30000);

  now = 2_500;
  const payload = JSON.stringify({
    cmd: 'DANMU_MSG',
    info: [[0, 1, 25, 16777215], 'live text'],
  });
  await act(async () => {
    await sockets[0].onmessage({
      data: buildLiveDanmakuPacket(5, payload, 0),
    });
    await flush();
  });
  expect(latestState.value.currentTime).toBe(1.5);
  expect(latestState.value.danmakus).toEqual([
    {
      time: 1.5,
      mode: 1,
      size: 25,
      color: '#ffffff',
      text: 'live text',
    },
  ]);

  await act(async () => {
    sockets[0].onerror();
    await flush();
  });
  expect(latestState.value.available).toBe(false);

  await act(async () => {
    sockets[0].onclose();
    await flush();
  });
  expect(latestState.value.available).toBe(false);

  renderer.unmount();
  expect(intervals[0].cleared).toBe(true);
  expect(sockets[0].closed).toBe(true);
});
