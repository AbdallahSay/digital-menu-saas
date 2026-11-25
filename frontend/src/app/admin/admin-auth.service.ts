import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AdminRole = 'Owner' | 'PlatformAdmin';

export interface AdminSession {
  role: AdminRole;
  restaurants: { name: string }[];
}

export type LoginResult = 'ok' | 'invalid' | 'rate-limited' | 'error';

export type LogoutResult = 'ok' | 'error';

interface MeResponse {
  role: AdminRole;
  restaurants: { name: string }[];
}

/**
 * Cookie-session authentication for the admin area. Tokens live only in
 * HttpOnly cookies; this service never stores credentials client-side.
 * Concurrent session checks are coalesced into one in-flight request.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private pendingSession: Promise<AdminSession | null> | null = null;

  readonly session = signal<AdminSession | null>(null);
  readonly sessionChecked = signal(false);

  /** Establishes the antiforgery cookie/header pair; required before any POST. */
  async ensureCsrf(): Promise<void> {
    await firstValueFrom(this.http.get<{ headerName: string }>('/api/v1/auth/csrf'));
  }

  /**
   * Authenticates, then refreshes the CSRF token so it binds to the new
   * authenticated principal, then loads the profile. A 401 means "invalid
   * credentials" by contract and covers unknown accounts, bad passwords,
   * lockouts and suspended tenants alike; it never reveals which.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    try {
      await firstValueFrom(this.http.post('/api/v1/auth/login', { email, password }));
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401) return 'invalid';
        if (error.status === 429) return 'rate-limited';
        // 409 means a session is already active (e.g. an earlier attempt
        // succeeded but its response was lost). Never resubmit the
        // credentials: refresh the token and recover via the profile.
        if (error.status === 409) {
          const existing = await this.recoverExistingSession();
          return existing ? 'ok' : 'error';
        }
      }
      return 'error';
    }
    const session = await this.recoverExistingSession();
    return session ? 'ok' : 'error';
  }

  /**
   * Refreshes the CSRF token (binding it to the current principal) and loads
   * the profile. Used after login and to recover from a 409 without
   * resubmitting credentials.
   */
  private async recoverExistingSession(): Promise<AdminSession | null> {
    try {
      await this.ensureCsrf();
    } catch {
      return null;
    }
    return this.loadSession(true);
  }

  /** Loads the profile fresh from the server; concurrent callers share one request. */
  loadSession(refresh = false): Promise<AdminSession | null> {
    if (!refresh && this.pendingSession) return this.pendingSession;
    const pending = (async () => {
      try {
        const me = await firstValueFrom(this.http.get<AdminSession>('/api/v1/auth/me'));
        const session: AdminSession = {
          role: me.role,
          restaurants: Array.isArray(me.restaurants) ? me.restaurants : [],
        };
        this.session.set(session);
        return session;
      } catch {
        this.session.set(null);
        return null;
      } finally {
        this.sessionChecked.set(true);
      }
    })();
    this.pendingSession = pending;
    void pending.finally(() => {
      if (this.pendingSession === pending) this.pendingSession = null;
    });
    return pending;
  }

  /**
   * Signs out without ever faking it. The local session is cleared only when
   * the server confirmed the logout (204) or reported the session already
   * gone (401). A missing/stale CSRF token triggers one safe token refresh
   * and retry. Any other failure leaves the local session untouched and
   * returns 'error' so the UI can offer a retry instead of presenting a
   * false signed-out state while the HttpOnly cookie is still valid.
   */
  async logout(): Promise<LogoutResult> {
    const attempt = async (): Promise<'ok' | 'retryable-400' | 'already-out' | 'error'> => {
      try {
        // Only 204 confirms the session is gone; any other 2xx is unexpected
        // and must not clear local state (the retry then settles via 401).
        const response = await firstValueFrom(
          this.http.post('/api/v1/auth/logout', {}, { observe: 'response' }),
        );
        return response.status === 204 ? 'ok' : 'error';
      } catch (error) {
        if (error instanceof HttpErrorResponse) {
          if (error.status === 401) return 'already-out';
          if (error.status === 400) return 'retryable-400';
        }
        return 'error';
      }
    };
    let result = await attempt();
    if (result === 'retryable-400') {
      try {
        await this.ensureCsrf();
      } catch {
        return 'error';
      }
      result = await attempt();
    }
    if (result === 'ok' || result === 'already-out') {
      this.session.set(null);
      return 'ok';
    }
    return 'error';
  }
}
