import { once } from 'node:events';
import { access, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { io } from 'socket.io-client';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const productionDirectory = path.join(repositoryRoot, 'dist', 'production');
const serverEntryPoint = path.join(productionDirectory, 'server', 'index.mjs');
const smokeWorkingDirectory = await mkdtemp(
  path.join(tmpdir(), 'words-production-'),
);

function fail(message) {
  throw new Error(`Production smoke test failed: ${message}`);
}

async function findClientAsset(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const asset = entries.find(
    (entry) => entry.isFile() && /\.(?:js|css)$/.test(entry.name),
  );
  if (!asset) {
    fail('the built client does not include a JavaScript or CSS asset.');
  }
  return `/assets/${asset.name}`;
}

async function request(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  if (!response.ok) {
    fail(`${options.method ?? 'GET'} ${url} returned ${response.status}.`);
  }
  return response;
}

function waitForListening(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error('The production server did not report a listening port.'),
      );
    }, 10_000);
    let output = '';
    const inspectOutput = (chunk) => {
      output += chunk.toString();
      const match = /Words server listening on http:\/\/0\.0\.0\.0:(\d+)/.exec(
        output,
      );
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on('data', inspectOutput);
    child.stderr.on('data', inspectOutput);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `The production server exited before listening (${code ?? signal}): ${output}`,
        ),
      );
    });
  });
}

function waitForSocket(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Socket.IO did not connect.'));
    }, 10_000);
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

let child;
try {
  await access(serverEntryPoint);
  await stat(path.join(productionDirectory, 'data', 'dictionary', 'words.txt'));
  await stat(
    path.join(productionDirectory, 'data', 'dictionary', 'manifest.json'),
  );

  child = spawn(process.execPath, [serverEntryPoint], {
    cwd: smokeWorkingDirectory,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await waitForListening(child);
  const origin = `http://127.0.0.1:${port}`;

  const health = await request(`${origin}/api/health`);
  const healthJson = await health.json();
  if (healthJson.status !== 'ok' || healthJson.gameDataReady !== true) {
    fail('the health response does not report ready game data.');
  }

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

  const assetPath = await findClientAsset(
    path.join(productionDirectory, 'client', 'assets'),
  );
  const assetResponse = await request(`${origin}${assetPath}`);
  if (!assetResponse.headers.get('cache-control')?.includes('immutable')) {
    fail('the hashed client asset is not immutable.');
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

  child.kill('SIGTERM');
  const [exitCode, signal] = await once(child, 'exit');
  if (exitCode !== 0 || signal !== null) {
    fail(`SIGTERM did not exit cleanly (${exitCode ?? signal}).`);
  }
  child = undefined;
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
  await rm(smokeWorkingDirectory, { force: true, recursive: true });
}

console.log('Production smoke test passed.');
