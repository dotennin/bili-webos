import { test, expect, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

mock.module('../hooks/useFocus', () => ({
  useFocusable: ({ id }) => ({ props: { 'data-focus-id': id } }),
}));

import VideoCard from './VideoCard';
import VideoGrid from './VideoGrid';
import SidebarItem from './SidebarItem';
import FocusableTab from './FocusableTab';
import OSKey from './OSKey';

test('VideoCard renders metadata and progress bar', () => {
  const html = renderToStaticMarkup(
    React.createElement(VideoCard, {
      focusId: 'c-0-0', row: 0, col: 0, group: 'content',
      video: { title: '标题', pic: '//i0.hdslb.com/x.jpg', duration: 61, progress: 30, owner: { name: 'UP' }, stat: { view: 1234 }, pubdate: 1700000000 },
    }),
  );
  expect(html).toContain('video-card');
  expect(html).toContain('UP');
  expect(html).toContain('播放');
  expect(html).toContain('data-focus-id="c-0-0"');
});

test('VideoGrid renders empty and list modes', () => {
  const empty = renderToStaticMarkup(React.createElement(VideoGrid, { videos: [] }));
  expect(empty).toContain('暂无内容');

  const list = renderToStaticMarkup(React.createElement(VideoGrid, {
    videos: [{ bvid: 'BV1', title: 'A' }, { bvid: 'BV2', title: 'B' }],
    cols: 2,
    focusRow: 1,
    startRow: 3,
    group: 'g',
  }));
  expect(list).toContain('translateY(-420px)');
  expect(list).toContain('data-focus-id="g-3-0"');
});

test('SidebarItem/FocusableTab/OSKey render active/action classes', () => {
  const side = renderToStaticMarkup(React.createElement(SidebarItem, { id: 's-0-0', row: 0, label: '推荐', icon: '🏠', active: true }));
  expect(side).toContain('sidebar-item active');

  const tab = renderToStaticMarkup(React.createElement(FocusableTab, { id: 't', row: 0, col: 0, group: 'x', label: '页签', active: true }));
  expect(tab).toContain('tab active');

  const key = renderToStaticMarkup(React.createElement(OSKey, { id: 'k', row: 0, col: 0, group: 'x', label: '确认', isAction: true }));
  expect(key).toContain('osk-key wide');
});
