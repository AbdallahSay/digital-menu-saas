import { Component, inject, signal } from '@angular/core';
import {
  Router,
  RouterOutlet,
  NavigationStart,
  NavigationEnd,
  NavigationCancel,
  NavigationError,
} from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    @if (isNavigating()) {
      <div
        class="route-progress-bar"
        role="progressbar"
        aria-label="جاري التحميل..."
        aria-valuemin="0"
        aria-valuemax="100"
      ></div>
    }
    <router-outlet />
  `,
  styles: [
    `
      .route-progress-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(
          90deg,
          var(--color-brand-primary),
          var(--color-brand-accent),
          var(--color-brand-primary)
        );
        background-size: 200% 100%;
        z-index: 9999;
        animation: progress-slide 1.2s infinite ease-in-out;
      }
      @keyframes progress-slide {
        0% {
          background-position: 100% 0;
        }
        100% {
          background-position: -100% 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .route-progress-bar {
          animation: none;
          background: var(--color-brand-primary);
        }
      }
    `,
  ],
})
export class App {
  private readonly router = inject(Router);
  readonly isNavigating = signal(false);

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.isNavigating.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.isNavigating.set(false);
      }
    });
  }
}
