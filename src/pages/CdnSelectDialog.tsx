import React, { useEffect, useRef, useState } from 'react';
import { setCustomKeyHandler } from '../hooks/useFocus';
import { CDN_PICKER_OPTIONS, getSelectedCdnOption } from '../utils/cdn';
import { createCdnSpeedScanner, type CdnSpeedEntry } from '../utils/cdnSpeed';

type CdnSelectDialogProps = {
  settings: any;
  onSelect: (host: string) => void;
  onClose: () => void;
};

function createInitialEntries(): CdnSpeedEntry[] {
  return CDN_PICKER_OPTIONS.map((option) => ({
    ...option,
    status: 'idle',
    speed: null,
    message: null,
  }));
}

function getEntryStatus(entry: CdnSpeedEntry) {
  if (entry.status === 'testing') return '测速中…';
  if (entry.status === 'success') return entry.speed || '测速完成';
  if (entry.status === 'unsupported') return entry.message;
  if (entry.status === 'error') return entry.message || '测速失败';
  return '---';
}

export default function CdnSelectDialog({
  settings,
  onSelect,
  onClose,
}: CdnSelectDialogProps) {
  const selectedHost = getSelectedCdnOption(settings).host;
  const [entries, setEntries] = useState(createInitialEntries);
  const [focusedIndex, setFocusedIndex] = useState(() => {
    const selectedIndex = CDN_PICKER_OPTIONS.findIndex(
      (option) => option.host === selectedHost,
    );
    return Math.max(0, selectedIndex);
  });
  const focusedIndexRef = useRef(focusedIndex);
  const entriesRef = useRef(entries);
  const onCloseRef = useRef(onClose);
  const onSelectRef = useRef(onSelect);
  const rowRefs = useRef([]);

  focusedIndexRef.current = focusedIndex;
  entriesRef.current = entries;
  onCloseRef.current = onClose;
  onSelectRef.current = onSelect;

  useEffect(() => {
    const scanner = createCdnSpeedScanner({
      onUpdate: (nextEntries) => setEntries(nextEntries),
    });
    scanner.start();

    return () => scanner.cancel();
  }, []);

  useEffect(() => {
    rowRefs.current[focusedIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [focusedIndex]);

  useEffect(() => {
    const handleKey = (event) => {
      const key = event.key;
      const isBack =
        key === 'Backspace' || key === 'GoBack' || event.keyCode === 461;

      if (isBack) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return true;
      }
      if (key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((prev) => Math.max(0, prev - 1));
        return true;
      }
      if (key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((prev) =>
          Math.min(entriesRef.current.length - 1, prev + 1),
        );
        return true;
      }
      if (key === 'Enter') {
        event.preventDefault();
        const entry = entriesRef.current[focusedIndexRef.current];
        if (entry) onSelectRef.current(entry.host);
        return true;
      }

      // Keep navigation inside the popup until it is closed.
      return true;
    };

    setCustomKeyHandler(handleKey);
    return () => setCustomKeyHandler(null);
  }, []);

  return (
    <div className="settings-popup" role="dialog" aria-modal="true">
      <div className="settings-popup-panel">
        <div className="settings-popup-header">
          <div>
            <div className="settings-popup-eyebrow">PLAYBACK ROUTE</div>
            <h2>CDN 设置</h2>
            <p>打开面板后自动测速，选择线路后用于普通视频播放</p>
          </div>
          <span className="settings-popup-hint">返回键关闭</span>
        </div>
        <div className="cdn-option-list">
          {entries.map((entry, index) => {
            const isSelected = entry.host === selectedHost;
            const isFocused = index === focusedIndex;
            return (
              <div
                key={entry.host || 'no-cdn'}
                ref={(element) => {
                  rowRefs.current[index] = element;
                }}
                className={`cdn-option${isFocused ? ' focused' : ''}${
                  isSelected ? ' active' : ''
                }`}
                onClick={() => onSelect(entry.host)}
                onMouseEnter={() => setFocusedIndex(index)}
              >
                <div className="cdn-option-marker">{isSelected ? '✓' : ''}</div>
                <div className="cdn-option-copy">
                  <div className="cdn-option-label">{entry.label}</div>
                  <div className="cdn-option-host">
                    {entry.host || '使用视频接口返回的原始线路'}
                  </div>
                </div>
                <span className={`cdn-option-speed ${entry.status}`}>
                  {getEntryStatus(entry)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
