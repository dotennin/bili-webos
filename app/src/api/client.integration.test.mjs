import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import {
  apiFetch,
  rawFetch,
  castSubscribe,
  castAck,
  getLiveList,
  getLiveStreamUrl,
  getLiveStreamSource,
  getDanmaku,
  getVideoInfo,
  reportHeartbeat,
} from './client.js';

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const originalDOMParser = globalThis.DOMParser;
const originalLocalStorage = globalThis.localStorage;

function makeStorage() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
}

describe('api client integration paths', () => {
  beforeEach(() => {
    globalThis.localStorage = makeStorage();
    localStorage.setItem('bili_proxy', 'http://127.0.0.1:9527');
    globalThis.window = { location: { hostname: 'localhost' } };
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    globalThis.DOMParser = originalDOMParser;
    globalThis.localStorage = originalLocalStorage;
    mock.restore();
  });

  it('falls back to proxy JSON/text parsing and persists cookie updates', async () => {
    const calls = [];
    globalThis.fetch = mock((url) => {
      calls.push(url);
      return Promise.resolve({
        headers: {
          get: (name) => {
            if (name === 'content-type') return 'application/json';
            if (name === 'X-Set-Cookie') return JSON.stringify({ DedeUserID: '100' });
            return null;
          },
        },
        json: async () => ({ code: 0, data: { ok: true } }),
      });
    });

    const res = await apiFetch('/x/test', { q: 'k' });
    expect(res.data.ok).toBe(true);
    expect(calls[0]).toContain('/proxy/api.bilibili.com/x/test?q=k');

    const auth = JSON.parse(localStorage.getItem('bili_auth'));
    expect(auth.DedeUserID).toBe('100');
  });

  it('uses luna service when available and supports cast subscribe/ack', async () => {
    const events = [];
    const requests = [];
    globalThis.window = {
      PalmServiceBridge: function() {},
      webOS: {
        service: {
          request: (_uri, options) => {
            requests.push(options.method);
            if (options.method === 'castSubscribe') {
              options.onSuccess({ event: 'state', status: { mode: 'play' } });
              return;
            }
            options.onSuccess({ returnValue: true, body: JSON.stringify({ code: 0 }) });
          },
        },
      },
      location: { hostname: 'tv' },
    };

    const unsubscribe = castSubscribe((event, status) => events.push([event, status.mode]));
    await castAck({ seq: 1 });
    const raw = await rawFetch('https://api.bilibili.com/x/raw', {});
    unsubscribe();

    expect(events).toEqual([['state', 'play']]);
    expect(requests).toContain('castAck');
    expect(raw.returnValue).toBe(true);
  });

  it('covers live-list fallback and stream selector helpers', async () => {
    const payloads = [
      { data: { rooms: [] } },
      { data: { recommend_room_list: [{ roomid: 1 }] } },
      {
        data: {
          playurl_info: {
            playurl: {
              stream: [
                {
                  protocol_name: 'http_stream',
                  format: [{ format_name: 'flv', codec: [{ codec_name: 'avc', base_url: '/live.flv', url_info: [{ host: 'https://h', extra: '?e=1' }] }] }],
                },
              ],
            },
          },
        },
      },
      {
        data: {
          playurl_info: {
            playurl: {
              stream: [
                {
                  protocol_name: 'http_stream',
                  format: [{ format_name: 'flv', codec: [{ codec_name: 'avc', base_url: '/live.flv', url_info: [{ host: 'https://h', extra: '?e=1' }] }] }],
                },
              ],
            },
          },
        },
      },
    ];
    globalThis.fetch = mock(() => Promise.resolve({
      headers: { get: () => 'application/json' },
      json: async () => payloads.shift(),
    }));

    const list = await getLiveList(2, 5);
    const url = await getLiveStreamUrl(9);
    const source = await getLiveStreamSource(9);

    expect(list.data.list[0].roomid).toBe(1);
    expect(url).toContain('https://h/live.flv');
    expect(source.type).toBe('flv');
  });

  it('parses danmaku XML and tolerates heartbeat request failures', async () => {
    globalThis.DOMParser = class {
      parseFromString() {
        return {
          querySelectorAll() {
            return [
              { getAttribute: () => '2,1,25,16777215,171000,0,0,0', textContent: 'later' },
              { getAttribute: () => '1,1,25,255,171001,0,0,0', textContent: 'first' },
            ];
          },
        };
      }
    };

    let n = 0;
    globalThis.fetch = mock(() => {
      n += 1;
      if (n === 1) {
        return Promise.resolve({ text: async () => '<i><d p="1,1,25,255">x</d></i>' });
      }
      return Promise.reject(new Error('network'));
    });

    const danmaku = await getDanmaku(10);
    await reportHeartbeat('BV1', 2, 10.5, 11.8);

    expect(danmaku[0].text).toBe('first');
    expect(danmaku[1].color).toBe('#ffffff');
  });

  it('throws when getVideoInfo is called without aid/bvid', async () => {
    await expect(getVideoInfo({})).rejects.toThrow('Missing video identifier');
  });
});
