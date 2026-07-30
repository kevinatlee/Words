import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';

import {
  DICTIONARY_MANIFEST_PATH,
  DICTIONARY_NOTICE_PATH,
  DICTIONARY_PATH,
  EXPECTED_DICTIONARY_MANIFEST,
  EXPECTED_DICTIONARY_NOTICE_SHA256,
} from './constants.mjs';

export class DataVerificationError extends Error {
  constructor({ code, file, field, line, expected, actual }) {
    const location = line === undefined ? field : `line ${line}`;
    super(
      `${code}: ${file}${location === undefined ? '' : ` (${location})`}; ` +
        `expected ${formatValue(expected)}, received ${formatValue(actual)}.`,
    );
    this.name = 'DataVerificationError';
    this.code = code;
    this.file = file;
    this.field = field;
    this.line = line;
    this.expected = expected;
    this.actual = actual;
  }
}

function formatValue(value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    return String(value);
  }
  return serialized.length > 160
    ? `${serialized.slice(0, 157)}...`
    : serialized;
}

function fail(details) {
  throw new DataVerificationError(details);
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readRegularFile(path, fileLabel) {
  let details;
  try {
    details = await lstat(path);
  } catch (error) {
    fail({
      code: 'FILE_MISSING',
      file: fileLabel,
      expected: 'a regular file',
      actual:
        error instanceof Error ? (error.code ?? error.message) : 'missing',
    });
  }

  if (!details.isFile() || details.isSymbolicLink()) {
    fail({
      code: 'UNSAFE_FILE_TYPE',
      file: fileLabel,
      expected: 'a non-symlink regular file',
      actual: details.isSymbolicLink() ? 'symbolic link' : 'non-regular file',
    });
  }

  return readFile(path);
}

function isPlainObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function compareManifestValue(actual, expected, field, fileLabel) {
  if (Array.isArray(expected)) {
    if (
      !Array.isArray(actual) ||
      actual.length !== expected.length ||
      actual.some((value, index) => value !== expected[index])
    ) {
      fail({
        code: 'MANIFEST_FIELD_MISMATCH',
        file: fileLabel,
        field,
        expected,
        actual,
      });
    }
    return;
  }

  if (actual !== expected) {
    fail({
      code: 'MANIFEST_FIELD_MISMATCH',
      file: fileLabel,
      field,
      expected,
      actual,
    });
  }
}

export function verifyDictionaryManifest(
  candidate,
  {
    expectedManifest = EXPECTED_DICTIONARY_MANIFEST,
    fileLabel = 'data/dictionary/manifest.json',
  } = {},
) {
  if (!isPlainObject(candidate)) {
    fail({
      code: 'MANIFEST_SCHEMA',
      file: fileLabel,
      expected: 'a JSON object',
      actual: candidate,
    });
  }

  const expectedKeys = Object.keys(expectedManifest).sort();
  const actualKeys = Object.keys(candidate).sort();
  if (
    expectedKeys.length !== actualKeys.length ||
    expectedKeys.some((key, index) => key !== actualKeys[index])
  ) {
    fail({
      code: 'MANIFEST_SCHEMA',
      file: fileLabel,
      field: 'fields',
      expected: expectedKeys,
      actual: actualKeys,
    });
  }

  for (const [field, expected] of Object.entries(expectedManifest)) {
    compareManifestValue(candidate[field], expected, field, fileLabel);
  }

  return candidate;
}

export function inspectDictionaryBuffer(
  buffer,
  {
    expectedManifest = EXPECTED_DICTIONARY_MANIFEST,
    fileLabel = 'data/dictionary/words.txt',
  } = {},
) {
  if (!Buffer.isBuffer(buffer)) {
    fail({
      code: 'DICTIONARY_INPUT',
      file: fileLabel,
      expected: 'a Buffer',
      actual: typeof buffer,
    });
  }

  if (buffer.length !== expectedManifest.uncompressedBytes) {
    fail({
      code: 'DICTIONARY_BYTE_COUNT',
      file: fileLabel,
      expected: expectedManifest.uncompressedBytes,
      actual: buffer.length,
    });
  }

  const actualHash = sha256(buffer);
  if (actualHash !== expectedManifest.sha256) {
    fail({
      code: 'DICTIONARY_SHA256',
      file: fileLabel,
      expected: expectedManifest.sha256,
      actual: actualHash,
    });
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    fail({
      code: 'DICTIONARY_BOM',
      file: fileLabel,
      expected: 'no byte-order mark',
      actual: 'UTF-8 BOM',
    });
  }

  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];
    if (byte === undefined || byte > 0x7f) {
      fail({
        code: 'DICTIONARY_ASCII',
        file: fileLabel,
        expected: 'ASCII bytes only',
        actual: `byte ${String(byte)} at offset ${index}`,
      });
    }
    if (byte === 0x0d) {
      fail({
        code: 'DICTIONARY_LINE_ENDINGS',
        file: fileLabel,
        expected: 'LF line endings only',
        actual: `CR byte at offset ${index}`,
      });
    }
  }

  if (buffer.at(-1) !== 0x0a || buffer.at(-2) === 0x0a) {
    fail({
      code: 'DICTIONARY_FINAL_NEWLINE',
      file: fileLabel,
      expected: 'exactly one final LF',
      actual:
        buffer.at(-1) !== 0x0a ? 'missing final LF' : 'more than one final LF',
    });
  }

  const words = buffer.toString('ascii').slice(0, -1).split('\n');
  if (words.length !== expectedManifest.wordCount) {
    fail({
      code: 'DICTIONARY_WORD_COUNT',
      file: fileLabel,
      expected: expectedManifest.wordCount,
      actual: words.length,
    });
  }

  let previous;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const line = index + 1;
    if (!/^[A-Z]+$/u.test(word)) {
      fail({
        code: 'DICTIONARY_WORD_FORMAT',
        file: fileLabel,
        line,
        expected: 'uppercase ASCII A-Z only',
        actual: word.slice(0, 80),
      });
    }
    if (
      word.length < expectedManifest.minimumLength ||
      word.length > expectedManifest.maximumLength
    ) {
      fail({
        code: 'DICTIONARY_WORD_LENGTH',
        file: fileLabel,
        line,
        expected: `${expectedManifest.minimumLength}..${expectedManifest.maximumLength}`,
        actual: word.length,
      });
    }
    if (previous !== undefined && previous >= word) {
      fail({
        code:
          previous === word ? 'DICTIONARY_DUPLICATE' : 'DICTIONARY_SORT_ORDER',
        file: fileLabel,
        line,
        expected: `a word bytewise greater than ${previous}`,
        actual: word,
      });
    }
    previous = word;
  }

  return Object.freeze({ words: Object.freeze(words), sha256: actualHash });
}

export async function verifyDictionaryBundle({
  dictionaryPath = DICTIONARY_PATH,
  manifestPath = DICTIONARY_MANIFEST_PATH,
  noticePath = DICTIONARY_NOTICE_PATH,
  expectedManifest = EXPECTED_DICTIONARY_MANIFEST,
} = {}) {
  const manifestBuffer = await readRegularFile(
    manifestPath,
    'data/dictionary/manifest.json',
  );
  let manifest;
  try {
    manifest = JSON.parse(manifestBuffer.toString('utf8'));
  } catch (error) {
    fail({
      code: 'MANIFEST_JSON',
      file: 'data/dictionary/manifest.json',
      expected: 'valid JSON',
      actual: error instanceof Error ? error.message : String(error),
    });
  }
  verifyDictionaryManifest(manifest, { expectedManifest });

  const dictionaryBuffer = await readRegularFile(
    dictionaryPath,
    'data/dictionary/words.txt',
  );
  const inspected = inspectDictionaryBuffer(dictionaryBuffer, {
    expectedManifest,
  });

  const noticeBuffer = await readRegularFile(
    noticePath,
    'data/dictionary/ESDB-NOTICE.txt',
  );
  const noticeSha256 = sha256(noticeBuffer);
  if (noticeSha256 !== EXPECTED_DICTIONARY_NOTICE_SHA256) {
    fail({
      code: 'NOTICE_SHA256',
      file: 'data/dictionary/ESDB-NOTICE.txt',
      expected: EXPECTED_DICTIONARY_NOTICE_SHA256,
      actual: noticeSha256,
    });
  }
  const notice = noticeBuffer.toString('utf8');
  const requiredNoticeFragments = [
    'Copyright 2000-2026 by Kevin Atkinson',
    'Permission to use, copy, modify, distribute, and sell any part of SCOWLv2',
    'It is provided "as is" without express or implied warranty.',
    'The primary source of words for SCOWL comes from 12dicts and ENABLE2K.',
  ];
  for (const fragment of requiredNoticeFragments) {
    if (!notice.includes(fragment)) {
      fail({
        code: 'NOTICE_CONTENT',
        file: 'data/dictionary/ESDB-NOTICE.txt',
        expected: `notice fragment ${fragment}`,
        actual: 'fragment missing',
      });
    }
  }
  if (notice.includes('=== AU') || notice.includes('=== UKACD')) {
    fail({
      code: 'NOTICE_SCOPE',
      file: 'data/dictionary/ESDB-NOTICE.txt',
      expected: 'only the complete applicable size-60 A/C notice',
      actual: 'an inapplicable conditional licence branch',
    });
  }

  return Object.freeze({
    manifest: Object.freeze(manifest),
    words: inspected.words,
    sha256: inspected.sha256,
    noticeSha256,
  });
}
