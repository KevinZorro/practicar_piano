# Frontend

React + TypeScript (strict) + Vite. Core logic lives in `src/core` as plain TypeScript, with no React, so Vitest can cover it.

```bash
npm ci
npm run dev          # Vite dev server, /api proxied to localhost:8000
npm run typecheck && npm run lint && npm run format:check && npm test
npm run e2e          # Playwright; set PW_CHROMIUM_PATH to reuse a local Chromium
```

See `docs/phase-1/plan.md` section 2.2 for the layout.
