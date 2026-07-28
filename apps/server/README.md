# Words server

Stage 2 adds one trusted Node.js process for the health API and temporary
Socket.IO lobbies. Rooms, player sessions, and reconnect credentials exist only
in memory and disappear when the process restarts.

Run both the server and Vite client from the repository root with `npm run dev`.
The server listens on `http://localhost:6532` by default.

Gameplay, persistence, production packaging, and deployment are not included.
