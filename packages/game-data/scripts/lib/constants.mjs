import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DICTIONARY_DIRECTORY = fileURLToPath(
  new URL('../../data/dictionary/', import.meta.url),
);
export const DICTIONARY_PATH = fileURLToPath(
  new URL('../../data/dictionary/words.txt', import.meta.url),
);
export const DICTIONARY_MANIFEST_PATH = fileURLToPath(
  new URL('../../data/dictionary/manifest.json', import.meta.url),
);
export const DICTIONARY_NOTICE_PATH = fileURLToPath(
  new URL('../../data/dictionary/ESDB-NOTICE.txt', import.meta.url),
);
export const DISTRIBUTION_DIRECTORY = fileURLToPath(
  new URL('../../data/distribution/', import.meta.url),
);
export const DISTRIBUTION_CANDIDATES_PATH = fileURLToPath(
  new URL('../../data/distribution/candidates.json', import.meta.url),
);
export const DISTRIBUTION_PROFILE_PATH = fileURLToPath(
  new URL('../../data/distribution/profile.json', import.meta.url),
);
export const GENERATED_DISTRIBUTION_PATH = fileURLToPath(
  new URL('../../src/generated/distribution-data.ts', import.meta.url),
);

export const SOURCE_REPOSITORY = 'https://github.com/en-wl/wordlist';
export const SOURCE_GIT_REPOSITORY = `${SOURCE_REPOSITORY}.git`;
export const SOURCE_RELEASE = 'rel-2026.02.25';
export const SOURCE_COMMIT = '7e99edab8e32f9f9ea2b15f249ca8d4d67237410';
export const EXPECTED_DICTIONARY_NOTICE_SHA256 =
  '2f4e959749bb16da6e62264e33f620b1738a06290a940039eb83968a446b6460';

export const EXPECTED_DICTIONARY_MANIFEST = Object.freeze({
  schemaVersion: 1,
  sourceProject: 'English Speller Database / SCOWL',
  sourceRepository: SOURCE_REPOSITORY,
  sourceRelease: SOURCE_RELEASE,
  sourceCommit: SOURCE_COMMIT,
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
  normalization: 'lowercase ASCII source entries converted to uppercase ASCII',
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

export const EXACT_EXPORT_ARGUMENTS = Object.freeze([
  '--db',
  'scowl.db',
  'word-list',
  '60',
  'A,C',
  '1',
  '--deaccent',
  '--wo-poses=abbr,s,pre,suf,wp,we,x',
  '--wo-pos-classes=person,surname,place,name,trademark,upper,name?,upper?,abbr?',
  '--categories=',
]);
