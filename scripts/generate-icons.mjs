// Deterministic, code-native dumbbell mark. No external image or font dependency.
import fs from "node:fs";
import zlib from "node:zlib";
function crc32(bytes) {
  let crc = -1;
  for (const value of bytes) {
    crc ^= value;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, bytes) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const data = Buffer.concat([Buffer.from(type), bytes]),
    crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(data));
  return Buffer.concat([length, data, crc]);
}
fs.mkdirSync("public/icons", { recursive: true });
for (const size of [192, 512]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      const mark =
        (u > 0.27 && u < 0.73 && v > 0.46 && v < 0.54) ||
        (u > 0.22 && u < 0.31 && v > 0.31 && v < 0.69) ||
        (u > 0.69 && u < 0.78 && v > 0.31 && v < 0.69) ||
        (u > 0.16 && u < 0.22 && v > 0.39 && v < 0.61) ||
        (u > 0.78 && u < 0.84 && v > 0.39 && v < 0.61);
      raw.set(
        mark ? [225, 222, 215, 255] : [16, 16, 16, 255],
        y * (size * 4 + 1) + 1 + x * 4,
      );
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(`public/icons/icon-${size}.png`, png);
  if (size === 512) fs.writeFileSync("public/icons/maskable-512.png", png);
}
