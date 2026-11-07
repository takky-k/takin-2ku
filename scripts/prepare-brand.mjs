import sharp from "sharp";
import fs from "node:fs/promises";
const input = "assets/brand/t2-master.png";
await fs.mkdir("public/icons", { recursive: true });
await Promise.all([
  sharp(input).resize(192, 192).png().toFile("public/icons/t2-icon-192.png"),
  sharp(input).resize(512, 512).png().toFile("public/icons/t2-icon-512.png"),
  sharp(input)
    .resize(512, 512)
    .png()
    .toFile("public/icons/t2-maskable-512.png"),
  sharp(input).resize(64, 64).png().toFile("public/icons/t2-favicon-64.png"),
  sharp(input)
    .extract({ left: 150, top: 365, width: 955, height: 505 })
    .resize({ width: 144 })
    .png()
    .toFile("public/brand/t2-header.png"),
]);
