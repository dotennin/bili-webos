# WEN-48 Home Tab Default Focus Design

## Summary

When a user activates a home-area sidebar tab, the newly displayed page should default focus to the first available `VideoCard`, matching the interaction pattern already expected from the favorites experience.

## Problem

Today the focus system already sends `ArrowRight` from the sidebar to `content-0-0`, but activating a sidebar item with `Enter` only changes the page. `HomePage` currently avoids moving focus away from the sidebar after data loads if the current focus still starts with `sidebar-`, which leaves the user on the tab instead of the first video card.

This creates inconsistent behavior across:

- `推荐`
- `热门`
- `直播`
- `分区`
- `关注`
- `最近观看`
- `我的收藏`

## Goals

- Sidebar tab activation should move focus into the first video card for content pages that present video grids.
- Favorites top-level and subpage flows should keep the same default-first-card behavior unless an explicit restore target is more appropriate.
- The change should preserve existing keyboard navigation semantics for left/right movement between sidebar and content.

## Non-Goals

- Refactoring the whole focus system
- Changing search keyboard focus behavior
- Altering player-page focus handling

## Approach

Add a small shared page-level focus helper that applies a consistent "focus the first content item once content is ready" rule for grid-based pages. The helper should:

- wait until the target focusable exists
- optionally skip if the page has a stronger restore target
- avoid stealing focus when there is no content to focus

Apply this rule to the relevant page flows:

- `HomePage` after grid data loads for all home modes
- `HistoryPage` after history data loads
- `FavoritesPage` for mode/subpage transitions that should land on the first video card, while preserving subscription restoration behavior when returning from detail to list

## Data Flow

1. User activates a sidebar tab.
2. App switches the page.
3. The rendered page loads its data.
4. Once the first content card is registered, the page-level focus helper moves focus to `content-0-0` or the correct first row for that page.

## Error Handling

- If a page has no videos, no focus override runs.
- If data loading fails, existing empty/error states remain unchanged.
- If a restore target is present and valid, that target wins over the default-first-card fallback.

## Testing

- Add page render tests proving tab activation ends with focus on the first content card for home/history-style pages.
- Add favorites tests covering mode/subpage entry behavior and making sure restore flows still work.
- Keep tests deterministic by using existing focus test seams instead of global timing-sensitive assertions.
