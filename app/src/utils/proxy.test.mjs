import { test, expect } from 'bun:test';
import { getProxyBase, buildProxyUrl, LOCAL_PROXY_BASE, shouldUseExternalProxy } from './proxy.js';

test('shouldUseExternalProxy only depends on VITE_USE_PROXY', () => {
  expect(shouldUseExternalProxy({ VITE_USE_PROXY: 'true' })).toBe(true);
  expect(shouldUseExternalProxy({ VITE_USE_PROXY: 'false' })).toBe(false);
  expect(shouldUseExternalProxy({})).toBe(false);
});

test('getProxyBase returns local proxy when VITE_USE_PROXY not true', () => {
  expect(getProxyBase({ env: { VITE_USE_PROXY: 'false' }, proxyUrl: 'http://localhost:9527' })).toBe(LOCAL_PROXY_BASE);
});

test('getProxyBase returns external proxy when VITE_USE_PROXY is true', () => {
  expect(getProxyBase({ env: { VITE_USE_PROXY: 'true' }, proxyUrl: 'http://localhost:9527' })).toBe('http://localhost:9527');
});

test('buildProxyUrl rewrites target url through selected proxy', () => {
  const rewritten = buildProxyUrl('https://i0.hdslb.com/bfs/archive/a.png?x=1', {
    env: { VITE_USE_PROXY: 'true' },
    proxyUrl: 'http://localhost:9527',
  });
  expect(rewritten).toBe('http://localhost:9527/proxy/i0.hdslb.com/bfs/archive/a.png?x=1');
});
