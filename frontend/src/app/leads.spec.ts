import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LeadIntakeService, LeadPayload, PRIVACY_NOTICE_SHA256 } from './leads';

const payload: LeadPayload = {
  contactName: 'Synthetic',
  businessName: 'Synthetic Cafe',
  phone: '000',
  notes: '',
  consent: true,
  noticeVersion: 'v1',
  website: '',
};

describe('LeadIntakeService', () => {
  let http: HttpTestingController;
  let svc: LeadIntakeService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    svc = TestBed.inject(LeadIntakeService);
  });
  afterEach(() => http.verify());

  async function submitWith(status: number | 'ok200') {
    const p = svc.submit(payload);
    await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').flush({});
    await Promise.resolve();
    const req = http.expectOne('/api/v1/auth/leads');
    if (status === 'ok200') req.flush({}, { status: 200, statusText: 'OK' });
    else req.flush(null, { status, statusText: 'x' });
    return p;
  }

  it('is created only on exactly 201', async () => {
    expect(await submitWith(201)).toBe('created');
  });
  it('does not treat 200 or 204 as success', async () => {
    expect(await submitWith('ok200')).toBe('unconfirmed');
    expect(await submitWith(204)).toBe('unconfirmed');
  });
  it('maps failures', async () => {
    expect(await submitWith(400)).toBe('invalid');
    expect(await submitWith(415)).toBe('invalid');
    expect(await submitWith(429)).toBe('rate');
    expect(await submitWith(503)).toBe('closed');
    expect(await submitWith(500)).toBe('error');
  });
  it('csrf failure never reports success', async () => {
    const p = svc.submit(payload);
    await Promise.resolve();
    http.expectOne('/api/v1/auth/csrf').flush(null, { status: 502, statusText: 'Bad' });
    expect(await p).toBe('error');
  });
  it('status fails closed', async () => {
    let p = svc.status();
    http.expectOne('/api/v1/leads/status').flush(null, { status: 500, statusText: 'x' });
    expect(await p).toBeNull();
    p = svc.status();
    http.expectOne('/api/v1/leads/status').flush({ open: true, noticeVersion: 'v1' });
    expect((await p)?.open).toBe(false);
    p = svc.status();
    http.expectOne('/api/v1/leads/status').flush({
      open: true,
      noticeVersion: 'v1',
      retentionDays: 30,
      controllerName: 'SYNTHETIC',
      contactChannel: 'SYNTHETIC',
      noticeContentSha256: PRIVACY_NOTICE_SHA256,
    });
    expect((await p)?.open).toBe(true);
    // The server was approved against different notice text: stay closed.
    p = svc.status();
    http.expectOne('/api/v1/leads/status').flush({
      open: true,
      noticeVersion: 'v1',
      retentionDays: 30,
      controllerName: 'SYNTHETIC',
      contactChannel: 'SYNTHETIC',
      noticeContentSha256: 'f'.repeat(64),
    });
    expect((await p)?.open).toBe(false);
  });
});
