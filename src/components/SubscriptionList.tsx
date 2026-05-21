// @ts-nocheck
import React from 'react';
import { useFocusable } from '../hooks/useFocus';
import { buildProxyUrl } from '../utils/proxy';

function proxyImg(url) {
  if (!url) return '';
  const raw = url.startsWith('//') ? `https:${url}` : url;
  try {
    return buildProxyUrl(raw);
  } catch {
    return raw;
  }
}

function SubscriptionRow({ item, index, onSelect }) {
  const { props } = useFocusable({
    id: `subscription-${index}-0`,
    row: index,
    col: 0,
    group: 'subscription',
    onSelect: () => onSelect(item, index),
  });

  const thumbUrl = proxyImg(item.cover);
  const ownerName = item.ownerName || item.upper?.name || '未知UP主';
  const videoCount = item.total > 0 ? `${item.total}个视频` : '暂无可用视频';

  return (
    <div
      {...props}
      className={`subscription-card ${item.isInvalid ? 'invalid' : ''}`}
    >
      <div className="subscription-card-thumb">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className="subscription-card-thumb-placeholder" />
        )}
        <span className="subscription-card-badge">合集</span>
      </div>
      <div className="subscription-card-body">
        <div className="subscription-card-title">{item.title}</div>
        <div className="subscription-card-meta">UP主: {ownerName}</div>
        <div className="subscription-card-meta">{videoCount}</div>
      </div>
    </div>
  );
}

export default function SubscriptionList({ items, onSelect }) {
  if (!items || items.length === 0) {
    return <div className="empty-state">暂无订阅内容</div>;
  }

  return (
    <div className="subscription-list">
      {items.map((item, index) => (
        <SubscriptionRow
          key={item.id || `subscription-${index}`}
          item={item}
          index={index}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
