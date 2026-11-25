import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * Module-level modal stack. Only the topmost dialog traps focus, and a
 * closing dialog restores focus to the background only when no other
 * dialog is active — so a confirmation→conflict (or retry) handoff never
 * leaks focus behind the modal flow.
 */
const dialogStack: AccessibleDialogComponent[] = [];

/**
 * The one accessible modal dialog implementation for the admin area. Every
 * dialog (forms, confirmations, conflict notices) renders through this
 * component so the accessibility invariants live in exactly one place:
 * - focus moves into the dialog on open (the [data-autofocus] element, else
 *   the first focusable control, else the card itself),
 * - Tab and Shift+Tab cycle inside the dialog; the background is
 *   unreachable by keyboard while it is open,
 * - Escape and backdrop clicks dismiss — except while lockDismissal is set
 *   (a mutation in flight), so a late response can never close a dialog
 *   the user has moved on from,
 * - when the dialog leaves the DOM, focus returns to the invoking element
 *   or, when that element is gone (its row was deleted), to the page's
 *   first heading as a stable fallback.
 */
@Component({
  selector: 'app-accessible-dialog',
  template: `
    <div class="dialog-backdrop" aria-hidden="true" (click)="onBackdrop()"></div>
    <div
      class="dialog-card"
      [attr.role]="role()"
      aria-modal="true"
      [attr.aria-labelledby]="labelledBy()"
      tabindex="-1"
      (keydown)="onKeydown($event)"
    >
      <ng-content />
    </div>
  `,
  styles: [
    `
      .dialog-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(11, 19, 41, 0.55);
        z-index: 40;
      }
      .dialog-card {
        position: fixed;
        z-index: 41;
        inset-inline: 4vw;
        bottom: 0;
        max-height: 92vh;
        max-height: 92dvh;
        overflow-y: auto;
        background: var(--color-surface-card);
        border-radius: var(--radius-xl) var(--radius-xl) 0 0;
        padding: var(--space-6);
        outline: none;
      }
      @media (min-width: 768px) {
        .dialog-card {
          inset-inline: auto;
          bottom: auto;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 100%;
          max-width: 480px;
          border-radius: var(--radius-xl);
        }
      }
    `,
  ],
})
export class AccessibleDialogComponent implements AfterViewInit, OnDestroy {
  /** Id of the element that titles the dialog. */
  readonly labelledBy = input.required<string>();
  readonly role = input<'dialog' | 'alertdialog'>('dialog');
  /** Element focus returns to on close; falls back to the page heading. */
  readonly returnFocusTo = input<HTMLElement | null>(null);
  /** While true (mutation in flight) Escape and backdrop do not dismiss. */
  readonly lockDismissal = input(false);
  readonly dismissed = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  ngAfterViewInit(): void {
    if (typeof document === 'undefined') return;
    dialogStack.push(this);
    document.addEventListener('focusin', this.containFocus, true);
    const root = this.host.nativeElement;
    const target =
      root.querySelector<HTMLElement>('[data-autofocus]') ??
      this.focusables()[0] ??
      root.querySelector<HTMLElement>('.dialog-card');
    target?.focus();
  }

  ngOnDestroy(): void {
    if (typeof document === 'undefined') return;
    const index = dialogStack.indexOf(this);
    if (index >= 0) dialogStack.splice(index, 1);
    document.removeEventListener('focusin', this.containFocus, true);
    const trigger = this.returnFocusTo();
    // Restore on a microtask: Angular detaches the dialog's DOM after
    // ngOnDestroy, and browsers move focus to <body> when the focused node
    // is removed — restoring after teardown makes the move stick. The
    // restoration is skipped while another dialog is active, so a dialog
    // being replaced (409 conflict notice, retry) never yanks focus out of
    // its successor; the original trigger gets focus back only when the
    // whole modal flow has ended.
    queueMicrotask(() => {
      if (dialogStack.length > 0) return;
      if (trigger?.isConnected) {
        trigger.focus();
        return;
      }
      // The invoking element left the DOM (e.g. its row was deleted): land on
      // the page heading so keyboard and screen-reader users keep their place.
      const fallback = document.querySelector<HTMLElement>('main h1, h1');
      if (fallback) {
        fallback.tabIndex = -1;
        fallback.focus();
      }
    });
  }

  /**
   * Keeps keyboard focus inside the topmost dialog: any focusin that lands
   * outside it is pulled back to its first control, so the background is
   * unreachable by keyboard for the whole modal flow. Pointer interaction
   * is covered by the fixed full-viewport backdrop.
   */
  private readonly containFocus = (event: FocusEvent): void => {
    if (dialogStack[dialogStack.length - 1] !== this) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    const target =
      this.focusables()[0] ?? this.host.nativeElement.querySelector<HTMLElement>('.dialog-card');
    target?.focus();
  };

  onBackdrop(): void {
    if (!this.lockDismissal()) this.dismissed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (!this.lockDismissal()) {
        event.preventDefault();
        event.stopPropagation();
        this.dismissed.emit();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = this.focusables();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusables(): HTMLElement[] {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        '.dialog-card a[href], .dialog-card button, .dialog-card input, ' +
          '.dialog-card select, .dialog-card textarea, ' +
          '.dialog-card [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.matches(':disabled'));
    // matches(':disabled') covers EFFECTIVE disabledness: controls inside a
    // disabled fieldset are disabled by inheritance without carrying their
    // own disabled attribute, and an inherited-disabled control cannot take
    // focus. When every control is disabled (mutation in flight) the list is
    // empty and callers fall back to the tabindex=-1 dialog card.
  }
}
