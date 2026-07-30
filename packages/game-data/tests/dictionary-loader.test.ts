import { createHash } from 'node:crypto';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  loadDictionaryBundle,
  loadProductionDictionary,
} from '../src/dictionary-loader.js';

let temporaryDirectory: string;

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'words-dictionary-loader-'),
  );
});

afterAll(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

function fixtureManifest(
  buffer: Buffer,
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    sourceProject: 'Fixture',
    sourceRepository: 'https://example.invalid/fixture',
    sourceRelease: 'fixture-1',
    sourceCommit: 'a'.repeat(40),
    dialects: ['A'],
    sizeLevel: 60,
    variantLevel: 1,
    deaccented: true,
    excludedPartsOfSpeech: [],
    excludedClasses: [],
    minimumLength: 3,
    maximumLength: 64,
    normalization: 'fixture',
    sorting: 'bytewise',
    lineEndings: 'LF',
    wordCount: 2,
    uncompressedBytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    gzipCommand: 'gzip -9 -n',
    gzipBytes: 1,
    gzipSha256: 'b'.repeat(64),
    ...overrides,
  };
}

async function writeFixture(
  name: string,
  buffer: Buffer,
  overrides: Record<string, unknown> = {},
) {
  const dictionaryPath = path.join(temporaryDirectory, `${name}.txt`);
  const manifestPath = path.join(temporaryDirectory, `${name}.json`);
  await Promise.all([
    writeFile(dictionaryPath, buffer),
    writeFile(
      manifestPath,
      `${JSON.stringify(fixtureManifest(buffer, overrides))}\n`,
    ),
  ]);
  return {
    dictionaryUrl: pathToFileURL(dictionaryPath),
    manifestUrl: pathToFileURL(manifestPath),
  };
}

describe('production dictionary loader', () => {
  it('loads all words and representative Canadian and American spellings', async () => {
    const result = await loadProductionDictionary();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.wordCount).toBe(79_370);
      expect(result.dictionary.has('COLOUR')).toBe(true);
      expect(result.dictionary.has('COLOR')).toBe(true);
      expect(result.dictionary.has('AT')).toBe(false);
      expect(result.dictionary.has('NASA')).toBe(false);
    }
  });

  it('resolves package data independently of the process working directory', async () => {
    const originalDirectory = process.cwd();
    process.chdir(temporaryDirectory);
    try {
      const result = await loadProductionDictionary();
      expect(result.success).toBe(true);
    } finally {
      process.chdir(originalDirectory);
    }
  });

  it('rejects network URLs before attempting a request', async () => {
    const result = await loadDictionaryBundle({
      dictionaryUrl: new URL('https://example.invalid/words.txt'),
      manifestUrl: new URL('https://example.invalid/manifest.json'),
    });

    expect(result).toEqual({
      success: false,
      code: 'UNSUPPORTED_DATA_URL',
      detail: 'Dictionary and manifest URLs must use the local file protocol.',
    });
  });

  it('returns a structured format failure for a malformed fixture', async () => {
    const paths = await writeFixture(
      'malformed',
      Buffer.from('CAT\r\nDOG\r\n', 'ascii'),
    );
    const result = await loadDictionaryBundle(paths);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: 'DICTIONARY_FORMAT_INVALID',
      }),
    );
  });

  it('returns a structured failure for a wrong hash', async () => {
    const paths = await writeFixture(
      'wrong-hash',
      Buffer.from('CAT\nDOG\n', 'ascii'),
      { sha256: '0'.repeat(64) },
    );
    const result = await loadDictionaryBundle(paths);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: 'DICTIONARY_HASH_MISMATCH',
      }),
    );
  });

  it('rejects unknown manifest fields', async () => {
    const paths = await writeFixture(
      'unknown-field',
      Buffer.from('CAT\nDOG\n', 'ascii'),
      { generatedAt: 'unstable' },
    );
    const result = await loadDictionaryBundle(paths);

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: 'MANIFEST_INVALID',
      }),
    );
  });

  it('rejects symlinked dictionary and manifest files', async () => {
    const paths = await writeFixture(
      'symlink-target',
      Buffer.from('CAT\nDOG\n', 'ascii'),
    );
    const dictionaryLink = path.join(temporaryDirectory, 'dictionary-link.txt');
    const manifestLink = path.join(temporaryDirectory, 'manifest-link.json');
    await Promise.all([
      symlink(paths.dictionaryUrl, dictionaryLink),
      symlink(paths.manifestUrl, manifestLink),
    ]);

    await expect(
      loadDictionaryBundle({
        dictionaryUrl: pathToFileURL(dictionaryLink),
        manifestUrl: paths.manifestUrl,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        code: 'DICTIONARY_UNSAFE_FILE_TYPE',
      }),
    );
    await expect(
      loadDictionaryBundle({
        dictionaryUrl: paths.dictionaryUrl,
        manifestUrl: pathToFileURL(manifestLink),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        code: 'MANIFEST_UNSAFE_FILE_TYPE',
      }),
    );
  });

  it('does not expose a backing Set or share caller-visible mutable state', async () => {
    const [first, second] = await Promise.all([
      loadProductionDictionary(),
      loadProductionDictionary(),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.dictionary).not.toBe(second.dictionary);
      expect(first.manifest).not.toBe(second.manifest);
      expect(Object.keys(first.dictionary)).toEqual(['has']);
      expect(Object.isFrozen(first.dictionary)).toBe(true);
      expect(Object.isFrozen(first.manifest)).toBe(true);
      expect(Object.isFrozen(first.manifest.dialects)).toBe(true);
    }
  });
});
