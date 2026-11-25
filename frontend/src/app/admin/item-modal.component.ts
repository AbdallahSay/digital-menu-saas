import { Component, OnDestroy, OnInit, inject, input, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { AccessibleDialogComponent } from '../shared/accessible-dialog.component';
import { CategoryDto } from './catalog.models';
import { ItemDto, ItemInput, ItemSaveResult } from './items.models';

export interface ItemModalResult {
  input: ItemInput;
  /** Staged image; uploaded by the parent AFTER the item exists (create-then-upload). */
  file: File | null;
}

/** Validates the trimmed value, matching backend normalization (F07). */
function trimmedLength(min: number, max: number) {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const length = (control.value ?? '').trim().length;
    return length >= min && length <= max ? null : { trimmedLength: { min, max, actual: length } };
  };
}

/** The backend binds a decimal(18,2): more than two fraction digits is rejected, never rounded. */
function twoDecimals(control: AbstractControl<number>): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === undefined) return null;
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9 ? null : { twoDecimals: true };
}

/**
 * Create/edit item dialog (Screen 4 modal). Accessibility comes from
 * AccessibleDialogComponent. The dialog owns its save lifecycle: it calls
 * the parent's onSave, stays open with the draft and an inline error on any
 * failure, locks dismissal and disables fields while saving, and only closes
 * on a confirmed save or an explicit cancel. The image uploader stages a
 * file locally; the parent uploads it after the save because the media API
 * needs an existing item id. The aspect selector is display-only (the
 * backend takes no aspect parameter) and only frames the preview.
 */
@Component({
  selector: 'app-item-modal',
  imports: [ReactiveFormsModule, AccessibleDialogComponent],
  template: `
    <app-accessible-dialog
      labelledBy="item-modal-title"
      [returnFocusTo]="returnFocusTo()"
      [lockDismissal]="saving()"
      (dismissed)="cancel()"
    >
      <h2 id="item-modal-title">{{ item() ? 'تعديل الطبق' : 'إضافة طبق جديد' }}</h2>

      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <fieldset class="form-fields" [disabled]="saving()">
          <div class="form-group">
            <label class="form-label" for="item-name-ar">اسم الطبق بالعربية *</label>
            <input
              id="item-name-ar"
              class="form-input"
              type="text"
              formControlName="nameAr"
              maxlength="150"
              required
              data-autofocus
            />
            @if (invalid('nameAr')) {
              <p class="field-error" role="alert">اسم الطبق بالعربية مطلوب (من 2 إلى 150 حرفاً)</p>
            }
          </div>

          <div class="form-group">
            <label class="form-label" for="item-name-en">اسم الطبق بالإنجليزية (اختياري)</label>
            <input
              id="item-name-en"
              class="form-input"
              type="text"
              formControlName="nameEn"
              maxlength="150"
              dir="ltr"
            />
            @if (invalid('nameEn')) {
              <p class="field-error" role="alert">الاسم بالإنجليزية يجب ألا يتجاوز 150 حرفاً</p>
            }
          </div>

          <div class="form-group">
            <label class="form-label" for="item-category">القسم *</label>
            <select id="item-category" class="form-input" formControlName="categoryId" required>
              @for (category of categories(); track category.id) {
                <option [value]="category.id">{{ category.nameAr }}</option>
              }
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="item-price">السعر (ج.م) *</label>
            <input
              id="item-price"
              class="form-input"
              type="number"
              formControlName="price"
              min="0.01"
              step="0.01"
              inputmode="decimal"
              dir="ltr"
              required
            />
            @if (invalid('price')) {
              <p class="field-error" role="alert">
                السعر مطلوب: 0.01 ج.م على الأقل وبحد أقصى خانتين عشريتين
              </p>
            }
          </div>

          <div class="form-group">
            <label class="form-label" for="item-description-ar">الوصف بالعربية (اختياري)</label>
            <textarea
              id="item-description-ar"
              class="form-input"
              formControlName="descriptionAr"
              maxlength="2000"
              rows="3"
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label" for="item-description-en">الوصف بالإنجليزية (اختياري)</label>
            <textarea
              id="item-description-en"
              class="form-input"
              formControlName="descriptionEn"
              maxlength="2000"
              rows="3"
              dir="ltr"
            ></textarea>
          </div>

          <div class="form-group">
            <span class="form-label" id="item-image-label">صورة الطبق (اختياري)</span>
            <div class="image-tools" role="group" aria-labelledby="item-image-label">
              <div class="aspect-picker" role="group" aria-label="أبعاد المعاينة">
                <button
                  type="button"
                  class="aspect-btn"
                  [class.active]="aspect() === '1:1'"
                  (click)="aspect.set('1:1')"
                >
                  1:1
                </button>
                <button
                  type="button"
                  class="aspect-btn"
                  [class.active]="aspect() === '4:3'"
                  (click)="aspect.set('4:3')"
                >
                  4:3
                </button>
              </div>
              <label class="btn btn-secondary upload-btn" for="item-image">اختيار صورة</label>
              <input
                id="item-image"
                class="visually-hidden"
                type="file"
                accept="image/*"
                (change)="stage($event)"
              />
            </div>
            @if (previewUrl(); as url) {
              <img
                class="image-preview"
                [class.wide]="aspect() === '4:3'"
                [src]="url"
                alt="معاينة صورة الطبق"
              />
            }
            <p class="field-hint">حد أقصى 5 ميجابايت؛ بتتحول لـ webp على السيرفر.</p>
          </div>

          <div class="form-group form-check">
            <input id="item-available" type="checkbox" formControlName="isAvailable" />
            <label for="item-available">متوفر</label>
          </div>
          <div class="form-group form-check">
            <input id="item-featured" type="checkbox" formControlName="isFeatured" />
            <label for="item-featured">يظهر في الأصناف المميزة</label>
          </div>
        </fieldset>

        @if (saveError(); as message) {
          <p class="field-error save-error" role="alert">{{ message }}</p>
        }

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="cancel()">
            إلغاء
          </button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'جاري الحفظ…' : 'حفظ' }}
          </button>
        </div>
      </form>
    </app-accessible-dialog>
  `,
  styles: [
    `
      h2 {
        font-family: var(--font-family-display);
        font-size: var(--font-size-xl);
        margin: 0 0 var(--space-4);
      }
      .form-fields {
        border: none;
        padding: 0;
        margin: 0;
        min-width: 0;
      }
      /* Space between fields so a focus ring does not touch the next label. */
      .form-fields > * + * {
        margin-top: var(--space-3);
      }
      .form-check {
        display: flex;
        flex-direction: row; /* the global .form-group stacks children; a checkbox sits beside its label */
        align-items: center;
        gap: var(--space-2);
      }
      .form-check input {
        width: 20px;
        height: 20px;
      }
      .image-tools {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .aspect-picker {
        display: flex;
        gap: var(--space-1);
      }
      .aspect-btn {
        min-width: 44px;
        min-height: 44px;
        border: 1px solid var(--color-border, #cbd5e1);
        background: var(--color-surface, #fff);
        border-radius: var(--radius-sm, 6px);
        cursor: pointer;
      }
      .aspect-btn.active {
        border-color: var(--color-primary, #d97706);
        font-weight: 700;
      }
      .upload-btn {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        cursor: pointer;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }
      .image-preview {
        margin-top: var(--space-3);
        width: 160px;
        aspect-ratio: 1 / 1;
        object-fit: cover;
        border-radius: var(--radius-md, 10px);
        border: 1px solid var(--color-border, #cbd5e1);
      }
      .image-preview.wide {
        aspect-ratio: 4 / 3;
      }
      .field-hint {
        font-size: var(--font-size-xs);
        color: var(--color-text-muted, #64748b);
        margin: var(--space-1, 0.25rem) 0 0;
      }
      .field-error {
        color: var(--color-danger, #b3261e);
        font-size: var(--font-size-xs);
        margin: var(--space-1, 0.25rem) 0 0;
      }
      .save-error {
        font-size: var(--font-size-sm);
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-3);
        margin-top: var(--space-5);
        /* Keep save/cancel visible while a tall dialog scrolls (small phones). */
        position: sticky;
        bottom: calc(-1 * var(--space-6));
        margin-inline: calc(-1 * var(--space-6));
        margin-bottom: calc(-1 * var(--space-6));
        padding: var(--space-3) var(--space-6);
        background: var(--color-surface-card);
        border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      }
      .modal-actions .btn {
        min-height: 44px;
      }
    `,
  ],
})
export class ItemModalComponent implements OnInit, OnDestroy {
  /** Existing item for edit mode; null for create mode. */
  readonly item = input<ItemDto | null>(null);
  /** Categories for the selector; always the full published-or-not owner list. */
  readonly categories = input.required<CategoryDto[]>();
  /** Element focus returns to on close. */
  readonly returnFocusTo = input<HTMLElement | null>(null);
  /** Performs save (and any staged upload); the dialog stays open on non-'ok'. */
  readonly onSave = input.required<(result: ItemModalResult) => Promise<ItemSaveResult>>();
  readonly closed = output<void>();

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly aspect = signal<'1:1' | '4:3'>('1:1');
  readonly previewUrl = signal<string | null>(null);
  private staged: File | null = null;

  readonly form = inject(FormBuilder).nonNullable.group({
    nameAr: ['', [trimmedLength(2, 150)]],
    nameEn: ['', [trimmedLength(0, 150)]],
    categoryId: ['', [Validators.required]],
    price: [
      null as number | null,
      [Validators.required, Validators.min(0.01), Validators.max(9999999999999999.99), twoDecimals],
    ],
    descriptionAr: ['', [Validators.maxLength(2000)]],
    descriptionEn: ['', [Validators.maxLength(2000)]],
    isAvailable: [true],
    isFeatured: [false],
  });

  ngOnInit(): void {
    const existing = this.item();
    if (existing) {
      this.form.setValue({
        nameAr: existing.nameAr,
        nameEn: existing.nameEn ?? '',
        categoryId: existing.categoryId,
        price: existing.price,
        descriptionAr: existing.descriptionAr ?? '',
        descriptionEn: existing.descriptionEn ?? '',
        isAvailable: existing.isAvailable,
        isFeatured: existing.isFeatured ?? false,
      });
    } else {
      const first = this.categories()[0];
      if (first) this.form.controls.categoryId.setValue(first.id);
    }
  }

  ngOnDestroy(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  stage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    const previous = this.previewUrl();
    if (previous) URL.revokeObjectURL(previous);
    this.staged = file;
    this.previewUrl.set(file ? URL.createObjectURL(file) : null);
  }

  invalid(control: 'nameAr' | 'nameEn' | 'price'): boolean {
    const field = this.form.controls[control];
    return field.touched && field.invalid;
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    const raw = this.form.getRawValue();
    const existing = this.item();
    const input: ItemInput = {
      categoryId: raw.categoryId,
      nameAr: raw.nameAr.trim(),
      nameEn: raw.nameEn.trim() || null,
      descriptionAr: raw.descriptionAr.trim() || null,
      descriptionEn: raw.descriptionEn.trim() || null,
      price: raw.price as number,
      currencyCode: 'EGP',
      // Items keep position-indexed sortOrder like categories; the modal has
      // no ordering UI. Edits keep their position; the parent assigns the
      // append position on create (int32-bound, so no sentinel can live here).
      sortOrder: existing?.sortOrder ?? 0,
      isPublished: existing?.isPublished ?? true,
      isAvailable: raw.isAvailable,
      isFeatured: raw.isFeatured,
    };
    const result = await this.onSave()({ input, file: this.staged });
    this.saving.set(false);
    if (result === 'ok') {
      this.closed.emit();
      return;
    }
    this.saveError.set(
      result === 'invalid'
        ? 'البيانات مرفوضة من السيرفر. راجع الحقول وحاول تاني.'
        : result === 'stale'
          ? 'الطبق اتعدل من مكان تاني. أغلق النافذة وحدّث الصفحة قبل إعادة المحاولة.'
          : 'فشل الحفظ. جرّب إعادة المحاولة.',
    );
  }

  cancel(): void {
    if (!this.saving()) this.closed.emit();
  }
}
