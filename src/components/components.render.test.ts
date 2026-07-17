import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { React, render, textOf } from '../test/reactTestUtils.ts';

let focusCalls;
let focusConfigs;
let originalURL;
const hooksPath = new URL('../hooks/useFocus.ts', import.meta.url).pathname;
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
  test('AppIcon renders consistent dependency-free svg icons', async () => {
    const { default: AppIcon, APP_ICON_NAMES } =
      await importComponent('./AppIcon.tsx');

    for (const name of APP_ICON_NAMES) {
      const renderer = await render(
        React.createElement(AppIcon, { name, className: 'nav-icon' }),
      );
      const svg = renderer.container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg.getAttribute('class')).toContain('nav-icon');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      renderer.unmount();
    }
  });

  test('PageHeader renders required and optional content', async () => {
    const { default: PageHeader } =
      await importComponent('./PageHeader.tsx');
    const renderer = await render(
      React.createElement(
        PageHeader,
        {
          title: '为你推荐',
          eyebrow: 'DISCOVER',
          description: '精选内容',
        },
        React.createElement('span', null, '用户'),
      ),
    );
    expect(textOf(renderer.toJSON())).toContain('DISCOVER');
    expect(textOf(renderer.toJSON())).toContain('为你推荐');
    expect(textOf(renderer.toJSON())).toContain('精选内容');
    expect(textOf(renderer.toJSON())).toContain('用户');
    renderer.unmount();

    const titleOnly = await render(
      React.createElement(PageHeader, { title: '搜索' }),
    );
    expect(textOf(titleOnly.toJSON())).toBe('搜索');
    titleOnly.unmount();
  });

  test('PageState renders loading, empty, error, and unauthenticated states', async () => {
    const { default: PageState } =
      await importComponent('./PageState.tsx');
    const cases = [
      ['loading', '加载中...', true],
      ['empty', '暂无内容', false],
      ['error', '加载失败', false],
      ['unauthenticated', '请先登录', false],
    ];

    for (const [state, message, hasSpinner] of cases) {
      const renderer = await render(
        React.createElement(PageState, { state, message }),
      );
      expect(textOf(renderer.toJSON())).toContain(message);
      expect(renderer.container.querySelector('.loading-spinner') !== null).toBe(
        hasSpinner,
      );
      renderer.unmount();
    }
  });

  test('FocusableTab wires active state and onSelect', async () => {
    const { default: FocusableTab } =
      await importComponent('./FocusableTab.tsx');
    const onSelect = () => focusCalls.push('selected');
    const renderer = await render(
      React.createElement(FocusableTab, {
        id: 'tab-1',
        row: 1,
        col: 2,
        group: 'content',
        label: '推荐',
        active: true,
        onSelect,
      }),
    );

    const tab = renderer.container.querySelector('div');
    expect(tab.className).toBe('tab tab-focus-unified tab-default active');
    expect(textOf(tab)).toBe('推荐');
    expect(focusConfigs.at(-1).onSelect).toBe(onSelect);
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(focusCalls).toEqual(['selected']);
    expect(focusConfigs[0]).toMatchObject({
      id: 'tab-1',
      row: 1,
      col: 2,
      group: 'content',
    });
    renderer.unmount();
  });

  test('OSKey applies wide class for action keys and calls onPress', async () => {
    const { default: OSKey } = await importComponent('./OSKey.tsx');
    const onPress = () => focusCalls.push('press');
    const renderer = await render(
      React.createElement(OSKey, {
        id: 'osk-3-8',
        row: 3,
        col: 8,
        group: 'content',
        label: '搜索',
        isAction: true,
        onPress,
      }),
    );

    const key = renderer.container.querySelector('div');
    expect(key.className).toBe('osk-key wide');
    expect(focusConfigs.at(-1).onSelect).toBe(onPress);
    key.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(focusCalls).toEqual(['press']);
    renderer.unmount();
  });

  test('SidebarItem renders icon/label and active state', async () => {
    const { default: SidebarItem } = await importComponent('./SidebarItem.tsx');
    const onSelect = () => focusCalls.push('sidebar');
    const renderer = await render(
      React.createElement(SidebarItem, {
        id: 'sidebar-1-0',
        row: 1,
        icon: 'hot',
        label: '热门',
        active: true,
        onSelect,
      }),
    );

    const item = renderer.container.querySelector('.sidebar-item.active');
    expect(item.querySelector('svg')).not.toBeNull();
    expect(textOf(item)).toContain('热门');
    expect(focusConfigs.at(-1).onSelect).toBe(onSelect);
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(focusCalls).toEqual(['sidebar']);
    renderer.unmount();
  });

  test('VideoCard formats metadata, proxies thumbnails, and shows progress', async () => {
    const { default: VideoCard } = await importComponent('./VideoCard.tsx');
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

    const img = renderer.container.querySelector('img');
    expect(img.getAttribute('src')).toMatch(
      /\/proxy\/i0\.hdslb\.com\/test\.jpg@672w_420h_1c\.webp$/,
    );
    expect(textOf(renderer.toJSON())).toContain('测试视频');
    expect(textOf(renderer.toJSON())).toContain('UP 主');
    expect(textOf(renderer.toJSON())).toContain('播放');
    expect(renderer.container.querySelector('.video-card-progress')).not.toBeNull();
    expect(renderer.container.querySelector('.video-card-progress-fill')).not.toBeNull();

    const card = renderer.container.querySelector('.video-card');
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(focusCalls).toEqual(['BV1']);
    renderer.unmount();
  });

  test('VideoCard falls back to original url when proxy rewrite throws', async () => {
    globalThis.URL = class BrokenURL {
      constructor() {
        throw new Error('bad proxy');
      }
    };
    const { default: VideoCard } = await importComponent('./VideoCard.tsx');
    const renderer = await render(
      React.createElement(VideoCard, {
        video: {
          bvid: 'BV2',
          cover: 'https://example.com/cover.jpg',
          title: '原图',
        },
        focusId: 'content-0-1',
        row: 0,
        col: 1,
        group: 'content',
      }),
    );

    expect(renderer.container.querySelector('img').getAttribute('src')).toBe(
      'https://example.com/cover.jpg',
    );
    renderer.unmount();
  });

  test('VideoCard supports play count metadata and empty thumbnail state', async () => {
    const { default: VideoCard } = await importComponent('./VideoCard.tsx');
    const renderer = await render(
      React.createElement(VideoCard, {
        video: {
          bvid: 'BV3',
          title: '仅播放数',
          play: 4567,
          duration: '01:23',
        },
        focusId: 'content-1-0',
        row: 1,
        col: 0,
        group: 'content',
      }),
    );

    expect(renderer.container.querySelectorAll('img')).toHaveLength(0);
    expect(textOf(renderer.toJSON())).toContain('仅播放数');
    expect(textOf(renderer.toJSON())).toContain('播放');
    renderer.unmount();
  });

  test('VideoGrid renders empty state and mapped VideoCard props', async () => {
    const { default: VideoGrid } = await importComponent('./VideoGrid.tsx');
    const emptyRenderer = await render(
      React.createElement(VideoGrid, { videos: [] }),
    );
    expect(textOf(emptyRenderer.toJSON())).toContain('暂无内容');
    emptyRenderer.unmount();

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
        onSelect: (video) => selectCalls.push(video.title),
      }),
    );

    const grid = gridRenderer.container.querySelector('.video-grid');
    expect(grid).not.toBeNull();
    expect(grid.style.transform).toBe('');
    const cards = Array.from(
      gridRenderer.container.querySelectorAll('.video-card'),
    );
    expect(cards).toHaveLength(3);
    expect(cards[0].getAttribute('data-focus-id')).toBe('results-4-0');
    expect(cards[1].getAttribute('data-focus-id')).toBe('results-4-1');
    expect(cards[2].getAttribute('data-focus-id')).toBe('results-5-0');
    cards[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selectCalls).toEqual(['三']);
    gridRenderer.unmount();
  });

  test('SubscriptionList renders rows, empty state, and selection wiring', async () => {
    const { default: SubscriptionList } =
      await importComponent('./SubscriptionList.tsx');

    const emptyRenderer = await render(
      React.createElement(SubscriptionList, {
        items: [],
        onSelect: () => {},
      }),
    );
    expect(textOf(emptyRenderer.toJSON())).toContain('暂无订阅内容');
    emptyRenderer.unmount();

    const selected = [];
    const renderer = await render(
      React.createElement(SubscriptionList, {
        items: [
          {
            id: 'season-1-100',
            title: '订阅 1',
            cover: 'https://example.com/one.jpg',
            ownerName: 'UP 主 1',
            total: 12,
            isInvalid: false,
          },
          {
            id: 'season-2-100',
            title: '视频已失效',
            cover: '',
            total: 0,
            isInvalid: true,
          },
        ],
        cols: 4,
        onSelect: (item, index) => selected.push([item.id, index]),
      }),
    );

    const rows = Array.from(
      renderer.container.querySelectorAll('.subscription-card'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-focus-id')).toBe('subscription-0-0');
    expect(rows[1].getAttribute('data-focus-id')).toBe('subscription-0-1');
    expect(rows[1].className).toContain('invalid');
    expect(textOf(renderer.toJSON())).toContain('订阅 1');
    expect(textOf(renderer.toJSON())).toContain('UP主: UP 主 1');
    expect(textOf(renderer.toJSON())).toContain('暂无可用视频');
    expect(textOf(renderer.toJSON())).toContain('合集');
    expect(rows[0].querySelector('img')).not.toBeNull();
    expect(rows[1].querySelector('.subscription-card-thumb-placeholder')).not.toBeNull();

    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toEqual([['season-2-100', 1]]);
    renderer.unmount();
  });
});
