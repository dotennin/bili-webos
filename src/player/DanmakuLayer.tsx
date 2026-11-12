import React, { useRef, useEffect } from 'react';

const MAX_TRACKS = 15;
const TRACK_HEIGHT_PX = 48;
const TRACK_TOP_PX = 20;
const DEFAULT_CONTAINER_HEIGHT_PX = 810;
const MAX_CONTINUOUS_STEP_SEC = 2;

type Danmaku = {
  time: number;
  text: string;
  mode?: number;
  color?: string;
  size?: number;
};

type DanmakuLayerProps = {
  danmakus: Danmaku[];
  currentTime: number;
  enabled: boolean;
  seekable?: boolean;
};

export function getDanmakuTrackCount(containerHeight: number) {
  const availableHeight = Math.max(0, containerHeight - TRACK_TOP_PX);
  return Math.max(
    1,
    Math.min(MAX_TRACKS, Math.floor(availableHeight / TRACK_HEIGHT_PX)),
  );
}

function firstDanmakuAtOrAfter(danmakus: Danmaku[], time: number) {
  let start = 0;
  let end = danmakus.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (danmakus[middle].time < time) start = middle + 1;
    else end = middle;
  }
  return start;
}

export default function DanmakuLayer({
  danmakus,
  currentTime,
  enabled,
  seekable = false,
}: DanmakuLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveRenderedRef = useRef(new Set<number>());
  const trackRef = useRef(new Array<number>(MAX_TRACKS).fill(0));
  const cursorRef = useRef(0);
  const previousTimeRef = useRef<number | null>(null);

  useEffect(() => {
    liveRenderedRef.current.clear();
    previousTimeRef.current = null;
    trackRef.current.fill(0);
    containerRef.current?.replaceChildren();
  }, [danmakus, enabled, seekable]);

  // Render danmakus that should appear at currentTime
  useEffect(() => {
    if (!enabled || !danmakus || !containerRef.current) return;

    const now = currentTime;
    const container = containerRef.current;

    const earliestTime = now - 0.5;
    const latestTime = now + 0.3;

    // VOD comments are sorted by time. Reposition the cursor after a seek.
    if (seekable) {
      const previousTime = previousTimeRef.current;
      if (
        previousTime === null ||
        now < previousTime ||
        now - previousTime > MAX_CONTINUOUS_STEP_SEC
      ) {
        cursorRef.current = firstDanmakuAtOrAfter(danmakus, earliestTime);
        trackRef.current.fill(0);
        container.replaceChildren();
      }
      previousTimeRef.current = now;
    }

    const containerHeight =
      container.clientHeight ||
      (typeof window === 'undefined'
        ? DEFAULT_CONTAINER_HEIGHT_PX
        : (window.innerHeight || 1080) * 0.75);
    const trackCount = getDanmakuTrackCount(containerHeight);

    for (let i = seekable ? cursorRef.current : 0; i < danmakus.length; i++) {
      const dm = danmakus[i];
      if (dm.time > latestTime) {
        if (seekable) break;
        continue;
      }
      if (seekable) cursorRef.current = i + 1;
      if (dm.time < earliestTime || liveRenderedRef.current.has(i)) continue;

      if (dm.mode !== 1 && dm.mode !== undefined) continue;
      if (!seekable) liveRenderedRef.current.add(i);

      let track = -1;
      for (let t = 0; t < trackCount; t++) {
        if (trackRef.current[t] <= now) {
          track = t;
          trackRef.current[t] = now + 3; // Occupy track for 3 seconds
          break;
        }
      }
      if (track === -1) continue; // All tracks busy

      const el = container.ownerDocument.createElement('div');
      el.className = 'danmaku-item';
      el.textContent = dm.text;
      el.style.top = `${track * TRACK_HEIGHT_PX + TRACK_TOP_PX}px`;
      el.style.color = dm.color || '#fff';
      el.style.fontSize = `${dm.size || 28}px`;
      el.style.animationDuration = '8s';

      container.appendChild(el);

      // Remove after animation
      el.addEventListener('animationend', () => {
        el.remove();
      });
    }
  }, [currentTime, danmakus, enabled, seekable]);

  if (!enabled) return null;

  return <div ref={containerRef} className="danmaku-container" />;
}
