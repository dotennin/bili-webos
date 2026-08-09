import { getPlayUrl } from '../api/client';
import { buildProxyUrl } from './proxy';
import { CDN_PICKER_OPTIONS, rewriteCdnUrl, type CdnOption } from './cdn';

export const CDN_SPEED_TEST_BVID = 'BV1fK4y1t7hj';
export const CDN_SPEED_TEST_CID = 196018899;
export const CDN_SPEED_TEST_MAX_BYTES = 8 * 1024 * 1024;
export const CDN_SPEED_TEST_TIMEOUT_MS = 15_000;
export const CDN_SPEED_TEST_CONCURRENCY = 3;

export type CdnSpeedStatus =
  | 'idle'
  | 'testing'
  | 'success'
  | 'unsupported'
  | 'error';

export type CdnSpeedEntry = CdnOption & {
  status: CdnSpeedStatus;
  speed: string | null;
  message: string | null;
};

type FetchResponse = {
  ok?: boolean;
  status?: number;
  body?: {
    getReader?: () => {
      read: () => Promise<{ done?: boolean; value?: ArrayBufferView }>;
      cancel?: () => Promise<void>;
    };
  };
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

type SpeedTestOptions = {
  fetchImpl?: (
    url: string,
    options?: Record<string, any>,
  ) => Promise<FetchResponse>;
  buildUrl?: (url: string) => string;
  now?: () => number;
  maxBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type SpeedTestResult = {
  status: Exclude<CdnSpeedStatus, 'idle' | 'testing'>;
  speed?: string;
  message?: string;
};

type ScannerOptions = {
  options?: CdnOption[];
  fetchImpl?: SpeedTestOptions['fetchImpl'];
  getSampleUrl?: (signal?: AbortSignal) => Promise<string>;
  buildUrl?: (url: string) => string;
  now?: () => number;
  maxBytes?: number;
  timeoutMs?: number;
  onUpdate?: (entries: CdnSpeedEntry[]) => void;
};

function createInitialEntries(options: CdnOption[]): CdnSpeedEntry[] {
  return options.map((option) => ({
    ...option,
    status: 'idle' as const,
    speed: null,
    message: null,
  }));
}

function formatSpeed(bytes: number, elapsedMs: number) {
  const safeElapsedMs = Math.max(1, elapsedMs);
  const megabytesPerSecond = (bytes / safeElapsedMs) * (1000 / (1024 * 1024));
  return `${Number(megabytesPerSecond.toPrecision(3))} MB/s`;
}

async function readResponseBytes(response: FetchResponse, maxBytes: number) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = await response.arrayBuffer?.();
    return Math.min(buffer?.byteLength || 0, maxBytes);
  }

  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value?.byteLength || 0;
    }
  } catch (error) {
    if (error && typeof error === 'object') error.downloadedBytes = bytes;
    throw error;
  } finally {
    if (bytes >= maxBytes) await reader.cancel?.();
  }
  return Math.min(bytes, maxBytes);
}

export async function getCdnSpeedTestSample(
  fetchPlayUrl = getPlayUrl,
  signal?: AbortSignal,
) {
  const response = await fetchPlayUrl(
    CDN_SPEED_TEST_BVID,
    CDN_SPEED_TEST_CID,
    80,
    { signal },
  );
  const track = response?.data?.dash?.video?.[0];
  const sampleUrl = track?.baseUrl || track?.base_url;
  if (!sampleUrl) throw new Error('测速样本不可用');
  return sampleUrl;
}

export async function measureCdnSpeed(
  url: string,
  options: SpeedTestOptions = {},
): Promise<SpeedTestResult> {
  const {
    fetchImpl = globalThis.fetch,
    buildUrl = buildProxyUrl,
    now = Date.now,
    maxBytes = CDN_SPEED_TEST_MAX_BYTES,
    timeoutMs = CDN_SPEED_TEST_TIMEOUT_MS,
    signal,
  } = options;

  if (typeof fetchImpl !== 'function') {
    return { status: 'error', message: '测速失败' } as SpeedTestResult;
  }

  const controller = new AbortController();
  let timedOut = false;
  let timeoutId;
  const abortFromParent = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abortFromParent, { once: true });
  }

  timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const startedAt = now();
  let bytes = 0;
  try {
    const response = await fetchImpl(buildUrl(url), {
      headers: { Range: `bytes=0-${maxBytes - 1}` },
      signal: controller.signal,
    });

    if (response.status >= 400 && response.status < 500) {
      return {
        status: 'unsupported',
        message: '此视频可能无法替换为该CDN',
      };
    }
    if (response.ok === false || response.status >= 500) {
      return { status: 'error', message: '测速失败' };
    }

    bytes = await readResponseBytes(response, maxBytes);
    if (!bytes) {
      return {
        status: 'error',
        message: timedOut ? '测速超时' : '没有收到数据',
      };
    }
    return {
      status: 'success',
      speed: formatSpeed(bytes, now() - startedAt),
    };
  } catch (error) {
    bytes = Number(error?.downloadedBytes) || bytes;
    if (bytes && timedOut) {
      return {
        status: 'success',
        speed: formatSpeed(bytes, now() - startedAt),
      };
    }
    return {
      status: 'error',
      message: timedOut ? '测速超时' : '测速失败',
    };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromParent);
  }
}

export function createCdnSpeedScanner(options: ScannerOptions = {}) {
  const {
    options: probeOptions = CDN_PICKER_OPTIONS,
    fetchImpl,
    getSampleUrl = (signal) => getCdnSpeedTestSample(getPlayUrl, signal),
    buildUrl,
    now,
    maxBytes,
    timeoutMs,
    onUpdate = () => {},
  } = options;
  let cancelled = false;
  let sampleController: AbortController | null = null;
  const activeControllers = new Set<AbortController>();
  let scanPromise;
  let entries = createInitialEntries(probeOptions);

  const emit = () => onUpdate(entries.map((entry) => ({ ...entry })));

  async function getSampleWithCancellation() {
    sampleController = new AbortController();
    let sampleTimeoutId;
    let rejectAborted;
    const abortPromise = new Promise((_resolve, reject) => {
      rejectAborted = reject;
    });
    const timeoutPromise = new Promise((_resolve, reject) => {
      sampleTimeoutId = setTimeout(() => {
        sampleController?.abort();
        reject(new Error('测速样本超时'));
      }, CDN_SPEED_TEST_TIMEOUT_MS);
    });
    const handleAbort = () => rejectAborted(new Error('测速已取消'));
    sampleController.signal.addEventListener('abort', handleAbort, {
      once: true,
    });

    try {
      return await Promise.race([
        getSampleUrl(sampleController.signal),
        abortPromise,
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(sampleTimeoutId);
      sampleController.signal.removeEventListener('abort', handleAbort);
      sampleController = null;
    }
  }

  async function start() {
    if (scanPromise) return scanPromise;

    scanPromise = (async () => {
      emit();
      let sampleUrl;
      try {
        sampleUrl = await getSampleWithCancellation();
      } catch {
        if (cancelled) return entries;
        entries = entries.map((entry) => ({
          ...entry,
          status: 'error' as const,
          message: '测速样本获取失败',
        }));
        emit();
        return entries;
      }

      let nextIndex = 0;
      async function testEntry(index) {
        if (cancelled) return;
        entries = entries.map((entry, entryIndex) =>
          entryIndex === index
            ? {
                ...entry,
                status: 'testing' as const,
                speed: null,
                message: null,
              }
            : entry,
        );
        emit();

        const controller = new AbortController();
        activeControllers.add(controller);
        const option = probeOptions[index];
        const targetUrl = option.host
          ? rewriteCdnUrl(sampleUrl, option.host)
          : sampleUrl;
        let result;
        try {
          result = await measureCdnSpeed(targetUrl, {
            fetchImpl,
            buildUrl,
            now,
            maxBytes,
            timeoutMs,
            signal: controller.signal,
          });
        } finally {
          activeControllers.delete(controller);
        }
        if (cancelled) return;

        entries = entries.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, ...result } : entry,
        );
        emit();
      }

      async function runWorker() {
        while (!cancelled) {
          const index = nextIndex;
          nextIndex += 1;
          if (index >= entries.length) return;
          await testEntry(index);
        }
      }

      await Promise.all(
        Array.from(
          {
            length: Math.min(CDN_SPEED_TEST_CONCURRENCY, entries.length),
          },
          () => runWorker(),
        ),
      );
      return entries;
    })();

    return scanPromise;
  }

  function cancel() {
    cancelled = true;
    sampleController?.abort();
    activeControllers.forEach((controller) => controller.abort());
  }

  return { start, cancel };
}
