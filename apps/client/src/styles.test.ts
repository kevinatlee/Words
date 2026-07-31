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

  it('keeps phone timer labels as prominent as the countdown value', () => {
    expect(styles).toMatch(
      /\.room-page--phone \.round-clock--phone small\s*\{[^}]*font-size: clamp\(1\.2rem, 3vw, 1\.8rem\);[^}]*font-weight: 900;/s,
    );
  });

  it('insets phone connection status and stacks phone word submission controls', () => {
    expect(styles).toMatch(
      /\.connection-status--phone\s*\{[^}]*margin-right: calc\(env\(safe-area-inset-right\) \+ 0\.5rem\);/s,
    );
    expect(styles).toMatch(/\.word-entry\s*\{[^}]*flex-direction: column;/s);
    expect(styles).toMatch(
      /\.word-entry__actions \.button\s*\{[^}]*width: 100%;/s,
    );
  });

  it('keeps duration choices in a three-column grid with compact control gaps', () => {
    expect(styles).toMatch(
      /\.duration-grid\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/s,
    );
    expect(styles).toMatch(
      /\.choice-group \+ \.choice-group\s*\{[^}]*margin-top: 0\.8rem;/s,
    );
    expect(styles).toMatch(
      /\.word-entry__actions\s*\{[^}]*margin-top: 0\.35rem;/s,
    );
  });
});
