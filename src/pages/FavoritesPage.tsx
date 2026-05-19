// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { getFavFolders, getFavList } from '../api/client';
import FocusableTab from '../components/FocusableTab';
import VideoGrid from '../components/VideoGrid';
import {
  getCurrentFocusId,
  setCustomKeyHandler,
  setFocus,
} from '../hooks/useFocus';
import { storage } from '../utils/storage';

export default function FavoritesPage({ userMid, onPlayVideo }) {
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gridCols] = useState(() => storage.getSettings().videoGridCols || 3);
  const selectedFolderIndex = folders.findIndex(
    (folder) => folder.id === selectedFolderId,
  );

  useEffect(() => {
    if (!userMid) {
      setFolders([]);
      setSelectedFolderId(null);
      setVideos([]);
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadFolders() {
      setLoading(true);
      setError('');
      try {
        const res = await getFavFolders(userMid);
        if (cancelled) return;
        const nextFolders = res?.data?.list || [];
        setFolders(nextFolders);
        if (nextFolders.length === 0) {
          setSelectedFolderId(null);
          setVideos([]);
          setError('暂无收藏夹');
          return;
        }
        setSelectedFolderId((current) =>
          nextFolders.some((folder) => folder.id === current)
            ? current
            : nextFolders[0].id,
        );
      } catch (err) {
        if (!cancelled) {
          console.error('Fav folders error:', err);
          setFolders([]);
          setSelectedFolderId(null);
          setVideos([]);
          setError(err.message || '加载失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFolders();

    return () => {
      cancelled = true;
    };
  }, [userMid]);

  useEffect(() => {
    if (!userMid || !selectedFolderId) return;

    let cancelled = false;

    async function loadVideos() {
      setLoading(true);
      setError('');
      try {
        const favRes = await getFavList(selectedFolderId, 1, 24);
        if (cancelled) return;
        setVideos(
          (favRes?.data?.medias || []).map((m) => ({
            bvid: m.bvid,
            title: m.title,
            pic: m.cover,
            duration: m.duration,
            owner: { name: m.upper?.name },
            stat: { view: m.cnt_info?.play },
          })),
        );
      } catch (err) {
        if (!cancelled) {
          console.error('Fav videos error:', err);
          setVideos([]);
          setError(err.message || '加载失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadVideos();

    return () => {
      cancelled = true;
    };
  }, [selectedFolderId, userMid]);

  useEffect(() => {
    if (loading || videos.length === 0 || error) return;
    setFocus('content-1-0');
  }, [loading, videos, error]);

  useEffect(() => {
    function handler(event) {
      if (event.key !== 'ArrowUp' || selectedFolderIndex < 0) return false;
      const focusId = getCurrentFocusId();
      if (!focusId?.startsWith('content-1-')) return false;
      event.preventDefault();
      event.stopPropagation();
      setFocus(`content-0-${selectedFolderIndex}`);
      return true;
    }

    setCustomKeyHandler(handler);
    return () => setCustomKeyHandler(null);
  }, [selectedFolderIndex]);

  if (!userMid)
    return (
      <div>
        <div className="page-title">我的收藏</div>
        <div className="empty-state">请先登录</div>
      </div>
    );
  if (loading)
    return (
      <div className="loading">
        <div className="loading-spinner" />
        加载中...
      </div>
    );
  if (error)
    return (
      <div>
        <div className="page-title">我的收藏</div>
        <div className="empty-state">{error}</div>
      </div>
    );

  return (
    <div>
      <div className="page-title">我的收藏</div>
      <div className="tabs">
        {folders.map((folder, index) => (
          <FocusableTab
            key={folder.id}
            id={`content-0-${index}`}
            row={0}
            col={index}
            group="content"
            label={folder.title || folder.name || `收藏夹 ${index + 1}`}
            active={folder.id === selectedFolderId}
            onSelect={() => setSelectedFolderId(folder.id)}
          />
        ))}
      </div>
      <VideoGrid
        videos={videos}
        group="content"
        startRow={1}
        cols={gridCols}
        onSelect={onPlayVideo}
      />
    </div>
  );
}
