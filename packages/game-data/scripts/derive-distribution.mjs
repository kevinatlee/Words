#!/usr/bin/env node

import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  DISTRIBUTION_CANDIDATES_PATH,
  DISTRIBUTION_DIRECTORY,
  DISTRIBUTION_PROFILE_PATH,
  GENERATED_DISTRIBUTION_PATH,
} from './lib/constants.mjs';
import {
  deriveDistributionArtifacts,
  renderJson,
} from './lib/distribution-model.mjs';
import { verifyDictionaryBundle } from './lib/dictionary-verification.mjs';

async function assertReplaceable(targetPath) {
  try {
    const details = await lstat(targetPath);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new Error(
        `OUTPUT_PATH: ${targetPath} must be a non-symlink regular file.`,
      );
    }
  } catch (error) {
    if (!(error instanceof Error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function replaceIfChanged(pendingPath, targetPath) {
  const [pending, current] = await Promise.all([
    readFile(pendingPath),
    readFile(targetPath).catch((error) => {
      if (error instanceof Error && error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }),
  ]);

  if (current?.equals(pending)) {
    return;
  }

  await rename(pendingPath, targetPath);
}

async function main() {
  const dictionary = await verifyDictionaryBundle();
  const artifacts = deriveDistributionArtifacts(
    dictionary.words,
    dictionary.sha256,
  );

  await mkdir(DISTRIBUTION_DIRECTORY, { recursive: true });
  await mkdir(path.dirname(GENERATED_DISTRIBUTION_PATH), { recursive: true });
  const temporaryDirectory = await mkdtemp(
    path.join(DISTRIBUTION_DIRECTORY, '.distribution-build-'),
  );
  try {
    const pendingCandidates = path.join(temporaryDirectory, 'candidates.json');
    const pendingProfile = path.join(temporaryDirectory, 'profile.json');
    const pendingTypeScript = path.join(
      temporaryDirectory,
      'distribution-data.ts',
    );
    await Promise.all([
      writeFile(pendingCandidates, renderJson(artifacts.candidates), {
        flag: 'wx',
        mode: 0o644,
      }),
      writeFile(pendingProfile, renderJson(artifacts.profile), {
        flag: 'wx',
        mode: 0o644,
      }),
      writeFile(pendingTypeScript, artifacts.generatedTypeScript, {
        flag: 'wx',
        mode: 0o644,
      }),
    ]);

    await Promise.all([
      assertReplaceable(DISTRIBUTION_CANDIDATES_PATH),
      assertReplaceable(DISTRIBUTION_PROFILE_PATH),
      assertReplaceable(GENERATED_DISTRIBUTION_PATH),
    ]);
    // Avoid touching byte-identical tracked outputs. Besides preserving useful
    // timestamps, this prevents synchronized filesystems from creating
    // conflict copies during repeatable no-op derivations.
    await replaceIfChanged(pendingCandidates, DISTRIBUTION_CANDIDATES_PATH);
    await replaceIfChanged(pendingProfile, DISTRIBUTION_PROFILE_PATH);
    await replaceIfChanged(pendingTypeScript, GENERATED_DISTRIBUTION_PATH);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(`Dictionary SHA-256: ${dictionary.sha256}`);
  console.log(`Selected method: ${artifacts.profile.derivationMethod}`);
  console.log(`Total weight: ${artifacts.profile.totalWeight}`);
  console.log(`Profile SHA-256: ${artifacts.profile.profileSha256}`);
}

await main();
