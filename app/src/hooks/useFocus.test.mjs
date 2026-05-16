import { test, expect, beforeEach } from 'bun:test';
import { registerFocusable, unregisterFocusable, setFocus, getCurrentFocusId, onFocusChange, initKeyboardNav, setCustomKeyHandler } from './useFocus.js';

beforeEach(() => {
  const focused = new Set();
  globalThis.document = {
    querySelector: (sel) => ({
      classList: { add: (c) => focused.add(`${sel}-${c}`), remove: () => {} },
      scrollIntoView: () => {},
    }),
  };
  globalThis.window = {
    addEventListener: (_, fn) => { globalThis.__keydown = fn; },
    dispatchEvent: () => {},
  };
});

test('register/set/unregister focus flow', () => {
  registerFocusable('content-0-0', { row: 0, col: 0, group: 'content', onSelect: () => {} });
  setFocus('content-0-0');
  expect(getCurrentFocusId()).toBe('content-0-0');
  unregisterFocusable('content-0-0');
  expect(getCurrentFocusId()).toBeNull();
});

test('focus change listener and keyboard enter', () => {
  let changed = '';
  const off = onFocusChange((id) => { changed = id; });
  let selected = 0;
  registerFocusable('content-0-0', { row: 0, col: 0, group: 'content', onSelect: () => { selected++; } });
  setFocus('content-0-0');
  initKeyboardNav();
  const e = { key: 'Enter', preventDefault: () => {}, stopPropagation: () => {} };
  globalThis.__keydown(e);
  expect(changed).toBe('content-0-0');
  expect(selected).toBe(1);
  off();
});

test('custom key handler short-circuits default handling', () => {
  let hit = 0;
  setCustomKeyHandler(() => { hit++; return true; });
  initKeyboardNav();
  globalThis.__keydown({ key: 'ArrowRight', preventDefault: () => {}, stopPropagation: () => {} });
  expect(hit).toBeGreaterThan(0);
  setCustomKeyHandler(null);
});
