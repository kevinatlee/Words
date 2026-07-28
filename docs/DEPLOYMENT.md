# Future deployment

Production deployment is **not implemented through Stage 3.1**. The repository
contains a working Node.js lobby server, health endpoint, an isolated game
engine, and read-only CI checks, but it does not contain production packaging,
a deployment workflow, a published image, server configuration, tunnel
configuration, or production static-file serving.

The Stage 3.1 CI workflow verifies source and dependencies only. It has no write
permission and cannot publish, release, or deploy anything.

## Implemented runtime values

```text
Node server default port:
6532

Development client:
http://localhost:5173

Development health endpoint:
http://localhost:6532/api/health

Intended public URL:
https://words.atlee.io
```

`npm run dev` starts Vite and the Node server together. Vite proxies `/api` and
`/socket.io` to port `6532`. This is a development topology, not the intended
one-container production topology.

## Safe environment configuration

The server has working defaults. Optional values are documented in
`.env.example`:

| Variable                   |                  Default | Validated purpose                        |
| -------------------------- | -----------------------: | ---------------------------------------- |
| `PORT`                     |                   `6532` | Node HTTP and Socket.IO port             |
| `PUBLIC_BASE_URL`          | `https://words.atlee.io` | Allowed public browser origin            |
| `MAX_PLAYERS`              |                      `8` | Phone players per room; display excluded |
| `MAX_ROOMS`                |                    `500` | Active in-memory room bound              |
| `ROOM_TTL_MINUTES`         |                    `120` | Sliding room lifetime                    |
| `RECONNECT_GRACE_SECONDS`  |                     `60` | Display/player reconnect grace           |
| `CLEANUP_INTERVAL_SECONDS` |                     `30` | Expired-state cleanup frequency          |

Invalid numeric values fall back to bounded defaults. A real `.env` file,
private host address, credential, tunnel token, or registry token must not be
committed.

## Intended future values

```text
Container port:
6532

Unraid host port:
6532

Public URL:
https://words.atlee.io

Cloudflare origin:
http://UNRAID_SERVER_IP:6532

Future container health endpoint:
http://UNRAID_SERVER_IP:6532/api/health

Future container URL inside a container network:
http://words:6532

GHCR image path placeholder:
ghcr.io/GITHUB_OWNER/words:latest
```

`UNRAID_SERVER_IP` and `GITHUB_OWNER` are placeholders.

## Intended future flow

1. Reviewed source is merged through a pull request.
2. GitHub Actions runs formatting, linting, type checking, tests, and builds.
3. A multi-stage build creates one production image.
4. The image runs as a non-root user and serves both the React client and
   Node.js real-time server on port `6532`.
5. The image is published to GitHub Container Registry with reviewable tags.
6. Unraid maps host TCP port `6532` to container TCP port `6532`.
7. A Cloudflare Tunnel route for `https://words.atlee.io` forwards HTTP and
   WebSocket traffic to `http://UNRAID_SERVER_IP:6532`.
8. A health check calls `/api/health`.

The eventual Node.js application will serve the built React files, Express
routes, Socket.IO, game engine, and dictionary from one container. No separate
database, Redis, or reverse-proxy container is currently planned.

## Production work still required

- serve the built React application and history-fallback routes from Express
- create a multi-stage Dockerfile and non-root runtime user
- add an image-level health check for `/api/health`
- decide and document graceful shutdown behavior
- add a separately reviewed image-publishing workflow
- define GHCR permissions, tags, and update policy
- create and test an Unraid template
- verify Cloudflare Tunnel WebSocket behavior and production origin checks
- add trusted-boundary IP-aware rate limiting
- document logs, safe metrics, rollback, upgrade, and backup expectations

Until this work is reviewed and tested, the presence of the Node server must
not be presented as production readiness.
