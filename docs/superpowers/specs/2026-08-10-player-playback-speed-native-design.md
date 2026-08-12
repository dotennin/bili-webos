# Native webOS Player Playback Speed Design

## Summary

Extend the existing on-demand playback-speed control so packaged webOS TV builds
support true speed changes, following the referenced implementation. Browser
development continues to use the HTML media element's playback-rate API.

## Goals

- Keep the existing speed popup, remote navigation, and default `1x` behavior.
- Support `0.25x` through `2x` in browser development with
  `video.playbackRate`.
- Support non-`1x` playback on webOS by switching from Shaka DASH to Bilibili's
  single-file HTML5 MP4 stream and calling
  `luna://com.webos.media` `setPlayRate` with audio enabled.
- Return to the current DASH quality and playback position when selecting `1x`.
- Reset speed to `1x` for every newly loaded video; do not persist it.

## Non-goals

- No playback-speed changes to `LivePlayerPage`.
- No new background-service Luna method; the media system service is called
  directly from the player.
- No quality-selection behavior changes outside the native-speed mode guard.

## Architecture and data flow

1. Add `getHtml5PlayUrl(video, cid)` to `src/api/client.ts`. It requests
   `/x/player/playurl` with `platform=html5`, `high_quality=1`, and a bounded
   quality request, using the existing smart-fetch routing.
2. Keep the existing speed state and popup in `PlayerPage`. Add a native-mode
   ref and a speed-operation ref/token so stale asynchronous operations cannot
   replace a newer video or speed choice.
3. On browser runtimes, apply the selected rate to both
   `defaultPlaybackRate` and `playbackRate`.
4. On webOS, selecting a non-`1x` rate saves `currentTime`, unloads Shaka,
   assigns the proxied HTML5 durl to the video element, resumes at the saved
   position, waits for `mediaId`, and invokes `setPlayRate` with
   `{ mediaId, playRate, audioOutput: true }`.
5. On webOS, selecting `1x` reloads the DASH manifest through the existing
   quality-loading path, restores the saved position, and resumes playback.
   `canplay` and `seeked` reassert the Luna rate while native mode is active.
6. Quality changes are blocked while native speed mode is active because the
   HTML5 durl has a fixed quality. The existing quality control remains usable
   after returning to `1x`.

## Failure handling

- Missing durl, missing `mediaId`, Luna failure, or manifest reload failure is
  caught and logged without throwing through React event handlers.
- A failed speed transition does not leave the UI claiming the requested rate;
  the player stays or returns to the last known playable mode and rate.
- Loading a new video clears native mode and resets speed before requesting its
  DASH source.

## Testing

- Extend `src/player/player.render.test.ts` to cover:
  - opening the existing speed popup and applying a browser rate;
  - TV non-`1x` HTML5 URL loading and Luna `setPlayRate` parameters;
  - returning to `1x`, reloading DASH, and preserving position;
  - replacing the old packaged-webOS “unsupported” expectation with the
    supported native path.
- Extend `src/api/client.test.ts` for the HTML5 playurl request parameters and
  video identifier handling.
- Run the focused player/API tests and the TypeScript check after implementation.

## Acceptance criteria

- Browser speed selection still updates the video rate and control label.
- A packaged webOS player can select a non-`1x` speed with audio and remains at
  that speed after seek/canplay events.
- Selecting `1x` returns to DASH without losing the playback position.
- Changing videos starts at `1x` and no speed setting is written to storage.
- Existing quality, subtitle, danmaku, seek, and live-player tests remain green.
