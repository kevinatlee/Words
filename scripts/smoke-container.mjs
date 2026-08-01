import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { io } from 'socket.io-client';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const imageName = process.env.WORDS_SMOKE_IMAGE ?? 'words:stage-5a-smoke';
const containerName = `words-smoke-${process.pid}-${Date.now()}`;
const buildRevision = process.env.GITHUB_SHA ?? 'local-smoke';

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function isDockerAvailable() {
  const result = spawnSync('docker', ['info'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0;
}

function fail(message) {
  throw new Error(`Container smoke test failed: ${message}`);
}

async function waitForHealthy(origin) {
  const deadline = Date.now() + 30_000;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health`);
      const body = await response.json();
      if (response.ok && body.status === 'ok' && body.gameDataReady === true) {
        return;
      }
      lastError = `health was ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`the container did not become ready (${lastError}).`);
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    fail(`${options.method ?? 'GET'} ${url} returned ${response.status}.`);
  }
  return response;
}

function waitForSocket(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Socket.IO did not connect to the container.')),
      10_000,
    );
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

if (!isDockerAvailable()) {
  if (process.env.CI) {
    fail('Docker must be available in CI.');
  }
  console.log('Container smoke test skipped: Docker daemon is unavailable.');
  process.exit(0);
}

let containerStarted = false;
try {
  run('docker', [
    'build',
    '--build-arg',
    `VCS_REF=${buildRevision}`,
    '--tag',
    imageName,
    '--file',
    'Dockerfile',
    '.',
  ]);

  const imageInspection = run('docker', [
    'image',
    'inspect',
    imageName,
    '--format',
    '{{json .}}',
  ]);
  const image = JSON.parse(imageInspection);
  const expectedArchitecture = process.arch === 'x64' ? 'amd64' : process.arch;
  if (image.Architecture !== expectedArchitecture) {
    fail(
      `image architecture ${image.Architecture} does not match ${expectedArchitecture}.`,
    );
  }
  if (image.Config.User !== 'node') {
    fail(
      `runtime image user must be node, received ${image.Config.User || 'root'}.`,
    );
  }
  if (!image.Config.ExposedPorts?.['6532/tcp'] || !image.Config.Healthcheck) {
    fail('runtime image is missing the expected port or health check.');
  }
  console.log(
    `Container image: ${image.Architecture}, ${Math.round(image.Size / 1024 / 1024)} MiB, user ${image.Config.User}.`,
  );

  run('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    imageName,
    '-c',
    'test -f /app/dist/production/server/index.mjs && test ! -e /app/node_modules && test ! -e /app/apps && test ! -e /app/packages',
  ]);
  const runtimeUser = run('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'id',
    imageName,
    '-u',
  ]);
  if (runtimeUser !== '1000') {
    fail(`runtime process must be the node user, received UID ${runtimeUser}.`);
  }

  run('docker', [
    'run',
    '--detach',
    '--name',
    containerName,
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=16m',
    '--publish',
    '127.0.0.1::6532',
    '--env',
    'PORT=6532',
    imageName,
  ]);
  containerStarted = true;

  const publishedPort = run('docker', ['port', containerName, '6532/tcp']);
  const portMatch = /:(\d+)\s*$/.exec(publishedPort);
  if (!portMatch) {
    fail(`could not resolve the published port from ${publishedPort}.`);
  }
  const origin = `http://127.0.0.1:${portMatch[1]}`;
  await waitForHealthy(origin);

  for (const navigationPath of [
    '/',
    '/display',
    '/host',
    '/join',
    '/join/AB12CD',
    '/room/AB12CD',
    '/play/demo',
  ]) {
    const response = await request(`${origin}${navigationPath}`, {
      headers: { Accept: 'text/html' },
    });
    if (!response.headers.get('content-type')?.includes('text/html')) {
      fail(`${navigationPath} did not return the SPA HTML.`);
    }
  }

  const rootDocument = await request(`${origin}/`, {
    headers: { Accept: 'text/html' },
  });
  const rootHtml = await rootDocument.text();
  const assetMatch = /(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/.exec(
    rootHtml,
  );
  if (!assetMatch?.[1]) {
    fail('the container HTML does not reference a hashed client asset.');
  }
  const asset = await request(`${origin}${assetMatch[1]}`);
  if (!asset.headers.get('cache-control')?.includes('immutable')) {
    fail('the hashed asset does not have immutable caching.');
  }

  const display = io(origin, { transports: ['websocket'] });
  await waitForSocket(display);
  const displayResult = await emit(display, 'display:create', {});
  if (!displayResult.ok) {
    fail('the display session could not be created.');
  }
  const player = io(origin, { transports: ['websocket'] });
  await waitForSocket(player);
  const playerResult = await emit(player, 'player:join', {
    displayName: 'Smoke player',
    roomCode: displayResult.room.code,
  });
  if (!playerResult.ok) {
    fail('the player session could not join the display room.');
  }
  display.disconnect();
  player.disconnect();

  run('docker', ['kill', '--signal=TERM', containerName]);
  const exitCode = run('docker', ['wait', containerName]);
  if (exitCode !== '0') {
    fail(`SIGTERM did not stop the direct Node process cleanly (${exitCode}).`);
  }
  containerStarted = false;
} finally {
  if (containerStarted) {
    run('docker', ['logs', containerName]);
    run('docker', ['rm', '--force', containerName]);
  }
}

console.log('Container smoke test passed.');
