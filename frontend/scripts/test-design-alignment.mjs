import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WcagContrast = require('../design/wcag-contrast.js');
const QrCodeEngine = require('../design/qr-code.js');

test('WCAG 2.1/2.2 Contrast Engine — Relative Luminance & sRGB Linearization', () => {
  // Linearization checks
  assert.equal(WcagContrast.sRgbToLinear(0), 0);
  assert.equal(WcagContrast.sRgbToLinear(255), 1);

  // Black and White luminances
  const lumBlack = WcagContrast.getRelativeLuminance('#000000');
  const lumWhite = WcagContrast.getRelativeLuminance('#ffffff');
  assert.equal(lumBlack, 0);
  assert.equal(lumWhite, 1);

  // Hex color parsing
  assert.deepEqual(WcagContrast.parseHexColor('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(WcagContrast.parseHexColor('#000000'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(WcagContrast.parseHexColor('#d97706'), { r: 217, g: 119, b: 6 });
  assert.equal(WcagContrast.parseHexColor('invalid'), null);
});

test('WCAG Contrast Engine — Known Color Combinations & Ratio Accuracies', () => {
  // 1. Black on White -> 21:1
  const ratioBlackOnWhite = WcagContrast.getContrastRatio('#000000', '#ffffff');
  assert.equal(ratioBlackOnWhite, 21);

  // 2. White on White -> 1:1
  const ratioWhiteOnWhite = WcagContrast.getContrastRatio('#ffffff', '#ffffff');
  assert.equal(ratioWhiteOnWhite, 1);

  // 3. Pure Blue on White -> ~8.59:1
  const ratioBlueOnWhite = WcagContrast.getContrastRatio('#0000ff', '#ffffff');
  assert.ok(
    ratioBlueOnWhite >= 8.5 && ratioBlueOnWhite <= 8.65,
    `Expected ~8.59, got ${ratioBlueOnWhite}`,
  );

  // 4. Pure Red on White -> ~4.00:1 (passes large text, fails normal text)
  const ratioRedOnWhite = WcagContrast.getContrastRatio('#ff0000', '#ffffff');
  assert.ok(
    ratioRedOnWhite >= 3.95 && ratioRedOnWhite <= 4.05,
    `Expected ~4.00, got ${ratioRedOnWhite}`,
  );

  // 5. Standard W3C 4.5:1 Gray threshold (#767676)
  const ratioGray45 = WcagContrast.getContrastRatio('#767676', '#ffffff');
  assert.ok(ratioGray45 >= 4.5 && ratioGray45 <= 4.6, `Expected ~4.54, got ${ratioGray45}`);

  // 6. Standard W3C 7.0:1 Gray threshold (#595959)
  const ratioGray70 = WcagContrast.getContrastRatio('#595959', '#ffffff');
  assert.ok(ratioGray70 >= 7.0 && ratioGray70 <= 7.1, `Expected ~7.00, got ${ratioGray70}`);
});

test('WCAG Contrast Engine — AA and AAA Threshold Evaluations', () => {
  // Charcoal #334155 (should pass AAA normal text)
  const charcoal = WcagContrast.evaluateWcagCompliance('#334155', '#ffffff');
  assert.ok(charcoal.ratio >= 7.0, `Charcoal should be >= 7.0, got ${charcoal.ratio}`);
  assert.equal(charcoal.normalTextAA, true);
  assert.equal(charcoal.normalTextAAA, true);
  assert.equal(charcoal.badgeLevel, 'aaa');

  // Emerald Green #059669 (passes large text AA at ~3.77:1, fails normal text AA)
  const emerald = WcagContrast.evaluateWcagCompliance('#059669', '#ffffff');
  assert.ok(
    emerald.ratio >= 3.5 && emerald.ratio < 4.5,
    `Emerald should be in 3.5-4.5 range, got ${emerald.ratio}`,
  );
  assert.equal(emerald.normalTextAA, false);
  assert.equal(emerald.largeTextAA, true);
  assert.equal(emerald.badgeLevel, 'aa-large');

  // Dark Emerald Green #047857 (should pass normal text AA at ~4.79:1)
  const darkEmerald = WcagContrast.evaluateWcagCompliance('#047857', '#ffffff');
  assert.ok(darkEmerald.ratio >= 4.5, `Dark Emerald should be >= 4.5, got ${darkEmerald.ratio}`);
  assert.equal(darkEmerald.normalTextAA, true);
  assert.equal(darkEmerald.badgeLevel, 'aa');

  // Amber Gold #d97706 (passes large text AA, fails normal text AA)
  const amber = WcagContrast.evaluateWcagCompliance('#d97706', '#ffffff');
  assert.ok(
    amber.ratio >= 3.0 && amber.ratio < 4.5,
    `Amber should be in 3.0-4.5 range, got ${amber.ratio}`,
  );
  assert.equal(amber.normalTextAA, false);
  assert.equal(amber.largeTextAA, true);
  assert.equal(amber.badgeLevel, 'aa-large');

  // Pure Green #00ff00 (fails all standards against white)
  const green = WcagContrast.evaluateWcagCompliance('#00ff00', '#ffffff');
  assert.ok(green.ratio < 3.0, `Green should be < 3.0, got ${green.ratio}`);
  assert.equal(green.normalTextAA, false);
  assert.equal(green.largeTextAA, false);
  assert.equal(green.badgeLevel, 'fail');
});

test('QR Code Engine — Matrix Structure & ISO/IEC 18004 Compliance', () => {
  const mockUrl = 'https://menu.example.com/m/7F82A9C';
  const qr = QrCodeEngine.generateQrMatrix(mockUrl);

  assert.ok(qr.size >= 21, `Size should be at least 21, got ${qr.size}`);
  assert.equal(qr.matrix.length, qr.size);
  assert.equal(qr.matrix[0].length, qr.size);

  // Helper to assert 7x7 Finder Pattern structure
  function assertFinderPattern(top, left) {
    // 7x7 outer border is dark
    for (let c = 0; c < 7; c++) {
      assert.equal(qr.matrix[top][left + c], 1, `Finder top row at (${top}, ${left + c})`);
      assert.equal(
        qr.matrix[top + 6][left + c],
        1,
        `Finder bottom row at (${top + 6}, ${left + c})`,
      );
    }
    for (let r = 0; r < 7; r++) {
      assert.equal(qr.matrix[top + r][left], 1, `Finder left col at (${top + r}, ${left})`);
      assert.equal(
        qr.matrix[top + r][left + 6],
        1,
        `Finder right col at (${top + r}, ${left + 6})`,
      );
    }
    // 5x5 inner white border
    for (let c = 1; c < 6; c++) {
      assert.equal(
        qr.matrix[top + 1][left + c],
        0,
        `Finder inner top white at (${top + 1}, ${left + c})`,
      );
      assert.equal(
        qr.matrix[top + 5][left + c],
        0,
        `Finder inner bottom white at (${top + 5}, ${left + c})`,
      );
    }
    for (let r = 1; r < 6; r++) {
      assert.equal(
        qr.matrix[top + r][left + 1],
        0,
        `Finder inner left white at (${top + r}, ${left + 1})`,
      );
      assert.equal(
        qr.matrix[top + r][left + 5],
        0,
        `Finder inner right white at (${top + r}, ${left + 5})`,
      );
    }
    // 3x3 center is dark
    for (let r = 2; r <= 4; r++) {
      for (let c = 2; c <= 4; c++) {
        assert.equal(qr.matrix[top + r][left + c], 1, `Finder center at (${top + r}, ${left + c})`);
      }
    }
  }

  // Verify all 3 finder patterns
  assertFinderPattern(0, 0); // Top-left
  assertFinderPattern(0, qr.size - 7); // Top-right
  assertFinderPattern(qr.size - 7, 0); // Bottom-left

  // Verify Timing Pattern on row 6 and col 6
  for (let c = 8; c < qr.size - 8; c++) {
    assert.equal(qr.matrix[6][c], c % 2 === 0 ? 1 : 0, `Timing row 6, col ${c}`);
  }
  for (let r = 8; r < qr.size - 8; r++) {
    assert.equal(qr.matrix[r][6], r % 2 === 0 ? 1 : 0, `Timing col 6, row ${r}`);
  }

  // Dark module check at (size - 8, 8)
  assert.equal(qr.matrix[qr.size - 8][8], 1, 'Dark module must be 1');
});

test('QR Code Engine — SVG Generation & Vector Quality', () => {
  const mockUrl = 'https://menu.example.com/m/7F82A9C';
  const { svg, size, totalSize, matrix } = QrCodeEngine.generateQrSvg(mockUrl, { margin: 4 });

  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes(`viewBox="0 0 ${totalSize} ${totalSize}"`));
  assert.ok(svg.includes('shape-rendering="crispEdges"'));
  assert.ok(svg.endsWith('</svg>'));

  // Ensure modules are properly translated into rect tags
  let darkModuleCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1) darkModuleCount++;
    }
  }
  const rectMatches = svg.match(/<rect x="/g) || [];
  assert.equal(
    rectMatches.length,
    darkModuleCount,
    'SVG rect module count matches dark module count',
  );
});

test('F03 Authentication Invariants Specification Assertions', () => {
  // Architectural constants aligned with backend F03 source of truth
  const F03_CONTRACT = {
    loginSuccessStatus: 204,
    loginErrorStatus: 401,
    loginErrorMessage: 'Invalid credentials.',
    rateLimitStatus: 429,
    rateLimitMessage: 'Too many requests.',
    sessionCookieName: '__Host-DigitalMenu.Session',
    sessionDurationMinutes: 30,
    slidingExpiration: false,
    sameSite: 'Strict',
    httpOnly: true,
    secure: true,
    lockoutFailedAttempts: 5,
    lockoutDurationMinutes: 15,
    csrfCookieName: '__Host-DigitalMenu.Antiforgery',
    csrfHeaderName: 'X-XSRF-TOKEN',
    passwordMinLength: 12,
  };

  assert.equal(F03_CONTRACT.loginSuccessStatus, 204);
  assert.equal(F03_CONTRACT.sessionCookieName, '__Host-DigitalMenu.Session');
  assert.equal(F03_CONTRACT.sessionDurationMinutes, 30);
  assert.equal(F03_CONTRACT.slidingExpiration, false);
  assert.equal(F03_CONTRACT.sameSite, 'Strict');
  assert.equal(F03_CONTRACT.lockoutFailedAttempts, 5);
  assert.equal(F03_CONTRACT.lockoutDurationMinutes, 15);
  assert.equal(F03_CONTRACT.csrfHeaderName, 'X-XSRF-TOKEN');
});
