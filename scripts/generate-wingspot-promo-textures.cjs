// scripts/generate-wingspot-promo-textures.cjs
// High-resolution procedural generator for Wing Spot Promotional Posters
// Matching real photograph: 2 boards (Lunes-Martes & Miercoles-Jueves) with vertical dividers,
// stylized day typography, circular price badges, dotted separators, and rounded frames with corner screws.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Complete 8x8 bitmap font data with digits 0-9 and special characters
const FONT_8X8 = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  '!': [0x18, 0x3c, 0x3c, 0x18, 0x18, 0x00, 0x18, 0x00],
  '-': [0x00, 0x00, 0x00, 0x7e, 0x00, 0x00, 0x00, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00],
  ':': [0x00, 0x00, 0x18, 0x18, 0x00, 0x18, 0x18, 0x00],
  '/': [0x06, 0x0c, 0x18, 0x30, 0x60, 0xc0, 0x80, 0x00],
  '$': [0x18, 0x7e, 0xd8, 0x7c, 0x1b, 0x7e, 0x18, 0x00],
  '0': [0x3c, 0x66, 0x6e, 0x76, 0x66, 0x66, 0x3c, 0x00],
  '1': [0x18, 0x38, 0x18, 0x18, 0x18, 0x18, 0x7e, 0x00],
  '2': [0x3c, 0x66, 0x06, 0x1c, 0x30, 0x66, 0x7e, 0x00],
  '3': [0x3c, 0x66, 0x06, 0x1c, 0x06, 0x66, 0x3c, 0x00],
  '4': [0x0c, 0x1c, 0x3c, 0x6c, 0xfe, 0x0c, 0x0c, 0x00],
  '5': [0x7e, 0x60, 0x7c, 0x06, 0x06, 0x66, 0x3c, 0x00],
  '6': [0x3c, 0x60, 0x7c, 0x66, 0x66, 0x66, 0x3c, 0x00],
  '7': [0x7e, 0x06, 0x0c, 0x18, 0x30, 0x30, 0x30, 0x00],
  '8': [0x3c, 0x66, 0x66, 0x3c, 0x66, 0x66, 0x3c, 0x00],
  '9': [0x3c, 0x66, 0x66, 0x3e, 0x06, 0x0c, 0x38, 0x00],
  'A': [0x18, 0x3c, 0x66, 0x66, 0x7e, 0x66, 0x66, 0x00],
  'B': [0x7c, 0x66, 0x66, 0x7c, 0x66, 0x66, 0x7c, 0x00],
  'C': [0x3c, 0x66, 0x60, 0x60, 0x60, 0x66, 0x3c, 0x00],
  'D': [0x78, 0x6c, 0x66, 0x66, 0x66, 0x6c, 0x78, 0x00],
  'E': [0x7e, 0x60, 0x60, 0x7c, 0x60, 0x60, 0x7e, 0x00],
  'F': [0x7e, 0x60, 0x60, 0x7c, 0x60, 0x60, 0x60, 0x00],
  'G': [0x3c, 0x66, 0x60, 0x6e, 0x66, 0x66, 0x3a, 0x00],
  'H': [0x66, 0x66, 0x66, 0x7e, 0x66, 0x66, 0x66, 0x00],
  'I': [0x3c, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3c, 0x00],
  'J': [0x0e, 0x06, 0x06, 0x06, 0x06, 0x66, 0x3c, 0x00],
  'K': [0x66, 0x6c, 0x78, 0x70, 0x78, 0x6c, 0x66, 0x00],
  'L': [0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x7e, 0x00],
  'M': [0x63, 0x77, 0x7f, 0x6b, 0x63, 0x63, 0x63, 0x00],
  'N': [0x66, 0x76, 0x7e, 0x7e, 0x6e, 0x66, 0x66, 0x00],
  'O': [0x3c, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x00],
  'P': [0x7c, 0x66, 0x66, 0x7c, 0x60, 0x60, 0x60, 0x00],
  'Q': [0x3c, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x0e, 0x00],
  'R': [0x7c, 0x66, 0x66, 0x7c, 0x78, 0x6c, 0x66, 0x00],
  'S': [0x3c, 0x66, 0x60, 0x3c, 0x06, 0x66, 0x3c, 0x00],
  'T': [0x7e, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x00],
  'U': [0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x00],
  'V': [0x66, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x18, 0x00],
  'W': [0x63, 0x63, 0x63, 0x6b, 0x7f, 0x77, 0x63, 0x00],
  'X': [0x66, 0x66, 0x3c, 0x18, 0x3c, 0x66, 0x66, 0x00],
  'Y': [0x66, 0x66, 0x66, 0x3c, 0x18, 0x18, 0x18, 0x00],
  'Z': [0x7e, 0x06, 0x0c, 0x18, 0x30, 0x60, 0x7e, 0x00]
};

// 12x14 High-Detail Western/Carved Day Headers ("LUNES", "MARTES", etc.)
const WESTERN_FONT = {
  'L': [
    "###         ",
    "###         ",
    "###         ",
    "###         ",
    "###         ",
    "###         ",
    "###         ",
    "###         ",
    "###         ",
    "###         ",
    "###         ",
    "############",
    " ###########",
    "  ##########"
  ],
  'U': [
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    " ###    ### ",
    "  ########  ",
    "   ######   ",
    "    ####    "
  ],
  'N': [
    "####     ###",
    "#####    ###",
    "######   ###",
    "#######  ###",
    "### ###  ###",
    "###  ### ###",
    "###  ###### ",
    "###   ##### ",
    "###   ##### ",
    "###    #### ",
    "###     ### ",
    "###     ### ",
    "###     ### ",
    "###     ### "
  ],
  'E': [
    "############",
    "############",
    "###         ",
    "###         ",
    "###         ",
    "#########   ",
    "#########   ",
    "###         ",
    "###         ",
    "###         ",
    "###         ",
    "############",
    "############",
    " ########## "
  ],
  'S': [
    "  ########  ",
    " ########## ",
    "####    ####",
    "####        ",
    " #####      ",
    "  ########  ",
    "   ######## ",
    "      ##### ",
    "        ####",
    "####    ####",
    " ########## ",
    "  ########  ",
    "   ######   ",
    "    ####    "
  ],
  'M': [
    "###      ###",
    "####    ####",
    "#####  #####",
    "###### ######",
    "### #### ###",
    "###  ##  ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###"
  ],
  'A': [
    "    ####    ",
    "   ######   ",
    "   ######   ",
    "  ###  ###  ",
    "  ###  ###  ",
    " ###    ### ",
    " ########## ",
    " ########## ",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###"
  ],
  'R': [
    "########### ",
    "############",
    "###      ###",
    "###      ###",
    "###      ###",
    "########### ",
    "##########  ",
    "###   ###   ",
    "###    ###  ",
    "###     ### ",
    "###     ### ",
    "###      ###",
    "###      ###",
    "###      ###"
  ],
  'T': [
    "############",
    "############",
    " ########## ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    "
  ],
  'I': [
    "############",
    " ########## ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    "    ####    ",
    " ########## ",
    "############",
    "############"
  ],
  'C': [
    "  ########  ",
    " ########## ",
    "####    ####",
    "###      ###",
    "###         ",
    "###         ",
    "###         ",
    "###         ",
    "###         ",
    "###      ###",
    "####    ####",
    " ########## ",
    "  ########  ",
    "   ######   "
  ],
  'O': [
    "  ########  ",
    " ########## ",
    "####    ####",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "####    ####",
    " ########## ",
    "  ########  ",
    "   ######   "
  ],
  'J': [
    "       #####",
    "       #####",
    "         ###",
    "         ###",
    "         ###",
    "         ###",
    "         ###",
    "         ###",
    "###      ###",
    "###      ###",
    "####    ####",
    " ########## ",
    "  ########  ",
    "   ######   "
  ],
  'V': [
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    "###      ###",
    " ###    ### ",
    "  ###  ###  ",
    "  ###  ###  ",
    "   ######   ",
    "   ######   ",
    "    ####    ",
    "    ####    ",
    "     ##     ",
    "     ##     "
  ]
};

class Surface {
  constructor(width, height, defaultColor = [0, 0, 0, 0]) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      this.data[idx] = defaultColor[0];
      this.data[idx + 1] = defaultColor[1];
      this.data[idx + 2] = defaultColor[2];
      this.data[idx + 3] = defaultColor[3];
    }
  }

  setPixel(x, y, color) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    const alpha = color[3] / 255;
    if (alpha >= 1) {
      this.data[idx] = color[0];
      this.data[idx + 1] = color[1];
      this.data[idx + 2] = color[2];
      this.data[idx + 3] = color[3];
    } else if (alpha > 0) {
      const invAlpha = 1 - alpha;
      this.data[idx] = Math.round(color[0] * alpha + this.data[idx] * invAlpha);
      this.data[idx + 1] = Math.round(color[1] * alpha + this.data[idx + 1] * invAlpha);
      this.data[idx + 2] = Math.round(color[2] * alpha + this.data[idx + 2] * invAlpha);
      this.data[idx + 3] = Math.min(255, Math.round(color[3] + this.data[idx + 3] * invAlpha));
    }
  }

  fillRect(x, y, w, h, color) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        this.setPixel(cx, cy, color);
      }
    }
  }

  fillCircle(cx, cy, radius, color) {
    const r2 = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 <= r2) {
          this.setPixel(x, y, color);
        }
      }
    }
  }

  strokeCircle(cx, cy, radius, strokeWidth, color) {
    const rInner2 = (radius - strokeWidth / 2) * (radius - strokeWidth / 2);
    const rOuter2 = (radius + strokeWidth / 2) * (radius + strokeWidth / 2);
    for (let y = Math.floor(cy - radius - strokeWidth); y <= Math.ceil(cy + radius + strokeWidth); y++) {
      for (let x = Math.floor(cx - radius - strokeWidth); x <= Math.ceil(cx + radius + strokeWidth); x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 >= rInner2 && d2 <= rOuter2) {
          this.setPixel(x, y, color);
        }
      }
    }
  }

  fillRoundedRect(x, y, w, h, r, color) {
    r = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));
    this.fillRect(x + r, y, w - 2 * r, h, color);
    this.fillRect(x, y + r, r, h - 2 * r, color);
    this.fillRect(x + w - r, y + r, r, h - 2 * r, color);
    this.fillCircle(x + r, y + r, r, color);
    this.fillCircle(x + w - r, y + r, r, color);
    this.fillCircle(x + r, y + h - r, r, color);
    this.fillCircle(x + w - r, y + h - r, r, color);
  }

  strokeRoundedRect(x, y, w, h, r, strokeWidth, color) {
    const half = Math.floor(strokeWidth / 2);
    for (let sw = -half; sw <= half; sw++) {
      const curX = x + sw;
      const curY = y + sw;
      const curW = w - 2 * sw;
      const curH = h - 2 * sw;
      const curR = Math.max(1, r - sw);
      // Top & bottom horizontal segments
      this.fillRect(curX + curR, curY, curW - 2 * curR, 1, color);
      this.fillRect(curX + curR, curY + curH - 1, curW - 2 * curR, 1, color);
      // Left & right vertical segments
      this.fillRect(curX, curY + curR, 1, curH - 2 * curR, color);
      this.fillRect(curX + curW - 1, curY + curR, 1, curH - 2 * curR, color);
      // Corners
      this.strokeCircle(curX + curR, curY + curR, curR, 1, color);
      this.strokeCircle(curX + curW - curR, curY + curR, curR, 1, color);
      this.strokeCircle(curX + curR, curY + curH - curR, curR, 1, color);
      this.strokeCircle(curX + curW - curR, curY + curH - curR, curR, 1, color);
    }
  }

  drawDottedVLine(x, y1, y2, dotSpacing, dotRadius, color) {
    for (let y = y1; y <= y2; y += dotSpacing) {
      this.fillCircle(x, y, dotRadius, color);
    }
  }

  drawDottedHLine(x1, x2, y, dotSpacing, dotRadius, color) {
    for (let x = x1; x <= x2; x += dotSpacing) {
      this.fillCircle(x, y, dotRadius, color);
    }
  }

  drawText(text, startX, startY, scale, color) {
    let curX = startX;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const glyph = FONT_8X8[ch] || FONT_8X8[' '];
      for (let row = 0; row < 8; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 8; col++) {
          if ((bits >> (7 - col)) & 1) {
            this.fillRect(curX + col * scale, startY + row * scale, scale, scale, color);
          }
        }
      }
      curX += 8 * scale;
    }
  }

  measureText(text, scale) {
    return text.length * 8 * scale;
  }

  drawCenteredText(text, cx, cy, scale, color) {
    const w = this.measureText(text, scale);
    const h = 8 * scale;
    this.drawText(text, Math.round(cx - w / 2), Math.round(cy - h / 2), scale, color);
  }

  drawWesternText(text, startX, startY, scale, color, shadowColor = null) {
    let curX = startX;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const glyph = WESTERN_FONT[ch];
      if (glyph) {
        const rows = glyph.length;
        const cols = glyph[0].length;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (glyph[r][c] === '#') {
              if (shadowColor) {
                this.fillRect(curX + c * scale + scale, startY + r * scale + scale, scale, scale, shadowColor);
              }
              this.fillRect(curX + c * scale, startY + r * scale, scale, scale, color);
            }
          }
        }
        curX += (cols + 4) * scale; // Spacing
      } else {
        curX += 12 * scale;
      }
    }
  }

  measureWesternText(text, scale) {
    let total = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const glyph = WESTERN_FONT[ch];
      const cols = glyph ? glyph[0].length : 12;
      total += (cols + 4) * scale;
    }
    return total;
  }

  drawCenteredWesternText(text, cx, cy, scale, color, shadowColor = null) {
    const w = this.measureWesternText(text, scale);
    const h = 14 * scale;
    this.drawWesternText(text, Math.round(cx - w / 2), Math.round(cy - h / 2), scale, color, shadowColor);
  }

  drawCornerScrew(cx, cy, radius = 9) {
    // Outer silver washer
    this.fillCircle(cx, cy, radius, [200, 205, 215, 255]);
    this.strokeCircle(cx, cy, radius, 1.5, [130, 135, 145, 255]);
    // Inner screw dome
    this.fillCircle(cx, cy, radius - 3, [160, 165, 175, 255]);
    this.strokeCircle(cx, cy, radius - 3, 1, [100, 105, 115, 255]);
    // Cross slot
    this.fillRect(cx - radius + 5, cy - 1, (radius - 5) * 2, 2, [60, 65, 75, 255]);
    this.fillRect(cx - 1, cy - radius + 5, 2, (radius - 5) * 2, [60, 65, 75, 255]);
  }

  drawPriceBadge(cx, cy, radius, priceStr, scale = 2) {
    // Crisp white circle
    this.fillCircle(cx, cy, radius, [255, 255, 255, 255]);
    this.strokeCircle(cx, cy, radius, 2.5, [22, 28, 42, 255]);
    // Price text centered
    this.drawCenteredText(priceStr, cx, cy, scale, [18, 22, 34, 255]);
  }

  drawWingSpotBadge(x, y, w, h) {
    // Red curved shield/oval
    this.fillRoundedRect(x, y, w, h, 8, [185, 32, 28, 255]);
    this.strokeRoundedRect(x, y, w, h, 8, 2, [240, 195, 38, 255]);
    // Small golden wings on sides
    this.fillRect(x - 6, y + Math.floor(h / 2) - 2, 8, 4, [240, 195, 38, 255]);
    this.fillRect(x + w - 2, y + Math.floor(h / 2) - 2, 8, 4, [240, 195, 38, 255]);
    // Brand name
    this.drawCenteredText("WING SPOT", x + w / 2, y + h / 2, 1, [255, 255, 255, 255]);
  }

  toPngBuffer() {
    const rowSize = 1 + this.width * 4;
    const raw = Buffer.alloc(this.height * rowSize);
    for (let y = 0; y < this.height; y++) {
      const rowOffset = y * rowSize;
      raw[rowOffset] = 0; // Filter: None
      for (let x = 0; x < this.width; x++) {
        const idx = (y * this.width + x) * 4;
        const pxOffset = rowOffset + 1 + x * 4;
        raw[pxOffset] = this.data[idx];
        raw[pxOffset + 1] = this.data[idx + 1];
        raw[pxOffset + 2] = this.data[idx + 2];
        raw[pxOffset + 3] = this.data[idx + 3];
      }
    }

    const compressed = zlib.deflateSync(raw, { level: 9 });
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace
    const ihdrChunk = createChunk('IHDR', ihdr);

    // IDAT chunk
    const idatChunk = createChunk('IDAT', compressed);

    // IEND chunk
    const iendChunk = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
  }
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crcTable = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 4; i < 8 + len; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ chunk[i]) & 0xff];
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

let crcTableCache = null;
function getCrcTable() {
  if (crcTableCache) return crcTableCache;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  crcTableCache = table;
  return table;
}

// =========================================================================
// BOARD 1: LUNES - MARTES PROMOTIONAL SPECIALS (Matching Real Photo)
// Dimensions: 1024 x 450 (Aspect Ratio ~2.28:1 matching 1.64m x 0.72m)
// =========================================================================
function generatePromoBoard1() {
  const W = 1024, H = 450;
  // Outer frame tone (dark satin charcoal/black)
  const s = new Surface(W, H, [24, 25, 28, 255]);

  // Subtle metallic outer border & corner screws
  s.strokeRoundedRect(4, 4, W - 8, H - 8, 16, 4, [50, 52, 58, 255]);
  s.drawCornerScrew(24, 24, 10);
  s.drawCornerScrew(W - 24, 24, 10);
  s.drawCornerScrew(24, H - 24, 10);
  s.drawCornerScrew(W - 24, H - 24, 10);

  // Top header parchment/bone strip (Y: 16 to 96)
  const headerY = 16, headerH = 80;
  const boneParchment = [222, 214, 200, 255];
  const woodTanDark = [45, 38, 32, 255];
  const shadowTone = [160, 150, 136, 255];
  s.fillRoundedRect(16, headerY, W - 32, headerH, 10, boneParchment);

  // Wing Spot logo badge on top left
  s.drawWingSpotBadge(32, headerY + 18, 90, 44);

  // Center vertical dividing line across header (X = 512)
  const midX = Math.floor(W / 2);
  s.drawDottedVLine(midX, headerY + 10, headerY + headerH - 10, 8, 2.5, [130, 120, 108, 255]);

  // Headers in Western stylized carved typography
  const lunesCenterX = Math.round((midX + 120) / 2); // Center between logo and midX
  s.drawCenteredWesternText("LUNES", lunesCenterX, headerY + 40, 2, woodTanDark, shadowTone);

  const martesCenterX = Math.round((midX + W - 32) / 2);
  s.drawCenteredWesternText("MARTES", martesCenterX, headerY + 40, 2, woodTanDark, shadowTone);

  // Main body chalkboard slate panel (Y: 104 to H - 18)
  const bodyY = 104, bodyH = H - 18 - bodyY;
  const slateDark = [18, 25, 38, 255]; // Deep navy chalkboard
  const slateBorder = [220, 226, 235, 255];
  s.fillRoundedRect(16, bodyY, W - 32, bodyH, 12, slateDark);
  s.strokeRoundedRect(16, bodyY, W - 32, bodyH, 12, 3, slateBorder);

  // Vertical dotted divider line separating Lunes and Martes throughout body
  s.drawDottedVLine(midX, bodyY + 12, bodyY + bodyH - 12, 10, 3, [200, 210, 225, 255]);

  // -------------------------------------------------------------
  // LUNES CONTENT (LEFT HALF: X = 20 to midX - 10)
  // -------------------------------------------------------------
  const colL_Left = 36;
  const colL_Right = midX - 30;
  const row1_Y = bodyY + 36;
  const row2_Y = bodyY + Math.floor(bodyH / 2) + 40;

  // Row 1: - 2 SPOT BURGERS
  s.drawText("- 2 SPOT BURGERS", colL_Left, row1_Y, 2.5, [255, 255, 255, 255]);
  s.drawPriceBadge(colL_Right - 28, row1_Y + 10, 24, "S 99", 2.0);

  // Horizontal dotted divider in Lunes column
  const divY = bodyY + Math.floor(bodyH / 2);
  s.drawDottedHLine(colL_Left, colL_Right, divY, 10, 2.5, [100, 115, 140, 255]);

  // Row 2: - 2 SPOT JUNIOR.
  s.drawText("- 2 SPOT JUNIOR.", colL_Left, row2_Y, 2.5, [255, 255, 255, 255]);
  s.drawPriceBadge(colL_Right - 28, row2_Y + 10, 24, "S 89", 2.0);

  // -------------------------------------------------------------
  // MARTES CONTENT (RIGHT HALF: X = midX + 20 to W - 36)
  // -------------------------------------------------------------
  const colM_Left = midX + 36;
  const colM_Right = W - 46;

  // Top combo: COMBO POWER
  s.drawText("COMBO POWER", colM_Left, bodyY + 22, 2.2, [255, 255, 255, 255]);
  s.drawText("-PAPAS FRANCESAS", colM_Left + 10, bodyY + 46, 1.8, [205, 215, 230, 255]);
  s.drawText("-REFRESCO", colM_Left + 10, bodyY + 68, 1.8, [205, 215, 230, 255]);
  s.drawPriceBadge(colM_Right - 28, bodyY + 48, 26, "S 145", 2.0);

  // Horizontal dotted divider in Martes column
  s.drawDottedHLine(colM_Left, colM_Right, divY, 10, 2.5, [100, 115, 140, 255]);

  // Bottom combo: COMBO SPOT CHICKEN
  const mRow2_Y = divY + 16;
  s.drawText("COMBO SPOT CHICKEN.", colM_Left, mRow2_Y, 2.1, [255, 255, 255, 255]);
  s.drawText("-PAPAS FRANCESAS.", colM_Left + 10, mRow2_Y + 24, 1.8, [205, 215, 230, 255]);
  s.drawText("-REFRESCO.", colM_Left + 10, mRow2_Y + 46, 1.8, [205, 215, 230, 255]);
  s.drawPriceBadge(colM_Right - 28, mRow2_Y + 36, 26, "S 120", 2.0);

  return s;
}

// =========================================================================
// BOARD 2: MIERCOLES - JUEVES PROMOTIONAL SPECIALS (Matching Real Photo)
// Dimensions: 880 x 450 (Aspect Ratio ~1.95:1 matching 1.25m x 0.72m)
// =========================================================================
function generatePromoBoard2() {
  const W = 880, H = 450;
  const s = new Surface(W, H, [24, 25, 28, 255]);

  s.strokeRoundedRect(4, 4, W - 8, H - 8, 16, 4, [50, 52, 58, 255]);
  s.drawCornerScrew(24, 24, 10);
  s.drawCornerScrew(W - 24, 24, 10);
  s.drawCornerScrew(24, H - 24, 10);
  s.drawCornerScrew(W - 24, H - 24, 10);

  const headerY = 16, headerH = 80;
  const boneParchment = [222, 214, 200, 255];
  const woodTanDark = [45, 38, 32, 255];
  const shadowTone = [160, 150, 136, 255];
  s.fillRoundedRect(16, headerY, W - 32, headerH, 10, boneParchment);

  const midX = Math.floor(W / 2);
  s.drawDottedVLine(midX, headerY + 10, headerY + headerH - 10, 8, 2.5, [130, 120, 108, 255]);

  const miercolesCenterX = Math.round((16 + midX) / 2);
  s.drawCenteredWesternText("MIERCOLES", miercolesCenterX, headerY + 40, 2, woodTanDark, shadowTone);

  const juevesCenterX = Math.round((midX + W - 16) / 2);
  s.drawCenteredWesternText("JUEVES", juevesCenterX, headerY + 40, 2, woodTanDark, shadowTone);

  const bodyY = 104, bodyH = H - 18 - bodyY;
  const slateDark = [18, 25, 38, 255];
  const slateBorder = [220, 226, 235, 255];
  s.fillRoundedRect(16, bodyY, W - 32, bodyH, 12, slateDark);
  s.strokeRoundedRect(16, bodyY, W - 32, bodyH, 12, 3, slateBorder);

  s.drawDottedVLine(midX, bodyY + 12, bodyY + bodyH - 12, 10, 3, [200, 210, 225, 255]);
  const divY = bodyY + Math.floor(bodyH / 2);

  // -------------------------------------------------------------
  // MIERCOLES CONTENT (LEFT HALF)
  // -------------------------------------------------------------
  const colM_Left = 32;
  const colM_Right = midX - 26;

  // Row 1: COMBO PHILADELPHIA
  s.drawText("COMBO PHILADELPHIA", colM_Left, bodyY + 22, 2.0, [255, 255, 255, 255]);
  s.drawText("-PAPAS", colM_Left + 10, bodyY + 46, 1.8, [205, 215, 230, 255]);
  s.drawText("-REFRESCO", colM_Left + 10, bodyY + 68, 1.8, [205, 215, 230, 255]);
  s.drawPriceBadge(colM_Right - 26, bodyY + 48, 26, "S 125", 2.0);

  s.drawDottedHLine(colM_Left, colM_Right, divY, 10, 2.5, [100, 115, 140, 255]);

  // Row 2: COMBO SPOT BURGER
  const mRow2_Y = divY + 16;
  s.drawText("COMBO SPOT BURGER", colM_Left, mRow2_Y, 2.0, [255, 255, 255, 255]);
  s.drawText("-PAPAS FRANCESAS", colM_Left + 10, mRow2_Y + 24, 1.8, [205, 215, 230, 255]);
  s.drawText("-REFRESCO", colM_Left + 10, mRow2_Y + 46, 1.8, [205, 215, 230, 255]);
  s.drawPriceBadge(colM_Right - 26, mRow2_Y + 36, 26, "S 115", 2.0);

  // -------------------------------------------------------------
  // JUEVES CONTENT (RIGHT HALF)
  // -------------------------------------------------------------
  const colJ_Left = midX + 32;
  const colJ_Right = W - 36;

  // Row 1: COMBO POP CHICKEN
  s.drawText("COMBO POP CHICKEN", colJ_Left, bodyY + 22, 2.0, [255, 255, 255, 255]);
  s.drawText("-PAPAS FRANCESAS", colJ_Left + 10, bodyY + 46, 1.8, [205, 215, 230, 255]);
  s.drawText("-REFRESCO", colJ_Left + 10, bodyY + 68, 1.8, [205, 215, 230, 255]);
  s.drawPriceBadge(colJ_Right - 26, bodyY + 48, 26, "S 125", 2.0);

  s.drawDottedHLine(colJ_Left, colJ_Right, divY, 10, 2.5, [100, 115, 140, 255]);

  // Row 2: COMBO JALAPENO
  const jRow2_Y = divY + 16;
  s.drawText("COMBO JALAPENO", colJ_Left, jRow2_Y, 2.0, [255, 255, 255, 255]);
  s.drawText("-PAPAS FRANCESAS", colJ_Left + 10, jRow2_Y + 24, 1.8, [205, 215, 230, 255]);
  s.drawText("-REFRESCO", colJ_Left + 10, jRow2_Y + 46, 1.8, [205, 215, 230, 255]);
  s.drawPriceBadge(colJ_Right - 26, jRow2_Y + 36, 26, "S 125", 2.0);

  return s;
}

// Write to all target texture directories
const targets = [
  path.join(__dirname, '..', 'unity-client', 'Assets', 'Textures'),
  path.join(__dirname, '..', 'unity-client', 'Assets', 'StreamingAssets', 'Textures'),
  path.join(__dirname, '..', 'Builds', 'Windows', 'Textures'),
  path.join(__dirname, '..', 'Builds', 'Windows', 'MyVirtualCommunity_Data', 'Textures'),
  path.join(__dirname, '..', 'Builds', 'Windows', 'MyVirtualCommunity_Data', 'StreamingAssets', 'Textures')
];

console.log('Generating Wing Spot Promotional Posters matching real photograph...');

const b1 = generatePromoBoard1();
const b1Buf = b1.toPngBuffer();

const b2 = generatePromoBoard2();
const b2Buf = b2.toPngBuffer();

for (const targetDir of targets) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.writeFileSync(path.join(targetDir, 'WingSpot_Promo_Lunes_Martes.png'), b1Buf);
  fs.writeFileSync(path.join(targetDir, 'WingSpot_Promo_Miercoles_Jueves.png'), b2Buf);
  console.log(`Saved textures to: ${targetDir}`);
}

console.log('Successfully generated WingSpot promotional textures!');
