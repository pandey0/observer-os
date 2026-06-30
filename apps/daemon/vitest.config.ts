import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Point workspace deps to TS source — vite transforms them, avoids ESM/CJS split
      '@observer-os/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@observer-os/sdk': resolve(__dirname, '../../packages/sdk/src/index.ts'),
      '@observer-os/context-engine': resolve(__dirname, '../../packages/context-engine/src/index.ts'),
      '@observer-os/plugin-cdp': resolve(__dirname, '../../packages/plugin-cdp/src/index.ts'),
    },
  },
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
  },
});
