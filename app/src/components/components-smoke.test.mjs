import { test, expect, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

mock.module('../hooks/useFocus', () => ({
  useFocusable: ({ id, onSelect }) => ({ props: { 'data-focus-id': id, onClick: onSelect } }),
}));

import VideoCard from './VideoCard.jsx';
import VideoGrid from './VideoGrid.jsx';
import SidebarItem from './SidebarItem.jsx';
import OSKey from './OSKey.jsx';
import FocusableTab from './FocusableTab.jsx';

test('VideoCard renders metadata and progress bar', () => {
  const html = renderToStaticMarkup(React.createElement(VideoCard, {
    video: { title: 'T', pic: '//i.hdslb.com/a.jpg', duration: 70, progress: 20, owner: { name: 'u' }, stat: { view: 12000 } },
    focusId: 'content-1-1', row: 1, col: 1, group: 'content',
  }));
  expect(html).toContain('video-card');
  expect(html).toContain('data-focus-id="content-1-1"');
  expect(html).toContain('u');
});

test('VideoGrid empty and list branches', () => {
  expect(renderToStaticMarkup(React.createElement(VideoGrid, { videos: [] }))).toContain('暂无内容');
  const html = renderToStaticMarkup(React.createElement(VideoGrid, {
    videos: [{ bvid: 'BV1', title: 'x' }, { bvid: 'BV2', title: 'y' }], cols: 2, focusRow: 1,
  }));
  expect(html).toContain('translateY(-420px)');
});

test('SidebarItem/OSKey/FocusableTab render active classes', () => {
  expect(renderToStaticMarkup(React.createElement(SidebarItem, { id: 's-0', row: 0, label: '推荐', icon: '🏠', active: true }))).toContain('sidebar-item active');
  expect(renderToStaticMarkup(React.createElement(OSKey, { id: 'k', row: 0, col: 0, group: 'osk', label: '确认', isAction: true }))).toContain('osk-key wide');
  expect(renderToStaticMarkup(React.createElement(FocusableTab, { id: 't', row: 0, col: 0, group: 'g', label: 'Tab', active: true }))).toContain('tab active');
});
