import { describe, expect, test } from 'bun:test';
import { getStoryboardFrame } from './storyboard';
import type { StoryboardTile } from '../api/client';

const makeTile = (overrides?: Partial<StoryboardTile>): StoryboardTile => ({
  imageUrls: ['sprite1.jpg', 'sprite2.jpg'],
  cols: 10,
  rows: 10,
  tileW: 160,
  tileH: 90,
  interval: 60,
  ...overrides,
});

describe('getStoryboardFrame', () => {
  test('returns null for null storyboard', () => {
    expect(getStoryboardFrame(null, 0, 300)).toBeNull();
  });

  test('returns null for undefined storyboard', () => {
    expect(getStoryboardFrame(undefined, 0, 300)).toBeNull();
  });

  test('returns null for durationSec <= 0', () => {
    expect(getStoryboardFrame(makeTile(), 0, 0)).toBeNull();
    expect(getStoryboardFrame(makeTile(), 0, -1)).toBeNull();
  });

  test('returns null for negative timeSec', () => {
    expect(getStoryboardFrame(makeTile(), -1, 300)).toBeNull();
  });

  test('returns null for invalid storyboard data (cols <= 0)', () => {
    expect(getStoryboardFrame(makeTile({ cols: 0 }), 0, 300)).toBeNull();
  });

  test('returns null for empty imageUrls', () => {
    expect(
      getStoryboardFrame(makeTile({ imageUrls: [] }), 0, 300),
    ).toBeNull();
  });

  test('first frame at timeSec=0: bg at origin', () => {
    const frame = getStoryboardFrame(makeTile(), 0, 300);
    expect(frame).not.toBeNull();
    expect(frame!.bgX).toBe(0);
    expect(frame!.bgY).toBe(0);
    expect(frame!.spriteW).toBe(1600);
    expect(frame!.spriteH).toBe(900);
    expect(frame!.tileW).toBe(160);
    expect(frame!.tileH).toBe(90);
  });

  test('frame index: timeSec=65 interval=60 => frameIndex=1', () => {
    const frame = getStoryboardFrame(makeTile(), 65, 300);
    expect(frame).not.toBeNull();
    expect(frame!.bgX).toBe(-160);
    expect(frame!.bgY).toBe(0);
    expect(frame!.spriteUrl).toBe('sprite1.jpg');
  });

  test('cross-sprite: interval=1 timeSec=101 => sprite 2 localIdx 1', () => {
    const tile = makeTile({ cols: 10, rows: 10, interval: 1 });
    const frame = getStoryboardFrame(tile, 101, 200);
    expect(frame).not.toBeNull();
    expect(frame!.spriteUrl).toBe('sprite2.jpg');
    expect(frame!.bgX).toBe(-160);
    expect(frame!.bgY).toBe(0);
  });

  test('clamps to last available frame when timeSec exceeds duration', () => {
    const tile = makeTile({
      cols: 10,
      rows: 10,
      interval: 60,
      imageUrls: ['sprite1.jpg'],
    });
    // 300s / 60 = 5 frames, max available = 1*100 = 100, total = min(100, 5) = 5
    // frameIndex = min(166, 4) = 4 => col=4 row=0
    const frame = getStoryboardFrame(tile, 10000, 300);
    expect(frame).not.toBeNull();
    expect(frame!.bgX).toBe(-640);
    expect(frame!.bgY).toBe(0);
  });

  test('uses correct spriteUrl from imageUrls array', () => {
    const tile = makeTile({
      imageUrls: ['a.jpg', 'b.jpg'],
      cols: 4,
      rows: 4,
      interval: 1,
    });
    // frameIndex=16 => spriteIdx = 16/16 = 1, localIdx = 0
    const frame = getStoryboardFrame(tile, 16, 100);
    expect(frame).not.toBeNull();
    expect(frame!.spriteUrl).toBe('b.jpg');
  });

  test('clamps totalFrames to maxAvailableFrames when durationFrames exceeds sprite capacity', () => {
    const tile = makeTile({
      imageUrls: ['only-one-sprite.jpg'],
      cols: 2,
      rows: 2,
      interval: 10,
    });
    // maxAvailableFrames = 1 * 4 = 4, durationFrames = ceil(1000/10) = 100
    // totalFrames = min(4, 100) = 4
    // frameIndex = min(50, 3) = 3 (last frame of sprite 0)
    const frame = getStoryboardFrame(tile, 500, 1000);
    expect(frame).not.toBeNull();
    expect(frame!.spriteUrl).toBe('only-one-sprite.jpg');
    // totalFrames = 4, frameIndex = min(50, 3) = 3
    // spriteIdx = 0, localIdx = 3, col = 3%2 = 1, row = floor(3/2) = 1
    expect(frame!.bgX).toBe(-160);
    expect(frame!.bgY).toBe(-90);
  });
});
