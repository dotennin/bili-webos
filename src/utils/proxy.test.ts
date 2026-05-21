import { test, expect } from 'bun:test';
import {
  getProxyBase,
  buildProxyUrl,
  buildStaticAssetUrl,
  isWebOsRuntime,
  shouldProxyStaticAsset,
  LOCAL_PROXY_BASE,
} from './proxy.ts';

test('getProxyBase uses current origin in localhost dev', () => {
  expect(
    getProxyBase({
      env: { DEV: true },
      location: { origin: 'http://localhost:5173', hostname: 'localhost' },
    }),
  ).toBe('http://localhost:5173');
});

test('getProxyBase keeps TV local proxy outside localhost dev', () => {
  expect(
    getProxyBase({
      env: { DEV: false },
      location: { origin: 'http://192.168.1.2:8080', hostname: '192.168.1.2' },
    }),
  ).toBe(LOCAL_PROXY_BASE);
});

test('buildProxyUrl rewrites through the active proxy base', () => {
  const rewritten = buildProxyUrl(
    'https://i0.hdslb.com/bfs/archive/a.png?x=1',
    {
      env: { DEV: true },
      location: { origin: 'http://localhost:5173', hostname: 'localhost' },
    },
  );
  expect(rewritten).toBe(
    'http://localhost:5173/proxy/i0.hdslb.com/bfs/archive/a.png?x=1',
  );
});

test('shouldProxyStaticAsset only proxies browser-local dev assets', () => {
  expect(
    shouldProxyStaticAsset({
      env: { DEV: true },
      location: { origin: 'http://localhost:5173', hostname: 'localhost' },
    }),
  ).toBe(true);

  expect(
    shouldProxyStaticAsset({
      env: { DEV: true },
      location: { origin: 'http://192.168.1.2:8080', hostname: '192.168.1.2' },
      window: { webOS: {} },
    }),
  ).toBe(false);
});

test('isWebOsRuntime detects webOS runtime markers', () => {
  expect(isWebOsRuntime({ window: { webOS: {} } })).toBe(true);
  expect(
    isWebOsRuntime({
      document: {
        querySelector(selector) {
          return selector === 'script[data-webos-runtime]' ? {} : null;
        },
      },
    }),
  ).toBe(true);
  expect(isWebOsRuntime({})).toBe(false);
});

test('buildStaticAssetUrl bypasses proxy on webOS runtime and keeps proxy in local browser dev', () => {
  expect(
    buildStaticAssetUrl('https://archive.biliimg.com/bfs/archive/a.jpg', {
      env: { DEV: true },
      location: { origin: 'http://localhost:5173', hostname: 'localhost' },
    }),
  ).toBe('http://localhost:5173/proxy/archive.biliimg.com/bfs/archive/a.jpg');

  expect(
    buildStaticAssetUrl('https://archive.biliimg.com/bfs/archive/a.jpg', {
      env: { DEV: true },
      location: { origin: 'http://192.168.1.2:8080', hostname: '192.168.1.2' },
      window: { webOS: {} },
    }),
  ).toBe('https://archive.biliimg.com/bfs/archive/a.jpg');
});
