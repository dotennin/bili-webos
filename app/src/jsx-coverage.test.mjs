import { test, expect, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from './App.jsx';
import SidebarItem from './components/SidebarItem.jsx';

const h = React.createElement;

test('render App and SidebarItem via static markup', () => {
  expect(renderToStaticMarkup(h(SidebarItem, { id: 'sidebar-0-0', row: 0, label: '推荐', icon: '🏠', active: true, onSelect: () => {} }))).toContain('sidebar-item');
  expect(renderToStaticMarkup(h(App))).toContain('app-container');
  expect(mock(() => {})()).toBeUndefined();
});
