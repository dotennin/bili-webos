import React, { useState } from 'react';
import { storage } from '../utils/storage';
import { getSelectedCdnOption } from '../utils/cdn';
import { useFocusable } from '../hooks/useFocus';
import PageHeader from '../components/PageHeader';
import CdnSelectDialog from './CdnSelectDialog';

type SettingsPageProps = {
  onLogout: () => void;
  user?: { uname?: string } | null;
  onPlayVideo?: (video: any) => void;
};

export default function SettingsPage({ onLogout, user }: SettingsPageProps) {
  const [settings, setSettings] = useState(storage.getSettings());
  const [cdnDialogOpen, setCdnDialogOpen] = useState(false);

  const { props: danmakuProps } = useFocusable({
    id: 'content-0-0',
    row: 0,
    col: 0,
    group: 'content',
    onSelect: () => {
      const nextSettings = { ...settings, danmaku: !settings.danmaku };
      storage.setSettings(nextSettings);
      setSettings(nextSettings);
    },
  });

  const { props: cdnProps } = useFocusable({
    id: 'content-1-0',
    row: 1,
    col: 0,
    group: 'content',
    onSelect: () => {
      setCdnDialogOpen(true);
    },
  });

  const { props: gridColsProps } = useFocusable({
    id: 'content-2-0',
    row: 2,
    col: 0,
    group: 'content',
    onSelect: () => {
      const current = Number(settings.videoGridCols) || 3;
      const nextCols = current >= 4 ? 2 : current + 1;
      const nextSettings = { ...settings, videoGridCols: nextCols };
      storage.setSettings(nextSettings);
      setSettings(nextSettings);
    },
  });

  const { props: logoutProps } = useFocusable({
    id: 'content-3-0',
    row: 3,
    col: 0,
    group: 'content',
    onSelect: () => {
      storage.clearAuth();
      onLogout();
    },
  });

  return (
    <div className="page-shell page-scroll settings-page">
      <PageHeader
        eyebrow="PREFERENCES"
        title={user ? `${user.uname} 的空间` : '设置'}
        description="播放与界面偏好会保存在此设备"
      />

      <div className="settings-list">
        <div {...danmakuProps} className="setting-row">
          <div className="setting-copy">
            <div className="setting-name">显示弹幕</div>
            <div className="setting-description">播放视频时显示实时弹幕</div>
          </div>
          <span className="setting-value">
            {settings.danmaku ? '开启' : '关闭'}
          </span>
        </div>
        <div {...cdnProps} className="setting-row">
          <div className="setting-copy">
            <div className="setting-name">视频 CDN</div>
            <div className="setting-description">
              打开面板自动测速，选择线路后用于普通视频播放
            </div>
          </div>
          <span className="setting-value">
            {getSelectedCdnOption(settings).label}
          </span>
        </div>
        <div {...gridColsProps} className="setting-row">
          <div className="setting-copy">
            <div className="setting-name">每行视频数</div>
            <div className="setting-description">根据观看距离调整卡片密度</div>
          </div>
          <span className="setting-value">{settings.videoGridCols} 列</span>
        </div>
        <div {...logoutProps} className="setting-row setting-row-danger">
          <div className="setting-copy">
            <div className="setting-name">退出当前账号</div>
            <div className="setting-description">清除本机登录信息</div>
          </div>
          <span className="setting-value">退出</span>
        </div>
      </div>
      {cdnDialogOpen && (
        <CdnSelectDialog
          settings={settings}
          onClose={() => setCdnDialogOpen(false)}
          onSelect={(host) => {
            const nextSettings = {
              ...settings,
              cdnEnabled: Boolean(host),
              cdnHost: host,
            };
            storage.setSettings(nextSettings);
            setSettings(nextSettings);
            setCdnDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
