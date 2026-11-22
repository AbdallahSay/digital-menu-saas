import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoryDto, DeleteResult, SaveResult } from './catalog.models';
import { CategoryListComponent } from './category-list.component';
import { CategoryStateService } from './category-state.service';

function category(partial: Partial<CategoryDto>): CategoryDto {
  return {
    id: 'c1',
    nameAr: 'مشروبات',
    nameEn: null,
    sortOrder: 0,
    isPublished: true,
    rowVersion: 'AAAAAAAAAAA=',
    ...partial,
  };
}

function storeStub(overrides: Record<string, unknown> = {}) {
  return {
    categories: signal<CategoryDto[]>([]),
    isLoading: signal(false),
    error: signal<string | null>(null),
    sorted: signal<CategoryDto[]>([]),
    load: async () => undefined,
    create: async (): Promise<SaveResult> => 'ok',
    update: async (): Promise<SaveResult> => 'ok',
    remove: async (): Promise<DeleteResult> => 'ok',
    itemCount: async (): Promise<number | null> => 2,
    togglePublish: async (): Promise<SaveResult> => 'ok',
    move: async (): Promise<SaveResult> => 'ok',
    ...overrides,
  };
}

async function create(stub: ReturnType<typeof storeStub>) {
  await TestBed.configureTestingModule({
    imports: [CategoryListComponent],
    providers: [provideRouter([]), { provide: CategoryStateService, useValue: stub }],
  }).compileComponents();
  const fixture = TestBed.createComponent(CategoryListComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('CategoryListComponent', () => {
  it('loads categories on init and renders rows', async () => {
    const calls: number[] = [];
    const stub = storeStub({
      sorted: signal([
        category({ id: 'a', nameAr: 'مشروبات' }),
        category({ id: 'b', nameAr: 'حلويات', sortOrder: 1 }),
      ]),
      load: async () => {
        calls.push(1);
      },
    });
    const fixture = await create(stub);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(calls.length).toBe(1);
    expect(text).toContain('مشروبات');
    expect(text).toContain('حلويات');
  });

  it('shows the empty state when there are no categories', async () => {
    const fixture = await create(storeStub());
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('لسه مفيش أقسام');
  });

  it('disables reorder at the boundaries', async () => {
    const stub = storeStub({
      sorted: signal([category({ id: 'a' }), category({ id: 'b', sortOrder: 1 })]),
    });
    const fixture = await create(stub);
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.order-btn'),
    );
    expect(buttons[0].disabled).toBe(true); // first cannot go up
    expect(buttons[1].disabled).toBe(false);
    expect(buttons[2].disabled).toBe(false);
    expect(buttons[3].disabled).toBe(true); // last cannot go down
  });

  it('confirms deletion and reports success', async () => {
    const removed: string[] = [];
    const stub = storeStub({
      sorted: signal([category({ id: 'a' })]),
      remove: async (id: string): Promise<DeleteResult> => {
        removed.push(id);
        return 'ok';
      },
    });
    const fixture = await create(stub);
    await fixture.componentInstance.askDelete(stub.sorted()[0], null);
    await fixture.componentInstance.confirmDelete();
    expect(removed).toEqual(['a']);
    expect(fixture.componentInstance.feedback()?.text).toContain('تم حذف القسم');
  });

  it('shows the relational conflict dialog with the item count on 409', async () => {
    const stub = storeStub({
      sorted: signal([category({ id: 'a', nameAr: 'مشروبات' })]),
      remove: async (): Promise<DeleteResult> => 'conflict',
      itemCount: async () => 5,
    });
    const fixture = await create(stub);
    await fixture.componentInstance.askDelete(stub.sorted()[0], null);
    await fixture.componentInstance.confirmDelete();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('لا يمكن حذف');
    expect(text).toContain('5 أطباق');
    expect(text).toContain('منشورة أو مخفية');
    expect(fixture.componentInstance.conflict()?.category.nameAr).toBe('مشروبات');
  });

  it('says the reason is unknown when the item count lookup fails', async () => {
    const stub = storeStub({
      sorted: signal([category({ id: 'a', nameAr: 'مشروبات' })]),
      remove: async (): Promise<DeleteResult> => 'conflict',
      itemCount: async (): Promise<number | null> => null,
    });
    const fixture = await create(stub);
    await fixture.componentInstance.askDelete(stub.sorted()[0], null);
    await fixture.componentInstance.confirmDelete();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('تعذّر التحقق من السبب');
    expect(text).not.toContain('0 طبقاً');
  });

  it('offers a retry instead of blaming items when a conflict has zero counted', async () => {
    const stub = storeStub({
      sorted: signal([category({ id: 'a', nameAr: 'مشروبات' })]),
      remove: async (): Promise<DeleteResult> => 'conflict',
      itemCount: async (): Promise<number | null> => 0,
    });
    const fixture = await create(stub);
    await fixture.componentInstance.askDelete(stub.sorted()[0], null);
    await fixture.componentInstance.confirmDelete();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('يبدو فارغاً');
    expect(text).toContain('حذف مرة أخرى');
  });

  it('keeps focus inside the conflict dialog when a delete hits a 409', async () => {
    const stub = storeStub({
      sorted: signal([category({ id: 'a', nameAr: 'مشروبات' })]),
      remove: async (): Promise<DeleteResult> => 'conflict',
      itemCount: async (): Promise<number | null> => 3,
    });
    const fixture = await create(stub);
    const root = fixture.nativeElement as HTMLElement;
    const deleteButton = root.querySelector('.btn-danger') as HTMLElement;
    deleteButton.click(); // opens the confirmation
    fixture.detectChanges();

    const confirmButton = Array.from(
      root.querySelectorAll<HTMLElement>('.dialog-card button'),
    ).find((b) => b.textContent?.includes('حذف نهائي'))!;
    confirmButton.click(); // → 409 → conflict dialog replaces the confirmation
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    // Flush the outgoing confirmation's deferred focus restoration: it must
    // NOT steal focus from the conflict dialog back to the background.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const conflictCard = root.querySelector('.dialog-card') as HTMLElement;
    expect(conflictCard.textContent).toContain('لا يمكن حذف');
    expect(conflictCard.contains(document.activeElement)).toBe(true);

    // Tab cannot reach the page: the last control wraps to the first.
    const controls = Array.from(conflictCard.querySelectorAll('button')) as HTMLElement[];
    controls[controls.length - 1].focus();
    conflictCard.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(controls[0]);
    // And an outside focus attempt is pulled back in.
    deleteButton.focus();
    expect(conflictCard.contains(document.activeElement)).toBe(true);
  });

  it('restores focus to the delete trigger after the conflict flow resolves', async () => {
    let attempt = 0;
    const stub = storeStub({
      sorted: signal([category({ id: 'a', nameAr: 'مشروبات' })]),
      remove: async (): Promise<DeleteResult> => (++attempt === 1 ? 'conflict' : 'ok'),
      itemCount: async (): Promise<number | null> => 3,
    });
    const fixture = await create(stub);
    const root = fixture.nativeElement as HTMLElement;
    const deleteButton = root.querySelector('.btn-danger') as HTMLElement;
    deleteButton.click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLElement>('.dialog-card button'))
      .find((b) => b.textContent?.includes('حذف نهائي'))!
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    // Retry from the conflict dialog; the second attempt succeeds.
    Array.from(root.querySelectorAll<HTMLElement>('.dialog-card button'))
      .find((b) => b.textContent?.includes('حذف مرة أخرى'))!
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(attempt).toBe(2);
    expect(fixture.componentInstance.feedback()?.text).toContain('تم حذف القسم');
    // The row's delete button is still in the DOM (the stub keeps the list),
    // so it receives focus when the flow ends.
    expect(document.activeElement).toBe(deleteButton);
  });

  it('falls back to the page heading when a successful delete removes the trigger', async () => {
    const rows = signal([category({ id: 'a', nameAr: 'مشروبات' })]);
    const stub = storeStub({
      sorted: rows,
      remove: async (): Promise<DeleteResult> => {
        rows.set([]);
        return 'ok';
      },
    });
    const fixture = await create(stub);
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('.btn-danger') as HTMLElement).click();
    fixture.detectChanges();
    Array.from(root.querySelectorAll<HTMLElement>('.dialog-card button'))
      .find((b) => b.textContent?.includes('حذف نهائي'))!
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fixture.componentInstance.feedback()?.text).toContain('تم حذف القسم');
    const heading = root.querySelector('#categories-title') as HTMLElement;
    expect(document.activeElement).toBe(heading);
    expect(heading.tabIndex).toBe(-1);
  });

  it('retries the delete from the conflict dialog', async () => {
    let attempt = 0;
    const stub = storeStub({
      sorted: signal([category({ id: 'a', nameAr: 'مشروبات' })]),
      remove: async (): Promise<DeleteResult> => (++attempt === 1 ? 'conflict' : 'ok'),
      itemCount: async (): Promise<number | null> => 3,
    });
    const fixture = await create(stub);
    await fixture.componentInstance.askDelete(stub.sorted()[0], null);
    await fixture.componentInstance.confirmDelete();
    expect(fixture.componentInstance.conflict()).not.toBeNull();
    await fixture.componentInstance.retryDeleteFromConflict();
    expect(attempt).toBe(2);
    expect(fixture.componentInstance.conflict()).toBeNull();
    expect(fixture.componentInstance.feedback()?.text).toContain('تم حذف القسم');
  });

  it('opens the modal for a new category and saves through the store', async () => {
    const created: unknown[] = [];
    const stub = storeStub({
      create: async (input: unknown): Promise<SaveResult> => {
        created.push(input);
        return 'ok';
      },
    });
    const fixture = await create(stub);
    const trigger = document.createElement('button');
    fixture.componentInstance.openModal(null, trigger);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-category-modal')).toBeTruthy();

    await fixture.componentInstance.saveCategory({
      input: { nameAr: 'حلويات', nameEn: null, sortOrder: 0, isPublished: true },
      rowVersion: null,
    });
    expect(created.length).toBe(1);
    expect(fixture.componentInstance.editing()).toBeNull();
    expect(fixture.componentInstance.feedback()?.text).toContain('تم حفظ القسم');
  });

  it('keeps the modal open with its draft when saving fails', async () => {
    const stub = storeStub({
      create: async (): Promise<SaveResult> => 'error',
    });
    const fixture = await create(stub);
    const trigger = document.createElement('button');
    fixture.componentInstance.openModal(null, trigger);
    fixture.detectChanges();
    const outcome = await fixture.componentInstance.saveCategory({
      input: { nameAr: 'حلويات', nameEn: null, sortOrder: 0, isPublished: true },
      rowVersion: null,
    });
    expect(outcome).toBe('error');
    // The modal stays open (the modal itself shows the inline error).
    expect(fixture.componentInstance.editing()).not.toBeNull();
    expect(fixture.componentInstance.feedback()).toBeNull();
  });

  it('refreshes the editing rowVersion after a stale save so a retry can succeed', async () => {
    const fresh = category({ id: 'a', rowVersion: 'BBBBBBBBBBB=' });
    const stub = storeStub({
      sorted: signal([category({ id: 'a' })]),
      update: async (): Promise<SaveResult> => 'stale',
      load: async () => {
        stub.categories.set([fresh]);
      },
    });
    const fixture = await create(stub);
    const trigger = document.createElement('button');
    fixture.componentInstance.openModal(category({ id: 'a' }), trigger);
    const outcome = await fixture.componentInstance.saveCategory({
      input: { nameAr: 'مشروبات', nameEn: null, sortOrder: 0, isPublished: true },
      rowVersion: 'AAAAAAAAAAA=',
    });
    expect(outcome).toBe('stale');
    expect(fixture.componentInstance.editing()?.category?.rowVersion).toBe('BBBBBBBBBBB=');
  });

  it('shows honest copy when a reorder only partially commits', async () => {
    const stub = storeStub({
      sorted: signal([category({ id: 'a' }), category({ id: 'b', sortOrder: 1 })]),
      move: async (): Promise<SaveResult> => 'partial',
    });
    const fixture = await create(stub);
    await fixture.componentInstance.move(stub.sorted()[0], 1);
    expect(fixture.componentInstance.feedback()?.text).toContain('ما كملتش');
    expect(fixture.componentInstance.feedback()?.kind).toBe('error');
  });
});
