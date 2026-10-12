/**
 * Digital Menu SaaS — WCAG 2.1 / 2.2 Relative Luminance and Contrast Ratio Engine
 * Implements strict sRGB linearization and contrast calculations according to W3C standards.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WcagContrast = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Linearizes an 8-bit sRGB channel component (0..255) to linear light [0..1].
   * In accordance with W3C WCAG 2.1 / 2.2 Definition of relative luminance.
   * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
   */
  function sRgbToLinear(channel8) {
    const c = Math.max(0, Math.min(255, channel8)) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  /**
   * Parses hex string (#RGB, #RRGGBB) to { r, g, b } (0..255).
   */
  function parseHexColor(hex) {
    if (typeof hex !== 'string') return null;
    const clean = hex.trim().replace(/^#/, '');
    if (clean.length === 3) {
      const r = parseInt(clean[0] + clean[0], 16);
      const g = parseInt(clean[1] + clean[1], 16);
      const b = parseInt(clean[2] + clean[2], 16);
      return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? null : { r, g, b };
    }
    if (clean.length === 6) {
      const r = parseInt(clean.slice(0, 2), 16);
      const g = parseInt(clean.slice(2, 4), 16);
      const b = parseInt(clean.slice(4, 6), 16);
      return Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) ? null : { r, g, b };
    }
    return null;
  }

  /**
   * Calculates standard relative luminance L for an sRGB hex color.
   * L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin.
   */
  function getRelativeLuminance(hex) {
    const rgb = parseHexColor(hex);
    if (!rgb) return 0;
    const rLin = sRgbToLinear(rgb.r);
    const gLin = sRgbToLinear(rgb.g);
    const bLin = sRgbToLinear(rgb.b);
    return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
  }

  /**
   * Calculates WCAG contrast ratio between two colors.
   * Formula: (L1 + 0.05) / (L2 + 0.05) where L1 is the lighter color.
   */
  function getContrastRatio(color1, color2 = '#ffffff') {
    const l1 = getRelativeLuminance(color1);
    const l2 = getRelativeLuminance(color2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    const ratio = (lighter + 0.05) / (darker + 0.05);
    return Math.round(ratio * 100) / 100;
  }

  /**
   * Evaluates WCAG compliance against AA and AAA thresholds.
   *
   * Thresholds:
   * - Normal text: Level AA >= 4.5:1, Level AAA >= 7.0:1
   * - Large text (>= 18pt / 24px or >= 14pt / 18.66px bold): Level AA >= 3.0:1, Level AAA >= 4.5:1
   * - UI components and graphical objects: Level AA >= 3.0:1
   */
  function evaluateWcagCompliance(color1, color2 = '#ffffff') {
    const ratio = getContrastRatio(color1, color2);
    const normalTextAA = ratio >= 4.5;
    const normalTextAAA = ratio >= 7.0;
    const largeTextAA = ratio >= 3.0;
    const largeTextAAA = ratio >= 4.5;
    const uiComponentAA = ratio >= 3.0;

    let badgeLevel = 'fail';
    let labelAr = `نسبة التباين ${ratio}:1 — غير متوافق مع معايير إتاحة النصوص`;
    let labelEn = `Contrast ratio ${ratio}:1 — Fails WCAG text contrast`;

    if (normalTextAAA) {
      badgeLevel = 'aaa';
      labelAr = `نسبة التباين ${ratio}:1 (متوافق مع WCAG AAA للنصوص العادية والكبيرة)`;
      labelEn = `Contrast ratio ${ratio}:1 (WCAG AAA compliant for normal and large text)`;
    } else if (normalTextAA) {
      badgeLevel = 'aa';
      labelAr = `نسبة التباين ${ratio}:1 (متوافق مع WCAG AA للنصوص، و AAA للنصوص الكبيرة)`;
      labelEn = `Contrast ratio ${ratio}:1 (WCAG AA compliant for normal text, AAA for large text)`;
    } else if (largeTextAA) {
      badgeLevel = 'aa-large';
      labelAr = `نسبة التباين ${ratio}:1 (متوافق مع WCAG AA للعناوين الكبيرة فقط، غير كافٍ للنصوص الصغيرة)`;
      labelEn = `Contrast ratio ${ratio}:1 (WCAG AA for large text only, insufficient for body text)`;
    }

    return {
      ratio,
      normalTextAA,
      normalTextAAA,
      largeTextAA,
      largeTextAAA,
      uiComponentAA,
      badgeLevel,
      labelAr,
      labelEn
    };
  }

  return {
    sRgbToLinear,
    parseHexColor,
    getRelativeLuminance,
    getContrastRatio,
    evaluateWcagCompliance
  };
});
