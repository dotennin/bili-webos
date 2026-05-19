# Player Playback Speed Implementation Plan

## File map

- `src/player/PlayerPage.tsx`
  - Add playback speed state, speed options, popup visibility, remote navigation handling, and application to `videoRef.current.playbackRate`.
- `src/player/player.render.test.ts`
  - Add render coverage for opening the speed popup and applying a selected playback rate.
- `docs/superpowers/specs/2026-05-19-player-playback-speed-design.md`
  - Approved design reference.

## Steps

1. Add a failing render test in `src/player/player.render.test.ts` for the speed popup flow.
2. Run the focused player render test file and confirm the new test fails for the expected reason.
3. Update `src/player/PlayerPage.tsx` to add:
   - speed options constant
   - playback speed state initialized to `1`
   - speed control entry
   - speed popup rendering and focus handling
   - playback rate assignment on selection
4. Re-run the focused player render tests until green.
5. Run `bun format`, then the focused player tests again.
