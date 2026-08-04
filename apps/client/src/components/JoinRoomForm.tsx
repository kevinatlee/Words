import { useState, type FormEvent } from 'react';

import type { RoomError } from '@words/shared';

import { LobbyError } from './LobbyError';

type JoinRoomFormProps = {
  initialRoomCode?: string | undefined;
  initialDisplayName?: string | undefined;
  roomCodeLocked?: boolean;
  recoveryMessage?: string | undefined;
  submitLabel?: string | undefined;
  onJoin: (roomCode: string, displayName: string) => Promise<RoomError | null>;
};

export function JoinRoomForm({
  initialRoomCode = '',
  initialDisplayName = '',
  roomCodeLocked = false,
  recoveryMessage,
  submitLabel,
  onJoin,
}: JoinRoomFormProps) {
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [error, setError] = useState<RoomError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(await onJoin(roomCode, displayName));
    setSubmitting(false);
  };

  return (
    <section className="form-page">
      <div className="form-page__intro">
        <h1>Join the Room</h1>
        {recoveryMessage ? <p>{recoveryMessage}</p> : null}
      </div>

      <form
        className="panel lobby-form"
        onSubmit={(event) => void submit(event)}
      >
        <label htmlFor="join-room-code">Room code</label>
        <input
          id="join-room-code"
          name="roomCode"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={8}
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value)}
          placeholder="ABC234"
          readOnly={roomCodeLocked}
          required
        />

        <label htmlFor="join-display-name">Display name</label>
        <input
          id="join-display-name"
          name="displayName"
          autoComplete="nickname"
          minLength={2}
          maxLength={24}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Bright Fox"
          required
        />
        <LobbyError error={error} />
        <button
          className="button button--accent"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Joining room…' : (submitLabel ?? 'Join Room')}
        </button>
      </form>
    </section>
  );
}
