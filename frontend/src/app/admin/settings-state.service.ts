import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** DTO matching GET/PUT /api/v1/admin/settings one to one. */
export interface OwnerSettings {
  name: string;
  slug: string;
  publicCode: string;
  primaryColor: string;
  hasLogo: boolean;
  rowVersion: string;
}

export type SettingsSaveResult = 'ok' | 'invalid' | 'stale' | 'error';

/**
 * Signal store for owner restaurant settings (branding + QR studios).
 * Tenant scoping is server-side; color saves use the rowVersion
 * optimistic-concurrency contract (400 invalid, 412 stale).
 */
@Injectable({ providedIn: 'root' })
export class SettingsStateService {
  private readonly http = inject(HttpClient);

  readonly settings = signal<OwnerSettings | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      this.settings.set(
        await firstValueFrom(this.http.get<OwnerSettings>('/api/v1/admin/settings')),
      );
    } catch {
      this.error.set('فشل تحميل إعدادات المطعم. جرّب إعادة المحاولة.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Saves the brand color; the backend normalizes to lowercase #rrggbb. */
  async saveColor(primaryColor: string, rowVersion: string): Promise<SettingsSaveResult> {
    try {
      const saved = await firstValueFrom(
        this.http.put<OwnerSettings>('/api/v1/admin/settings', { primaryColor, rowVersion }),
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
  }
}
