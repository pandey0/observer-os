import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      '@observer-os/core': new URL('../core/src/index.ts', import.meta.url).pathname,
      '@observer-os/sdk': new URL('../sdk/src/index.ts', import.meta.url).pathname,
    },
  },
});
