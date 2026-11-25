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

describe('lead form DOM after submit', () => {
  async function fillAndSubmit(result: LeadResult) {
    const { f } = await marketing(open, result);
    const el = f.nativeElement as HTMLElement;
    const set = async (id: string, v: string) => {
      const i = el.querySelector('#' + id) as HTMLInputElement | HTMLTextAreaElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
      i.dispatchEvent(new Event('blur'));
      f.detectChanges();
      await f.whenStable();
    };
    await set('contactName', 'Synthetic Person');
    await set('restaurantName', 'Synthetic Cafe');
    await set('whatsapp', '+201000000000');
    const consent = el.querySelector('#consent') as HTMLInputElement;
    consent.click();
    f.detectChanges();
    await f.whenStable();
    const form = el.querySelector('form.service-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    for (let n = 0; n < 4; n++) {
      await f.whenStable();
      f.detectChanges();
    }
    return { el, f, form };
  }
  it('created: hides the form, clears values and touched state, shows the success notice', async () => {
    const { el, form } = await fillAndSubmit('created');
    expect(form.hidden).toBe(true);
    expect(el.querySelector('[data-testid=lead-done]')).toBeTruthy();
    expect((el.querySelector('#contactName') as HTMLInputElement).value).toBe('');
    expect(el.querySelectorAll('.form-error').length).toBe(0);
    expect(el.querySelector('.ng-touched')).toBeNull();
  });
  it('error: keeps the form visible with values and shows the error', async () => {
    const { el, form } = await fillAndSubmit('error');
    expect(form.hidden).toBe(false);
    expect(el.querySelector('[data-testid=lead-done]')).toBeNull();
    expect((el.querySelector('#contactName') as HTMLInputElement).value).toBe('Synthetic Person');
    expect(el.querySelector('[data-testid=lead-error]')).toBeTruthy();
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
