export interface DictionaryManifestValues {
  readonly schemaVersion: number;
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

export const EXPECTED_DICTIONARY_MANIFEST: Readonly<DictionaryManifestValues>;
export const EXPECTED_DICTIONARY_NOTICE_SHA256: string;
