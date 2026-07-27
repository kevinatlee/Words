import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('Stage 1 routes', () => {
  it('renders the role selection at the root route', () => {
    render(<App routePath="/" />);

    expect(
      screen.getByRole('heading', { name: 'Words', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Host a Game/i })).toHaveAttribute(
      'href',
      '/host',
    );
    expect(screen.getByRole('link', { name: /Join a Game/i })).toHaveAttribute(
      'href',
      '/play/demo',
    );
  });

  it('renders the host prototype with disabled server actions', () => {
    render(<App routePath="/host" />);

    expect(
      screen.getByRole('heading', { name: 'Set the table for a round.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make Host' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start Round' })).toBeDisabled();
    expect(screen.getByText(/Multiplayer, QR joining/i)).toBeInTheDocument();
  });

  it('lets prototype grid controls update the generic board', async () => {
    const user = userEvent.setup();
    render(<App routePath="/host" />);

    await user.click(screen.getByRole('button', { name: '5 × 5' }));

    expect(
      screen.getByRole('heading', { name: '5 × 5 letter grid' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('grid', {
        name: '5 by 5 demonstration letter grid',
      }),
    ).toHaveStyle({ '--grid-size': '5' });
    expect(
      screen.getAllByRole('gridcell', {
        hidden: true,
      }),
    ).toHaveLength(25);
  });

  it('renders the phone-oriented player prototype accessibly', () => {
    render(<App routePath="/play/demo" />);

    expect(
      screen.getByRole('grid', { name: 'Four by four touch board prototype' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Word' })).toBeDisabled();
    expect(screen.getByText(/This phone view is static/i)).toBeInTheDocument();
  });

  it('renders a useful not-found page', () => {
    render(<App routePath="/missing" />);

    expect(
      screen.getByRole('heading', {
        name: 'That word isn’t on this board.',
      }),
    ).toBeInTheDocument();
  });
});
