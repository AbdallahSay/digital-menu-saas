import { TestBed } from '@angular/core/testing';
import { CategoryDto, SaveResult } from './catalog.models';
import { CategoryModalComponent, CategoryModalResult } from './category-modal.component';

describe('CategoryModalComponent', () => {
  async function create(
    category: CategoryDto | null,
    onSave: (result: CategoryModalResult) => Promise<SaveResult> = async () => 'ok',
  ) {
    await TestBed.configureTestingModule({ imports: [CategoryModalComponent] }).compileComponents();
    const fixture = TestBed.createComponent(CategoryModalComponent);
    fixture.componentRef.setInput('category', category);
    fixture.componentRef.setInput('onSave', onSave);
    fixture.detectChanges();
    return fixture;
  }

  const valid = { nameAr: 'مشروبات', nameEn: '', sortOrder: 0, isPublished: true };

  it('rejects a whitespace-only Arabic name instead of saving an empty one', async () => {
    const calls: CategoryModalResult[] = [];
    const fixture = await create(null, async (r) => {
      calls.push(r);
      return 'ok';
    });
    fixture.componentInstance.form.setValue({ ...valid, nameAr: '  ' });
    await fixture.componentInstance.save();
    expect(calls).toEqual([]);
    expect(fixture.componentInstance.form.controls.nameAr.invalid).toBe(true);
  });

  it('emits trimmed create input through onSave', async () => {
    const calls: CategoryModalResult[] = [];
    const fixture = await create(null, async (r) => {
      calls.push(r);
      return 'ok';
    });
    fixture.componentInstance.form.setValue({
      nameAr: '  مشروبات  ',
      nameEn: '  Drinks ',
      sortOrder: 2,
      isPublished: true,
    });
    await fixture.componentInstance.save();
    expect(calls).toEqual([
      {
        input: { nameAr: 'مشروبات', nameEn: 'Drinks', sortOrder: 2, isPublished: true },
        rowVersion: null,
      },
    ]);
  });

  it('rejects a fractional sortOrder instead of truncating it', async () => {
    const calls: CategoryModalResult[] = [];
    const fixture = await create(null, async (r) => {
      calls.push(r);
      return 'ok';
    });
    fixture.componentInstance.form.setValue({ ...valid, sortOrder: 2.9 });
    await fixture.componentInstance.save();
    expect(calls).toEqual([]);
    expect(fixture.componentInstance.form.controls.sortOrder.invalid).toBe(true);
    fixture.componentInstance.form.setValue({ ...valid, sortOrder: 3 });
    await fixture.componentInstance.save();
    expect(calls[0].input.sortOrder).toBe(3);
  });

  it('keeps names between 101 and 120 characters editable', async () => {
    const longName = 'ق'.repeat(115);
    const calls: CategoryModalResult[] = [];
    const fixture = await create(null, async (r) => {
      calls.push(r);
      return 'ok';
    });
    fixture.componentInstance.form.setValue({ ...valid, nameAr: longName });
    await fixture.componentInstance.save();
    expect(calls.length).toBe(1);
    expect(calls[0].input.nameAr).toBe(longName);
  });

  it('prefills the form in edit mode and echoes the rowVersion', async () => {
    const calls: CategoryModalResult[] = [];
    const fixture = await create(
      {
        id: 'c1',
        nameAr: 'مشروبات',
        nameEn: 'Drinks',
        sortOrder: 4,
        isPublished: false,
        rowVersion: 'AAAAAAAAAAA=',
      },
      async (r) => {
        calls.push(r);
        return 'ok';
      },
    );
    const value = fixture.componentInstance.form.getRawValue();
    expect(value).toEqual({
      nameAr: 'مشروبات',
      nameEn: 'Drinks',
      sortOrder: 4,
      isPublished: false,
    });
    await fixture.componentInstance.save();
    expect(calls[0].rowVersion).toBe('AAAAAAAAAAA=');
  });

  it('normalizes an empty English name to null', async () => {
    const calls: CategoryModalResult[] = [];
    const fixture = await create(null, async (r) => {
      calls.push(r);
      return 'ok';
    });
    fixture.componentInstance.form.setValue({ ...valid, nameEn: '   ' });
    await fixture.componentInstance.save();
    expect(calls[0].input.nameEn).toBeNull();
  });

  it('closes only on a confirmed save', async () => {
    const fixture = await create(null);
    const closed: boolean[] = [];
    fixture.componentInstance.closed.subscribe(() => closed.push(true));
    fixture.componentInstance.form.setValue(valid);
    await fixture.componentInstance.save();
    expect(closed).toEqual([true]);
  });

  it('keeps the draft and shows an inline error when saving fails', async () => {
    const fixture = await create(null, async () => 'error');
    const closed: boolean[] = [];
    fixture.componentInstance.closed.subscribe(() => closed.push(true));
    fixture.componentInstance.form.setValue({ ...valid, nameAr: 'حلويات' });
    await fixture.componentInstance.save();
    expect(closed).toEqual([]);
    expect(fixture.componentInstance.saveError()).toContain('جرّب تاني');
    expect(fixture.componentInstance.form.getRawValue().nameAr).toBe('حلويات');
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it('locks dismissal and duplicate submissions while a save is in flight', async () => {
    let resolveSave: ((result: SaveResult) => void) | null = null;
    const calls: CategoryModalResult[] = [];
    const fixture = await create(
      null,
      (r) =>
        new Promise<SaveResult>((resolve) => {
          calls.push(r);
          resolveSave = resolve;
        }),
    );
    const closed: boolean[] = [];
    fixture.componentInstance.closed.subscribe(() => closed.push(true));
    fixture.componentInstance.form.setValue(valid);

    const first = fixture.componentInstance.save();
    expect(fixture.componentInstance.saving()).toBe(true);
    // Duplicate submit and cancel are both ignored mid-flight.
    await fixture.componentInstance.save();
    fixture.componentInstance.cancel();
    expect(calls.length).toBe(1);
    expect(closed).toEqual([]);

    resolveSave!('error');
    await first;
    expect(fixture.componentInstance.saving()).toBe(false);
    expect(fixture.componentInstance.saveError()).toBeTruthy();
    // After the failure settles, cancelling works again.
    fixture.componentInstance.cancel();
    expect(closed).toEqual([true]);
  });

  it('surfaces a stale save with guidance to review and resubmit', async () => {
    const fixture = await create(null, async () => 'stale');
    fixture.componentInstance.form.setValue(valid);
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.saveError()).toContain('اتغيرت من مكان تاني');
  });
});
