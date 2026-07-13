function present(value) {
  return value !== undefined && value !== null && value !== '';
}

function choose(primary, fallback) {
  return present(primary) ? primary : fallback;
}

function normalizeRemoteItem(item) {
  const bvid = item?.history?.bvid;
  if (!bvid || !bvid.trim()) return null;
  return {
    video: {
      bvid: bvid.trim(),
      cid: item.history.cid,
      title: item.title || undefined,
      pic: item.cover || undefined,
      duration: item.duration != null ? Number(item.duration) : undefined,
      progress: item.progress != null ? Number(item.progress) : undefined,
      owner: item.author_name ? { name: item.author_name } : undefined,
      pubdate: item.pubdate != null ? Number(item.pubdate) : undefined,
      stat:
        item.stat?.view != null ? { view: Number(item.stat.view) } : undefined,
      play: item.play != null ? Number(item.play) : undefined,
    },
    viewedAt: item.view_at ? Number(item.view_at) * 1000 : null,
  };
}

function normalizeLocalEntry(entry) {
  if (!entry?.bvid || !entry.bvid.trim()) return null;
  return {
    video: {
      bvid: entry.bvid.trim(),
      cid: entry.cid,
      title: entry.title || undefined,
      pic: entry.pic || undefined,
      duration: entry.duration,
      progress: entry.progress,
      owner: entry.ownerName ? { name: entry.ownerName } : undefined,
    },
    viewedAt: entry.viewedAt || null,
  };
}

function combine(newer, older) {
  return {
    video: {
      bvid: newer.video.bvid,
      cid: choose(newer.video.cid, older.video.cid),
      title: choose(newer.video.title, older.video.title),
      pic: choose(newer.video.pic, older.video.pic),
      duration: choose(newer.video.duration, older.video.duration),
      progress: choose(newer.video.progress, older.video.progress),
      owner:
        newer.video.owner?.name || older.video.owner?.name
          ? { name: newer.video.owner?.name || older.video.owner?.name }
          : undefined,
      pubdate: choose(newer.video.pubdate, older.video.pubdate),
      stat: newer.video.stat || older.video.stat,
      play: choose(newer.video.play, older.video.play),
    },
    viewedAt: Math.max(newer.viewedAt || 0, older.viewedAt || 0) || null,
  };
}

export function mergeRecentHistory(remoteItems, localEntries) {
  const normalizedLocal = localEntries.map(normalizeLocalEntry).filter(Boolean);
  const normalizedRemote = remoteItems.map(normalizeRemoteItem).filter(Boolean);

  const byBvid = new Map();
  for (const item of [...normalizedLocal, ...normalizedRemote]) {
    const existing = byBvid.get(item.video.bvid);
    if (!existing) {
      byBvid.set(item.video.bvid, item);
      continue;
    }
    const newer =
      (item.viewedAt || 0) > (existing.viewedAt || 0) ? item : existing;
    const older = newer === item ? existing : item;
    byBvid.set(item.video.bvid, combine(newer, older));
  }

  return [...byBvid.values()]
    .sort((a, b) => (b.viewedAt || 0) - (a.viewedAt || 0))
    .map((item) => ({ ...item.video, viewedAt: item.viewedAt }));
}
