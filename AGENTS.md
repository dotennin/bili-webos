# Bilibili webOS TV App

## Quick Commands
```bash
# Build + deploy (one command)
bun run build-and-deploy

# Dev mode (browser preview, Vite dev server includes /proxy)
bun run dev

# Remote debug TV app
bun --env-file=.env tools/debug.ts

# Take screenshot from TV
bun --env-file=.env tools/screenshot.ts

# Run API tests (Vite dev server must be running)
bun tools/test-e2e.ts

# Run unit tests
bun test

# Run tests with coverage report, Must be greater than 90% to pass CI while changing existing code.
bun test:coverage
```

## Required skills when applicable:
- using-superpowers
- brainstorming
- writing-plans
- test-driven-development
- systematic-debugging
- requesting-code-review
- finishing-a-development-branch

## Project Structure

```
bili_webos/
├── src/                          # Frontend source (React + Vite)
│   ├── api/client.ts             # B站 API (Luna service on TV, proxy fallback)
│   ├── api/wbi.ts                # WBI signature algorithm
│   ├── hooks/useFocus.ts         # Zero-render focus (direct DOM classList)
│   ├── components/               # VideoCard, VideoGrid, SidebarItem, OSKey
│   ├── pages/                    # HomePage, SearchPage, SettingsPage, LoginPage
│   ├── player/                   # PlayerPage (DASH), LivePlayerPage (HLS), DanmakuLayer
│   └── utils/                    # storage.ts, format.ts
├── public/webOSTVjs-1.2.13/      # webOS Luna bus library
├── vite.config.ts                # target: chrome108, dev /proxy handler
├── webos/
│   ├── meta/                     # appinfo.json, icons
│   └── service/                  # TV Background Service (Node.js v16)
│       └── com.biliwebos.app.service/
│       ├── src/                  # TypeScript service source
│       ├── dist/                 # Compiled Luna methods + local HTTP proxy (:7654)
│       ├── services.json
│       └── package.json
│
├── tools/                        # Dev tools
│   ├── deploy.ts                 # SSH deploy via ssh2
│   ├── debug.ts                  # CDP remote debugger
│   ├── screenshot.ts             # Remote screenshot
│   ├── test-e2e.ts               # API integration tests
│   └── verify.sh                 # Full verification pipeline
│
├── build.sh                      # One-command build + deploy
├── AGENTS.md                     # This file
└── package.json                  # Single project manifest (frontend + tools)
```

## Architecture

```
On TV:  Web App ──Luna bus──▶ JS Service (Node.js) ──HTTPS──▶ B站 API
                  ◀─────────
        Video/Img ──HTTP────▶ Local Proxy (:7654) ──HTTPS──▶ B站 CDN

In Dev: Web App ──HTTP──────▶ Vite Dev Server (/proxy) ──HTTPS──▶ B站 API/CDN
```

## Development Workflow
- Use `semantic-release` commit message format for automatic changelog and versioning, also when creating pull requests. Example: `feat: add search page` or `fix: correct video duration format`.
- Run `bun format` and `bun lint` before committing to ensure consistent code style.
- For frontend and hook tests, avoid test designs that depend on shared global `window`/`document` event dispatch, cross-file DOM mutation order, or timing-sensitive React effect registration. Prefer pure helpers, explicit test seams, and direct handler invocation over global event simulation when validating unit behavior.
- Also avoid assertions that depend on module-singleton mutable state staying isolated across the full Bun coverage run. If a singleton seam test cannot be made hermetic, delete it and recover coverage through stable behavior tests elsewhere.
- Environment rule: distinguish browser-local dev and webOS runtime/dev explicitly. Static `biliimg`/`hdslb` assets may use the Vite `/proxy` path only in browser-local development (`localhost` or `127.0.0.1`).
- Environment rule: in webOS runtime/dev, default static image URLs should stay direct and should not be rewritten to `/proxy` or forced through CDN-specific browser-dev header behavior unless a task explicitly requires that proxy path.
