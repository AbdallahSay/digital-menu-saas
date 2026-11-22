import { Component, OnInit, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { CategoryDto, SaveResult } from './catalog.models';
import { CategoryModalComponent, CategoryModalResult } from './category-modal.component';
import { CategoryStateService } from './category-state.service';
import { AccessibleDialogComponent } from '../shared/accessible-dialog.component';
import { LoadingComponent } from '../shared/loading.component';

type Feedback = { kind: 'success' | 'error'; text: string } | null;

/**
 * Owner category management (Screen 3 of the U02 design specification):
 * responsive table/card list, publish toggle, up/down reordering and a
 * delete flow whose relational guard is enforced by the backend (HTTP 409).
 */
@Component({
  selector: 'app-category-list',
  imports: [CategoryModalComponent, AccessibleDialogComponent, LoadingComponent],
  template: `
    <section aria-labelledby="categories-title">
      <div class="list-header">
        <h1 id="categories-title">الأقسام</h1>
        <button
          type="button"
          class="btn btn-primary"
          #addButton
          (click)="openModal(null, addButton)"
        >
          + إضافة قسم
        </button>
      </div>

      <p class="list-status" aria-live="polite">
        @if (feedback(); as message) {
          <span [class]="message.kind === 'success' ? 'ok' : 'fail'">{{ message.text }}</span>
        }
      </p>

      @if (store.isLoading()) {
        <app-loading />
      } @else if (store.error(); as loadError) {
        <app-loading [hasError]="true" [errorMessage]="loadError" (retry)="store.load()" />
      } @else if (store.sorted().length === 0) {
        <div class="empty-state">
          <p>لسه مفيش أقسام. ابدأ بإضافة أول قسم في المنيو.</p>
        </div>
      } @else {
        <table class="categories-table">
          <thead>
            <tr>
              <th scope="col">الترتيب</th>
              <th scope="col">الاسم بالعربية</th>
              <th scope="col">الاسم بالإنجليزية</th>
              <th scope="col">الحالة</th>
              <th scope="col">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            @for (category of store.sorted(); track category.id; let first = $first, last = $last) {
              <tr>
                <td data-label="الترتيب">
                  <div class="order-controls">
                    <span class="order-value">{{ category.sortOrder }}</span>
                    <button
                      type="button"
                      class="order-btn"
                      [disabled]="first || busy()"
                      [attr.aria-label]="'تحريك ' + category.nameAr + ' لأعلى'"
                      (click)="move(category, -1)"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      class="order-btn"
                      [disabled]="last || busy()"
                      [attr.aria-label]="'تحريك ' + category.nameAr + ' لأسفل'"
                      (click)="move(category, 1)"
                    >
                      ▼
                    </button>
                  </div>
                </td>
                <td data-label="الاسم بالعربية">{{ category.nameAr }}</td>
                <td data-label="الاسم بالإنجليزية" dir="ltr">{{ category.nameEn ?? '—' }}</td>
                <td data-label="الحالة">
                  <button
                    type="button"
                    class="badge-toggle"
                    [class.on]="category.isPublished"
                    role="switch"
                    [attr.aria-checked]="category.isPublished"
                    [attr.aria-label]="
                      category.isPublished
                        ? 'إخفاء قسم ' + category.nameAr
                        : 'نشر قسم ' + category.nameAr
                    "
                    [disabled]="busy()"
                    (click)="togglePublish(category)"
                  >
                    {{ category.isPublished ? '🟢 منشور' : '⚪ مخفي' }}
                  </button>
                </td>
                <td data-label="الإجراءات">
                  <div class="row-actions">
                    <button
                      type="button"
                      class="btn btn-secondary"
                      #editButton
                      [disabled]="busy()"
                      (click)="openModal(category, editButton)"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      class="btn btn-danger"
                      #deleteButton
                      [disabled]="busy()"
                      [attr.aria-label]="'حذف قسم ' + category.nameAr"
                      (click)="askDelete(category, deleteButton)"
                    >
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (editing(); as state) {
        <app-category-modal
          [category]="state.category"
          [returnFocusTo]="state.trigger"
          [onSave]="saveCategory"
          (closed)="closeModal()"
        />
      }

      @if (deleting(); as target) {
        <app-accessible-dialog
          role="alertdialog"
          labelledBy="del-title"
          [returnFocusTo]="target.trigger"
          [lockDismissal]="busy()"
          (dismissed)="cancelDelete()"
        >
          <h2 id="del-title">حذف القسم</h2>
          <p>
            هل أنت متأكد من حذف قسم "{{ target.category.nameAr }}"؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <div class="modal-actions">
            <button
              type="button"
              class="btn btn-secondary"
              data-autofocus
              [disabled]="busy()"
              (click)="cancelDelete()"
            >
              إلغاء
            </button>
            <button
              type="button"
              class="btn btn-danger"
              [disabled]="busy()"
              (click)="confirmDelete()"
            >
              {{ busy() ? 'جاري الحذف…' : 'حذف نهائي' }}
            </button>
          </div>
        </app-accessible-dialog>
      }

      @if (conflict(); as blocked) {
        <app-accessible-dialog
          role="alertdialog"
          labelledBy="conf-title"
          [returnFocusTo]="blocked.trigger"
          [lockDismissal]="busy()"
          (dismissed)="conflict.set(null)"
        >
          <h2 id="conf-title">لا يمكن حذف القسم</h2>
          @if (blocked.count === null) {
            <p>
              ⚠️ الخادم رفض حذف "{{ blocked.category.nameAr }}" حفاظاً على البيانات، وتعذّر التحقق
              من السبب. غالباً القسم يحتوي على أطباق (منشورة أو مخفية) — راجع محتوياته وجرّب مرة
              أخرى.
            </p>
          } @else if (blocked.count > 0) {
            <p>
              ⚠️ لا يمكن حذف "{{ blocked.category.nameAr }}" لأنه يحتوي على
              {{ dishCount(blocked.count) }} (منشورة أو مخفية). للحفاظ على سلامة القائمة، انقل
              الأطباق إلى قسم آخر أو احذفها أولاً.
            </p>
          } @else {
            <p>
              ⚠️ القسم "{{ blocked.category.nameAr }}" يبدو فارغاً لكن الخادم رفض الحذف — غالباً
              تعارض مؤقت. جرّب مرة أخرى بعد قليل.
            </p>
          }
          <div class="modal-actions">
            <button
              type="button"
              class="btn btn-primary"
              data-autofocus
              (click)="conflict.set(null)"
            >
              حسناً، فهمت ذلك
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              [disabled]="busy()"
              (click)="retryDeleteFromConflict()"
            >
              حذف مرة أخرى
            </button>
          </div>
        </app-accessible-dialog>
      }
    </section>
  `,
  styles: [
    `
      .list-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }
      h1 {
        font-family: var(--font-family-display);
        font-size: var(--font-size-2xl);
        margin: 0;
      }
      h2 {
        font-size: var(--font-size-lg);
        margin: 0 0 var(--space-3);
      }
      .list-header .btn {
        min-height: 44px;
      }
      .list-status {
        min-height: 1.5rem;
        font-size: var(--font-size-sm);
        margin: 0 0 var(--space-3);
      }
      .list-status .ok {
        color: var(--color-success, #1e7f4f);
      }
      .list-status .fail {
        color: var(--color-danger, #b3261e);
      }
      .categories-table {
        width: 100%;
        border-collapse: collapse;
        background: var(--color-surface-card);
        border-radius: var(--radius-xl);
        overflow: hidden;
      }
      .categories-table th,
      .categories-table td {
        padding: var(--space-3) var(--space-4);
        text-align: start;
        border-bottom: 1px solid var(--color-border-subtle);
      }
      .categories-table th {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
      }
      .order-controls {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
      }
      .order-value {
        min-width: 2ch;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .order-btn {
        min-width: 44px;
        min-height: 44px;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-brand-primary);
        font-size: var(--font-size-sm);
      }
      .order-btn:disabled {
        color: var(--color-text-muted, #8a8378);
        cursor: not-allowed;
      }
      .badge-toggle {
        min-height: 44px;
        padding: 0 var(--space-3);
        border-radius: 999px;
        border: 1px solid var(--color-border-subtle);
        background: var(--color-surface-card);
        cursor: pointer;
        font-size: var(--font-size-sm);
      }
      .badge-toggle.on {
        background: var(--color-success-soft, #e5f5ec);
        border-color: var(--color-success, #1e7f4f);
      }
      .row-actions {
        display: flex;
        gap: var(--space-2);
      }
      .row-actions .btn {
        min-height: 44px;
      }
      .btn-danger {
        background: var(--color-danger, #b3261e);
        color: #fff;
      }
      .empty-state {
        background: var(--color-surface-card);
        border: 1px dashed var(--color-border-subtle);
        border-radius: var(--radius-xl);
        padding: var(--space-8);
        text-align: center;
        color: var(--color-text-secondary);
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-3);
        margin-top: var(--space-5);
      }
      .modal-actions .btn {
        min-height: 44px;
      }
      @media (max-width: 767px) {
        .categories-table thead {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
        }
        .categories-table,
        .categories-table tbody,
        .categories-table tr,
        .categories-table td {
          display: block;
          width: 100%;
        }
        .categories-table tr {
          border-bottom: 2px solid var(--color-border-subtle);
          padding: var(--space-2) 0;
        }
        .categories-table td {
          border: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .categories-table td::before {
          content: attr(data-label);
          font-size: var(--font-size-xs);
          color: var(--color-text-secondary);
        }
        .categories-table td[data-label='الاسم بالعربية'] {
          font-weight: 700;
          font-size: var(--font-size-lg);
        }
      }
    `,
  ],
})
export class CategoryListComponent implements OnInit {
  readonly store = inject(CategoryStateService);
  readonly editing = signal<{ category: CategoryDto | null; trigger: HTMLElement | null } | null>(
    null,
  );
  readonly deleting = signal<{ category: CategoryDto; trigger: HTMLElement | null } | null>(null);
  readonly conflict = signal<{
    category: CategoryDto;
    count: number | null;
    trigger: HTMLElement | null;
  } | null>(null);
  readonly feedback = signal<Feedback>(null);
  readonly busy = signal(false);

  /** Arabic dish counting: 1 طبق، 2 طبقين، 3-10 أطباق، 11+ طبقاً. */
  dishCount(n: number): string {
    if (n === 1) return 'طبق واحد';
    if (n === 2) return 'طبقين';
    return n <= 10 ? `${n} أطباق` : `${n} طبقاً`;
  }

  constructor() {
    inject(Title).setTitle('الأقسام | لوحة التحكم');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
  }

  ngOnInit(): void {
    void this.store.load();
  }

  openModal(category: CategoryDto | null, trigger: HTMLElement): void {
    this.feedback.set(null);
    this.editing.set({ category, trigger });
  }

  closeModal(): void {
    this.editing.set(null);
  }

  /**
   * The modal owns its lifecycle: it awaits this handler and only closes on
   * 'ok', so a failed save never discards the draft and a late response can
   * never close a different dialog. On 'stale' the list reloads and the
   * editing target's rowVersion refreshes so an immediate retry can succeed.
   */
  readonly saveCategory = async (result: CategoryModalResult): Promise<SaveResult> => {
    const state = this.editing();
    const outcome =
      state?.category && result.rowVersion
        ? await this.store.update(state.category.id, result.input, result.rowVersion)
        : await this.store.create(result.input);
    if (outcome === 'ok') {
      this.feedback.set({ kind: 'success', text: 'تم حفظ القسم بنجاح.' });
      this.editing.set(null);
    } else if (outcome === 'stale') {
      await this.store.load();
      if (state?.category) {
        const fresh = this.store.categories().find((c) => c.id === state.category!.id);
        if (fresh) this.editing.set({ ...state, category: fresh });
      }
    }
    return outcome;
  };

  async togglePublish(category: CategoryDto): Promise<void> {
    this.busy.set(true);
    try {
      const outcome = await this.store.togglePublish(category);
      this.feedback.set(
        outcome === 'ok'
          ? {
              kind: 'success',
              text: category.isPublished ? 'اتخفى القسم من المنيو.' : 'اتنشر القسم في المنيو.',
            }
          : outcome === 'stale'
            ? { kind: 'error', text: 'البيانات اتغيرت. جاري تحديث القايمة.' }
            : { kind: 'error', text: 'حصل خطأ. جرّب تاني.' },
      );
      if (outcome === 'stale') await this.store.load();
    } finally {
      this.busy.set(false);
    }
  }

  async move(category: CategoryDto, direction: -1 | 1): Promise<void> {
    this.busy.set(true);
    this.feedback.set(null);
    try {
      const outcome = await this.store.move(category.id, direction);
      // The "list refreshed" copy is only honest when the reconciliation
      // reload actually succeeded.
      const reloadFailed = this.store.error() !== null;
      if (outcome === 'partial') {
        this.feedback.set({
          kind: 'error',
          text: reloadFailed
            ? 'إعادة الترتيب ما كملتش، وتعذّر تحديث القايمة من الخادم. أعد تحميل الصفحة قبل المتابعة.'
            : 'إعادة الترتيب ما كملتش للآخر — القايمة اتحدثت بالحالة الحالية على الخادم. راجع الترتيب وجرّب تاني.',
        });
      } else if (outcome === 'stale') {
        this.feedback.set({
          kind: 'error',
          text: reloadFailed
            ? 'البيانات اتغيرت من مكان تاني، وتعذّر تحديث القايمة. أعد تحميل الصفحة قبل المتابعة.'
            : 'البيانات اتغيرت من مكان تاني. القايمة اتحدثت — جرّب تاني.',
        });
      } else if (outcome !== 'ok' && outcome !== 'invalid') {
        this.feedback.set({ kind: 'error', text: 'حصل خطأ أثناء إعادة الترتيب. جرّب تاني.' });
      }
    } finally {
      this.busy.set(false);
    }
  }

  askDelete(category: CategoryDto, trigger: HTMLElement | null): void {
    this.feedback.set(null);
    this.deleting.set({ category, trigger });
  }

  cancelDelete(): void {
    if (this.busy()) return;
    this.deleting.set(null);
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleting();
    if (!target || this.busy()) return;
    this.busy.set(true);
    try {
      const outcome = await this.store.remove(target.category.id, target.category.rowVersion);
      if (outcome === 'ok') {
        this.feedback.set({ kind: 'success', text: 'تم حذف القسم.' });
        this.deleting.set(null);
      } else if (outcome === 'conflict') {
        // The backend refuses while ANY non-deleted item (published or not)
        // references the category; a 409 can also be a transient conflict.
        // itemCount returns null when the real count is unknown — say so
        // instead of claiming zero.
        const count = await this.store.itemCount(target.category.id);
        this.conflict.set({ category: target.category, count, trigger: target.trigger });
        this.deleting.set(null);
      } else if (outcome === 'stale') {
        this.feedback.set({ kind: 'error', text: 'البيانات اتغيرت. جاري تحديث القايمة.' });
        this.deleting.set(null);
        await this.store.load();
      } else {
        this.feedback.set({ kind: 'error', text: 'حصل خطأ أثناء الحذف. جرّب تاني.' });
        this.deleting.set(null);
      }
    } finally {
      this.busy.set(false);
    }
  }

  async retryDeleteFromConflict(): Promise<void> {
    const blocked = this.conflict();
    if (!blocked || this.busy()) return;
    this.conflict.set(null);
    this.deleting.set({ category: blocked.category, trigger: blocked.trigger });
    await this.confirmDelete();
  }
}
