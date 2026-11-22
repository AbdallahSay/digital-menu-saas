import { QUIET_ZONE, qrMatrix, qrPngBlob, qrSvgText } from './qr-code.util';

const PERMANENT_URL = 'https://menu.example.com/m/0123456789abcdef0123';

describe('qr-code.util', () => {
  it('produces a deterministic square matrix for the same input', () => {
    const first = qrMatrix(PERMANENT_URL);
    const second = qrMatrix(PERMANENT_URL);
    expect(first.size).toBeGreaterThan(0);
    expect(first.size).toBe(second.size);
    let identical = true;
    for (let row = 0; row < first.size; row++)
      for (let column = 0; column < first.size; column++)
        if (first.get(row, column) !== second.get(row, column)) identical = false;
    expect(identical).toBe(true);
  });

  it('changes the matrix when the encoded text changes', () => {
    const a = qrMatrix(PERMANENT_URL);
    const b = qrMatrix('https://menu.example.com/m/fedcba9876543210ffee');
    expect(a.size !== b.size || !sameCells(a, b)).toBe(true);
  });

  it('builds a standalone SVG with the standard quiet zone and one cell per dark module', () => {
    const matrix = qrMatrix(PERMANENT_URL);
    const modulePx = 10;
    const svg = qrSvgText(matrix, modulePx);
    const total = (matrix.size + QUIET_ZONE * 2) * modulePx;
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`width="${total}" height="${total}"`);
    expect(svg).toContain(`<rect width="${total}" height="${total}" fill="#ffffff"/>`);
    // Every dark module becomes one M..h..v..h-..z path segment at its quiet-zone offset.
    const segments = svg.match(/M\d+ \d+h\d+v\d+h-\d+z/g) ?? [];
    expect(segments.length).toBe(darkModules(matrix));
    expect(segments.some((s) => s.startsWith(`M${QUIET_ZONE * modulePx} `))).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('respects the module pixel size for previews and print exports', () => {
    const matrix = qrMatrix(PERMANENT_URL);
    const small = qrSvgText(matrix, 8);
    const print = qrSvgText(matrix, 10);
    expect(small).toContain(`width="${(matrix.size + QUIET_ZONE * 2) * 8}"`);
    expect(print).toContain(`width="${(matrix.size + QUIET_ZONE * 2) * 10}"`);
  });

  it('builds a fluid scalable variant for innerHTML previews without fixed dimensions', () => {
    const matrix = qrMatrix(PERMANENT_URL);
    const svg = qrSvgText(matrix, 8, true);
    const total = (matrix.size + QUIET_ZONE * 2) * 8;
    expect(svg).toContain(`viewBox="0 0 ${total} ${total}"`);
    // No fixed width/height attributes on the <svg> element itself.
    expect(/<svg[^>]*\s(?:width|height)=/.test(svg)).toBe(false);
    expect(svg).toContain('style="display:block;width:100%;height:auto"');
    // The background rect keeps its explicit pixel size from the viewBox grid.
    expect(svg).toContain(`<rect width="${total}" height="${total}" fill="#ffffff"/>`);
  });

  it('returns null for PNG when no 2d canvas context is available (jsdom/SSR)', async () => {
    // jsdom has no canvas implementation; getContext('2d') returns null and
    // the helper must fail soft instead of throwing.
    await expect(qrPngBlob(qrMatrix(PERMANENT_URL), 1024)).resolves.toBeNull();
  });
});

function darkModules(matrix: ReturnType<typeof qrMatrix>): number {
  let count = 0;
  for (let row = 0; row < matrix.size; row++)
    for (let column = 0; column < matrix.size; column++) if (matrix.get(row, column)) count++;
  return count;
}

function sameCells(a: ReturnType<typeof qrMatrix>, b: ReturnType<typeof qrMatrix>): boolean {
  for (let row = 0; row < a.size; row++)
    for (let column = 0; column < a.size; column++)
      if (a.get(row, column) !== b.get(row, column)) return false;
  return true;
}
