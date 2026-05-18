import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import https from 'node:https';
import WebOSService from '../src/webos-service-stub.ts';
import * as serviceModule from '../src/service.ts';

function respondOnce(invoker) {
  return new Promise((resolve) => {
    invoker({
      payload: {},
      isSubscription: false,
      respond(value) {
        resolve(value);
      },
    });
  });
}

function createProxyRes(statusCode, headers, chunks) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.headers = headers;
  res.pipe = mock((target) => {
    target.piped = true;
  });
  queueMicrotask(() => {
    for (const chunk of chunks || []) res.emit('data', Buffer.from(chunk));
    res.emit('end');
  });
  return res;
}

let originalHttpsRequest;
let originalWriteFileSync;
let originalExecFile;

beforeEach(() => {
  WebOSService.__instances.length = 0;
  originalHttpsRequest = https.request;
  originalWriteFileSync = fs.writeFileSync;
  originalExecFile = childProcess.execFile;
});

afterEach(() => {
  https.request = originalHttpsRequest;
  fs.writeFileSync = originalWriteFileSync;
  childProcess.execFile = originalExecFile;
});

test('service runtime registers handlers and supports fetch/cast/config flows', async () => {
  const handlers = serviceModule.service.handlers;
  expect(Object.keys(handlers)).toEqual(
    expect.arrayContaining(['fetch', 'getCookies', 'setCookies', 'clearCookies', 'ping']),
  );

  let requestPlan = [];
  https.request = function (options, cb) {
    const req = new EventEmitter();
    req.write = mock(() => {});
    req.end = mock(() => {
      const next = requestPlan.shift();
      if (!next) throw new Error('missing request plan');
      next(options, cb, req);
    });
    return req;
  };
  fs.writeFileSync = mock(() => {});

  requestPlan.push((_options, cb) => {
    cb(createProxyRes(200, { 'content-type': 'application/json' }, ['{"ok":1}']));
  });
  const jsonFetch = await new Promise((resolve) =>
    handlers.fetch({ payload: { url: 'https://api.bilibili.com/x' }, respond: resolve }),
  );
  expect(jsonFetch.returnValue).toBe(true);

  const ping = await respondOnce(handlers.ping);
  expect(ping.returnValue).toBe(true);
});

test('service handlers cover fetch errors, cookie mutations, and cast reporting flows', async () => {
  const handlers = serviceModule.service.handlers;
  fs.writeFileSync = mock(() => {});

  const noUrl = await new Promise((resolve) =>
    handlers.fetch({ payload: {}, respond: resolve }),
  );
  expect(noUrl).toEqual({ returnValue: false, error: 'No URL' });

  const invalidUrl = await new Promise((resolve) =>
    handlers.fetch({ payload: { url: 'not-a-url' }, respond: resolve }),
  );
  expect(invalidUrl).toEqual({ returnValue: false, error: 'Invalid URL' });

  const hostDenied = await new Promise((resolve) =>
    handlers.fetch({ payload: { url: 'https://example.com/x' }, respond: resolve }),
  );
  expect(hostDenied).toEqual({ returnValue: false, error: 'Host not allowed' });

  https.request = function (_options, cb) {
    const req = new EventEmitter();
    req.write = mock(() => {});
    req.end = mock(() => {
      cb(
        createProxyRes(
          206,
          { 'content-type': 'video/mp2t' },
          [Buffer.from([1, 2, 3, 4]).toString('binary')],
        ),
      );
    });
    return req;
  };

  const binaryFetch = await new Promise((resolve) =>
    handlers.fetch({
      payload: { url: 'https://api.bilibili.com/video', method: 'GET' },
      respond: resolve,
    }),
  );
  expect(binaryFetch.returnValue).toBe(true);
  expect(binaryFetch.bodyBase64).toBe(Buffer.from([1, 2, 3, 4]).toString('base64'));

  const setCookies = await new Promise((resolve) =>
    handlers.setCookies({ payload: { cookies: { SESSDATA: 'abc' } }, respond: resolve }),
  );
  expect(setCookies).toEqual({ returnValue: true });
  expect(serviceModule.__testing.getStoredCookies()).toMatchObject({
    SESSDATA: 'abc',
  });

  const getCookies = await new Promise((resolve) =>
    handlers.getCookies({ payload: {}, respond: resolve }),
  );
  expect(getCookies).toEqual({
    returnValue: true,
    cookies: { SESSDATA: 'abc' },
  });

  const clearCookies = await new Promise((resolve) =>
    handlers.clearCookies({ payload: {}, respond: resolve }),
  );
  expect(clearCookies).toEqual({ returnValue: true });
  expect(serviceModule.__testing.getStoredCookies()).toEqual({});

  const badSubscribe = await new Promise((resolve) =>
    handlers.castSubscribe({
      payload: {},
      isSubscription: false,
      respond: resolve,
    }),
  );
  expect(badSubscribe).toEqual({
    returnValue: false,
    error: 'Subscription required',
  });

  const responses = [];
  const subscriptionMessage = {
    payload: {},
    isSubscription: true,
    respond(value) {
      responses.push(value);
    },
  };
  handlers.castSubscribe(subscriptionMessage);
  expect(responses.at(-1)).toMatchObject({
    returnValue: true,
    subscribed: true,
    event: { kind: 'ready' },
  });

  const ackResult = await new Promise((resolve) =>
    handlers.castAck({ payload: { accepted: true }, respond: resolve }),
  );
  expect(ackResult).toEqual({ returnValue: true });

  const stateResult = await new Promise((resolve) =>
    handlers.castReportState({
      payload: { playState: 'playing' },
      respond: resolve,
    }),
  );
  expect(stateResult).toEqual({ returnValue: true });
  expect(responses.at(-1)).toMatchObject({
    event: { kind: 'state', payload: { playState: 'playing' } },
  });

  const progressResult = await new Promise((resolve) =>
    handlers.castReportProgress({
      payload: { position: 12, duration: 34 },
      respond: resolve,
    }),
  );
  expect(progressResult).toEqual({ returnValue: true });
  expect(responses.at(-1)).toMatchObject({
    event: { kind: 'progress', payload: { position: 12, duration: 34 } },
  });

  const statusResult = await new Promise((resolve) =>
    handlers.castGetStatus({ payload: {}, respond: resolve }),
  );
  expect(statusResult.returnValue).toBe(true);
  expect(statusResult.status.playState).toBe('playing');

  const configResult = await new Promise((resolve) =>
    handlers.castSetConfig({
      payload: { friendlyName: 'B站 webOS' },
      respond: resolve,
    }),
  );
  expect(configResult).toEqual({
    returnValue: true,
    config: expect.objectContaining({ friendlyName: '我的小电视' }),
  });
});

test('createLocalProxyHandler rejects forbidden hosts and rewrites HLS playlists', async () => {
  const handler = serviceModule.createLocalProxyHandler({
    localProxyPort: 7654,
    isAllowedHost: serviceModule.isAllowedHost,
    rewriteHlsPlaylist: serviceModule.rewriteHlsPlaylist,
    decompressResponse(_res, cb) {
      cb(Buffer.from('#EXTM3U\nsegment.ts\n'));
    },
    makeRequest(_parsedUrl, _method, _body, _contentType, _range, cb) {
      cb(
        null,
        createProxyRes(
          200,
          { 'content-type': 'application/vnd.apple.mpegurl' },
          [],
        ),
      );
    },
  });

  const forbiddenReq = new EventEmitter();
  forbiddenReq.url = '/proxy/example.com/live/test.m3u8';
  forbiddenReq.method = 'GET';
  forbiddenReq.headers = {};
  const forbiddenRes = {
    statusCode: 0,
    body: '',
    setHeader: mock(() => {}),
    writeHead(code) {
      this.statusCode = code;
    },
    end(chunk = '') {
      this.body += String(chunk);
    },
  };

  handler(forbiddenReq, forbiddenRes);
  expect(forbiddenRes.statusCode).toBe(403);
  expect(forbiddenRes.body).toBe('Forbidden');

  const allowedReq = new EventEmitter();
  allowedReq.url = '/proxy/api.live.bilibili.com/live/test.m3u8';
  allowedReq.method = 'GET';
  allowedReq.headers = {};
  const allowedRes = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key] = value;
    },
    writeHead(code) {
      this.statusCode = code;
    },
    end(chunk = '') {
      this.body += String(chunk);
    },
  };

  handler(allowedReq, allowedRes);
  await new Promise((resolve) => queueMicrotask(resolve));
  expect(allowedRes.statusCode).toBe(200);
  expect(allowedRes.body).toContain('/proxy/api.live.bilibili.com/');
});

test('createLocalProxyHandler covers passthrough and error branches plus testing getters', async () => {
  const passthroughHandler = serviceModule.createLocalProxyHandler({
    localProxyPort: 7654,
    isAllowedHost: serviceModule.isAllowedHost,
    rewriteHlsPlaylist() {
      throw new Error('should not rewrite');
    },
    decompressResponse(_res, cb) {
      cb(Buffer.from('ignored'));
    },
    makeRequest(_parsedUrl, _method, _body, _contentType, _range, cb) {
      cb(
        null,
        createProxyRes(206, { 'content-type': 'video/mp2t', etag: 'abc' }, []),
      );
    },
  });

  const passthroughReq = new EventEmitter();
  passthroughReq.url = '/proxy/api.live.bilibili.com/live/seg.ts';
  passthroughReq.method = 'GET';
  passthroughReq.headers = {};
  const passthroughRes = {
    piped: false,
    statusCode: 0,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    writeHead(code) {
      this.statusCode = code;
    },
    end: mock(() => {}),
  };
  passthroughHandler(passthroughReq, passthroughRes);
  await new Promise((resolve) => queueMicrotask(resolve));
  expect(passthroughRes.statusCode).toBe(206);
  expect(passthroughRes.piped).toBe(true);
  expect(passthroughRes.headers.etag).toBe('abc');

  const badUrlHandler = serviceModule.createLocalProxyHandler({
    localProxyPort: 7654,
    isAllowedHost() {
      return true;
    },
    rewriteHlsPlaylist: serviceModule.rewriteHlsPlaylist,
    decompressResponse(_res, cb) {
      cb(Buffer.from('ignored'));
    },
    makeRequest() {},
  });
  const badUrlReq = new EventEmitter();
  badUrlReq.url = '%%%';
  badUrlReq.method = 'GET';
  badUrlReq.headers = {};
  const badUrlRes = {
    statusCode: 0,
    body: '',
    setHeader: mock(() => {}),
    writeHead(code) {
      this.statusCode = code;
    },
    end(chunk = '') {
      this.body += String(chunk);
    },
  };
  badUrlHandler(badUrlReq, badUrlRes);
  expect(badUrlRes.statusCode).toBe(404);

  const requestErrorHandler = serviceModule.createLocalProxyHandler({
    localProxyPort: 7654,
    isAllowedHost: serviceModule.isAllowedHost,
    rewriteHlsPlaylist: serviceModule.rewriteHlsPlaylist,
    decompressResponse(_res, cb) {
      cb(Buffer.from('ignored'));
    },
    makeRequest(_parsedUrl, _method, _body, _contentType, _range, cb) {
      cb(new Error('upstream broke'));
    },
  });
  const requestErrorReq = new EventEmitter();
  requestErrorReq.url = '/proxy/api.live.bilibili.com/live/test.m3u8';
  requestErrorReq.method = 'GET';
  requestErrorReq.headers = {};
  const requestErrorRes = {
    statusCode: 0,
    body: '',
    setHeader: mock(() => {}),
    writeHead(code) {
      this.statusCode = code;
    },
    end(chunk = '') {
      this.body += String(chunk);
    },
  };
  requestErrorHandler(requestErrorReq, requestErrorRes);
  expect(requestErrorRes.statusCode).toBe(502);
  expect(requestErrorRes.body).toBe('Bad Gateway');

  const rewriteErrorHandler = serviceModule.createLocalProxyHandler({
    localProxyPort: 7654,
    isAllowedHost: serviceModule.isAllowedHost,
    rewriteHlsPlaylist() {
      throw new Error('rewrite failed');
    },
    decompressResponse(_res, cb) {
      cb(Buffer.from('#EXTM3U\nsegment.ts\n'));
    },
    makeRequest(_parsedUrl, _method, _body, _contentType, _range, cb) {
      cb(
        null,
        createProxyRes(
          200,
          { 'content-type': 'application/vnd.apple.mpegurl' },
          [],
        ),
      );
    },
  });
  const rewriteErrorReq = new EventEmitter();
  rewriteErrorReq.url = '/proxy/api.live.bilibili.com/live/test.m3u8';
  rewriteErrorReq.method = 'GET';
  rewriteErrorReq.headers = {};
  const rewriteErrorRes = {
    statusCode: 0,
    body: '',
    setHeader: mock(() => {}),
    writeHead(code) {
      this.statusCode = code;
    },
    end(chunk = '') {
      this.body += String(chunk);
    },
  };
  rewriteErrorHandler(rewriteErrorReq, rewriteErrorRes);
  await new Promise((resolve) => queueMicrotask(resolve));
  expect(rewriteErrorRes.statusCode).toBe(500);
  expect(rewriteErrorRes.body).toBe('Playlist rewrite failed');

  expect(serviceModule.__testing.getLocalProxyPort()).toBe(7654);
  expect(serviceModule.__testing.getCastServer()).toBeTruthy();
  expect(serviceModule.__testing.getLocalProxy()).toBeTruthy();
  expect(serviceModule.__testing.getCastConfig()).toBeTruthy();
});
