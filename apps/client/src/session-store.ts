import {
  displayNameSchema,
  displaySessionCredentialsSchema,
  playerSessionCredentialsSchema,
  reconnectDisplayInputSchema,
  reconnectPlayerInputSchema,
} from '@words/shared';

export type StoredDisplaySession = {
  role: 'display';
  roomCode: string;
  displaySessionId: string;
  displayReconnectToken: string;
};

export type StoredPlayerSession = {
  role: 'player';
  roomCode: string;
  playerId: string;
  playerReconnectToken: string;
  displayName: string;
};

export type StoredLobbySession = StoredDisplaySession | StoredPlayerSession;

export type LobbySessionStore = {
  save: (session: StoredLobbySession) => void;
  load: (roomCode: string) => StoredLobbySession | null;
  clear: (session: StoredLobbySession | null) => void;
};

const activeSessionKey = 'words:active-lobby-session';

function sessionId(session: StoredLobbySession): string {
  return session.role === 'display'
    ? session.displaySessionId
    : session.playerId;
}

function reconnectStorageKey(
  role: StoredLobbySession['role'],
  roomCode: string,
  id: string,
): string {
  return `words:reconnect:${role}:${roomCode}:${id}`;
}

function storedCredentialMatchesSession(
  credentialText: string,
  session: StoredLobbySession,
): boolean {
  try {
    const credential = JSON.parse(credentialText) as Record<string, unknown>;

    return session.role === 'display'
      ? credential.displayReconnectToken === session.displayReconnectToken
      : credential.playerReconnectToken === session.playerReconnectToken;
  } catch {
    return true;
  }
}

export function createLobbySessionStore(
  localStorage: Storage,
  sessionStorage: Storage,
): LobbySessionStore {
  return {
    save: (session) => {
      const id = sessionId(session);
      const credentials =
        session.role === 'display'
          ? {
              displayReconnectToken: session.displayReconnectToken,
            }
          : {
              playerReconnectToken: session.playerReconnectToken,
              displayName: session.displayName,
            };

      localStorage.setItem(
        reconnectStorageKey(session.role, session.roomCode, id),
        JSON.stringify(credentials),
      );
      sessionStorage.setItem(
        activeSessionKey,
        JSON.stringify({
          role: session.role,
          roomCode: session.roomCode,
          sessionId: id,
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
          role?: unknown;
          roomCode?: unknown;
          sessionId?: unknown;
        };
        if (
          pointer.roomCode !== roomCode ||
          (pointer.role !== 'display' && pointer.role !== 'player') ||
          typeof pointer.sessionId !== 'string'
        ) {
          return null;
        }

        const credentialsText = localStorage.getItem(
          reconnectStorageKey(pointer.role, roomCode, pointer.sessionId),
        );
        if (!credentialsText) {
          return null;
        }

        const credentials = JSON.parse(credentialsText) as Record<
          string,
          unknown
        >;

        if (pointer.role === 'display') {
          const reconnect = reconnectDisplayInputSchema.safeParse({
            roomCode,
            displayReconnectToken: credentials.displayReconnectToken,
          });
          const session = displaySessionCredentialsSchema.safeParse({
            displaySessionId: pointer.sessionId,
            displayReconnectToken: credentials.displayReconnectToken,
          });

          if (!reconnect.success || !session.success) {
            return null;
          }

          return {
            role: 'display',
            roomCode: reconnect.data.roomCode,
            ...session.data,
          };
        }

        const reconnect = reconnectPlayerInputSchema.safeParse({
          roomCode,
          playerReconnectToken: credentials.playerReconnectToken,
        });
        const session = playerSessionCredentialsSchema.safeParse({
          playerId: pointer.sessionId,
          playerReconnectToken: credentials.playerReconnectToken,
        });
        const displayName = displayNameSchema.safeParse(
          credentials.displayName,
        );

        if (!reconnect.success || !session.success || !displayName.success) {
          return null;
        }

        return {
          role: 'player',
          roomCode: reconnect.data.roomCode,
          ...session.data,
          displayName: displayName.data,
        };
      } catch {
        return null;
      }
    },
    clear: (session) => {
      if (session) {
        const credentialKey = reconnectStorageKey(
          session.role,
          session.roomCode,
          sessionId(session),
        );
        const credentialText = localStorage.getItem(credentialKey);

        if (
          credentialText &&
          storedCredentialMatchesSession(credentialText, session)
        ) {
          localStorage.removeItem(credentialKey);
        }
      }
      sessionStorage.removeItem(activeSessionKey);
    },
  };
}

export const lobbySessionStore = createLobbySessionStore(
  window.localStorage,
  window.sessionStorage,
);
