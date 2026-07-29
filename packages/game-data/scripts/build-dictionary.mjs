#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs';
import {
  access,
  lstat,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  DICTIONARY_DIRECTORY,
  DICTIONARY_PATH,
  EXACT_EXPORT_ARGUMENTS,
  EXPECTED_DICTIONARY_MANIFEST,
  SOURCE_COMMIT,
  SOURCE_GIT_REPOSITORY,
  SOURCE_REPOSITORY,
  SOURCE_RELEASE,
} from './lib/constants.mjs';
import {
  DataVerificationError,
  inspectDictionaryBuffer,
  sha256,
} from './lib/dictionary-verification.mjs';

function parseArguments(arguments_) {
  if (arguments_.length === 0) {
    return Object.freeze({});
  }
  if (
    arguments_.length === 2 &&
    arguments_[0] === '--source-dir' &&
    typeof arguments_[1] === 'string' &&
    arguments_[1].length > 0
  ) {
    return Object.freeze({ sourceDirectory: path.resolve(arguments_[1]) });
  }
  throw new Error(
    'USAGE: npm run data:dictionary:build -- [--source-dir PATH]',
  );
}

function run(command, arguments_, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${command} failed with ${
              signal === null ? `exit code ${String(code)}` : `signal ${signal}`
            }.`,
          ),
        );
      }
    });
  });
}

async function capture(command, arguments_, cwd) {
  let stdout = '';
  let stderr = '';
  await new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${command} failed with exit code ${String(code)}: ${stderr.trim()}`,
          ),
        );
      }
    });
  });
  return stdout.trim();
}

async function assertSafeOutputTarget() {
  const directory = await realpath(DICTIONARY_DIRECTORY);
  if (directory !== path.resolve(DICTIONARY_DIRECTORY)) {
    throw new Error(
      `OUTPUT_PATH: dictionary directory resolves unexpectedly to ${directory}.`,
    );
  }

  try {
    const details = await lstat(DICTIONARY_PATH);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new Error(
        'OUTPUT_PATH: words.txt must be a non-symlink regular file.',
      );
    }
  } catch (error) {
    if (!(error instanceof Error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function verifyCheckout(sourceDirectory) {
  const directoryDetails = await stat(sourceDirectory);
  if (!directoryDetails.isDirectory()) {
    throw new Error('SOURCE_DIRECTORY: source path is not a directory.');
  }

  const canonicalDirectory = await realpath(sourceDirectory);
  const remote = await capture(
    'git',
    ['remote', 'get-url', 'origin'],
    canonicalDirectory,
  );
  if (remote !== SOURCE_GIT_REPOSITORY && remote !== SOURCE_REPOSITORY) {
    throw new Error(
      `SOURCE_REPOSITORY: expected the official ${SOURCE_REPOSITORY} repository, received ${remote}.`,
    );
  }

  const tagCommit = await capture(
    'git',
    ['rev-parse', `refs/tags/${SOURCE_RELEASE}`],
    canonicalDirectory,
  );
  const peeledCommit = await capture(
    'git',
    ['rev-parse', `refs/tags/${SOURCE_RELEASE}^{commit}`],
    canonicalDirectory,
  );
  if (tagCommit !== SOURCE_COMMIT || peeledCommit !== SOURCE_COMMIT) {
    throw new Error(
      `SOURCE_TAG: ${SOURCE_RELEASE} did not resolve and peel to ${SOURCE_COMMIT}.`,
    );
  }

  const head = await capture('git', ['rev-parse', 'HEAD'], canonicalDirectory);
  if (head !== SOURCE_COMMIT) {
    throw new Error(
      `SOURCE_COMMIT: expected checked-out HEAD ${SOURCE_COMMIT}, received ${head}.`,
    );
  }

  const trackedChanges = await capture(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    canonicalDirectory,
  );
  if (trackedChanges.length > 0) {
    throw new Error(
      'SOURCE_WORKTREE: the pinned source checkout has tracked changes.',
    );
  }

  await access(path.join(canonicalDirectory, 'scowl'), fsConstants.X_OK);
  await access(path.join(canonicalDirectory, 'Makefile'), fsConstants.R_OK);
  await access(path.join(canonicalDirectory, 'Copyright'), fsConstants.R_OK);
  return canonicalDirectory;
}

function normalizeExport(rawText) {
  const words = [];
  for (const sourceEntry of rawText.split('\n')) {
    if (
      /^[a-z]+$/u.test(sourceEntry) &&
      sourceEntry.length >= EXPECTED_DICTIONARY_MANIFEST.minimumLength &&
      sourceEntry.length <= EXPECTED_DICTIONARY_MANIFEST.maximumLength
    ) {
      words.push(sourceEntry.toUpperCase());
    }
  }
  words.sort();
  return `${[...new Set(words)].join('\n')}\n`;
}

function firstDifference(expectedText, actualText) {
  const expectedLines = expectedText.split('\n');
  const actualLines = actualText.split('\n');
  const lineCount = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < lineCount; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return {
        line: index + 1,
        expected: (expectedLines[index] ?? '<missing>').slice(0, 80),
        actual: (actualLines[index] ?? '<missing>').slice(0, 80),
      };
    }
  }
  return null;
}

async function reportUnexpectedOutput(outputBuffer, normalized) {
  let firstDifferenceDetails = null;
  try {
    const committed = await readFile(DICTIONARY_PATH, 'ascii');
    firstDifferenceDetails = firstDifference(committed, normalized);
  } catch {
    // The fixed committed baseline can be absent during initial file creation.
  }

  const versionCommands = [
    ['git', ['--version']],
    ['make', ['--version']],
    ['python3', ['--version']],
    ['sqlite3', ['--version']],
    ['gzip', ['--version']],
  ];
  const versions = [];
  for (const [command, arguments_] of versionCommands) {
    const version = await capture(command, arguments_, DICTIONARY_DIRECTORY);
    versions.push(`${command}: ${version.split('\n')[0]}`);
  }

  const actualWords = normalized.slice(0, -1).split('\n').length;
  console.error(`Source commit: ${SOURCE_COMMIT}`);
  console.error(`Tool versions: ${versions.join('; ')}`);
  console.error(`Export command: ./scowl ${EXACT_EXPORT_ARGUMENTS.join(' ')}`);
  console.error(`Actual words: ${actualWords}`);
  console.error(`Actual bytes: ${outputBuffer.length}`);
  console.error(`Actual SHA-256: ${sha256(outputBuffer)}`);
  console.error(
    firstDifferenceDetails === null
      ? 'First difference: committed baseline unavailable or byte-identical.'
      : `First difference: line ${firstDifferenceDetails.line}; expected ` +
          `${JSON.stringify(firstDifferenceDetails.expected)}, received ` +
          `${JSON.stringify(firstDifferenceDetails.actual)}.`,
  );
}

async function generateFromCheckout(sourceDirectory, buildDirectory) {
  await run('make', ['scowl.db'], { cwd: sourceDirectory });

  const rawPath = path.join(buildDirectory, 'raw.txt');
  const rawHandle = await open(rawPath, 'wx', 0o600);
  try {
    await run('./scowl', EXACT_EXPORT_ARGUMENTS, {
      cwd: sourceDirectory,
      stdio: ['ignore', rawHandle.fd, 'inherit'],
    });
  } finally {
    await rawHandle.close();
  }

  const rawText = await readFile(rawPath, 'utf8');
  const normalized = normalizeExport(rawText);
  const outputBuffer = Buffer.from(normalized, 'ascii');
  const actualWordCount = normalized.slice(0, -1).split('\n').length;
  if (
    actualWordCount !== EXPECTED_DICTIONARY_MANIFEST.wordCount ||
    outputBuffer.length !== EXPECTED_DICTIONARY_MANIFEST.uncompressedBytes ||
    sha256(outputBuffer) !== EXPECTED_DICTIONARY_MANIFEST.sha256
  ) {
    await reportUnexpectedOutput(outputBuffer, normalized);
    throw new Error(
      'DICTIONARY_MISMATCH: reproduced output did not match the pinned expected measurements.',
    );
  }
  inspectDictionaryBuffer(outputBuffer);

  const pendingWordsPath = path.join(buildDirectory, 'words.txt');
  await writeFile(pendingWordsPath, outputBuffer, {
    encoding: null,
    flag: 'wx',
    mode: 0o644,
  });

  const gzipPath = path.join(buildDirectory, 'words.txt.gz');
  const gzipHandle = await open(gzipPath, 'wx', 0o600);
  try {
    await run('gzip', ['-9', '-n', '-c', pendingWordsPath], {
      cwd: buildDirectory,
      stdio: ['ignore', gzipHandle.fd, 'inherit'],
    });
  } finally {
    await gzipHandle.close();
  }
  const gzipDetails = await stat(gzipPath);
  if (gzipDetails.size !== EXPECTED_DICTIONARY_MANIFEST.gzipBytes) {
    throw new Error(
      `GZIP_BYTE_COUNT: expected ${EXPECTED_DICTIONARY_MANIFEST.gzipBytes}, ` +
        `received ${gzipDetails.size}.`,
    );
  }

  await assertSafeOutputTarget();
  await rename(pendingWordsPath, DICTIONARY_PATH);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  let sourceTemporaryDirectory;
  let buildDirectory;
  try {
    let sourceDirectory = options.sourceDirectory;
    if (sourceDirectory === undefined) {
      sourceTemporaryDirectory = await mkdtemp(
        path.join(tmpdir(), 'words-esdb-source-'),
      );
      sourceDirectory = path.join(sourceTemporaryDirectory, 'source');
      await run('git', ['init', sourceDirectory]);
      await run('git', ['remote', 'add', 'origin', SOURCE_GIT_REPOSITORY], {
        cwd: sourceDirectory,
      });
      await run(
        'git',
        [
          'fetch',
          '--depth=1',
          '--no-tags',
          'origin',
          `refs/tags/${SOURCE_RELEASE}:refs/tags/${SOURCE_RELEASE}`,
        ],
        { cwd: sourceDirectory },
      );
      await run('git', ['checkout', '--detach', SOURCE_COMMIT], {
        cwd: sourceDirectory,
      });
    }

    const verifiedSourceDirectory = await verifyCheckout(sourceDirectory);
    buildDirectory = await mkdtemp(
      path.join(DICTIONARY_DIRECTORY, '.dictionary-build-'),
    );
    await generateFromCheckout(verifiedSourceDirectory, buildDirectory);

    console.log(`Source commit: ${SOURCE_COMMIT}`);
    console.log(`Words: ${EXPECTED_DICTIONARY_MANIFEST.wordCount}`);
    console.log(`Bytes: ${EXPECTED_DICTIONARY_MANIFEST.uncompressedBytes}`);
    console.log(`SHA-256: ${EXPECTED_DICTIONARY_MANIFEST.sha256}`);
  } catch (error) {
    if (error instanceof DataVerificationError) {
      console.error(error.message);
    }
    throw error;
  } finally {
    if (buildDirectory !== undefined) {
      await rm(buildDirectory, { recursive: true, force: true });
    }
    if (sourceTemporaryDirectory !== undefined) {
      await rm(sourceTemporaryDirectory, { recursive: true, force: true });
    }
  }
}

await main();
