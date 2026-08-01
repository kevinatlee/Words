import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  PRODUCTION_DICTIONARY_IDENTITY,
  type ProductionDictionaryLoadResult,
} from '@words/game-data';

import { createWordsServer, type WordsServer } from '../src/server.js';

const successfulDictionaryLoad: Extract<
  ProductionDictionaryLoadResult,
  { success: true }
> = {
  success: true,
  dictionary: { has: () => false },
  wordCount: 79_370,
  manifest: PRODUCTION_DICTIONARY_IDENTITY as never,
};

describe('production static client boundary', () => {
  let clientDirectory: string;
  let server: WordsServer;

  beforeEach(async () => {
    clientDirectory = await mkdtemp(path.join(tmpdir(), 'words-client-'));
    await writeFile(
      path.join(clientDirectory, 'index.html'),
      '<!doctype html><title>Words</title><main id="root"></main>',
    );
    await writeFile(path.join(clientDirectory, 'asset.txt'), 'static text');
    await mkdir(path.join(clientDirectory, 'assets'));
    await writeFile(
      path.join(clientDirectory, 'assets', 'index-TEST123.js'),
      'console.log("Words");',
    );

    server = createWordsServer(
      { port: 0 },
      {
        staticClientDirectory: clientDirectory,
        dictionaryLoader: async () => successfulDictionaryLoad,
        listen: async () => 12_345,
      },
    );
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    await rm(clientDirectory, { force: true, recursive: true });
  });

  it.each([
    '/',
    '/display',
    '/host',
    '/join',
    '/join/AB12CD',
    '/room/AB12CD',
    '/play/demo',
  ])(
    'serves the SPA document for the supported navigation path %s',
    async (path) => {
      const response = await request(server.app)
        .get(path)
        .set('Accept', 'text/html')
        .expect(200);

      expect(response.text).toContain('<main id="root"></main>');
      expect(response.headers['cache-control']).toBe('no-cache');
    },
  );

  it('supports HEAD navigation requests without making the HTML permanently cacheable', async () => {
    const response = await request(server.app)
      .head('/display')
      .set('Accept', 'text/html')
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('serves hashed assets with immutable caching', async () => {
    const response = await request(server.app)
      .get('/assets/index-TEST123.js')
      .expect(200);

    expect(response.text).toBe('console.log("Words");');
    expect(response.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('keeps missing assets, unknown APIs, Socket.IO paths, and non-GET routes out of the SPA fallback', async () => {
    await request(server.app)
      .get('/assets/missing-TEST123.js')
      .set('Accept', 'text/html')
      .expect(404)
      .expect((response) =>
        expect(response.text).not.toContain('<main id="root"></main>'),
      );
    await request(server.app)
      .get('/api/unknown')
      .set('Accept', 'text/html')
      .expect(404)
      .expect('Content-Type', /json/)
      .expect({ error: 'Not found' });
    await request(server.app)
      .get('/socket.io/missing')
      .set('Accept', 'text/html')
      .expect(404)
      .expect((response) =>
        expect(response.text).not.toContain('<main id="root"></main>'),
      );
    await request(server.app).post('/display').expect(404);
  });

  it('does not serve the SPA document for unknown navigations or traversal attempts', async () => {
    await request(server.app)
      .get('/not-a-route')
      .set('Accept', 'text/html')
      .expect(404)
      .expect((response) =>
        expect(response.text).not.toContain('<main id="root"></main>'),
      );
    await request(server.app)
      .get('/join/%2e%2e%2findex.html')
      .set('Accept', 'text/html')
      .expect(404);
  });
});
