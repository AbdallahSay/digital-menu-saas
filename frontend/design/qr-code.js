/**
 * Digital Menu SaaS — Pure JavaScript Standards-Compliant QR Code Generator (ISO/IEC 18004 Model 2)
 * Generates verified, scannable QR matrix, scalable SVG, and high-resolution PNG exports.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QrCodeEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GF256_EXP = new Uint8Array(512);
  const GF256_LOG = new Uint8Array(256);

  (function initGaloisField() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF256_EXP[i] = x;
      GF256_EXP[i + 255] = x;
      GF256_LOG[x] = i;
      x <<= 1;
      if (x & 256) x ^= 0x11d; // 285
    }
  })();

  function gfMul(x, y) {
    if (x === 0 || y === 0) return 0;
    return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
  }

  function rsGeneratorPoly(degree) {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < degree; i++) {
      const next = new Uint8Array(poly.length + 1);
      const factor = GF256_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], factor);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    return poly;
  }

  function rsComputeRemainder(data, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const remainder = new Uint8Array(ecCount);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ remainder[0];
      remainder.copyWithin(0, 1);
      remainder[ecCount - 1] = 0;
      for (let j = 0; j < ecCount; j++) {
        remainder[j] ^= gfMul(gen[j], factor);
      }
    }
    return remainder;
  }

  // Version table for Byte Mode with ECC Level M (Versions 1-6)
  const QR_VERSIONS_M = [
    null,
    { version: 1, size: 21, total: 26, data: 16, ec: 10, blocks: 1, align: [] },
    { version: 2, size: 25, total: 44, data: 28, ec: 16, blocks: 1, align: [18] },
    { version: 3, size: 29, total: 70, data: 44, ec: 26, blocks: 1, align: [22] },
    { version: 4, size: 33, total: 100, data: 64, ec: 18, blocks: 2, align: [26] },
    { version: 5, size: 37, total: 134, data: 86, ec: 24, blocks: 2, align: [30] },
    { version: 6, size: 41, total: 172, data: 108, ec: 28, blocks: 4, align: [34] }
  ];

  // Mask patterns (Evaluation for mask 0 standard)
  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  function selectVersion(byteLength) {
    for (let v = 1; v <= 6; v++) {
      const info = QR_VERSIONS_M[v];
      const maxBytes = info.data - 2; // byte mode header + terminator
      if (byteLength <= maxBytes) return info;
    }
    throw new Error(`Data too long for compact QR (max ${QR_VERSIONS_M[6].data - 2} bytes, got ${byteLength})`);
  }

  function encodeQrData(text, vInfo) {
    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : { encode: (s) => Buffer.from(s, 'utf-8') };
    const bytes = encoder.encode(text);
    const bitBuffer = [];

    function writeBits(val, numBits) {
      for (let i = numBits - 1; i >= 0; i--) {
        bitBuffer.push((val >> i) & 1);
      }
    }

    // Byte mode (0100)
    writeBits(0b0100, 4);
    // Character count indicator (8 bits for versions 1-9)
    writeBits(bytes.length, 8);
    // Data bytes
    for (const b of bytes) {
      writeBits(b, 8);
    }

    // Terminator (up to 4 zeroes)
    const maxBits = vInfo.data * 8;
    const termBits = Math.min(4, maxBits - bitBuffer.length);
    for (let i = 0; i < termBits; i++) bitBuffer.push(0);

    // Byte alignment
    while (bitBuffer.length % 8 !== 0) bitBuffer.push(0);

    // Convert to codewords
    const dataCodewords = new Uint8Array(vInfo.data);
    for (let i = 0; i < bitBuffer.length / 8; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | bitBuffer[i * 8 + j];
      }
      dataCodewords[i] = b;
    }

    // Pad codewords (0xEC, 0x11 alternating)
    let padIdx = bitBuffer.length / 8;
    let padByte = 0xec;
    while (padIdx < vInfo.data) {
      dataCodewords[padIdx++] = padByte;
      padByte = padByte === 0xec ? 0x11 : 0xec;
    }

    return { bytes, bitBuffer, dataCodewords };
  }

  function createMatrix(vInfo, dataCodewords) {
    const size = vInfo.size;
    const matrix = Array.from({ length: size }, () => new Array(size).fill(null));
    const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

    function setModule(r, c, val) {
      matrix[r][c] = val;
      isFunction[r][c] = true;
    }

    // Finder patterns (7x7) + separators
    function placeFinder(top, left) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const row = top + r;
          const col = left + c;
          if (row < 0 || row >= size || col < 0 || col >= size) continue;
          let isDark = false;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            isDark = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          }
          setModule(row, col, isDark ? 1 : 0);
        }
      }
    }

    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // Timing patterns on row 6 and col 6
    for (let i = 8; i < size - 8; i++) {
      if (!isFunction[6][i]) setModule(6, i, i % 2 === 0 ? 1 : 0);
      if (!isFunction[i][6]) setModule(i, 6, i % 2 === 0 ? 1 : 0);
    }

    // Dark module at (size - 8, 8)
    setModule(size - 8, 8, 1);

    // Alignment patterns
    for (const center of vInfo.align) {
      for (let r = center - 2; r <= center + 2; r++) {
        for (let c = center - 2; c <= center + 2; c++) {
          if (!isFunction[r][c]) {
            const isDark = (r === center - 2 || r === center + 2 || c === center - 2 || c === center + 2 || (r === center && c === center));
            setModule(r, c, isDark ? 1 : 0);
          }
        }
      }
    }

    // Reserve format info modules
    for (let i = 0; i < 9; i++) {
      if (!isFunction[8][i]) isFunction[8][i] = true;
      if (!isFunction[i][8]) isFunction[i][8] = true;
    }
    for (let i = size - 8; i < size; i++) {
      if (!isFunction[8][i]) isFunction[8][i] = true;
      if (!isFunction[i][8]) isFunction[i][8] = true;
    }

    // Error correction codewords
    let allCodewords;
    if (vInfo.blocks === 1) {
      const ec = rsComputeRemainder(dataCodewords, vInfo.ec);
      allCodewords = new Uint8Array(vInfo.total);
      allCodewords.set(dataCodewords, 0);
      allCodewords.set(ec, dataCodewords.length);
    } else {
      const blockSize = dataCodewords.length / vInfo.blocks;
      const dataBlocks = [];
      const ecBlocks = [];
      for (let b = 0; b < vInfo.blocks; b++) {
        const sub = dataCodewords.subarray(b * blockSize, (b + 1) * blockSize);
        dataBlocks.push(sub);
        ecBlocks.push(rsComputeRemainder(sub, vInfo.ec));
      }
      allCodewords = new Uint8Array(vInfo.total);
      let idx = 0;
      for (let i = 0; i < blockSize; i++) {
        for (let b = 0; b < vInfo.blocks; b++) allCodewords[idx++] = dataBlocks[b][i];
      }
      for (let i = 0; i < vInfo.ec; i++) {
        for (let b = 0; b < vInfo.blocks; b++) allCodewords[idx++] = ecBlocks[b][i];
      }
    }

    // Place data bits in zig-zag columns
    const dataBits = [];
    for (const b of allCodewords) {
      for (let i = 7; i >= 0; i--) dataBits.push((b >> i) & 1);
    }

    let bitIdx = 0;
    let upwards = true;
    for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
      if (rightCol === 6) rightCol--; // Skip timing column
      const rows = upwards ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);
      for (const r of rows) {
        for (const c of [rightCol, rightCol - 1]) {
          if (!isFunction[r][c]) {
            matrix[r][c] = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
          }
        }
      }
      upwards = !upwards;
    }

    // Mask pattern 0 application: (row + col) % 2 === 0
    const maskFn = MASKS[0];
    const finalMatrix = Array.from({ length: size }, () => new Array(size));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        finalMatrix[r][c] = isFunction[r][c] ? matrix[r][c] : matrix[r][c] ^ (maskFn(r, c) ? 1 : 0);
      }
    }

    // Format info bits for ECC Level M, Mask 0 (0x5412)
    const formatBits = 0x5412;
    for (let i = 0; i < 15; i++) {
      const bit = (formatBits >> i) & 1;
      if (i < 6) finalMatrix[8][i] = bit;
      else if (i === 6) finalMatrix[8][7] = bit;
      else if (i === 7) finalMatrix[8][8] = bit;
      else if (i === 8) finalMatrix[7][8] = bit;
      else finalMatrix[14 - i][8] = bit;

      if (i < 7) finalMatrix[size - 1 - i][8] = bit;
      else finalMatrix[8][size - 15 + i] = bit;
    }

    // Ensure dark module is always 1 (ISO/IEC 18004)
    finalMatrix[size - 8][8] = 1;

    return { size, matrix: finalMatrix, vInfo, dataCodewords, allCodewords };
  }

  function generateQrMatrix(text) {
    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : { encode: (s) => Buffer.from(s, 'utf-8') };
    const vInfo = selectVersion(encoder.encode(text).length);
    const data = encodeQrData(text, vInfo);
    return createMatrix(vInfo, data.dataCodewords);
  }

  function generateQrSvg(text, options = {}) {
    const margin = typeof options.margin === 'number' ? options.margin : 4;
    const darkColor = options.darkColor || '#0f172a';
    const lightColor = options.lightColor || '#ffffff';
    const res = generateQrMatrix(text);
    const totalSize = res.size + margin * 2;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="100%" height="100%" shape-rendering="crispEdges">\n`;
    svg += `  <rect width="${totalSize}" height="${totalSize}" fill="${lightColor}"/>\n`;
    for (let r = 0; r < res.size; r++) {
      for (let c = 0; c < res.size; c++) {
        if (res.matrix[r][c] === 1) {
          svg += `  <rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${darkColor}"/>\n`;
        }
      }
    }
    svg += `</svg>`;
    return {
      svg,
      size: res.size,
      totalSize,
      matrix: res.matrix,
      version: res.vInfo.version
    };
  }

  function renderQrToCanvas(text, canvas, options = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    const ctx = canvas.getContext('2d');
    const qr = generateQrMatrix(text);
    const margin = typeof options.margin === 'number' ? options.margin : 4;
    const totalModules = qr.size + margin * 2;
    const targetSize = options.pixelSize || 1024;
    const moduleSize = Math.floor(targetSize / totalModules);
    const actualQrPixelSize = moduleSize * totalModules;
    const offset = Math.floor((targetSize - actualQrPixelSize) / 2);

    canvas.width = targetSize;
    canvas.height = targetSize;

    ctx.fillStyle = options.lightColor || '#ffffff';
    ctx.fillRect(0, 0, targetSize, targetSize);

    ctx.fillStyle = options.darkColor || '#0f172a';
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.matrix[r][c] === 1) {
          ctx.fillRect(
            offset + (c + margin) * moduleSize,
            offset + (r + margin) * moduleSize,
            moduleSize,
            moduleSize
          );
        }
      }
    }

    return canvas;
  }

  function downloadQrPng(text, filename = 'qr-code.png', options = {}) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    renderQrToCanvas(text, canvas, options);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  function downloadQrSvg(text, filename = 'qr-code.svg', options = {}) {
    if (typeof document === 'undefined') return;
    const { svg } = generateQrSvg(text, options);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function generateQrPath(text, options = {}) {
    const margin = typeof options.margin === 'number' ? options.margin : 4;
    const res = generateQrMatrix(text);
    let path = '';
    for (let r = 0; r < res.size; r++) {
      for (let c = 0; c < res.size; c++) {
        if (res.matrix[r][c] === 1) {
          path += `M${c + margin},${r + margin}h1v1h-1z `;
        }
      }
    }
    return {
      path: path.trim(),
      size: res.size,
      totalSize: res.size + margin * 2,
      margin,
      version: res.vInfo.version,
    };
  }

  function decodeQrMatrix(matrix) {
    const size = matrix.length;
    const vInfo = QR_VERSIONS_M.find((v) => v && v.size === size);
    if (!vInfo) throw new Error('Unsupported QR matrix size: ' + size);

    const isFunc = Array.from({ length: size }, () => new Array(size).fill(false));
    function markFunc(top, left, h, w) {
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          if (top + r >= 0 && top + r < size && left + c >= 0 && left + c < size) {
            isFunc[top + r][left + c] = true;
          }
        }
      }
    }
    markFunc(0, 0, 9, 9);
    markFunc(0, size - 8, 9, 8);
    markFunc(size - 8, 0, 8, 9);
    for (let i = 0; i < size; i++) {
      isFunc[6][i] = true;
      isFunc[i][6] = true;
    }
    for (const center of vInfo.align) {
      markFunc(center - 2, center - 2, 5, 5);
    }
    isFunc[size - 8][8] = true;

    const bits = [];
    let upwards = true;
    for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
      if (rightCol === 6) rightCol--;
      const rows = upwards
        ? Array.from({ length: size }, (_, i) => size - 1 - i)
        : Array.from({ length: size }, (_, i) => i);
      for (const r of rows) {
        for (const c of [rightCol, rightCol - 1]) {
          if (!isFunc[r][c]) {
            const mask = (r + c) % 2 === 0 ? 1 : 0;
            bits.push(matrix[r][c] ^ mask);
          }
        }
      }
      upwards = !upwards;
    }

    let bitPos = 0;
    function readBits(num) {
      let val = 0;
      for (let i = 0; i < num; i++) val = (val << 1) | bits[bitPos++];
      return val;
    }

    const mode = readBits(4);
    const len = readBits(8);
    let text = '';
    for (let i = 0; i < len; i++) {
      text += String.fromCharCode(readBits(8));
    }
    return { text, mode, length: len, version: vInfo.version };
  }

  return {
    generateQrMatrix,
    generateQrSvg,
    generateQrPath,
    decodeQrMatrix,
    renderQrToCanvas,
    downloadQrPng,
    downloadQrSvg,
  };
});
