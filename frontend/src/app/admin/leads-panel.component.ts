import { HttpClient } from '@angular/common/http';
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
                      <button type="button" class="btn btn-secondary" (click)="remove(l)" [disabled]="busy()">
                        تأكيد المسح
                      </button>
                      <button type="button" class="btn btn-secondary" (click)="confirmDelete.set(null)">
                        إلغاء
                      </button>
                    </span>
                  } @else {
                    <button type="button" class="btn btn-secondary" (click)="confirmDelete.set(l.id)">
                      مسح
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [
    `
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
  private readonly http = inject(HttpClient);
  readonly statuses: LeadStatusName[] = ['New', 'Contacted', 'Closed'];
  readonly rows = signal<PlatformLead[]>([]);
  readonly total = signal(0);
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

  async load(): Promise<void> {
    const ticket = ++this.ticket;
    this.loading.set(true);
    this.message.set(null);
    try {
      const page = await firstValueFrom(
        this.http.get<LeadPage>('/api/v1/platform/leads', {
          params: { page: 1, pageSize: LEAD_PAGE_SIZE },
        }),
      );
      if (ticket !== this.ticket) return;
      this.rows.set(Array.isArray(page.items) ? page.items : []);
      this.total.set(typeof page.total === 'number' ? page.total : this.rows().length);
    } catch {
      if (ticket === this.ticket)
        this.message.set({ kind: 'error', text: 'ما قدرناش نحمّل الطلبات. جرّب تاني.' });
    } finally {
      if (ticket === this.ticket) this.loading.set(false);
    }
  }

  async setStatus(l: PlatformLead, status: string): Promise<void> {
    if (this.busy() || !this.statuses.includes(status as LeadStatusName) || status === l.status)
      return;
    await this.run(async () => {
      await firstValueFrom(this.http.patch(`/api/v1/platform/leads/${l.id}`, { status }));
    }, 'اتحدّثت حالة الطلب.');
  }

  async remove(l: PlatformLead): Promise<void> {
    if (this.busy()) return;
    this.confirmDelete.set(null);
    await this.run(async () => {
      await firstValueFrom(this.http.delete(`/api/v1/platform/leads/${l.id}`));
    }, 'اتمسح الطلب.');
  }

  private async run(action: () => Promise<void>, okText: string): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      await action();
      await this.load();
      this.message.set({ kind: 'ok', text: okText });
    } catch {
      this.message.set({ kind: 'error', text: 'العملية فشلت. حدّث الصفحة وجرّب تاني.' });
    } finally {
      this.busy.set(false);
    }
  }
}
