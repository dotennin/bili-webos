import React, { useState, useEffect, useRef } from 'react';
import {
  getPopular,
  getRecommend,
  getRegionDynamic,
  getFollowFeed,
  getLiveList,
} from '../api/client';
import VideoGrid from '../components/VideoGrid';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { onFocusChange, restoreFocusIfMissing } from '../hooks/useFocus';
import { useResponsiveGridCols } from '../hooks/useResponsiveGridCols';
import { scheduleDefaultGridFocus } from './pageFocus';

const FETCH_SIZE = 20;

const MODE_COPY = {
  recommend: ['DISCOVER', '为你推荐', '精选内容，方向键即可浏览'],
  hot: ['TRENDING', '热门', '正在受到关注的内容'],
  live: ['LIVE', '直播', '发现正在直播的精彩内容'],
  partition: ['CHANNELS', '分区', '探索不同兴趣分区'],
  follow: ['FOLLOWING', '关注', '查看关注 UP 主的最新内容'],
};

async function fetchByMode(mode, pn) {
  if (mode === 'hot') {
    const res = await getPopular(pn, FETCH_SIZE);
    return res?.data?.list || [];
  } else if (mode === 'live') {
    const res = await getLiveList(pn, FETCH_SIZE);
    const items = res?.data?.list || res?.data?.recommend_room_list || [];
    return items.map((item) => ({
      bvid: `live-${item.roomid}`,
      title: item.title,
      pic: item.cover || item.system_cover,
      owner: { name: item.uname },
      stat: { view: item.online || item.watched_show?.num },
      isLive: true,
      roomid: item.roomid,
    }));
  } else if (mode === 'partition') {
    const rids = [1, 3, 4, 5, 17, 36, 160, 188, 211];
    const rid = rids[Math.floor(Math.random() * rids.length)];
    const res = await getRegionDynamic(rid, pn, FETCH_SIZE);
    return res?.data?.archives || [];
  } else if (mode === 'follow') {
    const res = await getFollowFeed(pn, FETCH_SIZE);
    return (res?.data?.items || [])
      .map((item) => {
        const archive = item.modules?.module_dynamic?.major?.archive;
        if (!archive) return null;
        return {
          bvid: archive.bvid,
          title: archive.title,
          pic: archive.cover,
          duration: archive.duration_text,
          pubdate: archive.pubdate,
          owner: { name: item.modules?.module_author?.name },
          stat: { view: archive.stat?.play },
        };
      })
      .filter(Boolean);
  } else {
    const res = await getRecommend(4, FETCH_SIZE);
    return res?.data?.item || [];
  }
}

type HomePageProps = {
  onPlayVideo?: (video: any) => void;
  refreshKey?: number;
  mode?: string;
};

export default function HomePage({
  onPlayVideo,
  refreshKey,
  mode = 'recommend',
}: HomePageProps) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const gridCols = useResponsiveGridCols();
  const previousGridColsRef = useRef(gridCols);
  const pageRef = useRef(1);
  const seenRef = useRef(new Set());
  const fetchingRef = useRef(false);

  // Load
  useEffect(() => {
    let cancelled = false;
    seenRef.current = new Set();
    pageRef.current = 1;
    setLoading(true);
    setError('');
    setVideos([]);

    fetchByMode(mode, 1)
      .then((items) => {
        if (cancelled) return;
        setVideos(dedupe(items));
        setLoading(false);
        pageRef.current = 2;
      })
      .catch(() => {
        if (!cancelled) {
          setError('内容加载失败，请稍后重试');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey, mode]);

  useEffect(() => {
    return scheduleDefaultGridFocus({
      enabled: !loading && videos.length > 0,
    });
  }, [loading]);

  useEffect(() => {
    if (previousGridColsRef.current === gridCols) return;
    previousGridColsRef.current = gridCols;
    if (loading || videos.length === 0) return;

    const timer = globalThis.setTimeout(
      () => restoreFocusIfMissing('content-0-0'),
      0,
    );
    return () => globalThis.clearTimeout(timer);
  }, [gridCols, loading, videos.length]);

  function dedupe(items) {
    return items.filter((v) => {
      const id = v.bvid || v.bv_id;
      if (!id || seenRef.current.has(id)) return false;
      seenRef.current.add(id);
      return true;
    });
  }

  // Track focus row for transform scroll + load more
  useEffect(() => {
    return onFocusChange((fid) => {
      if (!fid) return;
      const m = fid.match(/^content-(\d+)-/);
      if (!m) return;
      const row = parseInt(m[1]);

      // Load more when near bottom
      const totalRows = Math.ceil(videos.length / gridCols);
      if (row >= totalRows - 2 && !fetchingRef.current) {
        fetchingRef.current = true;
        fetchByMode(mode, pageRef.current)
          .then((items) => {
            const unique = dedupe(items);
            if (unique.length > 0) setVideos((prev) => [...prev, ...unique]);
            pageRef.current++;
            fetchingRef.current = false;
          })
          .catch(() => {
            fetchingRef.current = false;
          });
      }
    });
  }, [videos.length, mode, gridCols]);

  if (loading) {
    return <PageState state="loading" />;
  }

  const [eyebrow, title, description] = MODE_COPY[mode] || MODE_COPY.recommend;

  return (
    <div className="page-shell page-scroll">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      {error ? (
        <PageState state="error" message={error} />
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
