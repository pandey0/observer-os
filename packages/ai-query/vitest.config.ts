import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@observer-os/core': resolve(__dirname, '../core/src/index.ts'),
      '@observer-os/context-engine': resolve(__dirname, '../context-engine/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
