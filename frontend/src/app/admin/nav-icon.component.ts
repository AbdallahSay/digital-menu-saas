import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type NavIconName = 'home' | 'folder' | 'dish' | 'palette' | 'qr';

/**
 * Plain inline SVG icons for the admin navigation. They draw with currentColor, need no
 * font (emoji glyphs can render as empty boxes on devices without an emoji font) and are
 * decorative: the visible label next to each icon names the link.
 */
@Component({
  selector: 'app-nav-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      class="nav-svg"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('home') {
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v9.5h13V10" />
          <path d="M10 19.5v-5h4v5" />
        }
        @case ('folder') {
          <path
            d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.8l2 2.2h8.2A1.5 1.5 0 0 1 21 9.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"
          />
        }
        @case ('dish') {
          <path d="M3 15h18" />
          <path d="M5 15a7 7 0 0 1 14 0" />
          <path d="M12 8V6.5" />
          <path d="M4 19h16" />
        }
        @case ('palette') {
          <path
            d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-1.3-1.2-1.4-1.2-2.7 0-1 .8-1.7 1.9-1.7H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.7 16.8 3.5 12 3.5z"
          />
          <circle cx="8" cy="11" r="1" />
          <circle cx="11" cy="7.5" r="1" />
          <circle cx="15.5" cy="8.5" r="1" />
        }
        @case ('qr') {
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <path d="M14 14h2.5v2.5H14zM18 18h2M20 14v2" />
        }
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        line-height: 0;
      }
    `,
  ],
})
export class NavIconComponent {
  readonly name = input.required<NavIconName>();
}
