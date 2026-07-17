import { useEffect, useState } from 'react';
import { storage } from '../utils/storage';
import { resolveVideoGridCols } from '../utils/layout';

const DEFAULT_VIEWPORT_WIDTH = 1920;

type ViewportTarget = {
  innerWidth?: number;
  addEventListener: (type: 'resize', listener: () => void) => void;
  removeEventListener: (type: 'resize', listener: () => void) => void;
};

export function getViewportWidth(
  target: Pick<ViewportTarget, 'innerWidth'> | undefined = typeof window ===
  'undefined'
    ? undefined
    : window,
) {
  return target?.innerWidth || DEFAULT_VIEWPORT_WIDTH;
}

export function subscribeToViewportWidth(
  onChange: (width: number) => void,
  target: ViewportTarget = window,
) {
  const updateViewportWidth = () => onChange(getViewportWidth(target));
  target.addEventListener('resize', updateViewportWidth);
  return () => target.removeEventListener('resize', updateViewportWidth);
}

export function useResponsiveGridCols(preferredColsOverride?: number) {
  const [preferredCols] = useState(
    () => preferredColsOverride ?? storage.getSettings().videoGridCols,
  );
  const [viewportWidth, setViewportWidth] = useState(getViewportWidth);

  useEffect(() => subscribeToViewportWidth(setViewportWidth), []);

  return resolveVideoGridCols(preferredCols, viewportWidth);
}
