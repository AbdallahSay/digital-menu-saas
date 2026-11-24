import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface LeadStatus {
  open: boolean;
  noticeVersion: string | null;
  retentionDays: number | null;
  controllerName: string | null;
  contactChannel: string | null;
}

export interface LeadPayload {
  contactName: string;
  businessName: string;
  phone: string;
  notes: string;
  consent: boolean;
  noticeVersion: string;
  website: string;
}

export type LeadResult = 'created' | 'invalid' | 'rate' | 'closed' | 'unconfirmed' | 'error';

/** Browser-only client for the public lead intake. Success is exactly the documented 201. */
@Injectable({ providedIn: 'root' })
export class LeadIntakeService {
  private readonly http = inject(HttpClient);

  /** Null when the status could not be read: callers must treat that as closed. */
  async status(): Promise<LeadStatus | null> {
    try {
      const s = await firstValueFrom(this.http.get<LeadStatus>('/api/v1/leads/status'));
      if (
        s?.open === true &&
        typeof s.noticeVersion === 'string' &&
        s.noticeVersion &&
        typeof s.retentionDays === 'number' &&
        typeof s.controllerName === 'string' &&
        s.controllerName &&
        typeof s.contactChannel === 'string' &&
        s.contactChannel
      )
        return s;
      return {
        open: false,
        noticeVersion: null,
        retentionDays: null,
        controllerName: null,
        contactChannel: null,
      };
    } catch {
      return null;
    }
  }

  async submit(payload: LeadPayload): Promise<LeadResult> {
    try {
      await firstValueFrom(this.http.get('/api/v1/auth/csrf'));
      const response = await firstValueFrom(
        this.http.post('/api/v1/auth/leads', payload, { observe: 'response' }),
      );
      return response.status === 201 ? 'created' : 'unconfirmed';
    } catch (e) {
      const status = e instanceof HttpErrorResponse ? e.status : 0;
      if (status === 400 || status === 415) return 'invalid';
      if (status === 429) return 'rate';
      if (status === 503) return 'closed';
      return 'error';
    }
  }
}
