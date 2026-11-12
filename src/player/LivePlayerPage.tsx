import React, { useState, useEffect, useRef } from 'react';
import { getLiveStreamSource, castReportState } from '../api/client';
import { buildProxyUrl, getProxyBase } from '../utils/proxy';
import { setCustomKeyHandler } from '../hooks/useFocus';
import { storage } from '../utils/storage';
import DanmakuLayer from './DanmakuLayer';
import PlayerControllerOverlay from './PlayerControllerOverlay';
import { useLiveDanmaku } from './useLiveDanmaku';

const CONTROLS = ['play', 'danmaku'];

function getMpegtsModule(mod) {
  return mod?.default || mod;
}

function configureShakaForLive(player) {
  player.configure({
    streaming: {
      lowLatencyMode: true,
      bufferingGoal: 3,
      rebufferingGoal: 0.8,
      bufferBehind: 12,
      stallEnabled: true,
      stallThreshold: 0.5,
    },
  });
}

type LivePlayerPageProps = {
  room: { roomid: string | number; title?: string; owner?: { name?: string } };
  onBack?: () => void;
};

export default function LivePlayerPage({ room, onBack }: LivePlayerPageProps) {
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [danmakuEnabled, setDanmakuEnabled] = useState(
    () => storage.getSettings().danmaku,
  );
  const controlsTimer = useRef(null);
  const { danmakus, currentTime: liveDanmakuTime } = useLiveDanmaku(
    room.roomid,
    danmakuEnabled,
  );

  function hideControlsLater() {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  }

  function showLiveControls() {
    setShowControls(true);
    hideControlsLater();
  }

  function togglePlay() {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
      castReportState({ playState: 'paused' }).catch(() => {});
    } else {
      videoRef.current.play();
      setPlaying(true);
      castReportState({ playState: 'playing' }).catch(() => {});
    }
  }

  function handleControlPress(control) {
    if (control === 'play') {
      togglePlay();
      showLiveControls();
      return;
    }
    if (control === 'danmaku') {
      setDanmakuEnabled((prev) => !prev);
      showLiveControls();
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    let player;
    let firstFrameTimer: ReturnType<typeof setInterval> | undefined;
    let firstFrameReady = false;
    const isActive = () => active && videoRef.current === video;

    function stopFirstFramePoll() {
      clearInterval(firstFrameTimer);
      firstFrameTimer = undefined;
    }

    async function dispose() {
      active = false;
      stopFirstFramePoll();
      const instance = player;
      player = null;
      await instance?.destroy();
    }

    function finishLoading() {
      if (!isActive()) return;
      firstFrameReady = true;
      stopFirstFramePoll();
      setLoading(false);
      castReportState({ playState: 'playing' }).catch(() => {});
      setPlaying(true);
    }

    function watchFirstFrame() {
      if (!isActive() || firstFrameReady) return;
      firstFrameTimer = setInterval(() => {
        if ((video.currentTime || 0) > 0 || (video.readyState || 0) >= 2) {
          finishLoading();
        }
      }, 200);
    }

    async function loadHlsPlayer(url) {
      const shaka: any = await import('shaka-player');
      if (!isActive()) return;
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) {
        throw new Error('shaka-live-not-supported');
      }

      const shakaPlayer = new shaka.Player();
      player = shakaPlayer;
      configureShakaForLive(shakaPlayer);
      await shakaPlayer.attach(video);
      if (!isActive()) return;
      shakaPlayer.addEventListener('error', (e) => {
        if (!isActive()) return;
        console.error('Live Shaka error:', e.detail);
        castReportState({
          playState: 'error',
          error: e.detail?.message || 'live-shaka-error',
        }).catch(() => {});
      });

      const proxyBase = getProxyBase();
      shakaPlayer
        .getNetworkingEngine()
        .registerRequestFilter((type, request) => {
          if (!request.uris?.[0]) return;
          if (request.uris[0].startsWith(`${proxyBase}/proxy/`)) return;
          const originalUrl = new URL(request.uris[0], url);
          request.uris[0] = `${proxyBase}/proxy/${originalUrl.host}${originalUrl.pathname}${originalUrl.search}`;
        });

      await shakaPlayer.load(buildProxyUrl(url));
      if (!isActive()) return;
      await video.play();
    }

    async function loadFlvPlayer(url) {
      const mod = await import('mpegts.js');
      if (!isActive()) return;
      const mpegts = getMpegtsModule(mod);
      if (
        !mpegts?.isSupported?.() ||
        !mpegts?.getFeatureList?.()?.mseLivePlayback
      ) {
        throw new Error('mpegts-live-not-supported');
      }

      const flvPlayer = mpegts.createPlayer(
        {
          type: 'flv',
          isLive: true,
          cors: true,
          withCredentials: false,
          url: buildProxyUrl(url),
        },
        {
          enableWorker: true,
          enableStashBuffer: true,
          stashInitialSize: 256 * 1024,
          isLive: true,
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 2,
          liveBufferLatencyMinRemain: 0.9,
          liveSync: true,
          liveSyncMaxLatency: 1.8,
          liveSyncTargetLatency: 1.1,
          liveSyncPlaybackRate: 1.05,
          lazyLoad: false,
          deferLoadAfterSourceOpen: false,
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 20,
          autoCleanupMinBackwardDuration: 10,
        },
      );

      player = flvPlayer;
      flvPlayer.on(mpegts.Events.ERROR, (errorType, errorDetail, errorInfo) => {
        if (!isActive()) return;
        console.error('Live mpegts error:', errorType, errorDetail, errorInfo);
        castReportState({
          playState: 'error',
          error:
            errorInfo?.msg || errorDetail || errorType || 'live-mpegts-error',
        }).catch(() => {});
      });

      flvPlayer.attachMediaElement(video);
      flvPlayer.load();
      await flvPlayer.play();
      finishLoading();
    }

    async function load() {
      try {
        castReportState({ playState: 'loading' }).catch(() => {});
        const source = await getLiveStreamSource(room.roomid);
        if (!isActive()) return;
        if (!source) {
          throw new Error('live-stream-source-missing');
        }

        if (source.type === 'flv') await loadFlvPlayer(source.url);
        else await loadHlsPlayer(source.url);
        watchFirstFrame();
      } catch (err) {
        if (!isActive()) return;
        dispose().catch(() => {});
        console.error('Live stream error:', err);
        setLoading(false);
        setPlaying(false);
        castReportState({
          playState: 'error',
          error: err?.message || 'live-load-failed',
        }).catch(() => {});
      }
    }

    const onTimeUpdate = () => {
      if ((video.currentTime || 0) > 0) finishLoading();
    };
    const onWaiting = () => {
      if (!isActive()) return;
      castReportState({ playState: 'loading' }).catch(() => {});
    };
    const onPause = () => {
      if (!isActive() || video.ended) return;
      setPlaying(false);
      castReportState({ playState: 'paused' }).catch(() => {});
    };
    const onEnded = () => {
      if (!isActive()) return;
      setPlaying(false);
      castReportState({ playState: 'stop' }).catch(() => {});
    };

    setLoading(true);
    setPlaying(false);
    video.addEventListener('playing', finishLoading);
    video.addEventListener('loadeddata', finishLoading);
    video.addEventListener('canplay', finishLoading);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    void load();
    return () => {
      dispose().catch(() => {});
      video.removeEventListener('playing', finishLoading);
      video.removeEventListener('loadeddata', finishLoading);
      video.removeEventListener('canplay', finishLoading);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      castReportState({ playState: 'stop' }).catch(() => {});
    };
  }, [room.roomid]);

  useEffect(() => {
    storage.setSettings({ ...storage.getSettings(), danmaku: danmakuEnabled });
  }, [danmakuEnabled]);

  useEffect(() => {
    const handleCastCommand = (event) => {
      const command = event.detail;
      if (!command) return;
      if (command.type === 'stop') {
        onBack?.();
        return;
      }
      if (!videoRef.current) return;
      if (command.type === 'pause') {
        videoRef.current.pause();
        setPlaying(false);
        castReportState({ playState: 'paused' }).catch(() => {});
        return;
      }
      if (command.type === 'resume') {
        videoRef.current.play();
        setPlaying(true);
        castReportState({ playState: 'playing' }).catch(() => {});
        return;
      }
      if (command.type === 'switchDanmaku') {
        setDanmakuEnabled(!!command.open);
        return;
      }
      if (command.type === 'seek' && videoRef.current.duration) {
        videoRef.current.currentTime = Math.max(0, command.positionSec || 0);
      }
    };

    window.addEventListener('bili-cast-command', handleCastCommand);
    return () =>
      window.removeEventListener('bili-cast-command', handleCastCommand);
  }, [onBack]);

  useEffect(() => {
    const handler = (e) => {
      const keyCode = Number(e.keyCode || e.which || 0);
      const key = e.key || '';
      const isMediaPlay = key === 'MediaPlay' || keyCode === 415;
      const isMediaPause = key === 'MediaPause' || keyCode === 19;
      const isMediaPlayPause = key === 'MediaPlayPause';

      if (
        keyCode === 461 ||
        key === 'Backspace' ||
        key === 'GoBack' ||
        key === 'Escape'
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (showControls) {
          setShowControls(false);
          if (controlsTimer.current) clearTimeout(controlsTimer.current);
        } else {
          onBack();
        }
        return true;
      }

      if (isMediaPause || isMediaPlay || isMediaPlayPause) {
        e.preventDefault();
        if (videoRef.current) {
          if (isMediaPause) {
            videoRef.current.pause();
            setPlaying(false);
            castReportState({ playState: 'paused' }).catch(() => {});
          } else if (isMediaPlay) {
            videoRef.current.play();
            setPlaying(true);
            castReportState({ playState: 'playing' }).catch(() => {});
          } else {
            togglePlay();
          }
        }
        showLiveControls();
        return true;
      }

      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        e.preventDefault();
        setShowControls(true);
        setFocusIdx((prev) =>
          key === 'ArrowLeft'
            ? Math.max(0, prev - 1)
            : Math.min(CONTROLS.length - 1, prev + 1),
        );
        hideControlsLater();
        return true;
      }

      if (key === 'ArrowUp' || key === 'ArrowDown') {
        e.preventDefault();
        showLiveControls();
        return true;
      }

      if (key === 'Enter') {
        e.preventDefault();
        if (!showControls) {
          showLiveControls();
          return true;
        }
        if (CONTROLS[focusIdx] === 'play') {
          togglePlay();
        } else {
          setDanmakuEnabled((prev) => !prev);
        }
        hideControlsLater();
        return true;
      }
      return false;
    };
    setCustomKeyHandler(handler);
    return () => setCustomKeyHandler(null);
  }, [focusIdx, onBack, playing, showControls]);

  return (
    <div className="player-page">
      <video
        key={room.roomid}
        ref={videoRef}
        className="player-video"
        autoPlay
      />

      <DanmakuLayer
        danmakus={danmakus}
        currentTime={liveDanmakuTime}
        enabled={danmakuEnabled && !loading}
      />

      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.8)',
            zIndex: 50,
          }}
        >
          <div className="loading">
            <div className="loading-spinner" />
            加载直播...
          </div>
        </div>
      )}

      <PlayerControllerOverlay
        title={room.title}
        subtitle={`${room.owner?.name || ''}${room.owner?.name ? ' · ' : ''}直播中`}
        visible={showControls}
        playing={playing}
        danmakuEnabled={danmakuEnabled}
        focusedIndex={focusIdx}
        onControlPress={handleControlPress}
      />

      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 30,
          background: 'rgba(255,0,0,0.8)',
          color: '#fff',
          padding: '4px 14px',
          borderRadius: 4,
          fontSize: 16,
          zIndex: 31,
        }}
      >
        LIVE
      </div>
    </div>
  );
}
