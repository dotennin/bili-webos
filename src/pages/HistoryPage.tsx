import React, { useState, useEffect } from 'react';
import { getHistory } from '../api/client';
import VideoGrid from '../components/VideoGrid';
import { storage } from '../utils/storage';
import { mergeRecentHistory } from './history';
import { scheduleDefaultGridFocus } from './pageFocus';

export default function HistoryPage({ onPlayVideo, refreshKey }) {
  const [videos, setVideos] = useState([]);
  const [remoteStatus, setRemoteStatus] = useState('loading');
  const [remoteMessage, setRemoteMessage] = useState('');
  const [gridCols] = useState(() => storage.getSettings().videoGridCols || 3);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let timer;

    const localEntries = storage.getCastRecentHistory();
    const localVideos = mergeRecentHistory([], localEntries);
    setVideos(localVideos);
    setRemoteStatus('loading');
    setRemoteMessage('');

    timer = setTimeout(() => {
      if (cancelled) return;
      settled = true;
      setRemoteStatus('timeout');
      setRemoteMessage('加载超时');
    }, 10000);

    async function load() {
      try {
        const res = await getHistory(0, 0, 24);
        if (cancelled || settled) return;
        if (res?.code === 0 && Array.isArray(res?.data?.list)) {
          setVideos(mergeRecentHistory(res.data.list, localEntries));
          setRemoteStatus('success');
          setRemoteMessage('');
        } else if (res?.code === -101) {
          setRemoteStatus('logged-out');
          setRemoteMessage('请先登录');
        } else {
          setRemoteStatus('error');
          setRemoteMessage(res?.message || '加载失败');
        }
      } catch (err) {
        if (!cancelled && !settled) {
          setRemoteStatus('error');
          setRemoteMessage(err.message);
        }
      }
      if (!cancelled && !settled) clearTimeout(timer);
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refreshKey]);

  useEffect(() => {
    return scheduleDefaultGridFocus({
      enabled: remoteStatus !== 'loading' && videos.length > 0,
    });
  }, [remoteStatus, videos.length]);

  const remoteUnavailable = ['logged-out', 'error', 'timeout'].includes(
    remoteStatus,
  );
  const hasVideos = videos.length > 0;

  if (remoteStatus === 'loading' && !hasVideos) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        加载中...
      </div>
    );
  }
  if (remoteUnavailable && !hasVideos) {
    return (
      <div>
        <div className="page-title">最近观看</div>
        <div className="empty-state">{remoteMessage}</div>
      </div>
    );
  }
  return (
    <div className="content-scroll">
      <div className="section-title">最近观看</div>
      {remoteStatus === 'loading' && hasVideos && (
        <div className="history-notice">正在加载远程历史...</div>
      )}
      {remoteUnavailable && (
        <div className="history-notice">{remoteMessage}</div>
      )}
      {hasVideos ? (
        <VideoGrid
          videos={videos}
          group="content"
          startRow={0}
          cols={gridCols}
          onSelect={onPlayVideo}
        />
      ) : (
        <div className="empty-state">暂无观看记录</div>
      )}
    </div>
  );
}
