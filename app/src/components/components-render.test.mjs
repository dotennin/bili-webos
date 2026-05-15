import { describe, it, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import OSKey from './OSKey';
import FocusableTab from './FocusableTab';
import SidebarItem from './SidebarItem';
import VideoCard from './VideoCard';
import VideoGrid from './VideoGrid';

describe('basic component rendering', () => {
  it('renders OSKey/FocusableTab/SidebarItem classes and labels', () => {
    const keyHtml = renderToStaticMarkup(React.createElement(OSKey, { id: 'k', row: 0, col: 0, group: 'g', label: '搜索', isAction: true, onPress: () => {} }));
    expect(keyHtml).toContain('osk-key wide');
    expect(keyHtml).toContain('搜索');

    const tabHtml = renderToStaticMarkup(React.createElement(FocusableTab, { id: 't', row: 0, col: 0, group: 'g', label: '推荐', active: true, onSelect: () => {} }));
    expect(tabHtml).toContain('tab active');

    const sideHtml = renderToStaticMarkup(React.createElement(SidebarItem, { id: 's', row: 0, label: '热门', icon: '🔥', active: false, onSelect: () => {} }));
    expect(sideHtml).toContain('热门');
  });

  it('renders VideoCard metadata', () => {
    const html = renderToStaticMarkup(React.createElement(VideoCard, {
      video: { pic: '//i0.hdslb.com/test.jpg', title: '视频A', duration: 90, progress: 45, owner: { name: 'UP' }, stat: { view: 12000 }, play: 300, pubdate: Math.floor(Date.now() / 1000) },
      focusId: 'content-0-0', row: 0, col: 0, group: 'content', onSelect: () => {}
    }));
    expect(html).toContain('video-card-title');
    expect(html).toContain('UP');
    expect(html).toContain('播放');
  });

  it('renders VideoGrid empty and non-empty states', () => {
    const empty = renderToStaticMarkup(React.createElement(VideoGrid, { videos: [] }));
    expect(empty).toContain('暂无内容');

    const filled = renderToStaticMarkup(React.createElement(VideoGrid, {
      videos: [{ bvid: 'BV1', title: 'one' }, { bv_id: 'BV2', title: 'two' }],
      cols: 1, startRow: 2, group: 'content', focusRow: 3, onSelect: () => {}
    }));
    expect(filled).toContain('translateY(-1260px)');
    expect(filled).toContain('content-2-0');
    expect(filled).toContain('content-3-0');
  });
});
