import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@observer-os/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
