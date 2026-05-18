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
