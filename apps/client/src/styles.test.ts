import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('tile typography', () => {
  it('keeps interactive tiles on the shared tile typography rule', () => {
    const buttonRule = styles.match(
      /\.letter-tile--button\s*\{\s*width:[^}]*\}/,
    )?.[0];

    expect(buttonRule).toContain('font-family: inherit;');
    expect(buttonRule).not.toMatch(/\bfont\s*:/);
    expect(styles).toMatch(
      /\.letter-tile\s*\{[^}]*font-size: var\(--letter-tile-font-size\);[^}]*font-weight: 900;[^}]*line-height: 1;/s,
    );
  });
});
