import React from 'react';
import { useFocusable } from '../hooks/useFocus';
import AppIcon, { type AppIconName } from './AppIcon';

type SidebarItemProps = {
  id: string;
  row: number;
  label: React.ReactNode;
  icon: AppIconName;
  active?: boolean;
  onSelect?: () => void;
};

export default React.memo(function SidebarItem({
  id,
  row,
  label,
  icon,
  active,
  onSelect,
}: SidebarItemProps) {
  const { props } = useFocusable({
    id,
    row,
    col: 0,
    group: 'sidebar',
    onSelect,
  });

  return (
    <div {...props} className={`sidebar-item ${active ? 'active' : ''}`}>
      <AppIcon name={icon} className="sidebar-icon" />
      <span className="sidebar-label">{label}</span>
    </div>
  );
});
