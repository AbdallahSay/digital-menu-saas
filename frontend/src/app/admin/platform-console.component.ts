import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminAuthService } from './admin-auth.service';

export interface PlatformRestaurant {
  id: string;
  name: string;
  slug: string;
  publicCode: string;
  status: string;
  isPublished: boolean;
  publishedMenuVersion: number;
  rowVersion: string;
}
interface PlatformPage {
  items: PlatformRestaurant[];
  total: number;
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function describePlatformError(error: unknown): string {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  if (status === 409) return 'الاسم المختصر (slug) أو بريد المالك مستخدم قبل كده.';
  if (status === 412) return 'البيانات اتغيرت من مكان تاني. حدّث القائمة وجرّب تاني.';
  if (status === 429) return 'محاولات كتير. استنى دقيقة وجرّب تاني.';
  if (status === 503) return 'إرسال دعوة المالك مش متفعّل على السيرفر ده، فمفيش حساب اتعمل.';
  if (status === 400) return 'البيانات غير صحيحة. راجع الحقول.';
  return 'حصل خطأ. جرّب تاني بعد شوية.';
}

/**
 * Platform administrator console (Screen 7): lists restaurants and lets the
 * platform admin provision, publish/unpublish and suspend/reactivate them.
 * All authorization is server-side (PlatformAdmin policy); this screen never
 * receives owner tokens, invitation secrets or passwords.
 */
@Component({
  selector: 'app-platform-console',
  imports: [FormsModule],
  template: `
    <main class="platform">
      <header class="platform-header">
        <h1>بوابة مدير المنصة</h1>
        <button type="button" class="btn btn-secondary" (click)="logout()">تسجيل الخروج</button>
      </header>

      <section aria-labelledby="create-title" class="card">
        <h2 id="create-title">إضافة مطعم جديد</h2>
        <form (ngSubmit)="create()" #form="ngForm" class="create-form">
          <label for="p-name">اسم المطعم</label>
          <input id="p-name" name="name" [(ngModel)]="name" required maxlength="150" />
          <label for="p-slug">الاسم المختصر للرابط (إنجليزي صغير وشرطات)</label>
          <input id="p-slug" name="slug" [(ngModel)]="slug" required maxlength="63" dir="ltr" />
          <label for="p-owner">بريد المالك</label>
          <input
            id="p-owner"
            name="ownerEmail"
            type="email"
            [(ngModel)]="ownerEmail"
            required
            maxlength="256"
            dir="ltr"
          />
          <button type="submit" class="btn btn-primary" [disabled]="busy()">إنشاء المطعم</button>
        </form>
        @if (message(); as m) {
          <p [class]="m.kind" role="status">{{ m.text }}</p>
        }
      </section>

      <section aria-labelledby="list-title" class="card">
        <h2 id="list-title">المطاعم ({{ total() }})</h2>
        <input
          type="search"
          name="search"
          [(ngModel)]="search"
          (keyup.enter)="load()"
          placeholder="ابحث بالاسم أو الـ slug"
          aria-label="بحث"
        />
        @if (loading()) {
          <p>جاري التحميل…</p>
        } @else if (rows().length === 0) {
          <p>لسه مفيش مطاعم.</p>
        } @else {
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الرابط</th>
                <th>الحالة</th>
                <th>النشر</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr>
                  <td>{{ r.name }}</td>
                  <td dir="ltr">
                    <a [href]="'/r/' + r.slug" target="_blank" rel="noopener">/r/{{ r.slug }}</a>
                  </td>
                  <td>{{ r.status === 'Active' ? 'نشط' : 'موقوف' }}</td>
                  <td>{{ r.isPublished ? 'منشور' : 'غير منشور' }}</td>
                  <td class="actions">
                    <button
                      type="button"
                      class="btn btn-secondary"
                      (click)="publish(r)"
                      [disabled]="busy()"
                    >
                      {{ r.isPublished ? 'إلغاء النشر' : 'نشر' }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-secondary"
                      (click)="toggleStatus(r)"
                      [disabled]="busy()"
                    >
                      {{ r.status === 'Active' ? 'إيقاف' : 'تفعيل' }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </section>
    </main>
  `,
  styles: [
    `
      .platform {
        max-width: 960px;
        margin: 0 auto;
        padding: var(--space-6) var(--space-4);
      }
      .platform-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      h1 {
        font-family: var(--font-family-display);
        color: var(--color-text-primary);
      }
      .card {
        background: var(--color-surface-card);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xl);
        padding: var(--space-6);
        margin-block: var(--space-6);
      }
      .create-form {
        display: grid;
        gap: var(--space-2);
        max-width: 420px;
      }
      input {
        padding: var(--space-3);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-md, 8px);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: var(--space-4);
      }
      th,
      td {
        text-align: start;
        padding: var(--space-3);
        border-block-end: 1px solid var(--color-border-subtle);
      }
      .actions {
        display: flex;
        gap: var(--space-2);
      }
      .ok {
        color: var(--color-success, #166534);
      }
      .error {
        color: var(--color-danger, #b3261e);
      }
    `,
  ],
})
export class PlatformConsoleComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  readonly rows = signal<PlatformRestaurant[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);
  name = '';
  slug = '';
  ownerEmail = '';
  search = '';

  constructor() {
    inject(Title).setTitle('بوابة مدير المنصة | القائمة الرقمية');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const params: Record<string, string | number> = { page: 1, pageSize: 100 };
      if (this.search.trim()) params['search'] = this.search.trim();
      const page = await firstValueFrom(
        this.http.get<PlatformPage>('/api/v1/platform/restaurants', { params }),
      );
      this.rows.set(Array.isArray(page.items) ? page.items : []);
      this.total.set(typeof page.total === 'number' ? page.total : this.rows().length);
    } catch (error) {
      this.message.set({ kind: 'error', text: describePlatformError(error) });
    } finally {
      this.loading.set(false);
    }
  }

  async create(): Promise<void> {
    const name = this.name.trim();
    const slug = this.slug.trim();
    const ownerEmail = this.ownerEmail.trim();
    if (!name || !SLUG_PATTERN.test(slug) || !ownerEmail) {
      this.message.set({
        kind: 'error',
        text: 'راجع الاسم والـ slug (حروف إنجليزي صغيرة وأرقام وشرطات) والبريد.',
      });
      return;
    }
    await this.run(async () => {
      await firstValueFrom(
        this.http.post('/api/v1/platform/restaurants', { name, slug, ownerEmail }),
      );
      this.name = this.slug = this.ownerEmail = '';
      this.message.set({ kind: 'ok', text: 'اتعمل المطعم. دعوة المالك اتسلمت حسب إعداد السيرفر.' });
    });
  }

  async publish(r: PlatformRestaurant): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(
        this.http.patch(`/api/v1/platform/restaurants/${r.id}/publication`, {
          isPublished: !r.isPublished,
          rowVersion: r.rowVersion,
        }),
      );
      this.message.set({ kind: 'ok', text: r.isPublished ? 'اتلغى النشر.' : 'اتنشر المنيو.' });
    });
  }

  async toggleStatus(r: PlatformRestaurant): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(
        this.http.patch(`/api/v1/platform/restaurants/${r.id}/status`, {
          status: r.status === 'Active' ? 'Suspended' : 'Active',
          rowVersion: r.rowVersion,
        }),
      );
      this.message.set({ kind: 'ok', text: 'اتحدّثت حالة المطعم.' });
    });
  }

  async logout(): Promise<void> {
    if ((await this.auth.logout()) === 'ok') await this.router.navigateByUrl('/login');
    else this.message.set({ kind: 'error', text: 'فشل تسجيل الخروج. جرّب تاني.' });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      await this.load();
    } catch (error) {
      this.message.set({ kind: 'error', text: describePlatformError(error) });
    } finally {
      this.busy.set(false);
    }
  }
}
