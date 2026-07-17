import React, { useState, useEffect, useRef } from 'react';
import { getHistory } from '../api/client';
import VideoGrid from '../components/VideoGrid';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { useResponsiveGridCols } from '../hooks/useResponsiveGridCols';
import { restoreFocusIfMissing } from '../hooks/useFocus';
import { scheduleDefaultGridFocus } from './pageFocus';

export default function HistoryPage({ onPlayVideo }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const gridCols = useResponsiveGridCols();
  const previousGridColsRef = useRef(gridCols);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        setError('加载超时');
      }
    }, 10000);

    async function load() {
      try {
        const res = await getHistory(0, 0, 24);
        if (cancelled) return;
        if (res?.code === -101) {
          setError('请先登录');
        } else if (res?.data?.list) {
          setVideos(
            res.data.list.map((item) => ({
              bvid: item.history?.bvid,
              cid: item.history?.cid,
              title: item.title,
              pic: item.cover,
              duration: item.duration,
              progress: item.progress,
              owner: { name: item.author_name },
            })),
          );
        } else {
          setError(res?.message || '加载失败');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    return scheduleDefaultGridFocus({
      enabled: !loading && !error && videos.length > 0,
    });
  }, [error, loading, videos.length]);

  useEffect(() => {
    if (previousGridColsRef.current === gridCols) return;
    previousGridColsRef.current = gridCols;
    if (loading || error || videos.length === 0) return;

    const timer = globalThis.setTimeout(
      () => restoreFocusIfMissing('content-0-0'),
      0,
    );
    return () => globalThis.clearTimeout(timer);
  }, [error, gridCols, loading, videos.length]);

  return (
    <div className="page-shell page-scroll">
      <PageHeader
        eyebrow="HISTORY"
        title="最近观看"
        description="从上次停下的位置继续"
      />
      {loading ? (
        <PageState state="loading" />
      ) : error ? (
        <PageState
          state={error === '请先登录' ? 'unauthenticated' : 'error'}
          message={error}
        />
      ) : (
        <VideoGrid
          videos={videos}
          group="content"
          startRow={0}
          cols={gridCols}
          onSelect={onPlayVideo}
        />
      )}
    </div>
  );
}
