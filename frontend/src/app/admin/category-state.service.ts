import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CategoryDto,
  CategoryInput,
  CategoryPage,
  DeleteResult,
  SaveResult,
} from './catalog.models';

/** Defensive bound so a misbehaving backend can never loop the client. */
const MAX_PAGES = 50;

/**
 * Signal store for the owner category catalog. All tenant scoping happens
 * server-side; this store never sends a restaurant id. Mutations use the
 * backend's optimistic-concurrency contract (rowVersion). Ordering assigns
 * position-indexed sortOrder values so duplicate create-default zeros and
 * out-of-range values can never be produced, and any failed multi-write
 * sequence reconciles with the server before reporting.
 */
@Injectable({ providedIn: 'root' })
export class CategoryStateService {
  private readonly http = inject(HttpClient);

  readonly categories = signal<CategoryDto[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly sorted = computed(() =>
    [...this.categories()].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
  );

  /** Loads ALL category pages; a partial list is never shown as complete. */
  async load(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const all: CategoryDto[] = [];
      let page = 1;
      const pageSize = 100;
      for (;;) {
        const result = await firstValueFrom(
          this.http.get<CategoryPage>('/api/v1/admin/categories', {
            params: { page, pageSize },
          }),
        );
        if (!Array.isArray(result.items)) throw new Error('malformed category page');
        all.push(...result.items);
        if (result.items.length < pageSize) break;
        page++;
        if (page > MAX_PAGES) throw new Error('category pagination exceeded its bound');
      }
      this.categories.set(all);
    } catch {
      this.error.set('فشل تحميل الأقسام. جرّب إعادة المحاولة.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async create(input: CategoryInput): Promise<SaveResult> {
    try {
      const created = await firstValueFrom(
        this.http.post<CategoryDto>('/api/v1/admin/categories', input),
      );
      this.categories.update((list) => [...list, created]);
      return 'ok';
    } catch (error) {
      return this.saveError(error);
    }
  }

  async update(id: string, input: CategoryInput, rowVersion: string): Promise<SaveResult> {
    try {
      const updated = await firstValueFrom(
        this.http.put<CategoryDto>('/api/v1/admin/categories/' + encodeURIComponent(id), {
          ...input,
          rowVersion,
        }),
      );
      this.categories.update((list) => list.map((c) => (c.id === id ? updated : c)));
      return 'ok';
    } catch (error) {
      return this.saveError(error);
    }
  }

  async remove(id: string, rowVersion: string): Promise<DeleteResult> {
    try {
      await firstValueFrom(
        this.http.delete('/api/v1/admin/categories/' + encodeURIComponent(id), {
          body: { rowVersion },
        }),
      );
      this.categories.update((list) => list.filter((c) => c.id !== id));
      return 'ok';
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 409) return 'conflict';
        if (error.status === 412) return 'stale';
      }
      return 'error';
    }
  }

  /**
   * Counts a category's remaining items (published or not — the backend
   * blocks deletion while ANY non-deleted item references the category,
   * and a 409 can also be a transient SQL conflict). Paginates to a real
   * total; returns null when the count is unknown so the UI says so
   * instead of claiming zero.
   */
  async itemCount(id: string): Promise<number | null> {
    try {
      let total = 0;
      let page = 1;
      const pageSize = 100;
      for (;;) {
        const result = await firstValueFrom(
          this.http.get<{ items?: unknown[] }>('/api/v1/admin/items', {
            params: { page, pageSize, categoryId: id },
          }),
        );
        if (!Array.isArray(result.items)) return null;
        total += result.items.length;
        if (result.items.length < pageSize) return total;
        page++;
        if (page > MAX_PAGES) return null;
      }
    } catch {
      return null;
    }
  }

  async togglePublish(category: CategoryDto): Promise<SaveResult> {
    return this.update(
      category.id,
      {
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        sortOrder: category.sortOrder,
        isPublished: !category.isPublished,
      },
      category.rowVersion,
    );
  }

  /**
   * Moves a category one step by assigning every affected row its final
   * position as sortOrder. Values stay within [0, n-1] — never negative,
   * never out of range — duplicate create-default zeros converge to
   * distinct values, and a one-step move between already-normalized rows
   * touches only those two rows. On any failure the list reloads so the UI
   * always matches the server, and a partially committed sequence reports
   * 'partial' instead of faking success or silence.
   */
  async move(id: string, direction: -1 | 1): Promise<SaveResult> {
    const ordered = this.sorted();
    const index = ordered.findIndex((c) => c.id === id);
    const neighbourIndex = index + direction;
    if (index < 0 || !ordered[neighbourIndex]) return 'invalid';
    const desired = [...ordered];
    [desired[index], desired[neighbourIndex]] = [desired[neighbourIndex], desired[index]];
    const writes = desired
      .map((category, position) => ({ category, position }))
      .filter(({ category, position }) => category.sortOrder !== position);
    let committed = 0;
    for (const { category, position } of writes) {
      const result = await this.update(
        category.id,
        {
          nameAr: category.nameAr,
          nameEn: category.nameEn,
          sortOrder: position,
          isPublished: category.isPublished,
        },
        category.rowVersion,
      );
      if (result !== 'ok') {
        // Reconcile with the server before reporting so the UI never shows
        // an order the backend does not have.
        await this.load();
        return committed > 0 ? 'partial' : result;
      }
      committed++;
    }
    return 'ok';
  }

  private saveError(error: unknown): SaveResult {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 400) return 'invalid';
      if (error.status === 412) return 'stale';
    }
    return 'error';
  }
}
