# Local Cast Recent History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Bilibili account history as the remote source while adding a resilient, 50-item local cast history that is merged, deduplicated, and available when the remote history is unavailable.

**Architecture:** Add versioned cast-history helpers to the existing storage module and isolate remote/local normalization and merging in a pure page helper. Record a cast entry once, on the first media `playing` event of each `PlayerPage` instance. Refactor `HistoryPage` into separate local-data and remote-status concerns, and use the existing `refreshKey` to reload both sources.

**Tech Stack:** React, TypeScript/JavaScript, Bun test runner, existing `storage` wrapper, Bilibili history API, webOS-compatible browser APIs.

**Design reference:** `docs/superpowers/specs/2026-07-13-local-cast-recent-history-design.md`

---

## File map

- Modify `src/utils/storage.ts`: own the versioned local cast-history schema, normalization, bounded reads, and upserts.
- Modify `src/utils/storage.test.ts`: verify schema validation, ordering, deduplication, metadata preservation, cap, and storage failures.
- Create `src/pages/history.ts`: pure mapping and merge functions; no React or network state.
- Create `src/pages/history.test.ts`: verify time conversion, owner mapping, field fallback, deduplication, and stable ordering.
- Modify `src/player/PlayerPage.tsx`: write one local entry on the first `playing` event of a cast session.
- Modify `src/player/player.render.test.ts`: verify the player write boundary, one-write guard, metadata, and failure isolation.
- Modify `src/pages/HistoryPage.tsx`: load both sources, classify remote state, render local fallback, and reject stale completions.
- Modify `src/pages/pages.render.test.ts`: verify merged rendering, fallback states, timeout, refresh, and stale requests.
- Modify `src/App.tsx`: pass `refreshKey` to `HistoryPage`.
- Modify `src/App.render.test.ts`: verify same-tab reselection increments the history refresh signal.

### Task 1: Versioned local cast-history storage

**Files:**
- Modify: `src/utils/storage.ts`
- Test: `src/utils/storage.test.ts`

- [ ] **Step 1: Add failing storage tests**

Use the existing `withMockLocalStorage` helper and add these tests:

```ts
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
```

- [ ] **Step 2: Run the storage tests and confirm the new API is missing**

Run: `bun test src/utils/storage.test.ts -t "cast recent history"`

Expected: FAIL because `getCastRecentHistory` and `addCastRecentHistory` do not exist.

- [ ] **Step 3: Implement normalization and storage helpers**

Add constants and a private normalizer to `src/utils/storage.ts`:

```ts
const CAST_RECENT_HISTORY_KEY = 'cast_recent_history';
const CAST_RECENT_HISTORY_VERSION = 1;
const CAST_RECENT_HISTORY_LIMIT = 50;

function normalizeCastRecentEntry(entry) {
  if (typeof entry?.bvid !== 'string' || !entry.bvid.trim()) return null;
  const viewedAt = Number(entry.viewedAt);
  if (!Number.isFinite(viewedAt) || viewedAt <= 0) return null;
  const optionalText = (value) =>
    typeof value === 'string' && value.trim() ? value : undefined;
  const optionalNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : undefined;
  };
  return {
    bvid: entry.bvid.trim(),
    cid: entry.cid == null || entry.cid === '' ? undefined : entry.cid,
    title: optionalText(entry.title),
    pic: optionalText(entry.pic),
    ownerName: optionalText(entry.ownerName),
    duration: optionalNumber(entry.duration),
    progress: optionalNumber(entry.progress),
    viewedAt,
  };
}
```

Add methods to `storage`:

```ts
getCastRecentHistory() {
  const stored = this.get(CAST_RECENT_HISTORY_KEY);
  if (
    stored?.version !== CAST_RECENT_HISTORY_VERSION ||
    !Array.isArray(stored.entries)
  ) return [];
  return stored.entries
    .map(normalizeCastRecentEntry)
    .filter(Boolean)
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .slice(0, CAST_RECENT_HISTORY_LIMIT);
},

addCastRecentHistory(entry) {
  try {
    const normalized = normalizeCastRecentEntry(entry);
    if (!normalized) return;
    const previous = this.getCastRecentHistory().find(
      (item) => item.bvid === normalized.bvid,
    );
    const compact = (value) =>
      Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
    const merged = compact({ ...previous, ...compact(normalized) });
    const entries = [
      merged,
      ...this.getCastRecentHistory().filter((item) => item.bvid !== merged.bvid),
    ]
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .slice(0, CAST_RECENT_HISTORY_LIMIT);
    this.set(CAST_RECENT_HISTORY_KEY, {
      version: CAST_RECENT_HISTORY_VERSION,
      entries,
    });
  } catch {
    /* local cast history must never interrupt playback */
  }
},
```

- [ ] **Step 4: Run storage tests**

Run: `bun test src/utils/storage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the storage unit**

```bash
git add src/utils/storage.ts src/utils/storage.test.ts
git commit -m "feat: store local cast recent history"
```

### Task 2: Pure remote/local history merge

**Files:**
- Create: `src/pages/history.ts`
- Create: `src/pages/history.test.ts`

- [ ] **Step 1: Write failing pure-function tests**

```ts
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
```

- [ ] **Step 2: Run the pure-function tests and confirm the module is absent**

Run: `bun test src/pages/history.test.ts`

Expected: FAIL because `./history` does not exist.

- [ ] **Step 3: Implement the mapper and merger**

Create `src/pages/history.ts` with exported `mergeRecentHistory(remoteItems, localEntries)`. Normalize Bilibili fields (`history.bvid`, `history.cid`, `cover`, `author_name`, and `view_at * 1000`) and local fields (`ownerName` to `owner.name`). Keep an internal source order, merge only matching non-empty `bvid` values, select `cid` and `progress` from the newer source with fallback, fill display metadata from the other source, then sort by descending `viewedAt` and ascending source order. Return plain card objects and retain `viewedAt` for deterministic sorting and tests.

Use these concrete merge helpers:

```ts
const present = (value) => value !== undefined && value !== null && value !== '';
const choose = (primary, fallback) => (present(primary) ? primary : fallback);

function combine(newer, older) {
  return {
    ...older.video,
    ...newer.video,
    bvid: newer.video.bvid,
    cid: choose(newer.video.cid, older.video.cid),
    progress: choose(newer.video.progress, older.video.progress),
    title: choose(newer.video.title, older.video.title),
    pic: choose(newer.video.pic, older.video.pic),
    duration: choose(newer.video.duration, older.video.duration),
    owner: choose(newer.video.owner?.name, older.video.owner?.name)
      ? { name: choose(newer.video.owner?.name, older.video.owner?.name) }
      : undefined,
    viewedAt: Math.max(newer.viewedAt || 0, older.viewedAt || 0) || null,
  };
}
```

For equal timestamps, keep the first encountered item as the primary record so the result is stable.

- [ ] **Step 4: Run merge tests**

Run: `bun test src/pages/history.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the pure merge unit**

```bash
git add src/pages/history.ts src/pages/history.test.ts
git commit -m "feat: merge remote and local recent history"
```

### Task 3: Record cast history on first playback

**Files:**
- Modify: `src/player/PlayerPage.tsx`
- Test: `src/player/player.render.test.ts`

- [ ] **Step 1: Extend the storage mock and add failing player tests**

Add `castRecentHistoryWrites: []` to the player test state and mock `addCastRecentHistory(entry)` by pushing into it. Add tests that render a cast video, dispatch `playing` twice, and assert exactly one entry:

```ts
test('records cast recent history on the first playing event only', async () => {
  const video = createVideoMock();
  await renderPlayer({
    video: {
      bvid: 'BVX',
      cid: 7,
      title: 'cast title',
      owner: { name: 'owner' },
      fromCast: true,
    },
    videoNode: video,
  });
  video.currentTime = 8;
  video.duration = 100;
  await act(() => video.dispatch('playing'));
  await act(() => video.dispatch('playing'));
  expect(storageState.castRecentHistoryWrites).toEqual([
    expect.objectContaining({
      bvid: 'BVX',
      cid: 7,
      title: 'cast title',
      ownerName: 'owner',
      progress: 8,
      duration: 100,
    }),
  ]);
});
```

Add two focused variants using the same existing render helper: one with `fromCast: false`, and one with no `bvid`; dispatch `playing` and assert the writes array remains empty. Also assert no write exists before `playing` is dispatched.

- [ ] **Step 2: Run focused player tests**

Run: `bun test src/player/player.render.test.ts -t "cast recent history"`

Expected: FAIL because the storage method is never called.

- [ ] **Step 3: Add an instance guard and metadata ref**

Import the existing `storage`, add `castHistoryWrittenRef = useRef(false)`, and keep the latest cast card metadata in a ref updated when resolved title/CID data changes. In `handlePlaying`, mark the guard before storage access and call:

```ts
if (
  !castHistoryWrittenRef.current &&
  video?.fromCast === true &&
  typeof video?.bvid === 'string' &&
  video.bvid.trim()
) {
  castHistoryWrittenRef.current = true;
  const metadata = castHistoryMetadataRef.current;
  storage.addCastRecentHistory({
    bvid: video.bvid,
    cid: cidRef.current ?? video.cid,
    title: metadata.title,
    pic: metadata.pic,
    ownerName: metadata.ownerName,
    duration: Number(el.duration) || Number(video.duration) || undefined,
    progress: Number(el.currentTime) || Number(video.progress) || 0,
    viewedAt: Date.now(),
  });
}
```

Do not add the write to the `play` event, load path, heartbeat interval, or resume-progress interval.

- [ ] **Step 4: Run the complete player test file**

Run: `bun test src/player/player.render.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the player unit**

```bash
git add src/player/PlayerPage.tsx src/player/player.render.test.ts
git commit -m "feat: record cast videos after playback starts"
```

### Task 4: Render merged and degraded history states

**Files:**
- Modify: `src/pages/HistoryPage.tsx`
- Modify: `src/pages/pages.render.test.ts`

- [ ] **Step 1: Add failing HistoryPage tests**

Extend the mocked storage with `getCastRecentHistory`. Add tests using the existing `videoGridCalls`, timeout capture, `render`, `update`, and `flush` helpers:

```ts
test('HistoryPage merges remote and local history and deduplicates by bvid', async () => {
  const { default: HistoryPage } = await importFresh('./HistoryPage.tsx');
  storageState.castRecentHistory = [
    { bvid: 'BV1', cid: 2, title: 'local', viewedAt: 20_000 },
    { bvid: 'BV2', title: 'local only', viewedAt: 15_000 },
  ];
  api.getHistory = async () => ({
    code: 0,
    data: { list: [{ history: { bvid: 'BV1', cid: 1 }, title: 'remote', view_at: 10 }] },
  });
  await render(
    React.createElement(HistoryPage, { onPlayVideo() {}, refreshKey: 0 }),
  );
  await flush();
  expect(videoGridCalls.at(-1).videos.map((item) => item.bvid)).toEqual(['BV1', 'BV2']);
  expect(videoGridCalls.at(-1).videos[0].cid).toBe(2);
});
```

Create these exact additional tests, each using `React.createElement(HistoryPage, { onPlayVideo() {}, refreshKey: 0 })`, `await render(...)`, and `await flush()` as in the existing HistoryPage test:

- `HistoryPage shows local history with a non-blocking logged-out notice`: return `{ code: -101 }`, seed one local entry, and assert both its title and `请先登录` occur while `videoGridCalls.at(-1).videos` contains that entry.
- `HistoryPage shows local history with api error and timeout notices`: first throw `new Error('网络异常')`, then use a never-resolving promise and invoke `timeouts.at(-1).fn()`; for each renderer assert the seeded local title plus the corresponding message.
- `HistoryPage keeps unavailable states blocking when local history is empty`: repeat logged-out and thrown-error responses with `storageState.castRecentHistory = []`; assert the message exists and no new `videoGridCalls` entry is added.
- `HistoryPage treats an empty remote list as successful history`: return `{ code: 0, data: { list: [] } }`; assert `暂无观看记录` and no remote-error notice.
- `HistoryPage ignores stale remote results after timeout or refresh`: retain a resolver for the first request, trigger its timeout, update the renderer from `refreshKey: 0` to `refreshKey: 1` with a second successful response, then resolve the first request; assert only the second response appears.

- [ ] **Step 2: Run focused page tests**

Run: `bun test src/pages/pages.render.test.ts -t "HistoryPage"`

Expected: FAIL because `HistoryPage` neither reads local history nor supports independent remote status.

- [ ] **Step 3: Refactor HistoryPage state and loading effect**

Accept `refreshKey`, import `mergeRecentHistory`, and replace the blocking `error` state with:

```ts
const [videos, setVideos] = useState([]);
const [remoteStatus, setRemoteStatus] = useState('loading');
const [remoteMessage, setRemoteMessage] = useState('');
```

On every `[refreshKey]` effect run, read `storage.getCastRecentHistory()` immediately, start `getHistory(0, 0, 24)`, and use a request-local `settled` flag plus cleanup cancellation. The timeout sets `settled = true`, status `timeout`, and merged local-only videos. A successful array response uses `mergeRecentHistory`; `-101` maps to `logged-out`; all other responses and thrown errors map to `error`. Never allow a completion after timeout or cleanup to set state.

Render rules:

```tsx
const remoteUnavailable = ['logged-out', 'error', 'timeout'].includes(remoteStatus);
const hasVideos = videos.length > 0;

if (remoteStatus === 'loading' && !hasVideos) {
  return (
    <div className="loading">
      <div className="loading-spinner" />
      加载中...
    </div>
  );
}
if (remoteUnavailable && !hasVideos) {
  return (
    <div>
      <div className="page-title">最近观看</div>
      <div className="empty-state">{remoteMessage}</div>
    </div>
  );
}
return (
  <div className="content-scroll">
    <div className="section-title">最近观看</div>
    {remoteUnavailable && (
      <div className="history-notice">{remoteMessage}</div>
    )}
    {hasVideos ? (
      <VideoGrid
        videos={videos}
        group="content"
        startRow={0}
        cols={gridCols}
        onSelect={onPlayVideo}
      />
    ) : (
      <div className="empty-state">暂无观看记录</div>
    )}
  </div>
);
```

Enable default grid focus whenever loading has ended and `videos.length > 0`, even if a non-blocking remote warning exists.

- [ ] **Step 4: Run the complete page test file**

Run: `bun test src/pages/pages.render.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the page state unit**

```bash
git add src/pages/HistoryPage.tsx src/pages/pages.render.test.ts
git commit -m "feat: show merged recent history with local fallback"
```

### Task 5: Wire same-tab history refresh

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.render.test.ts`

- [ ] **Step 1: Add a failing refresh prop assertion**

In the existing comprehensive App test, select “最近观看”, capture the latest mocked `HistoryPage` props, reselect the same sidebar item, and assert:

```ts
const firstHistory = pageProps.filter((item) => item.page === 'HistoryPage').at(-1);
expect(firstHistory.props.refreshKey).toBe(0);

await interact(() =>
  sidebarItems.find((item) => item.label === '最近观看').onSelect(),
);

const refreshedHistory = pageProps
  .filter((item) => item.page === 'HistoryPage')
  .at(-1);
expect(refreshedHistory.props.refreshKey).toBe(1);
```

- [ ] **Step 2: Run the App test and confirm the prop is absent**

Run: `bun test src/App.render.test.ts -t "routes pages"`

Expected: FAIL because `HistoryPage` receives no `refreshKey`.

- [ ] **Step 3: Pass the existing refresh key**

Change the history render branch in `src/App.tsx` to:

```tsx
{page === 'history' && (
  <HistoryPage onPlayVideo={handlePlayVideo} refreshKey={refreshKey} />
)}
```

- [ ] **Step 4: Run App and HistoryPage tests**

Run: `bun test src/App.render.test.ts src/pages/pages.render.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the refresh unit**

```bash
git add src/App.tsx src/App.render.test.ts
git commit -m "fix: refresh recent history on tab reselection"
```

### Task 6: Feature and repository verification

**Files:**
- Verify only; modify implementation or tests only if a command exposes a defect.

- [ ] **Step 1: Run the focused feature suite**

Run:

```bash
bun test src/utils/storage.test.ts src/pages/history.test.ts src/player/player.render.test.ts src/pages/pages.render.test.ts src/App.render.test.ts
```

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run formatting and lint checks**

Run:

```bash
bun format
bun lint
```

Expected: both commands exit 0. If `bun format` changes files, inspect the diff and commit only formatting changes related to this feature.

- [ ] **Step 3: Run the full test suite**

Run: `bun test`

Expected: PASS with zero failed tests.

- [ ] **Step 4: Run required coverage verification**

Run: `bun run test:coverage`

Expected: PASS and overall coverage remains above 90%.

- [ ] **Step 5: Inspect the final diff and status**

Run:

```bash
git status --short
git diff --check
git log --oneline -10
```

Expected: no unintended source, dependency, lockfile, configuration, or generated-file changes; `git diff --check` exits 0.

- [ ] **Step 6: Commit any verification-only corrections**

If verification required feature-related corrections, stage only those exact files and commit:

```bash
git add src/utils/storage.ts src/utils/storage.test.ts src/pages/history.ts src/pages/history.test.ts src/player/PlayerPage.tsx src/player/player.render.test.ts src/pages/HistoryPage.tsx src/pages/pages.render.test.ts src/App.tsx src/App.render.test.ts
git commit -m "fix: complete local cast history integration"
```

If no corrections were required, do not create an empty commit.
