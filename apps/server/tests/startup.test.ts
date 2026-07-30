import { describe, expect, it, vi } from 'vitest';

import type { ProductionDictionaryLoadResult } from '@words/game-data';

import {
  createWordsServer,
  WordsServerStartupError,
  WordsServerStoppedError,
} from '../src/server.js';
import { RoomOperationError } from '../src/room-store.js';

const productionManifestIdentity = {
  wordCount: 79_370,
  sha256: 'f5f3d22bd07b8f8d2dd8cf4f3caff211b6f3249a24da02c5aa2a21bf2210f352',
  sourceRelease: 'rel-2026.02.25',
  sourceCommit: '7e99edab8e32f9f9ea2b15f249ca8d4d67237410',
} as const;

type ProductionManifestIdentity = {
  wordCount: number;
  sha256: string;
  sourceRelease: string;
  sourceCommit: string;
};

function successfulDictionaryLoad(
  manifest: ProductionManifestIdentity = productionManifestIdentity,
): Extract<ProductionDictionaryLoadResult, { success: true }> {
  return {
    success: true,
    dictionary: {} as never,
    wordCount: 79_370,
    manifest: manifest as never,
  };
}

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe('Words server production-data startup', () => {
  it('accepts the verified production dictionary through the real loader', async () => {
    const server = createWordsServer(
      { port: 0 },
      { listen: async () => 12_345 },
    );

    await expect(server.start(0)).resolves.toBe(12_345);
    expect(
      server.roomStore.createDisplay('after-real-load').room.code,
    ).toHaveLength(6);
    await server.stop();
  });

  it('loads the expected dictionary once before accepting rooms', async () => {
    const loader = vi.fn(async () => successfulDictionaryLoad());
    const fakeTimer = {
      unref: vi.fn(),
    } as unknown as ReturnType<typeof setInterval>;
    const scheduleInterval = vi.fn(() => fakeTimer);
    const clearInterval = vi.fn();
    const server = createWordsServer(
      { port: 0 },
      {
        dictionaryLoader: loader,
        listen: async () => 12_345,
        setInterval: scheduleInterval,
        clearInterval,
      },
    );

    expect(server.httpServer.listening).toBe(false);
    const firstPort = await server.start(0);
    expect(firstPort).toBe(12_345);
    expect(server.httpServer.listening).toBe(false);
    expect(
      server.roomStore.createDisplay('after-start').room.code,
    ).toHaveLength(6);
    await expect(server.start(0)).resolves.toBe(firstPort);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(scheduleInterval).toHaveBeenCalledTimes(1);
    expect(fakeTimer.unref).toHaveBeenCalledTimes(1);
    await server.stop();
    expect(clearInterval).toHaveBeenCalledTimes(1);
    expect(clearInterval).toHaveBeenCalledWith(fakeTimer);
    await server.stop();
    expect(clearInterval).toHaveBeenCalledTimes(1);
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
          manifest: productionManifestIdentity as never,
        }),
      },
    );

    await expect(server.start(0)).rejects.toBeInstanceOf(
      WordsServerStartupError,
    );
    expect(server.httpServer.listening).toBe(false);
    await server.stop();
  });

  it.each([
    ['checksum', { ...productionManifestIdentity, sha256: '0'.repeat(64) }],
    [
      'source release',
      { ...productionManifestIdentity, sourceRelease: 'rel-unexpected' },
    ],
    [
      'source commit',
      { ...productionManifestIdentity, sourceCommit: '0'.repeat(40) },
    ],
  ])('rejects the wrong production %s identity', async (_label, manifest) => {
    const server = createWordsServer(
      { port: 0 },
      {
        dictionaryLoader: async () => successfulDictionaryLoad(manifest),
      },
    );

    await expect(server.start(0)).rejects.toBeInstanceOf(
      WordsServerStartupError,
    );
    expect(server.httpServer.listening).toBe(false);
    await server.stop();
  });

  it('fails closed for a malformed successful loader result', async () => {
    const server = createWordsServer(
      { port: 0 },
      {
        dictionaryLoader: async () =>
          ({
            success: true,
            wordCount: 79_370,
            manifest: null,
          }) as never,
      },
    );

    await expect(server.start(0)).rejects.toMatchObject({
      code: 'GAME_DATA_STARTUP_FAILED',
    });
    expect(server.httpServer.listening).toBe(false);
    await server.stop();
  });

  it('shares one pending start and loads production data once', async () => {
    const load = deferred<ProductionDictionaryLoadResult>();
    const loader = vi.fn(() => load.promise);
    const listen = vi.fn(async () => 12_345);
    const server = createWordsServer(
      { port: 0 },
      {
        dictionaryLoader: loader,
        listen,
      },
    );
    const firstStart = server.start(0);
    const secondStart = server.start(0);

    expect(firstStart).toBe(secondStart);
    expect(loader).toHaveBeenCalledTimes(1);
    load.resolve(successfulDictionaryLoad());
    await expect(firstStart).resolves.toBeGreaterThan(0);
    await expect(secondStart).resolves.toBeGreaterThan(0);
    expect(listen).toHaveBeenCalledTimes(1);
    await server.stop();
  });

  it('does not listen or schedule after stop wins a pending startup race', async () => {
    const load = deferred<ProductionDictionaryLoadResult>();
    const scheduleInterval = vi.fn<typeof setInterval>();
    const listen = vi.fn(async () => 12_345);
    const server = createWordsServer(
      { port: 0 },
      {
        dictionaryLoader: () => load.promise,
        setInterval: scheduleInterval,
        listen,
      },
    );
    const pendingStart = server.start(0);

    await server.stop();
    load.resolve(successfulDictionaryLoad());
    await expect(pendingStart).rejects.toBeInstanceOf(WordsServerStoppedError);
    expect(server.httpServer.listening).toBe(false);
    expect(scheduleInterval).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
    await expect(server.start(0)).rejects.toBeInstanceOf(
      WordsServerStoppedError,
    );
    await server.stop();
  });

  it('does not schedule lifecycle work when stop wins during listen', async () => {
    const pendingListen = deferred<number>();
    const listen = vi.fn(() => pendingListen.promise);
    const scheduleInterval = vi.fn<typeof setInterval>();
    const server = createWordsServer(
      { port: 0 },
      {
        dictionaryLoader: async () => successfulDictionaryLoad(),
        listen,
        setInterval: scheduleInterval,
      },
    );
    const pendingStart = server.start(0);
    await vi.waitFor(() => expect(listen).toHaveBeenCalledTimes(1));

    await server.stop();
    pendingListen.resolve(12_345);
    await expect(pendingStart).rejects.toBeInstanceOf(WordsServerStoppedError);
    expect(scheduleInterval).not.toHaveBeenCalled();
    expect(server.httpServer.listening).toBe(false);
  });

  it('stays stopped when stop is called before start', async () => {
    const loader = vi.fn(async () => successfulDictionaryLoad());
    const server = createWordsServer({ port: 0 }, { dictionaryLoader: loader });

    await server.stop();
    await expect(server.start(0)).rejects.toMatchObject({
      code: 'SERVER_STOPPED',
    });
    expect(loader).not.toHaveBeenCalled();
    expect(server.httpServer.listening).toBe(false);
    await server.stop();
  });

  it('wraps listen failures without exposing platform details', async () => {
    const server = createWordsServer(
      { port: 0 },
      {
        dictionaryLoader: async () => successfulDictionaryLoad(),
        listen: async () => {
          throw new Error('private platform detail');
        },
      },
    );

    await expect(server.start(0)).rejects.toMatchObject({
      code: 'SERVER_LISTEN_FAILED',
      message: 'Words server startup failed while opening its network port.',
    });
    expect(server.httpServer.listening).toBe(false);
    await server.stop();
  });

  it('contains one failed lifecycle sweep so the interval can retry', async () => {
    let lifecycleSweep: (() => void) | undefined;
    const fakeTimer = {
      unref: vi.fn(),
    } as unknown as ReturnType<typeof setInterval>;
    const server = createWordsServer(
      { port: 0 },
      {
        dictionaryLoader: async () => successfulDictionaryLoad(),
        listen: async () => 12_345,
        setInterval: (callback) => {
          lifecycleSweep = callback;
          return fakeTimer;
        },
      },
    );
    const advanceDueRounds = vi
      .spyOn(server.roomStore, 'advanceDueRounds')
      .mockImplementationOnce(() => {
        throw new Error('private sweep detail');
      })
      .mockReturnValue([]);
    await server.start(0);

    expect(() => lifecycleSweep?.()).not.toThrow();
    expect(() => lifecycleSweep?.()).not.toThrow();
    expect(advanceDueRounds).toHaveBeenCalledTimes(2);
    await server.stop();
  });

  it('bounds the single lifecycle sweep interval', async () => {
    for (const invalid of [
      249,
      501,
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      250.5,
    ]) {
      expect(() =>
        createWordsServer(
          {},
          {
            lifecycleIntervalMs: invalid,
          },
        ),
      ).toThrow(/250 to 500/);
    }
    for (const valid of [250, 500]) {
      const server = createWordsServer(
        {},
        {
          lifecycleIntervalMs: valid,
        },
      );
      await server.stop();
    }
  });
});
