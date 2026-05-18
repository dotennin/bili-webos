# WEN-38 Coverage And CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise weighted LCOV total coverage to at least 95%, then add PR coverage comparison against `main` with delta reporting and a `<80%` weighted-total failure gate.

**Architecture:** Increase coverage by testing the biggest weighted hotspots first, using the existing Bun + Happy DOM test stack and only minimal testability extractions where top-level side effects block stable tests. After coverage reaches the target, add a single coverage-comparison utility in `tools/` and make the GitHub Actions workflow use that utility for both PR comments and gate decisions so all weighted calculations come from one code path.

**Tech Stack:** Bun 1.3.14, TypeScript, React 19, Happy DOM, GitHub Actions, Node `fs/path/child_process`, existing `tools/coverage-summary.ts`

---

### Task 1: Raise App-Shell Coverage In `src/App.tsx`

**Files:**
- Modify: `src/App.render.test.ts`
- Modify: `src/App.tsx`
- Test: `src/App.render.test.ts`

- [ ] **Step 1: Write the failing app-shell coverage tests**

```ts
// src/App.render.test.ts
test('App restores auth, handles page routing, cast play/stop, refresh, and back branches', async () => {
  const { default: App } = await importFresh('./App.tsx');
  const renderer = await render(React.createElement(App));
  await flush();

  expect(textOf(renderer.toJSON())).toContain('已登录用户');

  await interact(() =>
    sidebarItems.find((item) => item.label === '热门')?.onSelect(),
  );
  expect(
    pageProps.some(
      (entry) => entry.page === 'HomePage' && entry.props.mode === 'hot',
    ),
  ).toBe(true);

  await interact(() =>
    castSubscription?.({
      kind: 'command',
      command: {
        type: 'play',
        contentType: 'video',
        bvid: 'BV1xx',
        cid: 9,
        title: '投屏视频',
        seekTs: 12,
      },
    }),
  );
  expect(playerProps.video?.video).toMatchObject({
    bvid: 'BV1xx',
    title: '投屏视频',
    progress: 12,
    fromCast: true,
  });

  await interact(() => eventTarget.dispatchEvent(new CustomEvent('tv-back')));
  expect(textOf(renderer.toJSON())).not.toContain('mock-PlayerPage');
});
```

- [ ] **Step 2: Run the focused app-shell test and verify it fails**

Run:

```bash
BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; "$BUN_BIN" test src/App.render.test.ts
```

Expected: FAIL because at least one untested branch around repeat-page refresh, stop-command handling, login modal dismissal, or final back behavior is not yet covered cleanly by the current test.

- [ ] **Step 3: Implement the minimal App testability adjustments**

```ts
// src/App.tsx
const DEFAULT_PAGE = 'recommend';

function isPlayVideoCommandReady(command: any, playerVideo: any, liveRoom: any) {
  return (
    (command?.contentType === 'video' && playerVideo) ||
    (command?.contentType === 'live' && liveRoom)
  );
}

export default function App() {
  // existing state...

  useEffect(() => {
    const pending = pendingCastAckRef.current;
    if (!pending) return;
    if (isPlayVideoCommandReady(pending, playerVideo, liveRoom)) {
      castAck({ accepted: true, command: pending, at: Date.now() }).catch(
        () => {},
      );
      pendingCastAckRef.current = null;
    }
  }, [playerVideo, liveRoom]);

  const handlePageChange = useCallback(
    (key: string) => {
      if (key === 'follow' && !loggedIn) {
        setShowLogin(true);
        return;
      }
      if (key === page) {
        setRefreshKey((n) => n + 1);
        return;
      }
      setPage(key);
    },
    [loggedIn, page],
  );
}
```

- [ ] **Step 4: Re-run the focused app-shell test and verify it passes**

Run:

```bash
BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; "$BUN_BIN" test src/App.render.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the app-shell coverage lift**

```bash
git add src/App.tsx src/App.render.test.ts
git commit -m "test: expand App shell coverage"
```

### Task 2: Raise Proxy And Service Coverage In The Biggest Node Hotspots

**Files:**
- Modify: `src/dev/biliProxy.test.ts`
- Modify: `src/dev/biliProxy.ts`
- Modify: `webos/service/com.biliwebos.app.service/test/service-runtime.test.ts`
- Modify: `webos/service/com.biliwebos.app.service/test/service-helpers.test.ts`
- Modify: `webos/service/com.biliwebos.app.service/src/service.ts`
- Test: `src/dev/biliProxy.test.ts`
- Test: `webos/service/com.biliwebos.app.service/test/service-runtime.test.ts`
- Test: `webos/service/com.biliwebos.app.service/test/service-helpers.test.ts`

- [ ] **Step 1: Write failing proxy and service hotspot tests**

```ts
// src/dev/biliProxy.test.ts
test('vite proxy middleware rewrites HLS playlists and emits cookie bridge headers', async () => {
  const webCalls: any[] = [];
  https.request = mock((options: any, cb: any) => {
    webCalls.push(options);
    const upstreamRes = new EventEmitter() as any;
    upstreamRes.headers = {
      'content-type': 'application/vnd.apple.mpegurl',
      'set-cookie': ['SESSDATA=abc; Path=/'],
    };
    upstreamRes.statusCode = 200;
    upstreamRes.pipe = mock(() => {});

    const upstreamReq = new EventEmitter() as any;
    upstreamReq.write = mock(() => {});
    upstreamReq.destroy = mock(() => {});
    upstreamReq.end = () => {
      cb(upstreamRes);
      upstreamRes.emit('data', Buffer.from('#EXTM3U\nsegment.ts\n'));
      upstreamRes.emit('end');
    };
    return upstreamReq;
  });

  const fresh = await import(`./biliProxy.ts?hls=${Date.now()}`);
  const plugin = fresh.createBiliDevProxyPlugin();
  let middleware: any;
  plugin.configureServer({
    middlewares: {
      use(fn: any) {
        middleware = fn;
      },
    },
  });

  const req = new EventEmitter() as any;
  req.originalUrl = '/proxy/api.live.bilibili.com/live/test.m3u8';
  req.url = req.originalUrl;
  req.method = 'GET';
  req.headers = { host: 'localhost:5173' };

  const proxyRes = new EventEmitter();
  proxyRes.headers = {
    'content-type': 'application/vnd.apple.mpegurl',
    'set-cookie': ['SESSDATA=abc; Path=/'],
  };
  proxyRes.statusCode = 200;

  let body = '';
  const res: any = {
    headers: {},
    statusCode: 0,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    writeHead(code: number) {
      this.statusCode = code;
    },
    end(chunk = '') {
      body += String(chunk);
    },
  };

  middleware(req, res, () => {
    throw new Error('middleware should not fall through');
  });
  req.emit('end');

  expect(webCalls[0]?.path).toBe('/live/test.m3u8');
  expect(res.headers['X-Set-Cookie']).toContain('SESSDATA');
  expect(body).toContain('/proxy/api.live.bilibili.com/');
});
```

```ts
// webos/service/com.biliwebos.app.service/test/service-runtime.test.ts
test('service proxy returns 403 for forbidden hosts and rewrites playlists for allowed HLS', async () => {
  const handler = serviceModule.createLocalProxyHandler({
    localProxyPort: 7654,
    isAllowedHost: serviceModule.isAllowedHost,
    rewriteHlsPlaylist: serviceModule.rewriteHlsPlaylist,
    decompressResponse: (_res: any, cb: any) => cb(Buffer.from('#EXTM3U\nseg.ts\n')),
    makeRequest: (_parsedUrl: any, _method: any, _body: any, _contentType: any, _range: any, cb: any) => {
      cb(
        null,
        createProxyRes(200, {
          'content-type': 'application/vnd.apple.mpegurl',
        }, []),
      );
    },
  });

  const forbidden = new EventEmitter() as any;
  forbidden.url = '/proxy/example.com/video.m3u8';
  forbidden.method = 'GET';
  forbidden.headers = {};
  const forbiddenRes: any = {
    statusCode: 0,
    body: '',
    setHeader: mock(() => {}),
    writeHead(code: number) {
      this.statusCode = code;
    },
    end(chunk = '') {
      this.body += String(chunk);
    },
  };

  handler(forbidden, forbiddenRes);
  expect(forbiddenRes.statusCode).toBe(403);

  const allowed = new EventEmitter() as any;
  allowed.url = '/proxy/api.live.bilibili.com/live/test.m3u8';
  allowed.method = 'GET';
  allowed.headers = {};
  const allowedRes: any = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    writeHead(code: number) {
      this.statusCode = code;
    },
    end(chunk = '') {
      this.body += String(chunk);
    },
  };

  handler(allowed, allowedRes);
  await new Promise((resolve) => queueMicrotask(resolve));
  expect(allowedRes.statusCode).toBe(200);
  expect(allowedRes.body).toContain('/proxy/api.live.bilibili.com/');
});
```

```ts
// webos/service/com.biliwebos.app.service/test/service-helpers.test.ts
it('decompressResponse handles deflate fallback and raw payload branches', async () => {
  const zipped = zlib.deflateRawSync(Buffer.from('segment'));
  const res = new EventEmitter();
  res.headers = { 'content-encoding': 'deflate' };
  const bodyPromise = new Promise((resolve) => decompressResponse(res, resolve));
  res.emit('data', zipped);
  res.emit('end');
  expect((await bodyPromise).toString()).toBe('segment');
});
```

- [ ] **Step 2: Run the targeted proxy and service tests and verify they fail**

Run:

```bash
BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; "$BUN_BIN" test src/dev/biliProxy.test.ts webos/service/com.biliwebos.app.service/test/service-runtime.test.ts webos/service/com.biliwebos.app.service/test/service-helpers.test.ts
```

Expected: FAIL because the current code does not expose stable local-proxy handler seams for direct assertions and does not yet cover the missing decompress and error branches.

- [ ] **Step 3: Extract the smallest helpers needed and implement the missing assertions**

```ts
// webos/service/com.biliwebos.app.service/src/service.ts
export function createLocalProxyHandler({
  localProxyPort,
  makeRequest,
  isAllowedHost,
  rewriteHlsPlaylist,
  decompressResponse,
}: any) {
  return function handleLocalProxy(req: any, res: any) {
    const url = new URL(req.url || '/', `http://127.0.0.1:${localProxyPort}`);
    const pathMatch = url.pathname.match(/^\/proxy\/([^/]+)(\/.*)?$/);
    if (!pathMatch) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const host = pathMatch[1];
    if (!isAllowedHost(host)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const upstreamPath = (pathMatch[2] || '/') + (url.search || '');
    const parsedUrl = new URL(`https://${host}${upstreamPath}`);
    const range = req.headers.range || '';

    makeRequest(parsedUrl, req.method, '', '', range, (err: any, proxyRes: any) => {
      if (err) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
        return;
      }

      const contentType = String(proxyRes.headers['content-type'] || '');
      const isPlaylist =
        contentType.indexOf('application/vnd.apple.mpegurl') >= 0 ||
        parsedUrl.pathname.endsWith('.m3u8');

      if (!isPlaylist) {
        Object.keys(proxyRes.headers).forEach((key) => {
          const value = proxyRes.headers[key];
          if (value != null) res.setHeader(key, value);
        });
        res.writeHead(proxyRes.statusCode || 200);
        proxyRes.pipe(res);
        return;
      }

      decompressResponse(proxyRes, (bodyBuffer: Buffer) => {
        const rewritten = rewriteHlsPlaylist(
          bodyBuffer.toString('utf8'),
          parsedUrl.toString(),
          `http://127.0.0.1:${localProxyPort}`,
        );
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', Buffer.byteLength(rewritten));
        res.writeHead(proxyRes.statusCode || 200);
        res.end(rewritten);
      });
    });
  };
}

const localProxy = http.createServer(
  createLocalProxyHandler({
    localProxyPort,
    makeRequest,
    isAllowedHost,
    rewriteHlsPlaylist,
    decompressResponse,
  }),
);
```

```ts
// src/dev/biliProxy.ts
export function copyResponseHeaders(proxyRes: any, res: any, extras = {}) {
  const forwarded = { ...proxyRes.headers, ...extras };
  delete forwarded['set-cookie'];
  if (extras['Content-Length'] == null) {
    delete forwarded['content-length'];
    delete forwarded['Content-Length'];
  }
  Object.entries(forwarded).forEach(([key, value]) => {
    if (value !== undefined) res.setHeader(key, value as any);
  });
}
```

- [ ] **Step 4: Re-run the targeted proxy and service tests and verify they pass**

Run:

```bash
BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; "$BUN_BIN" test src/dev/biliProxy.test.ts webos/service/com.biliwebos.app.service/test/service-runtime.test.ts webos/service/com.biliwebos.app.service/test/service-helpers.test.ts
```

Expected: PASS

- [ ] **Step 5: Run repository coverage and confirm the weighted total reaches the ticket target**

Run:

```bash
BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; "$BUN_BIN" test:coverage
node tools/coverage-summary.ts coverage
node -e "const fs=require('fs');const s=JSON.parse(fs.readFileSync('coverage/coverage-summary.json','utf8'));console.log(JSON.stringify(s.total,null,2)); if (s.total.lines.pct < 95 || s.total.statements.pct < 95 || s.total.functions.pct < 95 || s.total.branches.pct < 95) process.exit(1);"
```

Expected: PASS with weighted `lines`, `statements`, `functions`, and `branches` all `>=95`

- [ ] **Step 6: Commit the coverage-hotspot test lift**

```bash
git add src/dev/biliProxy.ts src/dev/biliProxy.test.ts webos/service/com.biliwebos.app.service/src/service.ts webos/service/com.biliwebos.app.service/test/service-runtime.test.ts webos/service/com.biliwebos.app.service/test/service-helpers.test.ts coverage/coverage-summary.json
git commit -m "test: raise weighted coverage for proxy and service paths"
```

### Task 3: Add A Single Coverage Comparison And Gating Utility

**Files:**
- Create: `tools/coverage-compare.ts`
- Create: `tools/coverage-compare.test.ts`
- Modify: `package.json`
- Test: `tools/coverage-compare.test.ts`

- [ ] **Step 1: Write failing comparison and gating tests**

```ts
// tools/coverage-compare.test.ts
import { describe, expect, it } from 'bun:test';
import {
  buildCoverageReport,
  formatDeltaPct,
  findBelowThresholdMetrics,
} from './coverage-compare.ts';

describe('coverage compare', () => {
  it('computes weighted current/main/delta rows', () => {
    const report = buildCoverageReport(
      { total: { lines: { pct: 96 }, statements: { pct: 96 }, functions: { pct: 95 }, branches: { pct: 100 } } },
      { total: { lines: { pct: 94.5 }, statements: { pct: 94.5 }, functions: { pct: 93 }, branches: { pct: 100 } } },
      80,
    );
    expect(report.rows[0]).toEqual({
      metric: 'Lines',
      current: '96.00%',
      main: '94.50%',
      delta: '+1.50%',
    });
    expect(report.failed).toBe(false);
  });

  it('flags below-threshold weighted metrics and emits warning text', () => {
    const failed = findBelowThresholdMetrics(
      { lines: { pct: 89.5 }, statements: { pct: 91 }, functions: { pct: 88 }, branches: { pct: 100 } },
      80,
    );
    expect(failed).toEqual(['Lines', 'Functions']);
  });
});
```

- [ ] **Step 2: Run the new utility test and verify it fails**

Run:

```bash
BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; "$BUN_BIN" test tools/coverage-compare.test.ts
```

Expected: FAIL because `tools/coverage-compare.ts` does not exist yet.

- [ ] **Step 3: Implement the comparison utility and CLI entry**

```ts
// tools/coverage-compare.ts
const METRICS = ['lines', 'statements', 'functions', 'branches'] as const;

export function formatPct(value: number) {
  return `${Number(value).toFixed(2)}%`;
}

export function formatDeltaPct(value: number) {
  const signed = value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
  return `${signed}%`;
}

export function findBelowThresholdMetrics(total: any, threshold: number) {
  return METRICS.filter((metric) => Number(total[metric]?.pct ?? 0) < threshold)
    .map((metric) => metric[0].toUpperCase() + metric.slice(1));
}

export function buildCoverageReport(currentSummary: any, mainSummary: any, threshold = 80) {
  const rows = METRICS.map((metric) => {
    const currentPct = Number(currentSummary.total[metric].pct);
    const mainPct = Number(mainSummary?.total?.[metric]?.pct ?? NaN);
    const label = metric[0].toUpperCase() + metric.slice(1);
    return {
      metric: label,
      current: formatPct(currentPct),
      main: Number.isNaN(mainPct) ? 'N/A' : formatPct(mainPct),
      delta: Number.isNaN(mainPct) ? 'N/A' : formatDeltaPct(currentPct - mainPct),
    };
  });
  const belowThreshold = findBelowThresholdMetrics(currentSummary.total, threshold);
  return { rows, belowThreshold, failed: belowThreshold.length > 0 };
}
```

```json
// package.json
{
  "scripts": {
    "coverage:compare": "BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; \"$BUN_BIN\" tools/coverage-compare.ts"
  }
}
```

- [ ] **Step 4: Re-run the utility tests and verify they pass**

Run:

```bash
BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; "$BUN_BIN" test tools/coverage-compare.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the comparison utility**

```bash
git add tools/coverage-compare.ts tools/coverage-compare.test.ts package.json
git commit -m "feat: add weighted coverage comparison utility"
```

### Task 4: Wire The Utility Into GitHub Actions And Final Verification

**Files:**
- Modify: `.github/workflows/coverage.yml`
- Modify: `tools/coverage-summary.ts`
- Modify: `tools/coverage-compare.ts`
- Test: `tools/coverage-compare.test.ts`

- [ ] **Step 1: Write the failing workflow-facing test for PR comment body generation**

```ts
// tools/coverage-compare.test.ts
it('builds a PR comment with a warning section when weighted coverage is below 80%', () => {
  const report = buildCoverageReport(
    { total: { lines: { pct: 89.5 }, statements: { pct: 91 }, functions: { pct: 88 }, branches: { pct: 100 } } },
    { total: { lines: { pct: 96 }, statements: { pct: 96 }, functions: { pct: 95 }, branches: { pct: 100 } } },
    80,
  );
  expect(renderPullRequestComment(report, { baselineLabel: 'main' })).toContain(
    'Coverage gate failed',
  );
  expect(renderPullRequestComment(report, { baselineLabel: 'main' })).toContain(
    'Lines: 89.50%',
  );
});
```

- [ ] **Step 2: Run the utility tests and verify they fail on the missing comment renderer**

Run:

```bash
BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; "$BUN_BIN" test tools/coverage-compare.test.ts
```

Expected: FAIL because `renderPullRequestComment()` does not exist yet.

- [ ] **Step 3: Implement workflow integration with one source of truth**

```ts
// tools/coverage-compare.ts
export function renderPullRequestComment(report: any, options = {}) {
  const warning = report.failed
    ? [
        '## Coverage Report',
        '',
        `Coverage gate failed: weighted coverage is below ${options.threshold ?? 80}%`,
        '',
        ...report.belowThreshold.map((metric: string) => {
          const row = report.rows.find((entry: any) => entry.metric === metric);
          return `- ${metric}: ${row?.current ?? 'N/A'}`;
        }),
        '',
      ]
    : ['## Coverage Report', ''];

  const table = [
    `Weighted LCOV total vs ${options.baselineLabel ?? 'main'}:`,
    '',
    '| Metric | Current | Main | Delta |',
    '| --- | ---: | ---: | ---: |',
    ...report.rows.map(
      (row: any) =>
        `| ${row.metric} | ${row.current} | ${row.main} | ${row.delta} |`,
    ),
  ];

  return [...warning, ...table].join('\n');
}
```

```yaml
# .github/workflows/coverage.yml
- name: Fetch main coverage baseline
  if: github.event_name == 'pull_request'
  run: |
    mkdir -p coverage/base
    git fetch origin document:refs/remotes/origin/document
    git show origin/document:coverage/coverage-summary.json > coverage/base/coverage-summary.json

- name: Build coverage comparison
  if: github.event_name == 'pull_request'
  run: |
    BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}
    "$BUN_BIN" tools/coverage-compare.ts \
      --current coverage/coverage-summary.json \
      --base coverage/base/coverage-summary.json \
      --threshold 80 \
      --comment-out coverage/pr-comment.md

- name: Comment coverage on PR
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      const body = fs.readFileSync('coverage/pr-comment.md', 'utf8');
      // keep existing marker/update flow

- name: Enforce weighted coverage threshold
  if: github.event_name == 'pull_request'
  run: |
    node -e "const fs=require('fs'); const report=JSON.parse(fs.readFileSync('coverage/compare-result.json','utf8')); if (report.failed) process.exit(1);"
```

- [ ] **Step 4: Re-run tests, then run end-to-end coverage verification**

Run:

```bash
BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; "$BUN_BIN" test
BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; "$BUN_BIN" test:coverage
node tools/coverage-summary.ts coverage
BUN_BIN=${BUN_BIN:-$HOME/.bun/bin/bun}; "$BUN_BIN" test tools/coverage-compare.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit the CI integration**

```bash
git add .github/workflows/coverage.yml tools/coverage-summary.ts tools/coverage-compare.ts tools/coverage-compare.test.ts package.json
git commit -m "feat: compare PR coverage against main"
```
