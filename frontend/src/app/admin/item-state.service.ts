import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ImageUploadResult,
  ItemDeleteResult,
  ItemDto,
  ItemImageDto,
  ItemInput,
  ItemPage,
  ItemSaveResult,
} from './items.models';

/** Defensive bound so a misbehaving backend can never loop the client. */
const MAX_PAGES = 50;

export interface ItemFilters {
  categoryId: string | null;
  search: string;
}

/**
 * Signal store for the owner item catalog. All tenant scoping happens
 * server-side; this store never sends a restaurant id. Mutations use the
 * backend's optimistic-concurrency contract (rowVersion). Search and the
 * category filter are applied server-side (the backend paginates over the
 * filtered set); the sold-out filter is a client-side view over the loaded
 * matches because the backend has no availability filter. The accumulated
 * load fetches every matching page so no item is left uneditable.
 */
@Injectable({ providedIn: 'root' })
export class ItemStateService {
  private readonly http = inject(HttpClient);
  /** Monotonic request id: only the latest load may commit items/error/loading. */
  private generation = 0;

  readonly items = signal<ItemDto[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly filters = signal<ItemFilters>({ categoryId: null, search: '' });
  readonly onlySoldOut = signal(false);

  readonly filtered = computed(() => {
    const list = this.items();
    return this.onlySoldOut() ? list.filter((i) => !i.isAvailable) : list;
  });

  /**
   * Loads ALL pages matching the current filters; a partial list is never
   * shown as complete. Overlapping loads are generation-guarded: a superseded
   * request can never overwrite newer items, install a stale error, or clear
   * the loading flag owned by a newer request.
   */
  async load(filters?: ItemFilters): Promise<void> {
    if (filters) this.filters.set(filters);
    const active = this.filters();
    const generation = ++this.generation;
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const all: ItemDto[] = [];
      let page = 1;
      const pageSize = 100;
      for (;;) {
        const params: Record<string, string | number> = { page, pageSize };
        if (active.categoryId) params['categoryId'] = active.categoryId;
        if (active.search.trim()) params['search'] = active.search.trim();
        const result = await firstValueFrom(
          this.http.get<ItemPage>('/api/v1/admin/items', { params }),
        );
        if (generation !== this.generation) return; // superseded mid-flight
        if (!Array.isArray(result.items)) throw new Error('malformed item page');
        all.push(...result.items);
        if (result.items.length < pageSize) break;
        page++;
        if (page > MAX_PAGES) throw new Error('item pagination exceeded its bound');
      }
      this.items.set(all);
    } catch {
      if (generation !== this.generation) return; // a newer load owns the state now
      this.error.set('فشل تحميل الأطباق. جرّب إعادة المحاولة.');
    } finally {
      if (generation === this.generation) this.isLoading.set(false);
    }
  }

  /**
   * Full unfiltered read of one category used only to place a new item: the
   * append position is max(sortOrder) + 1 over the destination category's
   * REAL sequence, never the filtered view, so filtered creates and gaps
   * after deletion can never collide or insert before existing dishes.
   * Returns null when no safe position exists (read failure, malformed page,
   * or the int32 ceiling) — callers must refuse the create rather than guess.
   */
  async nextPosition(categoryId: string): Promise<number | null> {
    try {
      let max = -1;
      let page = 1;
      const pageSize = 100;
      for (;;) {
        const result = await firstValueFrom(
          this.http.get<ItemPage>('/api/v1/admin/items', {
            params: { page, pageSize, categoryId },
          }),
        );
        if (!Array.isArray(result.items)) return null;
        for (const entry of result.items) if (entry.sortOrder > max) max = entry.sortOrder;
        if (result.items.length < pageSize) break;
        page++;
        if (page > MAX_PAGES) return null;
      }
      if (max >= 2147483647) return null; // int32 ceiling: no safe append position
      return max + 1;
    } catch {
      return null;
    }
  }

  /** Returns the saved DTO on success so callers can chain follow-ups (image upload). */
  async save(
    input: ItemInput,
    existing?: ItemDto,
  ): Promise<{ result: ItemSaveResult; item: ItemDto | null }> {
    const body = existing ? { ...input, rowVersion: existing.rowVersion } : input;
    try {
      const saved = existing
        ? await firstValueFrom(this.http.put<ItemDto>(`/api/v1/admin/items/${existing.id}`, body))
        : await firstValueFrom(this.http.post<ItemDto>('/api/v1/admin/items', body));
      // Reconcile through the ACTIVE filtered query: a blind upsert would
      // show an item that no longer matches the selected category/search,
      // and an edit that moved it out would leave it visible.
      await this.load();
      return { result: 'ok', item: saved };
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        if (e.status === 400) return { result: 'invalid', item: null };
        if (e.status === 412) return { result: 'stale', item: null };
      }
      return { result: 'error', item: null };
    }
  }

  /** Flips availability via the full update contract with the latest rowVersion. */
  async setAvailability(item: ItemDto, isAvailable: boolean): Promise<ItemSaveResult> {
    const { result } = await this.save(
      {
        categoryId: item.categoryId,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        descriptionAr: item.descriptionAr,
        descriptionEn: item.descriptionEn,
        price: item.price,
        currencyCode: item.currencyCode,
        sortOrder: item.sortOrder,
        isPublished: item.isPublished,
        isAvailable,
      },
      item,
    );
    return result;
  }

  async remove(item: ItemDto): Promise<ItemDeleteResult> {
    try {
      await firstValueFrom(
        this.http.delete(`/api/v1/admin/items/${item.id}`, {
          body: { rowVersion: item.rowVersion },
        }),
      );
      this.items.update((list) => list.filter((i) => i.id !== item.id));
      return 'ok';
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 412) return 'stale';
      return 'error';
    }
  }

  /**
   * Uploads one image for an existing item. The backend normalizes to webp;
   * there is no image read-back endpoint yet, so the returned metadata is
   * used only for the in-session preview. Maps the media error contract:
   * 413 too large, 415/400 unsupported or malformed, 503 storage down.
   */
  async uploadImage(itemId: string, file: File): Promise<ImageUploadResult> {
    const form = new FormData();
    form.append('file', file);
    try {
      await firstValueFrom(
        this.http.post<ItemImageDto>(`/api/v1/admin/items/${itemId}/images`, form),
      );
      return 'ok';
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        if (e.status === 413) return 'too-large';
        if (e.status === 400 || e.status === 415) return 'unsupported';
      }
      return 'error';
    }
  }
}
