import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEmptyRoomHighlights,
  type RoomState,
  type SubmitWordResponse,
} from '@words/shared';

const renderMetrics = vi.hoisted(() => ({ letterGrid: 0 }));

vi.mock('./LetterGrid', async (importOriginal) => {
  const original = await importOriginal<typeof import('./LetterGrid')>();
  const { memo } = await import('react');
  return {
    ...original,
    LetterGrid: memo(
      (props: React.ComponentProps<typeof original.LetterGrid>) => {
        renderMetrics.letterGrid += 1;
        return <original.LetterGrid {...props} />;
      },
    ),
  };
});

import { RoomLobby } from './RoomLobby';

const playerId = '00000000-0000-4000-8000-000000000001';
const roundId = '00000000-0000-4000-8000-000000000010';

function createRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: 'ABC234',
    phase: 'ROUND_ACTIVE',
    stateVersion: 1,
    serverTime: '2026-07-31T00:00:00.000Z',
    createdAt: '2026-07-31T00:00:00.000Z',
    lastActivityAt: '2026-07-31T00:00:00.000Z',
    expiresAt: '2026-07-31T02:00:00.000Z',
    maxPlayers: 8,
    highlights: createEmptyRoomHighlights(),
    display: { connected: true, createdAt: '2026-07-31T00:00:00.000Z' },
    controllerStatus: 'assigned',
    controllerPlayerId: playerId,
    players: [
      {
        id: playerId,
        displayName: 'Bright Fox',
        connected: true,
        joinedAt: '2026-07-31T00:00:00.000Z',
        isController: true,
      },
    ],
    settings: {
      gridSize: 4,
      roundDurationSeconds: 120,
      scoringMode: 'length-plus-unique',
    },
    round: {
      id: roundId,
      number: 1,
      settings: {
        gridSize: 4,
        roundDurationSeconds: 120,
        scoringMode: 'length-plus-unique',
      },
      board: {
        size: 4,
        tiles: Array.from({ length: 16 }, (_, index) =>
          String.fromCharCode(65 + index),
        ),
      },
      participants: [{ playerId, displayName: 'Bright Fox' }],
      acceptedWordCounts: [{ playerId, count: 0 }],
      startedAt: '2026-07-31T00:00:00.000Z',
      deadlineAt: '2026-07-31T00:02:00.000Z',
      endedAt: null,
      results: null,
      generationAttempts: 1,
    },
    ...overrides,
  };
}

function props(
  room = createRoom(),
  onSubmitWord = vi.fn(async (): Promise<SubmitWordResponse> => ({
    ok: false,
    error: { code: 'WORD_TOO_SHORT', message: 'Choose more tiles.' },
    state: null,
  })),
) {
  return {
    room,
    sessionRole: 'player' as const,
    currentPlayerId: playerId,
    connectionStatus: 'connected' as const,
    onTransferController: async () => null,
    onUpdateSettings: async () => null,
    onStartRound: async () => null,
    submissionState: null,
    onSubmitWord,
    entryMode: 'trace' as const,
    onEntryModeChange: vi.fn(),
  };
}

let monotonicTime: number;

beforeEach(() => {
  vi.useFakeTimers();
  monotonicTime = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
  renderMetrics.letterGrid = 0;
  const slot = document.createElement('div');
  slot.id = 'phone-entry-mode-slot';
  document.body.append(slot);
});

afterEach(() => {
  document.getElementById('phone-entry-mode-slot')?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RoomLobby runtime isolation', () => {
  it('does not rerender LetterGrid for visible countdown changes', () => {
    render(<RoomLobby {...props()} />);
    const initialGridRenders = renderMetrics.letterGrid;
    expect(screen.getByText('120 seconds')).toBeVisible();

    for (let second = 0; second < 20; second += 1) {
      act(() => {
        monotonicTime += 1_000;
        vi.advanceTimersByTime(1_000);
      });
    }

    expect(screen.getByText('100 seconds')).toBeVisible();
    expect(renderMetrics.letterGrid).toBe(initialGridRenders);
  });

  it('does not rerender the phone LetterGrid for a count-only room update', () => {
    const room = createRoom();
    const stableProps = props(room);
    const view = render(<RoomLobby {...stableProps} />);
    const initialGridRenders = renderMetrics.letterGrid;
    const updated: RoomState = {
      ...room,
      stateVersion: room.stateVersion + 1,
      round: room.round
        ? {
            ...room.round,
            acceptedWordCounts: [{ playerId, count: 1 }],
          }
        : null,
    };

    view.rerender(<RoomLobby {...stableProps} room={updated} />);

    expect(renderMetrics.letterGrid).toBe(initialGridRenders);
  });

  it('rerenders the grid immediately for selection and authoritative board changes', () => {
    const room = createRoom();
    const view = render(<RoomLobby {...props(room)} />);
    const initialGridRenders = renderMetrics.letterGrid;
    fireEvent.click(screen.getByRole('button', { name: 'A, tile 1' }));
    expect(renderMetrics.letterGrid).toBeGreaterThan(initialGridRenders);

    const afterSelection = renderMetrics.letterGrid;
    const replacement = createRoom({
      stateVersion: 2,
      round: room.round
        ? {
            ...room.round,
            id: '00000000-0000-4000-8000-000000000020',
            board: {
              ...room.round.board,
              tiles: ['Z', ...room.round.board.tiles.slice(1)],
            },
          }
        : null,
    });
    view.rerender(<RoomLobby {...props(replacement)} />);
    expect(screen.getByRole('button', { name: 'Z, tile 1' })).toBeVisible();
    expect(renderMetrics.letterGrid).toBeGreaterThan(afterSelection);
  });

  it('renders accepted feedback immediately without waiting for timer work', async () => {
    const onSubmitWord = vi.fn(async (): Promise<SubmitWordResponse> => ({
      ok: true,
      acceptedWord: {
        sequence: 1,
        word: 'ABC',
        points: 3,
        acceptedAt: '2026-07-31T00:00:10.000Z',
      },
      state: {
        roundId,
        playerId,
        submissionVersion: 1,
        acceptedWords: [
          {
            sequence: 1,
            word: 'ABC',
            points: 3,
            acceptedAt: '2026-07-31T00:00:10.000Z',
          },
        ],
        provisionalScore: 3,
      },
    }));
    render(<RoomLobby {...props(createRoom(), onSubmitWord)} />);
    const grid = screen.getByRole('grid');
    const tiles = within(grid).getAllByRole('button');
    fireEvent.click(tiles[0]!);
    fireEvent.click(tiles[1]!);
    fireEvent.click(tiles[2]!);
    const beforeSubmission = renderMetrics.letterGrid;
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await act(async () => Promise.resolve());

    expect(grid.querySelectorAll('.letter-tile--accepted')).toHaveLength(3);
    expect(renderMetrics.letterGrid).toBeGreaterThan(beforeSubmission);
  });

  it('commits the broad puzzle only once when the local deadline disables input', () => {
    render(<RoomLobby {...props()} />);
    const initialGridRenders = renderMetrics.letterGrid;
    act(() => {
      monotonicTime += 120_000;
      vi.advanceTimersByTime(120_000);
    });
    expect(screen.getByRole('button', { name: 'A, tile 1' })).toBeDisabled();
    expect(renderMetrics.letterGrid).toBe(initialGridRenders + 1);
  });
});
