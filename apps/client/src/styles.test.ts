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
    expect(sharedTileSizingRule).toContain(
      '--letter-grid-gap: clamp(0.35rem, 1.2vw, 0.75rem);',
    );
    expect(styles).toMatch(
      /\.display-join-board\s*\{[^}]*gap: var\(--letter-grid-gap\);/s,
    );
    expect(styles).toMatch(
      /\.letter-grid\s*\{[^}]*gap: var\(--letter-grid-gap\);/s,
    );
    expect(styles).toMatch(
      /\.room-dashboard--phone \.letter-grid\s*\{[^}]*--letter-grid-gap: clamp\(0\.22rem, 1vw, 0\.45rem\);/s,
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
    expect(styles).toMatch(/\.word-entry\s*\{[^}]*margin: 1rem 0 0;/s);
    expect(styles).toMatch(
      /\.room-dashboard--phone \.round-action\s*\{[^}]*justify-content: center;[^}]*margin-top: 0;/s,
    );
    expect(styles).toMatch(
      /\.room-dashboard--phone \.round-action \.button\s*\{[^}]*width: 100%;/s,
    );
    expect(styles).toMatch(
      /\.room-dashboard--phone \.room-dashboard__preview\s*\{[^}]*gap: 0\.65rem;/s,
    );
    expect(styles).toMatch(
      /\.room-dashboard--phone \.letter-grid\s*\{[^}]*width: min\(100%, 26rem\);/s,
    );
    expect(styles).toMatch(
      /@media \(min-width: 62rem\)[\s\S]*?\.room-dashboard--phone \.board-panel,\s*\.room-dashboard--phone \.round-action,\s*\.room-dashboard--phone \.settings-panel,\s*\.room-dashboard--phone \.controller-panel\s*\{[^}]*width: min\(100%, 27\.5rem\);[^}]*justify-self: center;/s,
    );
    const basePlayerStyles = styles.slice(
      styles.indexOf('.room-dashboard--phone {'),
      styles.indexOf('@media (min-width: 62rem)'),
    );
    expect(basePlayerStyles).not.toContain('27.5rem');
    expect(styles).not.toContain('.board-panel--active');
    expect(styles).toMatch(
      /@media \(max-width: 44rem\)[\s\S]*?\.round-action \.button\s*\{[^}]*width: 100%;/s,
    );
  });

  it('keeps the display presentation centered and within TV-height bounds', () => {
    expect(styles).toMatch(
      /\.site-header--display\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/s,
    );
    expect(styles).not.toContain('.display-header__qr');
    expect(styles).not.toContain('.display-header__join-qr');
    expect(styles).toMatch(
      /\.display-room-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);/s,
    );
    expect(styles).toMatch(
      /\.display-room-page\s*\{[^}]*min-height: calc\(100dvh - 4\.75rem\);/s,
    );
    expect(styles).toMatch(
      /\.display-side-stack\s*\{[^}]*display: grid;[^}]*width: 100%;[^}]*justify-items: center;[^}]*gap: clamp\(0\.75rem, 1\.5vh, 1rem\);/s,
    );
    expect(styles).toMatch(
      /\.display-side-panel,\s*\.panel\.display-active-join-qr\s*\{[^}]*width: min\(100%, 19rem\);[^}]*justify-self: center;/s,
    );
    expect(styles).toMatch(
      /\.panel\.display-active-join-qr\s*\{[^}]*display: grid;[^}]*place-items: center;[^}]*padding: 0\.65rem;/s,
    );
    expect(styles).toMatch(
      /\.display-active-join-qr__visual\s*\{[^}]*display: block;[^}]*width: 100%;[^}]*aspect-ratio: 1;[^}]*overflow: hidden;[^}]*border-radius: calc\(var\(--radius-lg\) - 0\.65rem\);[^}]*background: #fff;/s,
    );
    expect(styles).toMatch(
      /\.display-active-join-qr__visual svg\s*\{[^}]*display: block;[^}]*width: 100%;[^}]*height: 100%;/s,
    );
    expect(styles).not.toMatch(/\.display-active-join-qr__visual[^}]*7rem/s);
    expect(styles).not.toContain('100dvh - 14.5rem');
    expect(styles).not.toMatch(
      /\.panel\.display-puzzle-panel--active\s*\{[^}]*padding:/s,
    );
    expect(styles).toMatch(
      /\.panel\s*\{[^}]*padding: clamp\(1\.1rem, 2\.5vw, 1\.75rem\);/s,
    );
    expect(styles).toMatch(
      /\.display-puzzle-panel--active > \.letter-grid\s*\{[^}]*width: 100%;/s,
    );
    expect(styles).toMatch(
      /\.display-puzzle-panel\s*\{[^}]*width: min\(55vw, 44rem, calc\(100dvh - 8\.75rem\)\);/s,
    );
    expect(styles).toMatch(
      /\.room-dashboard--phone \.board-panel\s*\{[^}]*padding: 0\.75rem;/s,
    );
    expect(styles).not.toContain('.display-active-puzzle');
    expect(styles).not.toContain('.display-round-timer');
    expect(styles).toMatch(
      /\.display-highlights-timer\s*\{[^}]*display: grid;[^}]*width: 100%;[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);[^}]*align-items: baseline;[^}]*gap: 0\.75rem;[^}]*margin-bottom: 0\.9rem;[^}]*padding-bottom: 0\.75rem;[^}]*border-bottom: 1px solid var\(--line\);/s,
    );
    expect(styles).not.toMatch(
      /\.display-highlights-timer\s*\{[^}]*justify-content: space-between;/s,
    );
    expect(styles).toMatch(
      /\.display-highlights-timer__label\s*\{[^}]*grid-column: 1;[^}]*justify-self: start;[^}]*color: var\(--paper\);[^}]*font-size: clamp\(1\.2rem, 1\.7vw, 1\.5rem\);[^}]*font-weight: 900;[^}]*line-height: 1;/s,
    );
    expect(styles).toMatch(
      /\.display-highlights-timer__value\s*\{[^}]*grid-column: 2;[^}]*justify-self: center;[^}]*min-width: 3ch;[^}]*color: var\(--mint-strong\);[^}]*font-size: clamp\(1\.75rem, 2\.5vw, 2\.25rem\);[^}]*font-variant-numeric: tabular-nums;[^}]*font-weight: 900;[^}]*line-height: 1;[^}]*text-align: center;/s,
    );
    expect(styles).toMatch(
      /\.display-player-list__name\s*\{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/s,
    );
    expect(styles).toMatch(
      /\.display-player-list__primary\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 3ch;[^}]*gap: 0\.55rem;/s,
    );
    expect(styles).toMatch(
      /\.display-player-list__count\s*\{[^}]*justify-self: end;[^}]*min-width: 3ch;[^}]*color: var\(--mint-strong\);[^}]*font-size: clamp\(1rem, 1\.5vw, 1\.25rem\);[^}]*font-variant-numeric: tabular-nums;[^}]*font-weight: 900;[^}]*text-align: right;/s,
    );
    expect(styles).toMatch(
      /\.display-results__cards\s*\{[^}]*width: fit-content;[^}]*max-width: 96vw;[^}]*grid-template-columns: repeat\(2, minmax\(16rem, max-content\)\);/s,
    );
    expect(styles).toMatch(
      /\.display-results__cards--1\s*\{[^}]*grid-template-columns: minmax\(16rem, max-content\);/s,
    );
    expect(styles).toMatch(
      /\.display-results__cards--3\s*\{[^}]*repeat\(3, minmax\(16rem, max-content\)\);/s,
    );
    expect(styles).toMatch(
      /\.display-results__cards--4,\s*\.display-results__cards--5,\s*\.display-results__cards--6,\s*\.display-results__cards--7,\s*\.display-results__cards--8\s*\{[^}]*repeat\(4, minmax\(16rem, max-content\)\);/s,
    );
    expect(styles).not.toMatch(/\.display-results__cards\s*\{[^}]*\b1fr\b/s);
    expect(styles).toMatch(
      /\.result-player-card\s*\{[^}]*border: 1px solid var\(--line-strong\);[^}]*border-radius: var\(--radius-md\);[^}]*background: rgba\(16, 38, 58, 0\.72\);[^}]*box-shadow: var\(--shadow\);[^}]*color: var\(--paper\);/s,
    );
    expect(styles).toMatch(
      /\.result-player-card\s*\{[^}]*min-width: 16rem;[^}]*max-width: 24rem;[^}]*overflow-wrap: anywhere;/s,
    );
    expect(styles).toMatch(
      /\.result-player-card h2,\s*\.result-player-card li\s*\{[^}]*overflow-wrap: anywhere;/s,
    );
    expect(styles).toMatch(
      /\.result-player-card--winner\s*\{[^}]*border-color: rgba\(112, 231, 162, 0\.72\);[^}]*background:/s,
    );
    expect(styles).toMatch(
      /\.result-player-card\[data-podium-level='2'\]\s*\{[^}]*margin-top: clamp\(0\.5rem, 1\.5vh, 1rem\);/s,
    );
    expect(styles).toMatch(
      /\.result-player-card\[data-podium-level='4'\]\s*\{[^}]*margin-top: clamp\(1\.35rem, 4vh, 2\.75rem\);/s,
    );
    expect(styles).toMatch(
      /\.result-player-card--celebrate\s*\{[^}]*animation: result-winner-arrival 5s ease-out both;/s,
    );
    expect(styles).toMatch(/@keyframes result-winner-arrival\s*\{/);
    expect(styles).toMatch(
      /@keyframes result-winner-arrival[\s\S]*translateY\(/,
    );
    expect(styles).not.toMatch(
      /@keyframes result-winner-arrival[\s\S]*scale\(/,
    );
    expect(styles).toMatch(
      /\.result-player-card--winner h2 \[aria-label='Game Host winner'\]\s*\{[^}]*color: var\(--sun\);/s,
    );
    expect(styles).toMatch(
      /\.result-player-card__points\s*\{[^}]*color: var\(--mint-strong\);/s,
    );
    expect(styles).toMatch(
      /\.result-player-card__stats dt\s*\{[^}]*color: var\(--paper-muted\);/s,
    );
    expect(styles).toMatch(
      /\.result-player-card ul\s*\{[^}]*border-top: 1px solid var\(--line\);[^}]*background: rgba\(6, 16, 27, 0\.28\);[^}]*color: var\(--mint\);/s,
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
    expect(styles).toMatch(
      /\.display-join-board__qr-canvas\s*\{[^}]*display: block;[^}]*width: 100%;[^}]*height: 100%;[^}]*max-width: 100%;[^}]*max-height: 100%;[^}]*border: 0;[^}]*outline: 0;[^}]*image-rendering: pixelated;/s,
    );
    expect(styles).not.toContain('.display-join-board__qr-surface');
    expect(styles).not.toMatch(
      /\.display-join-board__qr\s*\{[^}]*box-shadow:/s,
    );
    expect(styles).toMatch(
      /\.phone-round-summary\s*\{[^}]*min-height: min\(17rem, 52vh\);[^}]*place-content: center;/s,
    );
    expect(styles).toMatch(
      /\.phone-round-summary__winner-names\s*\{[^}]*color: var\(--paper-muted\);[^}]*overflow-wrap: anywhere;/s,
    );
  });

  it('stacks the display puzzle and side panels safely in portrait orientation', () => {
    const portraitDisplayStyles = styles.match(
      /@media \(orientation: portrait\) \{([\s\S]*?)\n\}\n\n@media \(max-width: 430px\)/,
    )?.[1];

    expect(portraitDisplayStyles).toBeDefined();
    expect(portraitDisplayStyles).toMatch(
      /\.display-room-page \.display-room-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*align-items: start;[^}]*justify-items: center;/s,
    );
    expect(portraitDisplayStyles).toMatch(
      /\.display-room-layout > \.display-puzzle-panel\s*\{[^}]*width: min\(100%, 44rem\);[^}]*order: 1;/s,
    );
    expect(portraitDisplayStyles).toMatch(
      /\.display-room-layout > \.display-side-panel\s*\{[^}]*order: 2;/s,
    );
    expect(portraitDisplayStyles).toMatch(
      /\.display-room-layout > \.display-side-stack\s*\{[^}]*order: 3;/s,
    );
    expect(portraitDisplayStyles).toMatch(
      /\.display-results__cards,[^}]*grid-template-columns: minmax\(16rem, min\(24rem, 90vw\)\);/s,
    );
    expect(portraitDisplayStyles).not.toContain('55vw');
  });

  it('keeps the mid-round phone waiting notice deliberately spaced below the puzzle', () => {
    expect(styles).toMatch(
      /\.room-dashboard--phone \.board-panel \.letter-grid \+ \.prototype-notice\s*\{[^}]*margin-top: 0\.75rem;/s,
    );
  });

  it('keeps the embedded TV QR on the letter-tile background', () => {
    const qrTileRule = styles.match(
      /\.display-join-board__qr\s*\{[^}]*\}/s,
    )?.[0];

    expect(qrTileRule).toContain('background: var(--paper);');
    expect(qrTileRule).not.toMatch(/#fff|#ffffff/i);
    expect(qrTileRule).not.toContain('box-shadow:');
  });

  it('keeps display fireworks behind result content with a uniform radial burst', () => {
    expect(styles).toMatch(
      /\.display-results\s*\{[^}]*position: relative;[^}]*isolation: isolate;/s,
    );
    expect(styles).toMatch(
      /\.display-results__fireworks\s*\{[^}]*position: absolute;[^}]*inset: 0;[^}]*z-index: 0;[^}]*pointer-events: none;/s,
    );
    expect(styles).toMatch(
      /\.display-results > h1,\s*\.display-results__quip\s*\{[^}]*position: relative;[^}]*z-index: 1;/s,
    );
    expect(styles).toMatch(
      /\.display-results__cards\s*\{[^}]*position: relative;[^}]*z-index: 1;/s,
    );

    for (const [spark, direction] of [
      [1, 0],
      [2, 45],
      [3, 90],
      [4, 135],
      [5, 180],
      [6, 225],
      [7, 270],
      [8, 315],
    ]) {
      expect(styles).toMatch(
        new RegExp(
          `\\.display-results__firework b:nth-child\\(${spark}\\)\\s*\\{[^}]*transform: rotate\\(${direction}deg\\) translateY\\(-28px\\);`,
          's',
        ),
      );
    }

    expect(styles).not.toMatch(
      /\.display-results__firework b:nth-child\([^)]*\)\s*\{[^}]*translateY\(-18px\);/s,
    );
    expect(styles).not.toContain('var(--spark');
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
