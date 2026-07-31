import { roomCodeSchema } from './lobby';

export function buildJoinUrl(baseUrl: string, roomCode: string): string {
  const url = new URL(baseUrl);
  const normalizedRoomCode = roomCodeSchema.parse(roomCode);

  url.username = '';
  url.password = '';
  url.pathname = `/join/${normalizedRoomCode}`;
  url.search = '';
  url.hash = '';

  return url.toString();
}
