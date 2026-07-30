import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  verifyClientBuildExclusion,
  verifyClientSourceExclusion,
} from '../scripts/lib/client-boundary.mjs';

const DICTIONARY_SHA256 =
  'f5f3d22bd07b8f8d2dd8cf4f3caff211b6f3249a24da02c5aa2a21bf2210f352';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createRepository() {
  const repositoryRoot = await mkdtemp(
    path.join(tmpdir(), 'words-client-boundary-'),
  );
  temporaryDirectories.push(repositoryRoot);
  await Promise.all([
    mkdir(path.join(repositoryRoot, 'apps/client/src'), { recursive: true }),
    mkdir(path.join(repositoryRoot, 'packages/shared/src'), {
      recursive: true,
    }),
  ]);
  await Promise.all([
    writeFile(
      path.join(repositoryRoot, 'apps/client/package.json'),
      JSON.stringify({
        name: '@words/client',
        dependencies: { '@words/shared': '*' },
      }),
    ),
    writeFile(
      path.join(repositoryRoot, 'apps/client/src/main.ts'),
      "import '@words/shared';\n",
    ),
    writeFile(
      path.join(repositoryRoot, 'packages/shared/package.json'),
      JSON.stringify({ name: '@words/shared' }),
    ),
    writeFile(
      path.join(repositoryRoot, 'packages/shared/src/index.ts'),
      'export const safe = true;\n',
    ),
  ]);
  return repositoryRoot;
}

describe('browser game-data boundary', () => {
  it('rejects a game-data re-export from a browser-reachable workspace', async () => {
    const repositoryRoot = await createRepository();
    await writeFile(
      path.join(repositoryRoot, 'packages/shared/src/index.ts'),
      "export { DEFAULT_TILE_DISTRIBUTION } from '@words/game-data';\n",
    );

    await expect(
      verifyClientSourceExclusion({
        repositoryRoot,
        dictionarySha256: DICTIONARY_SHA256,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'CLIENT_DATA_IMPORT',
        file: 'packages/shared/src/index.ts',
      }),
    );
  });

  it('rejects a transitive workspace dependency on game data', async () => {
    const repositoryRoot = await createRepository();
    await mkdir(path.join(repositoryRoot, 'packages/bridge/src'), {
      recursive: true,
    });
    await Promise.all([
      writeFile(
        path.join(repositoryRoot, 'packages/shared/package.json'),
        JSON.stringify({
          name: '@words/shared',
          dependencies: { '@words/bridge': '*' },
        }),
      ),
      writeFile(
        path.join(repositoryRoot, 'packages/bridge/package.json'),
        JSON.stringify({
          name: '@words/bridge',
          dependencies: { '@words/game-data': '*' },
        }),
      ),
      writeFile(
        path.join(repositoryRoot, 'packages/bridge/src/index.ts'),
        'export const bridge = true;\n',
      ),
    ]);

    await expect(
      verifyClientSourceExclusion({
        repositoryRoot,
        dictionarySha256: DICTIONARY_SHA256,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'CLIENT_DATA_DEPENDENCY',
        file: 'packages/bridge/package.json',
      }),
    );
  });

  it('rejects a dictionary identifier in built client output', async () => {
    const repositoryRoot = await createRepository();
    await mkdir(path.join(repositoryRoot, 'apps/client/dist'), {
      recursive: true,
    });
    await writeFile(
      path.join(repositoryRoot, 'apps/client/dist/index.js'),
      `const dictionary = '${DICTIONARY_SHA256}';\n`,
    );

    await expect(
      verifyClientBuildExclusion({
        repositoryRoot,
        dictionarySha256: DICTIONARY_SHA256,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'CLIENT_BUILD_CONTAINS_GAME_DATA',
        file: 'apps/client/dist/index.js',
      }),
    );
  });

  it('rejects symbolic links in browser-reachable source', async () => {
    const repositoryRoot = await createRepository();
    await symlink(
      path.join(repositoryRoot, 'packages/shared/src/index.ts'),
      path.join(repositoryRoot, 'apps/client/src/linked.ts'),
    );

    await expect(
      verifyClientSourceExclusion({
        repositoryRoot,
        dictionarySha256: DICTIONARY_SHA256,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'CLIENT_SOURCE_SYMLINK',
        file: 'apps/client/src/linked.ts',
      }),
    );
  });

  it('rejects symbolic links in built client output', async () => {
    const repositoryRoot = await createRepository();
    await mkdir(path.join(repositoryRoot, 'apps/client/dist'), {
      recursive: true,
    });
    await symlink(
      path.join(repositoryRoot, 'apps/client/src/main.ts'),
      path.join(repositoryRoot, 'apps/client/dist/linked.js'),
    );

    await expect(
      verifyClientBuildExclusion({
        repositoryRoot,
        dictionarySha256: DICTIONARY_SHA256,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'CLIENT_BUILD_SYMLINK',
        file: 'apps/client/dist/linked.js',
      }),
    );
  });
});
