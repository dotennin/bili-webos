import React, { useCallback } from 'react';
import { useFocusable } from '../hooks/useFocus';

export default React.memo(function FocusableTab({ id, row, col, group, label, active, onSelect }) {
  const handleSelect = useCallback(() => { onSelect?.(); }, [onSelect]);
  const { props } = useFocusable({ id, row, col, group, onSelect: handleSelect });
  return <div {...props} className={`tab ${active ? 'active' : ''}`}>{label}</div>;
});
