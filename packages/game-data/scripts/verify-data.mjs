#!/usr/bin/env node

import { lstat, readFile } from 'node:fs/promises';
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
import {
  verifyClientBuildExclusion,
  verifyClientSourceExclusion,
} from './lib/client-boundary.mjs';

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

function parseArguments(arguments_) {
  if (arguments_.length === 0) {
    return Object.freeze({ verifyClientBuild: false });
  }
  if (arguments_.length === 1 && arguments_[0] === '--client-build') {
    return Object.freeze({ verifyClientBuild: true });
  }
  throw new Error('USAGE: npm run data:verify -- [--client-build]');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
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

  const repositoryRoot = path.resolve(PACKAGE_ROOT, '../..');
  await verifyClientSourceExclusion({
    repositoryRoot,
    dictionarySha256: dictionary.sha256,
  });
  console.log(
    'Client source boundary verified: production game data is server-only.',
  );
  if (options.verifyClientBuild) {
    await verifyClientBuildExclusion({
      repositoryRoot,
      dictionarySha256: dictionary.sha256,
    });
    console.log('Client build verified: production game data is absent.');
  }
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
