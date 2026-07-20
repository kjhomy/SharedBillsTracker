// One-off helper: rasterize the vector icon sources (scripts/icon-source*.svg)
// into every PNG size the app needs. Re-run after editing either SVG.
// Usage: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const icon = readFileSync(new URL('./icon-source.svg', import.meta.url));
const maskable = readFileSync(new URL('./icon-source-maskable.svg', import.meta.url));

await mkdir(new URL('public/icons/', root), { recursive: true });

const targets = [
  // Next.js App Router file-convention icons (auto-linked into <head>)
  { src: icon, out: 'app/icon.png', size: 48 },
  { src: icon, out: 'app/apple-icon.png', size: 180 },
  // manifest.json icons (Add to Home Screen)
  { src: icon, out: 'public/icons/icon-192.png', size: 192 },
  { src: icon, out: 'public/icons/icon-512.png', size: 512 },
  { src: maskable, out: 'public/icons/icon-maskable-512.png', size: 512 },
];

for (const { src, out, size } of targets) {
  const dest = fileURLToPath(new URL(out, root));
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(dest);
  console.log(`wrote ${out} (${size}x${size})`);
}
