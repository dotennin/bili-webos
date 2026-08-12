import { describe, expect, it } from 'bun:test';
import {
  buildCdpJsonUrl,
  isBiliWebosPage,
  toCdpWebSocketUrl,
} from './screenshot-config.ts';

describe('screenshot CDP configuration', () => {
  it('builds the CDP endpoint against the TV host', () => {
    expect(buildCdpJsonUrl('192.168.1.47')).toBe(
      'http://192.168.1.47:9998/json',
    );
    expect(buildCdpJsonUrl('192.168.1.47', 10000)).toBe(
      'http://192.168.1.47:10000/json',
    );
  });

  it('rewrites a DevTools URL to the TV host', () => {
    expect(
      toCdpWebSocketUrl(
        'ws://127.0.0.1:9998/devtools/page/example',
        '192.168.1.47',
      ),
    ).toBe('ws://192.168.1.47:9998/devtools/page/example');
  });

  it('rewrites the port for a custom CDP endpoint', () => {
    expect(
      toCdpWebSocketUrl(
        'ws://127.0.0.1:9998/devtools/page/example',
        '192.168.1.47',
        10000,
      ),
    ).toBe('ws://192.168.1.47:10000/devtools/page/example');
  });

  it('identifies the app by its stable CDP identity', () => {
    expect(
      isBiliWebosPage({
        description: 'com.biliwebos.app',
        title: 'Bilibili',
      }),
    ).toBe(true);
    expect(
      isBiliWebosPage({
        url: 'file:///media/developer/apps/usr/palm/applications/com.biliwebos.app/index.html',
        title: 'Bilibili',
      }),
    ).toBe(true);
    expect(isBiliWebosPage({ title: 'YouTube on TV' })).toBe(false);
  });
});
