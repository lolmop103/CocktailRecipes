import { createServer, request, Agent, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { connect } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installShutdown } from '../src/lib/shutdown.js';
import { logger } from '../src/lib/logger.js';

const servers: Server[] = [];
const cleanups: Array<() => void> = [];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const fn of cleanups.splice(0)) fn();
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    s.close();
  }
});

async function start(handler: Parameters<typeof createServer>[1]): Promise<Server> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return server;
}

const portOf = (s: Server) => (s.address() as AddressInfo).port;

function get(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(
      { port, host: '127.0.0.1', agent: new Agent({ keepAlive: false }) },
      (res) => {
        let body = '';
        res.on('data', (c: Buffer) => (body += c.toString()));
        res.on('end', () => resolve(body));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function setup(server: Server, opts: { closeDb?: () => void; forceAfterMs?: number } = {}) {
  const exit = vi.fn<(code: number) => void>();
  const closeDb = opts.closeDb ?? vi.fn();
  const shutdown = installShutdown(server, {
    closeDb,
    exit,
    ...(opts.forceAfterMs !== undefined ? { forceAfterMs: opts.forceAfterMs } : {}),
    signals: [],
  });
  return { exit, closeDb, shutdown };
}

const waitFor = (fn: () => boolean) => vi.waitFor(() => expect(fn()).toBe(true));

describe('installShutdown', () => {
  it('installShutdown_defaultSignals_registersSigtermAndSigintHandlers', () => {
    const before = {
      SIGTERM: process.listeners('SIGTERM'),
      SIGINT: process.listeners('SIGINT'),
    };
    const server = createServer();
    installShutdown(server, { closeDb: () => {}, exit: () => {} });
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      const added = process.listeners(signal).filter((l) => !before[signal].includes(l));
      expect(added).toHaveLength(1);
      for (const l of added) process.removeListener(signal, l);
    }
  });

  it('shutdown_idleServer_closesDbAfterCloseCallbackThenExits0', async () => {
    const server = await start((_req, res) => res.end('ok'));
    const port = portOf(server);
    const order: string[] = [];
    const { exit, shutdown } = setup(server, { closeDb: () => order.push('closeDb') });
    server.on('close', () => order.push('closed'));
    shutdown();
    await waitFor(() => exit.mock.calls.length > 0);
    expect(order).toEqual(['closed', 'closeDb']);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    await expect(get(port)).rejects.toThrow();
  });

  it('shutdown_idleKeepAliveConnection_exits0WithoutWaiting', async () => {
    const server = await start((_req, res) => res.end('ok'));
    const socket = connect(portOf(server), '127.0.0.1');
    cleanups.push(() => socket.destroy());
    socket.write('GET / HTTP/1.1\r\nHost: x\r\nConnection: keep-alive\r\n\r\n');
    await new Promise((r) => socket.once('data', r));
    const { exit, shutdown } = setup(server);
    shutdown();
    await waitFor(() => exit.mock.calls.length > 0);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('shutdown_inFlightRequest_finishesBeforeDbCloses', async () => {
    let release: () => void = () => {};
    let arrived: () => void = () => {};
    const inHandler = new Promise<void>((r) => (arrived = r));
    const order: string[] = [];
    const server = await start((_req, res) => {
      arrived();
      res.on('finish', () => order.push('response'));
      release = () => res.end('slow-done');
    });
    const { exit, shutdown } = setup(server, { closeDb: () => order.push('closeDb') });
    const pending = get(portOf(server));
    await inHandler;
    shutdown();
    await new Promise((r) => setTimeout(r, 30));
    expect(order).toEqual([]);
    expect(exit).not.toHaveBeenCalled();
    release();
    expect(await pending).toBe('slow-done');
    await waitFor(() => exit.mock.calls.length > 0);
    expect(order).toEqual(['response', 'closeDb']);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('shutdown_inFlightKeepAliveRequest_endsSocketOnceAnswered', async () => {
    let release: () => void = () => {};
    let arrived: () => void = () => {};
    const inHandler = new Promise<void>((r) => (arrived = r));
    const order: string[] = [];
    const server = await start((_req, res) => {
      arrived();
      res.on('finish', () => order.push('response'));
      release = () => res.end('slow-done');
    });
    const { exit, shutdown } = setup(server, { closeDb: () => order.push('closeDb') });
    const agent = new Agent({ keepAlive: true });
    cleanups.push(() => agent.destroy());
    const pending = new Promise<string>((resolve, reject) => {
      const req = request({ port: portOf(server), host: '127.0.0.1', agent }, (res) => {
        let body = '';
        res.on('data', (c: Buffer) => (body += c.toString()));
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.end();
    });
    await inHandler;
    shutdown();
    const t0 = Date.now();
    release();
    expect(await pending).toBe('slow-done');
    await waitFor(() => exit.mock.calls.length > 0);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(order).toEqual(['response', 'closeDb']);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('shutdown_requestNeverFinishes_forcesExit1WithErrorLog', async () => {
    let arrived: () => void = () => {};
    const inHandler = new Promise<void>((r) => (arrived = r));
    const server = await start(() => arrived());
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { exit, closeDb, shutdown } = setup(server, { forceAfterMs: 50 });
    const pending = get(portOf(server)).catch(() => 'aborted');
    await inHandler;
    shutdown();
    await waitFor(() => exit.mock.calls.length > 0);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(errorLog).toHaveBeenCalled();
    expect(closeDb).not.toHaveBeenCalled();
    server.closeAllConnections();
    await pending;
  });

  it('shutdown_secondSignal_exits1AtOnce', async () => {
    let arrived: () => void = () => {};
    const inHandler = new Promise<void>((r) => (arrived = r));
    const server = await start(() => arrived());
    const { exit, shutdown } = setup(server);
    const pending = get(portOf(server)).catch(() => 'aborted');
    await inHandler;
    shutdown();
    expect(exit).not.toHaveBeenCalled();
    shutdown();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    server.closeAllConnections();
    await pending;
  });

  it('shutdown_closeDbThrows_logsAndExits1', async () => {
    const server = await start((_req, res) => res.end('ok'));
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { exit, shutdown } = setup(server, {
      closeDb: () => {
        throw new Error('db busy');
      },
    });
    shutdown();
    await waitFor(() => exit.mock.calls.length > 0);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(errorLog).toHaveBeenCalled();
  });

  it('shutdown_beforeFirstSignal_createsNoTimerAndUnrefsForceTimer', () => {
    vi.useFakeTimers();
    const server = createServer();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const { shutdown } = setup(server, { forceAfterMs: 8000 });
    expect(vi.getTimerCount()).toBe(0);
    shutdown();
    expect(vi.getTimerCount()).toBe(1);
    const timer = setTimeoutSpy.mock.results[0]!.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
  });

  it('shutdown_closeDbThrowsNonError_logsAndExits1', async () => {
    const server = await start((_req, res) => res.end('ok'));
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const { exit, shutdown } = setup(server, {
      closeDb: () => {
        const thrown: unknown = 'db busy';
        throw thrown;
      },
    });
    shutdown();
    await waitFor(() => exit.mock.calls.length > 0);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(errorLog).toHaveBeenCalledWith('Closing the database failed', { error: 'db busy' });
  });
});
