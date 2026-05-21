const LOCAL_PROXY_BASE = 'http://127.0.0.1:7654';

type ProxyLocation = {
  hostname?: string;
  origin?: string;
};

type ProxyWindow = {
  webOS?: unknown;
  PalmSystem?: unknown;
};

type ProxyDocument = {
  querySelector?: (selector: string) => unknown;
};

type ProxyOptions = {
  document?: ProxyDocument;
  env?: { DEV?: boolean };
  location?: ProxyLocation;
  window?: ProxyWindow;
};

function isLocalDevLocation(location?: ProxyLocation) {
  const hostname = location?.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function isWebOsRuntime(options: ProxyOptions = {}) {
  const runtimeWindow =
    options.window || (typeof window !== 'undefined' ? window : undefined);
  const runtimeDocument =
    options.document ||
    (typeof document !== 'undefined' ? document : undefined);

  return Boolean(
    runtimeWindow?.webOS ||
      runtimeWindow?.PalmSystem ||
      runtimeDocument?.querySelector?.('script[data-webos-runtime]'),
  );
}

export function shouldProxyStaticAsset(options: ProxyOptions = {}) {
  const {
    env = typeof import.meta !== 'undefined' ? import.meta.env : undefined,
    location = typeof window !== 'undefined' ? window.location : undefined,
  } = options;

  return Boolean(
    env?.DEV !== false &&
      isLocalDevLocation(location) &&
      !isWebOsRuntime(options),
  );
}

export function getProxyBase(options: ProxyOptions = {}) {
  const {
    location = typeof window !== 'undefined' ? window.location : undefined,
  } = options;

  if (isLocalDevLocation(location) && location?.origin) {
    return location.origin.replace(/\/$/, '');
  }

  return LOCAL_PROXY_BASE;
}

export function buildProxyUrl(url: string, options: ProxyOptions = {}) {
  const parsed = new URL(url);
  const proxyBase = getProxyBase(options);
  return `${proxyBase}/proxy/${parsed.host}${parsed.pathname}${parsed.search}`;
}

export function buildStaticAssetUrl(url: string, options: ProxyOptions = {}) {
  return shouldProxyStaticAsset(options) ? buildProxyUrl(url, options) : url;
}

export { LOCAL_PROXY_BASE };
