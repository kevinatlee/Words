import { useState } from 'react';

import type { RoomError } from '@words/shared';

import { LobbyError } from './LobbyError';

type DisplayRoomFormProps = {
  onCreate: () => Promise<RoomError | null>;
};

export function DisplayRoomForm({ onCreate }: DisplayRoomFormProps) {
  const [error, setError] = useState<RoomError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const create = async () => {
    setSubmitting(true);
    setError(await onCreate());
    setSubmitting(false);
  };

  return (
    <section className="form-page">
      <div className="form-page__intro">
        <span className="eyebrow">Shared display</span>
        <h1>Create a temporary room.</h1>
        <p>
          Open this page on the TV or shared screen. The display presents the
          lobby, while participating players join and play from their phones.
        </p>
      </div>

      <section className="panel lobby-form" aria-label="Create room">
        <p className="display-explanation">
          The display is not a player and does not count toward the eight-player
          limit. The first phone player to join becomes the game host.
        </p>
        <LobbyError error={error} />
        <button
          className="button button--primary"
          type="button"
          disabled={submitting}
          onClick={() => void create()}
        >
          {submitting ? 'Creating room…' : 'Create Room Display'}
        </button>
      </section>
    </section>
  );
}
