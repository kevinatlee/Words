import { useCallback, useEffect, useRef, useState } from 'react';

import type { RoomState } from '@words/shared';

import { DisplayAudioEngine } from '../audio/display-audio';

type TrackedRoom = {
  roundId: string | null;
  phase: RoomState['phase'];
  counts: Map<string, number>;
};

function trackedRoom(room: RoomState): TrackedRoom {
  return {
    roundId: room.round?.id ?? null,
    phase: room.phase,
    counts: new Map(
      room.round?.acceptedWordCounts.map((entry) => [
        entry.playerId,
        entry.count,
      ]) ?? [],
    ),
  };
}

export type DisplayAudioState = Readonly<{
  enabled: boolean;
  supported: boolean;
  enable: () => Promise<void>;
}>;

export function useDisplayAudio(
  room: RoomState | null,
  isDisplay: boolean,
): DisplayAudioState {
  const [enabled, setEnabled] = useState(false);
  const [supported] = useState(() => DisplayAudioEngine.isSupported);
  const engineRef = useRef<DisplayAudioEngine | null>(null);
  const previousRef = useRef<TrackedRoom | null>(null);
  const roomRef = useRef<RoomState | null>(room);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const enable = useCallback(async () => {
    if (!isDisplay || !supported) return;
    engineRef.current ??= new DisplayAudioEngine();
    if (await engineRef.current.enable()) setEnabled(true);
  }, [isDisplay, supported]);

  useEffect(() => {
    if (!isDisplay || !supported) return;
    void enable();
  }, [enable, isDisplay, supported]);

  useEffect(() => {
    if (!isDisplay || enabled) return;
    const attempt = () => void enable();
    window.addEventListener('pointerdown', attempt, { once: true });
    window.addEventListener('keydown', attempt, { once: true });
    return () => {
      window.removeEventListener('pointerdown', attempt);
      window.removeEventListener('keydown', attempt);
    };
  }, [enable, enabled, isDisplay, supported]);

  useEffect(() => {
    if (!isDisplay || !room) return;
    const current = trackedRoom(room);
    const previous = previousRef.current;
    previousRef.current = current;
    if (!previous || document.visibilityState === 'hidden') return;
    if (previous.roundId !== current.roundId) {
      engineRef.current?.cancelAcceptedTones();
    }
    if (
      enabled &&
      previous.phase === 'ROUND_ACTIVE' &&
      current.phase === 'ROUND_ACTIVE' &&
      previous.roundId === current.roundId &&
      room.round
    ) {
      let deltaOrder = 0;
      room.round.participants.forEach((participant, index) => {
        const before = previous.counts.get(participant.playerId) ?? 0;
        const after = current.counts.get(participant.playerId) ?? 0;
        if (after > before) {
          engineRef.current?.playAccepted(index, deltaOrder * 0.06);
          deltaOrder += 1;
        }
      });
    }
    if (previous.phase === 'ROUND_ACTIVE' && current.phase !== 'ROUND_ACTIVE') {
      engineRef.current?.cancelAcceptedTones();
    }
    if (
      enabled &&
      previous.phase === 'ROUND_ACTIVE' &&
      current.phase === 'ROUND_ENDED' &&
      previous.roundId === current.roundId &&
      (room.round?.results?.winnerPlayerIds.length ?? 0) > 0
    ) {
      engineRef.current?.playWinnerTune();
    }
  }, [enabled, isDisplay, room]);

  useEffect(() => {
    if (!isDisplay) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        engineRef.current?.cancelAcceptedTones();
      }
      if (roomRef.current) previousRef.current = trackedRoom(roomRef.current);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isDisplay]);

  useEffect(() => {
    if (!isDisplay) return;
    return () => {
      previousRef.current = null;
      void engineRef.current?.dispose();
      engineRef.current = null;
      setEnabled(false);
    };
  }, [isDisplay]);

  useEffect(
    () => () => {
      void engineRef.current?.dispose();
      engineRef.current = null;
    },
    [],
  );

  return { enabled, supported, enable };
}
