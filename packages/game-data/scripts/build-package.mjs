#!/usr/bin/env node

import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const outputDirectory = fileURLToPath(new URL('../dist/', import.meta.url));
const outputFile = fileURLToPath(new URL('../dist/index.js', import.meta.url));

await rm(outputDirectory, { recursive: true, force: true });
await build({
  bundle: true,
  entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
  format: 'esm',
  logLevel: 'warning',
  outfile: outputFile,
  platform: 'node',
  sourcemap: false,
  target: 'node24',
});

const originalDirectory = process.cwd();
try {
  process.chdir(tmpdir());
  const builtPackage = await import(
    `${new URL('../dist/index.js', import.meta.url).href}?verification`
  );
  const loaded = await builtPackage.loadProductionDictionary();
  if (!loaded.success || loaded.wordCount !== 79_370) {
    throw new Error(
      `Built dictionary loader failed: ${
        loaded.success ? `unexpected count ${loaded.wordCount}` : loaded.code
      }.`,
    );
  }
} finally {
  process.chdir(originalDirectory);
}

console.log(
  'Built JavaScript loader verified from an unrelated working directory.',
);
