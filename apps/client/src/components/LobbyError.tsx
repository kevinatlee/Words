import type { RoomError } from '@words/shared';

type LobbyErrorProps = {
  error: RoomError | null;
};

export function LobbyError({ error }: LobbyErrorProps) {
  if (!error) {
    return null;
  }

  return (
    <div className="lobby-error" role="alert">
      <strong>Couldn’t complete that request</strong>
      <span>{error.message}</span>
      <small>Error code: {error.code}</small>
    </div>
  );
}
