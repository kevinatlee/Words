import type { DictionaryManifestValues } from './constants.mjs';

export class DataVerificationError extends Error {
  readonly code: string;
  readonly file: string;
  readonly field?: string;
  readonly line?: number;
  readonly expected: unknown;
  readonly actual: unknown;
}

export function sha256(buffer: Buffer): string;

export function inspectDictionaryBuffer(
  buffer: Buffer,
  options?: {
    readonly expectedManifest?: DictionaryManifestValues;
    readonly fileLabel?: string;
  },
): {
  readonly words: readonly string[];
  readonly sha256: string;
};

export function verifyDictionaryBundle(options?: {
  readonly dictionaryPath?: string;
  readonly manifestPath?: string;
  readonly noticePath?: string;
  readonly expectedManifest?: DictionaryManifestValues;
}): Promise<{
  readonly manifest: Readonly<DictionaryManifestValues>;
  readonly words: readonly string[];
  readonly sha256: string;
  readonly noticeSha256: string;
}>;
