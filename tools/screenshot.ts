// Take a screenshot from the TV app via CDP
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import {
  buildCdpJsonUrl,
  DEFAULT_CDP_PORT,
  isBiliWebosPage,
  toCdpWebSocketUrl,
} from './screenshot-config.ts';

type DevtoolsPage = {
  title?: string;
  description?: string;
  webSocketDebuggerUrl: string;
  url?: string;
};

type CdpMessage = {
  id?: number;
  result?: { data?: string };
  error?: { message?: string };
};

const TV_HOST = requiredEnv('TV_HOST');
const CDP_PORT = Number(process.env.TV_CDP_PORT ?? DEFAULT_CDP_PORT);
const OUT = process.argv[2] || 'screenshot.png';
const REQUEST_TIMEOUT_MS = 10_000;

async function main() {
  const pages = await fetchPages();
  const app = pages.find(isBiliWebosPage);
  if (!app) {
    throw new Error(`App not found at ${buildCdpJsonUrl(TV_HOST, CDP_PORT)}`);
  }

  const wsUrl = toCdpWebSocketUrl(app.webSocketDebuggerUrl, TV_HOST, CDP_PORT);
  await captureScreenshot(wsUrl);
  console.log(`Screenshot saved: ${OUT}`);
}

function fetchPages(): Promise<DevtoolsPage[]> {
  return new Promise((resolve, reject) => {
    const request = http.get(buildCdpJsonUrl(TV_HOST, CDP_PORT), (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('error', reject);
      response.on('aborted', () => {
        reject(new Error('CDP page list response was aborted'));
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(
            new Error(
              `CDP returned HTTP ${response.statusCode}: ${body.slice(0, 200)}`,
            ),
          );
          return;
        }

        try {
          const pages = JSON.parse(body) as unknown;
          if (!Array.isArray(pages)) {
            throw new Error('CDP response is not a page list');
          }
          resolve(pages as DevtoolsPage[]);
        } catch (error) {
          reject(
            new Error(
              `Invalid CDP page list: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(
        new Error(`CDP request timed out after ${REQUEST_TIMEOUT_MS}ms`),
      );
    });
    request.on('error', reject);
  });
}

function captureScreenshot(wsUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      fail(new Error(`CDP screenshot timed out after ${REQUEST_TIMEOUT_MS}ms`));
    }, REQUEST_TIMEOUT_MS);
    let settled = false;

    function finish() {
      clearTimeout(timeout);
      ws.close();
    }

    function terminate() {
      clearTimeout(timeout);
      ws.terminate();
    }

    function fail(error: Error) {
      if (settled) return;
      settled = true;
      terminate();
      reject(error);
    }

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Page.captureScreenshot',
          params: { format: 'png' },
        }),
        (error) => {
          if (error) fail(error);
        },
      );
    });

    ws.on('message', (raw: RawData) => {
      let message: CdpMessage;
      try {
        message = JSON.parse(raw.toString()) as CdpMessage;
      } catch (error) {
        fail(
          new Error(
            `Invalid CDP message: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
        return;
      }

      if (message.id !== 1) return;
      if (message.error) {
        fail(
          new Error(
            `CDP screenshot failed: ${message.error.message ?? 'Unknown error'}`,
          ),
        );
        return;
      }
      if (!message.result?.data) {
        fail(new Error('CDP screenshot response did not contain image data'));
        return;
      }

      writeFileSync(OUT, Buffer.from(message.result.data, 'base64'));
      settled = true;
      finish();
      resolve();
    });

    ws.on('error', (error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });

    ws.on('close', (code, reason) => {
      if (!settled) {
        fail(
          new Error(
            `CDP WebSocket closed before the screenshot was received (${code}: ${reason.toString()})`,
          ),
        );
      }
    });
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

if (!Number.isInteger(CDP_PORT) || CDP_PORT < 1 || CDP_PORT > 65_535) {
  throw new Error(`Invalid TV_CDP_PORT: ${process.env.TV_CDP_PORT}`);
}

main().catch((error) => {
  console.error(
    `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
