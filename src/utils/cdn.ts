export type CdnOption = {
  host: string;
  label: string;
};

export const NO_CDN_HOST = '';
export const NO_CDN_OPTION: CdnOption = {
  host: NO_CDN_HOST,
  label: '不使用 CDN',
};

// Keep the mirror list aligned with the public CDN choices used by PiliPlus.
// These hosts are already covered by both proxy allowlists.
export const CDN_OPTIONS: CdnOption[] = [
  { host: 'upos-sz-mirrorali.bilivideo.com', label: '阿里云 · ali' },
  { host: 'upos-sz-mirroralib.bilivideo.com', label: '阿里云 · alib' },
  { host: 'upos-sz-mirroralio1.bilivideo.com', label: '阿里云 · alio1' },
  { host: 'upos-sz-mirrorcos.bilivideo.com', label: '腾讯云 · cos' },
  {
    host: 'upos-sz-mirrorcosb.bilivideo.com',
    label: '腾讯云 · cosb（VOD）',
  },
  { host: 'upos-sz-mirrorcoso1.bilivideo.com', label: '腾讯云 · coso1' },
  { host: 'upos-sz-mirrorhw.bilivideo.com', label: '华为云 · hw' },
  { host: 'upos-sz-mirrorhwb.bilivideo.com', label: '华为云 · hwb' },
  { host: 'upos-sz-mirrorhwo1.bilivideo.com', label: '华为云 · hwo1' },
  { host: 'upos-sz-mirror08c.bilivideo.com', label: '华为云 · 08c' },
  { host: 'upos-sz-mirror08h.bilivideo.com', label: '华为云 · 08h' },
  { host: 'upos-sz-mirror08ct.bilivideo.com', label: '华为云 · 08ct' },
  { host: 'upos-tf-all-hw.bilivideo.com', label: '华为云 · tf_hw' },
  { host: 'upos-tf-all-tx.bilivideo.com', label: '腾讯云 · tf_tx' },
  {
    host: 'upos-hz-mirrorakam.akamaized.net',
    label: 'Akamai · 海外',
  },
  { host: 'upos-sz-mirroraliov.bilivideo.com', label: '阿里云 · 海外' },
  { host: 'upos-sz-mirrorcosov.bilivideo.com', label: '腾讯云 · 海外' },
  { host: 'upos-sz-mirrorhwov.bilivideo.com', label: '华为云 · 海外' },
  { host: 'cn-hk-eq-bcache-01.bilivideo.com', label: 'Bilibili · 香港' },
];

export const CDN_PICKER_OPTIONS: CdnOption[] = [NO_CDN_OPTION, ...CDN_OPTIONS];

export const DEFAULT_CDN_HOST = CDN_OPTIONS[0].host;

const CDN_SOURCE_SUFFIXES = [
  '.bilivideo.com',
  '.bilivideo.cn',
  '.bilivideo.net',
  '.akamaized.net',
];

function uniqueUrls(urls: string[]) {
  return urls.filter((url, index) => url && urls.indexOf(url) === index);
}

export function getCdnOption(host?: string | null) {
  return (
    CDN_OPTIONS.find(
      (option) =>
        option.host.toLowerCase() === String(host || '').toLowerCase(),
    ) || CDN_OPTIONS[0]
  );
}

export function getNextCdnHost(host?: string | null) {
  const currentIndex = CDN_OPTIONS.findIndex(
    (option) => option.host === getCdnOption(host).host,
  );
  return CDN_OPTIONS[(currentIndex + 1) % CDN_OPTIONS.length].host;
}

export function getSelectedCdnOption(settings) {
  if (!settings?.cdnEnabled) return NO_CDN_OPTION;
  return getCdnOption(settings.cdnHost);
}

function isCdnSourceHost(hostname: string) {
  const normalizedHost = hostname.toLowerCase();
  return CDN_SOURCE_SUFFIXES.some((suffix) => normalizedHost.endsWith(suffix));
}

export function rewriteCdnUrl(url: string, cdnHost?: string | null) {
  if (!url || !cdnHost) return url;

  try {
    const rawUrl = String(url);
    const normalizedUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
    const parsedUrl = new URL(normalizedUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return url;
    if (!isCdnSourceHost(parsedUrl.hostname)) return url;

    // mcdn URLs use a different path contract and cannot safely be mirror-swapped.
    if (parsedUrl.hostname.toLowerCase().includes('.mcdn.')) return url;

    parsedUrl.hostname = getCdnOption(cdnHost).host;
    parsedUrl.port = '';
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

function getTrackUrls(track) {
  if (!track) return [];
  const primaryUrl = track.baseUrl || track.base_url || '';
  const backupUrls = track.backupUrl || track.backup_url || [];
  const backups = Array.isArray(backupUrls) ? backupUrls : [backupUrls];
  return uniqueUrls([primaryUrl, ...backups]);
}

function applyCdnToTracks(tracks, cdnHost) {
  if (!Array.isArray(tracks)) return tracks;

  return tracks.map((track) => {
    const urls = getTrackUrls(track);
    if (!urls.length) return track;

    const preferredUrl =
      urls.find((url) => {
        const rewrittenUrl = rewriteCdnUrl(url, cdnHost);
        if (rewrittenUrl !== url) return true;
        try {
          return new URL(url).hostname.toLowerCase() === cdnHost.toLowerCase();
        } catch {
          return false;
        }
      }) || urls[0];

    return {
      ...track,
      // Shaka can try the original URL when the selected mirror is unavailable.
      baseUrls: uniqueUrls([rewriteCdnUrl(preferredUrl, cdnHost), ...urls]),
    };
  });
}

export function applyCdnToDash(dash, settings) {
  if (!dash || !settings?.cdnEnabled) return dash;

  const cdnHost = getCdnOption(settings.cdnHost).host;
  return {
    ...dash,
    video: applyCdnToTracks(dash.video, cdnHost),
    audio: applyCdnToTracks(dash.audio, cdnHost),
  };
}
