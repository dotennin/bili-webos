var dgram = require('dgram');
var net = require('net');
var fs = require('fs');

var deviceProfile = require('./deviceProfile');
var nvaSession = require('./nvaSession');

function parseHeaders(raw) {
  var lines = raw.split('\r\n');
  var requestLine = lines.shift() || '';
  var parts = requestLine.split(' ');
  var headers = {};
  lines.forEach(function (line) {
    if (!line) return;
    var idx = line.indexOf(':');
    if (idx <= 0) return;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  });
  return {
    method: parts[0] || '',
    path: parts[1] || '/',
    version: parts[2] || 'HTTP/1.1',
    headers: headers,
  };
}

function httpResponse(statusCode, statusText, headers, body) {
  var lines = ['HTTP/1.1 ' + statusCode + ' ' + statusText];
  Object.keys(headers || {}).forEach(function (key) {
    lines.push(key + ': ' + headers[key]);
  });
  lines.push('', body || '');
  return lines.join('\r\n');
}

function CastLanServer(options) {
  options = options || {};
  this.profile = options.profile;
  this.controller = options.controller;
  this.onFrame = options.onFrame;
  this.tcpPort = this.profile.httpPort;
  this.udpServer = null;
  this.tcpServer = null;
  this.broadcastTimer = null;
  this.nextSessionId = 1;
}

function pushCastDebug(kind, payload) {
  try {
    if (global.__biliCastDebug && typeof global.__biliCastDebug.push === 'function') {
      global.__biliCastDebug.push(kind, payload);
      return;
    }
  } catch (e) {}
  try {
    fs.appendFileSync('/media/developer/log/bili_cast_debug.log', JSON.stringify({
      at: Date.now(),
      kind: kind,
      payload: payload || null,
    }) + '\n');
  } catch (e2) {}
}

CastLanServer.prototype.start = function (callback) {
  var self = this;
  self.startUdp();
  self.startTcp(function () {
    self.broadcastAlive();
    self.broadcastTimer = setInterval(function () {
      self.broadcastAlive();
    }, 1000);
    if (callback) callback();
  });
};

CastLanServer.prototype.startUdp = function () {
  var self = this;
  self.udpServer = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  self.udpServer.on('message', function (msg, rinfo) {
    var str = msg.toString('utf8');
    if (str.toLowerCase().indexOf('ssdp:discover') < 0) return;
    var st = 'urn:schemas-upnp-org:device:MediaRenderer:1';
    var match = str.match(/\r\nST:\s*(.+)\r\n/i);
    if (match) st = match[1].trim();
    var response = deviceProfile.getSsdpSearchResponse(self.profile, st);
    self.udpServer.send(Buffer.from(response), rinfo.port, rinfo.address);
  });
  self.udpServer.on('error', function (err) {
    console.error('[Cast][SSDP] error:', err.message);
  });
  self.udpServer.bind(1900, function () {
    try { self.udpServer.addMembership('239.255.255.250'); } catch (e) {}
    try { self.udpServer.setBroadcast(true); } catch (e) {}
    try { self.udpServer.setMulticastTTL(2); } catch (e) {}
  });
};

CastLanServer.prototype.startTcp = function (callback) {
  var self = this;
  self.tcpServer = net.createServer(function (socket) {
    self.handleSocket(socket);
  });
  self.tcpServer.on('error', function (err) {
    console.error('[Cast][TCP] error:', err.message);
    if (err.code === 'EADDRINUSE') {
      self.tcpPort += 1;
      self.profile.httpPort = self.tcpPort;
      self.startTcp(callback);
    }
  });
  self.tcpServer.listen(self.tcpPort, '0.0.0.0', callback);
};

CastLanServer.prototype.handleSocket = function (socket) {
  var self = this;
  var headerBuffer = '';
  var handled = false;
  var firstChunkLogged = false;
  try {
    var acceptLine = '[Cast][ACCEPT] ' + JSON.stringify({
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      localAddress: socket.localAddress,
      localPort: socket.localPort,
    });
    console.log(acceptLine);
    pushCastDebug('accept', {
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      localAddress: socket.localAddress,
      localPort: socket.localPort,
    });
  } catch (e) {}

  function onData(chunk) {
    if (!firstChunkLogged) {
      firstChunkLogged = true;
      try {
        var rawLine = '[Cast][SOCKET] ' + JSON.stringify({
          remoteAddress: socket.remoteAddress,
          remotePort: socket.remotePort,
          localAddress: socket.localAddress,
          localPort: socket.localPort,
          firstBytes: chunk.toString('utf8').slice(0, 120),
          firstHex: chunk.toString('hex').slice(0, 120),
        });
        console.log(rawLine);
        pushCastDebug('socket', {
          remoteAddress: socket.remoteAddress,
          remotePort: socket.remotePort,
          localAddress: socket.localAddress,
          localPort: socket.localPort,
          firstBytes: chunk.toString('utf8').slice(0, 120),
          firstHex: chunk.toString('hex').slice(0, 120),
        });
      } catch (e) {}
    }
    if (handled) return;
    headerBuffer += chunk.toString('utf8');
    var idx = headerBuffer.indexOf('\r\n\r\n');
    if (idx < 0) return;

    var rawHead = headerBuffer.slice(0, idx);
    var request = parseHeaders(rawHead);
    var contentLength = parseInt(request.headers['content-length'] || '0', 10) || 0;
    var bodyStart = idx + 4;
    if (headerBuffer.length < bodyStart + contentLength) return;

    handled = true;
    request.body = contentLength > 0 ? headerBuffer.slice(bodyStart, bodyStart + contentLength) : '';
    socket.removeListener('data', onData);
    self.routeRequest(socket, request);
  }

  socket.on('data', onData);
  socket.on('close', function () {
    try {
      var closeLine = '[Cast][CLOSE] ' + JSON.stringify({
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        localAddress: socket.localAddress,
        localPort: socket.localPort,
      });
      console.log(closeLine);
      pushCastDebug('close', {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        localAddress: socket.localAddress,
        localPort: socket.localPort,
      });
    } catch (e) {}
  });
};

CastLanServer.prototype.routeRequest = function (socket, request) {
  var path = request.path || '/';
  try {
    var line = '[Cast][HTTP] ' + JSON.stringify({
      method: request.method,
      path: path,
      headers: request.headers,
      body: request.body ? request.body.slice(0, 512) : '',
    });
    console.log(line);
    pushCastDebug('http', {
      method: request.method,
      path: path,
      headers: request.headers,
      body: request.body ? request.body.slice(0, 512) : '',
    });
  } catch (e) {}
  if (request.method === 'SETUP' && path === '/projection') {
    var session = new nvaSession.NvaSession(
      'session-' + (this.nextSessionId++),
      socket,
      this.onFrame,
      this.handleSessionClose.bind(this)
    );
    this.controller.attachSession(session);
    session.startPing();
    socket.write([
      'NVA/1.0 200 OK',
      'Session: ' + (request.headers.session || session.id),
      'NvaVersion: 1',
      'Connection: Keep-Alive',
      'UUID: ' + this.profile.uuid,
      'User-Agent: ' + this.profile.serverName.replace(',', ''),
      '',
      ''
    ].join('\r\n'));
    return;
  }

  var body = '';
  var status = 200;
  var statusText = 'OK';
  var headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Connection': 'close' };

  if (request.method === 'GET' && path === '/description.xml') {
    body = deviceProfile.renderDescriptionXml(this.profile);
    headers['Content-Type'] = 'text/xml; charset=utf-8';
  } else if (request.method === 'GET' && path === '/dlna/AVTransport.xml') {
    body = deviceProfile.renderAvTransportScpd();
    headers['Content-Type'] = 'text/xml; charset=utf-8';
  } else if (request.method === 'GET' && path === '/dlna/RenderingControl.xml') {
    body = deviceProfile.renderAvTransportScpd();
    headers['Content-Type'] = 'text/xml; charset=utf-8';
  } else if (request.method === 'GET' && path === '/dlna/ConnectionManager.xml') {
    body = deviceProfile.renderAvTransportScpd();
    headers['Content-Type'] = 'text/xml; charset=utf-8';
  } else if (request.method === 'GET' && path === '/dlna/NirvanaControl.xml') {
    body = deviceProfile.renderNirvanaScpd();
    headers['Content-Type'] = 'text/xml; charset=utf-8';
  } else if (request.method === 'POST' && (path === '/AVTransport/action' || path === '/RenderingControl/action' || path === '/ConnectionManager/action' || path === '/NirvanaControl/action')) {
    body = '';
    if (request.body) {
      pushCastDebug('soap', { path: path, body: request.body.slice(0, 1024) });
    }
  } else {
    status = 404;
    statusText = 'Not Found';
    body = 'Not Found';
  }

  headers['Content-Length'] = Buffer.byteLength(body);
  if (request.method === 'POST' && body && !headers['Content-Type']) {
    headers['Content-Type'] = 'text/xml; charset=utf-8';
  }
  socket.end(httpResponse(status, statusText, headers, body));
};

CastLanServer.prototype.handleSessionClose = function (session) {
  this.controller.detachSession(session.id);
};

CastLanServer.prototype.broadcastAlive = function () {
  var self = this;
  if (!self.udpServer) return;
  deviceProfile.getSsdpNotifyPackets(self.profile).forEach(function (packet) {
    self.udpServer.send(Buffer.from(packet), 1900, '239.255.255.250');
  });
};

CastLanServer.prototype.stop = function () {
  if (this.broadcastTimer) clearInterval(this.broadcastTimer);
  if (this.udpServer) {
    try { this.udpServer.close(); } catch (e) {}
  }
  if (this.tcpServer) {
    try { this.tcpServer.close(); } catch (e) {}
  }
};

module.exports = {
  CastLanServer: CastLanServer,
};
