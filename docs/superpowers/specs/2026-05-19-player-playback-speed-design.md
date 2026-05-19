# Player Playback Speed Design

## Summary

Add a playback speed option to the on-demand player control overlay in `src/player/PlayerPage.tsx`.

## Goals

- Let users open a popup from the existing player controls and select a playback speed.
- Apply the selected speed immediately to the native HTML video element.
- Keep the default speed at `1x`.
- Preserve the existing remote-control navigation model and quality popup behavior.

## UX

- Add a fourth control button after `quality` named `speed`.
- The button label shows the active speed value: `0.25x`, `0.5x`, `0.75x`, `1x`, `1.25x`, `1.5x`, `2x`.
- Pressing `Enter` on the `speed` control opens a popup panel similar to the quality panel.
- The popup contains these options in ascending order:
  - `2x`
  - `1.5x`
  - `1.25x`
  - `1x`
  - `0.75x`
  - `0.5x`
  - `0.25x`
- Default selection and active value are `1x`.
- Selecting an option:
  - sets `videoRef.current.playbackRate`
  - updates the control button label
  - closes the speed popup
  - returns focus to the `speed` control button

## Navigation

- Left/right navigation in the controls row expands from 3 items to 4 items.
- The speed popup uses up/down navigation like the quality popup.
- `Back` closes the popup the same way existing overlay panels close.
- Auto-hide behavior should also close the speed popup together with the controls overlay.

## Non-goals

- No persistence across sessions.
- No changes to live playback.
- No merged settings panel for quality and speed.

## Testing

- Extend `src/player/player.render.test.ts` with a failing test that verifies:
  - the speed popup can be opened from the controls row
  - selecting a speed updates `video.playbackRate`
  - the controls row reflects the selected speed label
  - focus returns to the speed control after selection
