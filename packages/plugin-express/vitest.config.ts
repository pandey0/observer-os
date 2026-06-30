import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@observer-os/core': resolve(__dirname, '../core/src/index.ts'),
      '@observer-os/sdk': resolve(__dirname, '../sdk/src/index.ts'),
    },
  },
});
