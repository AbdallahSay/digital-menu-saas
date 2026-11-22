/**
 * WCAG 2.1/2.2 contrast evaluation for the branding studio (Screen 5 of
 * frontend/design/admin-specs.md). Implements the standard relative
 * luminance formula with sRGB linearization, exactly as the design contract
 * specifies, against a white menu background.
 */

export type ContrastLevel = 'AAA' | 'AA' | 'AA-large' | 'fail';

export interface ContrastReport {
  /** Ratio against white, e.g. 3.23 for #d97706. */
  ratio: number;
  normalText: ContrastLevel;
  largeText: ContrastLevel;
  /** Graphical objects / UI components (AA threshold 3:1). */
  graphics: 'AA' | 'fail';
}

/** Parses #rgb or #rrggbb (case-insensitive); returns null for anything else. */
export function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const match = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(input.trim());
  if (!match) return null;
  let hex = input.trim().slice(1);
  if (hex.length === 3)
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an sRGB color. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Contrast ratio of a color against white (Lw = 1.0): (1.05) / (L + 0.05). */
export function ratioAgainstWhite(hex: string): number | null {
  const color = parseHexColor(hex);
  if (!color) return null;
  return 1.05 / (relativeLuminance(color.r, color.g, color.b) + 0.05);
}

function textLevel(ratio: number, aa: number, aaa: number, largeAa: number): ContrastLevel {
  if (ratio >= aaa) return 'AAA';
  if (ratio >= aa) return 'AA';
  if (ratio >= largeAa) return 'AA-large';
  return 'fail';
}

/** Full compliance evaluation; returns null for an unparseable color. */
export function evaluateContrast(hex: string): ContrastReport | null {
  const ratio = ratioAgainstWhite(hex);
  if (ratio === null) return null;
  return {
    ratio,
    // Normal text: AA 4.5, AAA 7.0; large text: AA 3.0, AAA 4.5.
    normalText: textLevel(ratio, 4.5, 7.0, 3.0),
    largeText: textLevel(ratio, 3.0, 4.5, 3.0),
    graphics: ratio >= 3.0 ? 'AA' : 'fail',
  };
}
