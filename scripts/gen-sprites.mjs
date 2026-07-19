// Procedural sprite generator → static PNG assets.
//
// The lab-floor creatures (ant, fly, bee) and bosses (Roach King, Dung Beetle, Hornet Queen), the
// noble-gas gem, and the pickup drops (Platinum wildcard, Calcium/Zinc heal capsules, Iron shield,
// silver coin) were originally drawn at runtime with Phaser Graphics. This script rasterizes the SAME
// shapes to PNG files under public/assets/sprites/ so they live as real assets alongside the
// hand-drawn art (loaded by key via BootScene's ASSET_SPECS). Re-run with `npm run gen:sprites`.
//
// Zero dependencies: a tiny supersampled rasterizer (for anti-aliasing) + a minimal PNG encoder
// built on Node's zlib. The draw calls mirror Phaser's Graphics API (fillCircle / fillEllipse /
// fillRect / fillTriangle / fillPoly / line), so the BootScene drawing code ports over verbatim.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SS = 4; // supersample factor → downsampled for anti-aliasing

// ── Canvas + drawing (design coordinates; sampling done in supersampled space) ──
function makeCanvas(w, h) {
  return { w, h, W: w * SS, H: h * SS, buf: new Float32Array(w * SS * h * SS * 4), fill: [0, 0, 0, 1], line: [0, 0, 0, 1, 1] };
}
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const fillStyle = (cv, hex, a = 1) => {
  cv.fill = [...rgb(hex), a];
};
const lineStyle = (cv, width, hex, a = 1) => {
  cv.line = [...rgb(hex), a, width];
};

function blend(cv, px, py, r, g, b, a) {
  if (a <= 0 || px < 0 || py < 0 || px >= cv.W || py >= cv.H) return;
  const i = (py * cv.W + px) * 4;
  const da = cv.buf[i + 3];
  const outA = a + da * (1 - a);
  if (outA <= 0) return;
  cv.buf[i] = (r * a + cv.buf[i] * da * (1 - a)) / outA;
  cv.buf[i + 1] = (g * a + cv.buf[i + 1] * da * (1 - a)) / outA;
  cv.buf[i + 2] = (b * a + cv.buf[i + 2] * da * (1 - a)) / outA;
  cv.buf[i + 3] = outA;
}

// Rasterize `inside(sx, sy)` (design-space sample test) over a design-space bbox, using fill colour.
function paint(cv, x0, y0, x1, y1, inside, [r, g, b, a]) {
  const pxa = Math.max(0, Math.floor(x0 * SS));
  const pya = Math.max(0, Math.floor(y0 * SS));
  const pxb = Math.min(cv.W, Math.ceil(x1 * SS));
  const pyb = Math.min(cv.H, Math.ceil(y1 * SS));
  for (let py = pya; py < pyb; py++) {
    for (let px = pxa; px < pxb; px++) {
      if (inside((px + 0.5) / SS, (py + 0.5) / SS)) blend(cv, px, py, r, g, b, a);
    }
  }
}

const fillCircle = (cv, cx, cy, rad) =>
  paint(cv, cx - rad, cy - rad, cx + rad, cy + rad, (sx, sy) => (sx - cx) ** 2 + (sy - cy) ** 2 <= rad * rad, cv.fill);

const fillEllipse = (cv, cx, cy, w, h) => {
  const rx = w / 2;
  const ry = h / 2;
  paint(cv, cx - rx, cy - ry, cx + rx, cy + ry, (sx, sy) => ((sx - cx) / rx) ** 2 + ((sy - cy) / ry) ** 2 <= 1, cv.fill);
};

const fillRect = (cv, x, y, w, h) =>
  paint(cv, x, y, x + w, y + h, (sx, sy) => sx >= x && sx < x + w && sy >= y && sy < y + h, cv.fill);

// Rounded rectangle via a rounded-rect SDF (dx/dy = distance past the straight edges of the core).
const fillRoundedRect = (cv, x, y, w, h, r) => {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const hw = w / 2;
  const hh = h / 2;
  const inside = (sx, sy) => {
    const dx = Math.max(Math.abs(sx - cx) - (hw - r), 0);
    const dy = Math.max(Math.abs(sy - cy) - (hh - r), 0);
    return dx * dx + dy * dy <= r * r;
  };
  paint(cv, x, y, x + w, y + h, inside, cv.fill);
};

// Circle outline of the current lineStyle width, centred on the radius.
const strokeCircle = (cv, cx, cy, rad) => {
  const [r, g, b, a, width] = cv.line;
  const hw = width / 2;
  const inside = (sx, sy) => Math.abs(Math.hypot(sx - cx, sy - cy) - rad) <= hw;
  paint(cv, cx - rad - hw, cy - rad - hw, cx + rad + hw, cy + rad + hw, inside, [r, g, b, a]);
};

function fillTriangle(cv, x1, y1, x2, y2, x3, y3) {
  const sign = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  const inside = (sx, sy) => {
    const d1 = sign(sx, sy, x1, y1, x2, y2);
    const d2 = sign(sx, sy, x2, y2, x3, y3);
    const d3 = sign(sx, sy, x3, y3, x1, y1);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
  paint(cv, Math.min(x1, x2, x3), Math.min(y1, y2, y3), Math.max(x1, x2, x3), Math.max(y1, y2, y3), inside, cv.fill);
}

function fillPoly(cv, pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const inside = (sx, sy) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > sy !== yj > sy && sx < ((xj - xi) * (sy - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  paint(cv, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), inside, cv.fill);
}

function line(cv, x1, y1, x2, y2) {
  const [r, g, b, a, width] = cv.line;
  const hw = width / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const inside = (sx, sy) => {
    let t = ((sx - x1) * dx + (sy - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return (sx - cx) ** 2 + (sy - cy) ** 2 <= hw * hw;
  };
  paint(cv, Math.min(x1, x2) - hw, Math.min(y1, y2) - hw, Math.max(x1, x2) + hw, Math.max(y1, y2) + hw, inside, [
    r,
    g,
    b,
    a,
  ]);
}

// Downsample the supersampled buffer to an 8-bit straight-alpha RGBA buffer.
function toRGBA8(cv) {
  const out = Buffer.alloc(cv.w * cv.h * 4);
  const n = SS * SS;
  for (let y = 0; y < cv.h; y++) {
    for (let x = 0; x < cv.w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let aSum = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * cv.W + (x * SS + sx)) * 4;
          const a = cv.buf[i + 3];
          r += cv.buf[i] * a;
          g += cv.buf[i + 1] * a;
          b += cv.buf[i + 2] * a;
          aSum += a;
        }
      }
      const o = (y * cv.w + x) * 4;
      if (aSum > 0) {
        out[o] = Math.round(r / aSum);
        out[o + 1] = Math.round(g / aSum);
        out[o + 2] = Math.round(b / aSum);
        out[o + 3] = Math.round((aSum / n) * 255);
      }
    }
  }
  return out;
}

// ── Minimal PNG encoder (RGBA8) ────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function writePNG(file, w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // raw with a 0 filter byte per scanline
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
  console.log(`  ${file.replace(`${ROOT}/`, '')}  (${w}×${h})`);
}

// Heal capsule (Calcium / Zinc) — a rounded pill bearing a medical cross, tinted by its heal colour.
const healCapsule = (tint, cross) => (g) => {
  fillStyle(g, tint, 0.35); // soft outer glow ring
  fillCircle(g, 32, 32, 22);
  fillStyle(g, 0x2a3a34, 0.9); // dark rim for contrast
  fillRoundedRect(g, 16, 19, 32, 26, 13);
  fillStyle(g, tint, 1); // capsule body
  fillRoundedRect(g, 19, 22, 26, 20, 10);
  fillStyle(g, 0xffffff, 0.35); // top highlight sheen
  fillRoundedRect(g, 22, 24, 20, 6, 3);
  fillStyle(g, cross, 0.95); // medical cross
  fillRect(g, 30, 26, 4, 12);
  fillRect(g, 26, 30, 12, 4);
};

// ── The sprites (ports of BootScene's procedural _make* drawings, facing right) ──
const SPRITES = {
  'enemies/ant': [34, 28, (g) => {
    lineStyle(g, 2, 0x32190a, 1);
    line(g, 21, 15, 26, 25);
    line(g, 18, 16, 19, 26);
    line(g, 16, 15, 11, 25);
    fillStyle(g, 0x7a3b1a, 1);
    fillEllipse(g, 9, 12, 18, 14);
    fillStyle(g, 0x8a4520, 1);
    fillEllipse(g, 19, 13, 11, 11);
    fillStyle(g, 0x5e2f12, 1);
    fillCircle(g, 28, 12, 5);
    lineStyle(g, 1.5, 0x32190a, 1);
    line(g, 30, 9, 34, 3);
    line(g, 28, 8, 30, 2);
    fillStyle(g, 0x140a04, 1);
    fillCircle(g, 29, 11, 1.4);
    fillStyle(g, 0xb56a3a, 0.5);
    fillEllipse(g, 11, 9, 7, 4);
  }],
  'enemies/fly': [30, 24, (g) => {
    fillStyle(g, 0xddeeff, 0.5);
    fillEllipse(g, 12, 6, 16, 9);
    fillStyle(g, 0xccddee, 0.4);
    fillEllipse(g, 16, 7, 12, 7);
    fillStyle(g, 0x2a2a30, 1);
    fillEllipse(g, 11, 14, 16, 11);
    fillStyle(g, 0x3a3a44, 1);
    fillEllipse(g, 19, 14, 8, 9);
    fillStyle(g, 0x222228, 1);
    fillCircle(g, 25, 13, 4);
    fillStyle(g, 0xcc3322, 1);
    fillCircle(g, 26, 12, 2.4);
    lineStyle(g, 1, 0x55555f, 0.8);
    line(g, 7, 11, 7, 18);
    line(g, 11, 10, 11, 19);
  }],
  'enemies/bee': [32, 28, (g) => {
    const dark = 0x201810;
    fillStyle(g, 0xeef6ff, 0.55);
    fillEllipse(g, 15, 7, 16, 10);
    fillEllipse(g, 20, 8, 11, 7);
    fillStyle(g, 0xf0c030, 1);
    fillEllipse(g, 15, 16, 22, 16);
    fillStyle(g, dark, 1);
    fillRect(g, 9, 9, 3, 14);
    fillRect(g, 15, 8, 3, 16);
    fillRect(g, 21, 9, 3, 14);
    fillStyle(g, dark, 1);
    fillCircle(g, 27, 15, 5);
    fillStyle(g, 0x55452a, 1);
    fillCircle(g, 28, 14, 1.8);
    lineStyle(g, 1.5, dark, 1);
    line(g, 29, 11, 32, 6);
    fillStyle(g, dark, 1);
    fillTriangle(g, 5, 14, 5, 18, 0, 16);
  }],
  'bosses/boss_roach': [112, 86, (g) => {
    lineStyle(g, 3, 0x2a1810, 1);
    line(g, 66, 50, 78, 76);
    line(g, 54, 54, 60, 80);
    line(g, 42, 52, 28, 78);
    line(g, 62, 50, 86, 74);
    line(g, 50, 54, 46, 80);
    line(g, 36, 50, 16, 74);
    fillStyle(g, 0x6b4423, 1);
    fillEllipse(g, 54, 44, 92, 56);
    lineStyle(g, 2, 0x4e3018, 0.6);
    line(g, 12, 44, 72, 44);
    fillStyle(g, 0x4e3018, 1);
    fillEllipse(g, 76, 38, 34, 30);
    fillStyle(g, 0x3a2410, 1);
    fillCircle(g, 90, 38, 9);
    lineStyle(g, 3, 0x2a1810, 1);
    line(g, 96, 34, 112, 14);
    line(g, 94, 32, 108, 6);
    fillStyle(g, 0x140a06, 1);
    fillCircle(g, 93, 33, 2.4);
    fillCircle(g, 93, 43, 2.4);
    fillStyle(g, 0x8a5a2e, 0.5);
    fillEllipse(g, 48, 34, 40, 16);
  }],
  'bosses/boss_beetle': [120, 96, (g) => {
    lineStyle(g, 5, 0x1e160c, 1);
    line(g, 50, 56, 38, 86);
    line(g, 66, 60, 62, 88);
    line(g, 82, 58, 98, 86);
    line(g, 46, 56, 28, 82);
    line(g, 62, 60, 56, 88);
    line(g, 78, 58, 92, 82);
    fillStyle(g, 0x4a3a22, 1);
    fillEllipse(g, 58, 46, 96, 64);
    fillStyle(g, 0x6a5430, 0.5);
    fillEllipse(g, 54, 32, 52, 22);
    lineStyle(g, 2.5, 0x2a2012, 0.7);
    line(g, 20, 46, 96, 46);
    fillStyle(g, 0x2a2012, 1);
    fillCircle(g, 96, 52, 12);
    fillStyle(g, 0x3a2c16, 1);
    fillTriangle(g, 100, 44, 116, 18, 104, 46);
    fillStyle(g, 0x100a04, 1);
    fillCircle(g, 98, 50, 2.4);
    fillCircle(g, 98, 58, 2.4);
  }],
  'bosses/boss_hornet': [104, 110, (g) => {
    const dark = 0x1c140a;
    fillStyle(g, 0xeef6ff, 0.5);
    fillEllipse(g, 40, 26, 60, 30);
    fillEllipse(g, 58, 22, 40, 22);
    fillStyle(g, dark, 1);
    fillEllipse(g, 58, 50, 30, 28);
    fillStyle(g, 0xf0b820, 1);
    fillEllipse(g, 38, 72, 46, 34);
    fillStyle(g, dark, 1);
    fillEllipse(g, 38, 60, 44, 8);
    fillEllipse(g, 34, 76, 40, 8);
    fillEllipse(g, 30, 90, 30, 8);
    fillTriangle(g, 14, 98, 4, 104, 18, 102);
    fillStyle(g, dark, 1);
    fillCircle(g, 78, 44, 11);
    fillStyle(g, 0x3a2a10, 1);
    fillCircle(g, 80, 40, 3);
    fillCircle(g, 80, 48, 3);
    lineStyle(g, 2.5, dark, 1);
    line(g, 82, 38, 98, 20);
    line(g, 84, 42, 102, 30);
  }],
  'atoms/atom_noble': [26, 26, (g) => {
    fillStyle(g, 0xededed, 1);
    fillPoly(g, [[13, 1], [24, 8], [24, 18], [13, 25], [2, 18], [2, 8]]);
    fillStyle(g, 0xffffff, 1);
    fillPoly(g, [[13, 1], [24, 8], [13, 13], [2, 8]]);
    fillStyle(g, 0xbdbdbd, 1);
    fillPoly(g, [[2, 8], [13, 13], [13, 25]]);
    fillStyle(g, 0xd6d6d6, 1);
    fillPoly(g, [[24, 8], [13, 13], [13, 25]]);
    fillStyle(g, 0xffffff, 0.95);
    fillCircle(g, 9, 6, 1.6);
  }],
  // Platinum wildcard — the Gold atom's twin (star-halo-over-orb), recoloured cool + dusted sparkles.
  'atoms/atom_platinum': [64, 64, (g) => {
    const star = (rad, i, color, alpha) => {
      fillStyle(g, color, alpha);
      fillPoly(g, [
        [32, 32 - rad],
        [32 + i, 32 - i],
        [32 + rad, 32],
        [32 + i, 32 + i],
        [32, 32 + rad],
        [32 - i, 32 + i],
        [32 - rad, 32],
        [32 - i, 32 - i],
      ]);
    };
    star(30, 9, 0xcfe0f2, 0.55); // outer glow
    star(26, 8, 0xe6f0fb, 0.75); // inner glow
    fillStyle(g, 0x8fa4bc, 1); // rim
    fillCircle(g, 32, 32, 17);
    fillStyle(g, 0xc4d6ea, 1); // body
    fillCircle(g, 32, 32, 14);
    fillStyle(g, 0xeef5fd, 1); // bright face
    fillCircle(g, 32, 32, 10);
    fillStyle(g, 0xffffff, 0.95); // top-left highlight
    fillCircle(g, 27, 27, 4);
    const sparkle = (cx, cy, s, alpha) => {
      fillStyle(g, 0xffffff, alpha);
      fillTriangle(g, cx, cy - s, cx + s * 0.4, cy, cx - s * 0.4, cy);
      fillTriangle(g, cx, cy + s, cx + s * 0.4, cy, cx - s * 0.4, cy);
      fillTriangle(g, cx - s, cy, cx, cy + s * 0.4, cx, cy - s * 0.4);
      fillTriangle(g, cx + s, cy, cx, cy + s * 0.4, cx, cy - s * 0.4);
    };
    sparkle(40, 24, 4, 0.95);
    sparkle(24, 40, 3, 0.8);
    sparkle(44, 42, 2.5, 0.7);
  }],
  // Heal capsules — tint + cross colour mirror HEAL_DROPS in src/constants.ts.
  'atoms/atom_calcium': [64, 64, healCapsule(0xfff2d6, 0xe0483a)], // bone-cream capsule, red cross
  'atoms/atom_zinc': [64, 64, healCapsule(0xbfeed8, 0x1f8f5f)], // mint capsule, green cross
  // Iron armour drop — a steel heater shield with a rivet cross. Tint mirrors ARMOR_DROPS.iron.color.
  'atoms/atom_iron': [64, 64, (g) => {
    const tint = 0x9aa7b5;
    fillStyle(g, tint, 0.3); // soft steel halo
    fillCircle(g, 32, 32, 22);
    fillStyle(g, 0x262c34, 0.95); // dark rim
    fillPoly(g, [
      [32, 14],
      [48, 20],
      [48, 33],
      [32, 50],
      [16, 33],
      [16, 20],
    ]);
    fillStyle(g, tint, 1); // steel face
    fillPoly(g, [
      [32, 18],
      [44, 23],
      [44, 32],
      [32, 46],
      [20, 32],
      [20, 23],
    ]);
    fillStyle(g, 0xffffff, 0.22); // top-left sheen
    fillCircle(g, 26, 25, 5);
    fillStyle(g, 0x475260, 0.9); // rivet cross
    fillRect(g, 30, 23, 4, 14);
    fillRect(g, 25, 28, 14, 4);
  }],
  // Silver coin score pickup — a small disc (rim, face, engraved ring, highlight); spins at runtime.
  'atoms/coin_silver': [32, 32, (g) => {
    fillStyle(g, 0x8892a0, 1); // dark outer rim
    fillCircle(g, 16, 16, 14);
    fillStyle(g, 0xd7dee6, 1); // bright face
    fillCircle(g, 16, 16, 12);
    lineStyle(g, 1.5, 0x8892a0, 0.9); // inner engraved ring
    strokeCircle(g, 16, 16, 8);
    fillStyle(g, 0xf4f8fc, 0.9); // top-left highlight
    fillCircle(g, 12, 12, 3);
  }],
};

console.log('Generating sprites →');
for (const [name, [w, h, draw]] of Object.entries(SPRITES)) {
  const cv = makeCanvas(w, h);
  draw(cv);
  writePNG(resolve(ROOT, 'public/assets/sprites', `${name}.png`), w, h, toRGBA8(cv));
}
console.log('Done.');
