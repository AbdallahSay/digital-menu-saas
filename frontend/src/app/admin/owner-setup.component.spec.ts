import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OwnerSetupComponent, parseSetupFragment } from './owner-setup.component';

const GUID = '0123456789abcdef0123456789abcdef';
const RAW = 'CfDJ8Abc+De/f123456==';
const TOKEN = btoa(RAW).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('parseSetupFragment', () => {
  it('reads user id and token from the fragment only', () => {
    const parts = parseSetupFragment(`#u=${GUID}&t=${TOKEN}`);
    expect(parts?.userId).toBe('01234567-89ab-cdef-0123-456789abcdef');
    expect(parts?.token).toBe(RAW);
  });
  it('rejects missing, malformed or oversized parts', () => {
    expect(parseSetupFragment('')).toBeNull();
    expect(parseSetupFragment('#u=zz&t=' + TOKEN)).toBeNull();
    expect(parseSetupFragment(`#u=${GUID}&t=short`)).toBeNull();
    expect(parseSetupFragment(`#u=${GUID}&t=${TOKEN}%2B`)).toBeNull();
    expect(parseSetupFragment(`#u=${GUID}&t=${'a'.repeat(5000)}`)).toBeNull();
  });
});

describe('OwnerSetupComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    window.history.replaceState(null, '', `/owner-setup#u=${GUID}&t=${TOKEN}`);
  });
  afterEach(() => {
    http.verify();
    window.history.replaceState(null, '', '/');
  });

  it('removes the token from the address bar and refuses weak or mismatched passwords locally', async () => {
    const c = TestBed.runInInjectionContext(() => new OwnerSetupComponent());
    expect(window.location.hash).toBe('');
    c.password = 'short';
    c.confirm = 'short';
    await c.submit(new Event('submit'));
    expect(c.error()).toContain('12');
    c.password = 'a-long-enough-password';
    c.confirm = 'different-long-password';
    await c.submit(new Event('submit'));
    expect(c.error()).toContain('مش متطابقتين');
    http.expectNone(() => true);
  });

  it('posts the parts once, then clears them and shows success', async () => {
    const c = TestBed.runInInjectionContext(() => new OwnerSetupComponent());
    c.password = c.confirm = 'a-long-enough-password';
    const done = c.submit(new Event('submit'));
    http.expectOne('/api/v1/auth/csrf').flush({});
    await Promise.resolve();
    await new Promise((r) => setTimeout(r));
    const req = http.expectOne('/api/v1/auth/onboarding');
    expect(req.request.body.userId).toBe('01234567-89ab-cdef-0123-456789abcdef');
    expect(req.request.body.token).toBe(RAW);
    req.flush(null, { status: 204, statusText: 'No Content' });
    await done;
    expect(c.state()).toBe('done');
    expect(c.password).toBe('');
  });

  it.each([200, 202])('does not show saved for an unexpected %i response', async (status) => {
    const c = TestBed.runInInjectionContext(() => new OwnerSetupComponent());
    c.password = c.confirm = 'a-long-enough-password';
    const done = c.submit(new Event('submit'));
    http.expectOne('/api/v1/auth/csrf').flush({});
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/v1/auth/onboarding').flush({}, { status, statusText: 'x' });
    await done;
    expect(c.state()).toBe('form');
    expect(c.error()).toContain('ما قدرناش نتأكد');
  });

  it('shows an invalid-link state and sends nothing when the fragment is missing', async () => {
    window.history.replaceState(null, '', '/owner-setup');
    const c = TestBed.runInInjectionContext(() => new OwnerSetupComponent());
    expect(c.state()).toBe('invalid-link');
    await c.submit(new Event('submit'));
    http.expectNone(() => true);
  });
});
