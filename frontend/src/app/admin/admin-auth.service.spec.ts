import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminAuthService } from './admin-auth.service';
import { csrfInterceptor } from './csrf.interceptor';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminAuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('logs in, refreshes CSRF and loads the session', async () => {
    const result = service.login('owner@example.com', 'correct-password-1');

    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.method).toBe('POST');
    expect(login.request.body).toEqual({
      email: 'owner@example.com',
      password: 'correct-password-1',
    });
    login.flush(null, { status: 204, statusText: 'No Content' });
    await tick();

    const csrf = http.expectOne('/api/v1/auth/csrf');
    expect(csrf.request.method).toBe('GET');
    csrf.flush({ headerName: 'X-XSRF-TOKEN' });
    await tick();

    const me = http.expectOne('/api/v1/auth/me');
    me.flush({ role: 'Owner', restaurants: [{ name: 'مطعم التجربة' }] });

    await expect(result).resolves.toBe('ok');
    expect(service.session()).toEqual({ role: 'Owner', restaurants: [{ name: 'مطعم التجربة' }] });
    expect(service.sessionChecked()).toBe(true);
  });

  it('maps 401 to a generic invalid result without revealing account state', async () => {
    const result = service.login('owner@example.com', 'wrong-password-1');
    const login = http.expectOne('/api/v1/auth/login');
    login.flush({ title: 'Invalid credentials.' }, { status: 401, statusText: 'Unauthorized' });
    await expect(result).resolves.toBe('invalid');
    expect(service.session()).toBeNull();
  });

  it('maps 429 to a rate-limited result', async () => {
    const result = service.login('owner@example.com', 'wrong-password-1');
    http
      .expectOne('/api/v1/auth/login')
      .flush({ title: 'Too many requests.' }, { status: 429, statusText: 'Too Many Requests' });
    await expect(result).resolves.toBe('rate-limited');
  });

  it('maps network failures to a generic error', async () => {
    const result = service.login('owner@example.com', 'some-password-12');
    http
      .expectOne('/api/v1/auth/login')
      .flush(null, { status: 0, statusText: 'Unknown Error' } as never);
    await expect(result).resolves.toBe('error');
  });

  it('coalesces concurrent session checks into one request and caches failures', async () => {
    const first = service.loadSession();
    const second = service.loadSession();
    const me = http.expectOne('/api/v1/auth/me');
    me.flush({ role: 'PlatformAdmin', restaurants: [] });
    await expect(first).resolves.toEqual({ role: 'PlatformAdmin', restaurants: [] });
    await expect(second).resolves.toEqual({ role: 'PlatformAdmin', restaurants: [] });

    const denied = service.loadSession(true);
    http
      .expectOne('/api/v1/auth/me')
      .flush({ title: 'Unauthorized.' }, { status: 401, statusText: 'Unauthorized' });
    await expect(denied).resolves.toBeNull();
    expect(service.session()).toBeNull();
  });

  it('recovers an already-active session on login 409 without resubmitting credentials', async () => {
    const result = service.login('owner@example.com', 'correct-password-1');
    const login = http.expectOne('/api/v1/auth/login');
    login.flush(
      { title: 'Sign out before signing in again.' },
      { status: 409, statusText: 'Conflict' },
    );
    await tick();

    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN' });
    await tick();
    http.expectOne('/api/v1/auth/me').flush({ role: 'Owner', restaurants: [] });

    await expect(result).resolves.toBe('ok');
    expect(service.session()?.role).toBe('Owner');
    // Exactly one login POST happened: credentials were never resubmitted.
    http.expectNone((request) => request.url === '/api/v1/auth/login');
  });

  it('clears the session after a confirmed logout', async () => {
    service.session.set({ role: 'Owner', restaurants: [] });
    const result = service.logout();
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await expect(result).resolves.toBe('ok');
    expect(service.session()).toBeNull();
  });

  it('treats a 401 logout as already signed out', async () => {
    service.session.set({ role: 'Owner', restaurants: [] });
    const result = service.logout();
    http
      .expectOne('/api/v1/auth/logout')
      .flush({ title: 'Unauthorized.' }, { status: 401, statusText: 'Unauthorized' });
    await expect(result).resolves.toBe('ok');
    expect(service.session()).toBeNull();
  });

  it('refreshes the CSRF token and retries once on a 400 logout', async () => {
    service.session.set({ role: 'Owner', restaurants: [] });
    const result = service.logout();
    http
      .expectOne('/api/v1/auth/logout')
      .flush({ title: 'Invalid CSRF token.' }, { status: 400, statusText: 'Bad Request' });
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN' });
    await tick();
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await expect(result).resolves.toBe('ok');
    expect(service.session()).toBeNull();
  });

  it('does not treat a non-204 2xx as a confirmed logout', async () => {
    service.session.set({ role: 'Owner', restaurants: [] });
    const result = service.logout();
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 200, statusText: 'OK' });
    await expect(result).resolves.toBe('error');
    expect(service.session()?.role).toBe('Owner');
  });

  it('keeps the session and reports an error when logout fails', async () => {
    service.session.set({ role: 'Owner', restaurants: [] });
    const result = service.logout();
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 500, statusText: 'Server Error' });
    await expect(result).resolves.toBe('error');
    // Fail-closed: the user is still signed in and must be offered a retry.
    expect(service.session()?.role).toBe('Owner');
  });

  it('keeps the session when the CSRF retry also fails', async () => {
    service.session.set({ role: 'Owner', restaurants: [] });
    const result = service.logout();
    http
      .expectOne('/api/v1/auth/logout')
      .flush({ title: 'Invalid CSRF token.' }, { status: 400, statusText: 'Bad Request' });
    await tick();
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN' });
    await tick();
    http
      .expectOne('/api/v1/auth/logout')
      .flush(null, { status: 429, statusText: 'Too Many Requests' });
    await expect(result).resolves.toBe('error');
    expect(service.session()?.role).toBe('Owner');
  });
});

describe('csrfInterceptor', () => {
  let http: HttpTestingController;

  function setCookie(value: string | null): void {
    if (value === null) {
      document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    } else {
      document.cookie = 'XSRF-TOKEN=' + value + '; path=/';
    }
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([csrfInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    setCookie('token-123');
  });

  afterEach(() => {
    setCookie(null);
    http.verify();
  });

  it('attaches the X-XSRF-TOKEN header to mutating API requests', async () => {
    const { HttpClient } = await import('@angular/common/http');
    const client = TestBed.inject(HttpClient);
    const call = new Promise((resolve) =>
      client.post('/api/v1/admin/categories', {}).subscribe(resolve),
    );
    const request = http.expectOne('/api/v1/admin/categories');
    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('token-123');
    request.flush({});
    await call;
  });

  it('leaves read-only API requests untouched', async () => {
    const { HttpClient } = await import('@angular/common/http');
    const client = TestBed.inject(HttpClient);
    const call = new Promise((resolve) => client.get('/api/v1/auth/me').subscribe(resolve));
    const request = http.expectOne('/api/v1/auth/me');
    expect(request.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    request.flush({});
    await call;
  });

  it('never leaks the token to non-API URLs', async () => {
    const { HttpClient } = await import('@angular/common/http');
    const client = TestBed.inject(HttpClient);
    const call = new Promise((resolve) =>
      client.post('https://evil.example/hook', {}).subscribe({ next: resolve, error: resolve }),
    );
    const request = http.expectOne('https://evil.example/hook');
    expect(request.request.headers.has('X-XSRF-TOKEN')).toBe(false);
    request.flush({}, { status: 200, statusText: 'OK' });
    await call;
  });
});
