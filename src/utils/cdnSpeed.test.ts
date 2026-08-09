import { expect, test } from 'bun:test';
import {
  CDN_OPTIONS,
  CDN_PICKER_OPTIONS,
  NO_CDN_OPTION,
} from './cdn.ts';
import {
  createCdnSpeedScanner,
  getCdnSpeedTestSample,
  measureCdnSpeed,
} from './cdnSpeed.ts';

function createResponse(chunks, status = 200) {
  let index = 0;
  return {
    ok: status >= 200 && status < 400,
    status,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true };
            return { done: false, value: new Uint8Array(chunks[index++]) };
          },
          async cancel() {},
        };
      },
    },
  };
}

test('gets the fixed PiliPlus speed-test sample from DASH video data', async () => {
  const calls = [];
  const controller = new AbortController();
  const sample = await getCdnSpeedTestSample(async (...args) => {
    calls.push(args);
    return {
      data: {
        dash: {
          video: [{ base_url: 'https://upos-sz-mirrorali.bilivideo.com/a.m4s' }],
        },
      },
    };
  }, controller.signal);

  expect(sample).toBe('https://upos-sz-mirrorali.bilivideo.com/a.m4s');
  expect(calls).toEqual([
    ['BV1fK4y1t7hj', 196018899, 80, { signal: controller.signal }],
  ]);
});

test('measures streamed bytes through the proxy and sends a bounded range', async () => {
  const requests = [];
  let clock = 0;
  const result = await measureCdnSpeed('https://cdn.test/video.m4s', {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createResponse([1024, 1024, 1024]);
    },
    buildUrl: (url) => `proxy:${url}`,
    now: () => {
      clock += 500;
      return clock;
    },
    maxBytes: 2048,
  });

  expect(result.status).toBe('success');
  expect(result.speed).toContain('MB/s');
  expect(requests[0]).toMatchObject({
    url: 'proxy:https://cdn.test/video.m4s',
    options: { headers: { Range: 'bytes=0-2047' } },
  });
});

test('uses bytes received before timeout to report partial throughput', async () => {
  const result = await measureCdnSpeed('https://cdn.test/video.m4s', {
    fetchImpl: async (_url, options) => ({
      ok: true,
      status: 200,
      body: {
        getReader() {
          let first = true;
          return {
            async read() {
              if (first) {
                first = false;
                return { done: false, value: new Uint8Array(1024) };
              }
              return new Promise((_resolve, reject) => {
                options.signal.addEventListener('abort', () =>
                  reject(new Error('timeout')),
                );
              });
            },
          };
        },
      },
    }),
    buildUrl: (url) => url,
    timeoutMs: 1,
    maxBytes: 2048,
  });

  expect(result.status).toBe('success');
  expect(result.speed).toContain('MB/s');
});

test('reports unsupported CDN responses and timeout failures', async () => {
  const unsupported = await measureCdnSpeed('https://cdn.test/video.m4s', {
    fetchImpl: async () => createResponse([], 403),
    buildUrl: (url) => url,
  });
  expect(unsupported).toEqual({
    status: 'unsupported',
    message: '此视频可能无法替换为该CDN',
  });

  const timeout = await measureCdnSpeed('https://cdn.test/video.m4s', {
    fetchImpl: (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('abort')));
      }),
    buildUrl: (url) => url,
    timeoutMs: 1,
  });
  expect(timeout).toEqual({ status: 'error', message: '测速超时' });
});

test('scans no-CDN and mirror routes with three concurrent workers', async () => {
  const options = [
    NO_CDN_OPTION,
    CDN_OPTIONS[0],
    CDN_OPTIONS[1],
    CDN_OPTIONS[2],
  ];
  const requests = [];
  const updates = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const scanner = createCdnSpeedScanner({
    options,
    getSampleUrl: async () =>
      'https://upos-sz-mirrorali.bilivideo.com/upgcxcode/video.m4s',
    fetchImpl: async (url) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        requests.push({
          url,
          resolve: (response) => {
            inFlight -= 1;
            resolve(response);
          },
        });
      });
    },
    buildUrl: (url) => url,
    maxBytes: 1024,
    onUpdate: (entries) => updates.push(entries),
  });

  const scanPromise = scanner.start();
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  expect(requests).toHaveLength(3);
  expect(inFlight).toBe(3);

  let completed = 0;
  while (completed < options.length) {
    const request = requests.shift();
    expect(request).toBeDefined();
    request.resolve(createResponse([1024]));
    completed += 1;
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
  }

  const result = await scanPromise;

  expect(maxInFlight).toBe(3);
  expect(result.every((entry) => entry.status === 'success')).toBe(true);
  expect(updates.some((entries) => entries[1].status === 'testing')).toBe(
    true,
  );
  expect(updates.at(-1)[2].speed).toContain('MB/s');
});

test('cancels an in-flight scan without publishing a cancellation failure', async () => {
  let rejectRequest;
  let resolveSample;
  let resolveFetchStarted;
  const fetchStarted = new Promise((resolve) => {
    resolveFetchStarted = resolve;
  });
  const scanner = createCdnSpeedScanner({
    options: [NO_CDN_OPTION],
    getSampleUrl: () =>
      new Promise((resolve) => {
        resolveSample = resolve;
      }),
    fetchImpl: (_url, options) =>
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
        resolveFetchStarted();
        options.signal.addEventListener('abort', () => reject(new Error('abort')));
      }),
  });
  const pending = scanner.start();
  await Promise.resolve();
  resolveSample(
    'https://upos-sz-mirrorali.bilivideo.com/upgcxcode/video.m4s',
  );
  await fetchStarted;
  scanner.cancel();
  await pending;
  expect(rejectRequest).toBeDefined();
});

test('cancels sample acquisition when the scanner is closed', async () => {
  const updates = [];
  let sampleAborted = false;
  const scanner = createCdnSpeedScanner({
    getSampleUrl: (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          sampleAborted = true;
          reject(new Error('aborted'));
        });
      }),
    onUpdate: (entries) => updates.push(entries),
  });
  const pending = scanner.start();
  await Promise.resolve();
  scanner.cancel();
  const result = await pending;

  expect(sampleAborted).toBe(true);
  expect(result.every((entry) => entry.status === 'idle')).toBe(true);
  expect(updates.at(-1).every((entry) => entry.status === 'idle')).toBe(true);
});

test('cancels every active concurrent CDN request', async () => {
  let abortCount = 0;
  const scanner = createCdnSpeedScanner({
    options: [NO_CDN_OPTION, CDN_OPTIONS[0], CDN_OPTIONS[1], CDN_OPTIONS[2]],
    getSampleUrl: async () =>
      'https://upos-sz-mirrorali.bilivideo.com/upgcxcode/video.m4s',
    fetchImpl: (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          abortCount += 1;
          reject(new Error('abort'));
        });
      }),
  });
  const pending = scanner.start();
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  scanner.cancel();
  await pending;

  expect(abortCount).toBe(3);
});

test('marks every option when the speed-test sample cannot be loaded', async () => {
  const updates = [];
  const scanner = createCdnSpeedScanner({
    getSampleUrl: async () => {
      throw new Error('sample unavailable');
    },
    onUpdate: (entries) => updates.push(entries),
  });
  const result = await scanner.start();

  expect(result).toHaveLength(CDN_PICKER_OPTIONS.length);
  expect(result.every((entry) => entry.message === '测速样本获取失败')).toBe(
    true,
  );
  expect(updates.at(-1)[0].status).toBe('error');
});
