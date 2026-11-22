/**
 * Server Boot Regression Tests — SSR bind address
 *
 * Guards the production bind behavior of the built SSR bundle: with no flag the
 * server must bind all interfaces (the deployed container sits behind the
 * platform/edge terminator, which is the sole ingress); with F01_LOCAL_ONLY=1 it
 * must bind loopback only. A regression here either makes the deployed app
 * unreachable or exposes a local-only server to the network.
 *
 * The listen address is read from /proc/net/tcp for the child process's LISTEN
 * sockets, so the assertion is about the actual socket, not the source string.
 * /proc/net/tcp is namespace-wide, so each child gets a freshly allocated free
 * port to keep the lookup unambiguous. Linux-only: the suite skips elsewhere.
 *
 * Requires the built bundle at dist/digital-menu/server/server.mjs.
 * Run: node --test scripts/test-server-boot.mjs
 */

import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { platform } from 'node:os';

const BUNDLE = 'dist/digital-menu/server/server.mjs';
const LISTEN_STATE = '0A';
const ANY_IPV4 = '00000000';
const LOOPBACK_IPV4 = '0100007F';
const isLinux = platform() === 'linux';

const children = new Set();

after(async () => {
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null) return resolve();
          child.once('exit', resolve);
          child.kill('SIGTERM');
        }),
    ),
  );
});

/** A port the kernel just confirmed free, so /proc lookups match only the child. */
async function freePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function listenAddresses(port) {
  const hexPort = port.toString(16).toUpperCase().padStart(4, '0');
  const addresses = [];
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let lines;
    try {
      lines = readFileSync(table, 'utf8').split('\n');
    } catch {
      continue;
    }
    for (const line of lines.slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length > 3 && cols[3] === LISTEN_STATE && cols[1].endsWith(':' + hexPort)) {
        addresses.push(cols[1].split(':')[0]);
      }
    }
  }
  return addresses;
}

async function startServer(extraEnv) {
  const port = await freePort();
  const child = spawn(process.execPath, [BUNDLE], {
    env: { ...process.env, PORT: String(port), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const deadline = Date.now() + 15000;
  let addresses = [];
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    addresses = listenAddresses(port);
    if (addresses.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (addresses.length === 0) {
    throw new Error(`SSR bundle did not listen on port ${port}. Output: ${output}`);
  }
  // The listen callback logs before the socket is observable, but pipe delivery
  // is asynchronous: wait for the startup line instead of assuming it arrived.
  while (!output.includes('listening') && Date.now() < deadline && child.exitCode === null) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { port, addresses, output };
}

describe('built SSR bundle boot', { skip: !isLinux }, () => {
  it('binds all interfaces when no flag is set (production ingress)', async () => {
    const { port, addresses, output } = await startServer({ F01_LOCAL_ONLY: '' });
    assert.match(output, /SSR listening/);
    assert.ok(
      addresses.includes(ANY_IPV4),
      `expected a 0.0.0.0 listener, got ${addresses.join(', ')}`,
    );
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
  });

  it('binds loopback only with F01_LOCAL_ONLY=1', async () => {
    const { addresses, output } = await startServer({ F01_LOCAL_ONLY: '1' });
    assert.match(output, /Local SSR listening/);
    assert.deepEqual(
      addresses,
      [LOOPBACK_IPV4],
      `expected a 127.0.0.1-only listener, got ${addresses.join(', ')}`,
    );
  });
});
