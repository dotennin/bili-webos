# TV UI Modernization Implementation Plan

**Design:** `docs/superpowers/specs/2026-07-17-tv-ui-modernization-design.md`

## Objective

Deliver the approved TV-first UI modernization without changing Bilibili APIs, persistence, playback behavior, or the zero-render D-pad focus architecture. Keep the implementation dependency-free, compatible with Chrome 108, and covered above the repository's 90% threshold.

## Delivery Strategy

Implement in three ordered phases:

1. **Foundation:** tested layout calculation, design tokens, icons, shared presentation components, and viewport-relative app shell.
2. **Browsing experience:** natural grid scrolling, synchronized responsive columns/focus coordinates, page hierarchy, cards, settings, and login.
3. **Player and verification:** viewport-relative player/danmaku sizing, desktop preview polish, complete regression and visual checks.

Each phase must remain buildable and testable. Do not mix API or playback refactors into these changes.

---

## Phase 1: Visual and Layout Foundation

### Task 1: Add a pure effective-column helper

**Files:**

- Create `src/utils/layout.ts`
- Create `src/utils/layout.test.ts`

**Test first:**

Add table-driven tests for `resolveVideoGridCols(preferredCols, viewportWidth)`:

- valid preferences are 2, 3, and 4;
- invalid, missing, or non-numeric preferences normalize to 3;
- width `>= 1600` returns the normalized preference;
- width `1200-1599` caps the result at 3;
- width `< 1200` caps the result at 2;
- boundary values 1199, 1200, 1599, and 1600 are explicit.

Run:

```bash
bun test src/utils/layout.test.ts
```

Confirm the new tests fail because the helper does not exist.

**Implement:**

Create a dependency-free exported pure function. Do not read `window` or storage from the helper.

**Verify:**

```bash
bun test src/utils/layout.test.ts
```

Expected: the layout tests pass without global DOM mutation.

### Task 2: Add the responsive column hook

**Files:**

- Create `src/hooks/useResponsiveGridCols.ts`
- Update `src/utils/layout.test.ts` only if helper coverage needs additional cases

**Implement:**

- Read the initial preferred count from `storage.getSettings().videoGridCols`.
- Initialize viewport width from `window.innerWidth`, with 1920 as the non-browser fallback.
- Subscribe to `resize`, update width, and clean up the listener.
- Return the pure helper's effective count.
- Keep the stored preference unchanged when the viewport narrows.
- Do not add timing-sensitive global event-dispatch tests. Test calculation through the pure helper and cover hook consumption through page render tests.

**Verify:**

```bash
bun run typecheck
bun test src/utils/layout.test.ts
```

Expected: the hook type-checks and the pure behavior remains fully covered.

### Task 3: Add dependency-free navigation icons

**Files:**

- Create `src/components/AppIcon.tsx`
- Update `src/components/components.render.test.ts`

**Test first:**

Add render assertions that:

- every supported icon name renders an `svg` with `viewBox="0 0 24 24"`;
- SVG color uses `currentColor`;
- no emoji text appears;
- optional `className` is preserved.

Supported icon names:

- `home`
- `hot`
- `live`
- `partition`
- `follow`
- `history`
- `favorites`
- `search`
- `settings`

Run:

```bash
bun test src/components/components.render.test.ts
```

Confirm the icon tests fail.

**Implement:**

- Export the icon-name type.
- Render small inline SVG path definitions with consistent stroke width and dimensions.
- Do not add an icon package.

**Verify:**

```bash
bun test src/components/components.render.test.ts
```

### Task 4: Add shared `PageHeader` and `PageState` components

**Files:**

- Create `src/components/PageHeader.tsx`
- Create `src/components/PageState.tsx`
- Update `src/components/components.render.test.ts`

**Test first:**

For `PageHeader`, cover:

- required title;
- optional eyebrow and description;
- optional trailing child content.

For `PageState`, cover:

- `loading`, including the spinner;
- `empty`;
- `error`;
- `unauthenticated`;
- custom messages and optional title.

Run the component render test and confirm failure.

**Implement:**

Keep both components presentational. They must not fetch data, inspect auth, or own navigation state.

**Verify:**

```bash
bun test src/components/components.render.test.ts
```

### Task 5: Establish UI design tokens and focus treatment

**Files:**

- Update `src/styles.css`

**Implement:**

Consolidate the existing root declarations and add custom properties for:

- canvas `#080b13`;
- base surface `#0f1524`;
- raised surface `#171f32`;
- primary accent `#00aeec`;
- secondary accent `#fb7299`;
- primary text `#f4f7fc`;
- secondary text `#8d98b3`;
- focus ring `#55d8ff`;
- shared 160 ms motion;
- card/tab radii and focus shadow.

Update changed focus states to use a high-contrast cyan ring and raised surface:

- `.sidebar-item.focused`;
- `.video-card.focused`;
- `.subscription-card.focused`;
- `.osk-key.focused`;
- `.tab-focus-unified.focused`;
- `.detail-btn.focused` or its replacement;
- `.quality-option.focused`;
- `.player-btn.focused`;
- `.search-input.focused`.

Add `prefers-reduced-motion` handling for nonessential transforms and transitions. Preserve selector names needed by the direct DOM focus system.

**Verify:**

```bash
bun run build
```

Expected: CSS compiles and no focus selector was renamed.

### Task 6: Replace sidebar emoji with `AppIcon`

**Files:**

- Update `src/App.tsx`
- Update `src/components/SidebarItem.tsx`
- Update `src/components/components.render.test.ts`
- Update `src/styles.css`

**Test first:**

Update sidebar rendering tests to expect an SVG icon and unchanged label/active semantics. Run the focused component and app render tests and confirm the old emoji expectations fail.

**Implement:**

- Change `NavItem.icon` to the exported icon-name type.
- Replace emoji values in `NAV_ITEMS` with typed names.
- Render `<AppIcon>` inside `SidebarItem`.
- Style active and focused states independently.
- Keep all existing sidebar focus IDs and row/column registration unchanged.

**Verify:**

```bash
bun test src/components/components.render.test.ts src/App.render.test.ts
```

### Task 7: Make the app shell viewport-relative

**Files:**

- Update `src/styles.css`
- Update only the login-overlay sizing in `src/App.tsx`

**Implement:**

- Replace fixed Full HD sizes on `html`, `body`, `#root`, `.app-container`, `.sidebar`, `.main-content`, and `.content-scroll` with viewport-relative sizing.
- Keep supported desktop preview at 1024 px and above.
- Add a 1024-1599 px icon-rail media query that hides sidebar labels but preserves the same DOM and focus registry.
- Keep the full sidebar at 1600 px and above.
- Replace the App login overlay's fixed dimensions with viewport dimensions.
- Do not change player sizing in this phase.

**Verify:**

```bash
bun run typecheck
bun test src/App.render.test.ts src/components/components.render.test.ts
bun run build
```

**Phase 1 gate:**

```bash
bun run test:coverage
```

Expected: all tests pass and coverage remains above 90%.

---

## Phase 2: Browsing, Grid, and Page Experience

### Task 8: Refactor `VideoGrid` to natural document flow

**Files:**

- Update `src/components/VideoGrid.tsx`
- Update `src/components/components.render.test.ts`
- Update `src/styles.css`

**Test first:**

Update grid render tests to assert:

- empty input still renders the existing empty state;
- cards retain IDs derived from the provided column count;
- the grid uses the `.video-grid` class;
- no fixed-height transform wrapper or `translateY` style is rendered.

Run the component tests and confirm failure against the old structure.

**Implement:**

- Remove the `focusRow` prop.
- Remove `ROW_HEIGHT`, `scrollY`, the fixed 1080 px wrapper, and translated inner wrapper.
- Render one natural-flow grid using the existing `cols` prop.
- Keep row/column calculations and stable video keys.
- Let the page scroll container and existing `applyFocus().scrollIntoView()` manage visibility.

**Verify:**

```bash
bun test src/components/components.render.test.ts
```

### Task 9: Remove HomePage's visual focus-row state

**Files:**

- Update `src/pages/HomePage.tsx`
- Update `src/pages/HomePage.test.ts`
- Update `src/pages/HomePage.render.test.ts`

**Test first:**

Preserve tests proving:

- the first grid item receives scheduled default focus after loading;
- focusing near the final rows still loads the next page;
- duplicate API items remain filtered;
- the rendered grid receives the effective column count;
- no `focusRow` prop is required.

**Implement:**

- Replace the stored raw grid count with `useResponsiveGridCols()`.
- Remove `focusRow` state and `setFocusRow` calls.
- Keep the focus listener only for near-end pagination.
- Pass effective columns to `VideoGrid`.

**Verify:**

```bash
bun test src/pages/HomePage.test.ts src/pages/HomePage.render.test.ts
```

### Task 10: Integrate effective columns across all grid pages

**Files:**

- Update `src/pages/SearchPage.tsx`
- Update `src/pages/HistoryPage.tsx`
- Update `src/pages/FavoritesPage.tsx`
- Update `src/pages/pages.render.test.ts`

**Test first:**

Add or adjust render tests so each page passes the effective count to its grid/list. For Favorites, verify subscription focus IDs use the same effective count as visual columns.

**Implement:**

- Replace direct one-time storage reads with `useResponsiveGridCols()`.
- Use the effective count for `VideoGrid`, `SubscriptionList`, `getSubscriptionFocusId`, restore-focus checks, and pagination row calculations.
- When effective columns change, reuse the existing scheduled-focus seam to move focus to the first valid content item rather than adding timing-sensitive global event tests.
- Preserve Favorites custom key handling and view transitions.

**Verify:**

```bash
bun test src/pages/pages.render.test.ts src/pages/SearchPage.test.ts
```

### Task 11: Modernize `VideoCard` and subscription-card presentation

**Files:**

- Update `src/components/VideoCard.tsx`
- Update `src/components/SubscriptionList.tsx` only if class structure is needed
- Update `src/components/components.render.test.ts`
- Update `src/styles.css`

**Test first:**

Cover stable rendering of:

- two-line title structure;
- duration badge;
- progress track/fill classes instead of inline positioning styles;
- author/play/time metadata;
- missing-thumbnail placeholder surface.

**Implement:**

- Move progress-bar inline styles into semantic classes and preserve computed width as the only dynamic style.
- Keep 16:9 media and lazy image behavior.
- Apply the approved surfaces, typography, metadata hierarchy, radius, hover, and focus treatment.
- Keep `content-visibility` and direct focus classes.

**Verify:**

```bash
bun test src/components/components.render.test.ts
bun run build
```

### Task 12: Apply shared headers and states to browsing pages

**Files:**

- Update `src/pages/HomePage.tsx`
- Update `src/pages/SearchPage.tsx`
- Update `src/pages/HistoryPage.tsx`
- Update `src/pages/FavoritesPage.tsx`
- Update `src/pages/pages.render.test.ts`
- Update `src/styles.css`

**Test first:**

Keep existing text assertions and add structural coverage for shared headers/states. Cover loading, empty, error, and unauthenticated variants without dispatching global window events.

**Implement:**

- Add mode-specific HomePage title/eyebrow/description mapping without changing fetch selection.
- Replace ad hoc title/loading/empty/error wrappers with `PageHeader` and `PageState`.
- Preserve Favorites tabs, folder switching, subscription list/detail, and existing focus IDs.
- Ensure the page scroll region, header, tabs, and grid form one natural document flow.

**Verify:**

```bash
bun test src/pages/pages.render.test.ts src/pages/HomePage.render.test.ts src/pages/SearchPage.test.ts
```

### Task 13: Redesign SettingsPage as a vertical preference list

**Files:**

- Update `src/pages/SettingsPage.tsx`
- Update `src/pages/pages.render.test.ts`
- Update `src/styles.css`

**Test first:**

Update tests to require:

- a shared page header;
- name, description, and current value for each setting;
- vertical focus coordinates `content-0-0`, `content-1-0`, and `content-2-0`;
- existing danmaku toggle, grid cycle, persistence, and logout callbacks.

**Implement:**

- Remove layout and color inline styles.
- Render three semantic preference rows.
- Use the secondary pink token for the logout action.
- Preserve storage behavior exactly.

**Verify:**

```bash
bun test src/pages/pages.render.test.ts
```

### Task 14: Redesign LoginPage presentation

**Files:**

- Update `src/pages/LoginPage.tsx`
- Update `src/pages/pages.render.test.ts`
- Update `src/styles.css`

**Test first:**

Preserve polling/QR tests and add assertions for:

- the raised login panel;
- three non-emoji instruction steps;
- waiting, scanned, expired, success, and error status text.

**Implement:**

- Keep QR generation, polling timers, auth persistence, and callbacks unchanged.
- Replace the flat layout and status emoji with styled semantic markup.
- Use approved visual tokens and a centered raised panel.

**Verify:**

```bash
bun test src/pages/pages.render.test.ts
```

**Phase 2 gate:**

```bash
bun run typecheck
bun run test:coverage
bun run build
```

Expected: browsing behavior, pagination, custom Favorites navigation, and coverage all pass.

---

## Phase 3: Player Adaptation and Final Verification

### Task 15: Make player and danmaku dimensions viewport-relative

**Files:**

- Update `src/styles.css`
- Update `src/player/PlayerPage.tsx` only where fixed inline dimensions remain
- Update `src/player/LivePlayerPage.tsx` only where fixed inline dimensions remain
- Update `src/player/player.render.test.ts` if changed markup requires it

**Test first:**

Preserve player render tests for controls, subtitles, quality selection, and back behavior. Add structural assertions only if fixed sizing moves from inline markup to classes.

**Implement:**

- `.player-page` and `.player-video`: `100vw` x `100vh`.
- `.danmaku-container`: `100vw` x `75vh`.
- Danmaku animation starts at `translateX(100vw)`.
- Player control horizontal padding: `clamp(24px, 3.125vw, 60px)`.
- Player title: `clamp(22px, 1.5vw, 28px)`.
- Preserve media containment, overlay z-indexes, subtitle placement, progress math, quality logic, cast behavior, and playback engines.

**Verify:**

```bash
bun test src/player/PlayerPage.test.ts src/player/LivePlayerPage.test.ts src/player/player.render.test.ts
bun run build
```

### Task 16: Complete old-style cleanup without broad refactoring

**Files:**

- Update only already-touched files

**Checks:**

- No `#102e38` remains in changed focus styles.
- Navigation configuration contains no emoji.
- Touched page layout styles no longer use avoidable inline color/spacing objects.
- `prefers-reduced-motion` covers card, sidebar, tab, key, and player-button transforms.
- No new runtime dependency appears in `package.json` or `bun.lock`.

Run searches using repository tools before editing any remaining occurrence. Do not refactor unrelated player or service code.

### Task 17: Full automated verification

Run in order:

```bash
bun format
bun lint
bun run typecheck
bun run test:coverage
bun run build
```

Expected:

- formatting passes;
- lint passes;
- all TypeScript projects pass;
- tests pass with overall coverage above 90%;
- production build succeeds.

### Task 18: Visual acceptance checks

Start the Vite development server and inspect:

- 1920 x 1080: full sidebar, 2-4 stored columns, focus ring, natural scrolling, search, settings, login, Favorites tabs, player, subtitles, and danmaku;
- 1366 x 768: compact sidebar and three-column cap;
- 1280 x 720: compact sidebar and three-column cap;
- 1024-wide preview: compact sidebar and two-column cap.

Exercise D-pad/keyboard movement:

- sidebar to first content item and back;
- vertical grid navigation across several natural-scroll rows;
- near-end pagination;
- Favorites mode/list/detail restoration;
- search keyboard;
- settings rows;
- player controls and back navigation.

Capture before/after screenshots for the primary 1920 x 1080 browsing and settings/login views if the environment allows it.

## High-Risk Regression Checklist

- `useFocus.ts` selector names and direct DOM class manipulation remain unchanged.
- Effective grid columns and focus row/column IDs always use one value.
- Natural scrolling relies on the existing `scrollIntoView({ block: 'nearest' })` call.
- Home pagination remains focus-driven after `focusRow` state removal.
- Favorites subscription focus restoration uses effective columns.
- Resize focus restoration uses an existing explicit scheduling seam, not shared global test dispatch.
- Player work remains sizing-only; no stream selection, cast, subtitle, scrub, resume, or quality logic changes.
- No mobile-specific component or interaction path is introduced.

## Completion Criteria

The implementation is complete only when all acceptance criteria in the design spec are satisfied, all automated verification passes, coverage remains above 90%, and TV/desktop-preview visual checks confirm that focus and scrolling remain usable.
