import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  PlayerRoundSubmissionState,
  RoomState,
  SubmitWordInput,
  SubmitWordResponse,
} from '@words/shared';

import { RoomLobby } from './RoomLobby';

const playerId = '00000000-0000-4000-8000-000000000001';
const roundId = '00000000-0000-4000-8000-000000000010';
const timestamps = {
  createdAt: '2026-07-31T00:00:00.000Z',
  expiresAt: '2026-07-31T02:00:00.000Z',
};

function createRoom(overrides: Partial<RoomState> = {}): RoomState {
  const startedAt = new Date(Date.now() - 1_000).toISOString();
  const deadlineAt = new Date(Date.now() + 60_000).toISOString();
  return {
    code: 'ABC234',
    phase: 'ROUND_ACTIVE',
    stateVersion: 1,
    serverTime: new Date().toISOString(),
    createdAt: timestamps.createdAt,
    lastActivityAt: timestamps.createdAt,
    expiresAt: timestamps.expiresAt,
    maxPlayers: 8,
    display: { connected: true, createdAt: timestamps.createdAt },
    controllerStatus: 'assigned',
    controllerPlayerId: playerId,
    players: [
      {
        id: playerId,
        displayName: 'Bright Fox',
        connected: true,
        joinedAt: timestamps.createdAt,
        isController: true,
      },
    ],
    settings: {
      gridSize: 4,
      roundDurationSeconds: 60,
      scoringMode: 'traditional',
    },
    round: {
      id: roundId,
      number: 1,
      settings: {
        gridSize: 4,
        roundDurationSeconds: 60,
        scoringMode: 'traditional',
      },
      board: {
        size: 4,
        tiles: [
          'A',
          'B',
          'C',
          'D',
          'E',
          'F',
          'G',
          'QU',
          'I',
          'J',
          'K',
          'L',
          'M',
          'N',
          'O',
          'P',
        ],
      },
      participants: [{ playerId, displayName: 'Bright Fox' }],
      startedAt,
      deadlineAt,
      endedAt: null,
      results: null,
      generationAttempts: 1,
    },
    ...overrides,
  };
}

function createSubmissionState(): PlayerRoundSubmissionState {
  return {
    roundId,
    playerId,
    submissionVersion: 0,
    acceptedWords: [],
    provisionalScore: 0,
  };
}

function renderLobby(
  onSubmitWord: (input: SubmitWordInput) => Promise<SubmitWordResponse> = vi.fn(
    async (): Promise<SubmitWordResponse> => ({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected error.' },
      state: createSubmissionState(),
    }),
  ),
) {
  return render(
    <RoomLobby
      room={createRoom()}
      sessionRole="player"
      currentPlayerId={playerId}
      connectionStatus="connected"
      onLeave={async () => undefined}
      onTransferController={async () => null}
      onUpdateSettings={async () => null}
      onStartRound={async () => null}
      submissionState={createSubmissionState()}
      onSubmitWord={onSubmitWord}
    />,
  );
}

function tileButtons() {
  return within(screen.getByRole('grid')).getAllByRole('button');
}

async function selectFirstThree(user: ReturnType<typeof userEvent.setup>) {
  const tiles = tileButtons();
  await user.click(tiles[0]!);
  await user.click(tiles[1]!);
  await user.click(tiles[2]!);
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('RoomLobby word entry', () => {
  it('defaults to Touch, remembers Trace locally, and exposes an accessible selector', async () => {
    const user = userEvent.setup();
    const first = renderLobby();

    const mode = screen.getByRole('group', { name: 'Word entry mode' });
    expect(within(mode).getByRole('button', { name: 'Touch' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(mode).getByRole('button', { name: 'Trace' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(within(mode).getByRole('button', { name: 'Trace' }));
    expect(window.localStorage.getItem('words:word-entry-mode')).toBe('trace');
    first.unmount();

    renderLobby();
    expect(screen.getByRole('button', { name: 'Trace' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('removes obsolete controls and keeps Submit available', () => {
    renderLobby();

    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('uses Touch backtracking without leaving disconnected paths', async () => {
    const user = userEvent.setup();
    renderLobby();
    await selectFirstThree(user);
    expect(screen.getByRole('heading', { name: 'ABC' })).toBeVisible();

    await user.click(tileButtons()[2]!);
    expect(screen.getByRole('heading', { name: 'AB' })).toBeVisible();
    await user.click(tileButtons()[0]!);
    expect(screen.getByRole('heading', { name: 'A' })).toBeVisible();
    await user.click(tileButtons()[0]!);
    expect(
      screen.getByRole('heading', { name: 'Select adjacent tiles' }),
    ).toBeVisible();
  });

  it('submits once on Trace lift, ignores nonadjacent movement, and keeps keyboard Submit usable', async () => {
    const onSubmitWord = vi.fn(async (): Promise<SubmitWordResponse> => ({
      ok: false,
      error: {
        code: 'WORD_TOO_SHORT',
        message: 'Choose at least three letters.',
      },
      state: createSubmissionState(),
    }));
    renderLobby(onSubmitWord);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Trace' }));
    const grid = screen.getByRole('grid');
    const tiles = tileButtons();
    const elementFromPoint = vi
      .fn()
      .mockReturnValueOnce(tiles[0]!)
      .mockReturnValueOnce(tiles[1]!)
      .mockReturnValueOnce(tiles[10]!);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });

    fireEvent.pointerDown(tiles[0]!, { pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(grid, { pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(grid, { pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(grid, { pointerId: 1, pointerType: 'mouse' });

    expect(onSubmitWord).toHaveBeenCalledTimes(1);
    expect(onSubmitWord).toHaveBeenCalledWith({
      roundId,
      word: 'AB',
      path: [0, 1],
    });
    expect(
      await screen.findByText('Choose at least three letters.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('cancels Trace without submitting and resets an in-progress trace on mode change', async () => {
    const onSubmitWord = vi.fn();
    renderLobby(onSubmitWord);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Trace' }));
    const grid = screen.getByRole('grid');
    const tiles = tileButtons();

    fireEvent.pointerDown(tiles[0]!, { pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerCancel(grid, { pointerId: 1, pointerType: 'mouse' });
    expect(onSubmitWord).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'Select adjacent tiles' }),
    ).toBeVisible();

    fireEvent.pointerDown(tiles[0]!, { pointerId: 2, pointerType: 'mouse' });
    await user.click(screen.getByRole('button', { name: 'Touch' }));
    expect(
      screen.getByRole('heading', { name: 'Select adjacent tiles' }),
    ).toBeVisible();
  });

  it('truncates a Trace when it returns to an earlier selected tile', async () => {
    const onSubmitWord = vi.fn(async (): Promise<SubmitWordResponse> => ({
      ok: false,
      error: {
        code: 'WORD_TOO_SHORT',
        message: 'Choose at least three letters.',
      },
      state: createSubmissionState(),
    }));
    const user = userEvent.setup();
    renderLobby(onSubmitWord);
    await user.click(screen.getByRole('button', { name: 'Trace' }));
    const grid = screen.getByRole('grid');
    const tiles = tileButtons();
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi
        .fn()
        .mockReturnValueOnce(tiles[0]!)
        .mockReturnValueOnce(tiles[1]!)
        .mockReturnValueOnce(tiles[2]!)
        .mockReturnValueOnce(tiles[1]!),
    });

    fireEvent.pointerDown(tiles[0]!, { pointerId: 3, pointerType: 'mouse' });
    fireEvent.pointerMove(grid, { pointerId: 3, pointerType: 'mouse' });
    fireEvent.pointerMove(grid, { pointerId: 3, pointerType: 'mouse' });
    fireEvent.pointerMove(grid, { pointerId: 3, pointerType: 'mouse' });
    fireEvent.pointerUp(grid, { pointerId: 3, pointerType: 'mouse' });

    expect(onSubmitWord).toHaveBeenCalledWith({
      roundId,
      word: 'AB',
      path: [0, 1],
    });
  });

  it('keeps Submit keyboard usable in Trace mode', async () => {
    const onSubmitWord = vi.fn(async (): Promise<SubmitWordResponse> => ({
      ok: false,
      error: {
        code: 'WORD_NOT_IN_DICTIONARY',
        message: 'That word is not in the dictionary.',
      },
      state: createSubmissionState(),
    }));
    const user = userEvent.setup();
    renderLobby(onSubmitWord);
    await user.click(screen.getByRole('button', { name: 'Trace' }));

    for (const tile of tileButtons().slice(0, 3)) {
      tile.focus();
      await user.keyboard('{Enter}');
    }
    const submit = screen.getByRole('button', { name: 'Submit' });
    submit.focus();
    await user.keyboard('{Enter}');

    expect(onSubmitWord).toHaveBeenCalledWith({
      roundId,
      word: 'ABC',
      path: [0, 1, 2],
    });
    expect(
      await screen.findByText('That word is not in the dictionary.'),
    ).toBeVisible();
  });

  it('clears accepted and expected-rejected candidates but retains unexpected failures', async () => {
    const accepted = vi.fn(async (): Promise<SubmitWordResponse> => ({
      ok: true,
      acceptedWord: {
        sequence: 1,
        word: 'ABC',
        points: 1,
        acceptedAt: new Date().toISOString(),
      },
      state: {
        ...createSubmissionState(),
        submissionVersion: 1,
        acceptedWords: [
          {
            sequence: 1,
            word: 'ABC',
            points: 1,
            acceptedAt: new Date().toISOString(),
          },
        ],
        provisionalScore: 1,
      },
    }));
    const user = userEvent.setup();
    const acceptedView = renderLobby(accepted);
    await selectFirstThree(user);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText(/ABC accepted/i)).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Select adjacent tiles' }),
    ).toBeVisible();
    acceptedView.unmount();

    const rejected = vi.fn(async (): Promise<SubmitWordResponse> => ({
      ok: false,
      error: {
        code: 'ALREADY_SUBMITTED',
        message: 'You already found that word.',
      },
      state: createSubmissionState(),
    }));
    const rejectedView = renderLobby(rejected);
    await selectFirstThree(user);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(
      await screen.findByText('You already found that word.'),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Select adjacent tiles' }),
    ).toBeVisible();
    rejectedView.unmount();

    const unexpected = vi.fn(async () => {
      throw new Error('offline');
    });
    renderLobby(unexpected);
    await selectFirstThree(user);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(
      await screen.findByText('Could not submit that word. Try again.'),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'ABC' })).toBeVisible();
  });

  it('keeps QU as two candidate letters', async () => {
    const user = userEvent.setup();
    renderLobby();
    const tiles = tileButtons();
    await user.click(tiles[6]!);
    await user.click(tiles[7]!);

    expect(screen.getByRole('heading', { name: 'GQU' })).toBeVisible();
  });
});
