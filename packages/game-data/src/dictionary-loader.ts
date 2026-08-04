import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';

import { createWordDictionary, type WordDictionary } from '@words/game-engine';

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
  readonly gzipSha256: string;
}

const EXPECTED_PRODUCTION_MANIFEST: ProductionDictionaryManifest =
  Object.freeze({
    schemaVersion: 1,
    sourceProject: 'English Speller Database / SCOWL',
    sourceRepository: 'https://github.com/en-wl/wordlist',
    sourceRelease: 'rel-2026.02.25',
    sourceCommit: '7e99edab8e32f9f9ea2b15f249ca8d4d67237410',
    dialects: Object.freeze(['A', 'C']),
    sizeLevel: 60,
    variantLevel: 1,
    deaccented: true,
    excludedPartsOfSpeech: Object.freeze([
      'abbr',
      's',
      'pre',
      'suf',
      'wp',
      'we',
      'x',
    ]),
    excludedClasses: Object.freeze([
      'person',
      'surname',
      'place',
      'name',
      'trademark',
      'upper',
      'name?',
      'upper?',
      'abbr?',
    ]),
    minimumLength: 3,
    maximumLength: 64,
    normalization:
      'lowercase ASCII source entries converted to uppercase ASCII',
    sorting: 'bytewise ascending (LC_ALL=C equivalent)',
    lineEndings: 'LF with exactly one final newline',
    wordCount: 79_370,
    uncompressedBytes: 757_056,
    sha256: 'f5f3d22bd07b8f8d2dd8cf4f3caff211b6f3249a24da02c5aa2a21bf2210f352',
    gzipCommand: 'gzip -9 -n',
    gzipBytes: 212_238,
    gzipSha256:
      '1dccc79270a4c044e78f5b3c9f1cf6184feb40cab706e809ef6e70a2cac0fc39',
  });

export const PRODUCTION_DICTIONARY_IDENTITY = Object.freeze({
  wordCount: EXPECTED_PRODUCTION_MANIFEST.wordCount,
  sha256: EXPECTED_PRODUCTION_MANIFEST.sha256,
  sourceRelease: EXPECTED_PRODUCTION_MANIFEST.sourceRelease,
  sourceCommit: EXPECTED_PRODUCTION_MANIFEST.sourceCommit,
});

export type ProductionDictionaryLoadErrorCode =
  | 'UNSUPPORTED_DATA_URL'
  | 'MANIFEST_READ_FAILED'
  | 'MANIFEST_UNSAFE_FILE_TYPE'
  | 'MANIFEST_INVALID'
  | 'MANIFEST_MISMATCH'
  | 'DICTIONARY_READ_FAILED'
  | 'DICTIONARY_UNSAFE_FILE_TYPE'
  | 'DICTIONARY_BYTE_COUNT_MISMATCH'
  | 'DICTIONARY_HASH_MISMATCH'
  | 'DICTIONARY_FORMAT_INVALID'
  | 'DICTIONARY_WORD_COUNT_MISMATCH'
  | 'ENGINE_DICTIONARY_REJECTED';

export type ProductionDictionaryLoadResult =
  | {
      readonly success: true;
      readonly dictionary: WordDictionary;
      readonly words: readonly string[];
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
  readonly expected?: ProductionDictionaryManifest;
}

const MANIFEST_FIELDS = Object.freeze([
  'schemaVersion',
  'sourceProject',
  'sourceRepository',
  'sourceRelease',
  'sourceCommit',
  'dialects',
  'sizeLevel',
  'variantLevel',
  'deaccented',
  'excludedPartsOfSpeech',
  'excludedClasses',
  'minimumLength',
  'maximumLength',
  'normalization',
  'sorting',
  'lineEndings',
  'wordCount',
  'uncompressedBytes',
  'sha256',
  'gzipCommand',
  'gzipBytes',
  'gzipSha256',
] as const);

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

  const actualFields = Object.keys(value).sort();
  const expectedFields = [...MANIFEST_FIELDS].sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
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
    'gzipSha256',
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
    !/^[a-f0-9]{64}$/u.test(value.sha256 as string) ||
    !/^[a-f0-9]{64}$/u.test(value.gzipSha256 as string)
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
    gzipSha256: value.gzipSha256 as string,
  });
}

function manifestMatches(
  actual: ProductionDictionaryManifest,
  expected: ProductionDictionaryManifest,
): boolean {
  return MANIFEST_FIELDS.every((field) => {
    const actualValue = actual[field];
    const expectedValue = expected[field];
    return Array.isArray(expectedValue)
      ? Array.isArray(actualValue) &&
          actualValue.length === expectedValue.length &&
          actualValue.every((value, index) => value === expectedValue[index])
      : actualValue === expectedValue;
  });
}

async function inspectFileType(
  url: URL,
): Promise<'missing' | 'regular' | 'unsafe'> {
  try {
    const details = await lstat(url);
    return details.isFile() && !details.isSymbolicLink() ? 'regular' : 'unsafe';
  } catch {
    return 'missing';
  }
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
  const manifestFileType = await inspectFileType(options.manifestUrl);
  if (manifestFileType === 'unsafe') {
    return failure(
      'MANIFEST_UNSAFE_FILE_TYPE',
      'Manifest must be a non-symlink regular file.',
    );
  }
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
    if (!manifestMatches(manifest, options.expected)) {
      return failure(
        'MANIFEST_MISMATCH',
        'Manifest does not identify the pinned production dictionary.',
      );
    }
  }

  let dictionaryBuffer: Buffer;
  const dictionaryFileType = await inspectFileType(options.dictionaryUrl);
  if (dictionaryFileType === 'unsafe') {
    return failure(
      'DICTIONARY_UNSAFE_FILE_TYPE',
      'Dictionary must be a non-symlink regular file.',
    );
  }
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
    words: Object.freeze([...inspected.words]),
    wordCount: built.wordCount,
    manifest,
  });
}

export function loadProductionDictionary(): Promise<ProductionDictionaryLoadResult> {
  return loadDictionaryBundle({
    dictionaryUrl: PRODUCTION_DICTIONARY_URL,
    manifestUrl: PRODUCTION_MANIFEST_URL,
    expected: EXPECTED_PRODUCTION_MANIFEST,
  });
}
