import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { createWordDictionary, type WordDictionary } from '@words/game-engine';

const EXPECTED_SOURCE_RELEASE = 'rel-2026.02.25';
const EXPECTED_SOURCE_COMMIT = '7e99edab8e32f9f9ea2b15f249ca8d4d67237410';
const EXPECTED_DICTIONARY_SHA256 =
  'f5f3d22bd07b8f8d2dd8cf4f3caff211b6f3249a24da02c5aa2a21bf2210f352';
const EXPECTED_WORD_COUNT = 79_370;
const EXPECTED_BYTES = 757_056;

const PRODUCTION_DICTIONARY_URL = new URL(
  '../data/dictionary/words.txt',
  import.meta.url,
);
const PRODUCTION_MANIFEST_URL = new URL(
  '../data/dictionary/manifest.json',
  import.meta.url,
);

export interface ProductionDictionaryManifest {
  readonly schemaVersion: 1;
  readonly sourceProject: string;
  readonly sourceRepository: string;
  readonly sourceRelease: string;
  readonly sourceCommit: string;
  readonly dialects: readonly string[];
  readonly sizeLevel: number;
  readonly variantLevel: number;
  readonly deaccented: boolean;
  readonly excludedPartsOfSpeech: readonly string[];
  readonly excludedClasses: readonly string[];
  readonly minimumLength: number;
  readonly maximumLength: number;
  readonly normalization: string;
  readonly sorting: string;
  readonly lineEndings: string;
  readonly wordCount: number;
  readonly uncompressedBytes: number;
  readonly sha256: string;
  readonly gzipCommand: string;
  readonly gzipBytes: number;
}

export type ProductionDictionaryLoadErrorCode =
  | 'UNSUPPORTED_DATA_URL'
  | 'MANIFEST_READ_FAILED'
  | 'MANIFEST_INVALID'
  | 'MANIFEST_MISMATCH'
  | 'DICTIONARY_READ_FAILED'
  | 'DICTIONARY_BYTE_COUNT_MISMATCH'
  | 'DICTIONARY_HASH_MISMATCH'
  | 'DICTIONARY_FORMAT_INVALID'
  | 'DICTIONARY_WORD_COUNT_MISMATCH'
  | 'ENGINE_DICTIONARY_REJECTED';

export type ProductionDictionaryLoadResult =
  | {
      readonly success: true;
      readonly dictionary: WordDictionary;
      readonly wordCount: number;
      readonly manifest: ProductionDictionaryManifest;
    }
  | {
      readonly success: false;
      readonly code: ProductionDictionaryLoadErrorCode;
      readonly detail?: string;
    };

interface DictionaryBundleOptions {
  readonly dictionaryUrl: URL;
  readonly manifestUrl: URL;
  readonly expected?: {
    readonly sourceRelease: string;
    readonly sourceCommit: string;
    readonly sha256: string;
    readonly wordCount: number;
    readonly uncompressedBytes: number;
  };
}

function failure(
  code: ProductionDictionaryLoadErrorCode,
  detail?: string,
): ProductionDictionaryLoadResult {
  return detail === undefined
    ? Object.freeze({ success: false, code })
    : Object.freeze({ success: false, code, detail: detail.slice(0, 240) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

function parseManifest(value: unknown): ProductionDictionaryManifest | null {
  if (!isRecord(value)) {
    return null;
  }

  const stringFields = [
    'sourceProject',
    'sourceRepository',
    'sourceRelease',
    'sourceCommit',
    'normalization',
    'sorting',
    'lineEndings',
    'sha256',
    'gzipCommand',
  ] as const;
  const numberFields = [
    'sizeLevel',
    'variantLevel',
    'minimumLength',
    'maximumLength',
    'wordCount',
    'uncompressedBytes',
    'gzipBytes',
  ] as const;
  if (
    value.schemaVersion !== 1 ||
    value.deaccented !== true ||
    stringFields.some(
      (field) => typeof value[field] !== 'string' || value[field].length === 0,
    ) ||
    numberFields.some(
      (field) =>
        !Number.isSafeInteger(value[field]) || (value[field] as number) <= 0,
    ) ||
    !isStringArray(value.dialects) ||
    !isStringArray(value.excludedPartsOfSpeech) ||
    !isStringArray(value.excludedClasses) ||
    !/^[a-f0-9]{64}$/u.test(value.sha256 as string)
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion: 1,
    sourceProject: value.sourceProject as string,
    sourceRepository: value.sourceRepository as string,
    sourceRelease: value.sourceRelease as string,
    sourceCommit: value.sourceCommit as string,
    dialects: Object.freeze([...(value.dialects as string[])]),
    sizeLevel: value.sizeLevel as number,
    variantLevel: value.variantLevel as number,
    deaccented: true,
    excludedPartsOfSpeech: Object.freeze([
      ...(value.excludedPartsOfSpeech as string[]),
    ]),
    excludedClasses: Object.freeze([...(value.excludedClasses as string[])]),
    minimumLength: value.minimumLength as number,
    maximumLength: value.maximumLength as number,
    normalization: value.normalization as string,
    sorting: value.sorting as string,
    lineEndings: value.lineEndings as string,
    wordCount: value.wordCount as number,
    uncompressedBytes: value.uncompressedBytes as number,
    sha256: value.sha256 as string,
    gzipCommand: value.gzipCommand as string,
    gzipBytes: value.gzipBytes as number,
  });
}

function validateDictionaryText(
  text: string,
  manifest: ProductionDictionaryManifest,
):
  | { readonly success: true; readonly words: readonly string[] }
  | {
      readonly success: false;
      readonly detail: string;
    } {
  if (text.includes('\r')) {
    return { success: false, detail: 'Dictionary contains a CR line ending.' };
  }
  if (!text.endsWith('\n') || text.endsWith('\n\n')) {
    return {
      success: false,
      detail: 'Dictionary must end with exactly one LF.',
    };
  }

  const words = text.slice(0, -1).split('\n');
  let previous: string | undefined;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    if (
      !/^[A-Z]+$/u.test(word) ||
      word.length < manifest.minimumLength ||
      word.length > manifest.maximumLength
    ) {
      return {
        success: false,
        detail: `Dictionary line ${index + 1} is malformed.`,
      };
    }
    if (previous !== undefined && previous >= word) {
      return {
        success: false,
        detail: `Dictionary line ${index + 1} is not strictly sorted and unique.`,
      };
    }
    previous = word;
  }
  return { success: true, words };
}

export async function loadDictionaryBundle(
  options: DictionaryBundleOptions,
): Promise<ProductionDictionaryLoadResult> {
  if (
    options.dictionaryUrl.protocol !== 'file:' ||
    options.manifestUrl.protocol !== 'file:'
  ) {
    return failure(
      'UNSUPPORTED_DATA_URL',
      'Dictionary and manifest URLs must use the local file protocol.',
    );
  }

  let manifestText: string;
  try {
    manifestText = await readFile(options.manifestUrl, 'utf8');
  } catch {
    return failure('MANIFEST_READ_FAILED');
  }

  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(manifestText);
  } catch {
    return failure('MANIFEST_INVALID', 'Manifest is not valid JSON.');
  }
  const manifest = parseManifest(manifestValue);
  if (manifest === null) {
    return failure('MANIFEST_INVALID', 'Manifest fields are invalid.');
  }

  if (options.expected !== undefined) {
    const expected = options.expected;
    if (
      manifest.sourceRelease !== expected.sourceRelease ||
      manifest.sourceCommit !== expected.sourceCommit ||
      manifest.sha256 !== expected.sha256 ||
      manifest.wordCount !== expected.wordCount ||
      manifest.uncompressedBytes !== expected.uncompressedBytes
    ) {
      return failure(
        'MANIFEST_MISMATCH',
        'Manifest does not identify the pinned production dictionary.',
      );
    }
  }

  let dictionaryBuffer: Buffer;
  try {
    dictionaryBuffer = await readFile(options.dictionaryUrl);
  } catch {
    return failure('DICTIONARY_READ_FAILED');
  }

  if (dictionaryBuffer.length !== manifest.uncompressedBytes) {
    return failure(
      'DICTIONARY_BYTE_COUNT_MISMATCH',
      `Expected ${manifest.uncompressedBytes} bytes; received ${dictionaryBuffer.length}.`,
    );
  }
  const actualHash = createHash('sha256')
    .update(dictionaryBuffer)
    .digest('hex');
  if (actualHash !== manifest.sha256) {
    return failure(
      'DICTIONARY_HASH_MISMATCH',
      `Expected ${manifest.sha256}; received ${actualHash}.`,
    );
  }

  const inspected = validateDictionaryText(
    dictionaryBuffer.toString('ascii'),
    manifest,
  );
  if (!inspected.success) {
    return failure('DICTIONARY_FORMAT_INVALID', inspected.detail);
  }
  if (inspected.words.length !== manifest.wordCount) {
    return failure(
      'DICTIONARY_WORD_COUNT_MISMATCH',
      `Expected ${manifest.wordCount} words; received ${inspected.words.length}.`,
    );
  }

  const built = createWordDictionary(inspected.words);
  if (!built.success) {
    return failure(
      'ENGINE_DICTIONARY_REJECTED',
      `Entry ${built.entryIndex} failed with ${built.normalizationCode}.`,
    );
  }
  if (built.wordCount !== manifest.wordCount) {
    return failure(
      'DICTIONARY_WORD_COUNT_MISMATCH',
      `Engine retained ${built.wordCount} of ${manifest.wordCount} words.`,
    );
  }

  return Object.freeze({
    success: true,
    dictionary: built.dictionary,
    wordCount: built.wordCount,
    manifest,
  });
}

export function loadProductionDictionary(): Promise<ProductionDictionaryLoadResult> {
  return loadDictionaryBundle({
    dictionaryUrl: PRODUCTION_DICTIONARY_URL,
    manifestUrl: PRODUCTION_MANIFEST_URL,
    expected: {
      sourceRelease: EXPECTED_SOURCE_RELEASE,
      sourceCommit: EXPECTED_SOURCE_COMMIT,
      sha256: EXPECTED_DICTIONARY_SHA256,
      wordCount: EXPECTED_WORD_COUNT,
      uncompressedBytes: EXPECTED_BYTES,
    },
  });
}
