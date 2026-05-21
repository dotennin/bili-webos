// @ts-nocheck
import React from 'react';
import { useFocusable } from '../hooks/useFocus';

function SubscriptionRow({ item, index, onSelect }) {
  const { props } = useFocusable({
    id: `subscription-${index}-0`,
    row: index,
    col: 0,
    group: 'subscription',
    onSelect: () => onSelect(item, index),
  });

  return (
    <div
      {...props}
      className={`subscription-row ${item.isInvalid ? 'invalid' : ''}`}
    >
      <div className="subscription-row-title">{item.title}</div>
      <div className="subscription-row-meta">
        {item.total > 0 ? `${item.total} 个视频` : '暂无可用视频'}
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
