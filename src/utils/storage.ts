const PREFIX = 'bili_';
const RESUME_PROGRESS_KEY = 'resume_progress';
const RESUME_END_THRESHOLD_SEC = 3;
const CAST_RECENT_HISTORY_KEY = 'cast_recent_history';
const CAST_RECENT_HISTORY_VERSION = 1;
const CAST_RECENT_HISTORY_LIMIT = 50;
const DEFAULT_SETTINGS = {
  danmaku: true,
  quality: 80,
  videoGridCols: 3,
  subtitleLanguage: null,
};

function normalizeResumeEntry(entry) {
  if (!entry?.bvid) return null;

  const progress = Math.max(0, Number(entry.progress) || 0);
  const duration = Math.max(0, Number(entry.duration) || 0);
  const cid =
    entry.cid == null || entry.cid === ''
      ? null
      : Number(entry.cid) || entry.cid;

  return {
    bvid: entry.bvid,
    cid,
    progress,
    duration,
    updatedAt: Number(entry.updatedAt) || Date.now(),
  };
}

function normalizeCastRecentEntry(entry) {
  if (typeof entry?.bvid !== 'string' || !entry.bvid.trim()) return null;
  const viewedAt = Number(entry.viewedAt);
  if (!Number.isFinite(viewedAt) || viewedAt <= 0) return null;
  const optionalText = (value) =>
    typeof value === 'string' && value.trim() ? value : undefined;
  const optionalNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : undefined;
  };
  const cid =
    entry.cid == null || entry.cid === ''
      ? undefined
      : Number(entry.cid) || entry.cid;
  return {
    bvid: entry.bvid.trim(),
    cid,
    title: optionalText(entry.title),
    pic: optionalText(entry.pic),
    ownerName: optionalText(entry.ownerName),
    duration: optionalNumber(entry.duration),
    progress: optionalNumber(entry.progress),
    viewedAt,
  };
}

export const storage = {
  get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* ignore quota errors on TV */
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore unavailable storage env */
    }
  },

  // Auth helpers
  getAuth() {
    return this.get('auth') || null;
  },

  setAuth(auth) {
    this.set('auth', auth);
  },

  clearAuth() {
    this.remove('auth');
  },

  getSettings() {
    return {
      ...DEFAULT_SETTINGS,
      ...(this.get('settings') || {}),
    };
  },

  setSettings(settings) {
    this.set('settings', settings);
  },

  getResumeProgressMap() {
    return this.get(RESUME_PROGRESS_KEY) || {};
  },

  getResumeProgress(bvid, cid) {
    if (!bvid) return null;
    const entry = normalizeResumeEntry(this.getResumeProgressMap()?.[bvid]);
    if (!entry) return null;
    if (cid != null && entry.cid != null && String(entry.cid) !== String(cid)) {
      return null;
    }
    return entry;
  },

  setResumeProgress(entry) {
    const normalized = normalizeResumeEntry(entry);
    if (!normalized) return;
    const nextMap = {
      ...this.getResumeProgressMap(),
      [normalized.bvid]: normalized,
    };
    this.set(RESUME_PROGRESS_KEY, nextMap);
  },

  clearResumeProgress(bvid) {
    if (!bvid) return;
    const nextMap = { ...this.getResumeProgressMap() };
    delete nextMap[bvid];
    this.set(RESUME_PROGRESS_KEY, nextMap);
  },

  shouldClearResumeProgress(progress, duration) {
    const safeDuration = Math.max(0, Number(duration) || 0);
    const safeProgress = Math.max(0, Number(progress) || 0);
    if (!safeDuration) return false;
    return safeDuration - safeProgress <= RESUME_END_THRESHOLD_SEC;
  },

  getCastRecentHistory() {
    const stored = this.get(CAST_RECENT_HISTORY_KEY);
    if (
      stored?.version !== CAST_RECENT_HISTORY_VERSION ||
      !Array.isArray(stored.entries)
    )
      return [];
    return stored.entries
      .map(normalizeCastRecentEntry)
      .filter(Boolean)
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .slice(0, CAST_RECENT_HISTORY_LIMIT);
  },

  addCastRecentHistory(entry) {
    try {
      const normalized = normalizeCastRecentEntry(entry);
      if (!normalized) return;
      const existing = this.getCastRecentHistory();
      const previous = existing.find((item) => item.bvid === normalized.bvid);
      const stripUndefined = (value) =>
        Object.fromEntries(
          Object.entries(value).filter(([, item]) => item !== undefined),
        );
      const merged = { ...previous, ...stripUndefined(normalized) };
      const entries = [
        merged,
        ...existing.filter((item) => item.bvid !== merged.bvid),
      ]
        .sort((a, b) => b.viewedAt - a.viewedAt)
        .slice(0, CAST_RECENT_HISTORY_LIMIT);
      this.set(CAST_RECENT_HISTORY_KEY, {
        version: CAST_RECENT_HISTORY_VERSION,
        entries,
      });
    } catch {
      /* local cast history must never interrupt playback */
    }
  },
};
