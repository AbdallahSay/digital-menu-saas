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
    // The contract's compliance conclusions (AA-large-only / AAA) still hold.
    expect(ratioAgainstWhite('#d97706')).toBeCloseTo(3.19, 2);
    expect(ratioAgainstWhite('#334155')).toBeCloseTo(10.35, 2);
    expect(ratioAgainstWhite('#ffffff')).toBeCloseTo(1.0, 2);
    expect(ratioAgainstWhite('#000000')).toBeCloseTo(21.0, 1);
  });

  it('classifies Amber Gold as AA for large text only', () => {
    const report = evaluateContrast('#d97706');
    expect(report).not.toBeNull();
    expect(report!.normalText).toBe('AA-large');
    expect(report!.largeText).toBe('AA');
    expect(report!.graphics).toBe('AA');
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
