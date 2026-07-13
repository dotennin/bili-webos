import { expect, test } from 'bun:test';
import { mergeRecentHistory } from './history';

test('mergeRecentHistory maps remote time and local owner fields', () => {
  expect(
    mergeRecentHistory(
      [{ history: { bvid: 'BV1', cid: 1 }, title: 'remote', view_at: 12 }],
      [{ bvid: 'BV2', ownerName: 'owner', viewedAt: 13_000 }],
    ),
  ).toEqual([
    expect.objectContaining({ bvid: 'BV2', owner: { name: 'owner' } }),
    expect.objectContaining({ bvid: 'BV1', viewedAt: 12_000 }),
  ]);
});

test('mergeRecentHistory deduplicates bvid and lets the newer source lead', () => {
  const result = mergeRecentHistory(
    [{
      history: { bvid: 'BV1', cid: 1 },
      title: 'remote title',
      cover: 'remote cover',
      progress: 10,
      view_at: 10,
    }],
    [{ bvid: 'BV1', cid: 2, progress: 20, viewedAt: 20_000 }],
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toEqual(
    expect.objectContaining({
      bvid: 'BV1',
      cid: 2,
      progress: 20,
      title: 'remote title',
      pic: 'remote cover',
      viewedAt: 20_000,
    }),
  );
});

test('mergeRecentHistory keeps stable remote order without timestamps', () => {
  expect(
    mergeRecentHistory([
      { history: { bvid: 'BV1' }, title: 'first' },
      { history: { bvid: 'BV2' }, title: 'second' },
    ], []).map((item) => item.bvid),
  ).toEqual(['BV1', 'BV2']);
});

test('mergeRecentHistory does not deduplicate different bvids with one title', () => {
  expect(
    mergeRecentHistory(
      [{ history: { bvid: 'BV1' }, title: 'same', view_at: 2 }],
      [{ bvid: 'BV2', title: 'same', viewedAt: 1_000 }],
    ),
  ).toHaveLength(2);
});
