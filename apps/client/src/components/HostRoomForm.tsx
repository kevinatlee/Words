import { useState, type FormEvent } from 'react';

import type { RoomError } from '@words/shared';

import { LobbyError } from './LobbyError';

type HostRoomFormProps = {
  onCreate: (displayName: string) => Promise<RoomError | null>;
};

export function HostRoomForm({ onCreate }: HostRoomFormProps) {
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<RoomError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(await onCreate(displayName));
    setSubmitting(false);
  };

  return (
    <section className="form-page">
      <div className="form-page__intro">
        <span className="eyebrow">Shared-screen host</span>
        <h1>Create a temporary room.</h1>
        <p>
          Choose how you’ll appear in the lobby. The server will create the room
          code and make this browser the host.
        </p>
      </div>

      <form
        className="panel lobby-form"
        onSubmit={(event) => void submit(event)}
      >
        <label htmlFor="host-display-name">Display name</label>
        <input
          id="host-display-name"
          name="displayName"
          autoComplete="nickname"
          minLength={2}
          maxLength={24}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Game Host"
          required
        />
        <p className="field-note">
          Use 2–24 characters. This is temporary and is not an account.
        </p>
        <LobbyError error={error} />
        <button
          className="button button--primary"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Creating room…' : 'Create Room'}
        </button>
      </form>
    </section>
  );
}
