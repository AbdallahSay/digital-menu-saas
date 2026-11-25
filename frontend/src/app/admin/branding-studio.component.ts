import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { LoadingComponent } from '../shared/loading.component';
import { evaluateContrast, normalizeHexColor } from './contrast';
import { SettingsStateService } from './settings-state.service';

type Feedback = { kind: 'success' | 'error'; text: string } | null;

/** Preset swatches from the design contract (Screen 5). */
const PRESETS: { hex: string; label: string }[] = [
  { hex: '#d97706', label: 'ذهبي عنبري' },
  { hex: '#059669', label: 'أخضر زمردي' },
  { hex: '#dc2626', label: 'قرمزي' },
  { hex: '#2563eb', label: 'أزرق ملكي' },
  { hex: '#4f46e5', label: 'نيلي غامق' },
  { hex: '#334155', label: 'فحمي' },
];

/**
 * Restaurant Branding & Contrast Studio (Screen 5 of
 * frontend/design/admin-specs.md): preset/custom brand color with a live
 * WCAG 2.1/2.2 contrast evaluation against the white menu background, and a
 * strictly display-only menu card preview (no ordering/cart/payment
 * language). The logo uploader posts to the media delivery backend and the
 * stored logo shows in the preview card.
 */
@Component({
  selector: 'app-branding-studio',
  imports: [LoadingComponent],
  template: `
    <div class="branding-page">
      <h1 id="branding-title" tabindex="-1">الهوية والألوان</h1>

      @if (store.isLoading()) {
        <app-loading />
      } @else if (store.error(); as loadError) {
        <app-loading [hasError]="true" [errorMessage]="loadError" (retry)="load()" />
      } @else if (store.settings(); as settings) {
        <p class="list-status" aria-live="polite">
          @if (feedback(); as message) {
            <span [class]="message.kind === 'success' ? 'ok' : 'fail'">{{ message.text }}</span>
          }
        </p>

        <div class="studio-grid">
          <section class="controls" aria-labelledby="controls-title">
            <h2 id="controls-title">لون البراند</h2>

            <div class="swatches" role="group" aria-label="ألوان جاهزة">
              @for (preset of presets; track preset.hex) {
                <button
                  type="button"
                  class="swatch"
                  [class.active]="normalizedDraft() === preset.hex"
                  [style.background-color]="preset.hex"
                  [attr.aria-label]="preset.label + ' ' + preset.hex"
                  [attr.aria-pressed]="normalizedDraft() === preset.hex"
                  (click)="pick(preset.hex)"
                ></button>
              }
            </div>

            <div class="custom-color">
              <label class="form-label" for="brand-hex">لون مخصص (HEX)</label>
              <div class="hex-row">
                <input
                  id="brand-hex"
                  class="form-input hex-input"
                  type="text"
                  [value]="draft()"
                  (input)="onHexInput($event)"
                  maxlength="7"
                  dir="ltr"
                  placeholder="#0f766e"
                />
                <input
                  class="color-picker"
                  type="color"
                  [value]="pickerColor()"
                  (input)="onPickerInput($event)"
                  aria-label="منتقي اللون"
                />
              </div>
              @if (draftInvalid()) {
                <p class="field-error" role="alert">
                  صيغة اللون غير صحيحة — استخدم #rgb أو #rrggbb
                </p>
              }
            </div>

            @if (report(); as result) {
              <div class="contrast-panel" aria-labelledby="contrast-title">
                <h3 id="contrast-title">تباين اللون على خلفية المنيو البيضاء</h3>
                <p class="ratio" dir="ltr">{{ result.ratio.toFixed(2) }}:1</p>
                <ul class="badges">
                  <li
                    [class.pass]="result.normalText !== 'fail'"
                    [class.fail]="result.normalText === 'fail'"
                  >
                    نص عادي: {{ levelLabel(result.normalText) }}
                  </li>
                  <li
                    [class.pass]="result.largeText !== 'fail'"
                    [class.fail]="result.largeText === 'fail'"
                  >
                    نص كبير: {{ levelLabel(result.largeText) }}
                  </li>
                  <li
                    [class.pass]="result.graphics === 'AA'"
                    [class.fail]="result.graphics === 'fail'"
                  >
                    عناصر رسومية: {{ result.graphics === 'AA' ? 'AA ✓' : 'غير مطابق ✗' }}
                  </li>
                </ul>
              </div>
            }

            <button
              type="button"
              class="btn btn-primary save-btn"
              [disabled]="
                saving() ||
                store.mutationBusy() ||
                draftInvalid() ||
                normalizedDraft() === savedColor()
              "
              (click)="save()"
            >
              {{ saving() ? 'جاري الحفظ…' : 'حفظ اللون' }}
            </button>

            <h2 class="logo-title">لوجو المطعم</h2>
            <div class="logo-row">
              @if (settings.hasLogo) {
                <img
                  class="logo-preview"
                  [src]="logoSrc()"
                  alt="اللوجو الحالي"
                  width="96"
                  height="96"
                />
              } @else {
                <span class="logo-placeholder" aria-hidden="true">🍽️</span>
              }
              <div class="logo-actions">
                <label class="btn btn-secondary" for="brand-logo">
                  {{ settings.hasLogo ? 'تغيير اللوجو' : 'رفع لوجو' }}
                </label>
                <input
                  id="brand-logo"
                  class="visually-hidden"
                  type="file"
                  accept="image/*"
                  [disabled]="logoBusy() || store.mutationBusy()"
                  (change)="stageLogo($event)"
                />
                @if (settings.hasLogo) {
                  <button
                    type="button"
                    class="btn btn-secondary"
                    [disabled]="logoBusy() || store.mutationBusy()"
                    (click)="removeLogo()"
                  >
                    حذف اللوجو
                  </button>
                }
              </div>
            </div>
            <p class="hint">حد أقصى 5 ميجابايت؛ بتتحول لـ webp على السيرفر.</p>

            <h2 class="logo-title">شكل صفحة المنيو</h2>
            <div class="pres-form">
              <label for="pres-theme">القالب</label>
              <select
                id="pres-theme"
                [value]="presTheme() ?? settings.theme ?? 'classic'"
                (change)="presTheme.set($any($event.target).value)"
              >
                <option value="classic">مطعم (كلاسيك)</option>
                <option value="cafe">كافيه</option>
              </select>
              <label for="pres-brand">اسم البراند فوق الاسم (حتى 40 حرف)</label>
              <input
                id="pres-brand"
                type="text"
                maxlength="40"
                [value]="presBrand() ?? settings.brandLabel ?? ''"
                (input)="presBrand.set($any($event.target).value)"
              />
              <label for="pres-tag-ar">الوصف القصير بالعربي (حتى 120 حرف)</label>
              <input
                id="pres-tag-ar"
                type="text"
                maxlength="120"
                [value]="presTagAr() ?? settings.taglineAr ?? ''"
                (input)="presTagAr.set($any($event.target).value)"
              />
              <label for="pres-tag-en">الوصف القصير بالإنجليزي (حتى 120 حرف)</label>
              <input
                id="pres-tag-en"
                type="text"
                dir="ltr"
                maxlength="120"
                [value]="presTagEn() ?? settings.taglineEn ?? ''"
                (input)="presTagEn.set($any($event.target).value)"
              />
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="saving() || store.mutationBusy() || !presDirty()"
                (click)="savePresentation()"
              >
                حفظ شكل الصفحة
              </button>
            </div>

            <h2 class="logo-title">صورة الهيدر</h2>
            <div class="logo-row">
              @if (settings.hasHero) {
                <img
                  class="logo-preview"
                  [src]="settings.heroUrl + '?v=' + logoVersion()"
                  alt="صورة الهيدر الحالية"
                  width="96"
                  height="96"
                />
              } @else {
                <span class="logo-placeholder" aria-hidden="true">🖼️</span>
              }
              <div class="logo-actions">
                <label class="btn btn-secondary" for="brand-hero">
                  {{ settings.hasHero ? 'تغيير صورة الهيدر' : 'رفع صورة الهيدر' }}
                </label>
                <input
                  id="brand-hero"
                  class="visually-hidden"
                  type="file"
                  accept="image/*"
                  [disabled]="logoBusy() || store.mutationBusy()"
                  (change)="stageHero($event)"
                />
                @if (settings.hasHero) {
                  <button
                    type="button"
                    class="btn btn-secondary"
                    [disabled]="logoBusy() || store.mutationBusy()"
                    (click)="removeHero()"
                  >
                    حذف صورة الهيدر
                  </button>
                }
              </div>
            </div>
            <p class="hint">لو مفيش صورة هيدر، بنستخدم اللوجو.</p>
          </section>

          <section class="preview" aria-labelledby="preview-title">
            <h2 id="preview-title">معاينة كارت المنيو (عرض فقط)</h2>
            <div class="menu-card">
              <div class="menu-card-header" [style.background-color]="previewColor()">
                @if (settings.hasLogo) {
                  <img class="menu-card-logo-img" [src]="logoSrc()" alt="" width="40" height="40" />
                } @else {
                  <span class="menu-card-logo" aria-hidden="true">🍽️</span>
                }
                <span class="menu-card-name">{{ settings.name }}</span>
              </div>
              <div class="menu-card-body">
                <div class="dish-row">
                  <div>
                    <p class="dish-name">طبق تجريبي</p>
                    <p class="dish-price"><span dir="ltr">185.00</span> ج.م</p>
                  </div>
                  <span
                    class="dish-badge"
                    [style.border-color]="previewColor()"
                    [style.color]="previewColor()"
                  >
                    متوفر
                  </span>
                </div>
                <button type="button" class="btn btn-secondary details-btn" disabled>
                  عرض التفاصيل
                </button>
              </div>
            </div>
          </section>
        </div>
      }
    </div>
  `,
  styles: [
    `
      h1 {
        font-family: var(--font-family-display);
        font-size: var(--font-size-2xl);
        margin: 0 0 var(--space-4);
      }
      h2 {
        font-size: var(--font-size-lg);
        margin: 0 0 var(--space-3);
      }
      h3 {
        font-size: var(--font-size-base);
        margin: 0 0 var(--space-2);
      }
      .list-status {
        min-height: 1.5rem;
        font-size: var(--font-size-sm);
      }
      .list-status .ok {
        color: var(--color-success, #15803d);
      }
      .list-status .fail {
        color: var(--color-danger, #b3261e);
      }
      .studio-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-6);
      }
      @media (min-width: 768px) {
        .studio-grid {
          grid-template-columns: 1fr 1fr;
        }
      }
      .swatches {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-bottom: var(--space-4);
      }
      .swatch {
        width: 48px;
        height: 48px;
        border-radius: var(--radius-sm, 6px);
        border: 2px solid transparent;
        cursor: pointer;
      }
      .swatch.active {
        border-color: var(--color-text, #0f172a);
        outline: 2px solid var(--color-surface, #fff);
      }
      .hex-row {
        display: flex;
        gap: var(--space-2);
        align-items: center;
      }
      .hex-input {
        max-width: 140px;
      }
      .color-picker {
        width: 48px;
        height: 48px;
        padding: 0;
        border: 1px solid var(--color-border, #cbd5e1);
        border-radius: var(--radius-sm, 6px);
        background: none;
        cursor: pointer;
      }
      .field-error {
        color: var(--color-danger, #b3261e);
        font-size: var(--font-size-xs);
      }
      .contrast-panel {
        margin-top: var(--space-4);
        padding: var(--space-3);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 10px);
      }
      .ratio {
        font-size: var(--font-size-xl);
        font-weight: 700;
        margin: 0 0 var(--space-2);
      }
      .badges {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }
      .badges .pass {
        color: var(--color-success, #15803d);
      }
      .badges .fail {
        color: var(--color-danger, #b3261e);
      }
      .save-btn {
        margin-top: var(--space-4);
        min-height: 44px;
      }
      .pres-form {
        display: grid;
        gap: 8px;
      }
      .pres-form input,
      .pres-form select {
        min-height: 44px;
        padding: 0 12px;
        border: 1px solid var(--color-border-subtle);
        border-radius: 10px;
        font: inherit;
      }
      .logo-title {
        margin-top: var(--space-6);
      }
      .logo-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .logo-preview {
        width: 96px;
        height: 96px;
        object-fit: cover;
        border-radius: var(--radius-md, 10px);
        border: 1px solid var(--color-border, #e2e8f0);
        background: #fff;
      }
      .logo-placeholder {
        font-size: 2.5rem;
        line-height: 1;
      }
      .logo-actions {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        align-items: flex-start;
      }
      .menu-card-logo-img {
        width: 40px;
        height: 40px;
        object-fit: cover;
        border-radius: var(--radius-sm, 6px);
        background: #fff;
      }
      .menu-card {
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 10px);
        overflow: hidden;
        background: var(--color-surface-card, #fff);
      }
      .menu-card-header {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-4);
        color: #fff;
      }
      .menu-card-logo {
        font-size: 1.5rem;
      }
      .menu-card-name {
        font-weight: 700;
        font-size: var(--font-size-lg);
      }
      .menu-card-body {
        padding: var(--space-4);
      }
      .dish-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-3);
      }
      .dish-name {
        font-weight: 600;
        margin: 0;
      }
      .dish-price {
        margin: 0;
        color: var(--color-text-muted, #64748b);
      }
      .dish-badge {
        border: 1px solid;
        border-radius: 999px;
        padding: 2px 12px;
        font-size: var(--font-size-sm);
        background: #fff;
      }
      .details-btn {
        min-height: 44px;
      }
      .hint {
        margin-top: var(--space-3);
        font-size: var(--font-size-xs);
        color: var(--color-text-muted, #64748b);
      }
    `,
  ],
})
export class BrandingStudioComponent implements OnInit {
  readonly store = inject(SettingsStateService);
  readonly presets = PRESETS;
  readonly draft = signal('');
  readonly saving = signal(false);
  readonly logoBusy = signal(false);
  readonly feedback = signal<Feedback>(null);
  /** Cache-buster: the admin logo URL is stable, so bump after every change. */
  readonly logoVersion = signal(0);
  readonly presTheme = signal<string | null>(null);
  readonly presBrand = signal<string | null>(null);
  readonly presTagAr = signal<string | null>(null);
  readonly presTagEn = signal<string | null>(null);
  readonly presDirty = computed(
    () =>
      this.presTheme() !== null ||
      this.presBrand() !== null ||
      this.presTagAr() !== null ||
      this.presTagEn() !== null,
  );
  readonly logoSrc = computed(() => {
    const url = this.store.settings()?.logoUrl;
    return url ? `${url}?v=${this.logoVersion()}` : null;
  });

  /** The accepted draft normalized once to #rrggbb; null while empty/invalid. */
  readonly normalizedDraft = computed(() => normalizeHexColor(this.draft()));
  readonly draftInvalid = computed(() => this.normalizedDraft() === null);
  /** Effective color: the normalized draft when valid, else the saved color. */
  readonly previewColor = computed(
    () =>
      this.normalizedDraft() ??
      normalizeHexColor(this.store.settings()?.primaryColor ?? '') ??
      '#0f766e',
  );
  readonly pickerColor = this.previewColor;
  readonly report = computed(() => evaluateContrast(this.previewColor()));
  /** Saved color normalized for same-color comparisons (any casing). */
  readonly savedColor = computed(() =>
    normalizeHexColor(this.store.settings()?.primaryColor ?? ''),
  );

  constructor() {
    inject(Title).setTitle('الهوية والألوان | لوحة التحكم');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  /** Single load path for init AND retry: a successful fetch seeds the draft. */
  async load(): Promise<void> {
    await this.store.load();
    const saved = this.store.settings();
    if (saved) this.draft.set(saved.primaryColor);
  }

  pick(hex: string): void {
    this.draft.set(hex);
    this.feedback.set(null);
  }

  onHexInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value.trim());
    this.feedback.set(null);
  }

  onPickerInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
    this.feedback.set(null);
  }

  levelLabel(level: string): string {
    switch (level) {
      case 'AAA':
        return 'AAA ✓';
      case 'AA':
        return 'AA ✓';
      case 'AA-large':
        return 'AA (نص كبير فقط)';
      default:
        return 'غير مطابق ✗';
    }
  }

  /** Uploads the chosen logo, then bumps the cache-buster so the stable URL revalidates. */
  async stageLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.logoBusy() || this.store.mutationBusy()) return;
    this.logoBusy.set(true);
    this.feedback.set(null);
    try {
      const outcome = await this.store.uploadLogo(file);
      if (outcome === 'ok') {
        this.logoVersion.update((v) => v + 1);
        this.feedback.set({ kind: 'success', text: 'تم حفظ اللوجو.' });
      } else if (outcome === 'too-large') {
        this.feedback.set({ kind: 'error', text: 'الصورة أكبر من 5 ميجابايت. اختار صورة أصغر.' });
      } else if (outcome === 'unsupported') {
        this.feedback.set({ kind: 'error', text: 'صيغة الصورة غير مدعومة.' });
      } else {
        this.feedback.set({ kind: 'error', text: 'حصل خطأ أثناء رفع اللوجو. جرّب تاني.' });
      }
    } finally {
      this.logoBusy.set(false);
    }
  }

  async savePresentation(): Promise<void> {
    const s = this.store.settings();
    if (!s || this.saving() || this.store.mutationBusy()) return;
    this.saving.set(true);
    this.feedback.set(null);
    try {
      const outcome = await this.store.savePresentation({
        theme: (this.presTheme() ?? s.theme ?? 'classic') as 'classic' | 'cafe',
        brandLabel: this.presBrand() ?? s.brandLabel ?? '',
        taglineAr: this.presTagAr() ?? s.taglineAr ?? '',
        taglineEn: this.presTagEn() ?? s.taglineEn ?? '',
      });
      if (outcome === 'ok') {
        this.presTheme.set(null);
        this.presBrand.set(null);
        this.presTagAr.set(null);
        this.presTagEn.set(null);
        this.feedback.set({ kind: 'success', text: 'تم حفظ شكل الصفحة.' });
      } else if (outcome === 'stale') {
        this.feedback.set({ kind: 'error', text: 'الإعدادات اتغيرت من مكان تاني. جاري تحديثها.' });
        await this.load();
      } else if (outcome === 'invalid') {
        this.feedback.set({ kind: 'error', text: 'القيم مرفوضة من السيرفر. راجع الأطوال.' });
      } else {
        this.feedback.set({ kind: 'error', text: 'حصل خطأ أثناء الحفظ. جرّب تاني.' });
      }
    } finally {
      this.saving.set(false);
    }
  }

  async stageHero(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.logoBusy() || this.store.mutationBusy()) return;
    this.logoBusy.set(true);
    this.feedback.set(null);
    try {
      const outcome = await this.store.uploadHero(file);
      if (outcome === 'ok') {
        this.logoVersion.update((v) => v + 1);
        this.feedback.set({ kind: 'success', text: 'تم حفظ صورة الهيدر.' });
      } else if (outcome === 'too-large') {
        this.feedback.set({ kind: 'error', text: 'الصورة أكبر من 5 ميجابايت. اختار صورة أصغر.' });
      } else if (outcome === 'unsupported') {
        this.feedback.set({ kind: 'error', text: 'صيغة الصورة غير مدعومة.' });
      } else {
        this.feedback.set({ kind: 'error', text: 'حصل خطأ أثناء رفع الصورة. جرّب تاني.' });
      }
    } finally {
      this.logoBusy.set(false);
    }
  }

  async removeHero(): Promise<void> {
    if (this.logoBusy() || this.store.mutationBusy()) return;
    this.logoBusy.set(true);
    this.feedback.set(null);
    try {
      const outcome = await this.store.deleteHero();
      if (outcome === 'ok') {
        this.logoVersion.update((v) => v + 1);
        this.feedback.set({ kind: 'success', text: 'تم حذف صورة الهيدر.' });
      } else {
        this.feedback.set({ kind: 'error', text: 'حصل خطأ أثناء حذف الصورة. جرّب تاني.' });
      }
    } finally {
      this.logoBusy.set(false);
    }
  }

  async removeLogo(): Promise<void> {
    if (this.logoBusy() || this.store.mutationBusy()) return;
    this.logoBusy.set(true);
    this.feedback.set(null);
    try {
      const outcome = await this.store.deleteLogo();
      if (outcome === 'ok') {
        this.logoVersion.update((v) => v + 1);
        this.feedback.set({ kind: 'success', text: 'تم حذف اللوجو.' });
      } else {
        this.feedback.set({ kind: 'error', text: 'حصل خطأ أثناء حذف اللوجو. جرّب تاني.' });
      }
    } finally {
      this.logoBusy.set(false);
    }
  }

  async save(): Promise<void> {
    const settings = this.store.settings();
    if (!settings || this.draftInvalid() || this.saving() || this.store.mutationBusy()) return; // draftInvalid covers empty.
    this.saving.set(true);
    this.feedback.set(null);
    const color = this.normalizedDraft();
    if (!color) return;
    try {
      const outcome = await this.store.saveColor(color, settings.rowVersion);
      if (outcome === 'ok') {
        this.feedback.set({ kind: 'success', text: 'تم حفظ لون البراند.' });
      } else if (outcome === 'stale') {
        this.feedback.set({ kind: 'error', text: 'الإعدادات اتغيرت من مكان تاني. جاري تحديثها.' });
        await this.load();
      } else if (outcome === 'invalid') {
        this.feedback.set({ kind: 'error', text: 'صيغة اللون مرفوضة من السيرفر. راجع القيمة.' });
      } else {
        this.feedback.set({ kind: 'error', text: 'حصل خطأ أثناء الحفظ. جرّب تاني.' });
      }
    } finally {
      this.saving.set(false);
    }
  }
}
