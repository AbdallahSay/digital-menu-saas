import { TestBed } from '@angular/core/testing';
import { CategoryDto } from './catalog.models';
import { ItemModalComponent, ItemModalResult } from './item-modal.component';
import { ItemDto, ItemSaveResult } from './items.models';

function category(partial: Partial<CategoryDto> = {}): CategoryDto {
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
    sortOrder: 3,
    isPublished: true,
    isAvailable: true,
    rowVersion: 'AAAAAAAAAAA=',
    ...partial,
  };
}

describe('ItemModalComponent', () => {
  async function create(
    existing: ItemDto | null,
    onSave: (result: ItemModalResult) => Promise<ItemSaveResult> = async () => 'ok',
  ) {
    await TestBed.configureTestingModule({ imports: [ItemModalComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ItemModalComponent);
    fixture.componentRef.setInput('item', existing);
    fixture.componentRef.setInput('categories', [
      category(),
      category({ id: 'c2', nameAr: 'فراخ' }),
    ]);
    fixture.componentRef.setInput('onSave', onSave);
    fixture.detectChanges();
    return fixture;
  }

  const valid = {
    nameAr: 'كبدة',
    nameEn: '',
    categoryId: 'c1',
    price: 85,
    descriptionAr: '',
    descriptionEn: '',
    isAvailable: true,
  };

  it('defaults the category selector to the first category on create', async () => {
    const fixture = await create(null);
    expect(fixture.componentInstance.form.controls.categoryId.value).toBe('c1');
  });

  it('rejects a price of zero although the backend would accept it (design reconciliation)', async () => {
    const calls: ItemModalResult[] = [];
    const fixture = await create(null, async (r) => {
      calls.push(r);
      return 'ok';
    });
    fixture.componentInstance.form.patchValue({ ...valid, price: 0 });
    await fixture.componentInstance.save();
    expect(calls).toEqual([]);
    fixture.componentInstance.form.patchValue({ ...valid, price: 0.01 });
    await fixture.componentInstance.save();
    expect(calls.length).toBe(1);
  });

  it('rejects a price with more than two fraction digits instead of rounding it', async () => {
    const calls: ItemModalResult[] = [];
    const fixture = await create(null, async (r) => {
      calls.push(r);
      return 'ok';
    });
    fixture.componentInstance.form.patchValue({ ...valid, price: 10.999 });
    await fixture.componentInstance.save();
    expect(calls).toEqual([]);
    fixture.componentInstance.form.patchValue({ ...valid, price: 10.99 });
    await fixture.componentInstance.save();
    expect(calls[0].input.price).toBe(10.99);
  });

  it('emits trimmed bilingual input and the staged file through onSave', async () => {
    const calls: ItemModalResult[] = [];
    const fixture = await create(null, async (r) => {
      calls.push(r);
      return 'ok';
    });
    fixture.componentInstance.form.patchValue({
      ...valid,
      nameAr: '  كبدة  ',
      nameEn: '  Liver ',
      descriptionAr: '  حار  ',
    });
    const file = new File(['x'], 'dish.png', { type: 'image/png' });
    fixture.componentInstance.stage({
      target: { files: [file] },
    } as unknown as Event);
    await fixture.componentInstance.save();
    expect(calls.length).toBe(1);
    expect(calls[0].input.nameAr).toBe('كبدة');
    expect(calls[0].input.nameEn).toBe('Liver');
    expect(calls[0].input.descriptionAr).toBe('حار');
    expect(calls[0].input.currencyCode).toBe('EGP');
    expect(calls[0].input.isPublished).toBe(true);
    expect(calls[0].file).toBe(file);
  });

  it('emits isFeatured from the checkbox and seeds it from the existing item', async () => {
    const calls: ItemModalResult[] = [];
    const fixture = await create(item({ isFeatured: true }), async (r) => {
      calls.push(r);
      return 'ok';
    });
    const box = fixture.nativeElement.querySelector('#item-featured') as HTMLInputElement;
    expect(box.checked).toBe(true);
    fixture.componentInstance.form.patchValue({ isFeatured: false });
    await fixture.componentInstance.save();
    expect(calls[0].input.isFeatured).toBe(false);
  });

  it('keeps the existing position and publish state in edit mode', async () => {
    const calls: ItemModalResult[] = [];
    const fixture = await create(item({ sortOrder: 7, isPublished: false }), async (r) => {
      calls.push(r);
      return 'ok';
    });
    await fixture.componentInstance.save();
    expect(calls[0].input.sortOrder).toBe(7);
    expect(calls[0].input.isPublished).toBe(false);
  });

  it('keeps the draft open with an inline error when the save fails', async () => {
    const fixture = await create(null, async () => 'error');
    fixture.componentInstance.form.patchValue(valid);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    await fixture.componentInstance.save();
    expect(closed).toBe(0);
    expect(fixture.componentInstance.saveError()).not.toBeNull();
    expect(fixture.componentInstance.form.controls.nameAr.value).toBe('كبدة');
  });

  it('shows the stale-copy when the row changed elsewhere', async () => {
    const fixture = await create(item({}), async () => 'stale');
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.saveError()).toContain('اتعدل من مكان تاني');
  });

  it('guards duplicate submissions while a save is in flight', async () => {
    let calls = 0;
    let release: (value: ItemSaveResult) => void = () => {};
    const fixture = await create(null, () => {
      calls++;
      return new Promise<ItemSaveResult>((resolve) => (release = resolve));
    });
    fixture.componentInstance.form.patchValue(valid);
    const first = fixture.componentInstance.save();
    await fixture.componentInstance.save();
    expect(calls).toBe(1);
    release('ok');
    await first;
  });

  it('revokes the object URL when a staged image is replaced', async () => {
    const fixture = await create(null);
    const first = new File(['a'], 'a.png', { type: 'image/png' });
    fixture.componentInstance.stage({ target: { files: [first] } } as unknown as Event);
    const firstUrl = fixture.componentInstance.previewUrl();
    expect(firstUrl).toContain('blob:');
    const second = new File(['b'], 'b.png', { type: 'image/png' });
    fixture.componentInstance.stage({ target: { files: [second] } } as unknown as Event);
    expect(fixture.componentInstance.previewUrl()).not.toBe(firstUrl);
  });
});
