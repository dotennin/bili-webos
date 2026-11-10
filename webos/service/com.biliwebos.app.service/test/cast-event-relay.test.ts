import { expect, test } from 'bun:test';
import { CastEventRelay } from '../src/cast/castEventRelay.ts';

test('cold-start subscription replays Play even after state, seek, and resume events', () => {
  const relay = new CastEventRelay(() => ({ playState: 'loading' }));
  const responses = [];

  relay.notify({
    kind: 'command',
    command: { type: 'play', contentType: 'video', bvid: 'BV-cold', seekTs: 0 },
  });
  relay.notify({ kind: 'state', payload: { playState: 'loading' } });
  relay.notify({ kind: 'progress', payload: { position: 0 } });
  relay.notify({ kind: 'command', command: { type: 'seek', positionSec: 35 } });
  relay.notify({ kind: 'command', command: { type: 'resume' } });

  relay.subscribe({ respond: (value) => responses.push(value) });
  expect(responses).toEqual([
    {
      returnValue: true,
      subscribed: true,
      event: {
        kind: 'command',
        command: {
          type: 'play',
          contentType: 'video',
          bvid: 'BV-cold',
          seekTs: 35,
        },
      },
      status: { playState: 'loading' },
    },
  ]);

  const secondResponses = [];
  relay.subscribe({ respond: (value) => secondResponses.push(value) });
  expect(secondResponses[0].event).toEqual({ kind: 'ready' });
});

test('only the latest unhandled Play is replayed, and Stop cancels it', () => {
  const relay = new CastEventRelay(() => ({}));
  relay.notify({
    kind: 'command',
    command: { type: 'play', contentType: 'video', bvid: 'BV-old' },
  });
  relay.notify({
    kind: 'command',
    command: { type: 'play', contentType: 'live', roomId: 42 },
  });

  const responses = [];
  relay.subscribe({ respond: (value) => responses.push(value) });
  expect(responses[0].event.command).toMatchObject({
    type: 'play',
    contentType: 'live',
    roomId: 42,
  });

  const stoppedRelay = new CastEventRelay(() => ({}));
  stoppedRelay.notify({
    kind: 'command',
    command: { type: 'play', contentType: 'video', bvid: 'BV-stop' },
  });
  stoppedRelay.notify({ kind: 'command', command: { type: 'stop' } });
  const afterStop = [];
  stoppedRelay.subscribe({ respond: (value) => afterStop.push(value) });
  expect(afterStop[0].event).toEqual({ kind: 'ready' });
});

test('live subscribers get events, failed ones are removed, and undelivered Play stays pending', () => {
  const relay = new CastEventRelay(() => ({ playState: 'idle' }));
  const received = [];
  relay.subscribe({
    respond(value) {
      received.push(value.event);
      if (value.event.kind === 'command') throw new Error('closed');
    },
  });
  relay.notify({
    kind: 'command',
    command: { type: 'play', contentType: 'video', bvid: 'BV-retry' },
  });
  relay.notify({ kind: 'state', payload: { playState: 'loading' } });
  expect(received).toHaveLength(2);

  expect(() =>
    relay.subscribe({
      respond() {
        throw new Error('subscription closed');
      },
    }),
  ).not.toThrow();

  const recovered = [];
  relay.subscribe({ respond: (value) => recovered.push(value.event) });
  expect(recovered[0].command.bvid).toBe('BV-retry');
  relay.notify({ kind: 'state', payload: { playState: 'playing' } });
  expect(recovered.at(-1)).toEqual({
    kind: 'state',
    payload: { playState: 'playing' },
  });
});
