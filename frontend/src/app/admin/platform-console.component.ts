import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminAuthService } from './admin-auth.service';
import { LeadsPanelComponent } from './leads-panel.component';

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

export const PAGE_SIZE = 20;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function describePlatformError(
  error: unknown,
  operation: 'create' | 'other' = 'other',
): string {
  const status = error instanceof HttpErrorResponse ? error.status : 0;
  if (status === 409) return 'الاسم المختصر (slug) أو بريد المالك مستخدم قبل كده.';
  if (status === 412) return 'البيانات اتغيرت من مكان تاني. حدّث القائمة وجرّب تاني.';
  if (status === 429) return 'محاولات كتير. استنى دقيقة وجرّب تاني.';
  if (status === 503)
    return operation === 'create'
      ? 'إرسال دعوة المالك مش متفعّل على السيرفر ده، فمفيش حساب اتعمل.'
      : 'الخدمة مش متاحة دلوقتي. جرّب تاني بعد شوية.';
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
  imports: [FormsModule, LeadsPanelComponent],
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
        @if (setupLink(); as link) {
          <div class="setup-link" role="region" aria-label="رابط إعداد المالك">
            <p>
              رابط إعداد المالك لـ {{ link.restaurant }}. بيظهر مرة واحدة، ومش بيتخزّن ولا بيتبعت.
              ابعته للمالك المتأكد منه بس. أي رابط جديد بيلغي القديم.
            </p>
            <input readonly dir="ltr" [value]="link.url" aria-label="رابط الإعداد" />
            <button type="button" class="btn btn-secondary" (click)="copyLink()">نسخ الرابط</button>
            <button type="button" class="btn btn-secondary" (click)="hideLink()">
              إخفاء الرابط
            </button>
            @if (copyState()) {
              <span role="status">{{ copyState() }}</span>
            }
          </div>
        }
      </section>

      <section aria-labelledby="list-title" class="card">
        <h2 id="list-title">المطاعم ({{ total() }})</h2>
        <input
          type="search"
          name="search"
          [(ngModel)]="search"
          (keyup.enter)="runSearch()"
          placeholder="ابحث بالاسم أو الـ slug"
          aria-label="بحث"
        />
        @if (listMessage(); as m) {
          <p [class]="m.kind" role="alert">{{ m.text }}</p>
        }
        @if (loading()) {
          <p>جاري التحميل…</p>
        } @else if (rows().length === 0) {
          <p>لسه مفيش مطاعم.</p>
        } @else {
          <div
            class="table-scroll"
            role="region"
            tabindex="0"
            aria-label="جدول المطاعم، استخدم الأسهم للتمرير أفقيا"
          >
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
                      @if (rowMessage(); as m) {
                        @if (m.id === r.id) {
                          <span [class]="m.kind" role="status">{{ m.text }}</span>
                        }
                      }
                      @if (confirmLinkFor() === r.id) {
                        <span class="confirm-text" role="alert">
                          رابط جديد هيلغي أي رابط قديم ويطلّع المالك من كل الجلسات المفتوحة.
                        </span>
                        <button
                          type="button"
                          class="btn btn-secondary confirm-link"
                          (click)="issueLink(r)"
                          [disabled]="busy()"
                        >
                          تأكيد رابط جديد
                        </button>
                        <button
                          type="button"
                          class="btn btn-secondary cancel-link"
                          (click)="confirmLinkFor.set(null)"
                        >
                          إلغاء
                        </button>
                      } @else {
                        <button
                          type="button"
                          class="btn btn-secondary ask-link"
                          (click)="confirmLinkFor.set(r.id)"
                          [disabled]="busy()"
                        >
                          رابط إعداد المالك
                        </button>
                      }
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
          </div>
          @if (pageCount() > 1) {
            <nav class="pager" aria-label="الصفحات">
              <button
                type="button"
                class="btn btn-secondary"
                (click)="goToPage(page() - 1)"
                [disabled]="page() <= 1 || loading()"
              >
                السابق
              </button>
              <span>صفحة {{ page() }} من {{ pageCount() }}</span>
              <button
                type="button"
                class="btn btn-secondary"
                (click)="goToPage(page() + 1)"
                [disabled]="page() >= pageCount() || loading()"
              >
                التالي
              </button>
            </nav>
          }
        }
      </section>
      <app-leads-panel />
    </main>
  `,
  styles: [
    `
      .table-scroll {
        overflow-x: auto;
      }
      .table-scroll:focus-visible {
        outline: 3px solid var(--color-focus, #0b7a6f);
        outline-offset: 2px;
      }
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
      .setup-link {
        display: grid;
        gap: var(--space-2);
        margin-top: var(--space-4);
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
export class PlatformConsoleComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);

  readonly rows = signal<PlatformRestaurant[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  private loadTicket = 0;
  private createdAtEnd = false;
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);
  readonly setupLink = signal<{ restaurant: string; url: string } | null>(null);
  readonly copyState = signal<string | null>(null);
  readonly confirmLinkFor = signal<string | null>(null);
  readonly listMessage = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);
  readonly rowMessage = signal<{ id: string; kind: 'ok' | 'error'; text: string } | null>(null);
  name = '';
  slug = '';
  ownerEmail = '';
  search = '';

  constructor() {
    inject(Title).setTitle('بوابة مدير المنصة | القائمة الرقمية');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
    void this.load();
  }

  /** Loads one page. Overlapping loads are sequenced: only the newest result is applied. */
  async load(page = this.page()): Promise<void> {
    const ticket = ++this.loadTicket;
    this.loading.set(true);
    this.listMessage.set(null);
    try {
      const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
      if (this.search.trim()) params['search'] = this.search.trim();
      const result = await firstValueFrom(
        this.http.get<PlatformPage>('/api/v1/platform/restaurants', { params }),
      );
      if (ticket !== this.loadTicket) return;
      this.rows.set(Array.isArray(result.items) ? result.items : []);
      this.total.set(typeof result.total === 'number' ? result.total : this.rows().length);
      this.page.set(page);
    } catch (error) {
      if (ticket === this.loadTicket)
        this.listMessage.set({ kind: 'error', text: describePlatformError(error) });
    } finally {
      if (ticket === this.loadTicket) this.loading.set(false);
    }
  }

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  async runSearch(): Promise<void> {
    await this.load(1);
  }

  async goToPage(page: number): Promise<void> {
    if (page < 1 || page > this.pageCount()) return;
    await this.load(page);
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
      const created = await firstValueFrom(
        this.http.post<{ ownerSetupUrl?: string }>('/api/v1/platform/restaurants', {
          name,
          slug,
          ownerEmail,
        }),
      );
      this.name = this.slug = this.ownerEmail = '';
      this.search = '';
      if (typeof created?.ownerSetupUrl === 'string') {
        this.setupLink.set({ restaurant: name, url: created.ownerSetupUrl });
        this.message.set({ kind: 'ok', text: 'اتعمل المطعم. خد رابط إعداد المالك من تحت.' });
      } else {
        this.message.set({
          kind: 'ok',
          text: 'اتعمل المطعم. دعوة المالك اتسلمت حسب إعداد السيرفر.',
        });
      }
      this.createdAtEnd = true;
    });
  }

  /** Issues a fresh one-time owner setup/reset link. The URL is held in memory only until hidden. */
  async issueLink(r: PlatformRestaurant): Promise<void> {
    await this.run(async () => {
      const issued = await firstValueFrom(
        this.http.post<{ ownerSetupUrl: string }>(
          `/api/v1/platform/restaurants/${r.id}/owner-setup-link`,
          {},
        ),
      );
      this.setupLink.set({ restaurant: r.name, url: issued.ownerSetupUrl });
      this.rowMessage.set({ id: r.id, kind: 'ok', text: 'اتعمل رابط جديد، والقديم اتلغى.' });
    }, r.id);
  }

  async copyLink(): Promise<void> {
    const link = this.setupLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      this.copyState.set('اتنسخ.');
    } catch {
      this.copyState.set('النسخ مش متاح. حدّد الرابط وانسخه بإيدك.');
    }
  }

  hideLink(): void {
    this.setupLink.set(null);
    this.copyState.set(null);
  }

  ngOnDestroy(): void {
    this.hideLink();
  }

  async publish(r: PlatformRestaurant): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(
        this.http.patch(`/api/v1/platform/restaurants/${r.id}/publication`, {
          isPublished: !r.isPublished,
          rowVersion: r.rowVersion,
        }),
      );
      this.rowMessage.set({
        id: r.id,
        kind: 'ok',
        text: r.isPublished ? 'اتلغى النشر.' : 'اتنشر المنيو.',
      });
    }, r.id);
  }

  async toggleStatus(r: PlatformRestaurant): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(
        this.http.patch(`/api/v1/platform/restaurants/${r.id}/status`, {
          status: r.status === 'Active' ? 'Suspended' : 'Active',
          rowVersion: r.rowVersion,
        }),
      );
      this.rowMessage.set({ id: r.id, kind: 'ok', text: 'اتحدّثت حالة المطعم.' });
    }, r.id);
  }

  async logout(): Promise<void> {
    if ((await this.auth.logout()) === 'ok') await this.router.navigateByUrl('/login');
    else this.message.set({ kind: 'error', text: 'فشل تسجيل الخروج. جرّب تاني.' });
  }

  private async run(action: () => Promise<void>, rowId?: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set(null);
    this.listMessage.set(null);
    this.rowMessage.set(null);
    this.confirmLinkFor.set(null);
    this.copyState.set(null);
    try {
      await action();
      if (this.createdAtEnd) {
        this.createdAtEnd = false;
        await this.load(1);
        if (this.pageCount() > 1) await this.load(this.pageCount());
      } else {
        await this.load();
      }
    } catch (error) {
      const text = describePlatformError(error, rowId ? 'other' : 'create');
      if (rowId) this.rowMessage.set({ id: rowId, kind: 'error', text });
      else this.message.set({ kind: 'error', text });
    } finally {
      this.busy.set(false);
    }
  }
}
