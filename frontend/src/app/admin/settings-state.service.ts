import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** DTO matching GET/PUT /api/v1/admin/settings one to one. */
export interface OwnerSettings {
  name: string;
  slug: string;
  publicCode: string;
  primaryColor: string;
  hasLogo: boolean;
  /** Admin read URL for the stored logo (stable across replacement); null when none. */
  logoUrl: string | null;
  rowVersion: string;
  theme?: 'classic' | 'cafe';
  brandLabel?: string | null;
  taglineAr?: string | null;
  taglineEn?: string | null;
  hasHero?: boolean;
  heroUrl?: string | null;
}

export interface PresentationInput {
  theme: 'classic' | 'cafe';
  brandLabel: string;
  taglineAr: string;
  taglineEn: string;
}

export type SettingsSaveResult = 'ok' | 'invalid' | 'stale' | 'error';
export type LogoUploadResult = 'ok' | 'too-large' | 'unsupported' | 'error';
export type LogoDeleteResult = 'ok' | 'error';

/**
 * Signal store for owner restaurant settings (branding + QR studios).
 * Tenant scoping is server-side; color saves use the rowVersion
 * optimistic-concurrency contract (400 invalid, 412 stale).
 *
 * Color saves and logo mutations all replace the same settings DTO, so they
 * are serialized through one queue: request order is response-application
 * order and a delayed earlier response can never overwrite a later mutation.
 */
@Injectable({ providedIn: 'root' })
export class SettingsStateService {
  private readonly http = inject(HttpClient);

  readonly settings = signal<OwnerSettings | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  private mutationQueue: Promise<void> = Promise.resolve();
  private readonly pendingMutations = signal(0);
  /** True while any settings mutation is queued or in flight. */
  readonly mutationBusy = computed(() => this.pendingMutations() > 0);
  /**
   * Set when a mutation succeeded but the follow-up refresh failed, so the
   * local rowVersion is knowingly stale. The next save reconciles first
   * instead of issuing a knowingly stale PUT.
   */
  private needsReconciliation = false;

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      this.settings.set(
        await firstValueFrom(this.http.get<OwnerSettings>('/api/v1/admin/settings')),
      );
      this.needsReconciliation = false;
    } catch {
      this.error.set('فشل تحميل إعدادات المطعم. جرّب إعادة المحاولة.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Saves the brand color; the backend normalizes to lowercase #rrggbb.
   * The concurrency token is reconciled at dispatch: a preceding queued local
   * mutation (logo upload/delete) may have advanced rowVersion, so the freshest
   * local token wins. A genuinely stale row (changed in another session) still
   * surfaces as 412.
   */
  async saveColor(primaryColor: string, rowVersion: string): Promise<SettingsSaveResult> {
    return this.enqueue(async () => {
      if (!(await this.reconcile())) return 'error';
      const token = this.settings()?.rowVersion ?? rowVersion;
      try {
        const saved = await firstValueFrom(
          this.http.put<OwnerSettings>('/api/v1/admin/settings', {
            primaryColor,
            rowVersion: token,
          }),
        );
        this.settings.set(saved);
        return 'ok';
      } catch (e) {
        if (e instanceof HttpErrorResponse) {
          if (e.status === 400) return 'invalid';
          if (e.status === 412) return 'stale';
        }
        return 'error';
      }
    });
  }

  /** Saves theme, brand label and taglines (empty string clears a text). */
  async savePresentation(input: PresentationInput): Promise<SettingsSaveResult> {
    return this.enqueue(async () => {
      if (!(await this.reconcile())) return 'error';
      const token = this.settings()?.rowVersion;
      try {
        const saved = await firstValueFrom(
          this.http.put<OwnerSettings>('/api/v1/admin/settings', { ...input, rowVersion: token }),
        );
        this.settings.set(saved);
        return 'ok';
      } catch (e) {
        if (e instanceof HttpErrorResponse) {
          if (e.status === 400) return 'invalid';
          if (e.status === 412) return 'stale';
        }
        return 'error';
      }
    });
  }

  /** Uploads (or replaces) the separate hero image shown at the top of the public menu. */
  async uploadHero(file: File): Promise<LogoUploadResult> {
    return this.enqueue(async () => {
      const form = new FormData();
      form.append('file', file);
      try {
        const saved = await firstValueFrom(
          this.http.post<OwnerSettings>('/api/v1/admin/settings/hero', form),
        );
        this.settings.set(saved);
        this.needsReconciliation = false;
        return 'ok';
      } catch (e) {
        if (e instanceof HttpErrorResponse) {
          if (e.status === 413) return 'too-large';
          if (e.status === 400 || e.status === 415) return 'unsupported';
        }
        return 'error';
      }
    });
  }

  async deleteHero(): Promise<LogoDeleteResult> {
    return this.enqueue(async () => {
      try {
        await firstValueFrom(this.http.delete('/api/v1/admin/settings/hero'));
        this.settings.set(
          await firstValueFrom(this.http.get<OwnerSettings>('/api/v1/admin/settings')),
        );
        this.needsReconciliation = false;
        return 'ok';
      } catch {
        this.needsReconciliation = true;
        return 'error';
      }
    });
  }

  /**
   * Uploads (or replaces) the restaurant logo. The backend normalizes to
   * webp (max 5 MB) and returns the full settings DTO. Maps the media error
   * contract: 413 too large, 415/400 unsupported or malformed, else generic.
   */
  async uploadLogo(file: File): Promise<LogoUploadResult> {
    return this.enqueue(async () => {
      const form = new FormData();
      form.append('file', file);
      try {
        const saved = await firstValueFrom(
          this.http.post<OwnerSettings>('/api/v1/admin/settings/logo', form),
        );
        this.settings.set(saved);
        this.needsReconciliation = false;
        return 'ok';
      } catch (e) {
        if (e instanceof HttpErrorResponse) {
          if (e.status === 413) return 'too-large';
          if (e.status === 400 || e.status === 415) return 'unsupported';
        }
        return 'error';
      }
    });
  }

  /**
   * Removes the stored logo. The DELETE returns 204 with no body, and the
   * committed row changes rowVersion, so the settings are refreshed from the
   * authoritative GET before resolving; if that refresh fails, the logo is
   * cleared in place and a stale rowVersion surfaces as 412 on the next save.
   */
  async deleteLogo(): Promise<LogoDeleteResult> {
    return this.enqueue(async () => {
      try {
        await firstValueFrom(this.http.delete('/api/v1/admin/settings/logo'));
      } catch {
        return 'error';
      }
      try {
        this.settings.set(
          await firstValueFrom(this.http.get<OwnerSettings>('/api/v1/admin/settings')),
        );
        this.needsReconciliation = false;
      } catch {
        const current = this.settings();
        if (current) this.settings.set({ ...current, hasLogo: false, logoUrl: null });
        // The committed row changed rowVersion and the refresh failed, so the
        // local token is knowingly stale: reconcile before the next save.
        this.needsReconciliation = true;
      }
      return 'ok';
    });
  }

  /**
   * Refreshes authoritative settings when a previous mutation left the local
   * rowVersion knowingly stale. Returns false when the refresh fails; the
   * caller must not issue a mutation with the stale token.
   */
  private async reconcile(): Promise<boolean> {
    if (!this.needsReconciliation) return true;
    try {
      this.settings.set(
        await firstValueFrom(this.http.get<OwnerSettings>('/api/v1/admin/settings')),
      );
      this.needsReconciliation = false;
      return true;
    } catch {
      return false;
    }
  }

  /** Serializes mutations so concurrent color/logo calls cannot interleave. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    this.pendingMutations.update((count) => count + 1);
    const run = this.mutationQueue.then(work);
    this.mutationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run.finally(() => this.pendingMutations.update((count) => count - 1));
  }
}
