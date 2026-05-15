import { test, expect } from 'bun:test';

import { storage } from './storage.js';

test('storage.remove does not throw when localStorage is unavailable', () => {
  const originalLocalStorage = globalThis.localStorage;
  try {
    delete globalThis.localStorage;
  } catch {}

  expect(() => {
    storage.remove('auth');
  }).not.toThrow();

  if (typeof originalLocalStorage !== 'undefined') {
    globalThis.localStorage = originalLocalStorage;
  }
});
