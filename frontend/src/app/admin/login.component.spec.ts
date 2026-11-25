import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { AdminAuthService } from './admin-auth.service';
import { LoginComponent } from './login.component';

function authStub(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    session: signal(null),
    sessionChecked: signal(true),
    ensureCsrf: async () => undefined,
    loadSession: async () => null,
    login: async () => 'invalid' as const,
    ...overrides,
  };
}

async function createComponent(stub: ReturnType<typeof authStub>) {
  await TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [provideRouter([]), { provide: AdminAuthService, useValue: stub }],
  }).compileComponents();
  const fixture = TestBed.createComponent(LoginComponent);
  fixture.detectChanges();
  return fixture;
}

describe('LoginComponent', () => {
  it('renders the Arabic sign-in form and sets noindex', async () => {
    const fixture = await createComponent(authStub());
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('h1')?.textContent).toContain('تسجيل الدخول');
    expect(root.querySelector('#login-email')).toBeTruthy();
    expect(root.querySelector('#login-password')).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex,nofollow',
    );
  });

  it('blocks submit while the form is invalid and shows field errors', async () => {
    const stub = authStub();
    const fixture = await createComponent(stub);
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('#login-email-error')?.textContent).toContain(
      'البريد الإلكتروني مطلوب',
    );
    expect(root.querySelector('#login-password-error')?.textContent).toContain(
      'كلمة المرور مطلوبة',
    );
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the generic credentials message on 401', async () => {
    const stub = authStub({ login: async () => 'invalid' as const });
    const fixture = await createComponent(stub);
    fixture.componentInstance.form.setValue({
      email: 'owner@example.com',
      password: 'wrong-password-1',
    });
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    );
  });

  it('shows the cooldown message on 429', async () => {
    const stub = authStub({ login: async () => 'rate-limited' as const });
    const fixture = await createComponent(stub);
    fixture.componentInstance.form.setValue({
      email: 'owner@example.com',
      password: 'some-password-12',
    });
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'يرجى الانتظار 60 ثانية',
    );
  });

  it('routes owners to /admin after a successful login', async () => {
    const stub = authStub({
      session: signal({ role: 'Owner', restaurants: [] }) as never,
      login: async () => 'ok' as const,
    });
    const fixture = await createComponent(stub);
    const router = TestBed.inject(Router);
    const navigations: string[] = [];
    router.navigateByUrl = async (url: string | never) => {
      navigations.push(String(url));
      return true;
    };
    fixture.componentInstance.form.setValue({
      email: 'owner@example.com',
      password: 'correct-password-1',
    });
    await fixture.componentInstance.submit();
    expect(navigations).toEqual(['/admin']);
  });

  it('routes platform admins to /platform after a successful login', async () => {
    const stub = authStub({
      session: signal({ role: 'PlatformAdmin', restaurants: [] }) as never,
      login: async () => 'ok' as const,
    });
    const fixture = await createComponent(stub);
    const router = TestBed.inject(Router);
    const navigations: string[] = [];
    router.navigateByUrl = async (url: string | never) => {
      navigations.push(String(url));
      return true;
    };
    fixture.componentInstance.form.setValue({
      email: 'admin@example.com',
      password: 'correct-password-1',
    });
    await fixture.componentInstance.submit();
    expect(navigations).toEqual(['/platform']);
  });

  it('toggles password visibility with an accessible pressed state', async () => {
    const fixture = await createComponent(authStub());
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#login-password');
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.password-toggle');
    expect(input.type).toBe('password');
    toggle.click();
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('إخفاء كلمة المرور');
  });
});
