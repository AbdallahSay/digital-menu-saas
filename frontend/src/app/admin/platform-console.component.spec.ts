import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AdminAuthService } from './admin-auth.service';
import {
  PAGE_SIZE,
  PlatformConsoleComponent,
  PlatformRestaurant,
  SLUG_PATTERN,
  describePlatformError,
} from './platform-console.component';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const row = (n: number, extra: Partial<PlatformRestaurant> = {}): PlatformRestaurant => ({
  id: `id-${n}`,
  name: `مطعم ${n}`,
  slug: `r-${n}`,
  publicCode: `code${n}`,
  status: 'Active',
  isPublished: false,
  publishedMenuVersion: 1,
  rowVersion: `rv-${n}`,
  ...extra,
});

describe('platform console helpers', () => {
  it('accepts only lowercase hyphenated slugs', () => {
    expect(SLUG_PATTERN.test('my-cafe-2')).toBe(true);
    for (const bad of ['My-Cafe', 'a_b', '-a', 'a-', 'a--b', 'مطعم', '']) {
      expect(SLUG_PATTERN.test(bad)).toBe(false);
    }
  });
  it('maps API failures to safe owner-facing messages', () => {
    const msg = (status: number) => describePlatformError(new HttpErrorResponse({ status }));
    expect(msg(409)).toContain('مستخدم');
    expect(msg(412)).toContain('حدّث');
    expect(describePlatformError(new HttpErrorResponse({ status: 503 }), 'create')).toContain(
      'مفيش حساب اتعمل',
    );
    expect(msg(503)).not.toContain('مفيش حساب');
    expect(msg(503)).toContain('الخدمة مش متاحة');
    expect(msg(500)).toContain('حصل خطأ');
    expect(describePlatformError(new Error('boom'))).toContain('حصل خطأ');
  });
});

describe('PlatformConsoleComponent HTTP behavior', () => {
  let http: HttpTestingController;
  let c: PlatformConsoleComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AdminAuthService, useValue: { logout: async () => 'ok' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    c = TestBed.runInInjectionContext(() => new PlatformConsoleComponent());
  });
  afterEach(() => http.verify());

  const list = (rows: PlatformRestaurant[], total = rows.length) => {
    const req = http.expectOne(
      (r) => r.url === '/api/v1/platform/restaurants' && r.method === 'GET',
    );
    req.flush({ page: 1, pageSize: PAGE_SIZE, total, items: rows });
    return req;
  };

  it('loads page 1 with the page size and keeps the total', async () => {
    const req = http.expectOne((r) => r.url === '/api/v1/platform/restaurants');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe(String(PAGE_SIZE));
    req.flush({ page: 1, pageSize: PAGE_SIZE, total: 250, items: [row(1)] });
    await tick();
    expect(c.total()).toBe(250);
    expect(c.pageCount()).toBe(13);
  });

  it('requests the next page and resets to page 1 on search', async () => {
    list([row(1)], 250);
    await tick();
    const next = c.goToPage(2);
    const req = http.expectOne((r) => r.params.get('page') === '2');
    req.flush({ page: 2, pageSize: PAGE_SIZE, total: 250, items: [row(21)] });
    await next;
    expect(c.page()).toBe(2);
    c.search = 'cafe';
    const s = c.runSearch();
    const sreq = http.expectOne((r) => r.params.get('search') === 'cafe');
    expect(sreq.request.params.get('page')).toBe('1');
    sreq.flush({ page: 1, pageSize: PAGE_SIZE, total: 1, items: [row(2)] });
    await s;
    expect(c.page()).toBe(1);
  });

  it('applies only the newest of overlapping loads', async () => {
    list([row(1)]);
    await tick();
    const first = c.load(1);
    const firstReq = http.expectOne('/api/v1/platform/restaurants?page=1&pageSize=20');
    const second = c.load(1);
    const secondReq = http.expectOne('/api/v1/platform/restaurants?page=1&pageSize=20');
    secondReq.flush({ page: 1, pageSize: 20, total: 1, items: [row(1, { rowVersion: 'new' })] });
    await second;
    firstReq.flush({ page: 1, pageSize: 20, total: 1, items: [row(1, { rowVersion: 'stale' })] });
    await first;
    expect(c.rows()[0].rowVersion).toBe('new');
  });

  it('sends one create request for repeated submits and refreshes the list', async () => {
    list([]);
    await tick();
    c.name = 'مطعم جديد';
    c.slug = 'new-place';
    c.ownerEmail = 'o@example.test';
    const a = c.create();
    const b = c.create();
    const post = http.expectOne((r) => r.method === 'POST');
    expect(post.request.body).toEqual({
      name: 'مطعم جديد',
      slug: 'new-place',
      ownerEmail: 'o@example.test',
    });
    post.flush({});
    await tick();
    list([row(1)]);
    await Promise.all([a, b]);
    expect(c.busy()).toBe(false);
    expect(c.message()?.kind).toBe('ok');
  });

  it('shows a conflict message and sends nothing for an invalid slug', async () => {
    list([]);
    await tick();
    c.name = 'x';
    c.slug = 'Bad Slug';
    c.ownerEmail = 'o@example.test';
    await c.create();
    http.expectNone((r) => r.method === 'POST');
    expect(c.message()?.kind).toBe('error');
    c.slug = 'ok-slug';
    const p = c.create();
    http.expectOne((r) => r.method === 'POST').flush({}, { status: 409, statusText: 'Conflict' });
    await p;
    expect(c.message()?.text).toContain('مستخدم');
  });

  it('sends the row version with publication and status changes and reports 412 on the row', async () => {
    const r = row(1, { isPublished: false });
    list([r]);
    await tick();
    const p = c.publish(r);
    const pub = http.expectOne((x) => x.method === 'PATCH' && x.url.endsWith('/publication'));
    expect(pub.request.body).toEqual({ isPublished: true, rowVersion: 'rv-1' });
    pub.flush({});
    await tick();
    list([row(1, { isPublished: true, rowVersion: 'rv-1b' })]);
    await p;
    expect(c.rowMessage()?.id).toBe('id-1');
    const t = c.toggleStatus(c.rows()[0]);
    const st = http.expectOne((x) => x.method === 'PATCH' && x.url.endsWith('/status'));
    expect(st.request.body).toEqual({ status: 'Suspended', rowVersion: 'rv-1b' });
    st.flush({}, { status: 412, statusText: 'Precondition Failed' });
    await t;
    expect(c.rowMessage()).toMatchObject({ id: 'id-1', kind: 'error' });
    expect(c.rowMessage()?.text).toContain('حدّث');
  });
});
