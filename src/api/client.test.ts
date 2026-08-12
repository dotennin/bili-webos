import { describe, expect, mock, test, beforeEach, afterEach } from 'bun:test';
import {
  getStoryboard,
  getRanking,
  getRelated,
  reportHeartbeat,
  getPopular,
  getRecommend,
  getRegionDynamic,
  searchVideo,
  getHistory,
  getFavFolders,
  getFavList,
  getReplies,
  getReplyReplies,
  likeComment,
  type StoryboardTile,
} from './client';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalStorage = globalThis.localStorage;

function setupMocks(responseData?: any) {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    length: 0,
    clear: () => {},
    key: () => null,
  };

  globalThis.fetch = mock((url: string) => {
    if (String(url).includes('/x/web-interface/nav')) {
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          data: {
            wbi_img: {
              img_url: 'https://i/a12345678901234567890123456789012.png',
              sub_url: 'https://i/b12345678901234567890123456789012.png',
            },
          },
        }),
      });
    }
    if (String(url).includes('.bin')) {
      const buf = new ArrayBuffer(6);
      const view = new DataView(buf);
      view.setUint16(0, 0, false);
      view.setUint16(2, 5, false);
      view.setUint16(4, 10, false);
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/octet-stream' },
        arrayBuffer: async () => buf,
      });
    }
    return Promise.resolve({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => responseData ?? { code: 0, data: {} },
    });
  });

  globalThis.window = {
    location: { hostname: 'localhost', origin: 'http://localhost:5173' },
  } as any;
}

function teardownMocks() {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.localStorage = originalStorage;
  mock.restore();
}

describe('getStoryboard', () => {
  beforeEach(() => {
    setupMocks();
  });

  afterEach(() => {
    teardownMocks();
  });

  test('returns null when API returns no storyboard data', async () => {
    const result = await getStoryboard('BV1xx', 123);
    expect(result).toBeNull();
  });

  test('returns null for malformed storyboard (missing fields)', async () => {
    setupMocks({
      code: 0,
      data: { img_x_len: 0, img_y_len: 0, img_x_size: 0, img_y_size: 0, image: [] },
    });
    const result = await getStoryboard('BV1xx', 456);
    expect(result).toBeNull();
  });

  test('returns StoryboardTile with valid storyboard data', async () => {
    setupMocks({
      code: 0,
      data: {
        img_x_len: 10,
        img_y_len: 10,
        img_x_size: 160,
        img_y_size: 90,
        image: [
          '//i0.hdslb.com/bfs/videoshot/xxx_1.jpg',
          '//i0.hdslb.com/bfs/videoshot/xxx_2.jpg',
        ],
        pvdata: '//i0.hdslb.com/bfs/videoshot/xxx.bin',
      },
    });

    const result = await getStoryboard('BV1xx', 789);
    expect(result).not.toBeNull();
    expect(result!.cols).toBe(10);
    expect(result!.rows).toBe(10);
    expect(result!.tileW).toBe(160);
    expect(result!.tileH).toBe(90);
    expect(result!.interval).toBe(5);
    expect(result!.imageUrls).toHaveLength(2);
    expect(result!.imageUrls[0]).toContain('/proxy/');
    expect(result!.frameTimes).toEqual([0, 5, 10]);
  });

  test('returns null for empty image array', async () => {
    setupMocks({
      code: 0,
      data: { img_x_len: 10, img_y_len: 10, img_x_size: 160, img_y_size: 90, image: [] },
    });
    const result = await getStoryboard('BV1xx', 888);
    expect(result).toBeNull();
  });

  describe('existing API functions', () => {
    test('getRanking returns proxy-fetched data', async () => {
      setupMocks({ code: 0, data: { list: [{ aid: 1 }] } });
      const result = await getRanking(0, 'all');
      expect(result?.data?.list?.[0]?.aid).toBe(1);
    });

    test('getRelated returns proxy-fetched data', async () => {
      setupMocks({ code: 0, data: [{ bvid: 'BV-rel' }] });
      const result = await getRelated('BV-rel');
      expect(result?.data?.[0]?.bvid).toBe('BV-rel');
    });

    test('reportHeartbeat succeeds silently without luna', async () => {
      setupMocks({ code: 0 });
      await expect(
        reportHeartbeat('BV-hb', 99, 50, { paused: false }),
      ).resolves.toBeUndefined();
    });

    test('getPopular returns proxy-fetched data', async () => {
      setupMocks({ code: 0, data: { list: [{ aid: 99 }] } });
      const result = await getPopular();
      expect(result?.data?.list?.[0]?.aid).toBe(99);
    });

    test('getRecommend returns proxy-fetched data', async () => {
      setupMocks({ code: 0, data: { item: [{ aid: 88 }] } });
      const result = await getRecommend();
      expect(result?.data?.item?.[0]?.aid).toBe(88);
    });

    test('getRegionDynamic returns proxy-fetched data', async () => {
      setupMocks({ code: 0, data: { archives: [{ aid: 77 }] } });
      const result = await getRegionDynamic(1, 1, 6);
      expect(result?.data?.archives?.[0]?.aid).toBe(77);
    });

    test('searchVideo returns proxy-fetched data', async () => {
      setupMocks({ code: 0, data: { result: [{ aid: 66 }] } });
      const result = await searchVideo('test');
      expect(result?.data?.result?.[0]?.aid).toBe(66);
    });

    test('getHistory returns proxy-fetched data', async () => {
      setupMocks({ code: 0, data: { list: [{ aid: 55 }] } });
      const result = await getHistory();
      expect(result?.data?.list?.[0]?.aid).toBe(55);
    });

    test('getFavFolders returns proxy-fetched data', async () => {
      setupMocks({ code: 0, data: { list: [{ id: 7 }] } });
      const result = await getFavFolders(1);
      expect(result?.data?.list?.[0]?.id).toBe(7);
    });

    test('getFavList returns proxy-fetched data', async () => {
      setupMocks({ code: 0, data: { medias: [{ id: 3 }] } });
      const result = await getFavList(1);
      expect(result?.data?.medias?.[0]?.id).toBe(3);
    });

    test('getRanking with specific rid returns data', async () => {
      setupMocks({ code: 0, data: { list: [{ aid: 111 }] } });
      const result = await getRanking(1, 'bangumi');
      expect(result?.data?.list?.[0]?.aid).toBe(111);
    });

    test('getRegionDynamic with default params', async () => {
      setupMocks({ code: 0, data: { archives: [{ aid: 222 }] } });
      const result = await getRegionDynamic();
      expect(result?.data?.archives?.[0]?.aid).toBe(222);
    });
  });
});

describe('comment APIs', () => {
  beforeEach(() => {
    setupMocks({
      code: 0,
      data: {
        replies: [],
        cursor: {
          is_end: false,
          pagination_reply: { next_offset: 'next-page' },
        },
      },
    });
  });

  afterEach(() => {
    teardownMocks();
  });

  test('getReplies requests hot comments with cursor pagination', async () => {
    const data = await getReplies(123, 'cursor-value');
    const url = new URL(String((globalThis.fetch as any).mock.calls[0][0]));

    expect(url.pathname).toContain('/x/v2/reply/main');
    expect(url.searchParams.get('type')).toBe('1');
    expect(url.searchParams.get('oid')).toBe('123');
    expect(url.searchParams.get('mode')).toBe('3');
    expect(JSON.parse(url.searchParams.get('pagination_str') || '{}')).toEqual(
      { offset: 'cursor-value' },
    );
    expect(data.data.cursor.pagination_reply.next_offset).toBe('next-page');
  });

  test('getReplies starts with an empty offset and rejects business errors', async () => {
    await getReplies(321);
    const url = new URL(String((globalThis.fetch as any).mock.calls[0][0]));
    expect(JSON.parse(url.searchParams.get('pagination_str') || '{}')).toEqual(
      { offset: '' },
    );

    setupMocks({ code: -509, message: '请求过快' });
    await expect(getReplies(321)).rejects.toThrow('请求过快');
  });

  test('getReplyReplies requests one nested-reply page', async () => {
    await getReplyReplies(123, 456, 2);
    const url = new URL(String((globalThis.fetch as any).mock.calls[0][0]));

    expect(url.pathname).toContain('/x/v2/reply/reply');
    expect(url.searchParams.get('type')).toBe('1');
    expect(url.searchParams.get('oid')).toBe('123');
    expect(url.searchParams.get('root')).toBe('456');
    expect(url.searchParams.get('pn')).toBe('2');
    expect(url.searchParams.get('ps')).toBe('10');
  });

  test('getReplyReplies rejects business errors', async () => {
    setupMocks({ code: 12006, message: '评论不存在' });
    await expect(getReplyReplies(123, 456, 1)).rejects.toThrow('评论不存在');
  });

  test('likeComment posts form data with csrf and supports unlike', async () => {
    globalThis.localStorage.getItem = (key) =>
      key === 'bili_auth' ? JSON.stringify({ bili_jct: 'csrf-token' }) : null;

    await likeComment(123, 456, 1);
    await likeComment(123, 456, 0);

    const firstOptions = (globalThis.fetch as any).mock.calls[0][1];
    const firstBody = new URLSearchParams(firstOptions.body);
    expect(firstOptions.method).toBe('POST');
    expect(firstOptions.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(firstBody.get('type')).toBe('1');
    expect(firstBody.get('oid')).toBe('123');
    expect(firstBody.get('rpid')).toBe('456');
    expect(firstBody.get('action')).toBe('1');
    expect(firstBody.get('csrf')).toBe('csrf-token');

    const secondBody = new URLSearchParams(
      (globalThis.fetch as any).mock.calls[1][1].body,
    );
    expect(secondBody.get('action')).toBe('0');
  });

  test('likeComment rejects missing csrf and business errors', async () => {
    await expect(likeComment(123, 456, 1)).rejects.toThrow('请先登录');
    expect((globalThis.fetch as any).mock.calls).toHaveLength(0);

    setupMocks({ code: -111, message: 'csrf 校验失败' });
    globalThis.localStorage.getItem = (key) =>
      key === 'bili_auth' ? JSON.stringify({ bili_jct: 'csrf-token' }) : null;
    await expect(likeComment(123, 456, 1)).rejects.toThrow('csrf 校验失败');
  });
});
