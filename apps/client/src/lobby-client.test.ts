import { beforeEach, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';

import type { ClientToServerEvents, ServerToClientEvents } from '@words/shared';

import { SocketLobbyClient } from './lobby-client';
import {
  enablePerformanceDiagnosticsForTests,
  resetPerformanceDiagnosticsForTests,
} from './performance-diagnostics';

type Listener = (...arguments_: unknown[]) => void;

class FakeEmitter {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  trigger(event: string, ...arguments_: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...arguments_);
    }
  }

  listenerCount(event: string) {
    return this.listeners.get(event)?.size ?? 0;
  }
}

class FakeEngine extends FakeEmitter {
  transport = { name: 'polling' };
}

class FakeManager extends FakeEmitter {
  engine = new FakeEngine();
}

class FakeSocket extends FakeEmitter {
  connected = false;
  active = false;
  io = new FakeManager();
}

function createClient() {
  const socket = new FakeSocket();
  const client = new SocketLobbyClient(
    socket as unknown as Socket<ServerToClientEvents, ClientToServerEvents>,
  );
  return { client, socket };
}

beforeEach(() => {
  resetPerformanceDiagnosticsForTests();
  enablePerformanceDiagnosticsForTests();
});

describe('SocketLobbyClient performance diagnostics', () => {
  it('reports polling and observes a transport upgrade and Engine.IO packets', () => {
    const { client, socket } = createClient();
    const cleanup = client.enablePerformanceDiagnostics();
    socket.io.trigger('open');

    expect(client.getPerformanceDiagnostics().transport).toBe('polling');
    socket.io.engine.trigger('packet', { type: 'ping' });
    socket.io.engine.trigger('packetCreate', { type: 'pong' });
    socket.io.engine.transport = { name: 'websocket' };
    socket.io.engine.trigger('upgrade', socket.io.engine.transport);

    expect(client.getPerformanceDiagnostics()).toMatchObject({
      transport: 'websocket',
      transportUpgrades: 1,
      enginePacketsReceived: 1,
      enginePacketsSent: 1,
    });
    cleanup();
  });

  it('counts connections, reconnects, status transitions, and room events', () => {
    const { client, socket } = createClient();
    const cleanup = client.enablePerformanceDiagnostics();

    socket.connected = true;
    socket.trigger('connect');
    socket.trigger('room:state', {});
    socket.trigger('room:error', {});
    socket.connected = false;
    socket.trigger('disconnect');
    socket.io.trigger('reconnect', 1);
    socket.connected = true;
    socket.trigger('connect');

    expect(client.getPerformanceDiagnostics()).toMatchObject({
      connected: true,
      connections: 2,
      reconnects: 1,
      connectionStatusTransitions: 3,
      roomStatesReceived: 1,
      roomErrorsReceived: 1,
    });
    cleanup();
  });

  it('removes every diagnostic listener without changing normal socket state', () => {
    const { client, socket } = createClient();
    const cleanup = client.enablePerformanceDiagnostics();
    socket.io.trigger('open');
    cleanup();
    const before = client.getPerformanceDiagnostics();

    socket.trigger('connect');
    socket.trigger('room:state', {});
    socket.io.trigger('reconnect', 1);
    socket.io.engine.trigger('packet', {});
    socket.io.engine.trigger('upgrade', { name: 'websocket' });

    expect(client.getConnectionStatus()).toBe('disconnected');
    expect(client.getPerformanceDiagnostics()).toEqual(before);
    expect(socket.listenerCount('connect')).toBe(0);
    expect(socket.listenerCount('room:state')).toBe(0);
    expect(socket.io.listenerCount('open')).toBe(0);
    expect(socket.io.listenerCount('reconnect')).toBe(0);
    expect(socket.io.engine.listenerCount('packet')).toBe(0);
    expect(socket.io.engine.listenerCount('packetCreate')).toBe(0);
    expect(socket.io.engine.listenerCount('upgrade')).toBe(0);
  });

  it('adds no diagnostic listeners when perf mode is disabled', () => {
    resetPerformanceDiagnosticsForTests();
    const { client, socket } = createClient();

    client.enablePerformanceDiagnostics();

    expect(socket.listenerCount('connect')).toBe(0);
    expect(socket.listenerCount('room:state')).toBe(0);
    expect(socket.io.listenerCount('open')).toBe(0);
    expect(socket.io.engine.listenerCount('packet')).toBe(0);
  });
});
