import React from 'react';
import VideoCard from './VideoCard';

type VideoGridProps = {
  videos: any[];
  group?: string;
  startRow?: number;
  cols?: number;
  onSelect?: (video: any) => void;
};

export default React.memo(function VideoGrid({
  videos,
  group = 'content',
  startRow = 0,
  cols = 2,
  onSelect,
}: VideoGridProps) {
  if (!videos || videos.length === 0) {
    return <div className="empty-state">暂无内容</div>;
  }

  return (
    <div
      className="video-grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      {videos.map((video, idx) => {
        const row = startRow + Math.floor(idx / cols);
        const col = idx % cols;
        const bvid = video.bvid || video.bv_id;
        return (
          <VideoCard
            key={bvid || `v-${row}-${col}`}
            video={video}
            focusId={`${group}-${row}-${col}`}
            row={row}
            col={col}
            group={group}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
});
