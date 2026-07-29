import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { DataVerificationError } from './dictionary-verification.mjs';

const GAME_DATA_PACKAGE_NAME = '@words/game-data';
const SOURCE_EXTENSIONS = /\.(?:json|ts|tsx|js|jsx|mjs|cjs|html|css)$/u;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage']);
const CLIENT_BUNDLE_SENTINELS = Object.freeze([
  'CHARACTERISTICALLY',
  'ELECTROENCEPHALOGRAPHIC',
  'ZYMURGY',
]);

async function readJson(filePath, fileLabel) {
  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new DataVerificationError({
      code: 'CLIENT_BOUNDARY_FILE',
      file: fileLabel,
      expected: 'a readable JSON file',
      actual: error instanceof Error ? (error.code ?? error.message) : error,
    });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new DataVerificationError({
      code: 'CLIENT_BOUNDARY_JSON',
      file: fileLabel,
      expected: 'valid JSON',
      actual: error instanceof Error ? error.message : error,
    });
  }
}

async function listFiles(
  directory,
  { skipGeneratedDirectories, repositoryRoot, symlinkErrorCode },
) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (skipGeneratedDirectories && SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new DataVerificationError({
        code: symlinkErrorCode,
        file: path.relative(repositoryRoot, entryPath),
        expected: 'no symbolic links inside the client boundary',
        actual: 'symbolic link',
      });
    }
    if (entry.isDirectory()) {
      files.push(
        ...(await listFiles(entryPath, {
          skipGeneratedDirectories,
          repositoryRoot,
          symlinkErrorCode,
        })),
      );
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function workspacePackages(repositoryRoot) {
  const packagesByName = new Map();
  for (const parentName of ['apps', 'packages']) {
    const parentDirectory = path.join(repositoryRoot, parentName);
    const entries = await readdir(parentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const directory = path.join(parentDirectory, entry.name);
      const manifestPath = path.join(directory, 'package.json');
      let details;
      try {
        details = await lstat(manifestPath);
      } catch {
        continue;
      }
      if (!details.isFile() || details.isSymbolicLink()) {
        continue;
      }
      const manifest = await readJson(
        manifestPath,
        path.relative(repositoryRoot, manifestPath),
      );
      if (typeof manifest.name === 'string') {
        packagesByName.set(manifest.name, { directory, manifest });
      }
    }
  }
  return packagesByName;
}

function dependencyNames(manifest) {
  const names = [];
  for (const field of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const dependencies = manifest[field];
    if (
      typeof dependencies === 'object' &&
      dependencies !== null &&
      !Array.isArray(dependencies)
    ) {
      names.push(...Object.keys(dependencies));
    }
  }
  return names;
}

async function browserReachablePackages(repositoryRoot) {
  const packagesByName = await workspacePackages(repositoryRoot);
  const client = packagesByName.get('@words/client');
  if (client === undefined) {
    throw new DataVerificationError({
      code: 'CLIENT_BOUNDARY_PACKAGE',
      file: 'apps/client/package.json',
      expected: 'the @words/client workspace',
      actual: 'workspace missing',
    });
  }

  const reachable = [];
  const visited = new Set();
  const queue = ['@words/client'];
  while (queue.length > 0) {
    const packageName = queue.shift();
    if (packageName === undefined || visited.has(packageName)) {
      continue;
    }
    visited.add(packageName);
    const workspace = packagesByName.get(packageName);
    if (workspace === undefined) {
      continue;
    }
    reachable.push(workspace);

    for (const dependencyName of dependencyNames(workspace.manifest)) {
      if (dependencyName === GAME_DATA_PACKAGE_NAME) {
        throw new DataVerificationError({
          code: 'CLIENT_DATA_DEPENDENCY',
          file: path.relative(
            repositoryRoot,
            path.join(workspace.directory, 'package.json'),
          ),
          expected: 'no browser-reachable dependency on @words/game-data',
          actual: dependencyName,
        });
      }
      if (packagesByName.has(dependencyName)) {
        queue.push(dependencyName);
      }
    }
  }
  return reachable;
}

export async function verifyClientSourceExclusion({
  repositoryRoot,
  dictionarySha256,
}) {
  const reachable = await browserReachablePackages(repositoryRoot);
  const forbidden = [
    GAME_DATA_PACKAGE_NAME,
    'packages/game-data',
    'game-data/src',
    'game-data/data',
    dictionarySha256,
  ];

  for (const workspace of reachable) {
    const files = await listFiles(workspace.directory, {
      skipGeneratedDirectories: true,
      repositoryRoot,
      symlinkErrorCode: 'CLIENT_SOURCE_SYMLINK',
    });
    for (const filePath of files) {
      if (!SOURCE_EXTENSIONS.test(filePath)) {
        continue;
      }
      const text = await readFile(filePath, 'utf8');
      const matched = forbidden.find((value) => text.includes(value));
      if (matched !== undefined) {
        throw new DataVerificationError({
          code: 'CLIENT_DATA_IMPORT',
          file: path.relative(repositoryRoot, filePath),
          expected: 'no game-data dependency, import, alias, or relative path',
          actual: matched,
        });
      }
    }
  }
}

export async function verifyClientBuildExclusion({
  repositoryRoot,
  dictionarySha256,
}) {
  const buildDirectory = path.join(repositoryRoot, 'apps/client/dist');
  let details;
  try {
    details = await lstat(buildDirectory);
  } catch (error) {
    throw new DataVerificationError({
      code: 'CLIENT_BUILD_MISSING',
      file: 'apps/client/dist',
      expected: 'a completed client build directory',
      actual: error instanceof Error ? (error.code ?? error.message) : error,
    });
  }
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new DataVerificationError({
      code: 'CLIENT_BUILD_TYPE',
      file: 'apps/client/dist',
      expected: 'a non-symlink directory',
      actual: details.isSymbolicLink() ? 'symbolic link' : 'non-directory',
    });
  }

  const forbidden = [
    GAME_DATA_PACKAGE_NAME,
    dictionarySha256,
    ...CLIENT_BUNDLE_SENTINELS,
  ];
  const files = await listFiles(buildDirectory, {
    skipGeneratedDirectories: false,
    repositoryRoot,
    symlinkErrorCode: 'CLIENT_BUILD_SYMLINK',
  });
  for (const filePath of files) {
    const buffer = await readFile(filePath);
    const text = buffer.toString('utf8');
    const matched = forbidden.find((value) => text.includes(value));
    if (matched !== undefined) {
      throw new DataVerificationError({
        code: 'CLIENT_BUILD_CONTAINS_GAME_DATA',
        file: path.relative(repositoryRoot, filePath),
        expected: 'no production game-data identifier or dictionary sentinel',
        actual: matched,
      });
    }
  }
}
