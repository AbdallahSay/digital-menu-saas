import { Component, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

/** Placeholder for the platform admin portal (Screen 7, U02 later part). */
@Component({
  selector: 'app-platform-stub',
  template: `
    <main class="platform-stub">
      <h1>بوابة مدير المنصة</h1>
      <p>إدارة المطاعم والحسابات هتتوفر هنا في التحديث الجاي.</p>
      @if (logoutFailed()) {
        <p class="logout-error" role="alert">فشل تسجيل الخروج. جرّب تاني.</p>
      }
      <button type="button" class="btn btn-secondary" (click)="logout()">تسجيل الخروج</button>
    </main>
  `,
  styles: [
    `
      .platform-stub {
        max-width: 680px;
        margin: 0 auto;
        padding: var(--space-8) var(--space-4);
      }
      h1 {
        font-family: var(--font-family-display);
        color: var(--color-text-primary);
      }
      p {
        color: var(--color-text-secondary);
        margin-bottom: var(--space-6);
      }
      .logout-error {
        color: var(--color-danger, #b3261e);
      }
    `,
  ],
})
export class PlatformStubComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  constructor() {
    inject(Title).setTitle('بوابة مدير المنصة | القائمة الرقمية');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
  }

  readonly logoutFailed = signal(false);

  async logout(): Promise<void> {
    this.logoutFailed.set(false);
    const result = await this.auth.logout();
    if (result === 'ok') {
      await this.router.navigateByUrl('/login');
    } else {
      this.logoutFailed.set(true);
    }
  }
}
