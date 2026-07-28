import {
  reconnectRoomInputSchema,
  sessionCredentialsSchema,
  type SessionCredentials,
} from '@words/shared';

export type StoredLobbySession = SessionCredentials & {
  roomCode: string;
  displayName: string;
};

export type LobbySessionStore = {
  save: (session: StoredLobbySession) => void;
  load: (roomCode: string) => StoredLobbySession | null;
  clear: (session: StoredLobbySession | null) => void;
};

const activeSessionKey = 'words:active-lobby-session';

function reconnectStorageKey(roomCode: string, playerId: string): string {
  return `words:reconnect:${roomCode}:${playerId}`;
}

export function createLobbySessionStore(
  localStorage: Storage,
  sessionStorage: Storage,
): LobbySessionStore {
  return {
    save: (session) => {
      localStorage.setItem(
        reconnectStorageKey(session.roomCode, session.playerId),
        JSON.stringify({
          reconnectToken: session.reconnectToken,
          displayName: session.displayName,
        }),
      );
      sessionStorage.setItem(
        activeSessionKey,
        JSON.stringify({
          roomCode: session.roomCode,
          playerId: session.playerId,
        }),
      );
    },
    load: (roomCode) => {
      try {
        const pointerText = sessionStorage.getItem(activeSessionKey);
        if (!pointerText) {
          return null;
        }

        const pointer = JSON.parse(pointerText) as {
          roomCode?: unknown;
          playerId?: unknown;
        };
        if (
          pointer.roomCode !== roomCode ||
          typeof pointer.playerId !== 'string'
        ) {
          return null;
        }

        const credentialsText = localStorage.getItem(
          reconnectStorageKey(roomCode, pointer.playerId),
        );
        if (!credentialsText) {
          return null;
        }

        const credentials = JSON.parse(credentialsText) as {
          reconnectToken?: unknown;
          displayName?: unknown;
        };
        const parsedReconnect = reconnectRoomInputSchema.safeParse({
          roomCode,
          reconnectToken: credentials.reconnectToken,
        });
        const parsedSession = sessionCredentialsSchema.safeParse({
          playerId: pointer.playerId,
          reconnectToken: credentials.reconnectToken,
        });

        if (
          !parsedReconnect.success ||
          !parsedSession.success ||
          typeof credentials.displayName !== 'string'
        ) {
          return null;
        }

        return {
          roomCode: parsedReconnect.data.roomCode,
          playerId: parsedSession.data.playerId,
          reconnectToken: parsedSession.data.reconnectToken,
          displayName: credentials.displayName,
        };
      } catch {
        return null;
      }
    },
    clear: (session) => {
      if (session) {
        localStorage.removeItem(
          reconnectStorageKey(session.roomCode, session.playerId),
        );
      }
      sessionStorage.removeItem(activeSessionKey);
    },
  };
}

export const lobbySessionStore = createLobbySessionStore(
  window.localStorage,
  window.sessionStorage,
);
