# Dictionary evaluation

## Decision

**Outcome A:** Stage 4 should use a reproducible English Speller Database
(ESDB, formerly SCOWL) size-60 export pinned to release
[`rel-2026.02.25`](https://github.com/en-wl/wordlist/releases/tag/rel-2026.02.25),
commit
[`7e99edab8e32f9f9ea2b15f249ca8d4d67237410`](https://github.com/en-wl/wordlist/commit/7e99edab8e32f9f9ea2b15f249ca8d4d67237410).
The export should combine American and Canadian spellings, use variant level 1,
deaccent, remove non-word categories and unsuitable parts of speech, retain
only lowercase source entries containing ASCII letters, convert those entries
to uppercase, and keep lengths 3 through 64.

No external word data is committed in Stage 3. Stage 4 must reproduce and
review the export, retain the required copyright and permission notice, and
record its output checksum before adding it.

## Product policy

The gameplay dictionary should:

- include common Canadian and American spellings and ordinary inflected forms;
- exclude proper nouns, abbreviations, contractions, prefixes, suffixes,
  multi-word entries, punctuation, and non-ASCII output;
- prefer common, defensible words over the largest possible list;
- document its obscurity threshold and exact source version;
- remain redistributable with the MIT application.

Dictionary validity and presentation policy are different decisions. A
linguistically valid word may still be sensitive. Family-mode filtering,
display suppression, and similar moderation choices need a separate future
policy; silently deleting sensitive terms would make the dictionary decision
unreviewable.

## Candidate 1: English Speller Database / SCOWL

### Source and maintenance

- **Official project:** [en-wl/wordlist](https://github.com/en-wl/wordlist)
- **Maintainer/compiler:** Kevin Atkinson, with major upstream contributions
  from Alan Beale and other documented source lists
- **Evaluated version:** `rel-2026.02.25`, full commit
  `7e99edab8e32f9f9ea2b15f249ca8d4d67237410`
- **Maintenance:** active; the evaluated release was published on
  2026-02-25 and is the latest release at the time of this evaluation

The official project describes ESDB as a database of word commonness,
dialect, variant, part-of-speech, and inflection data. It supports American,
British `-ise`, British/Oxford `-ize`, Canadian, and Australian spelling codes.
Its release notes identify the evaluated version as the first dictionary-only
release after the new database-format transition.

### Licence and provenance

The project’s
[`Copyright`](https://github.com/en-wl/wordlist/blob/7e99edab8e32f9f9ea2b15f249ca8d4d67237410/Copyright)
grants permission to use, copy, modify, distribute, and sell ESDB or generated
word lists without a fee, provided the Kevin Atkinson copyright and permission
notice appear in copies and supporting documentation. The project calls this
an MIT-like licence.

Most upstream data is public domain. The notice specifically credits 12dicts
and ENABLE2K, and describes the use of licensed corpus data. A generated
American/Canadian word list at size 60 does not select the separate Australian
source terms and stays below the greater-than-80 threshold that invokes an
additional source notice. The main ESDB notice is therefore the applicable
redistribution condition for the proposed generated word list.

Redistribution and filtering in this MIT repository are permitted if the
notice is preserved. Stage 4 should place the full notice beside the generated
data and in the repository’s third-party notices. ESDB’s exporter and database
use the project permission grant; no exporter code needs to ship at runtime.

### Content controls

ESDB provides size levels and explicit metadata:

- size 60 is its medium-large default and the largest level the maintainer says
  is confidently free of misspellings or invalid words;
- size 70 is larger and described as usable, with a few errors accepted;
- size 80 adds uncommon word-game vocabulary, and size 85 includes words that
  may no longer be current;
- variant level 1 keeps the preferred form plus specially equal/default
  variants while avoiding common, obscure, archaic, uncommon, and invalid
  variant levels;
- `A`, `B`, `Z`, `C`, and `D` represent American, British `-ise`,
  British/Oxford `-ize`, Canadian, and Australian spellings;
- parts of speech identify abbreviations, contractions, prefixes, suffixes,
  multi-word parts, multi-word endings, and non-words;
- derived forms include plurals, verb forms, comparatives, and superlatives;
- optional output includes spaces, hyphens, dots, apostrophes, digits, special
  characters, and deaccenting controls;
- usage notes include some offensive, vulgar, informal, colloquial, and
  nonstandard labels, but the project says this tagging is incomplete;
- proper-noun classes exist, but the project says classification is not
  reliable enough to be the only filter.

The proposed lowercase-only post-filter is intentional: common entries are
emitted in lowercase while proper names are capitalized. It complements the
proper-noun class exclusions. The final ASCII expression is the authoritative
guard against punctuation, spaces, accents, and other symbols. Some ambiguous
words can be both a common noun and a name; that is a vocabulary-review issue,
not a reason to trust incomplete metadata.

### Reproducible proposed export

Run from a clean checkout of the exact evaluated commit:

```bash
make

./scowl --db scowl.db word-list 60 A,C 1 \
  --deaccent \
  --wo-poses=abbr,s,pre,suf,wp,we,x \
  '--wo-pos-classes=person,surname,place,name,trademark,upper,name?,upper?,abbr?' \
  --categories= |
  LC_ALL=C awk \
    'length($0) >= 3 && length($0) <= 64 && $0 ~ /^[a-z]+$/ { print toupper($0) }' |
  LC_ALL=C sort -u > words-stage4.txt
```

Stage 4 should implement this as a reviewed repository script, verify that the
release tag still resolves to the pinned commit, copy the upstream notice, and
record SHA-256, line count, uncompressed bytes, and compressed bytes. The
generated file should not depend on the current default branch.

### Measured exports

These measurements were made locally from the pinned release with the exact
filter above. Compressed size uses `gzip -9`; Node Set memory is an approximate
additional heap measurement and excludes normal runtime overhead.

| Level |   Words | Uncompressed |      Gzip | Approx. additional Set heap |
| ----: | ------: | -----------: | --------: | --------------------------: |
|    60 |  79,370 |    757,056 B | 212,238 B |                      4.8 MB |
|    70 | 126,014 |  1,247,002 B | 337,152 B |                      6.2 MB |

Either list is small enough for one Node process and synchronous Set lookup.
Size 60 has the better party-game tradeoff: materially lower obscurity, the
maintainer’s strongest validity confidence, modest startup input, and direct
Canadian/American controls. Size 70 is a useful future play-test comparison,
not the default recommendation.

### Advantages

- active primary project with an exact release and reproducible tooling;
- direct American and Canadian controls, plus separately available British
  dialect controls;
- explicit commonness, variant, part-of-speech, inflection, and category data;
- compatible modification and redistribution terms;
- small enough for a one-process in-memory Set;
- filtering decisions can be reviewed and repeated.

### Disadvantages and remaining Stage 4 checks

- the new database and command interface are still described as subject to
  change, so pinning is mandatory;
- proper-noun and sensitive-word metadata are incomplete;
- deaccenting can create collisions, which `sort -u` deliberately resolves;
- size level is a dictionary-quality proxy, not play-frequency evidence;
- the final output still needs a manual and automated play-vocabulary audit.

## Candidate 2: ENABLE 2K

### Source, exact artifact, and provenance

ENABLE 2K was compiled for word games by Mendel Cooper, with Alan Beale’s
research as a major contribution. The evaluated artifact is the original
`enable2k.zip` captured by the
[Internet Archive on 2009-01-22](https://web.archive.org/web/20090122025747id_/http://personal.riverusers.com/~thegrendel/enable2k.zip).
Its SHA-256 is
`44e2dd5c16c14336e8d4075a2f625af55a47cbb8b9f9ebcb7fcc3b5b1e1f0e5e`.
The files are dated 2000-04-14.

For reproducibility, the evaluation also checked the provenance-preserving
[Bart Massey wordlists mirror](https://github.com/BartMassey/wordlists/tree/af52415c13af809bd8757a40f17f46e79d09583c)
at commit `af52415c13af809bd8757a40f17f46e79d09583c`. Its
`enable2k.txt.gz` is byte-for-byte identical to the archive’s `WORD.LST` after
normalizing DOS CRLF line endings to LF. The normalized word-data SHA-256 is
`2262de288ddc2b2ccfb2e46119fb25f02311af5ba1e1a77802817b76268dff99`.
The mirror’s MIT licence covers its packaging; the original ENABLE notice,
not the wrapper licence alone, is the authority for the word data.

### Licence

The original archive README places the plain-ASCII `WORD.LST` formally in the
public domain and permits anyone to use or distribute it in any manner. It asks
game designers to mention the source and credit the originators, and states
that the word-list portion must remain freely redistributable.

Modification, filtering, and redistribution are permitted. Although public
domain data does not require the same copyright-notice condition as ESDB,
Stage 4 should preserve the original README, name ENABLE 2K, Mendel Cooper, and
Alan Beale, and keep the word data separable from restrictions on application
code.

### Content and measurements

The artifact contains 173,528 lowercase ASCII entries and no spaces,
punctuation, accented characters, or mixed-case proper-name markers. The
normalized LF file is 1,749,989 bytes and the mirror gzip is 455,256 bytes. A
3-to-64-letter filter removes 96 two-letter entries, leaving 173,432 words and
1,749,701 bytes. A local Node Set measurement added about 10.1 MB of heap and
took roughly 27 ms to construct on the development Mac; this is illustrative,
not a CI performance requirement.

ENABLE includes ordinary inflected forms and both spellings in examples such
as `color`/`colour`, `center`/`centre`, and `organize`/`organise`. It is a North
American word-game list, however, and has no dialect tags to prove systematic
Canadian, American, or British coverage.

The original documentation emphasizes obscure plurals and includes 1,024
“signature words.” It has no current part-of-speech, proper-noun, abbreviation,
archaic, frequency, or sensitive-word metadata. Contractions, hyphenated words,
multi-word entries, and accented forms are absent from the artifact, but
acronym-like letter sequences and obscure entries cannot be selectively
filtered with source metadata.

### Advantages

- original public-domain declaration is present in the archived distribution;
- exact artifact and mirror equivalence are verifiable;
- ready-to-read ASCII format with broad inflection coverage;
- small enough for one-process use.

### Disadvantages

- word data has not been maintained since 2000;
- much larger and more obscure than the recommended ESDB size-60 output;
- no structured dialect, commonness, part-of-speech, proper-name, or moderation
  metadata;
- quality filtering would require opaque hand-maintained removals;
- the exact mirror is trustworthy only because it was compared with the
  archived original, not because the mirror’s wrapper licence says MIT.

## Recommendation for Stage 4

Use the pinned ESDB size-60 American-plus-Canadian export above. Do not use
ENABLE 2K as the default production list. Keep ENABLE as a public-domain
comparison corpus for offline evaluation only if that comparison is useful;
do not commit it merely because it has more words.

Before committing the ESDB output in Stage 4:

1. turn the exact command into a reproducible script;
2. preserve the complete applicable ESDB notice;
3. record release, commit, command, checksum, counts, and sizes;
4. test representative Canadian and American variants and exclusions;
5. audit a deterministic sample plus high-risk proper-name, abbreviation,
   misspelling, obscurity, and sensitive-term cases;
6. decide and document any separate family-mode presentation policy;
7. load the final immutable Set once on the authoritative server.
