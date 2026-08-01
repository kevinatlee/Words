FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/client/package.json ./apps/client/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY packages/game-data/package.json ./packages/game-data/package.json
COPY packages/game-engine/package.json ./packages/game-engine/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci

COPY . .

RUN npm run build:production

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ARG VCS_REF=unknown

LABEL org.opencontainers.image.source="https://github.com/kevinatlee/Words" \
  org.opencontainers.image.revision="$VCS_REF" \
  org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
  PORT=6532

COPY --from=build --chown=node:node /app/dist/production ./dist/production

USER node

EXPOSE 6532

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || '6532') + '/api/health').then(async (response) => { const body = await response.json(); if (!response.ok || body.status !== 'ok' || body.gameDataReady !== true) process.exit(1); }).catch(() => process.exit(1))"]

ENTRYPOINT ["node", "dist/production/server/index.mjs"]
