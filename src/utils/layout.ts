const DEFAULT_VIDEO_GRID_COLS = 3;

function normalizePreferredCols(preferredCols: unknown) {
  return preferredCols === 2 || preferredCols === 3 || preferredCols === 4
    ? preferredCols
    : DEFAULT_VIDEO_GRID_COLS;
}

export function resolveVideoGridCols(
  preferredCols: unknown,
  viewportWidth: number,
) {
  const normalizedCols = normalizePreferredCols(preferredCols);

  if (viewportWidth >= 1600) return normalizedCols;
  if (viewportWidth >= 1200) return Math.min(normalizedCols, 3);
  return Math.min(normalizedCols, 2);
}
