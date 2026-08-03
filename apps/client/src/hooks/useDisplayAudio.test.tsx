import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyRoomHighlights, type RoomState } from '@words/shared';

const audio = vi.hoisted(() => {
  let enableResult = true;
  const enable = vi.fn(async () => enableResult);
  const playAccepted = vi.fn();
  const playWinnerTune = vi.fn();
  const cancelAcceptedTones = vi.fn();
  const dispose = vi.fn(async () => undefined);
  const Constructor = vi.fn(function DisplayAudioEngineMock() {
    return {
      enable,
      playAccepted,
      playWinnerTune,
      cancelAcceptedTones,
      dispose,
    };
  });
  return {
    Constructor,
    enable,
    playAccepted,
    playWinnerTune,
    cancelAcceptedTones,
    dispose,
    setEnableResult: (value: boolean) => {
      enableResult = value;
    },
  };
});

vi.mock('../audio/display-audio', () => ({
  DisplayAudioEngine: Object.assign(audio.Constructor, { isSupported: true }),
}));

import { useDisplayAudio } from './useDisplayAudio';

const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';

function activeRoom(firstCount = 0, secondCount = 0): RoomState {
  return {
    code: 'ABC234',
    phase: 'ROUND_ACTIVE',
    stateVersion: firstCount + secondCount + 1,
    serverTime: '2026-08-02T00:00:00.000Z',
    createdAt: '2026-08-02T00:00:00.000Z',
    lastActivityAt: '2026-08-02T00:00:00.000Z',
    expiresAt: '2026-08-02T02:00:00.000Z',
    maxPlayers: 8,
    highlights: createEmptyRoomHighlights(),
    display: { connected: true, createdAt: '2026-08-02T00:00:00.000Z' },
    controllerStatus: 'assigned',
    controllerPlayerId: firstId,
    players: [
      {
        id: firstId,
        displayName: 'Bright Fox',
        connected: true,
        joinedAt: '2026-08-02T00:00:00.000Z',
        isController: true,
      },
      {
        id: secondId,
        displayName: 'Amber Kite',
        connected: true,
        joinedAt: '2026-08-02T00:00:01.000Z',
        isController: false,
      },
    ],
    settings: {
      gridSize: 4,
      roundDurationSeconds: 120,
      scoringMode: 'length-plus-unique',
    },
    round: {
      id: '00000000-0000-4000-8000-000000000010',
      number: 1,
      settings: {
        gridSize: 4,
        roundDurationSeconds: 120,
        scoringMode: 'length-plus-unique',
      },
      board: { size: 4, tiles: Array.from({ length: 16 }, () => 'A') },
      participants: [
        { playerId: firstId, displayName: 'Bright Fox' },
        { playerId: secondId, displayName: 'Amber Kite' },
      ],
      acceptedWordCounts: [
        { playerId: firstId, count: firstCount },
        { playerId: secondId, count: secondCount },
      ],
      startedAt: '2026-08-02T00:00:00.000Z',
      deadlineAt: '2026-08-02T00:02:00.000Z',
      endedAt: null,
      results: null,
      generationAttempts: 1,
    },
  };
}

function endedRoom({ winner = true }: { winner?: boolean } = {}): RoomState {
  const active = activeRoom(1, 0);
  return {
    ...active,
    phase: 'ROUND_ENDED',
    stateVersion: active.stateVersion + 1,
    round: active.round
      ? {
          ...active.round,
          endedAt: active.round.deadlineAt,
          results: {
            players: [
              {
                playerId: firstId,
                displayName: 'Bright Fox',
                rank: 1,
                baseScore: winner ? 3 : 0,
                uniqueBonusScore: winner ? 1 : 0,
                finalScore: winner ? 4 : 0,
                words: winner
                  ? [
                      {
                        word: 'CAT',
                        basePoints: 3,
                        shared: false,
                        uniqueBonusPoints: 1,
                        finalPoints: 4,
                      },
                    ]
                  : [],
              },
              {
                playerId: secondId,
                displayName: 'Amber Kite',
                rank: winner ? 2 : 1,
                baseScore: 0,
                uniqueBonusScore: 0,
                finalScore: 0,
                words: [],
              },
            ],
            winnerPlayerIds: winner ? [firstId] : [],
          },
        }
      : null,
  };
}

function Harness({
  room,
  isDisplay = true,
}: {
  room: RoomState;
  isDisplay?: boolean;
}) {
  const sound = useDisplayAudio(room, isDisplay);
  void sound;
  return <div data-testid="audio-harness" />;
}

let originalVisibility: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  audio.setEnableResult(true);
  originalVisibility = Object.getOwnPropertyDescriptor(
    document,
    'visibilityState',
  );
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
});

afterEach(() => {
  if (originalVisibility) {
    Object.defineProperty(document, 'visibilityState', originalVisibility);
  }
});

async function enableSound() {
  await act(async () => Promise.resolve());
  fireEvent.pointerDown(window);
  await act(async () => Promise.resolve());
}

describe('useDisplayAudio', () => {
  it('never creates an AudioContext engine for phone sessions', () => {
    render(<Harness room={activeRoom()} isDisplay={false} />);
    fireEvent.pointerDown(window);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(audio.Constructor).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    ['lobby', { ...activeRoom(), phase: 'LOBBY' as const, round: null }],
    ['active play', activeRoom()],
    ['results', endedRoom()],
  ])('has no visible sound control during %s', (_phase, room) => {
    render(<Harness room={room} />);
    expect(screen.queryByText(/enable sound/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not replay hydration or enablement counts and creates one display engine', async () => {
    const view = render(<Harness room={activeRoom(4, 2)} />);
    expect(audio.Constructor).toHaveBeenCalledOnce();
    expect(audio.playAccepted).not.toHaveBeenCalled();
    await enableSound();
    view.rerender(<Harness room={activeRoom(4, 2)} />);
    expect(audio.Constructor).toHaveBeenCalledTimes(1);
    expect(audio.playAccepted).not.toHaveBeenCalled();
  });

  it('plays one stable participant tone per increase and staggers simultaneous deltas', async () => {
    const view = render(<Harness room={activeRoom()} />);
    await enableSound();

    view.rerender(<Harness room={activeRoom(3, 1)} />);
    expect(audio.playAccepted.mock.calls).toEqual([
      [0, 0],
      [1, 0.06],
    ]);
    view.rerender(<Harness room={activeRoom(3, 1)} />);
    expect(audio.playAccepted).toHaveBeenCalledTimes(2);
  });

  it('creates no hidden backlog and resumes from the visible baseline', async () => {
    const view = render(<Harness room={activeRoom()} />);
    await enableSound();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    fireEvent(document, new Event('visibilitychange'));
    view.rerender(<Harness room={activeRoom(2, 1)} />);
    expect(audio.playAccepted).not.toHaveBeenCalled();
    expect(audio.cancelAcceptedTones).toHaveBeenCalledOnce();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    fireEvent(document, new Event('visibilitychange'));
    view.rerender(<Harness room={activeRoom(3, 1)} />);
    expect(audio.playAccepted).toHaveBeenCalledWith(0, 0);
    expect(audio.playAccepted).toHaveBeenCalledTimes(1);
  });

  it('plays one winner tune only for a live positive active-to-ended transition', async () => {
    const view = render(<Harness room={activeRoom(1, 0)} />);
    await enableSound();
    view.rerender(<Harness room={endedRoom()} />);
    expect(audio.cancelAcceptedTones).toHaveBeenCalledOnce();
    expect(audio.playWinnerTune).toHaveBeenCalledWith(0);
    expect(audio.playWinnerTune).toHaveBeenCalledOnce();

    view.rerender(<Harness room={{ ...endedRoom(), stateVersion: 99 }} />);
    expect(audio.playWinnerTune).toHaveBeenCalledOnce();
  });

  it('plays one tune for tied winners and cancels stale tones when a round changes', async () => {
    const firstRound = activeRoom(1, 1);
    const view = render(<Harness room={firstRound} />);
    await enableSound();
    const tiedEnded = endedRoom();
    if (!tiedEnded.round?.results) throw new Error('Expected ended results.');
    const tied: RoomState = {
      ...tiedEnded,
      round: {
        ...tiedEnded.round,
        results: {
          ...tiedEnded.round.results,
          players: tiedEnded.round.results.players.map((player) => ({
            ...player,
            rank: 1,
            baseScore: 3,
            uniqueBonusScore: 1,
            finalScore: 4,
            words: [
              {
                word: 'CAT',
                basePoints: 3,
                shared: false,
                uniqueBonusPoints: 1,
                finalPoints: 4,
              },
            ],
          })),
          winnerPlayerIds: [firstId, secondId],
        },
      },
    };
    view.rerender(<Harness room={tied} />);
    expect(audio.playWinnerTune).toHaveBeenCalledOnce();

    const nextRound = activeRoom();
    view.rerender(
      <Harness
        room={{
          ...nextRound,
          round: nextRound.round
            ? {
                ...nextRound.round,
                id: '00000000-0000-4000-8000-000000000011',
                number: 2,
              }
            : null,
        }}
      />,
    );
    expect(audio.cancelAcceptedTones).toHaveBeenCalledTimes(2);
    expect(audio.playAccepted).not.toHaveBeenCalled();
  });

  it('does not celebrate zero results or direct hydration into an ended round', async () => {
    const direct = render(<Harness room={endedRoom()} />);
    await enableSound();
    expect(audio.playWinnerTune).not.toHaveBeenCalled();
    direct.unmount();
    vi.clearAllMocks();

    const transition = render(<Harness room={activeRoom()} />);
    await enableSound();
    transition.rerender(<Harness room={endedRoom({ winner: false })} />);
    expect(audio.playWinnerTune).not.toHaveBeenCalled();
    expect(audio.cancelAcceptedTones).toHaveBeenCalledOnce();
  });

  it('enables from the first display interaction and disposes safely', async () => {
    const view = render(<Harness room={activeRoom()} />);
    fireEvent.pointerDown(window);
    await act(async () => Promise.resolve());
    expect(audio.enable).toHaveBeenCalled();
    view.unmount();
    expect(audio.dispose).toHaveBeenCalledOnce();
  });

  it('retries a blocked context after pointer and keyboard interaction', async () => {
    audio.setEnableResult(false);
    render(<Harness room={activeRoom()} />);
    await act(async () => Promise.resolve());
    const automaticAttempts = audio.enable.mock.calls.length;

    fireEvent.pointerDown(window);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(audio.enable.mock.calls.length).toBeGreaterThan(automaticAttempts);
  });

  it('keeps one display engine through lobby, results, and a later round', async () => {
    const lobby: RoomState = { ...activeRoom(), phase: 'LOBBY', round: null };
    const view = render(<Harness room={lobby} />);
    await act(async () => Promise.resolve());

    view.rerender(<Harness room={activeRoom()} />);
    view.rerender(<Harness room={endedRoom()} />);
    view.rerender(<Harness room={lobby} />);
    const laterRound = activeRoom();
    view.rerender(
      <Harness
        room={{
          ...laterRound,
          round: laterRound.round
            ? {
                ...laterRound.round,
                id: '00000000-0000-4000-8000-000000000011',
              }
            : null,
        }}
      />,
    );

    expect(audio.Constructor).toHaveBeenCalledOnce();
    view.unmount();
    expect(audio.dispose).toHaveBeenCalledOnce();
  });
});
