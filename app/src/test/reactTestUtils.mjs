import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

export { React, TestRenderer, act };

export async function render(element, options) {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(element, options);
    await flush();
  });
  return renderer;
}

export async function update(renderer, element) {
  await act(async () => {
    renderer.update(element);
    await flush();
  });
}

export async function flush() {
  await Promise.resolve();
}

export async function interact(fn) {
  await act(async () => {
    await fn();
    await flush();
  });
}

export function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.children || []);
}

export function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent(event) {
      try {
        event.target = this;
      } catch {}
      for (const handler of listeners.get(event.type) || []) {
        handler(event);
      }
      return true;
    },
    listenerCount(type) {
      return (listeners.get(type) || new Set()).size;
    },
  };
}

export function createVideoMock() {
  const events = new Map();
  return {
    currentTime: 0,
    duration: 120,
    paused: true,
    readyState: 0,
    ended: false,
    playCalls: 0,
    pauseCalls: 0,
    addEventListener(type, handler) {
      if (!events.has(type)) events.set(type, new Set());
      events.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      events.get(type)?.delete(handler);
    },
    dispatch(type) {
      for (const handler of events.get(type) || []) {
        handler({ type });
      }
    },
    play() {
      this.paused = false;
      this.playCalls += 1;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      this.pauseCalls += 1;
    },
    scrollIntoView() {},
  };
}
