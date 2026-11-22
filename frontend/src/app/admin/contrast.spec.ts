import { evaluateContrast, parseHexColor, ratioAgainstWhite, relativeLuminance } from './contrast';

describe('contrast (WCAG 2.1/2.2)', () => {
  it('parses 3- and 6-digit hex colors and rejects malformed input', () => {
    expect(parseHexColor('#d97706')).toEqual({ r: 217, g: 119, b: 6 });
    expect(parseHexColor('#FFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor(' #334155 ')).toEqual({ r: 51, g: 65, b: 85 });
    expect(parseHexColor('d97706')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull();
    expect(parseHexColor('#gggggg')).toBeNull();
    expect(parseHexColor('')).toBeNull();
  });

  it('computes sRGB-linearized relative luminance', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1.0, 5);
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0.0, 5);
  });

  it('computes ratios per the design stated formula (its example figures are inaccurate)', () => {
    // The design contract SPECIFIES the standard formula but quotes 3.23 for
    // #d97706 and 9.61 for #334155; the formula itself yields 3.19 and 10.35.
    // Compliance consequence: #d97706 fails normal text; #334155 is AAA.
    expect(ratioAgainstWhite('#d97706')).toBeCloseTo(3.19, 2);
    expect(ratioAgainstWhite('#334155')).toBeCloseTo(10.35, 2);
    expect(ratioAgainstWhite('#ffffff')).toBeCloseTo(1.0, 2);
    expect(ratioAgainstWhite('#000000')).toBeCloseTo(21.0, 1);
  });

  it('fails Amber Gold for normal text while large text and graphics pass', () => {
    // #d97706 is ~3.19:1: below the 4.5 normal-text AA threshold there is no
    // pass, so the preset must show a red normal-text badge.
    const report = evaluateContrast('#d97706');
    expect(report).not.toBeNull();
    expect(report!.normalText).toBe('fail');
    expect(report!.largeText).toBe('AA');
    expect(report!.graphics).toBe('AA');
  });

  it('applies the 4.5 and 7.0 normal-text boundaries', () => {
    // #767676 is ~4.54:1 (just over AA); #595959 is ~7.0:1 (AAA).
    expect(evaluateContrast('#767676')!.normalText).toBe('AA');
    expect(evaluateContrast('#767676')!.largeText).toBe('AAA');
    expect(evaluateContrast('#595959')!.normalText).toBe('AAA');
    expect(evaluateContrast('#787878')!.normalText).toBe('fail'); // ~4.37:1, under AA
  });

  it('classifies Charcoal as AAA for normal text', () => {
    const report = evaluateContrast('#334155');
    expect(report!.normalText).toBe('AAA');
    expect(report!.largeText).toBe('AAA');
    expect(report!.graphics).toBe('AA');
  });

  it('fails white on white', () => {
    const report = evaluateContrast('#ffffff');
    expect(report!.normalText).toBe('fail');
    expect(report!.graphics).toBe('fail');
  });

  it('evaluates every preset swatch from the design contract', () => {
    for (const hex of ['#d97706', '#059669', '#dc2626', '#2563eb', '#4f46e5', '#334155']) {
      expect(evaluateContrast(hex)).not.toBeNull();
    }
  });

  it('returns null for an unparseable color', () => {
    expect(evaluateContrast('not-a-color')).toBeNull();
    expect(ratioAgainstWhite('#12')).toBeNull();
  });
});
