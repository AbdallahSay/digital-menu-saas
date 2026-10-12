import { Component, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="not-found-main" role="main">
      <div class="not-found-card">
        <div class="illustration-wrapper" aria-hidden="true">
          <svg viewBox="0 0 240 180" width="240" height="180" fill="none" class="illustration-svg">
            <ellipse cx="120" cy="155" rx="90" ry="15" fill="#e2e8f0" />
            <!-- Plate / Base -->
            <ellipse
              cx="120"
              cy="140"
              rx="80"
              ry="24"
              fill="#ffffff"
              stroke="#cbd5e1"
              stroke-width="3"
            />
            <ellipse
              cx="120"
              cy="136"
              rx="65"
              ry="18"
              fill="#f8fafc"
              stroke="#e2e8f0"
              stroke-width="2"
            />
            <!-- Acrylic Table Stand with Broken / Missing QR -->
            <rect
              x="85"
              y="45"
              width="70"
              height="90"
              rx="8"
              fill="#ffffff"
              stroke="#0f766e"
              stroke-width="3"
            />
            <path d="M85 55 h70" stroke="#ccfbf1" stroke-width="8" />
            <!-- Magnifying Glass with Question Mark -->
            <circle cx="120" cy="85" r="22" fill="#ccfbf1" stroke="#0f766e" stroke-width="3" />
            <path d="M136 101 l15 15" stroke="#0f766e" stroke-width="4" stroke-linecap="round" />
            <!-- Question mark in Arabic -->
            <text
              x="120"
              y="93"
              font-size="24"
              font-weight="bold"
              fill="#0f766e"
              text-anchor="middle"
              font-family="sans-serif"
            >
              ؟
            </text>
            <!-- 404 Badge -->
            <rect x="96" y="22" width="48" height="20" rx="10" fill="#d97706" />
            <text
              x="120"
              y="36"
              font-size="12"
              font-weight="bold"
              fill="#ffffff"
              text-anchor="middle"
              font-family="monospace"
            >
              404
            </text>
          </svg>
        </div>

        <h1 class="not-found-title">الصفحة غير موجودة</h1>
        <p class="not-found-desc">
          عذراً، الرابط الذي تحاول الوصول إليه غير موجود أو ربما تم نقله. يمكنك العودة للصفحة
          الرئيسية أو استعراض القائمة التجريبية للمنصة.
        </p>

        <div class="actions-group">
          <a routerLink="/" class="btn btn-primary"> العودة للصفحة الرئيسية </a>
          <a routerLink="/r/demo" class="btn btn-secondary"> تصفح منيو تجريبي </a>
          <a href="/#request" class="btn btn-accent"> طلب خدمة لمطعمك </a>
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      .not-found-main {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-6) var(--space-4);
        background:
          radial-gradient(circle at 50% 20%, rgb(15 118 110 / 0.06), transparent 70%),
          var(--color-bg-canvas);
      }
      .not-found-card {
        max-width: 540px;
        width: 100%;
        background: var(--color-surface-card);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-2xl);
        padding: var(--space-8) var(--space-6);
        text-align: center;
        box-shadow: var(--shadow-lg);
      }
      .illustration-wrapper {
        margin-bottom: var(--space-4);
      }
      .illustration-svg {
        max-width: 100%;
        height: auto;
      }
      .not-found-title {
        font-size: var(--font-size-3xl);
        font-weight: var(--font-weight-extrabold);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-3);
      }
      .not-found-desc {
        font-size: var(--font-size-base);
        color: var(--color-text-secondary);
        line-height: var(--line-height-relaxed);
        margin: 0 0 var(--space-8);
      }
      .actions-group {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      @media (min-width: 640px) {
        .actions-group {
          flex-direction: row;
          justify-content: center;
          flex-wrap: wrap;
        }
      }
    `,
  ],
})
export class NotFound {
  constructor() {
    inject(Title).setTitle('الصفحة غير موجودة | القائمة الرقمية');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }
}
