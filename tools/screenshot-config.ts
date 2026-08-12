export const DEFAULT_CDP_PORT = 9998;

type DevtoolsPageIdentity = {
  title?: string;
  description?: string;
  url?: string;
};

export function isBiliWebosPage(page: DevtoolsPageIdentity): boolean {
  return (
    page.description === 'com.biliwebos.app' ||
    page.url?.includes('/com.biliwebos.app/') === true ||
    page.title?.includes('哔哩') === true
  );
}

export function buildCdpJsonUrl(host: string, port = DEFAULT_CDP_PORT): string {
  return `http://${host}:${port}/json`;
}

export function toCdpWebSocketUrl(
  webSocketDebuggerUrl: string,
  host: string,
  port = DEFAULT_CDP_PORT,
): string {
  const url = new URL(webSocketDebuggerUrl);
  url.hostname = host;
  url.port = String(port);
  return url.toString();
}
