import type { StoryboardTile } from '../api/client';

export type StoryboardFrame = {
  spriteUrl: string;
  spriteW: number;
  spriteH: number;
  tileW: number;
  tileH: number;
  bgX: number;
  bgY: number;
};

export function getStoryboardFrame(
  storyboard: StoryboardTile | null | undefined,
  timeSec: number,
  durationSec: number,
): StoryboardFrame | null {
  if (!storyboard) return null;
  if (durationSec <= 0 || timeSec < 0) return null;
  if (
    storyboard.cols <= 0 ||
    storyboard.rows <= 0 ||
    storyboard.tileW <= 0 ||
    storyboard.tileH <= 0 ||
    storyboard.interval <= 0 ||
    !storyboard.imageUrls.length
  ) {
    return null;
  }

  const tilesPerSprite = storyboard.cols * storyboard.rows;
  const maxAvailableFrames = storyboard.imageUrls.length * tilesPerSprite;
  const durationFrames = Math.ceil(durationSec / storyboard.interval);
  const totalFrames = Math.min(maxAvailableFrames, durationFrames);

  if (totalFrames <= 0) return null;

  const frameIndex = Math.min(
    Math.max(0, Math.floor(timeSec / storyboard.interval)),
    Math.max(0, totalFrames - 1),
  );

  const spriteIdx = Math.floor(frameIndex / tilesPerSprite);
  const localIdx = frameIndex % tilesPerSprite;
  const col = localIdx % storyboard.cols;
  const row = Math.floor(localIdx / storyboard.cols);

  const spriteUrl = storyboard.imageUrls[spriteIdx];
  if (!spriteUrl) return null;

  return {
    spriteUrl,
    spriteW: storyboard.cols * storyboard.tileW,
    spriteH: storyboard.rows * storyboard.tileH,
    tileW: storyboard.tileW,
    tileH: storyboard.tileH,
    bgX: -col * storyboard.tileW || 0,
    bgY: -row * storyboard.tileH || 0,
  };
}
