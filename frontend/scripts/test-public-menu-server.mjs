import assert from 'node:assert/strict';
import { test } from 'node:test';
import { origin } from '../src/origin.ts';

/**
 * Origin validation contract (docs/09-DEVOPS): public origins must be https
 * (or local http for development); the internal API origin additionally
 * accepts plain HTTP to a private-network service name only behind the
 * explicit operator opt-in used by compose.yaml.
 */

test('public origins require https or local http', () => {
  assert.equal(
    origin('https://menusaas-demo-web.azurewebsites.net'),
    'https://menusaas-demo-web.azurewebsites.net',
  );
  assert.equal(origin('http://localhost:4000'), 'http://localhost:4000');
  assert.equal(origin('http://127.0.0.1:4000'), 'http://127.0.0.1:4000');
  for (const bad of [
    'http://example.com',
    'http://web:8080',
    'https://user@example.com',
    'https://example.com/path',
    'https://example.com/?x=1',
  ]) {
    assert.throws(() => origin(bad), /Invalid public origin/, bad);
  }
});

test('the internal origin rejects non-loopback http by default', () => {
  // The compose upstream value must fail closed without the opt-in.
  assert.throws(() => origin('http://api:5080', true), /Invalid internal API origin/);
  assert.throws(() => origin('http://api:5080', true, false), /Invalid internal API origin/);
});

test('the internal origin accepts the exact compose value behind the opt-in', () => {
  assert.equal(origin('http://api:5080', true, true), 'http://api:5080');
});

test('the opt-in never widens the public origin', () => {
  assert.throws(() => origin('http://example.com', false, true), /Invalid public origin/);
});

test('the opt-in is confined to private-network hosts', () => {
  // Public DNS names and public IP literals stay rejected even with the flag.
  for (const bad of [
    'http://example.com',
    'http://api.example.internal.example.com',
    'http://8.8.8.8',
    'http://172.32.0.1',
    'http://11.0.0.1',
    // IPv6 literals have no dot and must not slip through the service-name
    // branch; ULA/link-local are not accepted either (use a service name).
    'http://[2606:4700:4700::1111]',
    'http://[2001:4860:4860::8888]',
    'http://[fd00::1]',
    'http://[fe80::1]',
  ]) {
    assert.throws(() => origin(bad, true, true), /Invalid internal API origin/, bad);
  }
  // Single-label service names and RFC1918/link-local literals pass.
  for (const good of [
    'http://api:5080',
    'http://menu-api',
    'http://10.0.0.5:5080',
    'http://172.16.0.3',
    'http://192.168.1.10',
    'http://169.254.0.2',
  ]) {
    assert.equal(origin(good, true, true), good, good);
  }
});

test('the opt-in still rejects credentials, paths and non-http schemes', () => {
  for (const bad of ['http://user:pass@api:5080', 'http://api:5080/api', 'gopher://api:5080']) {
    assert.throws(() => origin(bad, true, true), /Invalid internal API origin/, bad);
  }
});

test('https internal origins keep working without the opt-in', () => {
  assert.equal(
    origin('https://menusaas-demo-api.azurewebsites.net', true),
    'https://menusaas-demo-api.azurewebsites.net',
  );
});
