// scripts/export-images.js
import sharp from "sharp";
import { mkdirSync } from "fs";

const outDir = ".";
mkdirSync(outDir, { recursive: true });

const sources = [
  { in: "og-image-dark.svg",  out: "og-image-dark.png",  width: 1200, height: 630 },
  { in: "og-image-light.svg", out: "og-image-light.png", width: 1200, height: 630 },
  { in: "app-icon.svg",       out: "icon-192.png",       width: 192,  height: 192 },
  { in: "app-icon.svg",       out: "icon-512.png",       width: 512,  height: 512 },
  { in: "app-icon.svg",       out: "apple-touch-icon.png", width: 180, height: 180 }
];

async function run() {
  for (const { in: input, out, width, height } of sources) {
    try {
      await sharp(input).resize(width, height).png().toFile(`${outDir}/${out}`);
      console.log(`✅ Exported ${out} (${width}x${height})`);
    } catch (err) {
      console.error(`❌ Failed to export ${out}:`, err);
      process.exitCode = 1;
    }
  }
}
run();
