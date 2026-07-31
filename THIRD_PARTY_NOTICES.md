# Third-party notices

## English Speller Database / SCOWL

`packages/game-data/data/dictionary/words.txt` is a generated and filtered
derivative of the English Speller Database / SCOWL release
`rel-2026.02.25`, pinned to commit
`7e99edab8e32f9f9ea2b15f249ca8d4d67237410` from the
[official repository](https://github.com/en-wl/wordlist).

The export selects American and Canadian size-60 spellings. It does not use
the Australian spelling code or region and does not select word-list sizes
above 80, so the additional Australian and UK Advanced Cryptics Dictionary
licence branches described upstream do not apply to this generated word list.
The complete applicable copyright and permission notice is preserved in
[`ESDB-NOTICE.txt`](packages/game-data/data/dictionary/ESDB-NOTICE.txt).
Its canonical repository copy has SHA-256
`2f4e959749bb16da6e62264e33f620b1738a06290a940039eb83968a446b6460`.

The Words source code remains available under its repository MIT licence. The
generated dictionary data is distributed under the notice above. Neither the
source project nor its contributors endorse Words.

## qrcode.react

The client uses `qrcode.react` version `4.2.0` to render join URLs locally as
SVG QR codes. The package is distributed under the ISC licence and includes
QR Code Generator code under the MIT licence, as recorded by the package
author in its published licence file.

```text
ISC License

Copyright (c) 2015, Paul O’Shannessy

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

This product bundles QR Code Generator, which is available under a
"MIT" license. For details, see src/third-party/qrcodegen.
```
