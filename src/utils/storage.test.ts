import { test, expect } from 'bun:test';
import { storage } from './storage.ts';

function withMockLocalStorage(fn) {
  const original = globalThis.localStorage;
  const map = new Map();
  const mock = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
  globalThis.localStorage = mock;
  try {
    fn(map, mock);
  } finally {
    if (typeof original === 'undefined') delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
}

test('storage.remove does not throw when localStorage is unavailable', () => {
  const originalLocalStorage = globalThis.localStorage;
  try {
    delete globalThis.localStorage;
  } catch {}

  expect(() => {
    storage.remove('auth');
  }).not.toThrow();

  if (typeof originalLocalStorage !== 'undefined') {
    globalThis.localStorage = originalLocalStorage;
  }
});

test('auth/settings helpers roundtrip values', () => {
  withMockLocalStorage(() => {
    storage.setAuth({ token: 'abc' });
    expect(storage.getAuth()).toEqual({ token: 'abc' });

    storage.setSettings({
      danmaku: false,
      quality: 64,
      videoGridCols: 4,
      subtitleLanguage: 'ja-JP',
    });
    expect(storage.getSettings()).toEqual({
      danmaku: false,
      quality: 64,
      videoGridCols: 4,
      subtitleLanguage: 'ja-JP',
    });

    storage.clearAuth();
    expect(storage.getAuth()).toBeNull();
  });
});

test('get returns null for invalid json and set tolerates quota errors', () => {
  withMockLocalStorage((map, mock) => {
    map.set('bili_auth', '{oops');
    expect(storage.get('auth')).toBeNull();

    mock.setItem = () => {
      throw new Error('quota');
    };
    expect(() => storage.set('x', { a: 1 })).not.toThrow();
  });
});

test('getSettings returns defaults when missing', () => {
  withMockLocalStorage((map) => {
    map.delete('bili_settings');
    expect(storage.getSettings()).toEqual({
      danmaku: true,
      quality: 80,
      videoGridCols: 3,
      subtitleLanguage: null,
    });
  });
});

test('getSettings tolerates invalid stored payloads', () => {
  withMockLocalStorage((map) => {
    map.set('bili_settings', '{oops');
    expect(storage.getSettings()).toEqual({
      danmaku: true,
      quality: 80,
      videoGridCols: 3,
      subtitleLanguage: null,
    });
  });
});

test('resume progress helpers roundtrip entries and enforce cid matching', () => {
  withMockLocalStorage(() => {
    storage.setResumeProgress({
      bvid: 'BV1',
      cid: 7,
      progress: 48,
      duration: 120,
      updatedAt: 111,
    });

    expect(storage.getResumeProgress('BV1', 7)).toEqual({
      bvid: 'BV1',
      cid: 7,
      progress: 48,
      duration: 120,
      updatedAt: 111,
    });
    expect(storage.getResumeProgress('BV1', 8)).toBeNull();

    storage.clearResumeProgress('BV1');
    expect(storage.getResumeProgress('BV1', 7)).toBeNull();
  });
});

test('resume progress helpers normalize values and detect near-end playback', () => {
  withMockLocalStorage(() => {
    storage.setResumeProgress({
      bvid: 'BV2',
      cid: '',
      progress: '15.8',
      duration: '100',
    });

    expect(storage.getResumeProgress('BV2')).toEqual({
      bvid: 'BV2',
      cid: null,
      progress: 15.8,
      duration: 100,
      updatedAt: expect.any(Number),
    });
    expect(storage.shouldClearResumeProgress(98, 100)).toBe(true);
    expect(storage.shouldClearResumeProgress(90, 100)).toBe(false);
    expect(storage.shouldClearResumeProgress(5, 0)).toBe(false);
  });
});

test('cast recent history helpers roundtrip normalized entries in newest-first order', () => {
  withMockLocalStorage((items) => {
    storage.addCastRecentHistory({ bvid: 'BV1', title: 'older', viewedAt: 100 });
    storage.addCastRecentHistory({ bvid: 'BV2', title: 'newer', viewedAt: 200 });

    expect(storage.getCastRecentHistory().map((item) => item.bvid)).toEqual([
      'BV2',
      'BV1',
    ]);
    expect(JSON.parse(items.get('bili_cast_recent_history'))).toEqual({
      version: 1,
      entries: expect.any(Array),
    });
  });
});

test('cast recent history replaces duplicate bvid and keeps old valid metadata', () => {
  withMockLocalStorage(() => {
    storage.addCastRecentHistory({
      bvid: 'BV1',
      cid: 1,
      title: 'title',
      pic: 'cover',
      ownerName: 'owner',
      viewedAt: 100,
    });
    storage.addCastRecentHistory({ bvid: 'BV1', cid: 2, viewedAt: 200 });

    expect(storage.getCastRecentHistory()).toEqual([
      expect.objectContaining({
        bvid: 'BV1',
        cid: 2,
        title: 'title',
        pic: 'cover',
        ownerName: 'owner',
        viewedAt: 200,
      }),
    ]);
  });
});

test('cast recent history trims to fifty and rejects invalid schemas', () => {
  withMockLocalStorage((items) => {
    for (let index = 0; index < 51; index += 1) {
      storage.addCastRecentHistory({ bvid: `BV${index}`, viewedAt: index + 1 });
    }
    expect(storage.getCastRecentHistory()).toHaveLength(50);
    expect(storage.getCastRecentHistory().some((item) => item.bvid === 'BV0')).toBe(false);

    items.set('bili_cast_recent_history', JSON.stringify({ version: 2, entries: [] }));
    expect(storage.getCastRecentHistory()).toEqual([]);
  });
});

test('cast recent history drops invalid entries and tolerates storage failures', () => {
  withMockLocalStorage((items, mock) => {
    items.set(
      'bili_cast_recent_history',
      JSON.stringify({
        version: 1,
        entries: [
          { bvid: '', viewedAt: 10 },
          { bvid: 'BV1', viewedAt: 0 },
          { bvid: 'BV2', viewedAt: 20, progress: -5 },
        ],
      }),
    );
    expect(storage.getCastRecentHistory()).toEqual([
      expect.objectContaining({ bvid: 'BV2', progress: 0, viewedAt: 20 }),
    ]);
    mock.setItem = () => {
      throw new Error('quota');
    };
    expect(() =>
      storage.addCastRecentHistory({ bvid: 'BV3', viewedAt: 30 }),
    ).not.toThrow();
  });
});
