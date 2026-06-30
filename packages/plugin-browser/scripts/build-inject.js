#!/usr/bin/env node
// Bundles src/inject/index.ts → dist/browser-inject.js (browser IIFE)
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(__dirname, '../src/inject/index.ts')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: '__ObserverBrowserInject__',
  target: ['es2020', 'chrome90', 'firefox90', 'safari14'],
  outfile: resolve(__dirname, '../dist/browser-inject.js'),
  minify: false,
  sourcemap: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

console.log('browser-inject.js built');
