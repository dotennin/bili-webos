import React, { useCallback } from 'react';
import { useFocusable } from '../hooks/useFocus';

export default React.memo(function OSKey({ id, row, col, group, label, isAction, onPress }) {
  const handleSelect = useCallback(() => { onPress?.(); }, [onPress]);
  const { props } = useFocusable({ id, row, col, group, onSelect: handleSelect });
  return <div {...props} className={`osk-key ${isAction ? 'wide' : ''}`}>{label}</div>;
});
