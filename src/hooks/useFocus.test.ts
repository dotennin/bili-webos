import { afterEach, beforeEach, expect, test } from 'bun:test';

let cleanupFns;
let elements;
let dispatched;
let keydownHandler;
let originalWindow;
let originalDocument;
let originalQuerySelector;
let originalAddEventListener;
let originalRemoveEventListener;
let originalDispatchEvent;

let useFocusModule;

function makeElement(id) {
  return {
    id,
    classList: {
      added: [],
      removed: [],
      add(name) {
        this.added.push(name);
      },
      remove(name) {
        this.removed.push(name);
      },
    },
    scrollIntoViewCalls: [],
    scrollIntoView(arg) {
      this.scrollIntoViewCalls.push(arg);
    },
  };
}

beforeEach(() => {
  cleanupFns = [];
  elements = new Map();
  dispatched = [];
  keydownHandler = null;
  originalWindow = globalThis.window;
  originalDocument = globalThis.document;
  originalQuerySelector = originalDocument.querySelector.bind(originalDocument);
  originalAddEventListener = originalWindow.addEventListener.bind(originalWindow);
  originalRemoveEventListener =
    originalWindow.removeEventListener.bind(originalWindow);
  originalDispatchEvent = originalWindow.dispatchEvent.bind(originalWindow);

  originalDocument.querySelector = (selector) => {
    const id = selector.match(/data-focus-id="(.+)"/)?.[1];
    if (id) return elements.get(id) || null;
    return originalQuerySelector(selector);
  };
  originalWindow.addEventListener = (type, handler, options) => {
    if (type === 'keydown') keydownHandler = handler;
    return originalAddEventListener(type, handler, options);
  };
  originalWindow.removeEventListener = (type, handler, options) => {
    if (type === 'keydown' && keydownHandler === handler) keydownHandler = null;
    return originalRemoveEventListener(type, handler, options);
  };
  originalWindow.dispatchEvent = (event) => {
    dispatched.push(event);
    return originalDispatchEvent(event);
  };
});

afterEach(() => {
  while (cleanupFns.length) cleanupFns.pop()();
  useFocusModule?.__testing?.reset?.();
  originalDocument.querySelector = originalQuerySelector;
  originalWindow.addEventListener = originalAddEventListener;
  originalWindow.removeEventListener = originalRemoveEventListener;
  originalWindow.dispatchEvent = originalDispatchEvent;
});

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

test('register/setFocus/onFocusChange update DOM focus classes', async () => {
  const mod = await loadModule();
  const {
    registerFocusable,
    unregisterFocusable,
    setFocus,
    getCurrentFocusId,
    onFocusChange,
  } = mod;
  const sidebar = makeElement('sidebar-0-0');
  const content = makeElement('content-0-0');
  elements.set('sidebar-0-0', sidebar);
  elements.set('content-0-0', content);

  registerFocusable('sidebar-0-0', { row: 0, col: 0, group: 'sidebar' });
  registerFocusable('content-0-0', { row: 0, col: 0, group: 'content' });
  const seen = [];
  cleanupFns.push(onFocusChange((id) => seen.push(id)));

  setFocus('sidebar-0-0');
  expect(getCurrentFocusId()).toBe('sidebar-0-0');
  expect(sidebar.classList.added).toEqual(['focused']);

  setFocus('content-0-0');
  expect(sidebar.classList.removed).toEqual(['focused']);
  expect(content.classList.added).toEqual(['focused']);
  expect(content.scrollIntoViewCalls[0]).toEqual({ block: 'nearest' });
  expect(seen).toEqual(['sidebar-0-0', 'content-0-0']);

  unregisterFocusable('content-0-0');
  expect(getCurrentFocusId()).toBeNull();
});

test('initKeyboardNav handles enter, arrows, sidebar/content transitions, and back key', async () => {
  const mod = await loadModule();
  const { registerFocusable, setFocus, initKeyboardNav, setCustomKeyHandler } =
    mod;

  const ids = [
    'sidebar-0-0',
    'sidebar-1-0',
    'content-0-0',
    'content-1-0',
    'content-1-1',
  ];
  for (const id of ids) elements.set(id, makeElement(id));

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
  expect(typeof keydownHandler).toBe('function');

  const consumed = [];
  setCustomKeyHandler((e) => {
    if (e.key === 'X') {
      consumed.push('custom');
      return true;
    }
    return false;
  });

  const event = (key, keyCode = 0) => ({
    key,
    keyCode,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  });

  const custom = event('X');
  keydownHandler(custom);
  expect(consumed).toEqual(['custom']);

  setFocus('sidebar-0-0');
  const right = event('ArrowRight');
  keydownHandler(right);
  expect(elements.get('content-0-0').classList.added.at(-1)).toBe('focused');

  const down = event('ArrowDown');
  keydownHandler(down);
  expect(elements.get('content-1-0').classList.added.at(-1)).toBe('focused');

  const right2 = event('ArrowRight');
  keydownHandler(right2);
  expect(elements.get('content-1-1').classList.added.at(-1)).toBe('focused');

  const left = event('ArrowLeft');
  keydownHandler(left);
  expect(elements.get('content-1-0').classList.added.at(-1)).toBe('focused');

  const enter = event('Enter');
  keydownHandler(enter);
  expect(selected).toContain('c1');

  const back = event('Backspace', 461);
  keydownHandler(back);
  expect(dispatched[0].type).toBe('tv-back');
  expect(back.stopped).toBe(true);
});

test.skip('useFocusable hook registers, focuses on hover, and selects on click', async () => {
  const mod = await loadModule();
  const { useFocusable, getCurrentFocusId, __testing } = mod;
  const { React, render, interact, flush } = await import(
    '../test/reactTestUtils.ts'
  );

  const calls = [];
  let latestProps;
  function Harness() {
    const { props, isFocused } = useFocusable({
      id: 'content-2-1',
      row: 2,
      col: 1,
      group: 'content',
      onSelect: () => calls.push('select'),
    });
    latestProps = props;
    return React.createElement(
      'button',
      { ...props, 'data-focused': String(isFocused) },
      'ok',
    );
  }

  originalDocument.querySelector = originalQuerySelector;
  const renderer = await render(React.createElement(Harness));
  await waitFor(
    () =>
      typeof latestProps?.onMouseEnter === 'function' &&
      __testing.hasFocusable('content-2-1'),
  );
  const button = renderer.container.querySelector('button');
  expect(button?.getAttribute('data-focus-id')).toBe('content-2-1');

  await interact(() => {
    latestProps.onMouseEnter();
  });
  await waitFor(() => getCurrentFocusId() === 'content-2-1');
  expect(button?.classList.contains('focused')).toBe(true);

  await interact(() => {
    latestProps.onClick({ preventDefault() {} });
  });
  expect(calls).toEqual(['select']);

  renderer.unmount();
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

  const ids = ['sidebar-3-0', 'content-1-0', 'content-2-2'];
  for (const id of ids) elements.set(id, makeElement(id));

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

  const event = (key) => ({
    key,
    keyCode: 0,
    preventDefault() {},
    stopPropagation() {},
  });

  setFocus('sidebar-3-0');
  keydownHandler(event('ArrowRight'));
  expect(mod.getCurrentFocusId()).toBe('content-1-0');

  setFocus('content-2-2');
  keydownHandler(event('ArrowUp'));
  expect(mod.getCurrentFocusId()).toBe('content-1-0');

  unregisterFocusable('sidebar-3-0');
  setFocus('content-1-0');
  keydownHandler(event('ArrowLeft'));
  expect(mod.getCurrentFocusId()).toBe('content-1-0');

  off();
  setFocus('content-2-2');
  expect(seen.at(-1)).toBe('content-1-0');
});
