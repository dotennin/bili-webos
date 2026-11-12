import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import {
  React,
  render,
  update,
  flush,
  createEventTarget,
  interact,
} from '../test/reactTestUtils.ts';

let api;
let focusId;
let focusListener;
let setFocusCalls;
let videoGridCalls;
let timers;
let storageState;
const apiPath = new URL('../api/client.ts', import.meta.url).pathname;
const hooksPath = new URL('../hooks/useFocus.ts', import.meta.url).pathname;
const storagePath = new URL('../utils/storage.ts', import.meta.url).pathname;
const responsiveColsPath = new URL(
  '../hooks/useResponsiveGridCols.ts',
  import.meta.url,
).pathname;
const realApi = await import(apiPath);
const realHooks = await import(hooksPath);
const realStorage = await import(storagePath);
const originalGlobals = {
  window: globalThis.window,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
};

function restoreGlobal(name, value) {
  if (typeof value === 'undefined') {
    delete globalThis[name];
    return;
  }
  globalThis[name] = value;
}

async function importFresh() {
  return import(`./HomePage.tsx?t=${Date.now()}-${Math.random()}`);
}

beforeEach(() => {
  api = {
    getPopular: mock(async () => ({
      data: {
        list: [
          { bvid: 'BV1', title: '热门1' },
          { bvid: 'BV1', title: '重复' },
        ],
      },
    })),
    getRecommend: mock(async () => ({
      data: { item: [{ bvid: 'BV2', title: '推荐1' }] },
    })),
    getRegionDynamic: mock(async () => ({
      data: { archives: [{ bvid: 'BV3', title: '分区1' }] },
    })),
    getFollowFeed: mock(async () => ({
      data: {
        items: [
          {
            modules: {
              module_dynamic: {
                major: {
                  archive: {
                    bvid: 'BV4',
                    title: '关注1',
                    cover: 'p',
                    duration_text: '01:00',
                    pubdate: 1,
                    stat: { play: 2 },
                  },
                },
              },
              module_author: { name: '作者' },
            },
          },
        ],
      },
    })),
    getLiveList: mock(async () => ({
      data: {
        list: [
          { roomid: 3, title: '直播1', cover: 'c', uname: '主播', online: 8 },
        ],
      },
    })),
  };
  focusId = null;
  focusListener = null;
  setFocusCalls = [];
  videoGridCalls = [];
  timers = [];
  storageState = {
    settings: { danmaku: true, quality: 80, videoGridCols: 4 },
  };

  globalThis.window = createEventTarget();
  globalThis.setTimeout = (fn, delay) => {
    const item = { fn, delay };
    timers.push(item);
    return item;
  };
  globalThis.clearTimeout = () => {};

  mock.module(apiPath, () => ({
    ...realApi,
    ...api,
  }));
  mock.module('../components/VideoGrid', () => ({
    default(props) {
      videoGridCalls.push(props);
      return React.createElement(
        'grid',
        { count: props.videos.length },
        props.videos.map((v) => v.title).join('|'),
      );
    },
  }));
  mock.module(hooksPath, () => ({
    ...realHooks,
    getCurrentFocusId: () => focusId,
    setFocus(id) {
      setFocusCalls.push(id);
      focusId = id;
    },
    restoreFocusIfMissing(id) {
      if (!focusId) {
        setFocusCalls.push(id);
        focusId = id;
      }
    },
    onFocusChange(handler) {
      focusListener = handler;
      return () => {
        if (focusListener === handler) focusListener = null;
      };
    },
  }));
  mock.module(storagePath, () => ({
    ...realStorage,
    storage: {
      ...realStorage.storage,
      getSettings: () => storageState.settings,
    },
  }));
  mock.module(responsiveColsPath, () => ({
    useResponsiveGridCols: () => 4,
  }));
});

afterEach(() => {
  mock.restore();
  mock.module(apiPath, () => realApi);
  mock.module(hooksPath, () => realHooks);
  mock.module(storagePath, () => realStorage);
  for (const [name, value] of Object.entries(originalGlobals)) {
    restoreGlobal(name, value);
  }
});

test('HomePage loads by mode, dedupes items, focuses first content, and loads more near bottom', async () => {
  const { default: HomePage } = await importFresh();
  const renderer = await render(
    React.createElement(HomePage, {
      mode: 'hot',
      refreshKey: 0,
      onPlayVideo() {},
    }),
  );
  await flush();

  expect(api.getPopular).toHaveBeenCalledWith(1, 20);
  expect(videoGridCalls.at(-1).videos).toEqual([
    { bvid: 'BV1', title: '热门1' },
  ]);
  expect(videoGridCalls.at(-1).cols).toBe(4);
  timers[0]?.fn();
  expect(setFocusCalls).toEqual(['content-0-0']);

  api.getPopular.mockResolvedValueOnce({
    data: { list: [{ bvid: 'BV5', title: '热门2' }] },
  });
  focusId = 'content-4-0';
  const focusCallCountBeforePagination = setFocusCalls.length;
  await interact(() => focusListener?.('content-0-0'));
  expect(videoGridCalls.at(-1).videos.map((v) => v.bvid)).toEqual([
    'BV1',
    'BV5',
  ]);
  expect(videoGridCalls.at(-1).focusRow).toBeUndefined();
  expect(setFocusCalls).toHaveLength(focusCallCountBeforePagination);
  expect(focusId).toBe('content-4-0');

  setFocusCalls = [];
  focusId = 'sidebar-0-0';
  const recommendRenderer = await render(
    React.createElement(HomePage, {
      mode: 'recommend',
      refreshKey: 1,
      onPlayVideo() {},
    }),
  );
  await flush();
  timers.at(-1)?.fn();
  expect(api.getRecommend).toHaveBeenCalledWith(4, 20, 2);
  expect(setFocusCalls).toEqual(['content-0-0']);

  api.getRecommend.mockResolvedValueOnce({
    data: { item: [{ bvid: 'BV6', title: '推荐2' }] },
  });
  await interact(() => focusListener?.('content-0-0'));
  expect(api.getRecommend).toHaveBeenLastCalledWith(4, 20, 3);
  expect(videoGridCalls.at(-1).videos.map((v) => v.bvid)).toEqual([
    'BV2',
    'BV6',
  ]);

  await render(
    React.createElement(HomePage, {
      mode: 'partition',
      refreshKey: 2,
      onPlayVideo() {},
    }),
  );
  await flush();
  expect(api.getRegionDynamic).toHaveBeenCalled();

  await render(
    React.createElement(HomePage, {
      mode: 'follow',
      refreshKey: 3,
      onPlayVideo() {},
    }),
  );
  await flush();
  expect(videoGridCalls.at(-1).videos[0]).toMatchObject({
    bvid: 'BV4',
    owner: { name: '作者' },
  });

  await render(
    React.createElement(HomePage, {
      mode: 'live',
      refreshKey: 4,
      onPlayVideo() {},
    }),
  );
  await flush();
  expect(videoGridCalls.at(-1).videos[0]).toMatchObject({
    bvid: 'live-3',
    roomid: 3,
    isLive: true,
  });

  expect(renderer).toBeTruthy();
  expect(recommendRenderer).toBeTruthy();
});

test('HomePage handles initial and pagination failures without leaving loading state stuck', async () => {
  const { default: HomePage } = await importFresh();

  api.getPopular.mockImplementationOnce(async () => {
    throw new Error('load failed');
  });
  const failedRenderer = await render(
    React.createElement(HomePage, {
      mode: 'hot',
      refreshKey: 9,
      onPlayVideo() {},
    }),
  );
  await flush();
  expect(String(failedRenderer.container.textContent || '')).not.toContain(
    '加载中...',
  );

  api.getPopular.mockResolvedValueOnce({
    data: { list: [{ bvid: 'BV10', title: '热门10' }] },
  });
  const pagingRenderer = await render(
    React.createElement(HomePage, {
      mode: 'hot',
      refreshKey: 10,
      onPlayVideo() {},
    }),
  );
  await flush();
  api.getPopular.mockImplementationOnce(async () => {
    throw new Error('page failed');
  });
  await interact(() => focusListener?.('content-0-0'));
  expect(videoGridCalls.at(-1).videos).toEqual([
    { bvid: 'BV10', title: '热门10' },
  ]);

  expect(failedRenderer).toBeTruthy();
  expect(pagingRenderer).toBeTruthy();
});

test('HomePage loads more on scroll without focus changes and avoids concurrent requests', async () => {
  let resolveNext;
  const { default: HomePage } = await importFresh();
  const renderer = await render(
    React.createElement(HomePage, { mode: 'recommend', refreshKey: 0 }),
  );
  await flush();

  api.getRecommend.mockImplementationOnce(
    () => new Promise((resolve) => { resolveNext = resolve; }),
  );
  const scroll = renderer.container.querySelector('.page-scroll');
  Object.defineProperties(scroll, {
    scrollHeight: { configurable: true, value: 2400 },
    clientHeight: { configurable: true, value: 600 },
    scrollTop: { configurable: true, writable: true, value: 200 },
  });
  await interact(() => scroll.dispatchEvent(new Event('scroll', { bubbles: true })));
  expect(api.getRecommend).toHaveBeenCalledTimes(1);

  scroll.scrollTop = 1650;
  await interact(() => {
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }));
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  expect(api.getRecommend).toHaveBeenCalledTimes(2);
  expect(api.getRecommend).toHaveBeenLastCalledWith(4, 20, 2);

  await interact(() => resolveNext({ data: { item: [{ bvid: 'BV9', title: '推荐9' }] } }));
  expect(videoGridCalls.at(-1).videos.map((v) => v.bvid)).toEqual(['BV2', 'BV9']);
  renderer.unmount();
});

test('HomePage skips duplicate recommendation pages to find new videos', async () => {
  const { default: HomePage } = await importFresh();
  const renderer = await render(
    React.createElement(HomePage, { mode: 'recommend', refreshKey: 0 }),
  );
  await flush();
  api.getRecommend.mockResolvedValueOnce({
    data: { item: [{ bvid: 'BV2', title: '重复推荐' }] },
  });
  api.getRecommend.mockResolvedValueOnce({
    data: { item: [{ bvid: 'BV11', title: '新推荐' }] },
  });

  await interact(() => focusListener?.('content-0-0'));
  expect(api.getRecommend).toHaveBeenCalledTimes(3);
  expect(api.getRecommend).toHaveBeenLastCalledWith(4, 20, 3);
  expect(videoGridCalls.at(-1).videos.map((v) => v.bvid)).toEqual([
    'BV2',
    'BV11',
  ]);
  renderer.unmount();
});

test('HomePage ignores old pagination results after refresh', async () => {
  let resolveOldPage;
  const { default: HomePage } = await importFresh();
  const renderer = await render(
    React.createElement(HomePage, { mode: 'recommend', refreshKey: 0 }),
  );
  await flush();

  api.getRecommend.mockImplementationOnce(
    () => new Promise((resolve) => { resolveOldPage = resolve; }),
  );
  await interact(() => focusListener?.('content-0-0'));
  expect(api.getRecommend).toHaveBeenCalledTimes(2);

  api.getRecommend.mockResolvedValueOnce({
    data: { item: [{ bvid: 'BV10', title: '刷新后' }] },
  });
  await update(
    renderer,
    React.createElement(HomePage, { mode: 'recommend', refreshKey: 1 }),
  );
  await flush();
  expect(api.getRecommend).toHaveBeenLastCalledWith(4, 20, 2);
  expect(videoGridCalls.at(-1).videos.map((v) => v.bvid)).toEqual(['BV10']);

  await interact(() => resolveOldPage({ data: { item: [{ bvid: 'OLD' }] } }));
  expect(videoGridCalls.at(-1).videos.map((v) => v.bvid)).toEqual(['BV10']);
  renderer.unmount();
});
