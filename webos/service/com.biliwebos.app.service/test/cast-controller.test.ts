import { expect, mock, test } from 'bun:test';
import assert from 'node:assert/strict';
import { CastController } from '../src/cast/castController.ts';

test('parse play command into video intent', () => {
  const controller = new CastController();
  const intent = controller.handleCommand(
    'session-1',
    'Play',
    JSON.stringify({
      aid: 123,
      bvid: 'BV1xx411c7mD',
      cid: 456,
      title: 'test video',
      seekTs: 123.4,
    }),
  );
  assert.equal(intent.type, 'play');
  assert.equal(intent.contentType, 'video');
  assert.equal(intent.aid, 123);
  assert.equal(intent.bvid, 'BV1xx411c7mD');
  assert.equal(intent.cid, 456);
  assert.equal(intent.title, 'test video');
  assert.equal(intent.seekTs, 123.4);
});

test('parse play command into live intent', () => {
  const controller = new CastController();
  const intent = controller.handleCommand(
    'session-1',
    'Play',
    JSON.stringify({ roomId: 987654, title: 'live room' }),
  );
  assert.equal(intent.type, 'play');
  assert.equal(intent.contentType, 'live');
  assert.equal(intent.roomId, 987654);
});

test('handles PlayUrl transport and command-style intents', () => {
  const controller = new CastController();
  const listener = mock(() => {});
  controller.onIntent(listener);

  const playUrlIntent = controller.handleCommand(
    'session-2',
    'PlayUrl',
    JSON.stringify({
      url: `https://example.com/watch?nva_ext=${encodeURIComponent(JSON.stringify({
        content: { aid: 1, cid: 2, bvid: 'BV1', title: 'from ext' },
      }))}`,
    }),
  );
  expect(playUrlIntent).toMatchObject({
    type: 'play',
    contentType: 'video',
    aid: 1,
    cid: 2,
    bvid: 'BV1',
    title: 'from ext',
  });

  expect(controller.handleCommand('session-2', 'Pause', '{}')).toEqual({
    type: 'pause',
  });
  expect(controller.handleCommand('session-2', 'Resume', '{}')).toEqual({
    type: 'resume',
  });
  expect(controller.handleCommand('session-2', 'Stop', '{}')).toEqual({
    type: 'stop',
  });
  expect(
    controller.handleCommand(
      'session-2',
      'Seek',
      JSON.stringify({ positionSec: '42.5' }),
    ),
  ).toEqual({
    type: 'seek',
    positionSec: 42.5,
  });
  expect(
    controller.handleCommand(
      'session-2',
      'SwitchDanmaku',
      JSON.stringify({ open: 1 }),
    ),
  ).toEqual({
    type: 'switchDanmaku',
    open: true,
  });

  expect(listener).toHaveBeenCalled();
  expect(controller.getStatus()).toMatchObject({
    sessionId: 'session-2',
    playState: 'stop',
  });
});

test('reports state and progress to sessions and stores ack and network info', () => {
  const controller = new CastController();
  const session = {
    id: 'session-3',
    sendCommand: mock(() => {}),
  };
  controller.attachSession(session);

  controller.reportState({ playState: 'playing' });
  controller.reportProgress({ duration: 120, position: 15 });
  controller.ack({ accepted: true });
  controller.setNetworkInfo('192.168.1.9', 9958);
  controller.detachSession('session-3');

  expect(session.sendCommand).toHaveBeenCalledWith('OnPlayState', {
    playState: 4,
  });
  expect(session.sendCommand).toHaveBeenCalledWith('OnProgress', {
    duration: 120,
    position: 15,
  });
  expect(controller.getStatus()).toMatchObject({
    deviceIp: '192.168.1.9',
    httpPort: 9958,
    duration: 120,
    progress: 15,
    lastAck: { accepted: true },
    sessionId: null,
  });
});
