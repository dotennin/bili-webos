import { test, expect, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import VideoCard from './components/VideoCard.jsx';
import VideoGrid from './components/VideoGrid.jsx';
import SidebarItem from './components/SidebarItem.jsx';
import OSKey from './components/OSKey.jsx';
import FocusableTab from './components/FocusableTab.jsx';
import FavoritesPage from './pages/FavoritesPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import DanmakuLayer from './player/DanmakuLayer.jsx';

beforeEach(() => {
  globalThis.window = globalThis.window || {};
  globalThis.document = globalThis.document || {
    querySelector: () => null,
    createElement: () => ({ style: {}, addEventListener: () => {}, remove: () => {} }),
  };
});

test('renders basic UI components', () => {
  const card = renderToStaticMarkup(React.createElement(VideoCard, { video: { bvid: 'BV1', title: 'T', pic: '//i.hdslb.com/a.jpg', owner: { name: 'UP' }, stat: { view: 12 }, duration: 99, progress: 10 }, focusId: 'content-0-0', row: 0, col: 0 }));
  expect(card).toContain('video-card');
  const grid = renderToStaticMarkup(React.createElement(VideoGrid, { videos: [{ bvid: 'BV1', title: 'x' }], onSelect: () => {} }));
  expect(grid).toContain('video-card');
  expect(renderToStaticMarkup(React.createElement(SidebarItem, { id: 'sidebar-0-0', row: 0, label: '推荐', icon: '🏠' }))).toContain('sidebar-item');
  expect(renderToStaticMarkup(React.createElement(OSKey, { id: 'osk-0-0', row: 0, col: 0, label: 'A' }))).toContain('osk-key');
  expect(renderToStaticMarkup(React.createElement(FocusableTab, { id: 'tab-0-0', row: 0, col: 0, label: '热播', active: true }))).toContain('tab active');
});

test('renders pages in fallback states', () => {
  expect(renderToStaticMarkup(React.createElement(FavoritesPage, { userMid: '', onPlayVideo: () => {} }))).toContain('请先登录');
  expect(renderToStaticMarkup(React.createElement(HistoryPage, { onPlayVideo: () => {} }))).toContain('加载中');
  expect(renderToStaticMarkup(React.createElement(SettingsPage, { onLogout: () => {}, user: null, onPlayVideo: () => {} }))).toContain('我的');
  expect(renderToStaticMarkup(React.createElement(LoginPage, { onLogin: () => {} }))).toContain('哔哩哔哩');
  expect(renderToStaticMarkup(React.createElement(SearchPage, { onPlayVideo: () => {} }))).toContain('搜索');
});

test('danmaku layer returns null when disabled and container when enabled', () => {
  expect(renderToStaticMarkup(React.createElement(DanmakuLayer, { danmakus: [], currentTime: 0, enabled: false }))).toBe('');
  const html = renderToStaticMarkup(React.createElement(DanmakuLayer, { danmakus: [], currentTime: 0, enabled: true }));
  expect(html).toContain('danmaku-container');
});
