import { Component, computed, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

interface NavItem {
  path: string;
  exact: boolean;
  icon: string;
  label: string;
  enabled: boolean;
}

/**
 * Owner dashboard frame (Screen 2 of the U02 design specification):
 * desktop sidebar, mobile bottom navigation, header with the restaurant
 * name and sign-out. Catalog screens land behind these routes in U02 part 2.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="admin-shell">
      <header class="admin-header">
        <a class="admin-brand" routerLink="/admin">القائمة الرقمية</a>
        @if (restaurantName(); as name) {
          <span class="admin-restaurant">{{ name }}</span>
        }
        <button type="button" class="btn btn-secondary admin-logout" (click)="logout()">
          تسجيل الخروج
        </button>
      </header>

      <nav class="admin-sidebar" aria-label="التنقل الرئيسي">
        @for (item of navItems; track item.path) {
          @if (item.enabled) {
            <a
              class="admin-nav-link"
              [routerLink]="item.path"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: item.exact }"
            >
              <span class="admin-nav-icon" aria-hidden="true">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          } @else {
            <span class="admin-nav-link admin-nav-disabled" aria-disabled="true">
              <span class="admin-nav-icon" aria-hidden="true">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
              <small class="admin-nav-soon">قريباً</small>
            </span>
          }
        }
      </nav>

      <main class="admin-content">
        @if (logoutFailed()) {
          <p class="logout-error" role="alert">
            فشل تسجيل الخروج. جرّب تاني.
            <button type="button" class="btn btn-secondary" (click)="logout()">
              إعادة المحاولة
            </button>
          </p>
        }
        <router-outlet />
      </main>

      <nav class="admin-bottom-nav" aria-label="التنقل الرئيسي">
        @for (item of navItems; track item.path) {
          @if (item.enabled) {
            <a
              class="admin-bottom-link"
              [routerLink]="item.path"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: item.exact }"
            >
              <span aria-hidden="true">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          } @else {
            <span class="admin-bottom-link admin-nav-disabled" aria-disabled="true">
              <span aria-hidden="true">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </span>
          }
        }
      </nav>
    </div>
  `,
  styles: [
    `
      .admin-shell {
        min-height: 100vh;
        background: var(--color-surface-page, #faf7f2);
        padding-bottom: 72px;
      }
      .admin-header {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: var(--space-4);
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface-card);
        border-bottom: 1px solid var(--color-border-subtle);
      }
      .admin-brand {
        font-family: var(--font-family-display);
        font-weight: 700;
        color: var(--color-brand-primary);
        text-decoration: none;
      }
      .admin-restaurant {
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .admin-logout {
        margin-inline-start: auto;
        min-height: 44px;
      }
      .admin-sidebar {
        display: none;
      }
      .admin-content {
        padding: var(--space-6) var(--space-4);
        max-width: 960px;
        margin: 0 auto;
      }
      .admin-bottom-nav {
        position: fixed;
        bottom: 0;
        inset-inline: 0;
        z-index: 10;
        display: flex;
        background: var(--color-surface-card);
        border-top: 1px solid var(--color-border-subtle);
      }
      .admin-bottom-link {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: var(--space-2) 0;
        min-height: 56px;
        justify-content: center;
        text-decoration: none;
        color: var(--color-text-secondary);
        font-size: var(--font-size-xs);
      }
      .admin-bottom-link.active {
        color: var(--color-brand-primary);
        font-weight: 700;
      }
      .admin-nav-disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .logout-error {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        background: var(--color-danger-soft, #fdecec);
        color: var(--color-danger, #b3261e);
        border: 1px solid currentColor;
        border-radius: var(--radius-md, 0.5rem);
        padding: var(--space-3) var(--space-4);
      }
      .logout-error .btn {
        min-height: 44px;
        margin-inline-start: auto;
      }
      @media (min-width: 768px) {
        .admin-shell {
          padding-bottom: 0;
          padding-inline-start: 224px;
        }
        .admin-bottom-nav {
          display: none;
        }
        .admin-sidebar {
          position: fixed;
          inset-inline-start: 0;
          top: 0;
          bottom: 0;
          width: 224px;
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          padding: calc(var(--space-16, 4rem) + var(--space-4)) var(--space-3) var(--space-4);
          background: var(--color-surface-card);
          border-inline-end: 1px solid var(--color-border-subtle);
        }
        .admin-header {
          padding-inline-start: var(--space-6);
        }
        .admin-nav-link {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          min-height: 48px;
          border-radius: var(--radius-md, 0.5rem);
          text-decoration: none;
          color: var(--color-text-primary);
        }
        .admin-nav-link.active {
          background: var(--color-brand-primary-container, #d7ecea);
          color: var(--color-brand-primary);
          font-weight: 700;
        }
        .admin-nav-soon {
          margin-inline-start: auto;
          font-size: var(--font-size-xs);
          color: var(--color-text-muted, #8a8378);
        }
      }
    `,
  ],
})
export class AdminShellComponent {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  readonly restaurantName = computed(() => {
    const session = this.auth.session();
    return session && session.restaurants.length > 0 ? session.restaurants[0].name : null;
  });

  readonly navItems: NavItem[] = [
    { path: '/admin', exact: true, icon: '📊', label: 'الرئيسية', enabled: true },
    { path: '/admin/categories', exact: false, icon: '📁', label: 'الأقسام', enabled: true },
    { path: '/admin/items', exact: false, icon: '🍽️', label: 'الأطباق', enabled: false },
    { path: '/admin/branding', exact: false, icon: '🎨', label: 'الهوية', enabled: false },
    { path: '/admin/qr', exact: false, icon: '📱', label: 'رمز QR', enabled: false },
  ];

  constructor() {
    inject(Title).setTitle('لوحة التحكم | القائمة الرقمية');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
  }

  readonly logoutFailed = signal(false);

  async logout(): Promise<void> {
    this.logoutFailed.set(false);
    const result = await this.auth.logout();
    // Only a confirmed (or already-ended) server session navigates away;
    // otherwise the user stays signed in and gets a retryable error.
    if (result === 'ok') {
      await this.router.navigateByUrl('/login');
    } else {
      this.logoutFailed.set(true);
    }
  }
}
