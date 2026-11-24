import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LeadsPanelComponent } from './leads-panel.component';

const lead = (id: string, status = 'New') => ({
  id,
  createdUtc: '2026-01-01T00:00:00Z',
  expiresUtc: '2026-01-08T00:00:00Z',
  contactName: 'Synthetic <b>x</b>',
  businessName: 'Synthetic Cafe',
  phone: '+201000000000',
  email: null,
  notes: 'n',
  status,
});
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('LeadsPanelComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const list = (items: unknown[]) =>
    http
      .expectOne((r) => r.method === 'GET' && r.url === '/api/v1/platform/leads')
      .flush({ page: 1, pageSize: 20, total: items.length, items });

  it('lists rows as text and shows an error when loading fails', async () => {
    const f = TestBed.createComponent(LeadsPanelComponent);
    f.detectChanges();
    list([lead('a')]);
    await f.whenStable();
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.textContent).toContain('Synthetic <b>x</b>');
    expect(el.querySelector('b')).toBeNull();
    const c = f.componentInstance;
    const again = c.load();
    http
      .expectOne((r) => r.url === '/api/v1/platform/leads')
      .flush(null, { status: 500, statusText: 'x' });
    await again;
    expect(c.message()?.kind).toBe('error');
  });

  it('changes status only to a known different value, then reloads', async () => {
    const c = TestBed.runInInjectionContext(() => new LeadsPanelComponent());
    list([lead('a')]);
    await tick();
    await c.setStatus(c.rows()[0], 'Bogus');
    await c.setStatus(c.rows()[0], 'New');
    const p = c.setStatus(c.rows()[0], 'Contacted');
    const req = http.expectOne((r) => r.method === 'PATCH');
    expect(req.request.url).toBe('/api/v1/platform/leads/a');
    expect(req.request.body).toEqual({ status: 'Contacted' });
    req.flush({});
    await tick();
    list([lead('a', 'Contacted')]);
    await p;
    expect(c.rows()[0].status).toBe('Contacted');
    expect(c.message()?.kind).toBe('ok');
  });

  it('deletes only after the visible confirm and reports failure', async () => {
    const c = TestBed.runInInjectionContext(() => new LeadsPanelComponent());
    list([lead('a')]);
    await tick();
    c.confirmDelete.set('a');
    http.expectNone((r) => r.method === 'DELETE');
    const p = c.remove(c.rows()[0]);
    http.expectOne((r) => r.method === 'DELETE').flush(null, { status: 500, statusText: 'x' });
    await p;
    expect(c.message()?.kind).toBe('error');
    expect(c.confirmDelete()).toBeNull();
  });
});
