# Future deployment

Production deployment is **not implemented in Stage 1**. There is no
production Node.js server, Dockerfile, Compose configuration, published image,
Unraid template, or Cloudflare configuration yet.

## Intended values

```text
Container port:
6532

Unraid host port:
6532

Public URL:
https://words.atlee.io

Cloudflare origin:
http://UNRAID_SERVER_IP:6532

Planned health endpoint:
http://UNRAID_SERVER_IP:6532/health

Planned container URL inside a container network:
http://words:6532

Planned GHCR image path placeholder:
ghcr.io/GITHUB_OWNER/words:latest
```

`UNRAID_SERVER_IP` and `GITHUB_OWNER` are placeholders. Do not put a personal
server address, credentials, tunnel token, or private registry token in this
repository.

## Intended future flow

1. Reviewed source is merged through a pull request.
2. GitHub Actions runs quality checks and builds one production container.
3. The image is published to GitHub Container Registry.
4. Unraid runs the container and maps host TCP port 6532 to container TCP port 6532.
5. A Cloudflare Tunnel route for `https://words.atlee.io` sends traffic to
   `http://UNRAID_SERVER_IP:6532`.
6. A health check calls `/health` to confirm the Node.js process is available.

The eventual Node.js application will serve the built React files, Express
routes, Socket.IO connection, game engine, and dictionary from one container.
No separate database, Redis, or reverse-proxy container is initially needed.

## Development port versus production port

`npm run dev` starts Vite, normally at `http://localhost:5173`. That development
server provides fast frontend refreshes and is not the eventual deployment.
Production examples must continue to use port `6532`.

## Work deferred beyond Stage 1

- production server and `/health`
- multi-stage Dockerfile and non-root runtime user
- container health check
- Docker Compose example
- GitHub Actions checks and image publishing
- GHCR package permissions and tags
- Unraid template and update instructions
- Cloudflare Tunnel origin and WebSocket verification
- rollback and backup guidance
