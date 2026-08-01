# Stage 5A container deployment

Stage 5A provides a single production container for Words. It is a deployment
boundary, not a gameplay feature: the container serves the built React client,
Express health API, Socket.IO, game engine, and the verified server-only
dictionary from one direct Node.js process.

It does not add persistence, a database, Redis, accounts, Stage 4G work,
sounds, animations, or a public deployment by itself. Active rooms remain
intentionally in memory, so a container restart ends active rooms.

## Production artifact and local checks

`npm run build:production` first creates the Vite client build, then creates a
clean `dist/production/` directory containing only:

- `client/` — Vite HTML and hashed static assets;
- `server/index.mjs` — the bundled Node 24 production entry; and
- `data/dictionary/` — the verified dictionary, manifest, and required notice.

It does not copy TypeScript source, tests, workspace packages, `node_modules`,
or development tooling into the runtime artifact. The output is independent of
the current working directory:

```bash
npm run build:production
npm run start:production
```

The direct process binds `0.0.0.0` and uses `PORT=6532` by default. It verifies
the 79,370-word dictionary before listening. `GET /api/health` returns
`gameDataReady: true` only after that startup succeeds. `SIGTERM` and `SIGINT`
stop Socket.IO, the HTTP server, and the bounded lifecycle timer cleanly.

For a reproducible local boundary check, run:

```bash
npm run smoke:production
npm run smoke:container
```

The first command starts the direct production artifact from a temporary,
unrelated directory. It checks health, all supported browser deep links, a
hashed asset, a display/player Socket.IO exchange, and graceful SIGTERM. The
container smoke script builds, inspects, and runs the image with a read-only
filesystem. It skips only on a non-CI machine where the Docker daemon is not
available; CI treats Docker unavailability as a failure.

## Runtime request boundary

Production is one origin and one port. `GET` and `HEAD` browser navigations for
these paths return the SPA document:

- `/`
- `/display`
- `/host`
- `/join`
- `/join/:roomCode`
- `/room/:roomCode`
- `/play/demo`

`/assets/*` serves Vite’s hashed files with
`Cache-Control: public, max-age=31536000, immutable`. HTML uses `no-cache` so a
new deployment can replace its asset references. Unknown API paths, missing
assets, Socket.IO paths, non-GET/HEAD requests, unknown navigations, and
traversal attempts never become SPA fallback responses. Socket.IO remains on
its existing `/socket.io` path.

Development remains unchanged: `npm run dev` uses Vite on port `5173` and its
development proxy for `/api` and `/socket.io`.

## Image and GHCR publishing

The multi-stage `Dockerfile` uses official Node 24 images. Its final image has
only `/app/dist/production`, runs as the built-in non-root `node` user, exposes
TCP `6532`, and has a Node `fetch` health check for `/api/health`. It requires
no writable game-data volume and no runtime package installation.

CI runs `Container build and smoke` only after `Quality` and `Dependency audit`
pass. Pull requests use read-only permissions and never authenticate to or
publish to GHCR. A successful push to `main` builds and re-smokes the exact
image before using the ephemeral GitHub token with `packages: write` to publish
both:

```text
ghcr.io/kevinatlee/words:sha-<full-commit-sha>
ghcr.io/kevinatlee/words:latest
```

`latest` is not published until the exact SHA image has passed its own smoke
test. The Docker metadata records the source repository, commit revision, and
MIT licence. No registry token belongs in a repository, image, or `.env` file.

GitHub package visibility is an account-level choice. Public visibility is
recommended for an uncomplicated private-server pull. If the package remains
private, configure the host with a least-privilege package-read credential by
following GitHub’s current package guidance; do not place that credential in
this repository, an image label, a compose file, or a screenshot.

## Unraid installation

After a reviewed image has been published, create an Unraid Docker template
with these exact fields:

| Template field       | Value                                    |
| -------------------- | ---------------------------------------- |
| Name                 | `Words`                                  |
| Repository           | `ghcr.io/kevinatlee/words:latest`        |
| Network type         | `bridge` (normal bridge mode)            |
| Container port       | `6532` / TCP                             |
| Host port            | `6532` / TCP                             |
| WebUI                | `http://[IP]:[PORT:6532]/`               |
| Required environment | `PUBLIC_BASE_URL=https://words.atlee.io` |
| Restart policy       | `unless-stopped`                         |

No host path, appdata volume, privileged mode, extra capability, GPU, database,
or Redis configuration is required. Keep the container port as `6532`; choose a
different free host port only if the host already uses `6532`, and make the
tunnel target match that host port. Optional bounded runtime settings are
documented in `.env.example`; `PORT` normally remains `6532` inside the
container.

Before exposing the service, open the Unraid WebUI link on the LAN and verify:

```text
http://<UNRAID-IP>:6532/api/health
```

It must return `status: "ok"` and `gameDataReady: true`.

## Cloudflare Tunnel

Configure one public hostname, `words.atlee.io`, with an HTTP service target of
either:

```text
http://<UNRAID-IP>:6532
```

or, when the tunnel connector reaches the same Docker network by name:

```text
http://Words:6532
```

Use the public hostname `https://words.atlee.io` and set
`PUBLIC_BASE_URL=https://words.atlee.io` exactly. Cloudflare terminates public
TLS and forwards normal HTTP and WebSocket traffic through the same tunnel to
the one Words origin. Do not expose a public router port merely for Words; use
the direct LAN URL only for local checks. After adding the route, verify the
public health URL, a TV display, a phone join flow, and Socket.IO reconnecting
through the public hostname.

## Update and rollback

For a normal update:

1. Wait for the `main` workflow’s Quality, Dependency audit, Container build
   and smoke, and GHCR publication to finish successfully.
2. Pull `ghcr.io/kevinatlee/words:latest` on Unraid.
3. Recreate the Words container with the same ports and
   `PUBLIC_BASE_URL=https://words.atlee.io`.
4. Confirm `/api/health`, a TV display, a phone join, and a short round.

The exact SHA tag is the rollback unit. To roll back, change Repository to a
previously successful `ghcr.io/kevinatlee/words:sha-<full-commit-sha>` tag,
pull it, recreate the container, and repeat the same health/display/join check.
Because rooms are in memory, schedule updates between casual sessions.

## Boundaries and remaining operational review

The CI image smoke covers the artifact, health readiness, deep links, static
assets, Socket.IO display/player creation, non-root runtime, read-only start,
and SIGTERM. It cannot replace a private-network, Cloudflare Tunnel, or real
phone/display session review. Before calling any deployment public, review
host logs, direct-LAN and tunnel connectivity, reconnection behavior, and the
current GitHub package visibility policy.
