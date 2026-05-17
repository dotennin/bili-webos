import { expect, test } from 'bun:test';
import {
  extractProxyTarget,
  isAllowedHost,
  isHlsPlaylistResponse,
  toCookieBridge,
} from './biliProxy.js';

test('extractProxyTarget parses host and upstream path from /proxy requests', () => {
  expect(extractProxyTarget('/proxy/api.bilibili.com/x/web-interface/nav?pn=1')).toEqual({
    host: 'api.bilibili.com',
    hostname: 'api.bilibili.com',
    port: 443,
    upstreamPath: '/x/web-interface/nav?pn=1',
  });
});

test('isAllowedHost accepts bilivideo and hdslb domains but rejects others', () => {
  expect(isAllowedHost('i0.hdslb.com')).toBe(true);
  expect(isAllowedHost('upos-sz-static.bilivideo.com')).toBe(true);
  expect(isAllowedHost('example.com')).toBe(false);
});

test('toCookieBridge serializes Set-Cookie headers into the existing JSON bridge', () => {
  expect(toCookieBridge([
    'SESSDATA=abc; Path=/; HttpOnly',
    'DedeUserID=100; Path=/',
  ])).toBe('{"SESSDATA":"abc","DedeUserID":"100"}');
});

test('isHlsPlaylistResponse matches both content type and .m3u8 paths', () => {
  expect(isHlsPlaylistResponse('application/vnd.apple.mpegurl', '/live/index.m3u8')).toBe(true);
  expect(isHlsPlaylistResponse('text/plain', '/live/index.m3u8')).toBe(true);
  expect(isHlsPlaylistResponse('video/mp2t', '/live/segment.ts')).toBe(false);
});
