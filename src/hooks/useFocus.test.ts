import { afterEach, beforeEach, expect, test } from 'bun:test';
import { React, render, interact } from '../test/reactTestUtils.ts';

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

function createKeyEvent(key, overrides = {}) {
  return {
    key,
    keyCode: overrides.keyCode ?? 0,
    preventDefault() {},
    stopPropagation() {},
    ...overrides,
  };
}

test('initKeyboardNav handles arrows, enter, sidebar transitions, and back key', async () => {
  const mod = await loadModule();
  const {
    __testing,
    getCurrentFocusId,
    initKeyboardNav,
    registerFocusable,
    setFocus,
  } = mod;
  const selections = [];
  const backEvents = [];

  createFocusableNode('sidebar-0-0');
  createFocusableNode('content-0-0');
  createFocusableNode('content-0-1');
  createFocusableNode('content-1-1');

  registerFocusable('sidebar-0-0', { row: 0, col: 0, group: 'sidebar' });
  registerFocusable('content-0-0', {
    row: 0,
    col: 0,
    group: 'content',
    onSelect: () => selections.push('content-0-0'),
  });
  registerFocusable('content-0-1', {
    row: 0,
    col: 1,
    group: 'content',
    onSelect: () => selections.push('content-0-1'),
  });
  registerFocusable('content-1-1', {
    row: 1,
    col: 1,
    group: 'content',
    onSelect: () => selections.push('content-1-1'),
  });

  testWindow.addEventListener('tv-back', () => {
    backEvents.push('tv-back');
  });

  initKeyboardNav();
  const keyHandler = __testing.getKeyHandler();
  expect(typeof keyHandler).toBe('function');

  setFocus('sidebar-0-0');
  keyHandler(createKeyEvent('ArrowRight'));
  expect(getCurrentFocusId()).toBe('content-0-0');

  keyHandler(createKeyEvent('ArrowRight'));
  expect(getCurrentFocusId()).toBe('content-0-1');

  keyHandler(createKeyEvent('ArrowDown'));
  expect(getCurrentFocusId()).toBe('content-1-1');

  keyHandler(createKeyEvent('Enter'));
  expect(selections).toEqual(['content-1-1']);

  keyHandler(createKeyEvent('ArrowLeft'));
  expect(getCurrentFocusId()).toBe('sidebar-0-0');

  keyHandler(
    createKeyEvent('GoBack', {
      keyCode: 461,
    }),
  );
  expect(backEvents).toEqual(['tv-back']);
});

test('keyboard navigation falls back across sparse grids and missing default targets', async () => {
  const mod = await loadModule();
  const {
    __testing,
    getCurrentFocusId,
    initKeyboardNav,
    registerFocusable,
    setFocus,
  } = mod;

  createFocusableNode('sidebar-2-0');
  createFocusableNode('content-0-2');
  createFocusableNode('content-1-0');
  createFocusableNode('content-2-2');

  registerFocusable('sidebar-2-0', { row: 2, col: 0, group: 'sidebar' });
  registerFocusable('content-0-2', { row: 0, col: 2, group: 'content' });
  registerFocusable('content-1-0', { row: 1, col: 0, group: 'content' });
  registerFocusable('content-2-2', { row: 2, col: 2, group: 'content' });

  initKeyboardNav();
  const keyHandler = __testing.getKeyHandler();

  setFocus('sidebar-2-0');
  keyHandler(createKeyEvent('ArrowRight'));
  expect(getCurrentFocusId()).toBe('content-1-0');

  setFocus('content-2-2');
  keyHandler(createKeyEvent('ArrowUp'));
  expect(getCurrentFocusId()).toBe('content-1-0');

  keyHandler(createKeyEvent('ArrowLeft'));
  expect(getCurrentFocusId()).toBe('sidebar-2-0');
});

test('useFocusable registers, exposes props, and unregisters on unmount', async () => {
  const mod = await import(`./useFocus.ts?hook=${Date.now()}-${Math.random()}`);
  mod.__testing.reset();
  const { useFocusable, __testing, getCurrentFocusId } = mod;
  const selects = [];

  function Probe() {
    const focusable = useFocusable({
      id: 'content-3-2',
      row: 3,
      col: 2,
      group: 'content',
      onSelect: () => selects.push('selected'),
    });
    return React.createElement(
      'button',
      focusable.props,
      focusable.isFocused ? 'focused' : 'idle',
    );
  }

  const renderer = await render(React.createElement(Probe));
  const button = renderer.container.querySelector('button');

  expect(__testing.hasFocusable('content-3-2')).toBe(true);
  expect(button.getAttribute('data-focus-id')).toBe('content-3-2');

  await interact(() =>
    button.dispatchEvent(new MouseEvent('click', { bubbles: true })),
  );
  expect(getCurrentFocusId()).toBe('content-3-2');
  expect(selects).toEqual(['selected']);

  renderer.unmount();
  expect(__testing.hasFocusable('content-3-2')).toBe(false);
  mod.__testing.reset();
});
