import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type LeadStatusName = 'New' | 'Contacted' | 'Closed';
export interface PlatformLead {
  id: string;
  createdUtc: string;
  expiresUtc: string;
  contactName: string;
  businessName: string;
  phone: string;
  email: string | null;
  notes: string | null;
  status: LeadStatusName;
  rowVersion: string;
}
interface LeadPage {
  page: number;
  pageSize: number;
  total: number;
  items: PlatformLead[];
}

export const LEAD_PAGE_SIZE = 20;
const STATUS_LABEL: Record<LeadStatusName, string> = {
  New: 'جديد',
  Contacted: 'اتواصل معاه',
  Closed: 'اتقفل',
};

/** Platform-admin view of sales leads. Personal data: rendered as text only, never logged or cached. */
@Component({
  selector: 'app-leads-panel',
  standalone: true,
  template: `
    <section aria-labelledby="leads-title" class="card">
      <h2 id="leads-title">طلبات الخدمة ({{ total() }})</h2>
      @if (message(); as m) {
        <p [class]="m.kind" role="alert">{{ m.text }}</p>
      }
      @if (loading()) {
        <p role="status">بنحمّل...</p>
      } @else if (rows().length === 0 && !message()) {
        <p>مفيش طلبات دلوقتي.</p>
      } @else {
        <div
          class="table-scroll"
          (focusin)="revealFocused($event)"
          role="region"
          tabindex="0"
          aria-label="جدول طلبات الخدمة، استخدم الأسهم للتمرير أفقيا"
        >
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>النشاط</th>
                <th>الرقم</th>
                <th>ملاحظات</th>
                <th>الحالة</th>
                <th>بتتمسح في</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (l of rows(); track l.id) {
                <tr>
                  <td>{{ l.contactName }}</td>
                  <td>{{ l.businessName }}</td>
                  <td dir="ltr">{{ l.phone }}</td>
                  <td class="notes">{{ l.notes }}</td>
                  <td>
                    <select
                      [attr.aria-label]="'حالة طلب ' + l.contactName"
                      [value]="l.status"
                      (change)="setStatus(l, $any($event.target).value)"
                      [disabled]="busy()"
                    >
                      @for (s of statuses; track s) {
                        <option [value]="s" [selected]="s === l.status">{{ label(s) }}</option>
                      }
                    </select>
                  </td>
                  <td>{{ l.expiresUtc.slice(0, 10) }}</td>
                  <td>
                    @if (confirmDelete() === l.id) {
                      <span role="group" aria-label="تأكيد مسح الطلب">
                        <span>هيتمسح نهائيًا.</span>
                        <button
                          type="button"
                          class="btn btn-secondary"
                          (click)="remove(l)"
                          [disabled]="busy()"
                        >
                          تأكيد المسح
                        </button>
                        <button
                          type="button"
                          class="btn btn-secondary"
                          (click)="confirmDelete.set(null)"
                        >
                          إلغاء
                        </button>
                      </span>
                    } @else {
                      <button
                        type="button"
                        class="btn btn-secondary"
                        (click)="confirmDelete.set(l.id)"
                      >
                        مسح
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (pages() > 1) {
          <nav aria-label="صفحات الطلبات">
            <button
              type="button"
              class="btn btn-secondary"
              (click)="goTo(page() - 1)"
              [disabled]="busy() || page() <= 1"
            >
              السابق
            </button>
            <span>{{ page() }} / {{ pages() }}</span>
            <button
              type="button"
              class="btn btn-secondary"
              (click)="goTo(page() + 1)"
              [disabled]="busy() || page() >= pages()"
            >
              التالي
            </button>
          </nav>
        }
      }
    </section>
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
      .notes {
        max-width: 18rem;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
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
export class LeadsPanelComponent {
  /** Browsers leave a partly clipped focused control hidden inside a horizontal scroller; bring it fully into view. */
  revealFocused(event: FocusEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && target !== event.currentTarget) {
      target.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }

  private readonly http = inject(HttpClient);
  readonly statuses: LeadStatusName[] = ['New', 'Contacted', 'Closed'];
  readonly rows = signal<PlatformLead[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  pages(): number {
    return Math.max(1, Math.ceil(this.total() / LEAD_PAGE_SIZE));
  }
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly confirmDelete = signal<string | null>(null);
  readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);
  private ticket = 0;

  constructor() {
    void this.load();
  }

  label(s: LeadStatusName): string {
    return STATUS_LABEL[s];
  }

  async goTo(page: number): Promise<void> {
    if (this.busy()) return;
    this.page.set(Math.min(Math.max(1, Math.floor(page) || 1), this.pages()));
    await this.load();
  }

  /** Loads the current page; returns false when the list could not be refreshed (and says so). */
  async load(): Promise<boolean> {
    const ticket = ++this.ticket;
    this.loading.set(true);
    this.message.set(null);
    try {
      const page = await firstValueFrom(
        this.http.get<LeadPage>('/api/v1/platform/leads', {
          params: { page: this.page(), pageSize: LEAD_PAGE_SIZE },
        }),
      );
      if (ticket !== this.ticket) return false;
      const total = typeof page.total === 'number' ? page.total : 0;
      this.total.set(total);
      const last = Math.max(1, Math.ceil(total / LEAD_PAGE_SIZE));
      if (this.page() > last) {
        // The page emptied (deleted or expired rows): clamp to the last page and reload it.
        this.page.set(last);
        this.loading.set(false);
        return await this.load();
      }
      this.rows.set(Array.isArray(page.items) ? page.items : []);
      return true;
    } catch {
      if (ticket === this.ticket) {
        this.rows.set([]);
        this.message.set({ kind: 'error', text: 'ما قدرناش نحمّل الطلبات. جرّب تاني.' });
      }
      return false;
    } finally {
      if (ticket === this.ticket) this.loading.set(false);
    }
  }

  async setStatus(l: PlatformLead, status: string): Promise<void> {
    if (this.busy() || !this.statuses.includes(status as LeadStatusName) || status === l.status)
      return;
    await this.run(async () => {
      await firstValueFrom(
        this.http.patch(`/api/v1/platform/leads/${l.id}`, { status, rowVersion: l.rowVersion }),
      );
    }, 'اتحدّثت حالة الطلب.');
  }

  async remove(l: PlatformLead): Promise<void> {
    if (this.busy()) return;
    this.confirmDelete.set(null);
    await this.run(async () => {
      await firstValueFrom(
        this.http.delete(`/api/v1/platform/leads/${l.id}`, {
          params: { rowVersion: l.rowVersion },
        }),
      );
    }, 'اتمسح الطلب.');
  }

  private async run(action: () => Promise<void>, okText: string): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      await action();
    } catch (e) {
      const stale = e instanceof HttpErrorResponse && e.status === 412;
      this.busy.set(false);
      const refreshed = await this.load();
      if (refreshed)
        this.message.set({
          kind: 'error',
          text: stale
            ? 'الطلب اتغيّر من حد تاني. حدّثنا القائمة، راجع وجرّب تاني.'
            : 'العملية فشلت. جرّب تاني.',
        });
      return;
    }
    const refreshed = await this.load();
    // A failed refresh keeps its own error: never claim success over a stale list.
    if (refreshed) this.message.set({ kind: 'ok', text: okText });
    this.busy.set(false);
  }
}
