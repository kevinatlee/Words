import { describe, expect, it, vi } from 'vitest';

import { createWordsServer, WordsServerStartupError } from '../src/server.js';
import { RoomOperationError } from '../src/room-store.js';

describe('Words server production-data startup', () => {
  it('loads the expected dictionary once before accepting rooms', async () => {
    const loader = vi.fn(async () => ({
      success: true as const,
      dictionary: {} as never,
      wordCount: 79_370,
      manifest: {} as never,
    }));
    const server = createWordsServer({ port: 0 }, { dictionaryLoader: loader });

    expect(server.httpServer.listening).toBe(false);
    const firstPort = await server.start(0);
    expect(firstPort).toBeGreaterThan(0);
    expect(server.httpServer.listening).toBe(true);
    expect(
      server.roomStore.createDisplay('after-start').room.code,
    ).toHaveLength(6);
    await expect(server.start(0)).resolves.toBe(firstPort);
    expect(loader).toHaveBeenCalledTimes(1);
    await server.stop();
  });

  it('fails before listening when dictionary loading reports an error', async () => {
    const loader = vi.fn(async () => ({
      success: false as const,
      code: 'DICTIONARY_READ_FAILED' as const,
    }));
    const server = createWordsServer({ port: 0 }, { dictionaryLoader: loader });

    expect(() => server.roomStore.createDisplay('too-early')).toThrow(
      RoomOperationError,
    );
    await expect(server.start(0)).rejects.toBeInstanceOf(
      WordsServerStartupError,
    );
    expect(server.httpServer.listening).toBe(false);
    expect(server.roomStore.roomCount).toBe(0);
    await server.stop();
  });

  it('fails closed when a loader throws without exposing its details', async () => {
    const server = createWordsServer(
      { port: 0 },
      {
        dictionaryLoader: async () => {
          throw new Error('private filesystem detail');
        },
      },
    );

    await expect(server.start(0)).rejects.toMatchObject({
      code: 'GAME_DATA_STARTUP_FAILED',
      message:
        'Words server startup failed because production game data is unavailable.',
    });
    await server.stop();
  });

  it('loads game data only once for repeated failed start calls', async () => {
    const loader = vi.fn(async () => ({
      success: false as const,
      code: 'MANIFEST_INVALID' as const,
    }));
    const server = createWordsServer({ port: 0 }, { dictionaryLoader: loader });

    await expect(server.start(0)).rejects.toBeInstanceOf(
      WordsServerStartupError,
    );
    await expect(server.start(0)).rejects.toBeInstanceOf(
      WordsServerStartupError,
    );
    expect(loader).toHaveBeenCalledTimes(1);
    await server.stop();
  });

  it('rejects a valid-shaped dictionary with the wrong production count', async () => {
    const server = createWordsServer(
      { port: 0 },
      {
        dictionaryLoader: async () => ({
          success: true,
          dictionary: {} as never,
          wordCount: 79_369,
          manifest: {} as never,
        }),
      },
    );

    await expect(server.start(0)).rejects.toBeInstanceOf(
      WordsServerStartupError,
    );
    expect(server.httpServer.listening).toBe(false);
    await server.stop();
  });

  it('bounds the single lifecycle sweep interval', () => {
    expect(() =>
      createWordsServer(
        {},
        {
          lifecycleIntervalMs: 249,
        },
      ),
    ).toThrow(/250 to 500/);
    expect(() =>
      createWordsServer(
        {},
        {
          lifecycleIntervalMs: 501,
        },
      ),
    ).toThrow(/250 to 500/);
  });
});
