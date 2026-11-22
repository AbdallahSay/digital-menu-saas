import QRCode from 'qrcode';

/**
 * QR matrix → SVG/PNG helpers for the permanent QR studio (Screen 6 of
 * frontend/design/admin-specs.md). The matrix comes from the `qrcode`
 * package (ISO/IEC 18004 Model 2, error correction M); the SVG is built by
 * hand so previews and downloads are byte-identical without canvas support.
 */

export interface QrMatrix {
  size: number;
  get(row: number, column: number): boolean;
}

/** Generates the module matrix for a permanent URL. */
export function qrMatrix(text: string): QrMatrix {
  const created = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const { size, data } = created.modules;
  return { size, get: (row, column) => data[row * size + column] === 1 };
}

/** Quiet zone in modules, per the standard (4 modules each side). */
export const QUIET_ZONE = 4;

/**
 * Builds a standalone SVG document string: white background + dark modules.
 * Fixed pixel dimensions by default (downloads/print); `scalable` drops the
 * width/height attributes and makes the SVG fluid, because injected innerHTML
 * content is outside Angular's style encapsulation and must size itself.
 */
export function qrSvgText(matrix: QrMatrix, modulePx = 10, scalable = false): string {
  const total = (matrix.size + QUIET_ZONE * 2) * modulePx;
  let path = '';
  for (let row = 0; row < matrix.size; row++) {
    for (let column = 0; column < matrix.size; column++) {
      if (matrix.get(row, column)) {
        path += `M${(column + QUIET_ZONE) * modulePx} ${(row + QUIET_ZONE) * modulePx}h${modulePx}v${modulePx}h-${modulePx}z`;
      }
    }
  }
  const sizing = scalable
    ? 'style="display:block;width:100%;height:auto" '
    : `width="${total}" height="${total}" `;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ${sizing}` +
    `viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/></svg>`
  );
}

/**
 * Renders the matrix onto a canvas at the requested pixel size with the
 * standard quiet zone and returns the PNG blob; null when canvas/2d is
 * unavailable (SSR, very old browsers).
 */
export function qrPngBlob(matrix: QrMatrix, pixels: number): Promise<Blob | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = pixels;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  const modules = matrix.size + QUIET_ZONE * 2;
  const cell = pixels / modules;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, pixels, pixels);
  context.fillStyle = '#000000';
  for (let row = 0; row < matrix.size; row++) {
    for (let column = 0; column < matrix.size; column++) {
      if (matrix.get(row, column)) {
        context.fillRect(
          Math.floor((column + QUIET_ZONE) * cell),
          Math.floor((row + QUIET_ZONE) * cell),
          Math.ceil(cell),
          Math.ceil(cell),
        );
      }
    }
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
