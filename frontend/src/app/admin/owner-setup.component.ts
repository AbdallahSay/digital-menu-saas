import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export const MIN_PASSWORD_LENGTH = 12;

export interface SetupLinkParts {
  userId: string;
  token: string;
}

/** Reads the one-time link parts from a URL fragment (`#u=<guid>&t=<base64url(token)>`). Never from the query. */
export function parseSetupFragment(fragment: string): SetupLinkParts | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const userId = params.get('u') ?? '';
  const wrapped = params.get('t') ?? '';
  if (!/^[0-9a-f]{32}$/i.test(userId) || !/^[A-Za-z0-9_-]{10,6000}$/.test(wrapped)) return null;
  let token: string;
  try {
    const b64 = wrapped.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) =>
      c.charCodeAt(0),
    );
    token = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  if (token.length < 10 || token.length > 4096) return null;
  const g = userId.toLowerCase();
  return {
    userId: `${g.slice(0, 8)}-${g.slice(8, 12)}-${g.slice(12, 16)}-${g.slice(16, 20)}-${g.slice(20)}`,
    token,
  };
}

/**
 * Owner first-time password setup / operator-issued reset. The token only ever lives in the URL
 * fragment (never sent to a server in the URL, never logged); it is read once and removed from the
 * address bar immediately, then held in memory until submit.
 */
@Component({
  selector: 'app-owner-setup',
  imports: [RouterLink],
  template: `
    <main class="setup">
      <section class="card" aria-labelledby="setup-title">
        <h1 id="setup-title">تعيين كلمة السر</h1>
        @if (state() === 'invalid-link') {
          <p role="alert" class="error">الرابط ناقص أو غير صالح. اطلب من مسؤول المنصة رابط جديد.</p>
        } @else if (state() === 'done') {
          <p role="status" class="ok">اتحفظت كلمة السر. تقدر تسجّل الدخول دلوقتي.</p>
          <a class="btn" routerLink="/login">تسجيل الدخول</a>
        } @else {
          <form (submit)="submit($event)" novalidate>
            <label for="setup-pw">كلمة السر الجديدة ({{ min }} حرف على الأقل)</label>
            <input
              id="setup-pw"
              name="password"
              type="password"
              autocomplete="new-password"
              maxlength="256"
              dir="ltr"
              [value]="password"
              (input)="password = $any($event.target).value"
            />
            <label for="setup-pw2">أكّد كلمة السر</label>
            <input
              id="setup-pw2"
              name="confirm"
              type="password"
              autocomplete="new-password"
              maxlength="256"
              dir="ltr"
              [value]="confirm"
              (input)="confirm = $any($event.target).value"
            />
            @if (error(); as e) {
              <p role="alert" class="error">{{ e }}</p>
            }
            <button class="btn" type="submit" [disabled]="busy()">حفظ كلمة السر</button>
          </form>
        }
      </section>
    </main>
  `,
  styles: [
    `
      .setup {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: var(--space-4);
        background: var(--color-surface-page, #faf7f2);
      }
      .card {
        width: min(100%, 420px);
        background: var(--color-surface-card, #fff);
        border: 1px solid var(--color-border-subtle, #e2e8f0);
        border-radius: var(--radius-xl, 16px);
        padding: var(--space-6, 1.5rem);
      }
      form {
        display: grid;
        gap: var(--space-2, 0.5rem);
      }
      input {
        padding: var(--space-3, 0.75rem);
        border: 1px solid var(--color-border-subtle, #cbd5e1);
        border-radius: var(--radius-md, 8px);
        min-height: 44px;
      }
      .btn {
        min-height: 44px;
        margin-top: var(--space-3, 0.75rem);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 var(--space-4, 1rem);
        border: 0;
        border-radius: var(--radius-md, 8px);
        background: var(--color-brand-primary, #0f766e);
        color: #fff;
        text-decoration: none;
        cursor: pointer;
      }
      .error {
        color: var(--color-danger, #b3261e);
      }
      .ok {
        color: var(--color-success, #166534);
      }
    `,
  ],
})
export class OwnerSetupComponent {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private link: SetupLinkParts | null = null;

  readonly min = MIN_PASSWORD_LENGTH;
  readonly state = signal<'form' | 'invalid-link' | 'done'>('form');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  password = '';
  confirm = '';

  constructor() {
    inject(Title).setTitle('تعيين كلمة السر | القائمة الرقمية');
    const meta = inject(Meta);
    meta.updateTag({ name: 'robots', content: 'noindex,nofollow' });
    meta.updateTag({ name: 'referrer', content: 'no-referrer' });
    const location = this.document.defaultView?.location;
    this.link = parseSetupFragment(location?.hash ?? '');
    if (location && location.hash) {
      // Remove the token from the address bar and history entry as soon as it is read.
      this.document.defaultView?.history.replaceState(null, '', location.pathname);
    }
    if (!this.link) this.state.set('invalid-link');
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || !this.link) return;
    if (this.password.length < MIN_PASSWORD_LENGTH) {
      this.error.set(`كلمة السر لازم تكون ${MIN_PASSWORD_LENGTH} حرف على الأقل.`);
      return;
    }
    if (this.password !== this.confirm) {
      this.error.set('كلمتا السر مش متطابقتين.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.get('/api/v1/auth/csrf'));
      const response = await firstValueFrom(
        this.http.post(
          '/api/v1/auth/onboarding',
          {
            userId: this.link.userId,
            token: this.link.token,
            password: this.password,
          },
          { observe: 'response' },
        ),
      );
      // Only the exact documented 204 counts as saved; anything else stays unconfirmed.
      if (response.status !== 204) {
        this.error.set('ما قدرناش نتأكد إن كلمة السر اتحفظت. جرّب تسجيل الدخول أو اطلب رابط جديد.');
        return;
      }
      this.link = null;
      this.password = this.confirm = '';
      this.state.set('done');
    } catch (e) {
      const status = e instanceof HttpErrorResponse ? e.status : 0;
      this.error.set(
        status === 429
          ? 'محاولات كتير. استنى دقيقة وجرّب تاني.'
          : status === 400
            ? 'الرابط انتهى أو اتستخدم، أو كلمة السر مش مقبولة. اطلب رابط جديد لو المشكلة مستمرة.'
            : status === 409
              ? 'سجّل خروج الأول وبعدين افتح الرابط تاني.'
              : 'حصل خطأ. جرّب تاني بعد شوية.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
