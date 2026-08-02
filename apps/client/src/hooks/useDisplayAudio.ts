import { useCallback, useEffect, useRef, useState } from 'react';

import type { RoomState } from '@words/shared';

import {
  DisplayAudioEngine,
  type DisplayAudioStatus,
} from '../audio/display-audio';

type TrackedRoom = {
  roundId: string | null;
  phase: RoomState['phase'] | null;
  counts: Map<string, number>;
};

function trackedRoom(room: RoomState | null): TrackedRoom {
  return {
    roundId: room?.round?.id ?? null,
    phase: room?.phase ?? null,
    counts: new Map(
      room?.round?.acceptedWordCounts.map((entry) => [
        entry.playerId,
        entry.count,
      ]) ?? [],
    ),
  };
}

export type DisplayAudioController = {
  status: DisplayAudioStatus;
  showControl: boolean;
  enable: () => Promise<void>;
};

export function useDisplayAudio(
  room: RoomState | null,
  isDisplaySession: boolean,
): DisplayAudioController {
  const [status, setStatus] = useState<DisplayAudioStatus>('checking');
  const engineRef = useRef<DisplayAudioEngine | null>(null);
  const previousRef = useRef<TrackedRoom | null>(null);
  const roomRef = useRef(room);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const enable = useCallback(async () => {
    if (!isDisplaySession) return;
    await engineRef.current?.enable();
  }, [isDisplaySession]);

  useEffect(() => {
    if (!isDisplaySession) {
      previousRef.current = null;
      return;
    }

    const engine = new DisplayAudioEngine();
    engineRef.current = engine;
    const unsubscribe = engine.subscribe(setStatus);
    void engine.enable();

    return () => {
      unsubscribe();
      void engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
      previousRef.current = null;
    };
  }, [isDisplaySession]);

  useEffect(() => {
    if (!isDisplaySession || status === 'running' || status === 'unsupported') {
      return;
    }
    const attempt = () => void engineRef.current?.enable();
    window.addEventListener('pointerdown', attempt);
    window.addEventListener('click', attempt);
    window.addEventListener('keydown', attempt);
    return () => {
      window.removeEventListener('pointerdown', attempt);
      window.removeEventListener('click', attempt);
      window.removeEventListener('keydown', attempt);
    };
  }, [isDisplaySession, status]);

  useEffect(() => {
    if (!isDisplaySession) return;
    const current = trackedRoom(room);
    const previous = previousRef.current;
    previousRef.current = current;
    if (!previous || document.visibilityState === 'hidden') return;
    if (previous.roundId !== current.roundId) {
      engineRef.current?.cancelAcceptedTones();
    }
    if (
      status === 'running' &&
      previous.phase === 'ROUND_ACTIVE' &&
      current.phase === 'ROUND_ACTIVE' &&
      previous.roundId === current.roundId &&
      room?.round
    ) {
      let deltaOrder = 0;
      room.round.participants.forEach((participant, index) => {
        const before = previous.counts.get(participant.playerId) ?? 0;
        const after = current.counts.get(participant.playerId) ?? 0;
        if (after > before) {
          engineRef.current?.playAccepted(index, deltaOrder * 0.09);
          deltaOrder += 1;
        }
      });
    }
    if (previous.phase === 'ROUND_ACTIVE' && current.phase !== 'ROUND_ACTIVE') {
      engineRef.current?.cancelAcceptedTones();
    }
    if (
      status === 'running' &&
      previous.phase === 'ROUND_ACTIVE' &&
      current.phase === 'ROUND_ENDED' &&
      previous.roundId === current.roundId &&
      (room?.round?.results?.winnerPlayerIds.length ?? 0) > 0
    ) {
      engineRef.current?.playWinnerTune();
    }
  }, [isDisplaySession, room, status]);

  useEffect(() => {
    if (!isDisplaySession) return;
    const onVisibilityChange = () => {
      previousRef.current = trackedRoom(roomRef.current);
      if (document.visibilityState === 'hidden') {
        engineRef.current?.cancelAcceptedTones();
      } else {
        void engineRef.current?.enable();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isDisplaySession]);

  return {
    status,
    showControl:
      isDisplaySession && (status === 'blocked' || status === 'suspended'),
    enable,
  };
}
