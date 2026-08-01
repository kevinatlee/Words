import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const productionDirectory = path.join(repositoryRoot, 'dist', 'production');
const clientSourceDirectory = path.join(
  repositoryRoot,
  'apps',
  'client',
  'dist',
);
const dictionarySourceDirectory = path.join(
  repositoryRoot,
  'packages',
  'game-data',
  'data',
  'dictionary',
);
const serverEntryPoint = path.join(
  repositoryRoot,
  'apps',
  'server',
  'src',
  'production.ts',
);

async function requireDirectory(directory, description) {
  let directoryStat;
  try {
    directoryStat = await stat(directory);
  } catch {
    throw new Error(`${description} is missing: ${directory}`);
  }
  if (!directoryStat.isDirectory()) {
    throw new Error(`${description} must be a directory: ${directory}`);
  }
}

await requireDirectory(clientSourceDirectory, 'The Vite client build output');
await requireDirectory(dictionarySourceDirectory, 'The production dictionary');

await rm(productionDirectory, { force: true, recursive: true });
await mkdir(productionDirectory, { recursive: true });

await Promise.all([
  cp(clientSourceDirectory, path.join(productionDirectory, 'client'), {
    recursive: true,
  }),
  cp(
    dictionarySourceDirectory,
    path.join(productionDirectory, 'data', 'dictionary'),
    {
      recursive: true,
    },
  ),
]);

await build({
  bundle: true,
  entryPoints: [serverEntryPoint],
  format: 'esm',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  outfile: path.join(productionDirectory, 'server', 'index.mjs'),
  platform: 'node',
  sourcemap: false,
  target: 'node24',
});

console.log(`Built production output in ${productionDirectory}`);
