import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DomSanitizer, Meta, Title } from '@angular/platform-browser';
import { LoadingComponent } from '../shared/loading.component';
import { QUIET_ZONE, qrMatrix, qrPngBlob, qrSvgText } from './qr-code.util';
import { SettingsStateService } from './settings-state.service';

type Feedback = { kind: 'success' | 'error'; text: string } | null;

/**
 * Permanent QR Code Studio (Screen 6 of frontend/design/admin-specs.md):
 * the QR encodes the restaurant's permanent immutable public-code alias
 * (/m/{publicCode}) — it never changes when the name, branding or menu
 * changes. Copy uses the async clipboard with a textarea fallback; PNG is
 * rendered via canvas at 1024x1024 with the standard quiet zone; SVG is the
 * same matrix serialized for print.
 */
@Component({
  selector: 'app-qr-studio',
  imports: [LoadingComponent],
  template: `
    <div class="qr-page">
      <h1 id="qr-title" tabindex="-1">رمز QR الدائم</h1>

      @if (store.isLoading()) {
        <app-loading />
      } @else if (store.error(); as loadError) {
        <app-loading [hasError]="true" [errorMessage]="loadError" (retry)="store.load()" />
      } @else if (permanentUrl(); as url) {
        <p class="explain">
          الرابط ده بيشير لكود عام ثابت للمطعم ومابيتغيرش أبداً — حتى لو الاسم أو الألوان أو المنيو
          اتغيرت، نفس الـ QR المطبوع يفضل شغال.
        </p>

        <div class="qr-grid">
          <div class="qr-card">
            <div class="qr-frame" [innerHTML]="previewSvg()"></div>
            <p class="qr-url" dir="ltr">{{ url }}</p>
          </div>

          <div class="qr-actions">
            <button type="button" class="btn btn-primary" (click)="copyLink()">
              نسخ الرابط الدائم
            </button>
            <button type="button" class="btn btn-secondary" (click)="downloadPng()">
              تحميل PNG عالي الدقة (1024x1024)
            </button>
            <button type="button" class="btn btn-secondary" (click)="downloadSvg()">
              تحميل SVG فيكتور للطباعة
            </button>
            <p class="list-status" aria-live="polite">
              @if (feedback(); as message) {
                <span [class]="message.kind === 'success' ? 'ok' : 'fail'">{{ message.text }}</span>
              }
            </p>
            <div class="print-guide">
              <h2>إرشادات الطباعة</h2>
              <ul>
                <li>اطبع الـ QR بحجم لا يقل عن 2.5×2.5 سم.</li>
                <li>سيب هامش أبيض حوالين الرمز (الملفات جاهزة بالهامش القياسي).</li>
                <li>جرّب مسح الرمز بكاميرا موبايلك قبل الطباعة النهائية.</li>
              </ul>
            </div>
          </div>
        </div>

        <textarea #fallback class="visually-hidden" aria-hidden="true" tabindex="-1"></textarea>
      }
    </div>
  `,
  styles: [
    `
      h1 {
        font-family: var(--font-family-display);
        font-size: var(--font-size-2xl);
        margin: 0 0 var(--space-3);
      }
      .explain {
        color: var(--color-text-muted, #64748b);
        max-width: 60ch;
      }
      .qr-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-6);
        margin-top: var(--space-4);
      }
      @media (min-width: 1024px) {
        .qr-grid {
          grid-template-columns: auto 1fr;
        }
      }
      .qr-card {
        padding: var(--space-4);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 10px);
        background: var(--color-surface-card, #fff);
        text-align: center;
      }
      /* innerHTML content sits outside style encapsulation, so the frame
         caps the width and the SVG itself is fluid (scalable variant). */
      .qr-frame {
        max-width: 240px;
        margin-inline: auto;
      }
      .qr-url {
        margin-top: var(--space-3);
        font-size: var(--font-size-sm);
        word-break: break-all;
      }
      .qr-actions {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        align-items: flex-start;
      }
      .qr-actions .btn {
        min-height: 44px;
      }
      .list-status {
        min-height: 1.5rem;
        font-size: var(--font-size-sm);
        margin: 0;
      }
      .list-status .ok {
        color: var(--color-success, #15803d);
      }
      .list-status .fail {
        color: var(--color-danger, #b3261e);
      }
      .print-guide h2 {
        font-size: var(--font-size-lg);
        margin: var(--space-4) 0 var(--space-2);
      }
      .print-guide ul {
        margin: 0;
        padding-inline-start: var(--space-5);
        color: var(--color-text-muted, #64748b);
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }
    `,
  ],
})
export class QrStudioComponent implements OnInit {
  readonly store = inject(SettingsStateService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly feedback = signal<Feedback>(null);

  readonly permanentUrl = computed(() => {
    const code = this.store.settings()?.publicCode;
    if (!code || typeof location === 'undefined') return null;
    return `${location.origin}/m/${code}`;
  });
  readonly previewSvg = computed(() => {
    const url = this.permanentUrl();
    return url ? this.sanitizer.bypassSecurityTrustHtml(qrSvgText(qrMatrix(url), 8, true)) : null;
  });

  constructor() {
    inject(Title).setTitle('رمز QR الدائم | لوحة التحكم');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex,nofollow' });
  }

  async ngOnInit(): Promise<void> {
    await this.store.load();
  }

  async copyLink(): Promise<void> {
    const url = this.permanentUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.feedback.set({ kind: 'success', text: 'اتنسخ الرابط الدائم.' });
      return;
    } catch {
      /* Async clipboard denied (insecure context, permissions): fall back below. */
    }
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
    if (textarea) {
      textarea.value = url;
      textarea.classList.remove('visually-hidden');
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.classList.add('visually-hidden');
      this.feedback.set(
        copied
          ? { kind: 'success', text: 'اتنسخ الرابط الدائم.' }
          : { kind: 'error', text: 'تعذّر النسخ — انسخ الرابط يدوياً من فوق.' },
      );
    }
  }

  private download(blob: Blob | null, filename: string, failure: string): void {
    if (!blob) {
      this.feedback.set({ kind: 'error', text: failure });
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    this.feedback.set({ kind: 'success', text: 'بدأ التحميل.' });
  }

  async downloadPng(): Promise<void> {
    const url = this.permanentUrl();
    if (!url) return;
    const blob = await qrPngBlob(qrMatrix(url), 1024);
    this.download(blob, 'menu-qr-1024.png', 'تعذّر توليد PNG على هذا الجهاز — جرّب نسخة SVG.');
  }

  downloadSvg(): void {
    const url = this.permanentUrl();
    if (!url) return;
    const blob = new Blob([qrSvgText(qrMatrix(url), 10)], { type: 'image/svg+xml' });
    this.download(blob, 'menu-qr.svg', 'تعذّر توليد SVG.');
  }
}
