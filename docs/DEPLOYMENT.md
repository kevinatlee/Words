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

The direct process binds on all container interfaces and uses `PORT=6532` by
default. It verifies the 79,370-word dictionary before listening. `GET /api/health` returns
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

## Image publishing

The multi-stage `Dockerfile` uses official Node 24 images. Its final image has
only `/app/dist/production`, runs as the built-in non-root `node` user, exposes
TCP `6532`, and has a Node `fetch` health check for `/api/health`. It requires
no writable game-data volume and no runtime package installation.

CI runs `Container build and smoke` only after `Quality` and `Dependency audit`
pass. Pull requests use read-only permissions and never authenticate to or
publish to the registry. A successful push to `main` builds and re-smokes the exact
image before using the ephemeral GitHub token with `packages: write` to publish
the production channel:

```text
<registry image>:sha-<full-main-sha>
<registry image>:latest
```

`latest` is not published until the exact SHA image has passed its own smoke
test. The Docker metadata records the source repository, commit revision, and
MIT licence. No registry token belongs in a repository, image, or `.env` file.

The separate test-candidate channel is manual only:

```text
<registry image>:test-sha-<full-target-sha>
<registry image>:test
```

To publish a candidate, open Actions, select **Publish Test Image**, choose
**Run workflow** from `main`, enter an exact repository branch, tag, or full
commit SHA for `target_ref`, and enter `PUBLISH_TEST` exactly. The workflow
resolves and prints one full SHA, validates that checked-out candidate, smokes
the image carrying that SHA as OCI revision metadata, pushes the immutable tag
before the mutable `test` tag, and confirms the two remote tags share one
digest. The test workflow is never automatic and never changes `latest`.

`test` may contain unmerged candidate code. Its immutable SHA tag is available
for rollback. A new test image updates only the test container; it cannot affect
the production container. Both containers have independent in-memory rooms and
no shared storage, so active test rooms end when the test container updates.

GitHub package visibility is an account-level choice. Public visibility is
recommended for an uncomplicated private-server pull. If the package remains
private, configure the host with a least-privilege package-read credential by
following GitHub’s current package guidance; do not place that credential in
this repository, an image label, a compose file, or a screenshot.

## Production container installation

After a reviewed image has been published, create a container definition with
these fields:

| Template field       | Value                             |
| -------------------- | --------------------------------- |
| Name                 | the production container          |
| Repository           | `<registry image>:latest`         |
| Network type         | `bridge` (normal bridge mode)     |
| Container port       | `6532` / TCP                      |
| Host port            | `6532` / TCP                      |
| WebUI                | `<public origin>`                 |
| Required environment | `PUBLIC_BASE_URL=<public origin>` |
| Restart policy       | `unless-stopped`                  |

No host path, appdata volume, privileged mode, extra capability, GPU, database,
or Redis configuration is required. Keep the container port as `6532`; choose a
different free host port only if the host already uses `6532`, and make the
tunnel target match that host port. Optional bounded runtime settings are
documented in `.env.example`; `PORT` normally remains `6532` inside the
container.

Before exposing the service, request `/api/health` through the server's LAN
address. It must return `status: "ok"` and `gameDataReady: true`.

## Test container installation

Create a separate container for test candidates with these fields:

| Template field            | Value                             |
| ------------------------- | --------------------------------- |
| Name                      | the test container                |
| Repository                | `<registry image>:test`           |
| Network                   | `bridge`                          |
| Host port                 | `6533` / TCP                      |
| Container port            | `6532` / TCP                      |
| Protocol                  | TCP                               |
| Restart policy            | `unless-stopped`                  |
| Volume mappings           | none                              |
| Immediate LAN environment | `PUBLIC_BASE_URL=<public origin>` |

For immediate LAN-only testing, set `PUBLIC_BASE_URL` to the server's LAN
origin and check `/api/health`, a display, phone joining, and a real round after
each candidate update. For public testing, set it to `<public origin>` and route
the separate reverse proxy or tunnel to the test container. The proxy or tunnel
is not included in either Words image.

## Reverse proxy or tunnel

Configure the public hostname to forward HTTP and WebSocket traffic to the
production container on port `6532`. Set `PUBLIC_BASE_URL=<public origin>`
exactly. The reverse proxy or tunnel terminates public TLS and forwards both
normal HTTP and Socket.IO traffic to the same Words origin. Keep the server's
LAN address for local checks. After adding the route, verify `/api/health`, a TV
display, a phone join flow, and Socket.IO reconnection through the public
origin.

## Update and rollback

For a normal update:

1. Wait for the `main` workflow’s Quality, Dependency audit, Container build
   and smoke, and registry publication to finish successfully.
2. Pull `<registry image>:latest` on the container host.
3. Recreate the production container with the same ports and
   `PUBLIC_BASE_URL=<public origin>`.
4. Confirm `/api/health`, a TV display, a phone join, and a short round.

The exact SHA tag is the rollback unit. To roll back, change Repository to a
previously successful `<registry image>:sha-<full-main-sha>` tag,
pull it, recreate the container, and repeat the same health/display/join check.
Because rooms are in memory, schedule updates between casual sessions.

## Boundaries and remaining operational review

The CI image smoke covers the artifact, health readiness, deep links, static
assets, Socket.IO display/player creation, non-root runtime, read-only start,
and SIGTERM. It cannot replace a private-network, reverse-proxy/tunnel, or real
phone/display session review. Before calling any deployment public, review
host logs, LAN and public connectivity, reconnection behavior, and the current
registry package visibility policy.
