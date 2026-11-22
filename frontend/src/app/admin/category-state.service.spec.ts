import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CategoryDto } from './catalog.models';
import { CategoryStateService } from './category-state.service';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

describe('CategoryStateService', () => {
  let store: CategoryStateService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(CategoryStateService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads categories and sorts them by sortOrder', async () => {
    const load = store.load();
    const request = http.expectOne((r) => r.url === '/api/v1/admin/categories');
    expect(request.request.params.get('pageSize')).toBe('100');
    request.flush({
      page: 1,
      pageSize: 100,
      items: [category({ id: 'b', sortOrder: 2 }), category({ id: 'a', sortOrder: 1 })],
    });
    await load;
    expect(store.sorted().map((c) => c.id)).toEqual(['a', 'b']);
    expect(store.isLoading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('loads every page so no category is left uneditable', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      category({ id: 'c' + String(i).padStart(3, '0'), sortOrder: i }),
    );
    const load = store.load();
    const first = http.expectOne((r) => r.url === '/api/v1/admin/categories');
    expect(first.request.params.get('page')).toBe('1');
    first.flush({ page: 1, pageSize: 100, items: page1 });
    await tick();
    const second = http.expectOne((r) => r.url === '/api/v1/admin/categories');
    expect(second.request.params.get('page')).toBe('2');
    second.flush({ page: 2, pageSize: 100, items: [category({ id: 'c100', sortOrder: 100 })] });
    await load;
    expect(store.categories().length).toBe(101);
    expect(store.error()).toBeNull();
  });

  it('sets an Arabic error message when loading fails', async () => {
    const load = store.load();
    http
      .expectOne((r) => r.url === '/api/v1/admin/categories')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await load;
    expect(store.error()).toContain('فشل تحميل الأقسام');
  });

  it('creates a category and appends the server response', async () => {
    const created = category({ id: 'new', rowVersion: 'AAAAAAAAAAE=' });
    const result = store.create({
      nameAr: 'حلويات',
      nameEn: null,
      sortOrder: 3,
      isPublished: true,
    });
    const request = http.expectOne('/api/v1/admin/categories');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).not.toHaveProperty('restaurantId');
    request.flush(created, { status: 201, statusText: 'Created' });
    await expect(result).resolves.toBe('ok');
    expect(store.categories().some((c) => c.id === 'new')).toBe(true);
  });

  it('maps a 400 create response to invalid', async () => {
    const result = store.create({
      nameAr: '',
      nameEn: null,
      sortOrder: 0,
      isPublished: true,
    });
    http
      .expectOne('/api/v1/admin/categories')
      .flush({ title: 'Invalid request.' }, { status: 400, statusText: 'Bad Request' });
    await expect(result).resolves.toBe('invalid');
  });

  it('updates with the rowVersion and stores the returned entity', async () => {
    store.categories.set([category({})]);
    const updated = category({ nameAr: 'مشروبات ساخنة', rowVersion: 'AAAAAAAAAAI=' });
    const result = store.update(
      'c1',
      { nameAr: 'مشروبات ساخنة', nameEn: null, sortOrder: 0, isPublished: true },
      'AAAAAAAAAAA=',
    );
    const request = http.expectOne('/api/v1/admin/categories/c1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.rowVersion).toBe('AAAAAAAAAAA=');
    request.flush(updated);
    await expect(result).resolves.toBe('ok');
    expect(store.categories()[0].nameAr).toBe('مشروبات ساخنة');
    expect(store.categories()[0].rowVersion).toBe('AAAAAAAAAAI=');
  });

  it('maps a 412 update response to stale', async () => {
    store.categories.set([category({})]);
    const result = store.update(
      'c1',
      { nameAr: 'مشروبات', nameEn: null, sortOrder: 0, isPublished: true },
      'AAAAAAAAAAA=',
    );
    http
      .expectOne('/api/v1/admin/categories/c1')
      .flush(
        { title: 'Resource changed. Reload before retrying.' },
        { status: 412, statusText: 'Precondition Failed' },
      );
    await expect(result).resolves.toBe('stale');
  });

  it('deletes with the rowVersion body and removes the category', async () => {
    store.categories.set([category({})]);
    const result = store.remove('c1', 'AAAAAAAAAAA=');
    const request = http.expectOne('/api/v1/admin/categories/c1');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ rowVersion: 'AAAAAAAAAAA=' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await expect(result).resolves.toBe('ok');
    expect(store.categories()).toEqual([]);
  });

  it('maps a 409 delete response to conflict and keeps the category', async () => {
    store.categories.set([category({})]);
    const result = store.remove('c1', 'AAAAAAAAAAA=');
    http
      .expectOne('/api/v1/admin/categories/c1')
      .flush({ title: 'Conflicting write. Retry.' }, { status: 409, statusText: 'Conflict' });
    await expect(result).resolves.toBe('conflict');
    expect(store.categories().length).toBe(1);
  });

  it('counts items of a category across all pages for the conflict dialog', async () => {
    const count = store.itemCount('c1');
    const first = http.expectOne((r) => r.url === '/api/v1/admin/items');
    expect(first.request.params.get('categoryId')).toBe('c1');
    first.flush({ page: 1, pageSize: 100, items: Array.from({ length: 100 }, () => ({})) });
    await tick();
    const second = http.expectOne((r) => r.url === '/api/v1/admin/items');
    expect(second.request.params.get('page')).toBe('2');
    second.flush({ page: 2, pageSize: 100, items: [{}, {}, {}] });
    await expect(count).resolves.toBe(103);
  });

  it('returns an unknown count instead of a fake zero when the lookup fails', async () => {
    const count = store.itemCount('c1');
    http
      .expectOne((r) => r.url === '/api/v1/admin/items')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await expect(count).resolves.toBeNull();
  });

  it('returns an unknown count for a malformed response', async () => {
    const count = store.itemCount('c1');
    http.expectOne((r) => r.url === '/api/v1/admin/items').flush({ unexpected: true });
    await expect(count).resolves.toBeNull();
  });

  it('toggles publication through the same guarded update path', async () => {
    store.categories.set([category({ isPublished: true })]);
    const result = store.togglePublish(store.categories()[0]);
    const request = http.expectOne('/api/v1/admin/categories/c1');
    expect(request.request.body.isPublished).toBe(false);
    request.flush(category({ isPublished: false, rowVersion: 'AAAAAAAAAAI=' }));
    await expect(result).resolves.toBe('ok');
    expect(store.categories()[0].isPublished).toBe(false);
  });

  it('moves a category down by writing each affected row its final position', async () => {
    store.categories.set([
      category({ id: 'a', sortOrder: 0, rowVersion: 'AAAAAAAAAAA=' }),
      category({ id: 'b', sortOrder: 1, rowVersion: 'AAAAAAAAAAE=' }),
    ]);
    const result = store.move('a', 1);

    // Position-indexed: b takes position 0 first, then a takes position 1.
    const first = http.expectOne('/api/v1/admin/categories/b');
    expect(first.request.body.sortOrder).toBe(0);
    first.flush(category({ id: 'b', sortOrder: 0, rowVersion: 'AAAAAAAAAAc=' }));
    await tick();
    const second = http.expectOne('/api/v1/admin/categories/a');
    expect(second.request.body.sortOrder).toBe(1);
    second.flush(category({ id: 'a', sortOrder: 1, rowVersion: 'AAAAAAAAAAU=' }));

    await expect(result).resolves.toBe('ok');
    expect(store.sorted().map((c) => c.id)).toEqual(['b', 'a']);
    expect(store.sorted().map((c) => c.sortOrder)).toEqual([0, 1]);
  });

  it('moves the second of two equal-zero rows up with a single in-range write', async () => {
    store.categories.set([
      category({ id: 'a', sortOrder: 0, rowVersion: 'AAAAAAAAAAA=' }),
      category({ id: 'b', sortOrder: 0, rowVersion: 'AAAAAAAAAAE=' }),
    ]);
    const result = store.move('b', -1);

    // b keeps 0 (its new position); only a moves to position 1. No negative,
    // no out-of-range value is ever sent.
    const write = http.expectOne('/api/v1/admin/categories/a');
    expect(write.request.body.sortOrder).toBe(1);
    write.flush(category({ id: 'a', sortOrder: 1, rowVersion: 'AAAAAAAAAAU=' }));

    await expect(result).resolves.toBe('ok');
    expect(store.sorted().map((c) => c.id)).toEqual(['b', 'a']);
    http.expectNone('/api/v1/admin/categories/b');
  });

  it('normalizes three equal-zero rows during one move', async () => {
    store.categories.set([
      category({ id: 'a', sortOrder: 0, rowVersion: 'AAAAAAAAAAA=' }),
      category({ id: 'b', sortOrder: 0, rowVersion: 'AAAAAAAAAAE=' }),
      category({ id: 'c', sortOrder: 0, rowVersion: 'AAAAAAAAAAI=' }),
    ]);
    const result = store.move('a', 1);

    // Desired order [b, a, c]: a takes position 1, c takes position 2.
    const first = http.expectOne('/api/v1/admin/categories/a');
    expect(first.request.body.sortOrder).toBe(1);
    first.flush(category({ id: 'a', sortOrder: 1, rowVersion: 'AAAAAAAAAAU=' }));
    await tick();
    const second = http.expectOne('/api/v1/admin/categories/c');
    expect(second.request.body.sortOrder).toBe(2);
    second.flush(category({ id: 'c', sortOrder: 2, rowVersion: 'AAAAAAAAAAg=' }));

    await expect(result).resolves.toBe('ok');
    expect(store.sorted().map((c) => c.id)).toEqual(['b', 'a', 'c']);
    expect(store.sorted().map((c) => c.sortOrder)).toEqual([0, 1, 2]);
  });

  it('reconciles with the server and reports partial when a later write fails', async () => {
    store.categories.set([
      category({ id: 'a', sortOrder: 0, rowVersion: 'AAAAAAAAAAA=' }),
      category({ id: 'b', sortOrder: 0, rowVersion: 'AAAAAAAAAAE=' }),
      category({ id: 'c', sortOrder: 0, rowVersion: 'AAAAAAAAAAI=' }),
    ]);
    const result = store.move('a', 1);

    const first = http.expectOne('/api/v1/admin/categories/a');
    first.flush(category({ id: 'a', sortOrder: 1, rowVersion: 'AAAAAAAAAAU=' }));
    await tick();
    http
      .expectOne('/api/v1/admin/categories/c')
      .flush({ title: 'Server error.' }, { status: 500, statusText: 'Server Error' });
    await tick();
    // The failure triggers a reconciliation reload before reporting.
    const reload = http.expectOne(
      (r) => r.url === '/api/v1/admin/categories' && r.method === 'GET',
    );
    reload.flush({
      page: 1,
      pageSize: 100,
      items: [
        category({ id: 'b', sortOrder: 0, rowVersion: 'AAAAAAAAAAE=' }),
        category({ id: 'a', sortOrder: 1, rowVersion: 'AAAAAAAAAAU=' }),
        category({ id: 'c', sortOrder: 0, rowVersion: 'AAAAAAAAAAI=' }),
      ],
    });

    await expect(result).resolves.toBe('partial');
    // The UI now mirrors exactly what the server committed.
    expect(store.sorted().map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('refuses to move past the list boundary without a request', async () => {
    store.categories.set([category({ id: 'a', sortOrder: 0 })]);
    await expect(store.move('a', -1)).resolves.toBe('invalid');
    await expect(store.move('a', 1)).resolves.toBe('invalid');
  });
});
