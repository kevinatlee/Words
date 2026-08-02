import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyRoomHighlights, type RoomState } from '@words/shared';

import type { DisplayAudioStatus } from '../audio/display-audio';

const audio = vi.hoisted(() => {
  let listener: ((status: DisplayAudioStatus) => void) | null = null;
  let nextStatus: DisplayAudioStatus = 'running';
  const enable = vi.fn(async () => {
    listener?.(nextStatus);
    return nextStatus;
  });
  const playAccepted = vi.fn();
  const playWinnerTune = vi.fn();
  const cancelAcceptedTones = vi.fn();
  const dispose = vi.fn(async () => undefined);
  const subscribe = vi.fn((next: (status: DisplayAudioStatus) => void) => {
    listener = next;
    next('checking');
    return () => {
      if (listener === next) listener = null;
    };
  });
  const Constructor = vi.fn(function DisplayAudioEngineMock() {
    return {
      enable,
      subscribe,
      playAccepted,
      playWinnerTune,
      cancelAcceptedTones,
      dispose,
    };
  });
  return {
    Constructor,
    enable,
    subscribe,
    playAccepted,
    playWinnerTune,
    cancelAcceptedTones,
    dispose,
    setNextStatus(status: DisplayAudioStatus) {
      nextStatus = status;
    },
    emitStatus(status: DisplayAudioStatus) {
      listener?.(status);
    },
    reset() {
      listener = null;
      nextStatus = 'running';
    },
  };
});

vi.mock('../audio/display-audio', () => ({
  DisplayAudioEngine: audio.Constructor,
}));

import { useDisplayAudio } from './useDisplayAudio';

const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';

function activeRoom(
  firstCount = 0,
  secondCount = 0,
  roundId = '00000000-0000-4000-8000-000000000010',
): RoomState {
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
      id: roundId,
      number: roundId.endsWith('10') ? 1 : 2,
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

function lobbyRoom(round: RoomState['round'] = null): RoomState {
  const active = activeRoom();
  return {
    ...active,
    phase: 'LOBBY',
    round,
    stateVersion: active.stateVersion + 1,
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
  room: RoomState | null;
  isDisplay?: boolean;
}) {
  const sound = useDisplayAudio(room, isDisplay);
  return (
    <div>
      <output>{sound.status}</output>
      {sound.showControl && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void sound.enable();
          }}
        >
          Enable sound
        </button>
      )}
    </div>
  );
}

let originalVisibility: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  audio.reset();
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

async function flushAudio() {
  await act(async () => Promise.resolve());
}

describe('useDisplayAudio', () => {
  it('arms immediately on display startup but never creates an engine for phones', async () => {
    const phone = render(<Harness room={activeRoom()} isDisplay={false} />);
    expect(audio.Constructor).not.toHaveBeenCalled();
    phone.unmount();

    render(<Harness room={activeRoom()} />);
    await flushAudio();
    expect(audio.Constructor).toHaveBeenCalledOnce();
    expect(audio.enable).toHaveBeenCalledOnce();
    expect(screen.getByText('running')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enable sound' })).toBeNull();
  });

  it('shows blocked startup and retries every pointer, click, key, and fallback action', async () => {
    audio.setNextStatus('blocked');
    render(<Harness room={activeRoom()} />);
    await flushAudio();
    expect(screen.getByRole('button', { name: 'Enable sound' })).toBeVisible();

    fireEvent.pointerDown(window);
    fireEvent.click(window);
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Enable sound' }));
    await flushAudio();
    expect(audio.enable).toHaveBeenCalledTimes(5);
    expect(screen.getByRole('button', { name: 'Enable sound' })).toBeVisible();

    audio.setNextStatus('running');
    fireEvent.pointerDown(window);
    await flushAudio();
    expect(screen.queryByRole('button', { name: 'Enable sound' })).toBeNull();
  });

  it('preserves one engine across lobby, active, results, lobby, and later rounds', async () => {
    const view = render(<Harness room={lobbyRoom()} />);
    await flushAudio();
    view.rerender(<Harness room={activeRoom()} />);
    view.rerender(<Harness room={endedRoom()} />);
    view.rerender(<Harness room={lobbyRoom()} />);
    view.rerender(
      <Harness
        room={activeRoom(0, 0, '00000000-0000-4000-8000-000000000011')}
      />,
    );

    expect(audio.Constructor).toHaveBeenCalledOnce();
    expect(audio.dispose).not.toHaveBeenCalled();
    expect(audio.playWinnerTune).toHaveBeenCalledOnce();
    expect(audio.cancelAcceptedTones).toHaveBeenCalled();
  });

  it('plays one immutable-order indication per participant increase without backlog', async () => {
    const view = render(<Harness room={activeRoom()} />);
    await flushAudio();
    view.rerender(<Harness room={activeRoom(3, 1)} />);
    expect(audio.playAccepted.mock.calls).toEqual([
      [0, 0],
      [1, 0.09],
    ]);
    view.rerender(<Harness room={activeRoom(3, 1)} />);
    expect(audio.playAccepted).toHaveBeenCalledTimes(2);
  });

  it('shows suspension, resumes on visibility or interaction, and never replays hidden changes', async () => {
    const view = render(<Harness room={activeRoom()} />);
    await flushAudio();
    act(() => audio.emitStatus('suspended'));
    expect(screen.getByRole('button', { name: 'Enable sound' })).toBeVisible();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    fireEvent(document, new Event('visibilitychange'));
    view.rerender(<Harness room={activeRoom(2, 1)} />);
    expect(audio.playAccepted).not.toHaveBeenCalled();

    audio.setNextStatus('running');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    fireEvent(document, new Event('visibilitychange'));
    await flushAudio();
    expect(screen.queryByRole('button', { name: 'Enable sound' })).toBeNull();
    expect(audio.playAccepted).not.toHaveBeenCalled();
  });

  it('plays one positive live winner tune, including ties, but never delayed or zero tunes', async () => {
    const view = render(<Harness room={activeRoom(1, 1)} />);
    await flushAudio();
    const tied = endedRoom();
    if (!tied.round?.results) throw new Error('Expected results.');
    view.rerender(
      <Harness
        room={{
          ...tied,
          round: {
            ...tied.round,
            results: {
              ...tied.round.results,
              winnerPlayerIds: [firstId, secondId],
            },
          },
        }}
      />,
    );
    expect(audio.playWinnerTune).toHaveBeenCalledOnce();
    view.rerender(<Harness room={{ ...tied, stateVersion: 99 }} />);
    expect(audio.playWinnerTune).toHaveBeenCalledOnce();

    view.unmount();
    vi.clearAllMocks();
    audio.reset();
    const zero = render(<Harness room={activeRoom()} />);
    await flushAudio();
    zero.rerender(<Harness room={endedRoom({ winner: false })} />);
    expect(audio.playWinnerTune).not.toHaveBeenCalled();
  });

  it('keeps direct active/ended hydration and enablement silent', async () => {
    audio.setNextStatus('blocked');
    const active = render(<Harness room={activeRoom(4, 2)} />);
    await flushAudio();
    audio.setNextStatus('running');
    fireEvent.click(screen.getByRole('button', { name: 'Enable sound' }));
    await flushAudio();
    expect(audio.playAccepted).not.toHaveBeenCalled();
    active.unmount();

    vi.clearAllMocks();
    audio.reset();
    render(<Harness room={endedRoom()} />);
    await flushAudio();
    expect(audio.playWinnerTune).not.toHaveBeenCalled();
  });

  it('disposes once only when the display session ends and removes subscriptions', async () => {
    const view = render(<Harness room={activeRoom()} />);
    await flushAudio();
    view.rerender(<Harness room={null} isDisplay={false} />);
    await flushAudio();
    expect(audio.dispose).toHaveBeenCalledOnce();
    expect(audio.subscribe.mock.results[0]?.value).toBeTypeOf('function');
    view.unmount();
    expect(audio.dispose).toHaveBeenCalledOnce();
  });
});
