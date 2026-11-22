import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

type LoginFailure = 'invalid' | 'rate-limited' | 'error';

/**
 * Owner / platform-admin sign-in (Screen 1 of the U02 design specification).
 * Arabic-first, mobile-first, CSR only; the route is marked noindex.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <main class="login-canvas">
      <section class="login-card" aria-labelledby="login-title">
        <div class="login-brand" aria-hidden="true">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
            <path d="M7 2v20" />
            <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
          </svg>
        </div>
        <h1 id="login-title">تسجيل الدخول</h1>
        <p class="login-subtitle">لوحة تحكم المنيو الرقمي</p>

        @if (failure(); as reason) {
          <div class="login-alert" role="alert">
            {{ failureMessage(reason) }}
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="form-group">
            <label class="form-label" for="login-email">البريد الإلكتروني</label>
            <input
              id="login-email"
              class="form-input"
              type="email"
              formControlName="email"
              maxlength="256"
              autocomplete="email"
              inputmode="email"
              dir="ltr"
              [attr.aria-invalid]="emailInvalid"
              [attr.aria-describedby]="emailInvalid ? 'login-email-error' : null"
            />
            @if (emailInvalid) {
              <p class="field-error" id="login-email-error">
                {{
                  form.controls.email.hasError('required')
                    ? 'البريد الإلكتروني مطلوب'
                    : 'البريد الإلكتروني غير صحيح'
                }}
              </p>
            }
          </div>

          <div class="form-group">
            <label class="form-label" for="login-password">كلمة المرور</label>
            <div class="password-wrap">
              <input
                id="login-password"
                class="form-input"
                [attr.type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                minlength="12"
                maxlength="256"
                autocomplete="current-password"
                dir="ltr"
                [attr.aria-invalid]="passwordInvalid"
                [attr.aria-describedby]="passwordInvalid ? 'login-password-error' : null"
              />
              <button
                type="button"
                class="password-toggle"
                (click)="togglePassword()"
                [attr.aria-pressed]="showPassword()"
                [attr.aria-label]="showPassword() ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                  @if (showPassword()) {
                    <line x1="4" y1="4" x2="20" y2="20" />
                  }
                </svg>
              </button>
            </div>
            @if (passwordInvalid) {
              <p class="field-error" id="login-password-error">
                كلمة المرور مطلوبة (12 حرفًا على الأقل)
              </p>
            }
          </div>

          <button
            class="btn btn-primary btn-block login-submit"
            type="submit"
            [disabled]="submitting()"
            [attr.aria-busy]="submitting()"
          >
            {{ submitting() ? 'جاري تسجيل الدخول…' : 'دخول' }}
          </button>
        </form>
      </section>
    </main>
  `,
  styles: [
    `
      .login-canvas {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-4);
        background: #0b1329;
      }
      .login-card {
        width: 100%;
        max-width: 400px;
        background: var(--color-surface-card);
        border-radius: var(--radius-xl);
        padding: var(--space-8) var(--space-6);
        box-shadow: var(--shadow-lg, 0 12px 32px rgba(0, 0, 0, 0.35));
      }
      .login-brand {
        display: flex;
        justify-content: center;
        color: var(--color-brand-primary);
        margin-bottom: var(--space-4);
      }
      h1 {
        text-align: center;
        font-family: var(--font-family-display);
        font-size: var(--font-size-2xl);
        color: var(--color-text-primary);
        margin: 0;
      }
      .login-subtitle {
        text-align: center;
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        margin: var(--space-2) 0 var(--space-6);
      }
      .login-alert {
        background: var(--color-danger-soft, #fdecec);
        color: var(--color-danger, #b3261e);
        border: 1px solid currentColor;
        border-radius: var(--radius-md, 0.5rem);
        padding: var(--space-3) var(--space-4);
        margin-bottom: var(--space-4);
        font-size: var(--font-size-sm);
      }
      .form-input[dir='ltr'] {
        text-align: left;
      }
      .password-wrap {
        position: relative;
      }
      .password-toggle {
        position: absolute;
        inset-inline-end: var(--space-2);
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        background: none;
        border: none;
        color: var(--color-text-secondary);
        cursor: pointer;
      }
      .password-toggle:focus-visible {
        outline: 2px solid var(--color-brand-primary);
        outline-offset: 2px;
        border-radius: var(--radius-md, 0.5rem);
      }
      .field-error {
        color: var(--color-danger, #b3261e);
        font-size: var(--font-size-xs);
        margin: var(--space-1, 0.25rem) 0 0;
      }
      .login-submit {
        margin-top: var(--space-4);
        min-height: 48px;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(256)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(256)]],
  });
  readonly showPassword = signal(false);
  readonly submitting = signal(false);
  readonly failure = signal<LoginFailure | null>(null);

  get emailInvalid(): boolean {
    return (
      (this.form.controls.email.touched || this.submitting()) && this.form.controls.email.invalid
    );
  }

  get passwordInvalid(): boolean {
    return (
      (this.form.controls.password.touched || this.submitting()) &&
      this.form.controls.password.invalid
    );
  }

  constructor() {
    inject(Title).setTitle('تسجيل الدخول | القائمة الرقمية');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
    // Pre-flight the CSRF handshake so the first submit is never rejected for
    // a missing antiforgery cookie, and skip the form when already signed in.
    void this.auth.ensureCsrf().catch(() => undefined);
    void this.auth.loadSession().then((session) => {
      if (session) void this.router.navigateByUrl(this.homeFor(session.role));
    });
  }

  failureMessage(reason: LoginFailure): string {
    switch (reason) {
      case 'invalid':
        return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      case 'rate-limited':
        return 'تم تجاوز الحد المسموح، يرجى الانتظار 60 ثانية.';
      default:
        return 'حصل خطأ في الاتصال. جرّب تاني بعد شوية.';
    }
  }

  togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }

  private homeFor(role: 'Owner' | 'PlatformAdmin'): string {
    return role === 'PlatformAdmin' ? '/platform' : '/admin';
  }

  async submit(): Promise<void> {
    this.failure.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    try {
      await this.auth.ensureCsrf();
      const { email, password } = this.form.getRawValue();
      const result = await this.auth.login(email.trim(), password);
      if (result === 'ok') {
        const role = this.auth.session()?.role ?? 'Owner';
        await this.router.navigateByUrl(this.homeFor(role));
        return;
      }
      this.failure.set(result);
    } catch {
      this.failure.set('error');
    } finally {
      this.submitting.set(false);
    }
  }
}
