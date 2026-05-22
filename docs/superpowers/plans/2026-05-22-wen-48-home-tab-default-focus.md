# WEN-48 Home Tab Default Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sidebar tab activation consistently focus the first available video card across home-style pages and favorites flows.

**Architecture:** Introduce a small shared page-focus helper instead of duplicating delayed `setFocus` calls inside each page. Pages with grid content invoke that helper after data becomes ready, while favorites retains explicit restore behavior where it already has stronger navigation semantics.

**Tech Stack:** React, TypeScript, Bun test runner, existing custom focus registry in `src/hooks/useFocus.ts`

---

### Task 1: Lock the regression with render tests

**Files:**
- Modify: `src/pages/pages.render.test.ts`
- Modify: `src/pages/HomePage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('HomePage moves focus to the first content card after mode data loads', async () => {
  setCurrentFocusForTest('sidebar-1-0');

  renderHomePage({ mode: 'hot' });
  await flushPageEffects();

  expect(getCurrentFocusId()).toBe('content-0-0');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/pages/HomePage.test.ts src/pages/pages.render.test.ts`
Expected: FAIL because the current page logic preserves sidebar focus instead of moving to the first card.

- [ ] **Step 3: Add a favorites coverage case for first-card default focus**

```ts
test('FavoritesPage defaults to the first video card when entering a video grid view', async () => {
  renderFavoritesPage();
  await flushPageEffects();

  expect(getCurrentFocusId()).toBe('content-1-0');
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun test src/pages/pages.render.test.ts`
Expected: FAIL because favorites mode transitions do not yet share one consistent first-card default-focus rule.

- [ ] **Step 5: Commit**

```bash
git add src/pages/HomePage.test.ts src/pages/pages.render.test.ts
git commit -m "test: cover default focus for home tab pages"
```

### Task 2: Add a shared helper for default-first-card focus

**Files:**
- Create: `src/pages/pageFocus.ts`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/pages/HistoryPage.tsx`
- Modify: `src/pages/FavoritesPage.tsx`

- [ ] **Step 1: Write the failing test for the helper behavior**

```ts
test('focusFirstContentCard waits for a registered target before focusing', async () => {
  const cleanup = focusFirstContentCard({
    targetId: 'content-0-0',
    enabled: true,
  });

  expect(getCurrentFocusId()).not.toBe('content-0-0');
  registerFocusable('content-0-0', { row: 0, col: 0, group: 'content' });
  await flushTimers();

  expect(getCurrentFocusId()).toBe('content-0-0');
  cleanup();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/pages/HomePage.test.ts`
Expected: FAIL because `focusFirstContentCard` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function focusFirstContentCard({
  enabled,
  targetId,
}: {
  enabled: boolean;
  targetId: string;
}) {
  if (!enabled) return () => {};

  const timer = window.setTimeout(() => {
    setFocus(targetId);
  }, 0);

  return () => window.clearTimeout(timer);
}
```

- [ ] **Step 4: Apply the helper to page entry points**

```ts
useEffect(() => {
  return focusFirstContentCard({
    enabled: videos.length > 0 && !loading,
    targetId: 'content-0-0',
  });
}, [videos.length, loading]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/pages/HomePage.test.ts src/pages/pages.render.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/pageFocus.ts src/pages/HomePage.tsx src/pages/HistoryPage.tsx src/pages/FavoritesPage.tsx src/pages/HomePage.test.ts src/pages/pages.render.test.ts
git commit -m "fix: default focus to first video after tab selection"
```

### Task 3: Verify no navigation regressions

**Files:**
- Modify: `src/hooks/useFocus.test.ts`

- [ ] **Step 1: Write the failing regression test**

```ts
test('sidebar right navigation still lands on the first content item', () => {
  initKeyboardNav();
  registerFocusable('sidebar-0-0', { row: 0, col: 0, group: 'sidebar' });
  registerFocusable('content-0-0', { row: 0, col: 0, group: 'content' });
  setFocus('sidebar-0-0');

  pressArrowRight();

  expect(getCurrentFocusId()).toBe('content-0-0');
});
```

- [ ] **Step 2: Run test to verify it fails or guards behavior**

Run: `bun test src/hooks/useFocus.test.ts`
Expected: PASS if already covered, otherwise add the test and confirm the intended behavior explicitly.

- [ ] **Step 3: Run focused verification**

Run: `bun test src/hooks/useFocus.test.ts src/pages/HomePage.test.ts src/pages/pages.render.test.ts`
Expected: PASS

- [ ] **Step 4: Run formatting and lint verification**

Run: `bun format && bun lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFocus.test.ts
git commit -m "test: protect sidebar to content focus navigation"
```
