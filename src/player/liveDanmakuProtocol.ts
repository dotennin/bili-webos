import { storage } from '../utils/storage';

const HEADER_SIZE = 16;
const OP_HEARTBEAT = 2;
const OP_MESSAGE = 5;
const OP_AUTH = 7;
const DEFAULT_SEQUENCE = 1;

type LiveDanmakuMessage = {
  time: number;
  mode: number;
  size: number;
  color: string;
  text: string;
};

function textEncoder() {
  return new TextEncoder();
}

function textDecoder() {
  return new TextDecoder();
}

export function canInflateLiveDanmaku() {
  return typeof DecompressionStream !== 'undefined';
}

export function getPreferredLiveDanmakuProtover() {
  return canInflateLiveDanmaku() ? 2 : 0;
}

export function buildLiveDanmakuPacket(
  op: number,
  body?: string | Uint8Array,
  protover = 1,
) {
  const bodyBytes =
    typeof body === 'string'
      ? textEncoder().encode(body)
      : body || new Uint8Array();
  const buffer = new ArrayBuffer(HEADER_SIZE + bodyBytes.length);
  const view = new DataView(buffer);
  view.setUint32(0, HEADER_SIZE + bodyBytes.length);
  view.setUint16(4, HEADER_SIZE);
  view.setUint16(6, protover);
  view.setUint32(8, op);
  view.setUint32(12, DEFAULT_SEQUENCE);
  new Uint8Array(buffer, HEADER_SIZE).set(bodyBytes);
  return buffer;
}

export function buildLiveDanmakuHeartbeatPacket() {
  return buildLiveDanmakuPacket(OP_HEARTBEAT, undefined, 1);
}

export function buildLiveDanmakuAuthPacket(
  roomId,
  token,
  protover,
  authOverride?,
) {
  const auth = authOverride || storage.getAuth() || {};
  return buildLiveDanmakuPacket(
    OP_AUTH,
    JSON.stringify({
      uid: Number(auth.DedeUserID || 0),
      roomid: Number(roomId),
      protover,
      buvid: auth.buvid3 || auth.buvid || '',
      platform: 'web',
      type: 2,
      key: token || '',
    }),
    1,
  );
}

function parseColor(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '#ffffff';
  return '#' + num.toString(16).padStart(6, '0');
}

function parseDanmakuJson(json, nowSec): LiveDanmakuMessage[] {
  if (!json || json.cmd !== 'DANMU_MSG') return [];
  const info = json.info || [];
  const item = info[0] || [];
  const text = info[1];
  if (!text) return [];
  return [
    {
      time: nowSec,
      mode: Number(item[1]) || 1,
      size: Number(item[2]) || 28,
      color: parseColor(item[3]),
      text: String(text),
    },
  ];
}

function parsePlainBody(body, nowSec) {
  try {
    return parseDanmakuJson(JSON.parse(textDecoder().decode(body)), nowSec);
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[live-danmaku] Failed to parse live packet:', err);
    }
    return [];
  }
}

async function inflateZlib(body) {
  if (!canInflateLiveDanmaku()) return null;
  try {
    const stream = new Blob([body])
      .stream()
      .pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[live-danmaku] Failed to inflate compressed packet:', err);
    }
    return null;
  }
}

export async function parseLiveDanmakuMessages(data, nowSec = 0) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const messages: LiveDanmakuMessage[] = [];
  let offset = 0;

  while (offset + HEADER_SIZE <= bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const packetLength = view.getUint32(0);
    const headerLength = view.getUint16(4);
    const protover = view.getUint16(6);
    const op = view.getUint32(8);
    if (
      packetLength < headerLength ||
      headerLength < HEADER_SIZE ||
      offset + packetLength > bytes.byteLength
    ) {
      break;
    }

    const body = bytes.slice(offset + headerLength, offset + packetLength);
    if (op === OP_MESSAGE) {
      if (protover === 0 || protover === 1) {
        messages.push(...parsePlainBody(body, nowSec));
      } else if (protover === 2) {
        const inflated = await inflateZlib(body);
        if (inflated) {
          messages.push(...(await parseLiveDanmakuMessages(inflated, nowSec)));
        }
      } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[live-danmaku] Unsupported live packet protover:',
          protover,
        );
      }
    }

    offset += packetLength;
  }

  return messages;
}
