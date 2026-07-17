import { describe, expect, test } from 'bun:test';
import { resolveVideoGridCols } from './layout';

describe('resolveVideoGridCols', () => {
  test.each([
    [2, 1920, 2],
    [3, 1920, 3],
    [4, 1920, 4],
    [4, 1600, 4],
    [4, 1599, 3],
    [4, 1200, 3],
    [4, 1199, 2],
    [3, 1024, 2],
    [2, 1024, 2],
  ])('resolves preference %p at %p px to %p columns', (preferred, width, expected) => {
    expect(resolveVideoGridCols(preferred, width)).toBe(expected);
  });

  test.each([undefined, null, 0, 1, 5, '4', Number.NaN])(
    'normalizes invalid preference %p to the default',
    (preferred) => {
      expect(resolveVideoGridCols(preferred, 1920)).toBe(3);
    },
  );
});
