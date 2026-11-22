import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';
import { AdminShellComponent } from './admin-shell.component';

describe('AdminShellComponent', () => {
  it('renders the restaurant name and the navigation landmarks', async () => {
    const logoutCalls: number[] = [];
    const stub = {
      session: signal({ role: 'Owner', restaurants: [{ name: 'مطعم التجربة' }] }),
      logout: async () => {
        logoutCalls.push(1);
      },
    };
    await TestBed.configureTestingModule({
      imports: [AdminShellComponent],
      providers: [provideRouter([]), { provide: AdminAuthService, useValue: stub }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminShellComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('مطعم التجربة');
    expect(root.querySelectorAll('nav[aria-label="التنقل الرئيسي"]').length).toBe(2);
    expect(root.textContent).toContain('الأقسام');
    expect(root.textContent).toContain('الهوية');
    expect(root.textContent).toContain('رمز QR');
    // All five owner screens ship in U02; no "coming soon" placeholders remain.
    expect(root.textContent).not.toContain('قريباً');
  });

  it('signs out and returns to /login after a confirmed logout', async () => {
    const stub = {
      session: signal({ role: 'Owner', restaurants: [] }),
      logout: async () => 'ok' as const,
    };
    await TestBed.configureTestingModule({
      imports: [AdminShellComponent],
      providers: [provideRouter([]), { provide: AdminAuthService, useValue: stub }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminShellComponent);
    const router = TestBed.inject(Router);
    const navigations: string[] = [];
    router.navigateByUrl = async (url: string | never) => {
      navigations.push(String(url));
      return true;
    };
    await fixture.componentInstance.logout();
    expect(navigations).toEqual(['/login']);
    expect(fixture.componentInstance.logoutFailed()).toBe(false);
  });

  it('stays signed in and shows a retryable error when logout fails', async () => {
    const stub = {
      session: signal({ role: 'Owner', restaurants: [] }),
      logout: async () => 'error' as const,
    };
    await TestBed.configureTestingModule({
      imports: [AdminShellComponent],
      providers: [provideRouter([]), { provide: AdminAuthService, useValue: stub }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminShellComponent);
    const router = TestBed.inject(Router);
    const navigations: string[] = [];
    router.navigateByUrl = async (url: string | never) => {
      navigations.push(String(url));
      return true;
    };
    await fixture.componentInstance.logout();
    fixture.detectChanges();
    expect(navigations).toEqual([]);
    expect(fixture.componentInstance.logoutFailed()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'فشل تسجيل الخروج',
    );
  });
});
