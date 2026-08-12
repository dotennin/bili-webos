# Native webOS Playback Speed Implementation Plan

## Scope

Implement the approved design in `docs/superpowers/specs/2026-08-10-player-playback-speed-native-design.md`.
Only touch the API client, on-demand player, related tests, and the plan/spec
documents. Do not change the live player or background service.

## Implementation steps

1. **Add the HTML5 playurl API**
   - Add `getHtml5PlayUrl` beside `getPlayUrl` in `src/api/client.ts`.
   - Preserve string, `bvid`, and `aid` identifier handling.
   - Request `platform=html5`, `high_quality=1`, `qn=80`, and the current cid
     through the existing WBI/smart-fetch path.
   - Add focused API tests for the query and identifier variants.

2. **Add the webOS native-speed path**
   - Keep the existing speed popup/options and browser playback-rate behavior.
   - Add native-mode and operation-token refs to `src/player/PlayerPage.tsx`.
   - Add bounded media-id polling and a Promise wrapper around
     `luna://com.webos.media` `setPlayRate`.
   - For non-`1x` TV speeds, save position, unload Shaka, load the proxied durl,
     resume playback, wait for media id, and apply the requested rate.
   - For `1x`, invalidate pending native operations and reuse
     `changeQuality(currentQuality)` to load DASH and restore position.
   - Reassert native speed after `canplay` and `seeked`; reset native mode and
     speed on every new video.
   - Prevent quality changes while the fixed-quality durl is active.
   - Remove the packaged-webOS unsupported-speed branch; the speed control is
     available on TV and browser runtimes.

3. **Update render coverage**
   - Extend the existing Shaka/video/API mocks with durl, unload, media-id,
     and Luna request seams.
   - Replace the unsupported-TV test with non-`1x` native switching coverage.
   - Cover returning to 1x, position preservation, rate reassertion, quality
     blocking, and per-video reset while retaining browser speed tests.
   - Update source-extracted helper expectations in `PlayerPage.test.ts`.

4. **Validate narrowly, then broadly**
   - Run focused player and API tests.
   - Run TypeScript checking and lint/format checks for touched code.
   - Run the full test/coverage suite required by the repository before claiming
     completion; inspect `git diff` and `git status`.

## Key decisions

- Use `qn=80`, matching the referenced implementation's bounded HTML5 durl
  request while leaving the existing DASH quality untouched.
- Reuse `changeQuality(currentQuality)` for the 1x transition rather than
  creating a second DASH-loading implementation.
- Treat missing durl/media id/Luna failure as a recoverable transition failure;
  never leave the control label claiming an unapplied rate.
