import React from 'react';

export const APP_ICON_NAMES = [
  'home',
  'hot',
  'live',
  'partition',
  'follow',
  'history',
  'favorites',
  'search',
  'settings',
] as const;

export type AppIconName = (typeof APP_ICON_NAMES)[number];

type AppIconProps = {
  name: AppIconName;
  className?: string;
};

const paths: Record<AppIconName, React.ReactNode> = {
  home: (
    <>
      <path d="m3.5 10.5 8.5-7 8.5 7" />
      <path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" />
    </>
  ),
  hot: (
    <path d="M13.5 3.5c.7 3-1.3 4.2-2.5 5.5-1.7 1.8-2.2 3.2-1 5.2.2-2.1 1.5-3.2 2.8-4.1.1 2.3 2.7 3.4 1.7 6.4-.5 1.6-1.9 2.8-3.7 3-3.9.5-6.8-2-6.3-5.7.4-2.9 2.7-4.4 4.6-6.3.9-.9 1.6-2.2 1.7-4 1 .5 1.9 1.2 2.7 2Z" />
  ),
  live: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="3" />
      <path d="m9 10 6 4M15 10l-6 4" />
    </>
  ),
  partition: (
    <>
      <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="14" width="7" height="6" rx="1.5" />
      <rect x="13.5" y="14" width="7" height="6" rx="1.5" />
    </>
  ),
  follow: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.5-4 3-6 7-6s6.5 2 7 6" />
    </>
  ),
  history: (
    <>
      <path d="M4.5 7.5A8.5 8.5 0 1 1 3.8 15" />
      <path d="M4.5 3.5v4h4M12 7v5l3 2" />
    </>
  ),
  favorites: (
    <path d="m12 3.5 2.6 5.2 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5Z" />
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z" />
    </>
  ),
};

export default function AppIcon({ name, className = '' }: AppIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
