var EventEmitter = require('events');

var PLAY_STATE_MAP = {
  idle: 0,
  loading: 3,
  playing: 4,
  paused: 5,
  end: 6,
  stop: 7,
  error: 8,
};

function safeJsonParse(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

function toNumber(value) {
  var n = Number(value);
  return isFinite(n) ? n : 0;
}

function normalizePlayPayload(payload) {
  payload = payload || {};
  var roomId = toNumber(payload.roomId || payload.room_id);
  if (roomId > 0) {
    return {
      type: 'play',
      contentType: 'live',
      roomId: roomId,
      title: payload.title || '',
      currentQn: toNumber(payload.current_qn || payload.currentQn || payload.desire_qn || payload.desireQn),
      desireQn: toNumber(payload.desire_qn || payload.desireQn || payload.current_qn || payload.currentQn),
      danmakuSwitchSave: payload.danmakuSwitchSave !== false,
      speed: toNumber(payload.userDesireSpeed || payload.speed || 1) || 1,
    };
  }

  var aid = toNumber(payload.aid);
  var cid = toNumber(payload.cid);
  var epid = toNumber(payload.epid || payload.epId);
  var bvid = payload.bvid || '';
  if (!aid && !cid && !epid && !bvid) return null;

  return {
    type: 'play',
    contentType: 'video',
    aid: aid || undefined,
    cid: cid || undefined,
    epid: epid || undefined,
    bvid: bvid || undefined,
    title: payload.title || '',
    currentQn: toNumber(payload.current_qn || payload.currentQn || payload.desire_qn || payload.desireQn),
    desireQn: toNumber(payload.desire_qn || payload.desireQn || payload.current_qn || payload.currentQn),
    danmakuSwitchSave: payload.danmakuSwitchSave !== false,
    speed: toNumber(payload.userDesireSpeed || payload.speed || 1) || 1,
  };
}

function parsePlayUrlPayload(payload) {
  if (!payload || !payload.url) return null;
  try {
    var parsed = new URL(payload.url);
    var ext = parsed.searchParams.get('nva_ext');
    if (!ext) return null;
    var decoded = safeJsonParse(decodeURIComponent(ext));
    return normalizePlayPayload(decoded.content || decoded);
  } catch (e) {
    return null;
  }
}

function CastController() {
  this.sessions = new Map();
  this.emitter = new EventEmitter();
  this.status = {
    sessionId: null,
    deviceIp: null,
    httpPort: null,
    activeContent: null,
    playState: 'idle',
    progress: 0,
    duration: 0,
    currentQuality: 0,
    availableQualities: [],
    danmakuEnabled: true,
    speed: 1,
    lastCommandAt: 0,
    lastError: null,
  };
}

function buildSupportQnList(qualities) {
  return (qualities || []).map(function (qn) {
    return {
      description: '',
      displayDesc: '',
      needLogin: false,
      needVip: false,
      quality: qn,
      superscript: '',
    };
  });
}

function buildPlayItem(content) {
  content = content || {};
  return {
    aid: content.aid || 0,
    cid: content.cid || 0,
    contentType: content.contentType === 'live' ? 2 : 1,
    epId: content.epid || content.epId || 0,
    seasonId: content.season_id || content.seasonId || 0,
  };
}

CastController.prototype.attachSession = function (session) {
  this.sessions.set(session.id, session);
  this.status.sessionId = session.id;
};

CastController.prototype.detachSession = function (sessionId) {
  this.sessions.delete(sessionId);
  if (this.status.sessionId === sessionId) this.status.sessionId = null;
};

CastController.prototype.onIntent = function (listener) {
  this.emitter.on('intent', listener);
  return this;
};

CastController.prototype.emitIntent = function (intent) {
  this.emitter.emit('intent', intent);
};

CastController.prototype.handleCommand = function (sessionId, action, rawBody) {
  var payload = safeJsonParse(rawBody);
  var intent = null;

  this.status.sessionId = sessionId;
  this.status.lastCommandAt = Date.now();

  if (action === 'Play') {
    intent = normalizePlayPayload(payload);
    if (intent) {
      this.status.activeContent = intent;
      if (intent.currentQn) this.status.currentQuality = intent.currentQn;
      if (typeof intent.danmakuSwitchSave === 'boolean') this.status.danmakuEnabled = !!intent.danmakuSwitchSave;
      if (intent.speed) this.status.speed = intent.speed;
    }
  } else if (action === 'PlayUrl') {
    intent = parsePlayUrlPayload(payload);
    if (intent) this.status.activeContent = intent;
  } else if (action === 'Pause') {
    intent = { type: 'pause' };
  } else if (action === 'Resume') {
    intent = { type: 'resume' };
  } else if (action === 'Stop') {
    intent = { type: 'stop' };
    this.status.playState = 'stop';
  } else if (action === 'Seek') {
    intent = { type: 'seek', positionSec: toNumber(payload.seekTs || payload.position || payload.positionSec) };
  } else if (action === 'GetTVInfo') {
    intent = { type: 'getTVInfo' };
  } else if (action === 'SwitchDanmaku' || action === 'SetDanmaku' || action === 'ToggleDanmaku' || action === 'Danmaku') {
    intent = { type: 'switchDanmaku', open: !!payload.open };
    this.status.danmakuEnabled = !!payload.open;
  } else if (action === 'SwitchQn' || action === 'SetQuality' || action === 'ChangeQuality' || action === 'SelectQuality' || action === 'Quality' || action === 'SetQn') {
    intent = { type: 'switchQn', qn: toNumber(payload.qn || payload.quality || payload.current_qn || payload.desire_qn) };
    if (intent.qn) this.status.currentQuality = intent.qn;
  } else if (action === 'SwitchSpeed' || action === 'SetSpeed') {
    intent = { type: 'switchSpeed', speed: toNumber(payload.speed || payload.currSpeed || payload.currentSpeed) || 1 };
    this.status.speed = intent.speed;
  } else if (action === 'GetVolume') {
    intent = { type: 'getVolume' };
  } else if (action === 'SetVolume') {
    intent = { type: 'setVolume', volume: toNumber(payload.volume) };
  } else if (action === 'SendDanmaku') {
    intent = {
      type: 'sendDanmaku',
      content: payload.content || '',
      size: toNumber(payload.size),
      color: toNumber(payload.color),
      danmakuType: toNumber(payload.type),
      remoteDmId: payload.mRemoteDmId,
    };
  }

  if (intent) this.emitIntent(intent);
  return intent;
};

CastController.prototype.reportState = function (payload) {
  payload = payload || {};
  this.status.playState = payload.playState || this.status.playState;
  this.status.lastError = payload.error || null;

  var numericState = PLAY_STATE_MAP[this.status.playState];
  if (typeof numericState === 'number') {
    this.sessions.forEach(function (session) {
      session.sendCommand('OnPlayState', { playState: numericState });
    });
  }
};

CastController.prototype.reportQuality = function (payload) {
  payload = payload || {};
  if (typeof payload.currentQuality !== 'undefined') {
    this.status.currentQuality = toNumber(payload.currentQuality);
  } else if (typeof payload.qn !== 'undefined') {
    this.status.currentQuality = toNumber(payload.qn);
  }
  if (Array.isArray(payload.availableQualities)) {
    this.status.availableQualities = payload.availableQualities.map(function (item) {
      if (typeof item === 'number') return item;
      return toNumber(item && (item.qn || item.quality || item.current_qn));
    }).filter(function (n) { return !!n; });
  }

  var currentQn = toNumber(this.status.currentQuality);
  var supportQnList = buildSupportQnList(this.status.availableQualities);

  this.sessions.forEach(function (session) {
    session.sendCommand('OnQnSwitch', {
      curQn: currentQn,
      supportQnList: supportQnList,
      userDesireQn: currentQn,
    });
  });
};

CastController.prototype.reportDanmaku = function (payload) {
  payload = payload || {};
  if (typeof payload.open !== 'undefined') {
    this.status.danmakuEnabled = !!payload.open;
  }

  this.sessions.forEach(function (session) {
    session.sendCommand('OnDanmakuSwitch', {
      open: !!payload.open,
    });
  });
};

CastController.prototype.reportSpeed = function (payload) {
  payload = payload || {};
  if (typeof payload.speed !== 'undefined') {
    this.status.speed = toNumber(payload.speed) || 1;
  }
  this.sessions.forEach(function (session) {
    session.sendCommand('SpeedChanged', {
      currSpeed: this.status.speed,
      supportSpeedList: [0.5, 0.75, 1, 1.25, 1.5, 2],
    });
  }, this);
};

CastController.prototype.reportProgress = function (payload) {
  payload = payload || {};
  this.status.duration = toNumber(payload.duration);
  this.status.progress = toNumber(payload.position);

  this.sessions.forEach(function (session) {
    session.sendCommand('OnProgress', {
      duration: payload.duration || 0,
      position: payload.position || 0,
    });
  });
};

CastController.prototype.ack = function (payload) {
  payload = payload || {};
  this.status.lastAckAt = Date.now();
  this.status.lastAck = payload;
};

CastController.prototype.setNetworkInfo = function (ip, httpPort) {
  this.status.deviceIp = ip;
  this.status.httpPort = httpPort;
};

CastController.prototype.getStatus = function () {
  var currentQn = toNumber(this.status.currentQuality);
  var supportQnList = buildSupportQnList(this.status.availableQualities);
  return JSON.parse(JSON.stringify(Object.assign({}, this.status, {
    curQn: currentQn,
    userDesireQn: currentQn,
    supportQnList: supportQnList,
    danmakuOpen: !!this.status.danmakuEnabled,
    qnDesc: supportQnList.map(function (item) {
      return item.quality;
    }),
  })));
};

module.exports = {
  CastController: CastController,
  PLAY_STATE_MAP: PLAY_STATE_MAP,
};
