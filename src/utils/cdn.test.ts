import { expect, test } from 'bun:test';
import {
  CDN_OPTIONS,
  CDN_PICKER_OPTIONS,
  DEFAULT_CDN_HOST,
  NO_CDN_HOST,
  applyCdnToDash,
  getCdnOption,
  getNextCdnHost,
  getSelectedCdnOption,
  rewriteCdnUrl,
} from './cdn.ts';

test('exposes the PiliPlus mirror hosts and a stable default', () => {
  expect(CDN_OPTIONS.length).toBeGreaterThan(10);
  expect(DEFAULT_CDN_HOST).toBe('upos-sz-mirrorali.bilivideo.com');
  expect(getCdnOption('unknown.example.com').host).toBe(DEFAULT_CDN_HOST);
  expect(CDN_PICKER_OPTIONS).toHaveLength(CDN_OPTIONS.length + 1);
  expect(CDN_PICKER_OPTIONS[0].host).toBe(NO_CDN_HOST);
  expect(getSelectedCdnOption({ cdnEnabled: false }).host).toBe(NO_CDN_HOST);
  expect(
    getSelectedCdnOption({
      cdnEnabled: true,
      cdnHost: 'upos-sz-mirrorcos.bilivideo.com',
    }).host,
  ).toBe('upos-sz-mirrorcos.bilivideo.com');
});

test('cycles CDN hosts and rewrites supported video URLs', () => {
  const nextHost = getNextCdnHost(DEFAULT_CDN_HOST);
  expect(nextHost).toBe('upos-sz-mirroralib.bilivideo.com');
  expect(
    rewriteCdnUrl(
      'https://upos-sz-mirrorali.bilivideo.com/upgcxcode/video.m4s?token=1',
      nextHost,
    ),
  ).toBe(
    'https://upos-sz-mirroralib.bilivideo.com/upgcxcode/video.m4s?token=1',
  );
});

test('leaves non-CDN and mcdn URLs untouched', () => {
  const host = 'upos-sz-mirrorcos.bilivideo.com';
  expect(rewriteCdnUrl('https://video.example.com/video.m4s', host)).toBe(
    'https://video.example.com/video.m4s',
  );
  expect(
    rewriteCdnUrl('https://xy220x145x.mcdn.bilivideo.com/v1/resource', host),
  ).toBe('https://xy220x145x.mcdn.bilivideo.com/v1/resource');
  expect(rewriteCdnUrl('not a URL', host)).toBe('not a URL');
});

test('adds the selected mirror before original DASH fallback URLs', () => {
  const dash = {
    duration: 120,
    video: [
      {
        baseUrl:
          'https://upos-sz-mirrorali.bilivideo.com/upgcxcode/video.m4s?token=1',
        backupUrl: [
          'https://upos-sz-mirrorhw.bilivideo.com/upgcxcode/video.m4s',
        ],
      },
    ],
    audio: [
      {
        base_url:
          'https://upos-sz-mirrorali.bilivideo.com/upgcxcode/audio.m4s',
      },
    ],
  };

  expect(
    applyCdnToDash(dash, {
      cdnEnabled: true,
      cdnHost: 'upos-sz-mirrorcos.bilivideo.com',
    }),
  ).toMatchObject({
    video: [
      {
        baseUrls: [
          'https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/video.m4s?token=1',
          'https://upos-sz-mirrorali.bilivideo.com/upgcxcode/video.m4s?token=1',
          'https://upos-sz-mirrorhw.bilivideo.com/upgcxcode/video.m4s',
        ],
      },
    ],
    audio: [
      {
        baseUrls: [
          'https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/audio.m4s',
          'https://upos-sz-mirrorali.bilivideo.com/upgcxcode/audio.m4s',
        ],
      },
    ],
  });
});

test('rewrites the first compatible fallback when the primary URL is mcdn', () => {
  const dash = {
    video: [
      {
        baseUrl: 'https://xy220x145x.mcdn.bilivideo.com/v1/resource',
        backupUrl: [
          'https://upos-sz-mirrorali.bilivideo.com/upgcxcode/video.m4s',
        ],
      },
    ],
  };

  expect(
    applyCdnToDash(dash, {
      cdnEnabled: true,
      cdnHost: 'upos-sz-mirrorcos.bilivideo.com',
    }).video[0].baseUrls,
  ).toEqual([
    'https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/video.m4s',
    'https://xy220x145x.mcdn.bilivideo.com/v1/resource',
    'https://upos-sz-mirrorali.bilivideo.com/upgcxcode/video.m4s',
  ]);
});

test('does not change DASH data when CDN is disabled', () => {
  const dash = { video: [{ baseUrl: 'https://video.example.com/a.m4s' }] };
  expect(applyCdnToDash(dash, { cdnEnabled: false })).toBe(dash);
});
