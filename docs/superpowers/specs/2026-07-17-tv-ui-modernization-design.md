# TV UI Modernization Design

## Summary

Modernize the browsing experience with a TV-first, modern Bilibili-inspired dark visual system while preserving the existing React architecture, remote-control focus model, API behavior, storage, and playback logic. The implementation will also make the local desktop preview usable at common desktop widths, but it will not introduce a mobile-specific product experience.

## Current-State Findings

The current interface is functional and optimized around a 1920 x 1080 TV canvas, but several implementation choices limit polish and adaptability:

- `html`, `body`, the app shell, content areas, player, video, and danmaku containers use fixed 1920 x 1080 dimensions.
- `VideoGrid` scrolls by translating the grid with a fixed 420 px row estimate. Actual card height changes with column count and viewport width, so focus and visual position can drift.
- The focus color `#102e38` has insufficient contrast in several focused states, especially when it is also used as foreground or background.
- Colors, spacing, type sizes, and page layout styles are split between CSS and inline objects, which produces inconsistent hierarchy across browsing, search, settings, and login pages.
- Emoji navigation icons depend on platform fonts and therefore vary in size and appearance across webOS versions and desktop browsers.
- Browsing pages do not share a consistent page header or loading, empty, error, and unauthenticated presentation.
- Settings are presented as a flat row of buttons instead of a readable preferences structure.
- Player sizing assumes a fixed Full HD viewport even though its controls and media can use viewport-relative dimensions without changing playback behavior.

## Goals

- Preserve the remote-first, ten-foot TV experience and make focused controls immediately visible from a distance.
- Establish a cohesive modern Bilibili-inspired dark visual language.
- Improve the app shell, navigation, page hierarchy, video cards, search, settings, login, and common page states.
- Replace brittle fixed-row grid translation with natural scrolling driven by the existing focus system.
- Keep effective grid columns synchronized with focus coordinates at TV and desktop-preview widths.
- Make the application and player fill the available viewport without assuming literal 1920 x 1080 CSS pixels.
- Preserve webOS Chrome 108 compatibility and avoid dependencies or effects that create TV performance risk.

## Non-Goals

- No mobile-specific navigation, page structure, soft-keyboard behavior, touch gestures, or player controls.
- No separate TV, desktop, and mobile React component trees.
- No Bilibili API, proxy, authentication, persistence, casting, subtitle, danmaku protocol, or playback-engine changes.
- No full player-control redesign.
- No broad CSS architecture migration, CSS framework, icon package, remote font, or unrelated refactor.

## Design Direction

### Visual Character

Use a restrained modern Bilibili dark theme:

- Canvas: `#080b13`
- Base surface: `#0f1524`
- Raised surface: `#171f32`
- Primary accent: Bilibili blue `#00aeec`
- Secondary accent: Bilibili pink `#fb7299`, used sparingly for identity and destructive/account actions
- Primary text: `#f4f7fc`
- Secondary text: `#8d98b3`
- Focus highlight: light cyan around `#55d8ff`

These values will be represented as CSS custom properties alongside spacing, radius, shadow, and motion tokens. Existing hard-coded values will only be replaced in the UI areas touched by this work.

### Focus and Motion

Remote focus is the highest-priority interaction state:

- Focused cards and controls receive a high-contrast 3 px cyan outer ring, a brighter surface, and a small visual lift.
- Focus effects use transforms rather than layout-changing dimensions.
- Desktop hover uses a subtler lift and border, but it must never be confused with remote focus.
- Interaction transitions use the shared 160 ms motion token and only run on direct interaction.
- `prefers-reduced-motion` removes nonessential transforms and transitions.

## Application Shell

### TV

The TV layout keeps a complete left sidebar and a full-height main content region. The sidebar gains clearer active and focused states, consistent inline SVG icons, stronger typography, and a compact account area. The main region gains a consistent page header and natural vertical scrolling.

### Desktop Preview

Desktop browser development is supported at widths of 1024 px and above. Widths from 1024-1599 px use a compact icon rail and fewer grid columns; widths of 1600 px and above use the complete TV sidebar. This is a development and preview convenience, not a separate desktop product experience.

### Small Screens

Small-screen mobile behavior below 1024 px is explicitly outside this change. Viewport-relative shell and player sizing will remove literal Full HD dimensions, but no mobile navigation, grid-density guarantee, or touch interaction logic will be added.

## Navigation

`NAV_ITEMS` remains the single navigation configuration. Its `icon` field will use a typed icon name instead of emoji. A small local icon component will render dependency-free inline SVGs with consistent dimensions and strokes.

The active page and the currently focused item remain separate states:

- Active identifies the page currently shown.
- Focused identifies the item that will activate on Enter.
- When both apply, the item retains clear active identity inside the stronger focus treatment.

No route library will be added, and `App` will continue to own page, login, cast, and player state.

## Grid and Scrolling

### Effective Column Count

A pure layout helper will derive effective columns from the stored preference and current viewport width. The stored setting remains the user's preferred TV density and is not rewritten when a desktop window narrows.

Expected behavior:

- At widths of 1600 px and above, use the preferred 2-4 columns.
- At widths from 1200-1599 px, cap the preferred value at 3 columns.
- At widths below 1200 px, cap the preferred value at 2 columns. Widths below 1024 px remain outside the supported UI scope.
- Sanitize invalid stored values to the existing default of 3.

The same effective column count must be used for both CSS grid columns and focus row/column IDs. A small hook subscribes to viewport resize and exposes that value to all grid pages. If a resize invalidates the current grid focus ID, focus returns to the first available content item.

### Natural Scrolling

`VideoGrid` will no longer:

- force a 1080 px outer height,
- estimate rows as 420 px tall,
- translate the entire grid from `focusRow`, or
- depend on a fixed card height for positioning.

Instead, the page content region is the scroll container and the grid participates in normal document flow. Existing `applyFocus` behavior already calls `scrollIntoView({ block: 'nearest' })`, so D-pad movement continues to bring the focused item into view. Home-page near-end loading remains driven by focused row and item count, but focus-row React state used only for visual translation can be removed.

Lazy image decoding, `content-visibility`, and bounded initial API page sizes remain in place for TV performance.

## Shared Presentation Components

Use small, focused presentation boundaries rather than duplicating page markup:

- **App icon**: renders local inline SVG navigation icons.
- **Page header**: renders optional eyebrow, title, short description, and trailing account/context content.
- **Page state**: consistently presents loading, empty, error, and unauthenticated states.
- **Video grid/card**: owns natural grid layout, card hierarchy, duration, progress, metadata, focus, and hover presentation.

These components do not own fetching or navigation state. Existing pages continue to fetch and map data, then pass display-ready values to presentation components.

## Page Designs

### Browsing Pages

Recommendation, popular, live, partition, follow, history, favorites, and subscription views use the same page-header and content rhythm. Video cards use:

- a stable 16:9 thumbnail,
- duration or live status in a legible overlay,
- a consistent two-line title region,
- subdued author, play-count, and publication metadata,
- the existing progress indicator when resume data is available, and
- a prominent focus ring without changing grid geometry.

Favorites-specific tabs and subscription list/detail behavior remain intact and adopt the shared visual tokens.

### Search

Keep the TV on-screen keyboard and existing search flow. Improve the input display, key spacing, focused/action-key distinction, page hierarchy, and result transition. Physical desktop keyboard entry or mobile soft-keyboard behavior is not required by this design.

### Settings

Replace the horizontal button row and inline style objects with a vertical preferences list. Each row contains:

- a setting name,
- a short explanation,
- the current value or action,
- a clear focused state.

Logout remains destructive and visually distinct, but it uses the restrained secondary accent rather than a disconnected dark red block.

### Login

Present the QR code and instructions in a centered raised panel with a short three-step explanation. Waiting, scanned, expired, success, and error statuses keep their current behavior but use the common status palette and clearer hierarchy.

### Player

Player work is limited to necessary viewport adaptation:

- player shell and media use `100vw` and `100vh`,
- the video remains contained correctly,
- danmaku bounds use viewport-relative dimensions,
- player-control horizontal padding uses `clamp(24px, 3.125vw, 60px)`, and the player title uses `clamp(22px, 1.5vw, 28px)`.

Playback, casting, subtitles, quality selection, scrubbing, resume behavior, and control structure remain unchanged.

## Data Flow

No API or persistence data flow changes are required:

1. Existing pages fetch data through `src/api/client.ts`.
2. Pages continue mapping API records to the current display models.
3. The responsive column hook combines viewport width with `storage.getSettings().videoGridCols`.
4. Pages pass the effective column count to grids and subscription lists.
5. Grids derive focus row and column IDs from that exact value.
6. The existing focus registry handles D-pad navigation, Enter selection, and `scrollIntoView`.
7. Existing page callbacks continue opening video or live players through `App` state.

## Loading and Error Handling

Existing requests and error branches remain authoritative. The UI change only standardizes their presentation:

- Loading displays a consistent progress treatment and message.
- Empty results display a concise page-appropriate message.
- API errors display the existing error text without exposing raw layout artifacts.
- Unauthenticated account pages display a clear login-required state or the existing login flow.
- Missing thumbnails retain a lightweight surface placeholder.

No retry framework or new error state machine will be introduced in this scope.

## Compatibility and Performance

- Target the existing Chrome 108 Vite build output.
- Use CSS variables, grid, flexbox, `clamp`, and standard media queries only where supported by the target.
- Do not add web fonts or icon dependencies.
- Avoid large blur filters, continuously animated backgrounds, and unnecessary React state updates during focus movement.
- Preserve lazy-loaded images and direct DOM focus-class updates.
- Keep style and component changes localized to the affected UI paths.

## Testing and Verification

Implementation will be test-driven where behavior changes:

- Unit-test preferred-column sanitization and viewport-based effective-column calculation.
- Test that rendered grid focus IDs use the same effective columns as layout.
- Add or update render tests for local SVG icons, shared page presentation, and settings structure.
- Preserve existing focus navigation, pagination, search, favorites, history, and player regression coverage.
- Avoid timing-sensitive global event tests and mutable singleton assumptions, consistent with repository guidance.

Run the following verification:

- `bun format`
- `bun lint`
- `bun run typecheck`
- `bun run test:coverage`
- `bun run build`

Perform visual checks at:

- 1920 x 1080 for the primary TV experience,
- 1280 x 720 and a common 1366-wide desktop viewport for development preview,
- player and danmaku fullscreen sizing,
- focused sidebar, cards, search keys, settings rows, and player controls.

## Acceptance Criteria

- The TV browsing shell has a cohesive modern Bilibili-inspired dark appearance.
- Remote focus is clearly visible on every changed control and remains navigable with the existing D-pad model.
- Navigation icons are visually consistent and do not depend on emoji rendering.
- Browsing grids scroll naturally without fixed row-height translation.
- Grid visual columns and focus coordinates remain synchronized at supported TV and desktop-preview widths.
- Search, settings, login, history, favorites, and common states share consistent hierarchy and styling.
- The player fills the viewport without changing playback behavior.
- No mobile-specific UI, API change, new runtime dependency, or unrelated refactor is introduced.
- Formatting, linting, type checking, coverage, build, and targeted visual checks pass.
