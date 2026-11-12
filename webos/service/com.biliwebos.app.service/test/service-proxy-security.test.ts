import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
let serviceModule: typeof import('../src/service.ts');

beforeAll(async () => {
  const envKey = 'BILI_SERVICE_DISABLE_NETWORK_SERVERS';
  const previousValue = process.env[envKey];
  const existsSync = fs.existsSync;
  const exists = spyOn(fs, 'existsSync').mockImplementation(
    (file) => !String(file).startsWith('/media/internal/') && existsSync(file),
  );
  const write = spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  process.env[envKey] = '1';
  try {
    serviceModule = await import('../src/service.ts');
  } finally {
    exists.mockRestore();
    write.mockRestore();
    if (previousValue === undefined) delete process.env[envKey];
    else process.env[envKey] = previousValue;
  }
});

function invoke(method, payload = {}) {
  return new Promise((resolve) => {
    serviceModule.service.handlers[method]({ payload, respond: resolve });
  });
}

let writeFile;
let upstreamRequest;

beforeEach(async () => {
  writeFile = spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  await invoke('clearCookies');
  writeFile.mockClear();
});

afterEach(async () => {
  await invoke('clearCookies');
  upstreamRequest?.mockRestore();
  upstreamRequest = undefined;
  writeFile.mockRestore();
});

function stubUpstream(statusCode, headers, body) {
  upstreamRequest = spyOn(https, 'request').mockImplementation(
    (_options, callback) =>
      Object.assign(new EventEmitter(), {
        end() {
          const response = Object.assign(new EventEmitter(), {
            statusCode,
            headers,
            pipe(target) {
              target.end(body);
            },
          });
          callback(response);
          queueMicrotask(() => {
            response.emit('data', Buffer.from(body));
            response.emit('end');
          });
        },
      }),
  );
}

test('Luna QR login persists a session for authenticated API and live requests over verified TLS', async () => {
  stubUpstream(
    200,
    {
      'content-type': 'application/json',
      'set-cookie': ['SESSDATA=stub-session=; Domain=.bilibili.com; Secure'],
    },
    '{"code":0}',
  );

  const login = await invoke('fetch', {
    url: 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll',
  });
  expect(login).toMatchObject({
    returnValue: true,
    body: '{"code":0}',
    newCookies: { SESSDATA: 'stub-session=' },
  });
  expect(writeFile.mock.calls[0]?.[1]).toBe('{"SESSDATA":"stub-session="}');

  for (const url of [
    'https://api.bilibili.com/x/web-interface/nav',
    'https://api.live.bilibili.com/xlive/web-ucenter/v1/xfetter/GetWebList',
  ]) {
    expect(await invoke('fetch', { url })).toMatchObject({ returnValue: true });
  }
  const [loginRequest, apiRequest, liveRequest] =
    upstreamRequest.mock.calls.map(([options]) => options);
  expect(loginRequest.headers.Cookie).toBeUndefined();
  expect(apiRequest.headers.Cookie).toBe('SESSDATA=stub-session=');
  expect(liveRequest.headers.Cookie).toBe('SESSDATA=stub-session=');
  for (const options of [loginRequest, apiRequest, liveRequest]) {
    expect(options.rejectUnauthorized).toBe(true);
  }
});

test('Luna fetch limits cookies to the expected API origins', async () => {
  await invoke('setCookies', { cookies: { SESSDATA: 'stub-session' } });
  writeFile.mockClear();
  stubUpstream(
    200,
    {
      'content-type': 'application/octet-stream',
      'set-cookie': ['SESSDATA=stub-upstream; Secure'],
      'set-cookie2': ['legacy=stub-upstream'],
    },
    'data',
  );

  for (const url of [
    'https://i0.hdslb.com/image.jpg',
    'https://comment.bilibili.com/1.xml',
    'https://api.bilibili.com:8443/x',
  ]) {
    const response = await invoke('fetch', { url });
    expect(response).toMatchObject({
      returnValue: true,
      bodyBase64: 'ZGF0YQ==',
    });
    expect(response).not.toHaveProperty('newCookies');
    expect(response.headers).not.toHaveProperty('set-cookie');
    expect(response.headers).not.toHaveProperty('set-cookie2');
  }
  for (const [options] of upstreamRequest.mock.calls) {
    expect(options.headers.Cookie).toBeUndefined();
  }
  expect(writeFile).not.toHaveBeenCalled();
  expect((await invoke('getCookies')).cookies).toEqual({
    SESSDATA: 'stub-session',
  });
});

test('loopback media proxy streams a byte range without upstream cookies', async () => {
  await invoke('setCookies', { cookies: { SESSDATA: 'stub-session' } });
  writeFile.mockClear();
  stubUpstream(
    206,
    {
      'content-type': 'video/mp2t',
      'content-range': 'bytes 0-3/8',
      'set-cookie': ['SESSDATA=stub-upstream; Secure'],
      'set-cookie2': ['legacy=stub-upstream'],
    },
    'data',
  );

  const requestHandler = serviceModule.__testing
    .getLocalProxy()
    .listeners('request')[0];
  const responseHeaders = {};
  const response = Object.assign(new EventEmitter(), {
    setHeader(name, value) {
      responseHeaders[name] = value;
    },
    writeHead: mock(() => {}),
    end: mock(() => {}),
  });
  requestHandler(
    {
      url: '/proxy/api.live.bilibili.com/live/segment.ts',
      method: 'GET',
      headers: { range: 'bytes=0-3', cookie: 'local=stub-browser' },
    },
    response,
  );

  const [[options]] = upstreamRequest.mock.calls;
  expect(options.rejectUnauthorized).toBe(true);
  expect(options.headers.Range).toBe('bytes=0-3');
  expect(options.headers.Cookie).toBeUndefined();
  expect(response.writeHead).toHaveBeenCalledWith(206);
  expect(response.end).toHaveBeenCalledWith('data');
  expect(responseHeaders).toEqual({
    'content-type': 'video/mp2t',
    'content-range': 'bytes 0-3/8',
  });
  expect(writeFile).not.toHaveBeenCalled();
  expect((await invoke('getCookies')).cookies).toEqual({
    SESSDATA: 'stub-session',
  });
});

test('startup binds media to loopback and starts separate LAN casting listeners', () => {
  const serviceUrl = new URL('../src/service.ts', import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      '--eval',
      `
        import assert from 'node:assert/strict';
        import dgram from 'node:dgram';
        import { EventEmitter } from 'node:events';
        import fs from 'node:fs';
        import http from 'node:http';
        import net from 'node:net';

        const bindings = [];
        const existsSync = fs.existsSync;
        fs.existsSync = (file) =>
          !String(file).startsWith('/media/internal/') && existsSync(file);
        fs.writeFileSync = () => {};
        http.Server.prototype.listen = (port, host) => bindings.push(['media', port, host]);
        net.Server.prototype.listen = (port, host) => bindings.push(['cast', port, host]);
        dgram.createSocket = () => Object.assign(new EventEmitter(), {
          bind(port, callback) {
            bindings.push(['ssdp', port]);
            callback();
          },
          addMembership(group) { bindings.push(['multicast', group]); },
          setBroadcast() {},
          setMulticastTTL() {},
        });

        await import(${JSON.stringify(serviceUrl)});
        assert.deepEqual(bindings, [
          ['ssdp', 1900],
          ['multicast', '239.255.255.250'],
          ['cast', 9958, '0.0.0.0'],
          ['media', 7654, '127.0.0.1'],
        ]);
      `,
    ],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, BILI_SERVICE_DISABLE_NETWORK_SERVERS: '0' },
      encoding: 'utf8',
      timeout: 5000,
    },
  );

  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});
