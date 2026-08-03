import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createEmptyRoomHighlights,
  productConfig,
  type PlayerRoundSubmissionState,
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
    highlights: createEmptyRoomHighlights(),
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
      acceptedWordCounts: [{ playerId, count: 0 }],
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

function acceptedSubmission(word = 'ABC', points = 3): SubmitWordResponse {
  const acceptedAt = new Date().toISOString();
  return {
    ok: true,
    acceptedWord: { sequence: 1, word, points, acceptedAt },
    state: {
      ...createSubmissionState(),
      submissionVersion: 1,
      acceptedWords: [{ sequence: 1, word, points, acceptedAt }],
      provisionalScore: points,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function lobbyProps(
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
  return {
    room,
    sessionRole,
    currentPlayerId,
    connectionStatus: 'connected' as const,
    onTransferController: async () => null,
    onUpdateSettings: async () => null,
    onStartRound: async () => null,
    submissionState: createSubmissionState(),
    onSubmitWord,
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
  options: {
    room?: RoomState;
    sessionRole?: 'display' | 'player';
    currentPlayerId?: string | null;
  } = {},
) {
  const slot = document.createElement('div');
  slot.id = 'phone-entry-mode-slot';
  document.body.append(slot);
  return render(<RoomLobby {...lobbyProps(onSubmitWord, options)} />);
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
  const tap = screen.getByRole('button', { name: 'Tap' });
  if (tap.getAttribute('aria-pressed') !== 'true') {
    await user.click(tap);
  }
  const tiles = tileButtons();
  await user.click(tiles[0]!);
  await user.click(tiles[1]!);
  await user.click(tiles[2]!);
}

afterEach(() => {
  window.localStorage.clear();
  document.querySelectorAll('#phone-entry-mode-slot').forEach((slot) => {
    slot.remove();
  });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('RoomLobby word entry', () => {
  it('keeps active phone play in a headingless puzzle bubble and header mode control', () => {
    const { container } = renderLobby();

    const preview = container.querySelector('.room-dashboard__preview');
    expect(preview?.firstElementChild).toHaveClass('board-panel');
    const puzzle = screen.getByRole('region', { name: 'Puzzle' });
    const modePanel = screen.getByRole('group', { name: 'Word entry mode' });
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

  it('defaults to Trace, persists an explicit Tap choice, and restores Trace when cleared', async () => {
    const user = userEvent.setup();
    const first = renderLobby();

    const mode = screen.getByRole('group', { name: 'Word entry mode' });
    expect(within(mode).getByRole('button', { name: 'Tap' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(mode).getByRole('button', { name: 'Trace' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(mode).getByRole('button', { name: 'Tap' }));
    expect(window.localStorage.getItem('words:word-entry-mode')).toBe('touch');
    expect(within(mode).getByRole('button', { name: 'Tap' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    first.unmount();

    const rememberedTap = renderLobby();
    expect(screen.getByRole('button', { name: 'Tap' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    rememberedTap.unmount();

    window.localStorage.clear();
    renderLobby();
    expect(screen.getByRole('button', { name: 'Trace' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps the header mode control available through active and lobby player phases', () => {
    const activeView = renderLobby();
    expect(
      screen.getByRole('group', { name: 'Word entry mode' }),
    ).toBeVisible();
    activeView.unmount();

    const lobbyView = renderLobby(undefined, {
      room: createRoom({ phase: 'LOBBY', round: null }),
    });
    expect(
      screen.getByRole('group', { name: 'Word entry mode' }),
    ).toBeVisible();
    lobbyView.unmount();
  });

  it('keeps the phone timer markup and prominent label unchanged', () => {
    const phone = renderLobby();
    expect(screen.getByText('Timer').closest('.round-clock')).toHaveClass(
      'round-clock--phone',
    );
    expect(screen.getByRole('timer')).toHaveClass('round-clock');
    phone.unmount();
  });

  it('renders the active display Timer first in Room Highlights from the authoritative deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-31T00:00:00.000Z');
    let monotonicTime = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const room = createRoom();

    renderLobby(undefined, {
      room,
      sessionRole: 'display',
      currentPlayerId: null,
    });

    const timer = screen.getByRole('timer');
    const highlights = screen.getByRole('complementary', {
      name: 'Room Highlights',
    });
    const puzzle = screen.getByRole('region', { name: 'Puzzle' });
    expect(timer).toHaveClass('display-highlights-timer');
    expect(timer).not.toHaveClass('round-clock');
    expect(timer).toHaveAttribute('aria-live', 'off');
    expect(within(timer).getByText('Timer')).toHaveClass(
      'display-highlights-timer__label',
    );
    expect(within(timer).getByText('60')).toHaveClass(
      'display-highlights-timer__value',
    );
    expect(timer).toHaveAccessibleName('60 seconds remaining');
    expect(screen.queryByText('Time Remaining')).toBeNull();
    expect(timer).not.toHaveTextContent('seconds');
    expect(highlights.firstElementChild).toBe(timer);
    expect(puzzle).not.toContainElement(timer);
    expect(
      timer.compareDocumentPosition(
        within(highlights).getByRole('heading', { name: 'Room Highlights' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);

    act(() => {
      monotonicTime += 1_000;
      vi.advanceTimersByTime(1_000);
    });
    expect(within(timer).getByText('59')).toBeVisible();
  });

  it('shows authoritative active counts by participant ID without exposing them on phones or in the lobby', () => {
    const players = Array.from({ length: 8 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      displayName:
        index === 1
          ? 'A very long participant name'
          : `Player ${String(index + 1)}`,
      connected: index !== 2,
      joinedAt: new Date(
        Date.parse(timestamps.createdAt) + index,
      ).toISOString(),
      isController: index === 0,
    }));
    const active = createRoom();
    const participants = players.slice(0, 7).map((player) => ({
      playerId: player.id,
      displayName: player.displayName,
    }));
    const counts = [
      0,
      1,
      9,
      10,
      99,
      productConfig.maximumAcceptedWordsPerPlayerPerRound,
      2,
    ];
    const room: RoomState = {
      ...active,
      controllerPlayerId: players[0]!.id,
      players: players.filter((_player, index) => index !== 6),
      round: active.round
        ? {
            ...active.round,
            participants,
            acceptedWordCounts: participants.map((participant, index) => ({
              playerId: participant.playerId,
              count: counts[index]!,
            })),
          }
        : null,
    };
    const display = renderLobby(undefined, {
      room,
      sessionRole: 'display',
      currentPlayerId: null,
    });

    expect(screen.getByLabelText('0 accepted words')).toHaveTextContent('0');
    expect(screen.getByLabelText('1 accepted word')).toHaveTextContent('1');
    expect(screen.getByLabelText('10 accepted words')).toHaveTextContent('10');
    expect(
      screen.getByLabelText(
        `${productConfig.maximumAcceptedWordsPerPlayerPerRound} accepted words`,
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Waiting for next round')).toHaveTextContent(
      '—',
    );
    expect(screen.getByText('A very long participant name')).toHaveAttribute(
      'title',
      'A very long participant name',
    );
    expect(screen.getByLabelText('Game Host')).toBeVisible();
    expect(screen.getAllByText('Recently disconnected')).toHaveLength(2);
    expect(
      document.querySelectorAll('.display-player-list__primary'),
    ).toHaveLength(8);
    expect(screen.getByText('Player 7')).toBeVisible();
    display.unmount();

    const phone = renderLobby(undefined, { room });
    expect(document.querySelector('.display-player-list__count')).toBeNull();
    expect(screen.queryByLabelText('1 accepted word')).toBeNull();
    phone.unmount();

    renderLobby(undefined, {
      room: { ...room, phase: 'LOBBY', round: null },
      sessionRole: 'display',
      currentPlayerId: null,
    });
    expect(document.querySelector('.display-player-list__count')).toBeNull();
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

  it('keeps valid controller lobby administration outside the puzzle', () => {
    const { container } = renderLobby(undefined, {
      room: createRoom({ phase: 'LOBBY', round: null }),
    });
    const preview = container.querySelector('.room-dashboard__preview');
    const puzzle = screen.getByRole('region', { name: 'Puzzle' });
    const settings = screen.getByRole('region', { name: 'Game settings' });
    const authority = screen.getByRole('region', {
      name: 'Game host controls',
    });
    const startRound = screen.getByRole('button', { name: 'Start Round' });

    expect(startRound).toBeVisible();
    expect(startRound.closest('.round-action')).not.toBeNull();
    expect(startRound.closest('.round-action')).not.toBe(puzzle);
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
  });

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
    const duration = screen.getByRole('slider', { name: 'Round Duration' });
    expect(duration).toHaveAttribute('min', '30');
    expect(duration).toHaveAttribute('max', '180');
    expect(duration).toHaveAttribute('step', '30');
    expect(duration).toHaveAttribute('aria-valuetext', '60 seconds');
    expect(screen.getByText('60s')).toBeVisible();
    expect(screen.queryByText('30', { exact: true })).toBeNull();
    expect(screen.queryByText('180', { exact: true })).toBeNull();
    lobbyView.unmount();

    renderLobby(undefined, {
      room: createRoom({ phase: 'ROUND_ENDED' }),
    });
    expect(screen.getByRole('region', { name: 'Round summary' })).toBeVisible();
    expect(screen.getByText('Look at the TV!')).toBeVisible();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Word entry mode' })).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Game host controls' }),
    ).toBeNull();
    expect(screen.queryByRole('region', { name: 'Game settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start Round' })).toBeNull();
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

  it('replaces an ended phone puzzle with a round summary and restores the lobby cleanly', () => {
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

    const view = renderLobby(undefined, {
      room,
      currentPlayerId: ordinaryPlayerId,
    });

    expect(screen.getByRole('region', { name: 'Round summary' })).toBeVisible();
    expect(screen.getByText('Look at the TV!')).toBeVisible();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Word entry mode' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Game settings' })).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Game host controls' }),
    ).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();

    view.rerender(
      <RoomLobby
        {...lobbyProps(undefined, {
          room: createRoom({ phase: 'LOBBY', round: null }),
          currentPlayerId: ordinaryPlayerId,
        })}
      />,
    );
    expect(screen.getByRole('region', { name: 'Puzzle' })).toBeVisible();
    expect(
      screen.getByRole('group', { name: 'Word entry mode' }),
    ).toBeVisible();
  });

  it('keeps finalized result cards and the footer on the display', () => {
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

    expect(
      screen.getByRole('heading', { name: 'Round Results' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: /Bright Fox/ })).toBeVisible();
    expect(screen.getByText('4 points')).toBeVisible();
    const joinLink = screen.getByRole('link', {
      name: 'http://localhost:3000/join/ABC234',
    });
    expect(joinLink).toBeVisible();
    expect(joinLink).toHaveAttribute(
      'href',
      'http://localhost:3000/join/ABC234',
    );
    expect(joinLink).toHaveAttribute('target', '_blank');
    expect(joinLink).toHaveAttribute('rel', 'noreferrer');
    expect(screen.queryByRole('region', { name: 'Puzzle' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Players' })).toBeNull();
    expect(
      screen.queryByRole('complementary', { name: 'Room Highlights' }),
    ).toBeNull();
    expect(screen.queryByLabelText('Room joining QR code')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Game settings' })).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Game host controls' }),
    ).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('keeps the authoritative join link in lobby and active display phases', () => {
    const joinUrl = 'http://localhost:3000/join/ABC234';

    for (const room of [
      createRoom({ phase: 'LOBBY', round: null }),
      createRoom({ phase: 'ROUND_ACTIVE' }),
    ]) {
      const view = renderLobby(undefined, {
        room,
        sessionRole: 'display',
        currentPlayerId: null,
      });
      const joinLink = screen.getByRole('link', { name: joinUrl });

      expect(joinLink).toBeVisible();
      expect(joinLink).toHaveAttribute('href', joinUrl);
      expect(joinLink).toHaveAttribute('target', '_blank');
      expect(joinLink).toHaveAttribute('rel', 'noreferrer');
      expect(screen.queryByRole('timer')).toBe(
        room.phase === 'LOBBY' ? null : screen.getByRole('timer'),
      );
      view.unmount();
    }
  });

  it('keeps display grids free of player accepted feedback and omits the Room Record round label', () => {
    const displayRoom = createRoom({
      phase: 'LOBBY',
      round: null,
      highlights: {
        lastRound: null,
        roomRecord: {
          roundNumber: 7,
          holders: [{ playerId, displayName: 'Bright Fox' }],
          score: 12,
        },
      },
    });
    const { container } = renderLobby(undefined, {
      room: displayRoom,
      sessionRole: 'display',
      currentPlayerId: null,
    });

    expect(container.querySelectorAll('.letter-tile--accepted')).toHaveLength(
      0,
    );
    const roomRecord = screen
      .getByRole('heading', { name: 'Room Record' })
      .closest('section');
    expect(roomRecord).toHaveTextContent('Bright Fox');
    expect(roomRecord).toHaveTextContent('12 points');
    expect(roomRecord).not.toHaveTextContent('Round 7');
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

  it('keeps the permanent compact feedback line between the candidate and Submit', async () => {
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
    const feedback = screen.getByRole('status');
    expect(wordContent).toContainElement(
      screen.getByRole('heading', { name: 'ABC' }),
    );
    expect(wordEntry?.querySelector('.word-entry__actions')).toContainElement(
      submit,
    );
    expect(feedback).toBeEmptyDOMElement();
    expect(wordContent).not.toBeNull();
    if (!wordContent) {
      throw new Error('Word entry content was not rendered.');
    }
    expect(
      wordContent.compareDocumentPosition(feedback) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      feedback.compareDocumentPosition(submit) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    await user.click(submit);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Not in dictionary.',
    );
    expect(
      screen.getByRole('status').compareDocumentPosition(submit) &
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

  it('keeps a submitted path selected while pending, then flashes only an accepted response', async () => {
    vi.useFakeTimers();
    const response = deferred<SubmitWordResponse>();
    renderLobby(() => response.promise);

    for (const tile of tileButtons().slice(0, 3)) {
      fireEvent.click(tile);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    for (const tile of tileButtons().slice(0, 3)) {
      expect(tile).toHaveClass('letter-tile--selected');
      expect(tile).not.toHaveClass('letter-tile--accepted');
    }

    await act(async () => {
      response.resolve(acceptedSubmission());
      await response.promise;
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'ABC accepted for 3 points.',
    );
    expect(
      screen.getByRole('heading', { name: 'Select adjacent tiles' }),
    ).toBeVisible();
    for (const tile of tileButtons().slice(0, 3)) {
      expect(tile).toHaveClass('letter-tile--accepted');
      expect(tile).not.toHaveClass('letter-tile--selected');
    }

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(
      screen.getByRole('grid').querySelectorAll('.letter-tile--accepted'),
    ).toHaveLength(0);
  });

  it('clears accepted feedback on phase changes and ignores a stale round response', async () => {
    vi.useFakeTimers();
    const activeRoom = createRoom();
    const firstView = renderLobby(async () => acceptedSubmission(), {
      room: activeRoom,
    });
    for (const tile of tileButtons().slice(0, 3)) {
      fireEvent.click(tile);
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    });
    expect(
      screen.getByRole('grid').querySelectorAll('.letter-tile--accepted'),
    ).toHaveLength(3);

    firstView.rerender(
      <RoomLobby
        {...lobbyProps(async () => acceptedSubmission(), {
          room: { ...activeRoom, phase: 'ROUND_ENDED' },
        })}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByRole('region', { name: 'Round summary' })).toBeVisible();
    firstView.unmount();

    const response = deferred<SubmitWordResponse>();
    const staleView = renderLobby(() => response.promise, { room: activeRoom });
    for (const tile of tileButtons().slice(0, 3)) {
      fireEvent.click(tile);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    const nextRound = {
      ...activeRoom.round!,
      id: '00000000-0000-4000-8000-000000000011',
      number: 2,
    };
    staleView.rerender(
      <RoomLobby
        {...lobbyProps(() => response.promise, {
          room: { ...activeRoom, round: nextRound },
        })}
      />,
    );
    await act(async () => {
      response.resolve(acceptedSubmission());
      await response.promise;
    });

    expect(
      screen.getByRole('grid').querySelectorAll('.letter-tile--accepted'),
    ).toHaveLength(0);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('replaces accepted feedback and clears it when a player starts another word or changes entry mode', async () => {
    vi.useFakeTimers();
    const responses = [acceptedSubmission('ABC'), acceptedSubmission('EFG')];
    const onSubmitWord = vi.fn(async (): Promise<SubmitWordResponse> =>
      responses.shift()!,
    );
    renderLobby(onSubmitWord);

    for (const tile of tileButtons().slice(0, 3)) {
      fireEvent.click(tile);
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    });
    expect(
      screen.getByRole('grid').querySelectorAll('.letter-tile--accepted'),
    ).toHaveLength(3);

    fireEvent.click(tileButtons()[4]!);
    expect(
      screen.getByRole('grid').querySelectorAll('.letter-tile--accepted'),
    ).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Trace' }));
    expect(
      screen.getByRole('grid').querySelectorAll('.letter-tile--accepted'),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Tap' }));
    for (const tile of [
      tileButtons()[4]!,
      tileButtons()[5]!,
      tileButtons()[6]!,
    ]) {
      fireEvent.click(tile);
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    });

    const acceptedIndexes = Array.from(
      screen.getByRole('grid').querySelectorAll('.letter-tile--accepted'),
    ).map((tile) => tile.getAttribute('data-tile-index'));
    expect(acceptedIndexes).toEqual(['4', '5', '6']);
  });

  it('never adds accepted styling for rejected or failed submissions', async () => {
    vi.useFakeTimers();
    const rejected = renderLobby(async () => ({
      ok: false,
      error: { code: 'WORD_NOT_IN_DICTIONARY', message: 'Not in dictionary.' },
      state: createSubmissionState(),
    }));
    for (const tile of tileButtons().slice(0, 3)) {
      fireEvent.click(tile);
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Not in dictionary.');
    expect(
      screen.getByRole('grid').querySelectorAll('.letter-tile--accepted'),
    ).toHaveLength(0);
    rejected.unmount();

    renderLobby(async () => {
      throw new Error('offline');
    });
    for (const tile of tileButtons().slice(0, 3)) {
      fireEvent.click(tile);
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Could not submit that word. Try again.',
    );
    expect(
      screen.getByRole('grid').querySelectorAll('.letter-tile--accepted'),
    ).toHaveLength(0);
  });

  it('uses the same accepted feedback for a Trace submission', async () => {
    vi.useFakeTimers();
    renderLobby(async () => acceptedSubmission());
    fireEvent.click(screen.getByRole('button', { name: 'Trace' }));
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
      pointerId: 11,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(grid, {
      clientX: 150,
      clientY: 50,
      pointerId: 11,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(grid, {
      clientX: 250,
      clientY: 50,
      pointerId: 11,
      pointerType: 'mouse',
    });
    await act(async () => {
      fireEvent.pointerUp(grid, {
        clientX: 250,
        clientY: 50,
        pointerId: 11,
        pointerType: 'mouse',
      });
    });

    expect(
      screen.getByRole('grid').querySelectorAll('.letter-tile--accepted'),
    ).toHaveLength(3);
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
