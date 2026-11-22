import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccessibleDialogComponent } from './accessible-dialog.component';

@Component({
  imports: [AccessibleDialogComponent],
  template: `
    <app-accessible-dialog
      [labelledBy]="'host-title'"
      [returnFocusTo]="trigger"
      [lockDismissal]="locked"
      (dismissed)="onDismissed()"
    >
      <h2 id="host-title">عنوان</h2>
      <button type="button" data-autofocus>أول</button>
      <input type="text" />
      <button type="button">آخر</button>
    </app-accessible-dialog>
  `,
})
class HostComponent {
  trigger: HTMLElement | null = null;
  locked = false;
  dismissedCount = 0;
  onDismissed(): void {
    this.dismissedCount++;
  }
}

/** Two dialogs toggled by signals, mirroring the confirmation→conflict flow. */
@Component({
  imports: [AccessibleDialogComponent],
  template: `
    @if (first()) {
      <app-accessible-dialog [labelledBy]="'first-title'" [returnFocusTo]="trigger">
        <h2 id="first-title">الأول</h2>
        <button type="button" data-autofocus>أول زر</button>
        <button type="button">ثاني زر</button>
      </app-accessible-dialog>
    }
    @if (second()) {
      <app-accessible-dialog [labelledBy]="'second-title'" [returnFocusTo]="trigger">
        <h2 id="second-title">الثاني</h2>
        <button type="button" data-autofocus>بديل أول</button>
        <button type="button">بديل ثاني</button>
      </app-accessible-dialog>
    }
  `,
})
class HandoffHostComponent {
  trigger: HTMLElement | null = null;
  readonly first = signal(true);
  readonly second = signal(false);
}

/** Mirrors the modal's saving state: fieldset[disabled] + disabled action buttons. */
@Component({
  imports: [AccessibleDialogComponent],
  template: `
    <app-accessible-dialog [labelledBy]="'lock-title'">
      <h2 id="lock-title">قفل</h2>
      <fieldset [disabled]="locked()">
        <input type="text" />
      </fieldset>
      <button type="button" [disabled]="locked()">إلغاء</button>
      <button type="button" [disabled]="locked()">حفظ</button>
    </app-accessible-dialog>
  `,
})
class LockedHostComponent {
  readonly locked = signal(true);
}

describe('AccessibleDialogComponent', () => {
  // Inputs are set before the first change detection: the zoneless test
  // environment does not refresh plain-property template bindings on a
  // later detectChanges() the way signal-driven app code does.
  async function create(options: { trigger?: HTMLElement | null; locked?: boolean } = {}) {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.trigger = options.trigger ?? null;
    fixture.componentInstance.locked = options.locked ?? false;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return fixture;
  }

  function card(fixture: { nativeElement: HTMLElement }): HTMLElement {
    return fixture.nativeElement.querySelector('.dialog-card') as HTMLElement;
  }

  function keydown(target: HTMLElement, key: string, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  it('moves focus to the [data-autofocus] element on open', async () => {
    const fixture = await create();
    const autofocused = fixture.nativeElement.querySelector('[data-autofocus]');
    expect(document.activeElement).toBe(autofocused);
    fixture.nativeElement.remove();
  });

  it('cycles Tab from the last control to the first and Shift+Tab back', async () => {
    const fixture = await create();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    const input = fixture.nativeElement.querySelector('input');
    (buttons[1] as HTMLElement).focus();
    keydown(card(fixture), 'Tab');
    expect(document.activeElement).toBe(buttons[0]);
    (buttons[0] as HTMLElement).focus();
    keydown(card(fixture), 'Tab', true);
    expect(document.activeElement).toBe(buttons[1]);
    (input as HTMLElement).focus();
    keydown(card(fixture), 'Tab');
    expect(document.activeElement).toBe(input); // no wrap needed mid-list
    fixture.nativeElement.remove();
  });

  it('emits dismissed on Escape and backdrop click when not locked', async () => {
    const fixture = await create();
    const host = fixture.componentInstance;
    keydown(card(fixture), 'Escape');
    expect(host.dismissedCount).toBe(1);
    (fixture.nativeElement.querySelector('.dialog-backdrop') as HTMLElement).click();
    expect(host.dismissedCount).toBe(2);
    fixture.nativeElement.remove();
  });

  it('ignores Escape and backdrop while dismissal is locked', async () => {
    const fixture = await create({ locked: true });
    keydown(card(fixture), 'Escape');
    (fixture.nativeElement.querySelector('.dialog-backdrop') as HTMLElement).click();
    expect(fixture.componentInstance.dismissedCount).toBe(0);
    fixture.nativeElement.remove();
  });

  it('returns focus to the trigger on destroy', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const fixture = await create({ trigger });
    fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(trigger);
    fixture.nativeElement.remove();
    trigger.remove();
  });

  it('hands focus to a replacement dialog and defers restoration until the flow ends', async () => {
    await TestBed.configureTestingModule({ imports: [HandoffHostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HandoffHostComponent);
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    fixture.componentInstance.trigger = trigger;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    // The replacement opens in the same render as the outgoing dialog closes.
    fixture.componentInstance.first.set(false);
    fixture.componentInstance.second.set(true);
    fixture.detectChanges();
    const secondCard = fixture.nativeElement.querySelector('.dialog-card') as HTMLElement;
    const secondAutofocus = secondCard.querySelector('[data-autofocus]') as HTMLElement;
    expect(secondCard.textContent).toContain('الثاني');
    expect(document.activeElement).toBe(secondAutofocus);

    // Flush the outgoing dialog's deferred restoration: focus must stay put.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(secondAutofocus);

    // Tab wraps inside the replacement; outside focus is pulled back in.
    const buttons = Array.from(secondCard.querySelectorAll('button')) as HTMLElement[];
    buttons[1].focus();
    secondCard.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(buttons[0]);
    trigger.focus();
    expect(document.activeElement).toBe(buttons[0]);

    // Only when the whole modal flow ends does the original trigger refocus.
    fixture.componentInstance.second.set(false);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(trigger);

    fixture.nativeElement.remove();
    trigger.remove();
  });

  it('pulls focus back when it escapes the single open dialog', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const fixture = await create();
    outside.focus();
    const firstControl = fixture.nativeElement.querySelector('[data-autofocus]');
    expect(document.activeElement).toBe(firstControl);
    fixture.nativeElement.remove();
    outside.remove();
  });

  it('keeps focus on the dialog card when every control is effectively disabled', async () => {
    await TestBed.configureTestingModule({ imports: [LockedHostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(LockedHostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    // No data-autofocus and every control disabled: the card itself holds focus.
    const dialogCard = card(fixture);
    expect(document.activeElement).toBe(dialogCard);

    // Controls inside fieldset[disabled] are disabled by INHERITANCE: an
    // outside focus attempt must return to the card, never to an unfocusable
    // input, and Tab/Shift+Tab must not reach the page.
    outside.focus();
    expect(document.activeElement).toBe(dialogCard);
    keydown(dialogCard, 'Tab');
    expect(document.activeElement).toBe(dialogCard);
    keydown(dialogCard, 'Tab', true);
    expect(document.activeElement).toBe(dialogCard);

    fixture.nativeElement.remove();
    outside.remove();
  });

  it('recovers enabled focus targets when the saving state ends', async () => {
    await TestBed.configureTestingModule({ imports: [LockedHostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(LockedHostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    // Save failed, controls re-enable: containment targets real controls again.
    fixture.componentInstance.locked.set(false);
    fixture.detectChanges();
    outside.focus();
    const input = fixture.nativeElement.querySelector('input') as HTMLElement;
    expect(document.activeElement).toBe(input);
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLElement[];
    buttons[1].focus();
    keydown(card(fixture), 'Tab');
    expect(document.activeElement).toBe(input);

    fixture.nativeElement.remove();
    outside.remove();
  });

  it('falls back to the page heading when the trigger left the DOM', async () => {
    const heading = document.createElement('h1');
    heading.textContent = 'الأقسام';
    document.body.appendChild(heading);
    // The trigger element exists but is never attached to the document.
    const fixture = await create({ trigger: document.createElement('button') });
    fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(heading);
    expect(heading.tabIndex).toBe(-1);
    fixture.nativeElement.remove();
    heading.remove();
  });
});
