import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { AccessibleDialogComponent } from '../shared/accessible-dialog.component';
import { LoadingComponent } from '../shared/loading.component';
import { CategoryStateService } from './category-state.service';
import { ItemModalComponent, ItemModalResult } from './item-modal.component';
import { ItemStateService } from './item-state.service';
import { ItemDto, ItemSaveResult } from './items.models';

type Feedback = { kind: 'success' | 'error'; text: string } | null;

/**
 * Owner item catalog (Screen 4 of frontend/design/admin-specs.md): inventory
 * toolbar (server-side search + category filter, client-side sold-out view),
 * responsive table/card list, instant availability toggle, and a guarded
 * delete flow. Thumbnails show a placeholder: the backend has no image
 * read-back endpoint yet (lands with the media delivery phase), so a freshly
 * uploaded image is previewable only inside the modal that staged it.
 */
@Component({
  selector: 'app-item-list',
  // FormsModule makes ngSubmit intercept the native toolbar submit (Enter in
  // the search input) and prevent the default navigation.
  imports: [FormsModule, ItemModalComponent, AccessibleDialogComponent, LoadingComponent],
  template: `
    <div class="items-page">
      <div class="page-header">
        <h1 id="items-title" tabindex="-1">الأطباق</h1>
        <button
          type="button"
          class="btn btn-primary"
          #addButton
          (click)="openModal(null, addButton)"
        >
          + إضافة طبق
        </button>
      </div>

      <form class="toolbar" (ngSubmit)="applyFilters()" role="search" aria-label="بحث الأطباق">
        <input
          class="form-input search-input"
          type="search"
          [value]="searchDraft()"
          (input)="onSearchInput($event)"
          placeholder="ابحث باسم الطبق…"
          aria-label="ابحث باسم الطبق"
        />
        <select
          class="form-input category-filter"
          [ngModel]="categoryFilter()"
          [ngModelOptions]="{ standalone: true }"
          (ngModelChange)="onCategorySelect($event)"
          aria-label="تصفية حسب القسم"
        >
          <option value="">كل الأقسام</option>
          @for (category of categories.sorted(); track category.id) {
            <option [value]="category.id">{{ category.nameAr }}</option>
          }
        </select>
        <button
          type="button"
          class="btn btn-secondary soldout-toggle"
          [class.active]="store.onlySoldOut()"
          [attr.aria-pressed]="store.onlySoldOut()"
          (click)="toggleSoldOut()"
        >
          النافد فقط
        </button>
      </form>

      <p class="list-status" aria-live="polite">
        @if (feedback(); as message) {
          <span [class]="message.kind === 'success' ? 'ok' : 'fail'">{{ message.text }}</span>
        }
      </p>

      @if (store.isLoading()) {
        <app-loading />
      } @else if (store.error(); as loadError) {
        <app-loading [hasError]="true" [errorMessage]="loadError" (retry)="reload()" />
      } @else if (store.filtered().length === 0) {
        <div class="empty-state">
          @if (store.onlySoldOut()) {
            <p>مفيش أطباق نافدة في النتائج الحالية.</p>
          } @else {
            <p>لسه مفيش أطباق. ابدأ بإضافة أول طبق في المنيو.</p>
          }
        </div>
      } @else {
        <table class="items-table">
          <thead>
            <tr>
              <th scope="col">الصورة</th>
              <th scope="col">الاسم</th>
              <th scope="col">القسم</th>
              <th scope="col">السعر</th>
              <th scope="col">التوفر</th>
              <th scope="col">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            @for (item of store.filtered(); track item.id) {
              <tr>
                <td data-label="الصورة">
                  @if (item.imageId) {
                    <img
                      class="thumb"
                      width="48"
                      height="48"
                      loading="lazy"
                      alt=""
                      [src]="'/api/v1/admin/media/items/' + item.imageId + '/thumbnail'"
                    />
                  } @else {
                    <span class="thumb-placeholder" aria-hidden="true">🍽️</span>
                  }
                </td>
                <td data-label="الاسم">
                  <span class="item-name">{{ item.nameAr }}</span>
                  @if (item.nameEn) {
                    <span class="item-name-en" dir="ltr">{{ item.nameEn }}</span>
                  }
                </td>
                <td data-label="القسم">{{ categoryName(item.categoryId) }}</td>
                <td data-label="السعر">
                  <span dir="ltr">{{ item.price.toFixed(2) }}</span> ج.م
                </td>
                <td data-label="التوفر">
                  <button
                    type="button"
                    class="availability-toggle"
                    [class.available]="item.isAvailable"
                    [disabled]="busy()"
                    [attr.aria-pressed]="item.isAvailable"
                    (click)="toggleAvailability(item)"
                  >
                    {{ item.isAvailable ? '🟢 متوفر' : '⚪ نفد' }}
                  </button>
                </td>
                <td data-label="الإجراءات">
                  <div class="row-actions">
                    <button
                      type="button"
                      class="btn btn-secondary"
                      [disabled]="busy()"
                      (click)="openModal(item, $any($event.target))"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      class="btn btn-danger"
                      [disabled]="busy()"
                      (click)="askDelete(item, $any($event.target))"
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
        <app-item-modal
          [item]="state.item"
          [categories]="categories.sorted()"
          [returnFocusTo]="state.trigger"
          [onSave]="saveItem"
          (closed)="closeModal()"
        />
      }

      @if (deleting(); as target) {
        <app-accessible-dialog
          role="alertdialog"
          labelledBy="del-item-title"
          [returnFocusTo]="target.trigger"
          [lockDismissal]="busy()"
          (dismissed)="cancelDelete()"
        >
          <h2 id="del-item-title">حذف الطبق</h2>
          <p>هل أنت متأكد من حذف "{{ target.item.nameAr }}"؟ لا يمكن التراجع عن هذا الإجراء.</p>
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
    </div>
  `,
  styles: [
    `
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }
      .page-header h1 {
        font-family: var(--font-family-display);
        font-size: var(--font-size-2xl);
        margin: 0;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3);
        margin-bottom: var(--space-4);
      }
      .search-input {
        flex: 1 1 220px;
      }
      .category-filter {
        flex: 0 1 200px;
      }
      .soldout-toggle.active {
        border-color: var(--color-primary, #d97706);
        font-weight: 700;
      }
      .list-status {
        min-height: 1.5rem;
        margin: 0 0 var(--space-3);
        font-size: var(--font-size-sm);
      }
      .list-status .ok {
        color: var(--color-success, #15803d);
      }
      .list-status .fail {
        color: var(--color-danger, #b3261e);
      }
      .items-table {
        width: 100%;
        border-collapse: collapse;
        background: var(--color-surface-card);
        border-radius: var(--radius-md, 10px);
        overflow: hidden;
      }
      .items-table th,
      .items-table td {
        padding: var(--space-3);
        text-align: start;
        border-bottom: 1px solid var(--color-border, #e2e8f0);
      }
      .thumb {
        width: 44px;
        height: 44px;
        object-fit: cover;
        border-radius: var(--radius-sm, 6px);
      }
      .thumb-placeholder {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: var(--radius-sm, 6px);
        background: var(--color-surface-muted, #f1f5f9);
        font-size: 1.25rem;
      }
      .item-name {
        display: block;
        font-weight: 600;
      }
      .item-name-en {
        display: block;
        font-size: var(--font-size-xs);
        color: var(--color-text-muted, #64748b);
      }
      .availability-toggle {
        min-height: 44px;
        border: 1px solid var(--color-border, #cbd5e1);
        background: var(--color-surface, #fff);
        border-radius: var(--radius-sm, 6px);
        padding: 0 var(--space-3);
        cursor: pointer;
      }
      .availability-toggle.available {
        border-color: var(--color-success, #15803d);
      }
      .row-actions {
        display: flex;
        gap: var(--space-2);
      }
      .empty-state {
        padding: var(--space-6);
        text-align: center;
        color: var(--color-text-muted, #64748b);
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
        .items-table thead {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
        }
        .items-table,
        .items-table tbody,
        .items-table tr,
        .items-table td {
          display: block;
          width: 100%;
        }
        .items-table tr {
          margin-bottom: var(--space-3);
          border: 1px solid var(--color-border, #e2e8f0);
          border-radius: var(--radius-md, 10px);
          background: var(--color-surface-card);
        }
        .items-table td {
          border-bottom: none;
        }
        .items-table td::before {
          content: attr(data-label);
          display: block;
          font-size: var(--font-size-xs);
          color: var(--color-text-muted, #64748b);
        }
      }
    `,
  ],
})
export class ItemListComponent implements OnInit, OnDestroy {
  readonly store = inject(ItemStateService);
  readonly categories = inject(CategoryStateService);
  readonly editing = signal<{ item: ItemDto | null; trigger: HTMLElement | null } | null>(null);
  readonly deleting = signal<{ item: ItemDto; trigger: HTMLElement | null } | null>(null);
  readonly feedback = signal<Feedback>(null);
  readonly busy = signal(false);
  readonly searchDraft = signal('');
  readonly categoryFilter = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(Title).setTitle('الأطباق | لوحة التحكم');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
  }

  ngOnInit(): void {
    // Controls and service filters are initialized together: the service is
    // root-scoped, so re-entering the page must reflect its active filter in
    // the visible controls instead of silently loading filtered results.
    const active = this.store.filters();
    this.searchDraft.set(active.search);
    this.categoryFilter.set(active.categoryId ?? '');
    void this.store.load();
    void this.categories.load();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  categoryName(categoryId: string): string {
    return this.categories.categories().find((c) => c.id === categoryId)?.nameAr ?? '—';
  }

  onSearchInput(event: Event): void {
    this.searchDraft.set((event.target as HTMLInputElement).value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), 300);
  }

  onCategorySelect(categoryId: string): void {
    this.categoryFilter.set(categoryId);
    void this.applyFilters();
  }

  toggleSoldOut(): void {
    this.store.onlySoldOut.update((v) => !v);
  }

  async applyFilters(): Promise<void> {
    await this.store.load({
      categoryId: this.categoryFilter() || null,
      search: this.searchDraft(),
    });
  }

  reload(): void {
    void this.store.load();
  }

  openModal(item: ItemDto | null, trigger: HTMLElement): void {
    this.feedback.set(null);
    this.editing.set({ item, trigger });
  }

  closeModal(): void {
    this.editing.set(null);
  }

  /**
   * The modal owns its lifecycle: it awaits this handler and only closes on
   * 'ok'. Creates append at the next position index; a staged image uploads
   * AFTER the item exists, and an upload failure never fails the save — the
   * item is kept and the feedback says exactly what happened. On 'stale' the
   * list reloads and the editing target's rowVersion refreshes for a retry.
   */
  readonly saveItem = async (result: ItemModalResult): Promise<ItemSaveResult> => {
    const state = this.editing();
    if (!state?.item) {
      // The append position comes from the destination category's FULL
      // unfiltered sequence (max sortOrder + 1), never the filtered view.
      // The modal's categoryId at submit time decides the destination.
      const position = await this.store.nextPosition(result.input.categoryId);
      if (position === null) return 'error'; // no safe position: refuse, never guess
      result.input.sortOrder = position;
    }
    const { result: outcome, item: saved } = await this.store.save(
      result.input,
      state?.item ?? undefined,
    );
    if (outcome === 'ok') {
      this.editing.set(null);
      if (result.file && saved) {
        const upload = await this.store.uploadImage(saved.id, result.file);
        if (upload !== 'ok') {
          this.feedback.set({
            kind: 'error',
            text:
              upload === 'too-large'
                ? 'الطبق اتحفظ، لكن الصورة أكبر من 5 ميجابايت ومرفوضة. عدّل الطبق وجرّب صورة أصغر.'
                : upload === 'unsupported'
                  ? 'الطبق اتحفظ، لكن نوع الصورة غير مدعوم. عدّل الطبق وجرّب صورة تانية.'
                  : 'الطبق اتحفظ، لكن رفع الصورة فشل. عدّل الطبق وجرّب تاني.',
          });
          return outcome;
        }
      }
      if (result.file && saved) await this.store.load(); // server-confirmed thumbnail after upload
      this.feedback.set({ kind: 'success', text: 'تم حفظ الطبق بنجاح.' });
    } else if (outcome === 'stale') {
      await this.store.load();
      if (state?.item) {
        const fresh = this.store.items().find((i) => i.id === state.item!.id);
        if (fresh) this.editing.set({ ...state, item: fresh });
      }
    }
    return outcome;
  };

  async toggleAvailability(item: ItemDto): Promise<void> {
    this.busy.set(true);
    try {
      const outcome = await this.store.setAvailability(item, !item.isAvailable);
      this.feedback.set(
        outcome === 'ok'
          ? {
              kind: 'success',
              text: item.isAvailable ? `«${item.nameAr}» بقى نافد.` : `«${item.nameAr}» بقى متوفر.`,
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

  askDelete(item: ItemDto, trigger: HTMLElement | null): void {
    this.feedback.set(null);
    this.deleting.set({ item, trigger });
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
      const outcome = await this.store.remove(target.item);
      if (outcome === 'ok') {
        this.feedback.set({ kind: 'success', text: 'تم حذف الطبق.' });
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
}
