import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXPECTED_DICTIONARY_MANIFEST } from '../scripts/lib/constants.mjs';
import {
  inspectDictionaryBuffer,
  verifyDictionaryBundle,
} from '../scripts/lib/dictionary-verification.mjs';

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
});
