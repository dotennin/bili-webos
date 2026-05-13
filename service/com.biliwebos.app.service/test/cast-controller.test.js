const test = require('node:test');
const assert = require('node:assert/strict');

const { CastController } = require('../cast/castController');

test('parse play command into video intent', () => {
  const controller = new CastController();

  const intent = controller.handleCommand('session-1', 'Play', JSON.stringify({
    aid: 123,
    bvid: 'BV1xx411c7mD',
    cid: 456,
    title: 'test video',
  }));

  assert.equal(intent.type, 'play');
  assert.equal(intent.contentType, 'video');
  assert.equal(intent.aid, 123);
  assert.equal(intent.bvid, 'BV1xx411c7mD');
  assert.equal(intent.cid, 456);
  assert.equal(intent.title, 'test video');
});

test('parse play command into live intent', () => {
  const controller = new CastController();

  const intent = controller.handleCommand('session-1', 'Play', JSON.stringify({
    roomId: 987654,
    title: 'live room',
  }));

  assert.equal(intent.type, 'play');
  assert.equal(intent.contentType, 'live');
  assert.equal(intent.roomId, 987654);
});

test('parse playurl command via nva_ext payload into video intent', () => {
  const controller = new CastController();
  const ext = encodeURIComponent(JSON.stringify({
    content: {
      aid: 22,
      cid: 33,
      bvid: 'BV1ab411c7mD',
      title: 'from playurl',
    },
  }));

  const intent = controller.handleCommand('session-1', 'PlayUrl', JSON.stringify({
    url: `https://example.com/play?foo=bar&nva_ext=${ext}`,
  }));

  assert.equal(intent.type, 'play');
  assert.equal(intent.contentType, 'video');
  assert.equal(intent.aid, 22);
  assert.equal(intent.cid, 33);
  assert.equal(intent.bvid, 'BV1ab411c7mD');
});

test('unsupported playurl payload is ignored without clobbering active session', () => {
  const controller = new CastController();

  controller.handleCommand('session-1', 'Play', JSON.stringify({ aid: 1, cid: 2, bvid: 'BV1' }));
  const before = controller.getStatus();
  const result = controller.handleCommand('session-1', 'PlayUrl', JSON.stringify({
    url: 'https://example.com/play?foo=bar',
  }));
  const after = controller.getStatus();

  assert.equal(result, null);
  assert.deepEqual(after.activeContent, before.activeContent);
});

test('reporting state and progress produces outbound NVA events', () => {
  const controller = new CastController();
  const sent = [];

  controller.attachSession({
    id: 'session-1',
    sendCommand(action, content) {
      sent.push({ action, content });
    },
    sendReply() {},
    sendEmpty() {},
  });

  controller.handleCommand('session-1', 'Play', JSON.stringify({ aid: 1, cid: 2, bvid: 'BV1' }));
  controller.reportState({ playState: 'playing' });
  controller.reportProgress({ duration: 100, position: 45 });

  assert.deepEqual(sent.slice(-2), [
    { action: 'OnPlayState', content: { playState: 4 } },
    { action: 'OnProgress', content: { duration: 100, position: 45 } },
  ]);
});

test('quality and danmaku commands use official NVA names', () => {
  const controller = new CastController();
  const intents = [];

  controller.onIntent((intent) => intents.push(intent));

  const qnIntent = controller.handleCommand('session-1', 'SwitchQn', JSON.stringify({ qn: 112 }));
  const dmIntent = controller.handleCommand('session-1', 'SwitchDanmaku', JSON.stringify({ open: false }));

  assert.deepEqual(qnIntent, { type: 'switchQn', qn: 112 });
  assert.deepEqual(dmIntent, { type: 'switchDanmaku', open: false });
  assert.deepEqual(intents, [
    { type: 'switchQn', qn: 112 },
    { type: 'switchDanmaku', open: false },
  ]);
});

test('reporting quality and danmaku emits official outbound events', () => {
  const controller = new CastController();
  const sent = [];

  controller.attachSession({
    id: 'session-1',
    sendCommand(action, content) {
      sent.push({ action, content });
    },
    sendReply() {},
    sendEmpty() {},
  });

  controller.reportQuality({ currentQuality: 80, availableQualities: [80, 64, 32] });
  controller.reportDanmaku({ open: true });

  assert.deepEqual(sent, [
    {
      action: 'OnQnSwitch',
      content: {
        curQn: 80,
        supportQnList: [
          { description: '', displayDesc: '', needLogin: false, needVip: false, quality: 80, superscript: '' },
          { description: '', displayDesc: '', needLogin: false, needVip: false, quality: 64, superscript: '' },
          { description: '', displayDesc: '', needLogin: false, needVip: false, quality: 32, superscript: '' },
        ],
        userDesireQn: 80,
      },
    },
    { action: 'OnDanmakuSwitch', content: { open: true } },
  ]);
});

test('GetTVInfo returns qn and danmaku state', () => {
  const controller = new CastController();
  controller.handleCommand('session-1', 'Play', JSON.stringify({
    aid: 1,
    cid: 2,
    bvid: 'BV1',
    currentQn: 80,
    desireQn: 80,
    danmakuSwitchSave: false,
  }));
  controller.reportQuality({ currentQuality: 80, availableQualities: [120, 80, 64] });
  controller.reportDanmaku({ open: false });

  const status = controller.getStatus();

  assert.equal(status.curQn, 80);
  assert.equal(status.userDesireQn, 80);
  assert.equal(status.danmakuOpen, false);
  assert.deepEqual(status.supportQnList.map(item => item.quality), [120, 80, 64]);
});

test('playing a video does not spam outbound state by default', () => {
  const controller = new CastController();
  const sent = [];

  controller.attachSession({
    id: 'session-1',
    sendCommand(action, content) {
      sent.push({ action, content });
    },
    sendReply() {},
    sendEmpty() {},
  });

  controller.handleCommand('session-1', 'Play', JSON.stringify({
    aid: 12,
    cid: 34,
    bvid: 'BV1',
    current_qn: 80,
    desire_qn: 120,
    danmakuSwitchSave: true,
  }));

  assert.equal(sent.length, 0);
});
