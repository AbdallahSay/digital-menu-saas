import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-loading',
  standalone: true,
  template: `
    <div class="loading-container" [class.compact]="compact()">
      @if (hasError()) {
        <div class="error-state" role="alert">
          <div class="error-icon" aria-hidden="true">⚠️</div>
          <p class="error-message">{{ errorMessage() }}</p>
          @if (retryable()) {
            <button type="button" class="btn btn-secondary btn-retry" (click)="retry.emit()">
              إعادة المحاولة
            </button>
          }
        </div>
      } @else {
        <div class="loading-state" role="status" aria-live="polite">
          <div class="spinner-wrapper" aria-hidden="true">
            <div class="spinner-ring"></div>
            <div class="spinner-logo">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                <path d="M7 2v20" />
                <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
              </svg>
            </div>
          </div>
          <span class="loading-text">{{ message() }}</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .loading-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 160px;
        padding: var(--space-6);
        width: 100%;
      }
      .loading-container.compact {
        min-height: 80px;
        padding: var(--space-2);
      }
      .loading-state,
      .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--space-3);
      }
      .spinner-wrapper {
        position: relative;
        width: 56px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .spinner-ring {
        position: absolute;
        inset: 0;
        border: 3px solid var(--color-brand-primary-container);
        border-top-color: var(--color-brand-primary);
        border-radius: 50%;
        animation: spin 0.9s cubic-bezier(0.55, 0.15, 0.45, 0.85) infinite;
      }
      .spinner-logo {
        color: var(--color-brand-primary);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .loading-text {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        font-weight: var(--font-weight-medium);
      }
      .error-icon {
        font-size: 2rem;
      }
      .error-message {
        font-size: var(--font-size-sm);
        color: var(--color-semantic-danger);
        margin: 0;
      }
      .btn-retry {
        font-size: var(--font-size-sm);
        padding: 0.375rem 1rem;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .spinner-ring {
          animation: none;
          border-top-color: var(--color-brand-primary);
        }
      }
    `,
  ],
})
export class LoadingComponent {
  readonly message = input<string>('جاري التحميل...');
  readonly hasError = input<boolean>(false);
  readonly errorMessage = input<string>('تعذر تحميل البيانات، يرجى إعادة المحاولة.');
  readonly retryable = input<boolean>(true);
  readonly compact = input<boolean>(false);
  readonly retry = output<void>();
}
