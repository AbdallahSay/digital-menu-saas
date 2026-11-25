import { DOCUMENT } from '@angular/common';
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function readCookie(document: Document, name: string): string | null {
  const prefix = name + '=';
  for (const part of (document.cookie ?? '').split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

/**
 * Attaches the antiforgery token cookie as the X-XSRF-TOKEN header on mutating
 * API calls, mirroring the backend contract (F03). Read-only and non-API
 * requests pass through untouched.
 */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  if (SAFE_METHODS.has(req.method) || !req.url.startsWith('/api/')) {
    return next(req);
  }
  const token = readCookie(inject(DOCUMENT), 'XSRF-TOKEN');
  return token ? next(req.clone({ setHeaders: { 'X-XSRF-TOKEN': token } })) : next(req);
};
