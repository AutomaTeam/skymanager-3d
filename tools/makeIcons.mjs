/* Genere les icones PWA (PNG) sans dependance : degrade de ciel + avion blanc.
   Usage : node tools/makeIcons.mjs  -> assets/icons/icon-192.png, icon-512.png, apple-touch-icon.png */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const png = (w, h, rgba) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

/* Avion vu de dessus, nez en haut, dans un carre de 100 x 100. */
const PLANE = [[50, 8], [55, 20], [56, 38], [92, 58], [92, 66], [56, 56], [55, 78], [66, 88], [66, 94], [50, 90], [34, 94], [34, 88], [45, 78], [44, 56], [8, 66], [8, 58], [44, 38], [45, 20]];
const inside = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};

function icon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = maskable ? 0.62 : 0.8, off = (1 - scale) / 2;     // zone sure pour les icones "maskable"
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = y / size;
    let r = 14 + 40 * (1 - t), g = 60 + 120 * (1 - t), b = 140 + 100 * (1 - t);        // ciel
    const d = Math.hypot(x / size - 0.5, y / size - 0.5);
    if (!maskable && d > 0.5) { /* coins arrondis laisses opaques : iOS arrondit lui-meme */ }
    let cover = 0;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const px = ((x + (sx + 0.5) / 2) / size - off) / scale * 100, py = ((y + (sy + 0.5) / 2) / size - off) / scale * 100;
      if (inside(PLANE, px, py)) cover += 0.25;
    }
    const i = (y * size + x) * 4;
    buf[i] = r + (255 - r) * cover; buf[i + 1] = g + (255 - g) * cover; buf[i + 2] = b + (255 - b) * cover; buf[i + 3] = 255;
  }
  return png(size, size, buf);
}

mkdirSync('assets/icons', { recursive: true });
writeFileSync('assets/icons/icon-192.png', icon(192, false));
writeFileSync('assets/icons/icon-512.png', icon(512, false));
writeFileSync('assets/icons/icon-maskable-512.png', icon(512, true));
writeFileSync('assets/icons/apple-touch-icon.png', icon(180, false));
console.log('Icones ecrites dans assets/icons/');
