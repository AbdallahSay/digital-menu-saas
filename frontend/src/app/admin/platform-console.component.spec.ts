import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { SLUG_PATTERN, describePlatformError } from './platform-console.component';

describe('platform console helpers', () => {
  it('accepts only lowercase hyphenated slugs', () => {
    expect(SLUG_PATTERN.test('my-cafe-2')).toBe(true);
    for (const bad of ['My-Cafe', 'a_b', '-a', 'a-', 'a--b', 'مطعم', '']) {
      expect(SLUG_PATTERN.test(bad)).toBe(false);
    }
  });
  it('maps API failures to safe owner-facing messages', () => {
    const msg = (status: number) => describePlatformError(new HttpErrorResponse({ status }));
    expect(msg(409)).toContain('مستخدم');
    expect(msg(412)).toContain('حدّث');
    expect(msg(503)).toContain('مفيش حساب اتعمل');
    expect(msg(500)).toContain('حصل خطأ');
    expect(describePlatformError(new Error('boom'))).toContain('حصل خطأ');
  });
});
