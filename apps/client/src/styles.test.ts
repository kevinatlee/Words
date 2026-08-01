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

  it('keeps every unselected letter tile on the uniform paper background', () => {
    expect(styles).toMatch(
      /\.letter-tile\s*\{[^}]*background: var\(--paper\);/s,
    );
    expect(styles).not.toContain('.letter-tile:nth-child(5n + 2)');
    expect(styles).not.toContain(
      '.letter-grid > :nth-child(5n + 2) .letter-tile--button',
    );
  });

  it('shares gameplay tile sizing and spacing with the lobby board', () => {
    const sharedTileSizingRule = styles.match(
      /\.letter-grid,\s*\.display-join-board\s*\{[^}]*\}/s,
    )?.[0];

    expect(sharedTileSizingRule).toContain(
      '--letter-tile-font-size: clamp(1.8rem, 8vw, 2.75rem);',
    );
    expect(styles).toMatch(
      /\.display-join-board\s*\{[^}]*gap: clamp\(0\.35rem, 1\.2vw, 0\.75rem\);/s,
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

  it('keeps the compact slider and word-entry gaps', () => {
    expect(styles).toMatch(/\.duration-slider\s*\{[^}]*display: flex;/s);
    expect(styles).not.toContain('.duration-slider__ticks');
    expect(styles).toMatch(
      /\.choice-group \+ \.choice-group\s*\{[^}]*margin-top: 0\.8rem;/s,
    );
    expect(styles).toMatch(/\.word-entry__actions\s*\{[^}]*margin-top: 0;/s);
  });

  it('keeps the display presentation centered and within TV-height bounds', () => {
    expect(styles).toMatch(
      /\.site-header--display\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/s,
    );
    expect(styles).toMatch(
      /\.display-room-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);/s,
    );
    expect(styles).toMatch(
      /\.display-room-page\s*\{[^}]*min-height: calc\(100dvh - 4\.75rem\);/s,
    );
    expect(styles).not.toContain('100dvh - 14.5rem');
    expect(styles).toMatch(
      /\.panel\.display-puzzle-panel--active\s*\{[^}]*padding:\s*0\.35rem clamp\(1\.1rem, 2\.5vw, 1\.75rem\) 0\.5rem;/s,
    );
    expect(styles).toMatch(
      /\.display-puzzle-panel--active > \.letter-grid\s*\{[^}]*width: 100%;/s,
    );
    expect(styles).not.toContain('.display-active-puzzle');
    expect(styles).not.toContain('.display-round-timer');
    expect(styles).toMatch(
      /\.display-highlights-timer\s*\{[^}]*display: flex;[^}]*width: 100%;[^}]*align-items: baseline;[^}]*justify-content: space-between;[^}]*gap: 0\.75rem;[^}]*margin-bottom: 0\.9rem;[^}]*padding-bottom: 0\.75rem;[^}]*border-bottom: 1px solid var\(--line\);/s,
    );
    expect(styles).toMatch(
      /\.display-highlights-timer__label\s*\{[^}]*color: var\(--paper\);[^}]*font-size: 1rem;[^}]*font-weight: 800;/s,
    );
    expect(styles).toMatch(
      /\.display-highlights-timer__value\s*\{[^}]*min-width: 3ch;[^}]*color: var\(--mint-strong\);[^}]*font-size: clamp\(1\.75rem, 2\.5vw, 2\.25rem\);[^}]*font-variant-numeric: tabular-nums;[^}]*font-weight: 900;[^}]*line-height: 1;[^}]*text-align: right;/s,
    );
    expect(styles).toMatch(
      /\.display-player-list__name\s*\{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/s,
    );
    expect(styles).toMatch(
      /\.display-results__cards--7,\s*\.display-results__cards--8\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\);/s,
    );
    expect(styles).toMatch(
      /\.result-player-card\s*\{[^}]*border-radius: var\(--radius-md\);[^}]*color: var\(--ink-950\);/s,
    );
    expect(styles).toMatch(
      /\.result-player-card__stats\s*\{[^}]*display: grid;[^}]*gap: 0\.15rem;[^}]*margin: 0\.45rem 0 0;/s,
    );
    expect(styles).toMatch(
      /\.result-player-card__stats > div\s*\{[^}]*display: flex;[^}]*justify-content: space-between;/s,
    );
    expect(styles).toMatch(
      /\.display-join-board__qr\s*\{[^}]*grid-area: 2 \/ 2 \/ 5 \/ 5;/s,
    );
  });

  it('keeps the embedded TV QR on the letter-tile background', () => {
    const qrSurfaceRule = styles.match(
      /\.display-join-board__qr-surface\s*\{[^}]*\}/s,
    )?.[0];

    expect(qrSurfaceRule).toContain('background: var(--paper);');
    expect(qrSurfaceRule).not.toMatch(/#fff|#ffffff/i);
  });

  it('keeps the display footer URL dark green, unadorned, and keyboard-visible', () => {
    const footerLinkRule = styles.match(
      /\.display-room-footer__link\s*\{[^}]*\}/s,
    )?.[0];

    expect(styles).toContain('--mint-deep: #3fbf75;');
    expect(footerLinkRule).toContain('color: var(--mint-deep);');
    expect(footerLinkRule).toContain('text-decoration: none;');
    expect(footerLinkRule).not.toContain('font-weight:');
    expect(footerLinkRule).not.toContain('background:');
    expect(styles).toMatch(
      /\.display-room-footer__link:hover\s*\{[^}]*text-decoration: none;/s,
    );
    expect(styles).not.toMatch(
      /\.display-room-footer__link(?::visited|:hover|:active|:focus-visible)?\s*\{[^}]*background:/s,
    );
    expect(styles).toMatch(
      /\.display-room-footer__link:focus-visible\s*\{[^}]*outline: 0\.18rem solid var\(--sun\);[^}]*text-decoration: none;/s,
    );
  });

  it('gives authoritative accepted tiles a later, green override', () => {
    expect(styles).toMatch(
      /\.letter-tile--accepted\s*\{[^}]*border-color: var\(--mint-deep\);[^}]*background: var\(--mint-strong\) !important;/s,
    );
    expect(styles.indexOf('.letter-tile--accepted')).toBeGreaterThan(
      styles.indexOf('.letter-tile--selected'),
    );
  });
});
