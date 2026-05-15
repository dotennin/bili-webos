// Persistent storage for auth tokens and settings
const PREFIX = 'bili_';

function getDefaultProxyUrl() {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:9527';
  }

  const envProxy = import.meta?.env?.VITE_BILI_PROXY_URL;
  if (envProxy) {
    return envProxy;
  }

  const hostname = window.location?.hostname;
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://127.0.0.1:9527';
  }

  return `http://${hostname}:9527`;
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
    } catch { /* ignore quota errors on TV */ }
  },

  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch { /* ignore unavailable storage env */ }
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

  getProxyUrl() {
    return this.get('proxyUrl') || getDefaultProxyUrl();
  },

  setProxyUrl(url) {
    this.set('proxyUrl', url);
  },

  getSettings() {
    return this.get('settings') || {
      danmaku: true,
      quality: 80,
    };
  },

  setSettings(settings) {
    this.set('settings', settings);
  }
};
