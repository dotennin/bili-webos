import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { React, render, flush, createEventTarget, createVideoMock, update, act, interact } from '../test/reactTestUtils.mjs';

let api;
let storageState;
let customKeyHandler;
let eventTarget;
let timers;
let intervals;
let queryCards;
let shakaLoads;
let shakaDestroyed;
let mpegtsDestroyed;
let originalConsoleError;
const apiPath = new URL('../api/client.js', import.meta.url).pathname;
const storagePath = new URL('../utils/storage.js', import.meta.url).pathname;
const proxyPath = new URL('../utils/proxy.js', import.meta.url).pathname;
const hooksPath = new URL('../hooks/useFocus.js', import.meta.url).pathname;
const realApi = await import(apiPath);
const realStorage = await import(storagePath);
const realProxy = await import(proxyPath);
const realHooks = await import(hooksPath);
const NativeURL = globalThis.URL;

async function importFresh(pathname) {
  return import(`${pathname}?t=${Date.now()}-${Math.random()}`);
}

function event(key, keyCode = 0) {
  return {
    key,
    keyCode,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };
}

beforeEach(() => {
  api = {
    getPlayUrl: mock(async (_video, _cid, qn = 80) => ({
      data: {
        dash: {
          duration: 120,
          minBufferTime: 1.5,
          video: [{ id: 80, baseUrl: 'https://video.test/main.m4s', bandwidth: 1000 }],
          audio: [{ id: 30216, base_url: 'https://audio.test/main.m4s', bandwidth: 128 }],
        },
        accept_quality: [80, 64],
        quality: qn,
      },
    })),
    getDanmaku: mock(async () => [{ time: 1, text: 'hello', mode: 1 }]),
    getVideoInfo: mock(async () => ({ data: { cid: 7, title: '详情标题', bvid: 'BVX' } })),
    reportHeartbeat: mock(() => {}),
    getRelated: mock(async () => ({ data: [{ bvid: 'BV2', title: '相关1', pic: '//img/1.jpg' }, { bvid: 'BV3', title: '相关2' }] })),
    castReportProgress: mock(async () => {}),
    castReportState: mock(async () => {}),
    getLiveStreamSource: mock(async () => ({ type: 'flv', url: 'https://live.test/stream.flv' })),
  };
  storageState = {
    settings: { danmaku: true, quality: 80 },
  };
  customKeyHandler = null;
  eventTarget = createEventTarget();
  timers = [];
  intervals = [];
  queryCards = [{ scrollIntoView: mock(() => {}) }, { scrollIntoView: mock(() => {}) }];
  shakaLoads = [];
  shakaDestroyed = 0;
  mpegtsDestroyed = 0;

  globalThis.window = Object.assign(eventTarget, {});
  globalThis.document = {
    querySelectorAll(selector) {
      return selector === '.related-card' ? queryCards : [];
    },
    createElement(tag) {
      return {
        tag,
        className: '',
        textContent: '',
        style: {},
        removed: false,
        listeners: {},
        addEventListener(type, handler) {
          this.listeners[type] = handler;
        },
        remove() {
          this.removed = true;
        },
      };
    },
  };
  globalThis.setTimeout = (fn, delay) => {
    const item = { fn, delay, cleared: false };
    timers.push(item);
    return item;
  };
  globalThis.clearTimeout = (item) => {
    if (item) item.cleared = true;
  };
  globalThis.setInterval = (fn, delay) => {
    const item = { fn, delay, cleared: false };
    intervals.push(item);
    return item;
  };
  globalThis.clearInterval = (item) => {
    if (item) item.cleared = true;
  };
  globalThis.URL = class URLWithBlob extends NativeURL {
    static createObjectURL() {
      return 'blob:test';
    }
    static revokeObjectURL() {}
  };

  mock.module(apiPath, () => ({
    ...realApi,
    ...api,
  }));
  mock.module(storagePath, () => ({
    ...realStorage,
    storage: {
      ...realStorage.storage,
      getSettings: () => storageState.settings,
      setSettings: (value) => {
        storageState.settings = value;
      },
    },
  }));
  mock.module(proxyPath, () => ({
    ...realProxy,
    getProxyBase: () => 'http://proxy.test',
    buildProxyUrl: (url) => `http://proxy.test/proxy/${new URL(url).host}${new URL(url).pathname}${new URL(url).search}`,
  }));
  mock.module(hooksPath, () => ({
    ...realHooks,
    setCustomKeyHandler(handler) {
      customKeyHandler = handler;
    },
  }));
  mock.module('./DanmakuLayer.jsx', () => ({
    default(props) {
      return React.createElement('danmaku-layer', { enabled: props.enabled, count: props.danmakus.length }, null);
    },
  }));
  mock.module('shaka-player', () => ({
    default: null,
    polyfill: { installAll() {} },
    Player: class {
      static isBrowserSupported() {
        return true;
      }
      configure() {}
      async attach() {}
      addEventListener() {}
      getNetworkingEngine() {
        return {
          registerRequestFilter() {},
        };
      }
      async load(url) {
        shakaLoads.push(url);
      }
      async destroy() {
        shakaDestroyed += 1;
      }
    },
  }));
  mock.module('mpegts.js', () => ({
    default: null,
    isSupported: () => true,
    getFeatureList: () => ({ mseLivePlayback: true }),
    Events: { ERROR: 'error' },
    createPlayer() {
      return {
        on() {},
        attachMediaElement() {},
        load() {},
        async play() {},
        destroy() {
          mpegtsDestroyed += 1;
        },
      };
    },
  }));
  originalConsoleError = console.error;
  console.error = (...args) => {
    const first = String(args[0] || '');
    if (first.includes('not wrapped in act')) return;
    originalConsoleError(...args);
  };
});

afterEach(() => {
  mock.restore();
  globalThis.URL = NativeURL;
  console.error = originalConsoleError;
});

describe('DanmakuLayer', () => {
  test('renders visible danmaku items and resets on source change', async () => {
    const { default: DanmakuLayer } = await importFresh('./DanmakuLayer.jsx');
    const container = {
      innerHTML: 'old',
      appended: [],
      appendChild(node) {
        this.appended.push(node);
      },
    };

    const renderer = await render(
      React.createElement(DanmakuLayer, {
        danmakus: [
          { time: 1, text: '弹幕1', mode: 1, color: '#f00', size: 32 },
          { time: 5, text: '忽略', mode: 4 },
        ],
        currentTime: 1.1,
        enabled: true,
      }),
      {
        createNodeMock: (element) => (element.type === 'div' ? container : null),
      },
    );

    expect(container.innerHTML).toBe('');
    expect(container.appended).toHaveLength(1);
    expect(container.appended[0].textContent).toBe('弹幕1');
    container.appended[0].listeners.animationend();
    expect(container.appended[0].removed).toBe(true);

    await update(
      renderer,
      React.createElement(DanmakuLayer, {
        danmakus: [{ time: 2, text: '弹幕2', mode: 1 }],
        currentTime: 2.1,
        enabled: false,
      }),
    );
    expect(renderer.toJSON()).toBeNull();
  });
});

describe('PlayerPage', () => {
  test('loads video, handles cast commands and remote keys, and cleans up', async () => {
    const { default: PlayerPage } = await importFresh('./PlayerPage.jsx');
    const video = createVideoMock();
    const onBack = mock(() => {});
    const onPlayNext = mock(() => {});

    const renderer = await render(
      React.createElement(PlayerPage, {
        video: { bvid: 'BV1', title: '初始标题', owner: { name: '作者' }, progress: 25, pubdate: 1710000000 },
        onBack,
        onPlayNext,
      }),
      {
        createNodeMock: (element) => (element.type === 'video' ? video : null),
      },
    );
    await act(async () => {
      await flush();
      await flush();
      await flush();
    });

    expect(api.getVideoInfo).toHaveBeenCalled();
    expect(api.getPlayUrl).toHaveBeenCalledWith(expect.any(Object), 7, 80);
    expect(shakaLoads[0]).toBe('blob:test');
    expect(video.playCalls).toBeGreaterThan(0);

    video.readyState = 2;
    await interact(() => video.dispatch('loadeddata'));
    expect(api.castReportState).toHaveBeenCalledWith({ playState: 'playing' });

    await interact(() => customKeyHandler(event('ArrowUp')));
    expect(JSON.stringify(renderer.toJSON())).toContain('⏸ 暂停');

    await interact(() => customKeyHandler(event('ArrowRight')));
    await interact(() => customKeyHandler(event('ArrowRight')));
    expect(JSON.stringify(renderer.toJSON())).toContain('player-btn focused');

    await interact(() => eventTarget.dispatchEvent(new CustomEvent('bili-cast-command', { detail: { type: 'pause' } })));
    await interact(() => eventTarget.dispatchEvent(new CustomEvent('bili-cast-command', { detail: { type: 'resume' } })));
    await interact(() => eventTarget.dispatchEvent(new CustomEvent('bili-cast-command', { detail: { type: 'seek', positionSec: 33 } })));
    await interact(() => eventTarget.dispatchEvent(new CustomEvent('bili-cast-command', { detail: { type: 'switchDanmaku', open: false } })));
    await interact(() => eventTarget.dispatchEvent(new CustomEvent('bili-cast-command', { detail: { type: 'stop' } })));
    expect(video.currentTime).toBe(33);
    expect(onBack).toHaveBeenCalled();

    await interact(() => video.dispatch('ended'));
    expect(JSON.stringify(renderer.toJSON())).toContain('播放结束');

    await interact(() => customKeyHandler(event('ArrowRight')));
    await interact(() => customKeyHandler(event('Enter')));
    expect(onPlayNext).toHaveBeenCalled();

    intervals[0].fn();
    expect(api.castReportProgress).toHaveBeenCalled();

    video.paused = false;
    intervals[1].fn();
    expect(api.reportHeartbeat).toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
    expect(customKeyHandler).toBeNull();
    expect(shakaDestroyed).toBeGreaterThan(0);
  });
});

describe('LivePlayerPage', () => {
  test('plays live stream, reacts to cast commands and key handler, and stops cleanly', async () => {
    const { default: LivePlayerPage } = await importFresh('./LivePlayerPage.jsx');
    const video = createVideoMock();
    const onBack = mock(() => {});

    const renderer = await render(
      React.createElement(LivePlayerPage, {
        room: { roomid: 9, title: '直播间', owner: { name: '主播' } },
        onBack,
      }),
      {
        createNodeMock: (element) => (element.type === 'video' ? video : null),
      },
    );
    await act(async () => {
      await flush();
      await flush();
    });

    expect(api.getLiveStreamSource).toHaveBeenCalledWith(9);

    video.readyState = 2;
    await interact(() => video.dispatch('playing'));
    expect(api.castReportState).toHaveBeenCalledWith({ playState: 'playing' });

    await interact(() => eventTarget.dispatchEvent(new CustomEvent('bili-cast-command', { detail: { type: 'pause' } })));
    await interact(() => eventTarget.dispatchEvent(new CustomEvent('bili-cast-command', { detail: { type: 'resume' } })));
    video.duration = 100;
    await interact(() => eventTarget.dispatchEvent(new CustomEvent('bili-cast-command', { detail: { type: 'seek', positionSec: 44 } })));
    await interact(() => eventTarget.dispatchEvent(new CustomEvent('bili-cast-command', { detail: { type: 'stop' } })));
    expect(video.currentTime).toBe(44);
    expect(onBack).toHaveBeenCalled();

    await interact(() => customKeyHandler(event('MediaPause', 19)));
    await interact(() => customKeyHandler(event('ArrowUp')));
    await interact(() => customKeyHandler(event('Backspace', 461)));
    expect(onBack).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer.unmount();
    });
    expect(customKeyHandler).toBeNull();
    expect(mpegtsDestroyed).toBeGreaterThan(0);
  });
});
