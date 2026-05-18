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
