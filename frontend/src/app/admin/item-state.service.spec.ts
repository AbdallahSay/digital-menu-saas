import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ItemStateService } from './item-state.service';
import { ItemDto, ItemInput } from './items.models';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

function input(partial: Partial<ItemInput> = {}): ItemInput {
  return {
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
    ...partial,
  };
}

describe('ItemStateService', () => {
  let store: ItemStateService;
  let http: HttpTestingController;

  async function loadWith(
    filters: { categoryId: string | null; search: string } | undefined,
    items: ItemDto[],
  ): Promise<void> {
    const load = filters ? store.load(filters) : store.load();
    http
      .expectOne((r) => r.url === '/api/v1/admin/items' && r.method === 'GET')
      .flush({
        page: 1,
        pageSize: 100,
        items,
      });
    await load;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(ItemStateService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads every matching page so no item is left uneditable', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      item({ id: 'i' + String(i).padStart(3, '0'), sortOrder: i }),
    );
    const load = store.load();
    const first = http.expectOne((r) => r.url === '/api/v1/admin/items');
    first.flush({ page: 1, pageSize: 100, items: page1 });
    await tick();
    const second = http.expectOne((r) => r.url === '/api/v1/admin/items');
    expect(second.request.params.get('page')).toBe('2');
    second.flush({ page: 2, pageSize: 100, items: [item({ id: 'i100', sortOrder: 100 })] });
    await load;
    expect(store.items().length).toBe(101);
    expect(store.error()).toBeNull();
  });

  it('sends the category and search filters to the server', async () => {
    const load = store.load({ categoryId: 'c9', search: '  برجر  ' });
    const request = http.expectOne((r) => r.url === '/api/v1/admin/items');
    expect(request.request.params.get('categoryId')).toBe('c9');
    expect(request.request.params.get('search')).toBe('برجر');
    request.flush({ page: 1, pageSize: 100, items: [] });
    await load;
    expect(store.filters()).toEqual({ categoryId: 'c9', search: '  برجر  ' });
  });

  it('rejects a malformed page without an items array', async () => {
    const load = store.load();
    http.expectOne((r) => r.url === '/api/v1/admin/items').flush({ page: 1, pageSize: 100 });
    await load;
    expect(store.error()).not.toBeNull();
    expect(store.items()).toEqual([]);
  });

  it('fails the load instead of looping when pagination exceeds its bound', async () => {
    const full = Array.from({ length: 100 }, (_, i) => item({ id: 'x' + i, sortOrder: i }));
    const load = store.load();
    for (let page = 1; page <= 50; page++) {
      http
        .expectOne((r) => r.url === '/api/v1/admin/items')
        .flush({
          page,
          pageSize: 100,
          items: full,
        });
      await tick();
    }
    await load;
    expect(store.error()).not.toBeNull();
  });

  it('filters sold-out items client-side over the loaded matches', async () => {
    const load = store.load();
    http
      .expectOne((r) => r.url === '/api/v1/admin/items')
      .flush({
        page: 1,
        pageSize: 100,
        items: [item({ id: 'a', isAvailable: true }), item({ id: 'b', isAvailable: false })],
      });
    await load;
    expect(store.filtered().map((i) => i.id)).toEqual(['a', 'b']);
    store.onlySoldOut.set(true);
    expect(store.filtered().map((i) => i.id)).toEqual(['b']);
  });

  it('creates an item, returns the saved DTO, and reconciles through the active filter', async () => {
    await loadWith({ categoryId: 'c1', search: 'كبدة' }, []);
    const saved = item({ id: 'new-1' });
    const promise = store.save(input());
    const request = http.expectOne('/api/v1/admin/items');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.rowVersion).toBeUndefined();
    request.flush(saved);
    await tick();
    // The list is rebuilt from the ACTIVE filtered query, not a blind upsert,
    // so an item outside the current filter never appears in it.
    const reconcile = http.expectOne((r) => r.url === '/api/v1/admin/items');
    expect(reconcile.request.method).toBe('GET');
    expect(reconcile.request.params.get('categoryId')).toBe('c1');
    expect(reconcile.request.params.get('search')).toBe('كبدة');
    reconcile.flush({ page: 1, pageSize: 100, items: [saved] });
    const { result, item: returned } = await promise;
    expect(result).toBe('ok');
    expect(returned?.id).toBe('new-1');
    expect(store.items().map((i) => i.id)).toEqual(['new-1']);
  });

  it('updates an item with its rowVersion and reloads the list', async () => {
    const existing = item({ id: 'i1', price: 85 });
    await loadWith(undefined, [existing]);
    const promise = store.save(input({ price: 90 }), existing);
    const request = http.expectOne('/api/v1/admin/items/i1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.rowVersion).toBe(existing.rowVersion);
    request.flush(item({ id: 'i1', price: 90 }));
    await tick();
    http
      .expectOne((r) => r.url === '/api/v1/admin/items' && r.method === 'GET')
      .flush({
        page: 1,
        pageSize: 100,
        items: [item({ id: 'i1', price: 90 })],
      });
    const { result } = await promise;
    expect(result).toBe('ok');
    expect(store.items()[0].price).toBe(90);
  });

  it('drops an item from the visible list when an edit moves it out of the active filter', async () => {
    const existing = item({ id: 'i1', categoryId: 'c1' });
    await loadWith({ categoryId: 'c1', search: '' }, [existing]);
    const promise = store.save(input({ categoryId: 'c2' }), existing);
    http.expectOne('/api/v1/admin/items/i1').flush(item({ id: 'i1', categoryId: 'c2' }));
    await tick();
    // Server truth: the item no longer belongs to the filtered category.
    http
      .expectOne((r) => r.url === '/api/v1/admin/items' && r.method === 'GET')
      .flush({ page: 1, pageSize: 100, items: [] });
    const { result } = await promise;
    expect(result).toBe('ok');
    expect(store.items()).toEqual([]);
  });

  it('maps 400 to invalid and 412 to stale on save', async () => {
    const bad = store.save(input());
    http.expectOne('/api/v1/admin/items').flush({}, { status: 400, statusText: 'Bad Request' });
    expect((await bad).result).toBe('invalid');
    const stale = store.save(input(), item({}));
    http
      .expectOne((r) => r.url === '/api/v1/admin/items/i1')
      .flush({}, { status: 412, statusText: 'Precondition Failed' });
    expect((await stale).result).toBe('stale');
  });

  it('toggles availability through the full update contract', async () => {
    const existing = item({ id: 'i7', isAvailable: true });
    const promise = store.setAvailability(existing, false);
    const request = http.expectOne('/api/v1/admin/items/i7');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.isAvailable).toBe(false);
    expect(request.request.body.nameAr).toBe(existing.nameAr);
    expect(request.request.body.rowVersion).toBe(existing.rowVersion);
    request.flush(item({ id: 'i7', isAvailable: false }));
    await tick();
    http
      .expectOne((r) => r.url === '/api/v1/admin/items' && r.method === 'GET')
      .flush({
        page: 1,
        pageSize: 100,
        items: [item({ id: 'i7', isAvailable: false })],
      });
    expect(await promise).toBe('ok');
    expect(store.items().find((i) => i.id === 'i7')?.isAvailable).toBe(false);
  });

  it('never lets a superseded load overwrite newer state', async () => {
    const stale = store.load({ categoryId: null, search: 'قديم' });
    const fresh = store.load({ categoryId: null, search: 'جديد' });
    expect(store.isLoading()).toBe(true);
    // The newer request resolves first and commits.
    http
      .expectOne((r) => r.params.get('search') === 'جديد')
      .flush({
        page: 1,
        pageSize: 100,
        items: [item({ id: 'fresh' })],
      });
    await fresh;
    expect(store.items().map((i) => i.id)).toEqual(['fresh']);
    expect(store.isLoading()).toBe(false);
    // The superseded request resolves last and must commit nothing.
    http
      .expectOne((r) => r.params.get('search') === 'قديم')
      .flush({
        page: 1,
        pageSize: 100,
        items: [item({ id: 'stale' })],
      });
    await stale;
    expect(store.items().map((i) => i.id)).toEqual(['fresh']);
    expect(store.error()).toBeNull();
    expect(store.isLoading()).toBe(false);
  });

  it('never lets a superseded load install a stale error over a newer success', async () => {
    const stale = store.load({ categoryId: null, search: 'قديم' });
    const fresh = store.load({ categoryId: null, search: 'جديد' });
    http
      .expectOne((r) => r.params.get('search') === 'جديد')
      .flush({
        page: 1,
        pageSize: 100,
        items: [item({ id: 'fresh' })],
      });
    await fresh;
    http
      .expectOne((r) => r.params.get('search') === 'قديم')
      .flush({}, { status: 500, statusText: 'Server Error' });
    await stale;
    expect(store.items().map((i) => i.id)).toEqual(['fresh']);
    expect(store.error()).toBeNull();
  });

  it('places a new item after the destination category max sortOrder', async () => {
    const promise = store.nextPosition('c1');
    http
      .expectOne((r) => r.url === '/api/v1/admin/items')
      .flush({
        page: 1,
        pageSize: 100,
        // Gaps after deletion never collide: the position follows the max.
        items: [item({ id: 'a', sortOrder: 0 }), item({ id: 'b', sortOrder: 4 })],
      });
    expect(await promise).toBe(5);
  });

  it('places the first item of an empty category at position 0', async () => {
    const promise = store.nextPosition('c9');
    const request = http.expectOne((r) => r.url === '/api/v1/admin/items');
    expect(request.request.params.get('categoryId')).toBe('c9');
    request.flush({ page: 1, pageSize: 100, items: [] });
    expect(await promise).toBe(0);
  });

  it('accumulates every category page when computing the position', async () => {
    const full = Array.from({ length: 100 }, (_, i) => item({ id: 'x' + i, sortOrder: i }));
    const promise = store.nextPosition('c1');
    http
      .expectOne((r) => r.url === '/api/v1/admin/items')
      .flush({
        page: 1,
        pageSize: 100,
        items: full,
      });
    await tick();
    http
      .expectOne((r) => r.url === '/api/v1/admin/items')
      .flush({
        page: 2,
        pageSize: 100,
        items: [item({ id: 'last', sortOrder: 120 })],
      });
    expect(await promise).toBe(121);
  });

  it('refuses the create when no safe position exists', async () => {
    const overflow = store.nextPosition('c1');
    http
      .expectOne((r) => r.url === '/api/v1/admin/items')
      .flush({
        page: 1,
        pageSize: 100,
        items: [item({ id: 'max', sortOrder: 2147483647 })],
      });
    expect(await overflow).toBeNull();
    const malformed = store.nextPosition('c1');
    http.expectOne((r) => r.url === '/api/v1/admin/items').flush({ page: 1, pageSize: 100 });
    expect(await malformed).toBeNull();
    const failed = store.nextPosition('c1');
    http
      .expectOne((r) => r.url === '/api/v1/admin/items')
      .flush({}, { status: 500, statusText: '' });
    expect(await failed).toBeNull();
  });

  it('deletes an item with its rowVersion and removes it from the list', async () => {
    const existing = item({ id: 'i3' });
    const load = store.load();
    http
      .expectOne((r) => r.url === '/api/v1/admin/items')
      .flush({
        page: 1,
        pageSize: 100,
        items: [existing],
      });
    await load;
    const promise = store.remove(existing);
    const request = http.expectOne('/api/v1/admin/items/i3');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ rowVersion: existing.rowVersion });
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(await promise).toBe('ok');
    expect(store.items()).toEqual([]);
  });

  it('maps 412 to stale on delete', async () => {
    const promise = store.remove(item({ id: 'i4' }));
    http
      .expectOne((r) => r.url === '/api/v1/admin/items/i4')
      .flush({}, { status: 412, statusText: 'Precondition Failed' });
    expect(await promise).toBe('stale');
  });

  it('uploads an image as a single multipart file field', async () => {
    const promise = store.uploadImage('i1', new File(['x'], 'dish.png', { type: 'image/png' }));
    const request = http.expectOne('/api/v1/admin/items/i1/images');
    expect(request.request.method).toBe('POST');
    expect(request.request.body instanceof FormData).toBe(true);
    expect((request.request.body as FormData).getAll('file').length).toBe(1);
    request.flush(
      {
        id: 'img1',
        menuItemId: 'i1',
        width: 800,
        height: 800,
        contentType: 'image/webp',
        sortOrder: 0,
      },
      { status: 201, statusText: 'Created' },
    );
    expect(await promise).toBe('ok');
  });

  it('maps media upload errors: 413 too large, 415/400 unsupported, 503 generic', async () => {
    const file = new File(['x'], 'dish.png', { type: 'image/png' });
    const tooLarge = store.uploadImage('i1', file);
    http.expectOne('/api/v1/admin/items/i1/images').flush({}, { status: 413, statusText: '' });
    expect(await tooLarge).toBe('too-large');
    const unsupported = store.uploadImage('i1', file);
    http.expectOne('/api/v1/admin/items/i1/images').flush({}, { status: 415, statusText: '' });
    expect(await unsupported).toBe('unsupported');
    const down = store.uploadImage('i1', file);
    http.expectOne('/api/v1/admin/items/i1/images').flush({}, { status: 503, statusText: '' });
    expect(await down).toBe('error');
  });
});
