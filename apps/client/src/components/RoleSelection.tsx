import { productConfig } from '@words/shared';

import { ProductTitle } from './ProductTitle';
import { PrototypeNotice } from './PrototypeNotice';

const decorativeLetters = ['W', 'O', 'R', 'D', 'S', '•', 'P', 'L', 'A'];

export function RoleSelection() {
  return (
    <section className="role-page">
      <div className="role-hero">
        <div className="role-hero__copy">
          <span className="eyebrow">Gather around. Look closely.</span>
          <h1>
            <ProductTitle />
          </h1>
          <p className="hero-lede">{productConfig.description}</p>
          <p className="hero-support">
            One shared grid. A room full of phones. Find words together before
            the clock runs out.
          </p>
        </div>

        <div className="word-mosaic" aria-hidden="true">
          {decorativeLetters.map((letter, index) => (
            <span
              className={letter === '•' ? 'word-mosaic__spark' : ''}
              key={`${letter}-${index}`}
            >
              {letter}
            </span>
          ))}
        </div>
      </div>

      <div className="role-actions" aria-label="Choose a prototype view">
        <a className="role-card role-card--host" href="/host">
          <span className="role-card__number" aria-hidden="true">
            01
          </span>
          <span>
            <small>For the shared screen</small>
            <strong>Host a Game</strong>
          </span>
          <span className="role-card__arrow" aria-hidden="true">
            ↗
          </span>
        </a>
        <a className="role-card role-card--player" href="/play/demo">
          <span className="role-card__number" aria-hidden="true">
            02
          </span>
          <span>
            <small>For your phone</small>
            <strong>Join a Game</strong>
          </span>
          <span className="role-card__arrow" aria-hidden="true">
            ↗
          </span>
        </a>
      </div>

      <PrototypeNotice>
        These links open static previews. Creating and joining real rooms comes
        in a later stage.
      </PrototypeNotice>
    </section>
  );
}
