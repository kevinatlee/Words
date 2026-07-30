import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { EXPECTED_DICTIONARY_MANIFEST } from '../scripts/lib/constants.mjs';
import {
  inspectDictionaryBuffer,
  verifyDictionaryBundle,
  verifyDictionaryManifest,
} from '../scripts/lib/dictionary-verification.mjs';

const execFileAsync = promisify(execFile);

function manifestFor(buffer: Buffer, wordCount: number) {
  return {
    ...EXPECTED_DICTIONARY_MANIFEST,
    wordCount,
    uncompressedBytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

describe('committed game-data integrity', () => {
  it('verifies the exact production dictionary, manifest, and notice', async () => {
    const verified = await verifyDictionaryBundle();

    expect(verified.words).toHaveLength(79_370);
    expect(verified.sha256).toBe(
      'f5f3d22bd07b8f8d2dd8cf4f3caff211b6f3249a24da02c5aa2a21bf2210f352',
    );
    expect(verified.words[0]).toBe('AAH');
    expect(verified.words.at(-1)).toBe('ZYMURGY');
    expect(verified.noticeSha256).toBe(
      '2f4e959749bb16da6e62264e33f620b1738a06290a940039eb83968a446b6460',
    );
    expect(verified.manifest.gzipSha256).toBe(
      '1dccc79270a4c044e78f5b3c9f1cf6184feb40cab706e809ef6e70a2cac0fc39',
    );
  });

  it('reports the first malformed fixture line without dumping the list', () => {
    const buffer = Buffer.from('CAT\nBAD!\n', 'ascii');

    expect(() =>
      inspectDictionaryBuffer(buffer, {
        expectedManifest: manifestFor(buffer, 2),
        fileLabel: 'fixture/words.txt',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'DICTIONARY_WORD_FORMAT',
        line: 2,
      }),
    );
  });

  it('rejects a tampered hash', () => {
    const buffer = Buffer.from('CAT\nDOG\n', 'ascii');
    const manifest = {
      ...manifestFor(buffer, 2),
      sha256: '0'.repeat(64),
    };

    expect(() =>
      inspectDictionaryBuffer(buffer, { expectedManifest: manifest }),
    ).toThrowError(
      expect.objectContaining({
        code: 'DICTIONARY_SHA256',
      }),
    );
  });

  it('rejects a tampered word count', () => {
    const buffer = Buffer.from('CAT\nDOG\n', 'ascii');

    expect(() =>
      inspectDictionaryBuffer(buffer, {
        expectedManifest: manifestFor(buffer, 3),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'DICTIONARY_WORD_COUNT',
      }),
    );
  });

  it('rejects coordinated dictionary and manifest tampering', async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'words-coordinated-tamper-'),
    );
    const buffer = Buffer.from('CAT\nDOG\n', 'ascii');
    try {
      const dictionaryPath = path.join(temporaryDirectory, 'words.txt');
      const manifestPath = path.join(temporaryDirectory, 'manifest.json');
      const noticePath = path.join(temporaryDirectory, 'ESDB-NOTICE.txt');
      await Promise.all([
        writeFile(dictionaryPath, buffer),
        writeFile(manifestPath, `${JSON.stringify(manifestFor(buffer, 2))}\n`),
        writeFile(
          noticePath,
          await readFile(
            new URL('../data/dictionary/ESDB-NOTICE.txt', import.meta.url),
          ),
        ),
      ]);

      await expect(
        verifyDictionaryBundle({
          dictionaryPath,
          manifestPath,
          noticePath,
        }),
      ).rejects.toEqual(
        expect.objectContaining({
          code: 'MANIFEST_FIELD_MISMATCH',
        }),
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('rejects the wrong pinned source commit', () => {
    expect(() =>
      verifyDictionaryManifest({
        ...EXPECTED_DICTIONARY_MANIFEST,
        sourceCommit: '0'.repeat(40),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'MANIFEST_FIELD_MISMATCH',
        field: 'sourceCommit',
      }),
    );
  });

  it('rejects any alteration of the applicable notice', async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'words-notice-tamper-'),
    );
    try {
      const noticePath = path.join(temporaryDirectory, 'ESDB-NOTICE.txt');
      const notice = await readFile(
        new URL('../data/dictionary/ESDB-NOTICE.txt', import.meta.url),
        'utf8',
      );
      await writeFile(
        noticePath,
        notice.replace(
          'https://www.english-corpora.org/coca/',
          'https://invalid.example/coca/',
        ),
      );

      await expect(verifyDictionaryBundle({ noticePath })).rejects.toEqual(
        expect.objectContaining({
          code: 'NOTICE_SHA256',
        }),
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('rejects a missing notice', async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'words-data-integrity-'),
    );
    try {
      await expect(
        verifyDictionaryBundle({
          noticePath: path.join(temporaryDirectory, 'missing-notice.txt'),
        }),
      ).rejects.toEqual(
        expect.objectContaining({
          code: 'FILE_MISSING',
        }),
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('leaves byte-identical generated artifacts untouched', async () => {
    const artifactUrls = [
      new URL('../data/distribution/candidates.json', import.meta.url),
      new URL('../data/distribution/profile.json', import.meta.url),
      new URL('../src/generated/distribution-data.ts', import.meta.url),
    ];
    const before = await Promise.all(
      artifactUrls.map(async (url) => (await stat(url)).mtimeMs),
    );

    await execFileAsync(
      process.execPath,
      [
        fileURLToPath(
          new URL('../scripts/derive-distribution.mjs', import.meta.url),
        ),
      ],
      { cwd: tmpdir() },
    );

    const after = await Promise.all(
      artifactUrls.map(async (url) => (await stat(url)).mtimeMs),
    );
    expect(after).toEqual(before);
  });
});
