import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { AccessibleDialogComponent } from '../shared/accessible-dialog.component';
import { CategoryDto, CategoryInput, SaveResult } from './catalog.models';

export interface CategoryModalResult {
  input: CategoryInput;
  rowVersion: string | null;
}

/** Validates the trimmed value, matching backend normalization (F06). */
function trimmedLength(min: number, max: number) {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const length = (control.value ?? '').trim().length;
    return length >= min && length <= max ? null : { trimmedLength: { min, max, actual: length } };
  };
}

/** The backend binds an int32: fractional input is rejected, never truncated. */
function integer(control: AbstractControl<number>): ValidationErrors | null {
  return Number.isInteger(control.value) ? null : { integer: true };
}

/**
 * Create/edit category dialog. Accessibility (initial focus, Tab trap,
 * Escape, dismissal locking, focus restoration) comes from
 * AccessibleDialogComponent. The dialog owns its save lifecycle: it calls
 * the parent's onSave, stays open with the draft and an inline error on
 * any failure, locks dismissal while a save is in flight, and only closes
 * on a confirmed save or an explicit cancel.
 */
@Component({
  selector: 'app-category-modal',
  imports: [ReactiveFormsModule, AccessibleDialogComponent],
  template: `
    <app-accessible-dialog
      labelledBy="category-modal-title"
      [returnFocusTo]="returnFocusTo()"
      [lockDismissal]="saving()"
      (dismissed)="cancel()"
    >
      <h2 id="category-modal-title">{{ category() ? 'تعديل القسم' : 'إضافة قسم جديد' }}</h2>

      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <!-- Fields lock while saving: a value typed mid-flight must never be
             silently replaced by the earlier save's success path. -->
        <fieldset class="form-fields" [disabled]="saving()">
          <div class="form-group">
            <label class="form-label" for="category-name-ar">اسم القسم بالعربية *</label>
            <input
              id="category-name-ar"
              class="form-input"
              type="text"
              formControlName="nameAr"
              maxlength="120"
              required
            />
            @if (invalid('nameAr')) {
              <p class="field-error" role="alert">اسم القسم بالعربية مطلوب (من 2 إلى 120 حرفاً)</p>
            }
          </div>

          <div class="form-group">
            <label class="form-label" for="category-name-en">اسم القسم بالإنجليزية (اختياري)</label>
            <input
              id="category-name-en"
              class="form-input"
              type="text"
              formControlName="nameEn"
              maxlength="120"
              dir="ltr"
            />
            @if (invalid('nameEn')) {
              <p class="field-error" role="alert">اسم القسم بالإنجليزية يجب ألا يتجاوز 120 حرفاً</p>
            }
          </div>

          <div class="form-group">
            <label class="form-label" for="category-sort-order">الترتيب</label>
            <input
              id="category-sort-order"
              class="form-input"
              type="number"
              formControlName="sortOrder"
              min="0"
              step="1"
              inputmode="numeric"
              required
            />
            @if (invalid('sortOrder')) {
              <p class="field-error" role="alert">
                الترتيب يجب أن يكون رقماً صحيحاً موجباً أو صفراً
              </p>
            }
          </div>

          <div class="form-group form-check">
            <input id="category-published" type="checkbox" formControlName="isPublished" />
            <label for="category-published">منشور في المنيو</label>
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
export class CategoryModalComponent implements OnInit {
  /** Existing category for edit mode; null for create mode. */
  readonly category = input<CategoryDto | null>(null);
  /** Element focus returns to on close. */
  readonly returnFocusTo = input<HTMLElement | null>(null);
  /** Performs the mutation; the dialog stays open on any non-'ok' result. */
  readonly onSave = input.required<(result: CategoryModalResult) => Promise<SaveResult>>();
  readonly closed = output<void>();

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    nameAr: ['', [trimmedLength(2, 120)]],
    nameEn: ['', [trimmedLength(0, 120)]],
    sortOrder: [0, [Validators.required, Validators.min(0), Validators.max(2147483647), integer]],
    isPublished: [true],
  });

  ngOnInit(): void {
    const existing = this.category();
    if (existing) {
      this.form.setValue({
        nameAr: existing.nameAr,
        nameEn: existing.nameEn ?? '',
        sortOrder: existing.sortOrder,
        isPublished: existing.isPublished,
      });
    }
  }

  invalid(control: 'nameAr' | 'nameEn' | 'sortOrder'): boolean {
    const field = this.form.controls[control];
    return field.touched && field.invalid;
  }

  cancel(): void {
    if (this.saving()) return; // dismissal is locked during a mutation
    this.closed.emit();
  }

  async save(): Promise<void> {
    if (this.saving()) return; // duplicate-submission guard
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const outcome = await this.onSave()({
        input: {
          nameAr: value.nameAr.trim(),
          nameEn: value.nameEn.trim() === '' ? null : value.nameEn.trim(),
          sortOrder: value.sortOrder, // validated integer; never truncated
          isPublished: value.isPublished,
        },
        rowVersion: this.category()?.rowVersion ?? null,
      });
      if (outcome === 'ok') {
        this.closed.emit(); // the parent destroys the dialog; focus is restored on destroy
        return;
      }
      // Failure keeps the draft and field values so nothing is lost.
      this.saveError.set(
        outcome === 'stale'
          ? 'البيانات اتغيرت من مكان تاني واتحدثت القايمة. راجع القيم واحفظ تاني.'
          : outcome === 'invalid'
            ? 'البيانات المدخلة غير صحيحة. راجع الحقول.'
            : 'حصل خطأ أثناء الحفظ. بياناتك زي ما هي — جرّب تاني.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
