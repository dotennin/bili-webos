import React, { useEffect, useRef, useState } from 'react';
import { searchVideo } from '../api/client';
import VideoGrid from '../components/VideoGrid';
import OSKey from '../components/OSKey';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { useResponsiveGridCols } from '../hooks/useResponsiveGridCols';
import { restoreFocusIfMissing } from '../hooks/useFocus';

const KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '删除', '搜索'],
];

type SearchPageProps = {
  onPlayVideo?: (video: any) => void;
};

export default function SearchPage({ onPlayVideo }: SearchPageProps) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const gridCols = useResponsiveGridCols();
  const previousGridColsRef = useRef(gridCols);

  useEffect(() => {
    if (previousGridColsRef.current === gridCols) return;
    previousGridColsRef.current = gridCols;
    if (results.length === 0) return;

    const timer = globalThis.setTimeout(
      () => restoreFocusIfMissing('content-10-0'),
      0,
    );
    return () => globalThis.clearTimeout(timer);
  }, [gridCols, results.length]);

  async function doSearch() {
    if (!keyword.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchVideo(keyword.trim());
      const items = (res?.data?.result || []).map((item) => ({
        ...item,
        title: item.title?.replace(/<[^>]+>/g, '') || '',
        pic: item.pic,
        bvid: item.bvid,
        owner: { name: item.author },
        stat: { view: item.play },
        duration: item.duration,
      }));
      setResults(items);
    } catch (err) {
      console.error('Search error:', err);
    }
    setLoading(false);
  }

  return (
    <div className="page-shell page-scroll search-container">
      <PageHeader
        eyebrow="SEARCH"
        title="搜索"
        description="使用屏幕键盘输入关键词"
      />
      <div className="search-bar">
        <div
          className="search-input"
          style={{ display: 'flex', alignItems: 'center' }}
        >
          {keyword || <span style={{ color: '#555' }}>输入关键词...</span>}
        </div>
      </div>

      <div className="osk-container">
        {KEYBOARD_ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="osk-row">
            {row.map((key, colIdx) => {
              const isAction = key === '删除' || key === '搜索';
              return (
                <OSKey
                  key={`${rowIdx}-${colIdx}`}
                  id={`osk-${rowIdx}-${colIdx}`}
                  row={rowIdx}
                  col={colIdx}
                  group="content"
                  label={key}
                  isAction={isAction}
                  onPress={() => {
                    if (key === '删除') setKeyword((prev) => prev.slice(0, -1));
                    else if (key === '搜索') doSearch();
                    else setKeyword((prev) => prev + key.toLowerCase());
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {loading ? (
        <PageState state="loading" message="搜索中..." />
      ) : searched && results.length === 0 ? (
        <PageState state="empty" message="未找到相关视频" />
      ) : results.length > 0 ? (
        <div className="search-results">
          <VideoGrid
            videos={results}
            startRow={10}
            cols={gridCols}
            group="content"
            onSelect={onPlayVideo}
          />
        </div>
      ) : null}
    </div>
  );
}
