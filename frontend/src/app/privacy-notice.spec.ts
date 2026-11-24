import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRIVACY_NOTICE_SHA256 } from './leads';

describe('privacy notice content pin', () => {
  it('matches the template text, so wording changes need an explicit new approval hash', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/privacy.ts'), 'utf8');
    const start = src.indexOf('template: `') + 'template: `'.length;
    const end = src.indexOf('`,', start);
    expect(start).toBeGreaterThan('template: `'.length);
    const sha = createHash('sha256').update(src.slice(start, end), 'utf8').digest('hex');
    expect(PRIVACY_NOTICE_SHA256).toBe(sha);
  });
});
