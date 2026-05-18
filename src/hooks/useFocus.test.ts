import { afterEach, beforeEach, expect, test } from 'bun:test';

let useFocusModule;
const testWindow = globalThis.__TEST_WINDOW__;
const testDocument = globalThis.__TEST_DOCUMENT__;

function createFocusableNode(id) {
  const element = testDocument.createElement('button');
  element.dataset.focusId = id;
  const scrollIntoViewCalls = [];
  element.scrollIntoView = (options) => {
    scrollIntoViewCalls.push(options);
  };
  testDocument.body.appendChild(element);
  return {
    element,
    scrollIntoViewCalls,
  };
}

function dispatchKey(key, keyCode = 0) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  if (keyCode) {
    Object.defineProperty(event, 'keyCode', {
      configurable: true,
      value: keyCode,
    });
  }
  window.dispatchEvent(event);
  return event;
}

async function loadModule() {
  if (!useFocusModule) {
    useFocusModule = await import('./useFocus.ts');
  }
  useFocusModule.__testing.reset();
  return useFocusModule;
}

async function waitFor(check, attempts = 50) {
  for (let index = 0; index < attempts; index += 1) {
    if (check()) return;
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('Timed out waiting for condition');
}

beforeEach(() => {
  globalThis.window = testWindow;
  globalThis.document = testDocument;
  globalThis.CustomEvent = testWindow.CustomEvent;
  globalThis.KeyboardEvent = testWindow.KeyboardEvent;
});

afterEach(() => {
  useFocusModule?.__testing?.reset?.();
  testDocument.body.innerHTML = '';
  globalThis.window = testWindow;
  globalThis.document = testDocument;
  globalThis.CustomEvent = testWindow.CustomEvent;
  globalThis.KeyboardEvent = testWindow.KeyboardEvent;
});

test('register/setFocus/onFocusChange update DOM focus classes', async () => {
  const mod = await loadModule();
  const {
    registerFocusable,
    unregisterFocusable,
    setFocus,
    getCurrentFocusId,
    onFocusChange,
  } = mod;
  const sidebar = createFocusableNode('sidebar-0-0');
  const content = createFocusableNode('content-0-0');

  registerFocusable('sidebar-0-0', { row: 0, col: 0, group: 'sidebar' });
  registerFocusable('content-0-0', { row: 0, col: 0, group: 'content' });

  const seen = [];
  const off = onFocusChange((id) => seen.push(id));

  setFocus('sidebar-0-0');
  expect(getCurrentFocusId()).toBe('sidebar-0-0');
  expect(sidebar.element.classList.contains('focused')).toBe(true);

  setFocus('content-0-0');
  expect(sidebar.element.classList.contains('focused')).toBe(false);
  expect(content.element.classList.contains('focused')).toBe(true);
  expect(content.scrollIntoViewCalls[0]).toEqual({ block: 'nearest' });
  expect(seen).toEqual(['sidebar-0-0', 'content-0-0']);

  off();
  unregisterFocusable('content-0-0');
  expect(getCurrentFocusId()).toBeNull();
});

test('initKeyboardNav handles enter, arrows, sidebar/content transitions, and back key', async () => {
  const mod = await loadModule();
  const { registerFocusable, setFocus, initKeyboardNav, setCustomKeyHandler } =
    mod;

  const sidebar0 = createFocusableNode('sidebar-0-0');
  createFocusableNode('sidebar-1-0');
  createFocusableNode('content-0-0');
  const content10 = createFocusableNode('content-1-0');
  createFocusableNode('content-1-1');

  const selected = [];
  registerFocusable('sidebar-0-0', {
    row: 0,
    col: 0,
    group: 'sidebar',
    onSelect: () => selected.push('s0'),
  });
  registerFocusable('sidebar-1-0', {
    row: 1,
    col: 0,
    group: 'sidebar',
    onSelect: () => selected.push('s1'),
  });
  registerFocusable('content-0-0', {
    row: 0,
    col: 0,
    group: 'content',
    onSelect: () => selected.push('c0'),
  });
  registerFocusable('content-1-0', {
    row: 1,
    col: 0,
    group: 'content',
    onSelect: () => selected.push('c1'),
  });
  registerFocusable('content-1-1', {
    row: 1,
    col: 1,
    group: 'content',
    onSelect: () => selected.push('c2'),
  });

  initKeyboardNav();

  const consumed = [];
  setCustomKeyHandler((event) => {
    if (event.key === 'X') {
      consumed.push('custom');
      return true;
    }
    return false;
  });

  dispatchKey('X');
  expect(consumed).toEqual(['custom']);

  setFocus('sidebar-0-0');
  dispatchKey('ArrowRight');
  expect(mod.getCurrentFocusId()).toBe('content-0-0');

  dispatchKey('ArrowDown');
  expect(mod.getCurrentFocusId()).toBe('content-1-0');
  expect(content10.element.classList.contains('focused')).toBe(true);

  dispatchKey('ArrowRight');
  expect(mod.getCurrentFocusId()).toBe('content-1-1');

  dispatchKey('ArrowLeft');
  expect(mod.getCurrentFocusId()).toBe('content-1-0');

  dispatchKey('Enter');
  expect(selected).toContain('c1');

  const backEvents = [];
  const handleBack = (event) => backEvents.push(event.type);
  window.addEventListener('tv-back', handleBack);
  dispatchKey('Backspace', 461);
  window.removeEventListener('tv-back', handleBack);
  expect(backEvents).toEqual(['tv-back']);
  expect(sidebar0.element.classList.contains('focused')).toBe(false);
});

test('createFocusableHandlers focuses on hover and selects on click', async () => {
  const mod = await loadModule();
  const { createFocusableHandlers, getCurrentFocusId, registerFocusable } = mod;
  const calls = [];
  const node = createFocusableNode('content-2-1');
  registerFocusable('content-2-1', {
    row: 2,
    col: 1,
    group: 'content',
    onSelect: () => calls.push('select'),
  });
  const props = createFocusableHandlers('content-2-1', () => calls.push('select'));

  expect(typeof props.onMouseEnter).toBe('function');
  expect(typeof props.onClick).toBe('function');

  props.onMouseEnter();
  expect(getCurrentFocusId()).toBe('content-2-1');
  expect(node.element.classList.contains('focused')).toBe(true);

  props.onClick({ preventDefault() {} });
  expect(calls).toEqual(['select']);
});

test('keyboard navigation falls back across sparse grids and missing groups', async () => {
  const mod = await loadModule();
  const {
    registerFocusable,
    unregisterFocusable,
    setFocus,
    initKeyboardNav,
    onFocusChange,
  } = mod;

  createFocusableNode('sidebar-3-0');
  createFocusableNode('content-1-0');
  createFocusableNode('content-2-2');

  registerFocusable('sidebar-3-0', {
    row: 3,
    col: 0,
    group: 'sidebar',
    onSelect() {},
  });
  registerFocusable('content-1-0', {
    row: 1,
    col: 0,
    group: 'content',
    onSelect() {},
  });
  registerFocusable('content-2-2', {
    row: 2,
    col: 2,
    group: 'content',
    onSelect() {},
  });

  const seen = [];
  const off = onFocusChange((id) => seen.push(id));
  initKeyboardNav();

  setFocus('sidebar-3-0');
  dispatchKey('ArrowRight');
  expect(mod.getCurrentFocusId()).toBe('content-1-0');

  setFocus('content-2-2');
  dispatchKey('ArrowUp');
  expect(mod.getCurrentFocusId()).toBe('content-1-0');

  unregisterFocusable('sidebar-3-0');
  setFocus('content-1-0');
  dispatchKey('ArrowLeft');
  expect(mod.getCurrentFocusId()).toBe('content-1-0');

  off();
  setFocus('content-2-2');
  expect(seen.at(-1)).toBe('content-1-0');
});
