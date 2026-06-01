import { useEffect, useRef, useState } from 'react';
import { getLiveDanmakuInfo } from '../api/client';
import {
  buildLiveDanmakuAuthPacket,
  buildLiveDanmakuHeartbeatPacket,
  getPreferredLiveDanmakuProtover,
  parseLiveDanmakuMessages,
} from './liveDanmakuProtocol';

function resolveLiveDanmakuUrl(info) {
  const host = info?.data?.host_list?.[0];
  if (!host?.host) return null;
  return `wss://${host.host}:${host.wss_port || 443}/sub`;
}

export function useLiveDanmaku(roomId, enabled) {
  const [danmakus, setDanmakus] = useState([]);
  const [available, setAvailable] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || !roomId || typeof WebSocket === 'undefined') {
      setAvailable(false);
      if (typeof WebSocket === 'undefined' && enabled && console.warn) {
        console.warn('[live-danmaku] WebSocket is not available');
      }
      return;
    }

    let cancelled = false;
    let socket = null;
    let heartbeatTimer = null;

    async function connect() {
      try {
        const info = await getLiveDanmakuInfo(roomId);
        const url = resolveLiveDanmakuUrl(info);
        const token = info?.data?.token;
        if (!url || !token) {
          throw new Error('live-danmaku-auth-missing');
        }

        const protover = getPreferredLiveDanmakuProtover();
        socket = new WebSocket(url);
        socket.binaryType = 'arraybuffer';
        startedAtRef.current = Date.now();

        socket.onopen = () => {
          if (cancelled || !socket) return;
          socket.send(buildLiveDanmakuAuthPacket(roomId, token, protover));
          socket.send(buildLiveDanmakuHeartbeatPacket());
          heartbeatTimer = setInterval(() => {
            try {
              socket?.send(buildLiveDanmakuHeartbeatPacket());
            } catch {}
          }, 30000);
          setAvailable(true);
        };

        socket.onmessage = async (event) => {
          if (cancelled) return;
          const nowSec = Math.max(
            0,
            (Date.now() - startedAtRef.current) / 1000,
          );
          const messages = await parseLiveDanmakuMessages(event.data, nowSec);
          if (!cancelled) setCurrentTime(nowSec);
          if (!cancelled && messages.length > 0) {
            setDanmakus((prev) => prev.concat(messages).slice(-300));
          }
        };

        socket.onerror = () => {
          if (console.warn) console.warn('[live-danmaku] WebSocket error');
          setAvailable(false);
        };

        socket.onclose = () => {
          setAvailable(false);
        };
      } catch (err) {
        if (console.warn) {
          console.warn('[live-danmaku] Live danmaku unavailable:', err);
        }
        if (!cancelled) setAvailable(false);
      }
    }

    connect();

    return () => {
      cancelled = true;
      setAvailable(false);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      try {
        socket?.close?.();
      } catch {}
    };
  }, [roomId, enabled]);

  return { danmakus, available, currentTime };
}
