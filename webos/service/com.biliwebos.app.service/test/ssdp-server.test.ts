import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import net from 'node:net';
import { CastLanServer } from '../src/cast/ssdpServer.ts';

let udpSockets;
let tcpServers;
let intervalFns;
let originalCreateSocket;
let originalCreateServer;
let originalSetInterval;
let originalClearInterval;

function createUdpSocket() {
  const handlers = {};
  return {
    handlers,
    sent: [],
    on(event, handler) {
      handlers[event] = handler;
    },
    bind(_port, cb) {
      cb();
    },
    addMembership(addr) {
      this.membership = addr;
    },
    setBroadcast(value) {
      this.broadcast = value;
    },
    setMulticastTTL(value) {
      this.ttl = value;
    },
    send(buffer, port, address) {
      this.sent.push({ buffer: buffer.toString(), port, address });
    },
    close() {},
  };
}

function createTcpServer() {
  const handlers = {};
  return {
    handlers,
    listenCalls: [],
    on(event, handler) {
      handlers[event] = handler;
    },
    listen(port, host, cb) {
      this.listenCalls.push({ port, host });
      if (cb) cb();
    },
    close() {},
  };
}

beforeEach(() => {
  udpSockets = [];
  tcpServers = [];
  intervalFns = [];
  originalCreateSocket = dgram.createSocket;
  originalCreateServer = net.createServer;
  originalSetInterval = global.setInterval;
  originalClearInterval = global.clearInterval;
  dgram.createSocket = function () {
    const socket = createUdpSocket();
    udpSockets.push(socket);
    return socket;
  };
  net.createServer = function () {
    const server = createTcpServer();
    tcpServers.push(server);
    return server;
  };
  global.setInterval = (fn) => {
    intervalFns.push(fn);
    return { fn };
  };
  global.clearInterval = () => {};
});

afterEach(() => {
  dgram.createSocket = originalCreateSocket;
  net.createServer = originalCreateServer;
  global.setInterval = originalSetInterval;
  global.clearInterval = originalClearInterval;
});

test('CastLanServer handles UDP discovery, TCP startup, alive broadcast, and stop', () => {
  const server = new CastLanServer({
    profile: {
      httpPort: 9000,
      uuid: 'uuid-1',
      serverName: 'Bili,TV',
      friendlyName: 'TV',
      ip: '192.168.1.2',
    },
    controller: { attachSession() {}, detachSession() {} },
    onFrame() {},
  });
  server.start(() => {});
  assert.equal(udpSockets[0].membership, '239.255.255.250');
  intervalFns[0]();
  expect(udpSockets[0].sent.some((entry) => entry.address === '239.255.255.250')).toBe(true);
});

test('CastLanServer routes HTTP and projection setup requests', () => {
  const controller = {
    attachSession: mock(() => {}),
    detachSession: mock(() => {}),
  };
  const onFrame = mock(() => {});
  const server = new CastLanServer({
    profile: {
      httpPort: 9001,
      uuid: 'uuid-2',
      serverName: 'Bili,TV',
      friendlyName: 'TV',
      ip: '192.168.1.3',
    },
    controller,
    onFrame,
  });

  const xmlSocket = {
    ended: '',
    end(payload) {
      this.ended = payload;
    },
  };
  server.routeRequest(xmlSocket, {
    method: 'GET',
    path: '/description.xml',
    headers: {},
  });
  expect(xmlSocket.ended).toContain('200 OK');
  expect(xmlSocket.ended).toContain('Content-Type: text/xml; charset=utf-8');

  const actionSocket = {
    ended: '',
    end(payload) {
      this.ended = payload;
    },
  };
  server.routeRequest(actionSocket, {
    method: 'POST',
    path: '/AVTransport/action',
    headers: {},
  });
  expect(actionSocket.ended).toContain('200 OK');

  const notFoundSocket = {
    ended: '',
    end(payload) {
      this.ended = payload;
    },
  };
  server.routeRequest(notFoundSocket, {
    method: 'GET',
    path: '/missing',
    headers: {},
  });
  expect(notFoundSocket.ended).toContain('404 Not Found');

  const projectionSocket = {
    writes: [],
    on: mock(() => {}),
    removeListener: mock(() => {}),
    write(payload) {
      this.writes.push(payload);
    },
  };
  server.routeRequest(projectionSocket, {
    method: 'SETUP',
    path: '/projection',
    headers: { session: 'session-client' },
  });
  expect(controller.attachSession).toHaveBeenCalled();
  expect(projectionSocket.writes[0]).toContain('NVA/1.0 200 OK');
  expect(projectionSocket.writes[0]).toContain('Session: session-client');
});

test('CastLanServer handles tcp port conflict and request parsing from socket data', () => {
  const controller = {
    attachSession: mock(() => {}),
    detachSession: mock(() => {}),
  };
  const server = new CastLanServer({
    profile: {
      httpPort: 9010,
      uuid: 'uuid-3',
      serverName: 'Bili,TV',
      friendlyName: 'TV',
      ip: '192.168.1.4',
    },
    controller,
    onFrame() {},
  });

  server.startTcp(() => {});
  tcpServers[0].handlers.error({ code: 'EADDRINUSE', message: 'busy' });
  expect(server.tcpPort).toBe(9011);
  expect(server.profile.httpPort).toBe(9011);

  const socketHandlers = {};
  const socket = {
    ended: '',
    on(event, handler) {
      socketHandlers[event] = handler;
    },
    removeListener: mock(() => {}),
    end(payload) {
      this.ended = payload;
    },
  };
  server.handleSocket(socket);
  socketHandlers.data(
    Buffer.from('GET /dlna/NirvanaControl.xml HTTP/1.1\r\nHost: tv\r\n\r\n'),
  );
  expect(socket.ended).toContain('200 OK');
  expect(socket.ended).toContain('GetAppInfo');
});

test('CastLanServer ignores non-discovery packets and cleans up sessions and sockets', () => {
  const originalConsoleError = console.error;
  const errorCalls = [];
  console.error = (...args) => {
    errorCalls.push(args);
  };

  const controller = {
    attachSession: mock(() => {}),
    detachSession: mock(() => {}),
  };
  const server = new CastLanServer({
    profile: {
      httpPort: 9012,
      uuid: 'uuid-4',
      serverName: 'Bili,TV',
      friendlyName: 'TV',
      ip: '192.168.1.5',
    },
    controller,
    onFrame() {},
  });

  server.startUdp();
  udpSockets[0].handlers.message(Buffer.from('NOTIFY * HTTP/1.1\r\n\r\n'), {
    port: 1900,
    address: '192.168.1.10',
  });
  expect(udpSockets[0].sent).toHaveLength(0);

  udpSockets[0].handlers.error({ message: 'udp broke' });
  expect(errorCalls[0]).toEqual(['[Cast][SSDP] error:', 'udp broke']);

  server.handleSessionClose({ id: 'session-44' });
  expect(controller.detachSession).toHaveBeenCalledWith('session-44');

  const closeUdp = mock(() => {});
  const closeTcp = mock(() => {});
  server.broadcastTimer = { id: 1 };
  server.udpServer = { close: closeUdp };
  server.tcpServer = { close: closeTcp };
  server.stop();
  expect(closeUdp).toHaveBeenCalled();
  expect(closeTcp).toHaveBeenCalled();

  console.error = originalConsoleError;
});

test('CastLanServer keeps tcp port on non-EADDRINUSE errors and parses chunked headers once', () => {
  const originalConsoleError = console.error;
  console.error = () => {};

  const server = new CastLanServer({
    profile: {
      httpPort: 9013,
      uuid: 'uuid-5',
      serverName: 'Bili,TV',
      friendlyName: 'TV',
      ip: '192.168.1.6',
    },
    controller: { attachSession() {}, detachSession() {} },
    onFrame() {},
  });

  server.startTcp(() => {});
  tcpServers[0].handlers.error({ code: 'ECONNRESET', message: 'reset' });
  expect(server.tcpPort).toBe(9013);

  const socketHandlers = {};
  const socket = {
    ended: '',
    on(event, handler) {
      socketHandlers[event] = handler;
    },
    removeListener: mock(() => {}),
    end(payload) {
      this.ended = payload;
    },
  };
  server.handleSocket(socket);
  socketHandlers.data(Buffer.from('GET /description.xml HTTP/1.1\r\nHost: tv'));
  expect(socket.ended).toBe('');
  socketHandlers.data(Buffer.from('\r\n\r\n'));
  expect(socket.ended).toContain('200 OK');
  expect(socket.ended).toContain('friendlyName');
  expect(socket.removeListener).toHaveBeenCalled();

  console.error = originalConsoleError;
});
