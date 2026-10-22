// Renders the shield icon to PNG at every size the stores need, with no
// dependencies: a signed-distance shape, 4x4 supersampled, written via zlib.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT = path.join(__dirname, "..", "src", "icons");

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Unit coordinates: x,y in [0,1]. Shield = rounded top, pointed bottom.
function inShield(x, y) {
  const cx = 0.5;
  if (y < 0.08 || y > 0.94) return false;
  const half = y < 0.55 ? 0.4 : 0.4 * (1 - (y - 0.55) / 0.39) ** 0.8;
  const top = 0.08 + 0.06 * Math.abs(x - cx) / 0.4;
  return Math.abs(x - cx) <= half && y >= top;
}
// Exclamation mark inside the shield.
function inMark(x, y) {
  const dx = Math.abs(x - 0.5);
  if (y >= 0.24 && y <= 0.58) return dx <= 0.075 - (y - 0.24) * 0.06;
  return (x - 0.5) ** 2 + (y - 0.71) ** 2 <= 0.075 ** 2;
}

function pixel(px, py, size) {
  const S = 4;
  let shield = 0, mark = 0;
  for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
    const x = (px + (i + 0.5) / S) / size;
    const y = (py + (j + 0.5) / S) / size;
    if (inShield(x, y)) {
      if (inMark(x, y)) mark++;
      else shield++;
    }
  }
  const total = S * S, cover = (shield + mark) / total;
  if (cover === 0) return [0, 0, 0, 0];
  const m = mark / (shield + mark);
  const shieldRGB = [79, 91, 147]; // PHP indigo
  const markRGB = [255, 255, 255];
  const mix = (k) => Math.round(shieldRGB[k] * (1 - m) + markRGB[k] * m);
  return [mix(0), mix(1), mix(2), Math.round(cover * 255)];
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), png(size, pixel));
}
console.log("icons written to", OUT);
