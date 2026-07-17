import { afterEach, beforeEach, expect, test } from 'bun:test';
import { React, flush, render, textOf } from '../test/reactTestUtils';
import {
  getViewportWidth,
  subscribeToViewportWidth,
  useResponsiveGridCols,
} from './useResponsiveGridCols';

const originalInnerWidth = window.innerWidth;

function GridColsProbe() {
  return React.createElement('div', null, useResponsiveGridCols(2));
}

beforeEach(() => {
  window.innerWidth = 1920;
});

afterEach(() => {
  window.innerWidth = originalInnerWidth;
});

test('uses an explicit preference without reading shared storage', async () => {
  const renderer = await render(React.createElement(GridColsProbe));
  await flush();

  expect(textOf(renderer.toJSON())).toBe('2');
  renderer.unmount();
});

test('subscribes to viewport changes through an explicit target seam', () => {
  let listener: (() => void) | null = null;
  let removedListener: (() => void) | null = null;
  const widths: number[] = [];
  const target = {
    innerWidth: 1280,
    addEventListener(_type: 'resize', nextListener: () => void) {
      listener = nextListener;
    },
    removeEventListener(_type: 'resize', nextListener: () => void) {
      removedListener = nextListener;
    },
  };

  const unsubscribe = subscribeToViewportWidth(
    (width) => widths.push(width),
    target,
  );
  listener?.();
  unsubscribe();

  expect(widths).toEqual([1280]);
  expect(removedListener).toBe(listener);
  expect(getViewportWidth(undefined)).toBe(1920);
});
