const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function ico(images) {
  const headerSize = 6 + images.length * 16;
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    header.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    // BITCOUNT = 0 for PNG-in-ICO (Windows Vista+ standard).
    header.writeUInt16LE(0, entry + 6);
    header.writeUInt32LE(image.data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

function png(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (stride + 1);
    raw[rawOffset] = 0;
    rgba.copy(raw, rawOffset + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdrData(width, height, 8, 6, 0, 0, 0)),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function ihdrData(width, height, bitDepth, colorType, compression, filter, interlace) {
  const buf = Buffer.alloc(13);
  buf.writeUInt32BE(width, 0);
  buf.writeUInt32BE(height, 4);
  buf[8] = bitDepth;
  buf[9] = colorType;
  buf[10] = compression;
  buf[11] = filter;
  buf[12] = interlace;
  return buf;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  fillRect(rgba, size, 0, 0, size, size, [15, 15, 18, 255]);

  const s = size / 24;
  const gold = [245, 158, 11, 255]; // #F59E0B
  const goldLight = [251, 191, 36, 255]; // #FBBF24
  const stroke = Math.max(1.4, 2 * s);

  drawPath(rgba, size, [[4.5, 20], [21, 20], [21, 16.5], [18.8, 15.3], [18.8, 13.7], [21, 12.5], [21, 9], [4.3, 9], [4.5, 20]], gold, stroke, s);
  drawPath(rgba, size, [[21, 9], [16.2, 6.4], [11.6, 4], [8, 5.3], [5.3, 7.4], [4.3, 11], [4.3, 14.3]], gold, stroke, s);
  drawCircle(rgba, size, 15 * s, 14.5 * s, 1.8 * s, goldLight);
  drawCircle(rgba, size, 8.5 * s, 14.2 * s, 1.6 * s, goldLight);
  drawCircle(rgba, size, 11.5 * s, 17 * s, 1.3 * s, goldLight);

  return png(size, size, rgba);
}

function drawPath(rgba, size, points, color, stroke, scale) {
  for (let index = 0; index < points.length - 1; index += 1) {
    drawLine(rgba, size, points[index][0] * scale, points[index][1] * scale, points[index + 1][0] * scale, points[index + 1][1] * scale, color, stroke);
  }
}

function drawLine(rgba, size, x1, y1, x2, y2, color, stroke) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    drawCircle(rgba, size, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, stroke / 2, color);
  }
}

function drawCircle(rgba, size, cx, cy, radius, color) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius) {
        setPixel(rgba, size, x, y, color);
      }
    }
  }
}

function fillRect(rgba, size, x, y, width, height, color) {
  for (let py = Math.floor(y); py < Math.ceil(y + height); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) {
      setPixel(rgba, size, px, py, color);
    }
  }
}

function setPixel(rgba, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }
  const offset = (Math.floor(y) * size + Math.floor(x)) * 4;
  rgba[offset] = color[0];
  rgba[offset + 1] = color[1];
  rgba[offset + 2] = color[2];
  rgba[offset + 3] = color[3];
}

const sizes = [16, 32, 48, 64, 128, 256];
const images = sizes.map((size) => {
  const data = renderIcon(size);
  fs.writeFileSync(path.join(process.cwd(), "public", `hamburger-${size}.png`), data);
  return { size, data };
});

fs.mkdirSync(path.join(process.cwd(), "build"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), "build", "icon.ico"), ico(images));

// Copy the 256x256 render to assets/icon.png so the runtime window icon
// matches the build ICO exactly.
fs.writeFileSync(path.join(process.cwd(), "assets", "icon.png"), images.find((i) => i.size === 256)?.data ?? images[images.length - 1].data);

console.log("Icons generated successfully.");
