import { beforeEach, expect, mock, test } from 'bun:test';

import {
  buildLiveDanmakuAuthPacket,
  buildLiveDanmakuHeartbeatPacket,
  buildLiveDanmakuPacket,
  getPreferredLiveDanmakuProtover,
  parseLiveDanmakuMessages,
} from './liveDanmakuProtocol.ts';

beforeEach(() => {
  globalThis.localStorage = {
    getItem: (key) =>
      key === 'bili_auth'
        ? JSON.stringify({ DedeUserID: '123', buvid3: 'buvid-test' })
        : null,
    setItem: () => {},
    removeItem: () => {},
  };
});

function header(buffer) {
  return new DataView(buffer);
}

test('builds heartbeat and auth packets for live websocket', () => {
  const heartbeat = buildLiveDanmakuHeartbeatPacket();
  expect(header(heartbeat).getUint32(8)).toBe(2);

  const auth = buildLiveDanmakuAuthPacket(88, 'token-test', 0, {
    DedeUserID: '123',
    buvid3: 'buvid-test',
  });
  expect(header(auth).getUint32(8)).toBe(7);

  const body = new TextDecoder().decode(new Uint8Array(auth, 16));
  expect(JSON.parse(body)).toMatchObject({
    uid: 123,
    roomid: 88,
    protover: 0,
    buvid: 'buvid-test',
    key: 'token-test',
  });
});

test('prefers compressed live danmaku only when runtime can inflate', () => {
  const original = globalThis.DecompressionStream;
  try {
    delete globalThis.DecompressionStream;
    expect(getPreferredLiveDanmakuProtover()).toBe(0);
    globalThis.DecompressionStream = function () {} as any;
    expect(getPreferredLiveDanmakuProtover()).toBe(2);
  } finally {
    globalThis.DecompressionStream = original;
  }
});

test('parses plain DANMU_MSG packets and skips unsupported compression', async () => {
  const payload = JSON.stringify({
    cmd: 'DANMU_MSG',
    info: [[0, 1, 25, 16777215], '直播弹幕'],
  });

  const messages = await parseLiveDanmakuMessages(
    buildLiveDanmakuPacket(5, payload, 0),
    1.5,
  );
  expect(messages).toEqual([
    {
      time: 1.5,
      mode: 1,
      size: 25,
      color: '#ffffff',
      text: '直播弹幕',
    },
  ]);

  const warn = console.warn;
  console.warn = mock(() => {});
  try {
    const skipped = await parseLiveDanmakuMessages(
      buildLiveDanmakuPacket(5, new Uint8Array([1, 2, 3]), 3),
      2,
    );
    expect(skipped).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  } finally {
    console.warn = warn;
  }
});
