# React 19 And Vite Dev Proxy Design

## Summary

This change upgrades the app from React 18 to React 19 and retires the standalone `proxy/` development server. Browser development will use the Vite dev server as the only local process. The TV runtime path remains unchanged: the web app continues to prefer the Luna-backed service on device, and only browser development uses the dev proxy fallback.

## Goals

- Upgrade `react` and `react-dom` to React 19 in both the workspace root and `app/`.
- Replace the standalone browser-dev proxy process with Vite-hosted proxy handling.
- Preserve existing browser fallback behavior needed by the app, especially cookie propagation and media passthrough.
- Keep CI green, keep the current tests passing, and maintain coverage.
- Remove clearly unnecessary `useMemo` and `useCallback` usage discovered during the React 19 pass.

## Non-Goals

- No change to the TV-side Luna service architecture.
- No refactor of the production fetch flow beyond what is needed to support the new browser-dev proxy path.
- No broad hook cleanup unrelated to React 19 compatibility or obviously unnecessary memoization.

## Current State

- Root development currently starts two processes: the app dev server and `proxy/server.js`.
- The browser fallback path in `app/src/api/client.js` constructs requests against a standalone `/proxy/:host/...` HTTP server.
- `proxy/server.js` handles several response modes beyond simple JSON proxying, including cookies, text responses, compressed responses, range headers, and binary/media passthrough.

## Proposed Architecture

### Dependency Upgrade

- Update `react`, `react-dom`, and `react-test-renderer` from the React 18 line to the React 19 line where they are declared.
- Keep the existing Vite-based frontend setup and validate whether the current `@vitejs/plugin-react` and `vite` versions already satisfy the upgrade. If not, upgrade them only as far as needed for React 19 compatibility.

### Development Proxy Consolidation

- Move browser-dev proxy handling into the Vite dev server in `app/vite.config.js`.
- Preserve the existing route shape `/proxy/:host/:path*` so the app-side fallback does not need a broad API rewrite.
- Implement the dev proxy as custom middleware or a small plugin rather than relying only on `server.proxy`, because the current behavior includes custom header and response handling that likely exceeds declarative config.

### App Fetch Flow

- Keep the current fetch strategy in `app/src/api/client.js`:
  - Use Luna service calls when running on webOS with the required bridge available.
  - Fall back to HTTP proxying in browser development.
- Change only the browser fallback assumptions so it targets the Vite dev server origin instead of a separate proxy process.
- Remove or isolate any no-longer-needed standalone proxy configuration from client storage if it becomes dead code after the dev-server migration.

### Proxy Behavior To Preserve

The Vite-hosted proxy must preserve the development behaviors the app relies on today:

- Forward requests to `https://<host><path>`.
- Forward request method, body, and relevant headers.
- Surface upstream `Set-Cookie` information through the existing `X-Set-Cookie` bridge expected by the client.
- Return JSON and text responses without changing the client contract.
- Pass through binary and media responses.
- Preserve relevant range and streaming-related headers such as `Content-Range`, `Content-Length`, and `Accept-Ranges` where present.

## Code Changes

### Frontend Config

- Modify `app/vite.config.js` to register a development-only proxy handler.
- Keep existing build output behavior unchanged.

### API Client

- Update `app/src/api/client.js` so the browser fallback no longer depends on a separate proxy base URL for standard local development.
- Keep the Luna-first behavior and existing response parsing semantics intact.

### Development Scripts

- Update the root `package.json` scripts so `dev` runs only the app dev server.
- Remove the standalone `dev:proxy` flow.
- Remove documentation references that still instruct developers to run the separate proxy process for ordinary browser development.

### Proxy Retirement

- Delete `proxy/server.js` and related package wiring once the Vite-based path is verified.

### React 19 Cleanup

- Audit existing uses of `useMemo` and `useCallback`.
- Remove only the cases that are defensive or redundant.
- Keep memoization where reference stability is part of the contract or where removal would change behavior.

## Testing Strategy

### Test-First Scope

Before implementation changes, add or adjust tests around the browser fallback path so the migration is covered by failing tests first.

### Required Verification

- Run targeted tests for app API client behavior.
- Run the full test suite with `bun test`.
- Run coverage with `bun test:coverage` and confirm coverage does not regress from the current baseline.
- Run `bun --cwd app run build` to validate the upgraded frontend build.

### Risk Areas

- Cookie propagation from upstream responses to local auth storage.
- Binary and media response handling during browser development.
- React 19 compatibility with the current test and build tooling.
- Accidental removal of memoization that is behaviorally significant.

## Implementation Order

1. Add or update failing tests for the browser fallback path.
2. Introduce the Vite-hosted proxy behavior and make the client use it.
3. Remove the standalone `proxy/` flow after the new path passes tests.
4. Upgrade React-related dependencies and address any compatibility issues.
5. Remove clearly unnecessary memoization discovered during the upgrade.
6. Run full verification and coverage checks.

## Acceptance Mapping

- "No dependency on `server/` proxy service":
  Browser development will no longer require the standalone `proxy/` process; Vite becomes the only local server.
- "Remove unnecessary `useMemo` and `useCallback`":
  Hook cleanup will be targeted, not sweeping.
- "CI passes / all tests pass / coverage maintained":
  Full suite, coverage, and build verification are part of completion criteria.
