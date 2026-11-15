// scripts/generate-brand-textures.cjs
// Procedural high-resolution brand texture generator for MyVirtualCommunity
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Standard 8x8 basic ASCII font data (32 to 126)
const FONT_8X8 = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  '!': [0x18, 0x3c, 0x3c, 0x18, 0x18, 0x00, 0x18, 0x00],
  '•': [0x00, 0x00, 0x3c, 0x3c, 0x3c, 0x3c, 0x00, 0x00],
  '-': [0x00, 0x00, 0x00, 0x7e, 0x00, 0x00, 0x00, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00],
  ':': [0x00, 0x00, 0x18, 0x18, 0x00, 0x18, 0x18, 0x00],
  '/': [0x06, 0x0c, 0x18, 0x30, 0x60, 0xc0, 0x80, 0x00],
  '0': [0x3c, 0x66, 0x6e, 0x76, 0x66, 0x66, 0x3c, 0x00],
  '1': [0x18, 0x38, 0x18, 0x18, 0x18, 0x18, 0x7e, 0x00],
  '2': [0x3c, 0x66, 0x06, 0x1c, 0x30, 0x66, 0x7e, 0x00],
  '3': [0x3c, 0x66, 0x06, 0x1c, 0x06, 0x66, 0x3c, 0x00],
  '4': [0x0c, 0x1c, 0x3c, 0x6c, 0xfe, 0x0c, 0x0c, 0x00],
  '5': [0x7e, 0x60, 0x7c, 0x06, 0x06, 0x66, 0x3c, 0x00],
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
  'Z': [0x7e, 0x06, 0x0c, 0x18, 0x30, 0x60, 0x7e, 0x00],
  'a': [0x00, 0x00, 0x3c, 0x06, 0x3e, 0x66, 0x3e, 0x00],
  'b': [0x60, 0x60, 0x7c, 0x66, 0x66, 0x66, 0x7c, 0x00],
  'c': [0x00, 0x00, 0x3c, 0x66, 0x60, 0x66, 0x3c, 0x00],
  'd': [0x06, 0x06, 0x3e, 0x66, 0x66, 0x66, 0x3e, 0x00],
  'e': [0x00, 0x00, 0x3c, 0x66, 0x7e, 0x60, 0x3c, 0x00],
  'f': [0x1c, 0x30, 0x7c, 0x30, 0x30, 0x30, 0x30, 0x00],
  'g': [0x00, 0x00, 0x3e, 0x66, 0x66, 0x3e, 0x06, 0x3c],
  'h': [0x60, 0x60, 0x7c, 0x66, 0x66, 0x66, 0x66, 0x00],
  'i': [0x18, 0x00, 0x38, 0x18, 0x18, 0x18, 0x3c, 0x00],
  'j': [0x0c, 0x00, 0x1c, 0x0c, 0x0c, 0x0c, 0xcc, 0x78],
  'k': [0x60, 0x60, 0x66, 0x6c, 0x78, 0x6c, 0x66, 0x00],
  'l': [0x38, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3c, 0x00],
  'm': [0x00, 0x00, 0x66, 0x7f, 0x7f, 0x6b, 0x63, 0x00],
  'n': [0x00, 0x00, 0x7c, 0x66, 0x66, 0x66, 0x66, 0x00],
  'o': [0x00, 0x00, 0x3c, 0x66, 0x66, 0x66, 0x3c, 0x00],
  'p': [0x00, 0x00, 0x7c, 0x66, 0x66, 0x7c, 0x60, 0x60],
  'q': [0x00, 0x00, 0x3e, 0x66, 0x66, 0x3e, 0x06, 0x06],
  'r': [0x00, 0x00, 0x7c, 0x66, 0x60, 0x60, 0x60, 0x00],
  's': [0x00, 0x00, 0x3e, 0x60, 0x3c, 0x06, 0x7c, 0x00],
  't': [0x30, 0x30, 0x7c, 0x30, 0x30, 0x34, 0x18, 0x00],
  'u': [0x00, 0x00, 0x66, 0x66, 0x66, 0x66, 0x3e, 0x00],
  'v': [0x00, 0x00, 0x66, 0x66, 0x66, 0x3c, 0x18, 0x00],
  'w': [0x00, 0x00, 0x63, 0x6b, 0x7f, 0x77, 0x63, 0x00],
  'x': [0x00, 0x00, 0x66, 0x3c, 0x18, 0x3c, 0x66, 0x00],
  'y': [0x00, 0x00, 0x66, 0x66, 0x66, 0x3e, 0x06, 0x3c],
  'z': [0x00, 0x00, 0x7e, 0x0c, 0x18, 0x30, 0x7e, 0x00],
  'á': [0x0c, 0x18, 0x3c, 0x06, 0x3e, 0x66, 0x3e, 0x00],
  'é': [0x0c, 0x18, 0x3c, 0x66, 0x7e, 0x60, 0x3c, 0x00],
  'í': [0x0c, 0x18, 0x38, 0x18, 0x18, 0x18, 0x3c, 0x00],
  'ó': [0x0c, 0x18, 0x3c, 0x66, 0x66, 0x66, 0x3c, 0x00],
  'ú': [0x0c, 0x18, 0x66, 0x66, 0x66, 0x66, 0x3e, 0x00],
  'Í': [0x18, 0x30, 0x3c, 0x18, 0x18, 0x18, 0x3c, 0x00],
  '¡': [0x00, 0x18, 0x00, 0x18, 0x18, 0x3c, 0x3c, 0x18],
  '&': [0x18, 0x24, 0x24, 0x18, 0x2a, 0x44, 0x2a, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00],
  ',': [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x30],
  '-': [0x00, 0x00, 0x00, 0x7e, 0x00, 0x00, 0x00, 0x00],
  'ñ': [0x74, 0x00, 0x7c, 0x66, 0x66, 0x66, 0x66, 0x00],
  'Ñ': [0x38, 0x00, 0x66, 0x76, 0x7e, 0x6e, 0x66, 0x00]
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

  fillEllipse(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry);
        if (d <= 1.0) {
          this.setPixel(x, y, color);
        }
      }
    }
  }

  strokeEllipse(cx, cy, rx, ry, strokeWidth, color) {
    const rxIn = rx - strokeWidth / 2;
    const ryIn = ry - strokeWidth / 2;
    const rxOut = rx + strokeWidth / 2;
    const ryOut = ry + strokeWidth / 2;
    for (let y = Math.floor(cy - ryOut); y <= Math.ceil(cy + ryOut); y++) {
      for (let x = Math.floor(cx - rxOut); x <= Math.ceil(cx + rxOut); x++) {
        const dOut = ((x - cx) * (x - cx)) / (rxOut * rxOut) + ((y - cy) * (y - cy)) / (ryOut * ryOut);
        const dIn = ((x - cx) * (x - cx)) / (rxIn * rxIn) + ((y - cy) * (y - cy)) / (ryIn * ryIn);
        if (dOut <= 1.0 && dIn >= 1.0) {
          this.setPixel(x, y, color);
        }
      }
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
    const idatData = zlib.deflateSync(raw);

    function crc32(buf) {
      let table = [];
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        table[i] = c >>> 0;
      }
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function chunk(type, data) {
      const typeBuf = Buffer.from(type);
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(data.length, 0);
      const crcVal = crc32(Buffer.concat([typeBuf, data]));
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crcVal, 0);
      return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
    }

    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    return Buffer.concat([
      sig,
      chunk('IHDR', ihdr),
      chunk('IDAT', idatData),
      chunk('IEND', Buffer.alloc(0))
    ]);
  }
}

// -------------------------------------------------------------
// 1. Generate WingSpot_Sign_Logo.png (512x512)
// Authentic circular sign with transparent cutout background
// -------------------------------------------------------------
function generateWingSpotLogo() {
  const s = new Surface(512, 512, [0, 0, 0, 0]);
  const cx = 256, cy = 256;

  // Dark charcoal outer rim ring
  s.fillCircle(cx, cy, 250, [26, 26, 30, 255]);
  // Accent golden rim
  s.strokeCircle(cx, cy, 246, 6, [245, 158, 11, 255]);
  // Inner white circle face
  s.fillCircle(cx, cy, 240, [252, 252, 252, 255]);
  // Inner dark border
  s.strokeCircle(cx, cy, 238, 4, [26, 26, 30, 255]);

  // Graphic: Red flame wings and burger emblem
  const redEmblem = [220, 38, 38, 255]; // Coral crimson red
  const goldEmblem = [245, 158, 11, 255];
  const darkCharcoal = [24, 24, 27, 255];

  // Stylized flames/crest on top (Y: 90 to 140)
  s.fillCircle(cx, 120, 32, redEmblem);
  s.fillCircle(cx - 20, 130, 24, redEmblem);
  s.fillCircle(cx + 20, 130, 24, redEmblem);

  // Wings flanking the burger (X: 130 to 380, Y: 155 to 195)
  for (let i = 0; i < 4; i++) {
    const yOff = 160 + i * 10;
    const wOff = 60 - i * 10;
    // Left wing feathers
    s.fillRect(cx - 50 - wOff, yOff, wOff, 6, redEmblem);
    // Right wing feathers
    s.fillRect(cx + 50, yOff, wOff, 6, redEmblem);
  }

  // Burger Bun & Patty emblem in center (Y: 155 to 205)
  s.fillEllipse(cx, 168, 46, 20, goldEmblem); // Top bun
  s.strokeEllipse(cx, 168, 46, 20, 3, redEmblem);
  s.fillRect(cx - 44, 182, 88, 8, [180, 83, 9, 255]); // Patty
  s.fillRect(cx - 40, 192, 80, 6, [22, 101, 52, 255]); // Lettuce
  s.fillEllipse(cx, 202, 42, 12, goldEmblem); // Bottom bun
  s.strokeEllipse(cx, 202, 42, 12, 3, redEmblem);

  // Main bold brand text: "WINGS • SPOT" (Y: 265)
  s.drawCenteredText("WINGS • SPOT", cx, 275, 4.2, darkCharcoal);

  // Divider lines
  s.fillRect(cx - 160, 320, 320, 3, redEmblem);
  s.fillRect(cx - 130, 326, 260, 2, goldEmblem);

  // Subtitle: "ALITAS • BURGERS • SNACKS" (Y: 350)
  s.drawCenteredText("ALITAS • BURGERS • SNACKS", cx, 355, 2.0, [55, 65, 81, 255]);

  // Bottom stars / cutlery accent
  s.drawCenteredText("★  GOMEZ MORIN  ★", cx, 400, 1.8, redEmblem);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 2. Generate TiaLupe_Fascia_Sign.png (512x128)
// Striped fascia with central oval mascot badge
// -------------------------------------------------------------
function generateTiaLupeFascia() {
  const s = new Surface(512, 128, [24, 24, 27, 255]);

  // Alternating black and white vertical stripes (stripe width: 16px)
  for (let x = 0; x < 512; x += 32) {
    s.fillRect(x + 16, 0, 16, 128, [248, 250, 252, 255]); // White stripe
  }

  // Central white oval badge (matching real photographic ground truth)
  const cx = 256, cy = 64;
  const rx = 155, ry = 52;

  // Dark outline & gold ring
  s.fillEllipse(cx, cy, rx + 4, ry + 4, [24, 24, 27, 255]);
  s.strokeEllipse(cx, cy, rx + 2, ry + 2, 3, [245, 158, 11, 255]);
  s.fillEllipse(cx, cy, rx, ry, [255, 255, 255, 255]);
  s.strokeEllipse(cx, cy, rx - 3, ry - 3, 2, [220, 38, 38, 255]); // Red inner accent

  // Chef silhouette mascot at top of oval (Y: 28)
  const redColor = [185, 28, 28, 255]; // Deep ruby bakery red
  s.fillCircle(cx, 32, 14, redColor);
  s.fillEllipse(cx, 24, 18, 9, redColor); // Chef hat puff

  // Main Script: "La Tía Lupe" (Y: 58)
  s.drawCenteredText("La Tia Lupe", cx, 60, 3.2, redColor);

  // Subtitle: "Panadería • Pastelería" (Y: 88)
  s.drawCenteredText("PANADERIA • PASTELERIA", cx, 88, 1.5, [31, 41, 55, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 3. Generate TiaLupe_Awning_Real.png (512x128)
// Sloped awning striped pattern with central script badge
// -------------------------------------------------------------
function generateTiaLupeAwning() {
  const s = new Surface(512, 128, [24, 24, 27, 255]);

  // Striped pattern (alternating black and white, width 16px)
  for (let x = 0; x < 512; x += 32) {
    s.fillRect(x + 16, 0, 16, 128, [248, 250, 252, 255]);
  }

  // Scalloped bottom fringe / valance
  for (let x = 0; x < 512; x += 16) {
    s.fillCircle(x + 8, 124, 8, [248, 250, 252, 255]);
  }

  // Central oval badge
  const cx = 256, cy = 60;
  const rx = 135, ry = 44;
  s.fillEllipse(cx, cy, rx + 4, ry + 4, [24, 24, 27, 255]);
  s.fillEllipse(cx, cy, rx, ry, [255, 255, 255, 255]);
  s.strokeEllipse(cx, cy, rx - 2, ry - 2, 2, [185, 28, 28, 255]);

  const redColor = [185, 28, 28, 255];
  s.drawCenteredText("La Tia Lupe", cx, 52, 3.0, redColor);
  s.drawCenteredText("PASTELERIA", cx, 78, 1.6, [31, 41, 55, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 4. Generate Billboard_Ad_Izzi.png (512x288)
// Authentic Izzi telecom advertisement on Gómez Morín
// -------------------------------------------------------------
function generateBillboardAd() {
  const s = new Surface(512, 288, [2, 132, 199, 255]); // Sky blue brand color

  // Top banner gradient / darker blue header
  s.fillRect(0, 0, 512, 70, [3, 105, 161, 255]);

  // Izzi brand logo (Bold lowercase "izzi")
  s.drawText("izzi", 35, 18, 5.0, [255, 255, 255, 255]);

  // Headline: "¡El doble de velocidad!"
  s.drawText("¡EL DOBLE DE VELOCIDAD!", 35, 95, 2.8, [255, 255, 255, 255]);

  // High-visibility yellow promotion badge
  s.fillRect(35, 140, 442, 65, [254, 240, 138, 255]);
  s.strokeRect = function(x, y, w, h, col) {
    s.fillRect(x, y, w, 2, col);
    s.fillRect(x, y + h - 2, w, 2, col);
    s.fillRect(x, y, 2, h, col);
    s.fillRect(x + w - 2, y, 2, h, col);
  };
  s.strokeRect(35, 140, 442, 65, [234, 179, 8, 255]);

  s.drawText("500 MEGAS AL PRECIO DE 250", 55, 155, 2.4, [15, 23, 42, 255]);
  s.drawText("POR SOLO $350 AL MES", 55, 180, 1.8, [220, 38, 38, 255]);

  // Footer bar: Contact & terms
  s.fillRect(0, 240, 512, 48, [15, 23, 42, 255]);
  s.drawText("CONTRATA HOY: 800 120 4000  •  izzi.mx", 40, 255, 1.8, [248, 250, 252, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 5. Generate HRC_Tower_Sign.png (512x256)
// Realistic dark charcoal stacked slate stone facade for HRC entrance tower
// -------------------------------------------------------------
function generateHrcTowerSign() {
  const s = new Surface(512, 256, [32, 34, 38, 255]); // Charcoal stacked slate base

  // Seeded procedural generator for consistent, realistic stone courses
  let seed = 987654321;
  function rnd() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  let y = 0;
  while (y < 256) {
    const courseH = 10 + Math.floor(rnd() * 14); // 10px to 23px per stone course
    const actualH = Math.min(courseH, 256 - y);

    let x = 0;
    while (x < 512) {
      const stoneW = 32 + Math.floor(rnd() * 64); // 32px to 95px wide
      const actualW = Math.min(stoneW, 512 - x);

      const tone = 26 + Math.floor(rnd() * 30); // Natural slate tone variation
      const stoneColor = [tone, Math.min(255, tone + 2), Math.min(255, tone + 4), 255];
      s.fillRect(x, y, actualW, actualH, stoneColor);

      // Top edge highlight (slanted sunlight catch on splitface slate)
      const hiColor = [Math.min(255, tone + 24), Math.min(255, tone + 26), Math.min(255, tone + 30), 255];
      s.fillRect(x, y, actualW, 2, hiColor);

      // Bottom edge shadow groove
      const shColor = [Math.max(0, tone - 16), Math.max(0, tone - 16), Math.max(0, tone - 14), 255];
      s.fillRect(x, y + actualH - 2, actualW, 2, shColor);

      // Vertical stone joint shadow
      s.fillRect(x + actualW - 2, y, 2, actualH, [16, 18, 22, 255]);

      x += actualW;
    }
    y += actualH;
  }

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 6. Generate HRC_Product_Frieze.png (1024x128)
// Black frieze with crisp white "PINTURAS  PIEDRAS  PISOS"
// -------------------------------------------------------------
function generateHrcProductFrieze() {
  const s = new Surface(1024, 128, [18, 20, 24, 255]); // Matte black

  // Border accents
  s.fillRect(0, 0, 1024, 4, [45, 48, 54, 255]);
  s.fillRect(0, 124, 1024, 4, [45, 48, 54, 255]);

  // Clean spaced product categories
  s.drawCenteredText("PINTURAS     PIEDRAS     PISOS", 512, 64, 3.2, [255, 255, 255, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 7. Generate HRC_Green_Wall.png (512x512)
// Rich procedural artificial foliage / vertical living wall
// -------------------------------------------------------------
function generateHrcGreenWall() {
  const s = new Surface(512, 512, [28, 62, 30, 255]); // Base deep forest green

  // Seeded pseudo-random generator for reproducibility
  let seed = 123456789;
  function rnd() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  const greens = [
    [40, 105, 45, 255],
    [52, 132, 58, 255],
    [24, 72, 28, 255],
    [65, 158, 72, 255],
    [34, 92, 40, 255],
    [48, 120, 52, 255]
  ];

  // Overlapping foliage leaf clusters
  for (let i = 0; i < 900; i++) {
    const cx = Math.floor(rnd() * 512);
    const cy = Math.floor(rnd() * 512);
    const rx = 6 + Math.floor(rnd() * 10);
    const ry = 4 + Math.floor(rnd() * 8);
    const col = greens[Math.floor(rnd() * greens.length)];
    s.fillEllipse(cx, cy, rx, ry, col);
  }

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 8. Generate HRC_Wood_Decking.png (512x256)
// Modern horizontal composite wood slats / decking
// -------------------------------------------------------------
function generateHrcWoodDecking() {
  const s = new Surface(512, 256, [85, 55, 38, 255]); // Rich teak/walnut base

  const slatHeight = 24;
  for (let y = 0; y < 256; y += slatHeight) {
    // Slat wood tone with subtle grain
    const col = (Math.floor(y / slatHeight) % 2 === 0) ? [95, 62, 42, 255] : [82, 52, 35, 255];
    s.fillRect(0, y, 512, slatHeight - 3, col);
    // Subtle grain highlight
    s.fillRect(0, y + 4, 512, 2, [110, 72, 48, 255]);
    // Dark shadow groove between slats
    s.fillRect(0, y + slatHeight - 3, 512, 3, [28, 18, 12, 255]);
  }

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 9. Generate HRC_Kiosk_Graphic.png (512x256)
// Corner vitrine display: COMPOSITE DECK / ULTRASHIELD
// -------------------------------------------------------------
function generateHrcKioskGraphic() {
  const s = new Surface(512, 256, [18, 18, 20, 255]); // Deep charcoal/black

  // Green horizontal accent stripe
  s.fillRect(0, 105, 512, 12, [34, 197, 94, 255]);

  s.drawCenteredText("COMPOSITE DECK", 256, 55, 2.8, [255, 255, 255, 255]);
  s.drawCenteredText("ULTRASHIELD", 256, 150, 3.8, [255, 255, 255, 255]);
  s.drawCenteredText("ADVANCED COMPOSITE SIDING", 256, 195, 1.6, [156, 163, 175, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 10. Generate HRC_Logo_Medallion.png (256x256)
// Circular blue & white emblem on center facade
// -------------------------------------------------------------
function generateHrcLogoMedallion() {
  const s = new Surface(256, 256, [0, 0, 0, 0]); // Transparent background

  // White base disc
  s.fillCircle(128, 128, 112, [255, 255, 255, 255]);
  // Sky blue outer border
  s.strokeCircle(128, 128, 106, 10, [14, 165, 233, 255]);

  // Central blue crest & stylized icon
  s.fillCircle(128, 128, 48, [14, 165, 233, 255]);
  s.drawCenteredText("HRC", 128, 128, 2.2, [255, 255, 255, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 11. Generate Sign_Del_Porvenir.png (512x128)
// Municipal street blade: C. DEL PORVENIR
// -------------------------------------------------------------
function generateSignDelPorvenir() {
  const s = new Surface(512, 128, [11, 83, 40, 255]); // Municipal forest green

  // White border inset
  const t = 4;
  s.fillRect(8, 8, 496, t, [255, 255, 255, 255]);
  s.fillRect(8, 120 - t, 496, t, [255, 255, 255, 255]);
  s.fillRect(8, 8, t, 112, [255, 255, 255, 255]);
  s.fillRect(504 - t, 8, t, 112, [255, 255, 255, 255]);

  s.drawCenteredText("C. DEL PORVENIR", 256, 50, 3.2, [255, 255, 255, 255]);
  s.drawCenteredText("CD. JUAREZ, CHIH.", 256, 92, 1.4, [215, 240, 220, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 12. Generate Sign_Gomez_Morin.png (768x128)
// Municipal street blade: BLVD. M. GOMEZ MORIN (optimized blade length)
// -------------------------------------------------------------
function generateSignGomezMorin() {
  const s = new Surface(768, 128, [11, 83, 40, 255]); // Municipal forest green

  // White border inset
  const t = 4;
  s.fillRect(8, 8, 752, t, [255, 255, 255, 255]);
  s.fillRect(8, 120 - t, 752, t, [255, 255, 255, 255]);
  s.fillRect(8, 8, t, 112, [255, 255, 255, 255]);
  s.fillRect(760 - t, 8, t, 112, [255, 255, 255, 255]);

  s.drawCenteredText("BLVD. M. GOMEZ MORIN", 384, 50, 3.4, [255, 255, 255, 255]);
  s.drawCenteredText("CD. JUAREZ, CHIH.", 384, 92, 1.4, [215, 240, 220, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 13. Generate Sign_Arboleda.png (512x128)
// Municipal street blade: C. DE LA ARBOLEDA
// -------------------------------------------------------------
function generateSignArboleda() {
  const s = new Surface(512, 128, [11, 83, 40, 255]); // Municipal forest green

  // White border inset
  const t = 4;
  s.fillRect(8, 8, 496, t, [255, 255, 255, 255]);
  s.fillRect(8, 120 - t, 496, t, [255, 255, 255, 255]);
  s.fillRect(8, 8, t, 112, [255, 255, 255, 255]);
  s.fillRect(504 - t, 8, t, 112, [255, 255, 255, 255]);

  s.drawCenteredText("C. DE LA ARBOLEDA", 256, 50, 3.0, [255, 255, 255, 255]);
  s.drawCenteredText("CD. JUAREZ, CHIH.", 256, 92, 1.4, [215, 240, 220, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 14. Generate Dollar2Go_Compra_Fascia.png (512x256)
// Left half of drive-thru canopy fascia: "COMPRA" in red neon/LED on black steel mesh
// -------------------------------------------------------------
function generateDollar2GoCompra() {
  const s = new Surface(512, 256, [20, 20, 24, 255]); // Dark charcoal steel

  // Grid mesh relief lines
  for (let y = 0; y < 256; y += 12) {
    s.fillRect(0, y, 512, 1, [36, 38, 44, 255]);
  }
  for (let x = 0; x < 512; x += 16) {
    s.fillRect(x, 0, 1, 256, [36, 38, 44, 255]);
  }

  // Steel border frame
  s.fillRect(0, 0, 512, 10, [10, 10, 12, 255]);
  s.fillRect(0, 246, 512, 10, [10, 10, 12, 255]);
  s.fillRect(0, 0, 10, 256, [10, 10, 12, 255]);
  s.fillRect(502, 0, 10, 256, [10, 10, 12, 255]);

  // Bold Red Illuminated "COMPRA"
  const redGlow = [230, 30, 30, 255];
  s.drawCenteredText("COMPRA", 256, 95, 6.8, redGlow);

  // Subtext: "TIPO DE CAMBIO • DRIVE THRU"
  s.drawCenteredText("TIPO DE CAMBIO • AUTO SERVICIO", 256, 178, 1.8, [220, 220, 230, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 15. Generate Dollar2Go_Brand_Fascia.png (512x256)
// Right half of drive-thru canopy fascia: "Dollar 2 Go" on silver mesh panel
// -------------------------------------------------------------
function generateDollar2GoBrand() {
  const s = new Surface(512, 256, [192, 196, 202, 255]); // Light metallic silver/grey mesh

  // Dark border frame
  s.fillRect(0, 0, 512, 10, [20, 20, 24, 255]);
  s.fillRect(0, 246, 512, 10, [20, 20, 24, 255]);
  s.fillRect(0, 0, 10, 256, [20, 20, 24, 255]);
  s.fillRect(502, 0, 10, 256, [20, 20, 24, 255]);

  // Subtle architectural diamond/cross mesh lines
  for (let y = 10; y < 246; y += 8) {
    s.fillRect(10, y, 492, 1, [170, 175, 182, 255]);
  }

  // Red and black Dollar 2 Go brand typography
  // Shadow
  s.drawCenteredText("Dollar 2 Go", 258, 88, 5.8, [20, 20, 24, 255]);
  // Main red text
  s.drawCenteredText("Dollar 2 Go", 256, 86, 5.8, [220, 28, 28, 255]);

  // Subtitle: "CENTRO CAMBIARIO"
  s.drawCenteredText("CENTRO CAMBIARIO", 256, 172, 2.5, [24, 24, 28, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
function generateAttBuildingLogo() {
  // 512x256 architectural sign with transparent/clear glass backing
  const s = new Surface(512, 256, [0, 0, 0, 0]);

  // Subtle architectural backplate with rounded bevel
  s.fillRect(8, 8, 496, 240, [15, 22, 32, 215]); // Deep architectural blue-grey
  s.fillRect(10, 10, 492, 236, [24, 34, 48, 235]);
  // Border accent
  s.fillRect(8, 8, 496, 3, [0, 168, 235, 255]);
  s.fillRect(8, 245, 496, 3, [0, 168, 235, 255]);

  // Draw AT&T Globe Icon on the left
  const cx = 110;
  const cy = 128;
  const radius = 64;

  // Globe base circle: AT&T Cyan / Sky Blue
  s.fillCircle(cx, cy, radius, [0, 160, 228, 255]);

  // Striated rings of the AT&T Globe
  const numStripes = 12;
  for (let i = 0; i < numStripes; i++) {
    const yRel = (i / (numStripes - 1)) * 2 - 1; // -1 to 1
    const yPos = cy + yRel * (radius - 4);
    const chordLen = Math.sqrt(Math.max(0, radius * radius - (yPos - cy) * (yPos - cy)));
    if (i % 2 === 1) {
      const stripeHeight = 4 + Math.round(Math.cos(yRel * Math.PI * 0.5) * 5);
      const stripeColor = [255, 255, 255, 220]; // White/highlight striping
      s.fillEllipse(cx, yPos, chordLen * 0.95, stripeHeight * 0.6, stripeColor);
    } else {
      const stripeHeight = 3 + Math.round(Math.cos(yRel * Math.PI * 0.5) * 4);
      const stripeColor = [0, 120, 190, 255]; // Darker blue core shadow
      s.fillEllipse(cx, yPos, chordLen * 0.92, stripeHeight * 0.5, stripeColor);
    }
  }

  // Rim highlight on the globe
  s.strokeCircle(cx, cy, radius, 3, [220, 245, 255, 240]);

  // "at&t" Typography on the right
  // Shadow
  s.drawText("at&t", 204, 86, 9.5, [10, 15, 25, 240]);
  // Main crisp white / cyan-lit typography
  s.drawText("at&t", 200, 82, 9.5, [255, 255, 255, 255]);

  // Lower subtitle: "CORPORATIVO"
  s.drawText("CORPORATIVO", 202, 172, 2.6, [0, 185, 255, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
function generateAttMupiPoster() {
  // 256x512 vertical Mupi advertising panel
  const s = new Surface(256, 512, [245, 248, 252, 255]);

  // Frame border
  s.fillRect(0, 0, 256, 12, [30, 32, 38, 255]);
  s.fillRect(0, 500, 256, 12, [30, 32, 38, 255]);
  s.fillRect(0, 0, 12, 512, [30, 32, 38, 255]);
  s.fillRect(244, 0, 12, 512, [30, 32, 38, 255]);

  // Top header: AT&T Blue banner
  s.fillRect(12, 12, 232, 110, [0, 159, 219, 255]);
  // Globe icon
  s.fillCircle(60, 68, 30, [255, 255, 255, 255]);
  s.fillCircle(60, 68, 26, [0, 120, 190, 255]);
  for (let dy = -20; dy <= 20; dy += 8) {
    s.fillRect(38, 68 + dy, 44, 3, [255, 255, 255, 200]);
  }
  s.drawText("at&t", 102, 52, 5.0, [255, 255, 255, 255]);

  // Middle graphic: "RED 5G MÁS RÁPIDA"
  s.fillRect(12, 122, 232, 40, [10, 20, 35, 255]);
  s.drawCenteredText("EXPERIMENTA 5G", 128, 134, 2.2, [0, 220, 255, 255]);

  // Smartphone graphic presentation
  s.fillRect(68, 185, 120, 200, [25, 28, 35, 255]); // Phone body
  s.fillRect(72, 190, 112, 190, [8, 14, 26, 255]);  // Phone screen
  // Screen content: cyan signal waves
  s.strokeCircle(128, 280, 25, 3, [0, 180, 255, 240]);
  s.strokeCircle(128, 280, 45, 3, [0, 210, 255, 180]);
  s.strokeCircle(128, 280, 65, 3, [0, 240, 255, 120]);
  s.drawCenteredText("5G", 128, 270, 3.2, [255, 255, 255, 255]);

  // Promotion text
  s.drawCenteredText("VELOCIDAD & PODER", 128, 405, 2.0, [20, 30, 45, 255]);
  s.drawCenteredText("CONECTATE HOY", 128, 430, 2.3, [0, 140, 220, 255]);

  // Footer bar
  s.fillRect(12, 465, 232, 35, [0, 159, 219, 255]);
  s.drawCenteredText("att.com.mx", 128, 477, 1.8, [255, 255, 255, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 17. Generate WingSpot_Synthetic_Grass_Wall.png (512x512)
// High-resolution seamless synthetic grass / artificial turf tapestry
// Designed for Wing Spot storage room customer-facing accent wall (Matte Finish)
// -------------------------------------------------------------
function generateWingSpotSyntheticGrassWall() {
  const w = 512, h = 512;
  // Muted, deep, earthy matte forest lawn base (less saturation, zero neon)
  const s = new Surface(w, h, [20, 44, 22, 255]);

  let seed = 987654321;
  function rnd() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }

  function setWrappedPixel(x, y, color) {
    x = Math.floor(x);
    y = Math.floor(y);
    x = ((x % w) + w) % w;
    y = ((y % h) + h) % h;
    s.setPixel(x, y, color);
  }

  // Background thatch texture & micro-noise with muted matte tones
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (rnd() - 0.5) * 16;
      const r = Math.max(12, Math.min(40, 20 + n * 0.35));
      const g = Math.max(30, Math.min(65, 46 + n * 0.7));
      const b = Math.max(12, Math.min(38, 22 + n * 0.35));
      s.setPixel(x, y, [Math.round(r), Math.round(g), Math.round(b), 255]);
    }
  }

  // Multi-layer synthetic grass blades: subdued matte green, natural tones
  const bladePalettes = [
    { base: [16, 38, 18, 255], tip: [26, 56, 26, 255] },  // Deep shadow under-blade
    { base: [22, 52, 22, 255], tip: [34, 76, 32, 255] },  // Subdued mid-tone
    { base: [28, 65, 26, 255], tip: [44, 94, 38, 255] },  // Natural matte grass
    { base: [34, 75, 30, 255], tip: [52, 108, 44, 255] }, // Soft meadow tone
    { base: [36, 62, 24, 255], tip: [50, 84, 32, 255] },  // Warm olive thatch
    { base: [40, 85, 34, 255], tip: [58, 118, 48, 255] }  // Muted matte highlight
  ];

  const totalBlades = 36000;
  for (let i = 0; i < totalBlades; i++) {
    const x0 = rnd() * w;
    const y0 = rnd() * h;
    const len = 10 + Math.floor(rnd() * 18);
    const dx = (rnd() - 0.5) * (len * 0.45);
    const pal = bladePalettes[Math.floor(rnd() * bladePalettes.length)];

    for (let step = 0; step < len; step++) {
      const t = step / len;
      const curX = x0 + dx * t;
      const curY = y0 - step;
      const r = Math.round(pal.base[0] * (1 - t) + pal.tip[0] * t);
      const g = Math.round(pal.base[1] * (1 - t) + pal.tip[1] * t);
      const b = Math.round(pal.base[2] * (1 - t) + pal.tip[2] * t);
      setWrappedPixel(curX, curY, [r, g, b, 255]);
      if (t < 0.6) {
        setWrappedPixel(curX + 1, curY, [Math.round(r * 0.85), Math.round(g * 0.85), Math.round(b * 0.85), 255]);
      }
    }
  }

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// Wing Spot Dining Hall Smart TV Screen Graphic
// 16:9 widescreen sports broadcast display (Rayados vs Tigres Clásico Regio)
// -------------------------------------------------------------
function generateWingSpotSmartTvScreen() {
  const w = 768, h = 432;
  const s = new Surface(w, h, [10, 14, 26, 255]); // Dark stadium blue base

  // 1. Stadium background gradient & turf field
  for (let y = 0; y < h; y++) {
    let r, g, b;
    if (y < 230) {
      // Upper stadium night sky / lights
      const st = y / 230;
      r = Math.round(10 * (1 - st) + 20 * st);
      g = Math.round(16 * (1 - st) + 48 * st);
      b = Math.round(36 * (1 - st) + 64 * st);
    } else {
      // Lower green soccer/football pitch
      const pt = (y - 230) / (h - 230);
      r = Math.round(18 * (1 - pt) + 12 * pt);
      g = Math.round(75 * (1 - pt) + 40 * pt);
      b = Math.round(34 * (1 - pt) + 20 * pt);
    }
    for (let x = 0; x < w; x++) {
      s.setPixel(x, y, [r, g, b, 255]);
    }
  }

  // Soft stadium floodlights (Upper left and upper right glow)
  s.fillCircle(140, 80, 70, [200, 225, 255, 35]);
  s.fillCircle(140, 80, 45, [220, 240, 255, 60]);
  s.fillCircle(140, 80, 20, [255, 255, 255, 120]);

  s.fillCircle(628, 80, 70, [200, 225, 255, 35]);
  s.fillCircle(628, 80, 45, [220, 240, 255, 60]);
  s.fillCircle(628, 80, 20, [255, 255, 255, 120]);

  // Pitch white line markings (perspective lines on grass)
  for (let x = 0; x < w; x++) {
    s.setPixel(x, 260, [200, 230, 200, 120]);
    s.setPixel(x, 261, [220, 245, 220, 160]);
  }
  // Center circle on pitch
  s.strokeEllipse(384, 305, 90, 32, 2, [210, 240, 210, 140]);
  s.fillCircle(384, 305, 3, [230, 255, 230, 180]);

  // 2. Top Broadcast Info Header Bar (Glass panel)
  s.fillRect(16, 12, w - 32, 44, [12, 16, 26, 230]);
  s.fillRect(16, 55, w - 32, 2, [60, 90, 130, 200]);

  // Live Red Pill
  s.fillRect(26, 18, 92, 32, [220, 30, 30, 255]);
  s.fillCircle(38, 34, 4, [255, 255, 255, 255]);
  s.drawText('EN VIVO', 48, 26, 2, [255, 255, 255, 255]);

  // Channel Title
  s.drawText('WING SPOT SPORTS HD', 132, 26, 2, [255, 215, 30, 255]);

  // Match / Tournament Label
  s.drawCenteredText('LIGA MX • GRAN FINAL', 384, 34, 2, [210, 230, 255, 255]);

  // Time & Tech Info
  s.drawText('20:45 • 4K UHD', w - 176, 26, 2, [180, 205, 235, 255]);

  // 3. Center Live Scoreboard Banner (x: 124 to 644, y: 110 to 198, w: 520, h: 88)
  const sbX = 124, sbY = 110, sbW = 520, sbH = 88;
  s.fillRect(sbX - 2, sbY - 2, sbW + 4, sbH + 4, [0, 0, 0, 180]);
  s.fillRect(sbX, sbY, sbW, sbH, [14, 20, 32, 245]);
  s.fillRect(sbX, sbY + sbH - 3, sbW, 3, [240, 190, 40, 255]); // Gold bottom strip

  // Home Team (Rayados / Monterrey - Navy/Blue)
  s.fillRect(sbX + 8, sbY + 8, 180, sbH - 16, [20, 45, 105, 255]);
  s.fillRect(sbX + 8, sbY + 8, 8, sbH - 16, [255, 255, 255, 255]); // White stripe
  s.drawCenteredText('MONTERREY', sbX + 98, sbY + 36, 2, [255, 255, 255, 255]);
  s.drawCenteredText('LOCAL', sbX + 98, sbY + 58, 1, [160, 195, 245, 255]);

  // Score Center Area
  s.fillRect(sbX + 196, sbY + 8, 128, sbH - 16, [10, 14, 22, 255]);
  s.drawCenteredText('2 - 1', sbX + 260, sbY + 36, 4, [255, 230, 100, 255]);
  s.drawCenteredText('78:24 • 2T', sbX + 260, sbY + 62, 1, [110, 240, 140, 255]);

  // Away Team (Tigres - Amber/Gold)
  s.fillRect(sbX + 332, sbY + 8, 180, sbH - 16, [190, 125, 15, 255]);
  s.fillRect(sbX + 332 + 172, sbY + 8, 8, sbH - 16, [20, 45, 105, 255]); // Blue stripe
  s.drawCenteredText('TIGRES', sbX + 422, sbY + 36, 2, [255, 255, 255, 255]);
  s.drawCenteredText('VISITANTE', sbX + 422, sbY + 58, 1, [255, 235, 180, 255]);

  // Subtitle pill under scoreboard
  s.fillRect(234, 206, 300, 26, [16, 24, 40, 220]);
  s.drawCenteredText('ESTADIO BBVA • ASISTENCIA: 51,348', 384, 219, 1, [200, 220, 245, 255]);

  // 4. Match Stat Summary Boxes
  s.fillRect(154, 244, 140, 36, [14, 20, 32, 210]);
  s.drawCenteredText('TIROS A GOL: 8', 224, 256, 1, [230, 240, 255, 255]);
  s.drawCenteredText('POSESION: 54-46', 224, 268, 1, [140, 200, 255, 255]);

  s.fillRect(474, 244, 140, 36, [14, 20, 32, 210]);
  s.drawCenteredText('TIROS A GOL: 6', 544, 256, 1, [230, 240, 255, 255]);
  s.drawCenteredText('FALTAS: 11', 544, 268, 1, [255, 210, 130, 255]);

  // 5. Smart TV Channel / Input Badge in Corner
  s.fillRect(w - 150, 332, 134, 24, [10, 14, 22, 220]);
  s.drawText('HDMI 1 • SMART TV', w - 144, 340, 1, [150, 210, 255, 255]);

  // 6. Bottom Promotional Ticker Crawl Bar
  s.fillRect(0, 368, w, 64, [75, 14, 14, 255]); // Wing Spot Crimson base
  s.fillRect(0, 368, w, 3, [255, 210, 40, 255]); // Gold divider line
  s.fillRect(0, 371, 140, 61, [45, 8, 8, 255]); // Left header badge
  s.drawCenteredText('WING SPOT', 70, 392, 2, [255, 255, 255, 255]);
  s.drawCenteredText('ESPECIALES', 70, 412, 1, [255, 215, 30, 255]);

  s.drawText('PROMO: 2X1 EN ALITAS & BONELESS • CERVEZA DRAFT EN PROMOCION', 154, 386, 1, [255, 245, 210, 255]);
  s.drawText('DISFRUTA TODOS LOS PARTIDOS EN VIVO CON EL MEJOR SABOR DE MONTERREY', 154, 408, 1, [230, 230, 235, 255]);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// 20. Generate WingSpot_Restroom_Sign.png (512x320)
// Architectural restroom plaque:
// - Universal Unisex Restroom Pictograms (Male + Female symbols separated by gold bar)
// - Bold, highly legible text: "BAÑO"
// - Subtitle: "UNISEX"
// - Double silver and gold metallic frame on dark wainscot plate
// -------------------------------------------------------------
function generateWingSpotRestroomSign() {
  const w = 512, h = 320;
  const s = new Surface(w, h, [28, 20, 15, 255]); // Warm dark architectural wainscot wood tone

  // 1. Double metallic silver / gold architectural border
  s.fillRect(6, 6, w - 12, 4, [210, 215, 225, 255]);
  s.fillRect(6, h - 10, w - 12, 4, [210, 215, 225, 255]);
  s.fillRect(6, 6, 4, h - 12, [210, 215, 225, 255]);
  s.fillRect(w - 10, 6, 4, h - 12, [210, 215, 225, 255]);

  s.fillRect(14, 14, w - 28, 2, [220, 180, 50, 255]);
  s.fillRect(14, h - 16, w - 28, 2, [220, 180, 50, 255]);
  s.fillRect(14, 14, 2, h - 28, [220, 180, 50, 255]);
  s.fillRect(w - 16, 14, 2, h - 28, [220, 180, 50, 255]);

  // 2. Universal Unisex Restroom Pictograms
  const iconY = 32;
  const white = [255, 255, 255, 255];
  const gold = [240, 195, 60, 255];

  // Male Figure (Left: Center X = 195)
  s.fillCircle(195, iconY + 16, 14, white); // Head
  s.fillRect(178, iconY + 36, 34, 48, white); // Torso
  s.fillRect(170, iconY + 40, 6, 40, white); // Left arm
  s.fillRect(214, iconY + 40, 6, 40, white); // Right arm
  s.fillRect(182, iconY + 84, 11, 46, white); // Left leg
  s.fillRect(197, iconY + 84, 11, 46, white); // Right leg

  // Center Dividing Bar
  s.fillRect(254, iconY + 10, 4, 126, gold);

  // Female Figure (Right: Center X = 317)
  s.fillCircle(317, iconY + 16, 14, white); // Head
  // A-line dress / skirt
  for (let dy = 0; dy < 48; dy++) {
    const hw = 12 + Math.round((dy / 48) * 18);
    s.fillRect(317 - hw, iconY + 36 + dy, hw * 2, 1, white);
  }
  s.fillRect(294, iconY + 40, 6, 38, white); // Left arm
  s.fillRect(334, iconY + 40, 6, 38, white); // Right arm
  s.fillRect(306, iconY + 84, 10, 46, white); // Left leg
  s.fillRect(318, iconY + 84, 10, 46, white); // Right leg

  // 3. Bold, highly legible Text: BAÑO
  s.drawCenteredText('BAÑO', w / 2, 206, 5, white);

  // 4. Subtitle: UNISEX
  s.drawCenteredText('UNISEX', w / 2, 266, 3, gold);

  return s.toPngBuffer();
}

// -------------------------------------------------------------
// Main execution: Output to all target directories
// -------------------------------------------------------------
const repoRoot = path.resolve(__dirname, '..');
const targetDirs = [
  path.join(repoRoot, 'unity-client', 'Assets', 'Textures'),
  path.join(repoRoot, 'unity-client', 'Assets', 'StreamingAssets', 'Textures'),
  path.join(repoRoot, 'unity-client', 'Assets', 'Resources', 'Textures'),
  path.join(repoRoot, 'Builds', 'Windows', 'MyVirtualCommunity_Data', 'Textures'),
  path.join(repoRoot, 'Builds', 'Windows', 'MyVirtualCommunity_Data', 'StreamingAssets', 'Textures'),
  path.join(repoRoot, 'Builds', 'Windows', 'Textures')
];

// Ensure all destination directories exist
targetDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[TextureGen] Created directory: ${dir}`);
  }
});

console.log('[TextureGen] Generating brand textures...');
const textures = {
  'WingSpot_Sign_Logo.png': generateWingSpotLogo(),
  'WingSpot_Synthetic_Grass_Wall.png': generateWingSpotSyntheticGrassWall(),
  'WingSpot_Smart_TV_Screen.png': generateWingSpotSmartTvScreen(),
  'WingSpot_Restroom_Sign.png': generateWingSpotRestroomSign(),
  'TiaLupe_Fascia_Sign.png': generateTiaLupeFascia(),
  'TiaLupe_Awning_Real.png': generateTiaLupeAwning(),
  'Billboard_Ad_Izzi.png': generateBillboardAd(),
  'HRC_Tower_Sign.png': generateHrcTowerSign(),
  'HRC_Product_Frieze.png': generateHrcProductFrieze(),
  'HRC_Green_Wall.png': generateHrcGreenWall(),
  'HRC_Wood_Decking.png': generateHrcWoodDecking(),
  'HRC_Kiosk_Graphic.png': generateHrcKioskGraphic(),
  'HRC_Logo_Medallion.png': generateHrcLogoMedallion(),
  'Sign_Del_Porvenir.png': generateSignDelPorvenir(),
  'Sign_Gomez_Morin.png': generateSignGomezMorin(),
  'Sign_Arboleda.png': generateSignArboleda(),
  'Dollar2Go_Compra_Fascia.png': generateDollar2GoCompra(),
  'Dollar2Go_Brand_Fascia.png': generateDollar2GoBrand(),
  'ATT_Building_Logo.png': generateAttBuildingLogo(),
  'ATT_Mupi_Poster.png': generateAttMupiPoster()
};

for (const [filename, buf] of Object.entries(textures)) {
  targetDirs.forEach(dir => {
    const dest = path.join(dir, filename);
    fs.writeFileSync(dest, buf);
  });
  console.log(`[TextureGen] Successfully wrote '${filename}' (${buf.length} bytes) to ${targetDirs.length} directories.`);
}

console.log('[TextureGen] All brand textures generated and deployed successfully.');

