import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { LeadIntakeService, LeadResult, LeadStatus } from './leads';
import { Marketing } from './marketing';
import { PrivacyComponent } from './privacy';

const open: LeadStatus = {
  open: true,
  noticeVersion: 'v1',
  retentionDays: 30,
  controllerName: 'SYNTHETIC',
  contactChannel: 'SYNTHETIC',
};
const closed: LeadStatus = {
  open: false,
  noticeVersion: null,
  retentionDays: null,
  controllerName: null,
  contactChannel: null,
};

function setup(status: LeadStatus | null, result: LeadResult = 'created') {
  const calls: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: LeadIntakeService,
        useValue: {
          status: async () => status,
          submit: async (p: unknown) => {
            calls.push(p);
            return result;
          },
        },
      },
    ],
  });
  return calls;
}

async function marketing(status: LeadStatus | null, result: LeadResult = 'created') {
  const calls = setup(status, result);
  const f = TestBed.createComponent(Marketing);
  f.detectChanges();
  await f.whenStable();
  f.detectChanges();
  return { c: f.componentInstance, calls, f };
}

describe('lead form', () => {
  it('stays closed when status is closed or unreadable and never submits', async () => {
    for (const s of [closed, null]) {
      TestBed.resetTestingModule();
      const { c, calls } = await marketing(s);
      expect(c.leadState()).toBe('closed');
      c.formData.consent = true;
      await c.onFormSubmit();
      expect(calls.length).toBe(0);
    }
  });
  it('requires consent and sends notice version and honeypot', async () => {
    const { c, calls } = await marketing(open);
    expect(c.leadState()).toBe('open');
    await c.onFormSubmit();
    expect(calls.length).toBe(0);
    c.formData.consent = true;
    await c.onFormSubmit();
    expect(calls[0]).toMatchObject({ consent: true, noticeVersion: 'v1', website: '' });
  });
  it('keeps the combined notes within the server limit at the maximum input', async () => {
    const { c, calls } = await marketing(open);
    c.formData.consent = true;
    c.formData.message = 'ن'.repeat(500);
    c.formData.businessType = 'foodtruck';
    await c.onFormSubmit();
    expect((calls[0] as { notes: string }).notes.length).toBeLessThanOrEqual(1000);
  });
  it('shows done only after created; failures keep the form open with an error', async () => {
    for (const r of ['rate', 'invalid', 'closed', 'unconfirmed', 'error'] as LeadResult[]) {
      TestBed.resetTestingModule();
      const { c } = await marketing(open, r);
      c.formData.consent = true;
      await c.onFormSubmit();
      expect(c.leadState()).toBe('open');
      expect(c.leadError()).toBeTruthy();
    }
    TestBed.resetTestingModule();
    const { c } = await marketing(open, 'created');
    c.formData.consent = true;
    await c.onFormSubmit();
    expect(c.leadState()).toBe('done');
  });
});

describe('privacy page', () => {
  it('is unavailable when closed and ready only with configured facts', async () => {
    setup(closed);
    let f = TestBed.createComponent(PrivacyComponent);
    f.detectChanges();
    await f.whenStable();
    expect(f.componentInstance.state()).toBe('unavailable');
    TestBed.resetTestingModule();
    setup(open);
    f = TestBed.createComponent(PrivacyComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(f.componentInstance.state()).toBe('ready');
    expect(f.nativeElement.textContent).toContain('30');
  });
});
