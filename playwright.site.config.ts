import { defineConfig } from '@playwright/test';
import base from './playwright.config';
process.env.SATISPIRE_BASE_URL = 'http://127.0.0.1:4178';
process.env.SATISPIRE_TEST_ONLINE = '1';
export default defineConfig({
  ...base,
  testMatch: ['online-collaboration.spec.ts', 'site-room-routing.spec.ts'],
  webServer: {
    command: 'npx tsx scripts/preview-site.ts',
    url: 'http://127.0.0.1:4178/api/session-config',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
