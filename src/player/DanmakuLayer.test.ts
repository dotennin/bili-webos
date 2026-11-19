import { expect, test } from 'bun:test';
import { React, render, update } from '../test/reactTestUtils';

test('seeks past expired comments and replays them after rewinding', async () => {
  const layerPath = './DanmakuLayer.tsx?fixture=danmaku-layer';
  const { default: DanmakuLayer } = await import(layerPath);
  const danmakus = [
    { time: 1, text: '开头' },
    { time: 1.5, text: '下一条' },
    { time: 120, text: '结尾' },
  ];
  const at = (currentTime: number) =>
    React.createElement(DanmakuLayer, {
      danmakus,
      currentTime,
      enabled: true,
      seekable: true,
    });
  const renderer = await render(at(1));

  expect(renderer.container.textContent).toBe('开头');
  await update(renderer, at(1.5));
  expect(renderer.container.textContent).toBe('开头下一条');

  await update(renderer, at(120));
  expect(renderer.container.textContent).toBe('结尾');

  await update(renderer, at(1));
  expect(renderer.container.textContent).toBe('开头');
  await renderer.unmount();
});

test('keeps live comments moving when new comments arrive', async () => {
  const layerPath = './DanmakuLayer.tsx?fixture=danmaku-layer';
  const { default: DanmakuLayer } = await import(layerPath);
  const first = { time: 1, text: '第一条' };
  const second = { time: 2, text: '第二条' };
  const renderer = await render(
    React.createElement(DanmakuLayer, {
      danmakus: [first],
      currentTime: 1,
      enabled: true,
    }),
  );

  try {
    const firstElement = renderer.container.querySelector('.danmaku-item');
    expect(firstElement?.textContent).toBe('第一条');

    await update(
      renderer,
      React.createElement(DanmakuLayer, {
        danmakus: [first, second],
        currentTime: 2,
        enabled: true,
      }),
    );

    const items = renderer.container.querySelectorAll('.danmaku-item');
    expect(items).toHaveLength(2);
    expect(items[0] === firstElement).toBe(true);
    expect(items[1].textContent).toBe('第二条');
    expect(items[1].style.top).not.toBe(items[0].style.top);

    const event = new renderer.container.ownerDocument.defaultView.Event(
      'animationend',
    );
    items[0].dispatchEvent(event);
    expect(renderer.container.textContent).toBe('第二条');
  } finally {
    renderer.unmount();
  }
});

test('renders each live comment once as the capped buffer shifts', async () => {
  const layerPath = './DanmakuLayer.tsx?fixture=danmaku-layer';
  const { default: DanmakuLayer } = await import(layerPath);
  const expired = Array.from({ length: 299 }, () => ({
    time: 0,
    text: '过期',
  }));
  const first = { time: 10, text: '同一条文字' };
  const second = { ...first };
  const renderer = await render(
    React.createElement(DanmakuLayer, {
      danmakus: [...expired, first],
      currentTime: 10,
      enabled: true,
    }),
  );

  try {
    const firstElement = renderer.container.querySelector('.danmaku-item');
    expect(firstElement?.textContent).toBe(first.text);

    await update(
      renderer,
      React.createElement(DanmakuLayer, {
        danmakus: [...expired.slice(1), first, second],
        currentTime: 10.2,
        enabled: true,
      }),
    );

    const items = renderer.container.querySelectorAll('.danmaku-item');
    expect(items).toHaveLength(2);
    expect(items[0] === firstElement).toBe(true);
    expect(items[1].textContent).toBe(second.text);
  } finally {
    renderer.unmount();
  }
});
