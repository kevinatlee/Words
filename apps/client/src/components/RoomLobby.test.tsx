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
      scoringMode: 'length-plus-unique',
    },
    round: {
      id: roundId,
      number: 1,
      settings: {
        gridSize: 4,
        roundDurationSeconds: 60,
        scoringMode: 'length-plus-unique',
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
  {
    room = createRoom(),
    sessionRole = 'player',
    currentPlayerId = playerId,
  }: {
    room?: RoomState;
    sessionRole?: 'display' | 'player';
    currentPlayerId?: string | null;
  } = {},
) {
  return render(
    <RoomLobby
      room={room}
      sessionRole={sessionRole}
      currentPlayerId={currentPlayerId}
      connectionStatus="connected"
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

function mockTileGeometry() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function getBoundingClientRect(this: HTMLElement) {
      const index = Number.parseInt(this.dataset.tileIndex ?? '-1', 10);
      const left = (index % 4) * 100;
      const top = Math.floor(index / 4) * 100;
      return {
        bottom: top + 100,
        height: 100,
        left,
        right: left + 100,
        toJSON: () => ({}),
        top,
        width: 100,
        x: left,
        y: top,
      } as DOMRect;
    },
  );
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
  it('keeps active phone play in a headingless puzzle bubble and separate mode bubble', () => {
    const { container } = renderLobby();

    const preview = container.querySelector('.room-dashboard__preview');
    expect(preview?.firstElementChild).toHaveClass('board-panel');
    const puzzle = screen.getByRole('region', { name: 'Puzzle' });
    const modePanel = screen.getByRole('region', { name: 'Word entry mode' });
    expect(puzzle).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Puzzle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Leave room' })).toBeNull();
    expect(
      within(modePanel).getByRole('button', { name: 'Tap' }),
    ).toBeVisible();
    expect(
      within(modePanel).getByRole('button', { name: 'Trace' }),
    ).toBeVisible();
    expect(
      within(puzzle).getByRole('button', { name: 'Submit' }),
    ).toBeVisible();
    expect(puzzle).not.toContainElement(modePanel);
    expect(modePanel.querySelector('h1, h2, h3, .eyebrow, p')).toBeNull();
    expect(screen.getByRole('timer')).toBeVisible();
    expect(screen.getByText('Timer')).toBeVisible();
    expect(screen.queryByText('Private progress')).toBeNull();
    expect(screen.queryByText('0 points')).toBeNull();
    expect(screen.queryByText('0 accepted')).toBeNull();
    expect(screen.queryByText('Live temporary room')).toBeNull();
    expect(screen.queryByLabelText('Room code ABC234')).toBeNull();
    expect(screen.queryByText('Shared screen')).toBeNull();
    expect(screen.queryByText('Round active')).toBeNull();
    expect(screen.queryByRole('region', { name: /scan to join/i })).toBeNull();
  });

  it('defaults to Tap, remembers Trace locally, and exposes an accessible selector', async () => {
    const user = userEvent.setup();
    const first = renderLobby();

    const mode = screen.getByRole('group', { name: 'Word entry mode' });
    expect(within(mode).getByRole('button', { name: 'Tap' })).toHaveAttribute(
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

  it('shows the mode bubble only to active round participants', () => {
    const activeView = renderLobby();
    expect(
      screen.getByRole('region', { name: 'Word entry mode' }),
    ).toBeVisible();
    activeView.unmount();

    const lobbyView = renderLobby(undefined, {
      room: createRoom({ phase: 'LOBBY', round: null }),
    });
    expect(
      screen.queryByRole('region', { name: 'Word entry mode' }),
    ).toBeNull();
    lobbyView.unmount();

    const latePlayerId = '00000000-0000-4000-8000-000000000002';
    renderLobby(undefined, {
      room: createRoom({
        players: [
          ...createRoom().players,
          {
            id: latePlayerId,
            displayName: 'Calm Otter',
            connected: true,
            joinedAt: '2026-07-31T00:01:00.000Z',
            isController: false,
          },
        ],
      }),
      currentPlayerId: latePlayerId,
    });
    expect(
      screen.queryByRole('region', { name: 'Word entry mode' }),
    ).toBeNull();
  });

  it('keeps display timer wording separate from prominent phone timer labels', () => {
    const phone = renderLobby();
    expect(screen.getByText('Timer').closest('.round-clock')).toHaveClass(
      'round-clock--phone',
    );
    phone.unmount();

    renderLobby(undefined, { sessionRole: 'display', currentPlayerId: null });
    expect(screen.getByText('Authoritative time remaining')).toBeVisible();
    expect(
      screen.getByText('Authoritative time remaining').closest('.round-clock'),
    ).not.toHaveClass('round-clock--phone');
  });

  it('removes obsolete controls and keeps Submit available', () => {
    renderLobby();

    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('keeps controller administration out of active gameplay', () => {
    renderLobby();

    expect(
      screen.queryByRole('region', { name: 'Game host controls' }),
    ).toBeNull();
    expect(screen.queryByRole('region', { name: 'Game settings' })).toBeNull();
  });

  it.each([
    {
      phase: 'LOBBY' as const,
      room: createRoom({ phase: 'LOBBY', round: null }),
      button: 'Start Round',
    },
    {
      phase: 'ROUND_ENDED' as const,
      room: createRoom({ phase: 'ROUND_ENDED' }),
      button: 'Start Next Round',
    },
  ])(
    'keeps the controller $phase panels as puzzle, settings, then authority',
    ({ room, button }) => {
      const { container } = renderLobby(undefined, { room });
      const preview = container.querySelector('.room-dashboard__preview');
      const puzzle = screen.getByRole('region', { name: 'Puzzle' });
      const settings = screen.getByRole('region', { name: 'Game settings' });
      const authority = screen.getByRole('region', {
        name: 'Game host controls',
      });

      expect(
        within(puzzle).getByRole('button', { name: button }),
      ).toBeVisible();
      expect(puzzle).not.toContainElement(settings);
      expect(puzzle).not.toContainElement(authority);
      expect(Array.from(preview?.children ?? [])).toEqual(
        expect.arrayContaining([puzzle, settings, authority]),
      );
      expect(
        puzzle.compareDocumentPosition(settings) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
      expect(
        settings.compareDocumentPosition(authority) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
    },
  );

  it('shows controller administration only to the connected controller between rounds', () => {
    const lobby = createRoom({ phase: 'LOBBY', round: null });
    const lobbyView = renderLobby(undefined, { room: lobby });
    expect(
      screen.getByRole('region', { name: 'Game host controls' }),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'Game settings' })).toBeVisible();
    expect(screen.queryByText('Game settings')).toBeNull();
    expect(screen.queryByText('Game Host controls')).toBeNull();
    expect(screen.getByText('Grid Size')).toHaveClass('visually-hidden');
    expect(screen.getByText('Round Duration')).toHaveClass('visually-hidden');
    expect(screen.queryByRole('heading', { name: 'Game Host' })).toBeNull();
    expect(screen.queryByText('Game Host online')).toBeNull();
    expect(screen.getByRole('group', { name: 'Grid Size' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Round Duration' })).toBeVisible();
    expect(
      screen
        .getAllByRole('button')
        .filter((button) =>
          ['30s', '1m', '1.5m', '2m', '2.5m', '3m'].includes(
            button.textContent ?? '',
          ),
        ),
    ).toHaveLength(6);
    lobbyView.unmount();

    renderLobby(undefined, {
      room: createRoom({ phase: 'ROUND_ENDED' }),
    });
    expect(
      screen.getByRole('region', { name: 'Game host controls' }),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: 'Game settings' })).toBeVisible();
  });

  it('keeps authority transfer accessible without exposing the current host name', () => {
    const secondPlayerId = '00000000-0000-4000-8000-000000000002';
    renderLobby(undefined, {
      room: createRoom({
        phase: 'LOBBY',
        round: null,
        players: [
          ...createRoom().players,
          {
            id: secondPlayerId,
            displayName: 'Calm Otter',
            connected: true,
            joinedAt: '2026-07-31T00:01:00.000Z',
            isController: false,
          },
        ],
      }),
    });

    expect(screen.queryByText('Player authority')).toBeNull();
    expect(
      screen.queryByText('Bright Fox is the current Game Host.'),
    ).toBeNull();
    expect(screen.queryByText('Choose a connected phone player')).toBeNull();
    expect(
      screen.getByRole('combobox', { name: 'Select New Game Host' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Make Game Host' }),
    ).toBeVisible();
  });

  it('never shows controller administration to ordinary players or the display', () => {
    const ordinaryPlayerId = '00000000-0000-4000-8000-000000000002';
    const ordinaryRoom = createRoom({
      players: [
        ...createRoom().players,
        {
          id: ordinaryPlayerId,
          displayName: 'Calm Otter',
          connected: true,
          joinedAt: '2026-07-31T00:01:00.000Z',
          isController: false,
        },
      ],
    });

    for (const phase of ['LOBBY', 'ROUND_ACTIVE', 'ROUND_ENDED'] as const) {
      const view = renderLobby(undefined, {
        room: {
          ...ordinaryRoom,
          phase,
          round: phase === 'LOBBY' ? null : ordinaryRoom.round,
        },
        currentPlayerId: ordinaryPlayerId,
      });
      expect(
        screen.queryByRole('region', { name: 'Game host controls' }),
      ).toBeNull();
      expect(
        screen.queryByRole('region', { name: 'Game settings' }),
      ).toBeNull();
      view.unmount();
    }

    renderLobby(undefined, {
      room: createRoom({ phase: 'LOBBY', round: null }),
      sessionRole: 'display',
      currentPlayerId: null,
    });
    expect(
      screen.queryByRole('region', { name: 'Game host controls' }),
    ).toBeNull();
    expect(screen.queryByRole('region', { name: 'Game settings' })).toBeNull();
  });

  it('leaves ordinary ended phones with only the completed puzzle', () => {
    const ordinaryPlayerId = '00000000-0000-4000-8000-000000000002';
    const room = createRoom({
      phase: 'ROUND_ENDED',
      players: [
        ...createRoom().players,
        {
          id: ordinaryPlayerId,
          displayName: 'Calm Otter',
          connected: true,
          joinedAt: '2026-07-31T00:01:00.000Z',
          isController: false,
        },
      ],
    });

    renderLobby(undefined, { room, currentPlayerId: ordinaryPlayerId });

    expect(screen.getByRole('region', { name: 'Puzzle' })).toBeVisible();
    expect(screen.getByText('Round complete')).toBeVisible();
    expect(
      screen.getByText('Round complete').closest('.round-clock'),
    ).toHaveClass('round-clock--phone');
    expect(
      screen.queryByText('Round complete — results are on the TV.'),
    ).toBeNull();
    expect(screen.queryByRole('region', { name: 'Game settings' })).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Game host controls' }),
    ).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('keeps room details and finalized results on the display', () => {
    const activeRoom = createRoom();
    const endedRoom: RoomState = {
      ...activeRoom,
      phase: 'ROUND_ENDED',
      round: activeRoom.round
        ? {
            ...activeRoom.round,
            endedAt: new Date().toISOString(),
            results: {
              players: [
                {
                  playerId,
                  displayName: 'Bright Fox',
                  rank: 1,
                  baseScore: 3,
                  uniqueBonusScore: 1,
                  finalScore: 4,
                  words: [],
                },
              ],
              winnerPlayerIds: [playerId],
            },
          }
        : null,
    };

    renderLobby(undefined, {
      room: endedRoom,
      sessionRole: 'display',
      currentPlayerId: null,
    });

    expect(screen.getByText('Live temporary room')).toBeVisible();
    expect(screen.getByLabelText('Room code ABC234')).toBeVisible();
    expect(screen.getByText('Shared Screen')).toBeVisible();
    expect(screen.getByRole('rowheader', { name: 'Bright Fox' })).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Join the next round' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Bright Fox wins' }),
    ).toBeVisible();
  });

  it('uses Tap backtracking without leaving disconnected paths', async () => {
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

  it('stacks the submit action and feedback below the selected word', async () => {
    const user = userEvent.setup();
    renderLobby(async () => ({
      ok: false,
      error: { code: 'WORD_NOT_IN_DICTIONARY', message: 'Not in dictionary.' },
      state: createSubmissionState(),
    }));
    await selectFirstThree(user);

    const wordEntry = screen
      .getByRole('heading', { name: 'ABC' })
      .closest('.word-entry');
    const submit = screen.getByRole('button', { name: 'Submit' });
    const wordContent = wordEntry?.querySelector('.word-entry__content');
    expect(wordContent).toContainElement(
      screen.getByRole('heading', { name: 'ABC' }),
    );
    expect(wordEntry?.querySelector('.word-entry__actions')).toContainElement(
      submit,
    );
    expect(wordContent).not.toBeNull();
    if (!wordContent) {
      throw new Error('Word entry content was not rendered.');
    }
    expect(
      wordContent.compareDocumentPosition(submit) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    await user.click(submit);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Not in dictionary.',
    );
    expect(
      submit.compareDocumentPosition(screen.getByRole('status')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
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
    mockTileGeometry();
    const elementFromPoint = vi.fn().mockReturnValue(tiles[0]!);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });

    fireEvent.pointerDown(tiles[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(grid, {
      clientX: 150,
      clientY: 50,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(grid, {
      clientX: 250,
      clientY: 250,
      pointerId: 1,
      pointerType: 'mouse',
    });
    fireEvent.pointerUp(grid, {
      clientX: 250,
      clientY: 250,
      pointerId: 1,
      pointerType: 'mouse',
    });

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
    mockTileGeometry();

    fireEvent.pointerDown(tiles[0]!, { pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerCancel(grid, { pointerId: 1, pointerType: 'mouse' });
    expect(onSubmitWord).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'Select adjacent tiles' }),
    ).toBeVisible();

    fireEvent.pointerDown(tiles[0]!, { pointerId: 2, pointerType: 'mouse' });
    await user.click(screen.getByRole('button', { name: 'Tap' }));
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
    mockTileGeometry();
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn().mockReturnValue(tiles[0]!),
    });

    fireEvent.pointerDown(tiles[0]!, {
      clientX: 50,
      clientY: 50,
      pointerId: 3,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(grid, {
      clientX: 150,
      clientY: 50,
      pointerId: 3,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(grid, {
      clientX: 250,
      clientY: 50,
      pointerId: 3,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(grid, {
      clientX: 150,
      clientY: 50,
      pointerId: 3,
      pointerType: 'mouse',
    });
    fireEvent.pointerUp(grid, {
      clientX: 150,
      clientY: 50,
      pointerId: 3,
      pointerType: 'mouse',
    });

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
