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
const MAX_DUPLICATE_PAGES = 3;

const MODE_COPY = {
  recommend: ['DISCOVER', '为你推荐', '精选内容，方向键即可浏览'],
  hot: ['TRENDING', '热门', '正在受到关注的内容'],
  live: ['LIVE', '直播', '发现正在直播的精彩内容'],
  partition: ['CHANNELS', '分区', '探索不同兴趣分区'],
  follow: ['FOLLOWING', '关注', '查看关注 UP 主的最新内容'],
};

async function fetchByMode(mode, pn, recommendOffset = 0) {
  function getFeedData(response) {
    if (response?.code != null && response.code !== 0) {
      throw new Error(response.message || '内容加载失败');
    }
    return response?.data;
  }

  if (mode === 'hot') {
    const data = getFeedData(await getPopular(pn, FETCH_SIZE));
    return data?.list || [];
  } else if (mode === 'live') {
    const data = getFeedData(await getLiveList(pn, FETCH_SIZE));
    const items = data?.list || data?.recommend_room_list || [];
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
    const data = getFeedData(await getRegionDynamic(rid, pn, FETCH_SIZE));
    return data?.archives || [];
  } else if (mode === 'follow') {
    const data = getFeedData(await getFollowFeed(pn, FETCH_SIZE));
    return (data?.items || [])
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
    const data = getFeedData(
      await getRecommend(4, FETCH_SIZE, pn + recommendOffset),
    );
    return data?.item || [];
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef(new Set());
  const fetchingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const generationRef = useRef(0);

  // Load
  useEffect(() => {
    const generation = ++generationRef.current;
    seenRef.current = new Set();
    pageRef.current = 1;
    fetchingRef.current = true;
    hasMoreRef.current = true;
    setLoading(true);
    setError('');
    setVideos([]);

    fetchByMode(mode, 1, refreshKey)
      .then((items) => {
        if (generation !== generationRef.current) return;
        setVideos(dedupe(items));
        pageRef.current = 2;
        hasMoreRef.current = items.length > 0;
      })
      .catch(() => {
        if (generation === generationRef.current) {
          setError('内容加载失败，请稍后重试');
        }
      })
      .finally(() => {
        if (generation !== generationRef.current) return;
        fetchingRef.current = false;
        setLoading(false);
      });

    return () => {
      generationRef.current++;
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

  async function loadMore() {
    if (!videos.length || fetchingRef.current || !hasMoreRef.current) return;
    const generation = generationRef.current;
    fetchingRef.current = true;
    try {
      // A recommendation page can repeat already-seen videos. Skip a few
      // duplicates so navigating at the end of the grid does not get stuck.
      for (let attempt = 0; attempt < MAX_DUPLICATE_PAGES; attempt++) {
        const items = await fetchByMode(mode, pageRef.current, refreshKey);
        if (generation !== generationRef.current) return;
        if (items.length === 0) {
          hasMoreRef.current = false;
          return;
        }
        pageRef.current++;
        const unique = dedupe(items);
        if (unique.length > 0) {
          setVideos((prev) => [...prev, ...unique]);
          return;
        }
      }
    } catch {
      // A later focus/scroll event can retry a failed request.
    } finally {
      if (generation === generationRef.current) fetchingRef.current = false;
    }
  }

  // Prefetch for TV D-pad navigation before reaching the last row.
  useEffect(() => {
    return onFocusChange((fid) => {
      if (!fid) return;
      const m = fid.match(/^content-(\d+)-/);
      if (!m) return;
      const row = parseInt(m[1]);

      // Load more when near bottom
      const totalRows = Math.ceil(videos.length / gridCols);
      if (row >= totalRows - 2) loadMore();
    });
  }, [videos.length, mode, gridCols, refreshKey]);

  // Also load more for pointer, touch and mouse-wheel scrolling.
  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 400) loadMore();
  }

  // Fill the viewport when the API returns fewer cards than one screen.
  useEffect(() => {
    const el = scrollRef.current;
    if (
      !loading &&
      el &&
      el.clientHeight > 0 &&
      el.scrollHeight <= el.clientHeight + 400
    ) {
      loadMore();
    }
  }, [loading, videos.length, mode, refreshKey]);

  if (loading) {
    return <PageState state="loading" />;
  }

  const [eyebrow, title, description] = MODE_COPY[mode] || MODE_COPY.recommend;

  return (
    <div
      className="page-shell page-scroll"
      ref={scrollRef}
      onScroll={handleScroll}
    >
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
