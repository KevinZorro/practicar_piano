import { defineConfig } from '@playwright/test';

// The main flow against the real backend (Basic Pitch, music21), offline: see
// backend/tests/e2e_server.py. Slower than `e2e`, so it has its own command and CI job.
export default defineConfig({
  testDir: './e2e-full',
  timeout: 180_000,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: process.env['PW_CHROMIUM_PATH']
      ? { executablePath: process.env['PW_CHROMIUM_PATH'] }
      : {},
  },
  webServer: [
    {
      command: 'uv run uvicorn tests.e2e_server:create_app --factory --port 8000',
      cwd: '../backend',
      url: 'http://localhost:8000/healthz',
      timeout: 120_000,
      reuseExistingServer: !process.env['CI'],
    },
    {
      command: 'npm run build && npx vite preview --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env['CI'],
    },
  ],
});
