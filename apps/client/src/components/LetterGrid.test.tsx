import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LetterGrid } from './LetterGrid';

describe('LetterGrid accepted feedback', () => {
  it('marks only accepted indexes and lets accepted feedback override selection styling', () => {
    render(
      <LetterGrid
        letters={['A', 'B', 'C', 'D']}
        size={2}
        label="Test letter grid"
        selectedIndices={[0, 1]}
        acceptedIndices={[1, 2]}
        interactive
      />,
    );

    const tiles = within(screen.getByRole('grid')).getAllByRole('button');

    expect(tiles[0]).toHaveClass('letter-tile--selected');
    expect(tiles[0]).not.toHaveClass('letter-tile--accepted');
    expect(tiles[1]).toHaveClass(
      'letter-tile--selected',
      'letter-tile--accepted',
    );
    expect(tiles[2]).toHaveClass('letter-tile--accepted');
    expect(tiles[3]).not.toHaveClass('letter-tile--accepted');
  });

  it('keeps display-style grids free of accepted feedback unless explicitly given an accepted path', () => {
    const { container } = render(
      <LetterGrid
        letters={['A', 'B', 'C', 'D']}
        size={2}
        label="Display letter grid"
      />,
    );

    expect(container.querySelectorAll('.letter-tile--accepted')).toHaveLength(
      0,
    );
  });
});
