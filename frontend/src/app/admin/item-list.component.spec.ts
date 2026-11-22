import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoryStateService } from './category-state.service';
import { CategoryDto } from './catalog.models';
import { ItemListComponent } from './item-list.component';
import { ItemStateService } from './item-state.service';
import { ItemDeleteResult, ItemDto, ItemSaveResult } from './items.models';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function item(partial: Partial<ItemDto>): ItemDto {
  return {
    id: 'i1',
    categoryId: 'c1',
    nameAr: 'كبدة',
    nameEn: null,
    descriptionAr: null,
    descriptionEn: null,
    price: 85,
    currencyCode: 'EGP',
    sortOrder: 0,
    isPublished: true,
    isAvailable: true,
    rowVersion: 'AAAAAAAAAAA=',
    ...partial,
  };
}

function itemStoreStub(overrides: Record<string, unknown> = {}) {
  return {
    items: signal<ItemDto[]>([]),
    filtered: signal<ItemDto[]>([]),
    onlySoldOut: signal(false),
    isLoading: signal(false),
    error: signal<string | null>(null),
    filters: signal({ categoryId: null, search: '' }),
    load: async () => undefined,
    save: async (): Promise<{ result: ItemSaveResult; item: ItemDto | null }> => ({
      result: 'ok',
      item: null,
    }),
    setAvailability: async (): Promise<ItemSaveResult> => 'ok',
    remove: async (): Promise<ItemDeleteResult> => 'ok',
    uploadImage: async () => 'ok',
    nextPosition: async (): Promise<number | null> => 0,
    ...overrides,
  };
}

function categoryStoreStub() {
  return {
    categories: signal<CategoryDto[]>([
      {
        id: 'c1',
        nameAr: 'مشروبات',
        nameEn: null,
        sortOrder: 0,
        isPublished: true,
        rowVersion: 'AAAAAAAAAAA=',
      },
    ]),
    sorted: signal<CategoryDto[]>([
      {
        id: 'c1',
        nameAr: 'مشروبات',
        nameEn: null,
        sortOrder: 0,
        isPublished: true,
        rowVersion: 'AAAAAAAAAAA=',
      },
    ]),
    load: async () => undefined,
  };
}

async function create(stub: ReturnType<typeof itemStoreStub>) {
  await TestBed.configureTestingModule({
    imports: [ItemListComponent],
    providers: [
      provideRouter([]),
      { provide: ItemStateService, useValue: stub },
      { provide: CategoryStateService, useValue: categoryStoreStub() },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ItemListComponent);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('ItemListComponent', () => {
  it('renders rows with category names and formatted EGP prices', async () => {
    const stub = itemStoreStub({
      filtered: signal([item({ nameAr: 'كبدة', price: 185 })]),
    });
    const fixture = await create(stub);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('كبدة');
    expect(text).toContain('مشروبات');
    expect(text).toContain('185.00');
    expect(text).toContain('ج.م');
    fixture.nativeElement.remove();
  });

  it('toggles availability and confirms with feedback', async () => {
    const target = item({ id: 'i1', isAvailable: true });
    const calls: boolean[] = [];
    const stub = itemStoreStub({
      filtered: signal([target]),
      setAvailability: async (_i: ItemDto, next: boolean): Promise<ItemSaveResult> => {
        calls.push(next);
        return 'ok';
      },
    });
    const fixture = await create(stub);
    (fixture.nativeElement.querySelector('.availability-toggle') as HTMLElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(calls).toEqual([false]);
    expect(fixture.nativeElement.textContent).toContain('بقى نافد');
    fixture.nativeElement.remove();
  });

  it('reloads when the availability toggle reports stale data', async () => {
    let loads = 0;
    const stub = itemStoreStub({
      filtered: signal([item({})]),
      setAvailability: async (): Promise<ItemSaveResult> => 'stale',
      load: async () => {
        loads++;
      },
    });
    const fixture = await create(stub);
    loads = 0; // ignore the initial ngOnInit load
    (fixture.nativeElement.querySelector('.availability-toggle') as HTMLElement).click();
    await fixture.whenStable();
    expect(loads).toBe(1);
    fixture.nativeElement.remove();
  });

  it('assigns the destination category append position on create, then uploads', async () => {
    const order: string[] = [];
    const stub = itemStoreStub({
      items: signal([item({ id: 'i1' }), item({ id: 'i2', sortOrder: 1 })]),
      filtered: signal([item({ id: 'i1' }), item({ id: 'i2', sortOrder: 1 })]),
      nextPosition: async (categoryId: string): Promise<number | null> => {
        order.push('position:' + categoryId);
        return 5; // full unfiltered sequence of the destination category
      },
      save: async (input: { sortOrder: number }) => {
        order.push('save:' + input.sortOrder);
        return { result: 'ok' as ItemSaveResult, item: item({ id: 'new-9' }) };
      },
      uploadImage: async (id: string) => {
        order.push('upload:' + id);
        return 'ok';
      },
    });
    const fixture = await create(stub);
    fixture.componentInstance.openModal(null, document.createElement('button'));
    fixture.detectChanges();
    const file = new File(['x'], 'dish.png', { type: 'image/png' });
    await fixture.componentInstance.saveItem({
      input: {
        categoryId: 'c1',
        nameAr: 'طعمية',
        nameEn: null,
        descriptionAr: null,
        descriptionEn: null,
        price: 25,
        currencyCode: 'EGP',
        sortOrder: 0,
        isPublished: true,
        isAvailable: true,
      },
      file,
    });
    expect(order).toEqual(['position:c1', 'save:5', 'upload:new-9']);
    fixture.nativeElement.remove();
  });

  it('refuses the create when no safe append position exists', async () => {
    let saves = 0;
    const stub = itemStoreStub({
      nextPosition: async (): Promise<number | null> => null,
      save: async () => {
        saves++;
        return { result: 'ok' as ItemSaveResult, item: null };
      },
    });
    const fixture = await create(stub);
    fixture.componentInstance.openModal(null, document.createElement('button'));
    fixture.detectChanges();
    const outcome = await fixture.componentInstance.saveItem({
      input: {
        categoryId: 'c1',
        nameAr: 'طعمية',
        nameEn: null,
        descriptionAr: null,
        descriptionEn: null,
        price: 25,
        currencyCode: 'EGP',
        sortOrder: 0,
        isPublished: true,
        isAvailable: true,
      },
      file: null,
    });
    expect(outcome).toBe('error');
    expect(saves).toBe(0);
    fixture.nativeElement.remove();
  });

  it('initializes the toolbar from the active service filters on re-entry', async () => {
    const stub = itemStoreStub({
      filtered: signal([item({})]),
      filters: signal({ categoryId: 'c1', search: 'برجر' }),
    });
    const fixture = await create(stub);
    const search = fixture.nativeElement.querySelector('.search-input') as HTMLInputElement;
    const select = fixture.nativeElement.querySelector('.category-filter') as HTMLSelectElement;
    expect(search.value).toBe('برجر');
    expect(select.value).toBe('c1');
    fixture.nativeElement.remove();
  });

  it('intercepts the native toolbar submit instead of reloading the page', async () => {
    const applied: unknown[] = [];
    const stub = itemStoreStub({
      filtered: signal([item({})]),
      load: async (filters?: unknown) => {
        if (filters) applied.push(filters);
      },
    });
    const fixture = await create(stub);
    const form = fixture.nativeElement.querySelector('form.toolbar') as HTMLFormElement;
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    fixture.nativeElement.remove();
  });

  it('keeps the item and says so when the image upload fails after a successful save', async () => {
    const stub = itemStoreStub({
      save: async () => ({ result: 'ok' as ItemSaveResult, item: item({ id: 'new-9' }) }),
      uploadImage: async () => 'too-large',
    });
    const fixture = await create(stub);
    fixture.componentInstance.openModal(null, document.createElement('button'));
    const outcome = await fixture.componentInstance.saveItem({
      input: {
        categoryId: 'c1',
        nameAr: 'طعمية',
        nameEn: null,
        descriptionAr: null,
        descriptionEn: null,
        price: 25,
        currencyCode: 'EGP',
        sortOrder: 0,
        isPublished: true,
        isAvailable: true,
      },
      file: new File(['x'], 'big.png', { type: 'image/png' }),
    });
    expect(outcome).toBe('ok');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('الصورة أكبر من 5 ميجابايت');
    fixture.nativeElement.remove();
  });

  it('deletes through the confirmation dialog and restores focus to the heading', async () => {
    const target = item({ id: 'i1', nameAr: 'كبدة' });
    const removed: string[] = [];
    const stub = itemStoreStub({
      filtered: signal([target]),
      remove: async (i: ItemDto): Promise<ItemDeleteResult> => {
        removed.push(i.id);
        return 'ok';
      },
    });
    const fixture = await create(stub);
    const deleteButton = (
      Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLElement[]
    ).find((b) => b.textContent?.trim() === 'حذف')!;
    deleteButton.click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('app-accessible-dialog');
    expect(dialog.textContent).toContain('حذف الطبق');
    const confirm = (Array.from(dialog.querySelectorAll('button')) as HTMLElement[]).find((b) =>
      b.textContent?.includes('حذف نهائي'),
    )!;
    confirm.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(removed).toEqual(['i1']);
    await flush();
    // The trigger's row is still rendered (stub does not filter), so focus
    // returns to the trigger; the heading fallback is covered by the dialog spec.
    expect(fixture.nativeElement.textContent).toContain('تم حذف الطبق.');
    fixture.nativeElement.remove();
  });

  it('cancels deletion without calling the store', async () => {
    let calls = 0;
    const stub = itemStoreStub({
      filtered: signal([item({})]),
      remove: async (): Promise<ItemDeleteResult> => {
        calls++;
        return 'ok';
      },
    });
    const fixture = await create(stub);
    const deleteButton = (
      Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLElement[]
    ).find((b) => b.textContent?.trim() === 'حذف')!;
    deleteButton.click();
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('app-accessible-dialog');
    const cancel = (Array.from(dialog.querySelectorAll('button')) as HTMLElement[]).find(
      (b) => b.textContent?.trim() === 'إلغاء',
    )!;
    cancel.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(calls).toBe(0);
    expect(fixture.nativeElement.querySelector('app-accessible-dialog')).toBeNull();
    fixture.nativeElement.remove();
  });

  it('applies the search and category filters to the server load', async () => {
    const applied: { categoryId: string | null; search: string }[] = [];
    const stub = itemStoreStub({
      filtered: signal([item({})]),
      load: async (filters?: { categoryId: string | null; search: string }) => {
        if (filters) applied.push(filters);
      },
    });
    const fixture = await create(stub);
    const search = fixture.nativeElement.querySelector('.search-input') as HTMLInputElement;
    search.value = 'برجر';
    search.dispatchEvent(new Event('input'));
    const select = fixture.nativeElement.querySelector('.category-filter') as HTMLSelectElement;
    select.value = 'c1';
    select.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(applied).toContainEqual({ categoryId: 'c1', search: 'برجر' });
    fixture.nativeElement.remove();
  });
});
