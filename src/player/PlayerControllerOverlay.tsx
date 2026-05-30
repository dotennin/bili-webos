import React from 'react';

type ControllerButton = 'play' | 'danmaku';

type PlayerControllerOverlayProps = {
  title?: string;
  subtitle?: string;
  visible: boolean;
  playing: boolean;
  danmakuEnabled: boolean;
  focusedIndex: number;
  controls?: ControllerButton[];
};

export default function PlayerControllerOverlay({
  title,
  subtitle,
  visible,
  playing,
  danmakuEnabled,
  focusedIndex,
  controls = ['play', 'danmaku'],
}: PlayerControllerOverlayProps) {
  return (
    <div className={`player-controls ${visible ? '' : 'hidden'}`}>
      <div className="player-title">{title || ''}</div>
      {subtitle && (
        <div style={{ fontSize: 18, color: '#999', marginBottom: 4 }}>
          {subtitle}
        </div>
      )}
      <div className="player-btns">
        {controls.map((btn, i) => (
          <button
            key={btn}
            className={`player-btn ${focusedIndex === i ? 'focused' : ''}`}
          >
            {btn === 'play'
              ? playing
                ? '⏸ 暂停'
                : '▶ 播放'
              : danmakuEnabled
                ? '弹幕 开'
                : '弹幕 关'}
          </button>
        ))}
        <span className="player-time">LIVE</span>
      </div>
    </div>
  );
}
