import { Component, computed, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { AdminAuthService } from './admin-auth.service';

/** Owner dashboard overview. KPI cards arrive with the catalog screens in U02 part 2. */
@Component({
  selector: 'app-admin-dashboard',
  template: `
    <section class="dashboard" aria-labelledby="dashboard-title">
      <h1 id="dashboard-title">أهلاً بيك في لوحة التحكم</h1>
      @if (restaurantName(); as name) {
        <p class="dashboard-restaurant">{{ name }}</p>
      }
      <div class="dashboard-card">
        <h2>إدارة المنيو</h2>
        <p>
          ابدأ بإضافة الأقسام والأطباق، وبعدها خصّص الهوية وحمّل رمز الـ QR الدائم للطباعة.
          التعديلات بتتحفظ مباشرة، والمنيو بيظهر للزبائن لما إدارة المنصة تنشره.
        </p>
      </div>
    </section>
  `,
  styles: [
    `
      h1 {
        font-family: var(--font-family-display);
        font-size: var(--font-size-2xl);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2);
      }
      .dashboard-restaurant {
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-6);
      }
      .dashboard-card {
        background: var(--color-surface-card);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xl);
        padding: var(--space-6);
      }
      .dashboard-card h2 {
        font-size: var(--font-size-lg);
        margin: 0 0 var(--space-2);
      }
      .dashboard-card p {
        color: var(--color-text-secondary);
        margin: 0;
        line-height: var(--line-height-normal, 1.6);
      }
    `,
  ],
})
export class DashboardComponent {
  private readonly auth = inject(AdminAuthService);
  readonly restaurantName = computed(() => {
    const session = this.auth.session();
    return session && session.restaurants.length > 0 ? session.restaurants[0].name : null;
  });

  constructor() {
    inject(Title).setTitle('الرئيسية | لوحة التحكم');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
  }
}
