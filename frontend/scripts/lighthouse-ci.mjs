import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
mkdirSync('.lighthouseci', { recursive: true });
const results = [];
for (let i = 0; i < 3; i++) {
  const path = '.lighthouseci/run-' + i;
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/lighthouse/cli/index.js',
      'http://localhost:4000/r/demo',
      '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
      '--only-categories=performance,accessibility,best-practices,seo',
      '--output=json',
      '--output=html',
      '--output-path=' + path,
      '--quiet',
    ],
    { stdio: 'inherit', env: process.env },
  );
  assert.equal(result.status, 0, 'Lighthouse execution failed');
  const report = JSON.parse(readFileSync(path + '.report.json', 'utf8'));
  results.push({
    performance: report.categories.performance.score,
    accessibility: report.categories.accessibility.score,
    seo: report.categories.seo.score,
    bestPractices: report.categories['best-practices'].score,
    lcpMs: report.audits['largest-contentful-paint'].numericValue,
    cls: report.audits['cumulative-layout-shift'].numericValue,
    tbtMs: report.audits['total-blocking-time'].numericValue,
  });
}
const summary = {
  profile:
    'Lighthouse default mobile simulated throttling; localhost production Angular build; 3 runs',
  results,
};
writeFileSync('.lighthouseci/summary.json', JSON.stringify(summary, null, 2));
console.log(summary);
const median = (key) => results.map((r) => r[key]).sort((a, b) => a - b)[1];
assert.ok(median('performance') >= 0.9, 'Median performance below 90');
assert.ok(median('accessibility') >= 0.9, 'Median accessibility below 90');
assert.ok(median('seo') >= 0.9, 'Median SEO below 90');
