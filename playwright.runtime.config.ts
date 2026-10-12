import { defineConfig } from '@playwright/test';
import base from './playwright.config';
process.env.SATISPIRE_BASE_URL = 'http://127.0.0.1:4175';
export default defineConfig({
  ...base,
  webServer: {
    command: 'npm start',
    env: { HOST: '127.0.0.1', PORT: '4175', NODE_ENV: 'production' },
    url: 'http://127.0.0.1:4175/healthz',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
