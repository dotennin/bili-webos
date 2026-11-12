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
