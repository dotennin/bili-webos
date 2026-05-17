import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { React, render, textOf } from '../test/reactTestUtils.mjs';

let focusCalls;
let focusConfigs;
let originalURL;
const hooksPath = new URL('../hooks/useFocus.js', import.meta.url).pathname;
const realHooks = await import(hooksPath);

async function importComponent(pathname) {
  return import(`${pathname}?t=${Date.now()}-${Math.random()}`);
}

beforeEach(() => {
  focusCalls = [];
  focusConfigs = [];
  originalURL = globalThis.URL;

  mock.module(hooksPath, () => ({
    ...realHooks,
    useFocusable(config) {
      focusConfigs.push(config);
      return {
        props: {
          'data-focus-id': config.id,
          onClick: (e) => {
            e?.preventDefault?.();
            config.onSelect?.();
          },
          onMouseEnter: () => {},
          style: { cursor: 'pointer' },
        },
      };
    },
  }));
});

afterEach(() => {
  mock.restore();
  globalThis.URL = originalURL;
});

describe('rendered components', () => {
  test('FocusableTab wires active state and onSelect', async () => {
    const { default: FocusableTab } = await importComponent('./FocusableTab.jsx');
    const renderer = await render(
      React.createElement(FocusableTab, {
        id: 'tab-1',
        row: 1,
        col: 2,
        group: 'content',
        label: '推荐',
        active: true,
        onSelect: () => focusCalls.push('selected'),
      }),
    );

    const tab = renderer.root.findByType('div');
    expect(tab.props.className).toBe('tab active');
    expect(textOf(tab)).toBe('推荐');
    tab.props.onClick({ preventDefault() {} });
    expect(focusCalls).toEqual(['selected']);
    expect(focusConfigs[0]).toMatchObject({ id: 'tab-1', row: 1, col: 2, group: 'content' });
  });

  test('OSKey applies wide class for action keys and calls onPress', async () => {
    const { default: OSKey } = await importComponent('./OSKey.jsx');
    const renderer = await render(
      React.createElement(OSKey, {
        id: 'osk-3-8',
        row: 3,
        col: 8,
        group: 'content',
        label: '搜索',
        isAction: true,
        onPress: () => focusCalls.push('press'),
      }),
    );

    const key = renderer.root.findByType('div');
    expect(key.props.className).toBe('osk-key wide');
    key.props.onClick({ preventDefault() {} });
    expect(focusCalls).toEqual(['press']);
  });

  test('SidebarItem renders icon/label and active state', async () => {
    const { default: SidebarItem } = await importComponent('./SidebarItem.jsx');
    const renderer = await render(
      React.createElement(SidebarItem, {
        id: 'sidebar-1-0',
        row: 1,
        icon: '🔥',
        label: '热门',
        active: true,
        onSelect: () => focusCalls.push('sidebar'),
      }),
    );

    const item = renderer.root.findByProps({ className: 'sidebar-item active' });
    expect(textOf(item)).toContain('🔥');
    expect(textOf(item)).toContain('热门');
    item.props.onClick({ preventDefault() {} });
    expect(focusCalls).toEqual(['sidebar']);
  });

  test('VideoCard formats metadata, proxies thumbnails, and shows progress', async () => {
    const { default: VideoCard } = await importComponent('./VideoCard.jsx');
    const renderer = await render(
      React.createElement(VideoCard, {
        video: {
          bvid: 'BV1',
          pic: '//i0.hdslb.com/test.jpg',
          title: '测试视频',
          duration: 125,
          progress: 60,
          owner: { name: 'UP 主' },
          stat: { view: 12345 },
          pubdate: 1710000000,
        },
        focusId: 'content-0-0',
        row: 0,
        col: 0,
        group: 'content',
        onSelect: (video) => focusCalls.push(video.bvid),
      }),
    );

    const img = renderer.root.findByType('img');
    expect(img.props.src).toBe('http://127.0.0.1:7654/proxy/i0.hdslb.com/test.jpg@672w_420h_1c.webp');
    expect(textOf(renderer.toJSON())).toContain('测试视频');
    expect(textOf(renderer.toJSON())).toContain('UP 主');
    expect(textOf(renderer.toJSON())).toContain('播放');

    const card = renderer.root.findByProps({ className: 'video-card' });
    card.props.onClick({ preventDefault() {} });
    expect(focusCalls).toEqual(['BV1']);
  });

  test('VideoCard falls back to original url when proxy rewrite throws', async () => {
    globalThis.URL = class BrokenURL {
      constructor() {
        throw new Error('bad proxy');
      }
    };
    const { default: VideoCard } = await importComponent('./VideoCard.jsx');
    const renderer = await render(
      React.createElement(VideoCard, {
        video: { bvid: 'BV2', cover: 'https://example.com/cover.jpg', title: '原图' },
        focusId: 'content-0-1',
        row: 0,
        col: 1,
        group: 'content',
      }),
    );

    expect(renderer.root.findByType('img').props.src).toBe('https://example.com/cover.jpg');
  });

  test('VideoCard supports play count metadata and empty thumbnail state', async () => {
    const { default: VideoCard } = await importComponent('./VideoCard.jsx');
    const renderer = await render(
      React.createElement(VideoCard, {
        video: { bvid: 'BV3', title: '仅播放数', play: 4567, duration: '01:23' },
        focusId: 'content-1-0',
        row: 1,
        col: 0,
        group: 'content',
      }),
    );

    expect(renderer.root.findAllByType('img')).toHaveLength(0);
    expect(textOf(renderer.toJSON())).toContain('仅播放数');
    expect(textOf(renderer.toJSON())).toContain('播放');
  });

  test('VideoGrid renders empty state and mapped VideoCard props', async () => {
    const { default: VideoGrid } = await importComponent('./VideoGrid.jsx');
    const emptyRenderer = await render(React.createElement(VideoGrid, { videos: [] }));
    expect(textOf(emptyRenderer.toJSON())).toContain('暂无内容');

    const selectCalls = [];
    const gridRenderer = await render(
      React.createElement(VideoGrid, {
        videos: [
          { bvid: 'BV1', title: '一' },
          { bv_id: 'BV2', title: '二' },
          { title: '三' },
        ],
        group: 'results',
        startRow: 4,
        cols: 2,
        focusRow: 3,
        onSelect: (video) => selectCalls.push(video.title),
      }),
    );

    const cards = gridRenderer.root.findAllByProps({ className: 'video-card' });
    expect(cards).toHaveLength(3);
    expect(cards[0].props['data-focus-id']).toBe('results-4-0');
    expect(cards[1].props['data-focus-id']).toBe('results-4-1');
    expect(cards[2].props['data-focus-id']).toBe('results-5-0');
    cards[2].props.onClick({ preventDefault() {} });
    expect(selectCalls).toEqual(['三']);
  });
});
