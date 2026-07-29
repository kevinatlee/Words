#!/usr/bin/env node

import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  DISTRIBUTION_CANDIDATES_PATH,
  DISTRIBUTION_PROFILE_PATH,
  GENERATED_DISTRIBUTION_PATH,
  PACKAGE_ROOT,
} from './lib/constants.mjs';
import {
  deriveDistributionArtifacts,
  renderJson,
} from './lib/distribution-model.mjs';
import {
  DataVerificationError,
  sha256,
  verifyDictionaryBundle,
} from './lib/dictionary-verification.mjs';

async function readRegularFile(filePath, fileLabel) {
  let details;
  try {
    details = await lstat(filePath);
  } catch (error) {
    throw new DataVerificationError({
      code: 'FILE_MISSING',
      file: fileLabel,
      expected: 'a regular file',
      actual:
        error instanceof Error ? (error.code ?? error.message) : 'missing',
    });
  }
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new DataVerificationError({
      code: 'UNSAFE_FILE_TYPE',
      file: fileLabel,
      expected: 'a non-symlink regular file',
      actual: details.isSymbolicLink() ? 'symbolic link' : 'non-regular file',
    });
  }
  return readFile(filePath);
}

function firstDifferentLine(expected, actual) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const length = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return index + 1;
    }
  }
  return 1;
}

async function verifyGeneratedFile(filePath, fileLabel, expectedText) {
  const actualBuffer = await readRegularFile(filePath, fileLabel);
  const actualText = actualBuffer.toString('utf8');
  if (actualText !== expectedText) {
    const line = firstDifferentLine(expectedText, actualText);
    throw new DataVerificationError({
      code: 'GENERATED_FILE_MISMATCH',
      file: fileLabel,
      line,
      expected: `generated SHA-256 ${sha256(Buffer.from(expectedText))}`,
      actual: `committed SHA-256 ${sha256(actualBuffer)}`,
    });
  }
}

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'dist', 'coverage'].includes(entry.name)) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function verifyClientExclusion(dictionarySha256) {
  const repositoryRoot = path.resolve(PACKAGE_ROOT, '../..');
  const clientDirectory = path.join(repositoryRoot, 'apps/client');
  const clientFiles = await listSourceFiles(clientDirectory);
  const forbidden = [
    '@words/game-data',
    'data/dictionary/words.txt',
    dictionarySha256,
  ];

  for (const filePath of clientFiles) {
    if (
      !/\.(?:json|ts|tsx|js|jsx|html|css|md)$/u.test(filePath) ||
      filePath.includes(`${path.sep}node_modules${path.sep}`)
    ) {
      continue;
    }
    const text = await readFile(filePath, 'utf8');
    const matched = forbidden.find((value) => text.includes(value));
    if (matched !== undefined) {
      throw new DataVerificationError({
        code: 'CLIENT_DATA_IMPORT',
        file: path.relative(repositoryRoot, filePath),
        expected: 'no game-data package or dictionary reference',
        actual: matched,
      });
    }
  }
}

async function main() {
  const dictionary = await verifyDictionaryBundle();
  console.log(
    `Dictionary verified: ${dictionary.words.length} words, SHA-256 ${dictionary.sha256}.`,
  );
  console.log(
    `Applicable notice verified: SHA-256 ${dictionary.noticeSha256}.`,
  );

  const artifacts = deriveDistributionArtifacts(
    dictionary.words,
    dictionary.sha256,
  );
  await Promise.all([
    verifyGeneratedFile(
      DISTRIBUTION_CANDIDATES_PATH,
      'data/distribution/candidates.json',
      renderJson(artifacts.candidates),
    ),
    verifyGeneratedFile(
      DISTRIBUTION_PROFILE_PATH,
      'data/distribution/profile.json',
      renderJson(artifacts.profile),
    ),
    verifyGeneratedFile(
      GENERATED_DISTRIBUTION_PATH,
      'src/generated/distribution-data.ts',
      artifacts.generatedTypeScript,
    ),
  ]);
  console.log(
    `Distribution verified: ${artifacts.profile.derivationMethod}, profile SHA-256 ${artifacts.profile.profileSha256}.`,
  );

  await verifyClientExclusion(dictionary.sha256);
  console.log(
    'Client exclusion verified: production game data is server-only.',
  );
}

try {
  await main();
} catch (error) {
  if (error instanceof DataVerificationError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
