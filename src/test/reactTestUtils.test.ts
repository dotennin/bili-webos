import { expect, test } from 'bun:test';
import {
  React,
  createEventTarget,
  createVideoMock,
  interact,
  render,
  textOf,
  update,
} from './reactTestUtils.ts';

function Counter({ count }) {
  return React.createElement('div', null, 'count:' + count);
}

test('reactTestUtils render/update smoke test', async () => {
  const renderer = await render(React.createElement(Counter, { count: 1 }));
  expect(textOf(renderer.toJSON())).toBe('count:1');

  await update(renderer, React.createElement(Counter, { count: 2 }));
  expect(textOf(renderer.toJSON())).toBe('count:2');

  renderer.unmount();
});

test('reactTestUtils serializes empty, multi-root, and styled markup consistently', async () => {
  const emptyRenderer = await render(null);
  expect(emptyRenderer.toJSON()).toBeNull();
  emptyRenderer.unmount();

  const renderer = await render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement('div', { className: 'alpha' }, 'one'),
      React.createElement('span', { style: { color: 'red' } }, 'two'),
    ),
  );

  expect(renderer.toJSON()).toEqual([
    {
      type: 'div',
      props: { className: 'alpha' },
      children: ['one'],
    },
    {
      type: 'span',
      props: { style: 'color: red;' },
      children: ['two'],
    },
  ]);

  await update(renderer, React.createElement('p', null, 'done'));
  expect(textOf(renderer.toJSON())).toBe('done');
  renderer.unmount();
});

test('reactTestUtils textOf and interact handle nested trees and async updates', async () => {
  let setCount;

  function Fixture() {
    const [count, updateCount] = React.useState(1);
    setCount = updateCount;
    return React.createElement(
      'section',
      null,
      React.createElement('span', null, 'count:'),
      React.createElement('strong', null, count),
    );
  }

  const renderer = await render(React.createElement(Fixture));
  expect(textOf(renderer.container)).toBe('count:1');

  await interact(async () => {
    setCount(3);
  });

  expect(textOf(renderer.toJSON())).toBe('count:3');
  expect(textOf(['a', ['b', 'c']])).toBe('abc');
  renderer.unmount();
});

test('reactTestUtils createEventTarget and createVideoMock model browser-like event behavior', async () => {
  const target = createEventTarget();
  const seen = [];
  const handler = (event) => {
    seen.push(event.type);
    expect(event.target).toBe(target);
  };

  target.addEventListener('tick', handler);
  expect(target.listenerCount('tick')).toBe(1);
  target.dispatchEvent({ type: 'tick' });
  target.removeEventListener('tick', handler);
  expect(target.listenerCount('tick')).toBe(0);
  expect(seen).toEqual(['tick']);

  const video = createVideoMock();
  const playEvents = [];
  video.addEventListener('play', (event) => playEvents.push(event.type));
  video.dispatch('play');
  await video.play();
  video.pause();

  expect(playEvents).toEqual(['play']);
  expect(video.paused).toBe(true);
  expect(video.playCalls).toBe(1);
  expect(video.pauseCalls).toBe(1);

  const host = {};
  video.__attachElement(host);
  await host.play();
  host.pause();
  host.currentTime = 42;
  expect(host.currentTime).toBe(42);
  expect(video.playCalls).toBe(2);
  expect(video.pauseCalls).toBe(2);
});
