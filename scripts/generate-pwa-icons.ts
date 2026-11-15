import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Rasterize the existing thread logo, keeping an opaque background for OS masks.
const root = new URL("../apps/web/public/", import.meta.url);
const source = await readFile(new URL("favicon.svg", root), "utf8");
const path = source.match(/<path\b[^>]*\/>/)?.[0];
if (!path) throw new Error("Percorso del logo non trovato nel favicon SVG");
await mkdir(new URL("icons/", root), { recursive: true });
for (const [name, size, scale] of [
  ["icon-192.png", 192, 0.8],
  ["icon-512.png", 512, 0.8],
  ["apple-touch-icon.png", 180, 0.8],
  ["icon-maskable-512.png", 512, 0.64],
] as const) {
  const inset = (size * (1 - scale)) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#F8F1E7"/><svg x="${inset}" y="${inset}" width="${size * scale}" height="${size * scale}" viewBox="0 0 88 88">${path}</svg></svg>`;
  await sharp(Buffer.from(svg))
    .removeAlpha()
    .png()
    .toFile(fileURLToPath(new URL("icons/" + name, root)));
}
