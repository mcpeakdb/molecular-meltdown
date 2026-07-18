// ── Level map & reachability validator ────────────────────────────────────────
// A design tool, not part of the game build. Reads the real STAGES data (post the
// clusters/summit/noble enrichment loops in stages.ts), solves what the player can
// actually reach with the real jump physics, and emits an interactive SVG map of
// every stage to docs/level-maps.html plus a validation report to stdout.
//
//   npm run levels
//
// Reachability model (kinematic, from the real constants):
//   • full air control at PLAYER_SPEED horizontally,
//   • single jump (PLAYER_JUMP_VELOCITY), double jump (adds PLAYER_DOUBLE_JUMP_VELOCITY),
//   • bounce pad launches straight up (PLAYER_BOUNCE_VELOCITY) and leaves one air-jump.
// A breadth-first relaxation over floor segments + ledges + synthesized pad perches
// marks every node reachable-or-not and remembers the jump that got there (for the arcs).
// Simplifications (noted so the numbers are trusted, not over-trusted): jump arcs are
// treated as a single equivalent impulse (under-counts multi-jump hang time, so it is
// CONSERVATIVE — it never claims reachable when the real game can't), and mid-arc
// collisions with other ledges are ignored.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ELEMENT_COLORS,
  type ElementType,
  GRAVITY,
  GROUND_TOP_Y,
  NOBLE_GAS_BY_ID,
  PLAYER_BOUNCE_VELOCITY,
  PLAYER_DOUBLE_JUMP_VELOCITY,
  PLAYER_JUMP_VELOCITY,
  PLAYER_SPEED,
  SECTORS,
  sectorOf,
  substageOf,
} from '../src/constants.ts';
import { NOBLE_BY_STAGE, type StageDef, STAGES } from '../src/stages.ts';

// ── Jump physics ───────────────────────────────────────────────────────────────
const g = GRAVITY;
const VX = PLAYER_SPEED;
const RISE = {
  single: (PLAYER_JUMP_VELOCITY * PLAYER_JUMP_VELOCITY) / (2 * g),
  double: (PLAYER_JUMP_VELOCITY * PLAYER_JUMP_VELOCITY + PLAYER_DOUBLE_JUMP_VELOCITY * PLAYER_DOUBLE_JUMP_VELOCITY) / (2 * g),
  bounce: (PLAYER_BOUNCE_VELOCITY * PLAYER_BOUNCE_VELOCITY) / (2 * g),
} as const;
type Mode = keyof typeof RISE;

/** Max horizontal distance a jump of `mode` covers when launching from height `hA` (feet) and
 *  landing on a surface at height `hB`. Returns -1 if `hB` is out of that jump's vertical reach. */
function maxHoriz(hA: number, hB: number, mode: Mode): number {
  const dh = hA - hB; // >0 means the target is higher than the takeoff
  const rise = RISE[mode];
  if (dh > rise + 0.5) return -1;
  const vyEff = Math.sqrt(2 * g * rise);
  const disc = vyEff * vyEff - 2 * g * dh;
  if (disc < 0) return -1;
  const t = (vyEff + Math.sqrt(disc)) / g; // airtime until feet next cross hB (the later root)
  return VX * t;
}

/** Flat gap a plain double-jump clears (both surfaces at floor height). */
const FLAT_DOUBLE_REACH = maxHoriz(GROUND_TOP_Y, GROUND_TOP_Y, 'double');

// ── Threat model (pacing) ──────────────────────────────────────────────────────
// Mirror of Enemy CONFIGS (src/entities/Enemy.ts) — kept here so the tool stays free of Phaser.
// A single "threat" scalar per type turns a headcount into pressure: durability (how long it stays a
// problem), melee DPS, ranged DPS + a flat bonus (hits you from afar), and a little for speed (harder
// to avoid). Weights are transparent constants — tune them and re-run. Normalized so bacterium = 1.0.
interface Foe {
  hp: number;
  damage: number;
  attackRate: number;
  speed: number;
  ranged?: { shots: number; damage: number };
}
const FOES: Record<string, Foe> = {
  bacterium: { hp: 35, damage: 10, attackRate: 1600, speed: 90 },
  virus: { hp: 22, damage: 8, attackRate: 1400, speed: 130, ranged: { shots: 1, damage: 6 } },
  dustbunny: { hp: 50, damage: 14, attackRate: 2000, speed: 60 },
  pollen: { hp: 18, damage: 6, attackRate: 1100, speed: 160, ranged: { shots: 3, damage: 4 } },
  amoeba: { hp: 80, damage: 16, attackRate: 2200, speed: 48 },
  spore: { hp: 14, damage: 7, attackRate: 800, speed: 180 },
  mite: { hp: 30, damage: 11, attackRate: 1300, speed: 115 },
  ant: { hp: 24, damage: 9, attackRate: 950, speed: 150 },
  fly: { hp: 16, damage: 8, attackRate: 850, speed: 205 },
  bee: { hp: 42, damage: 14, attackRate: 1100, speed: 150 },
};
const W_HP = 0.02;
const W_MELEE = 0.3;
const W_RANGED = 0.25;
const RANGED_FLAT = 1;
const W_SPEED = 0.006;
function rawThreat(f: Foe): number {
  const meleeDps = (f.damage * 1000) / f.attackRate;
  const rangedDps = f.ranged ? (f.ranged.shots * f.ranged.damage * 1000) / f.attackRate : 0;
  return f.hp * W_HP + meleeDps * W_MELEE + rangedDps * W_RANGED + (f.ranged ? RANGED_FLAT : 0) + f.speed * W_SPEED;
}
const BACTERIUM_RAW = rawThreat(FOES.bacterium);
const threatOf = (type: string): number => (FOES[type] ? rawThreat(FOES[type]) / BACTERIUM_RAW : 1);

const BIN = 250; // px per pacing bucket
// |ramp slope| below this (threat-units per 1000px) reads as flat — neither building toward the
// finale nor front-loaded. Calibrated to the stage set: intentionally-built stages ramp ≥ ~0.35,
// the old evenly-spread stages sat at ~0 to −0.3.
const RAMP_FLAT = 0.3;

interface Pacing {
  bins: number[]; // threat density per BIN across the whole width
  binX: number[]; // world-x center of each bin
  totalThreat: number;
  peak: { x: number; v: number };
  cv: number; // coefficient of variation over the active region (low = flat/uniform)
  slope: number; // threat trend across the stage, normalized (+ builds toward the end)
  longestRest: { len: number; x: number }; // biggest enemy-free stretch (breather)
  deadStretch: { len: number; a: number; b: number } | null; // long span with nothing at all
}

function pacing(s: StageDef): Pacing {
  const foes = s.enemies
    .filter((e) => !s.gaps.some(([a, b]) => e.x >= a && e.x <= b)) // GameScene skips in-gap spawns
    .map((e) => ({ x: e.x, t: threatOf(e.type) }))
    .sort((p, q) => p.x - q.x);
  const nBins = Math.max(1, Math.ceil(s.width / BIN));
  const bins = new Array(nBins).fill(0);
  const binX = Array.from({ length: nBins }, (_, i) => (i + 0.5) * BIN);
  for (const f of foes) bins[Math.min(nBins - 1, Math.floor(f.x / BIN))] += f.t;
  const totalThreat = foes.reduce((a, f) => a + f.t, 0);
  let peak = { x: 0, v: 0 };
  bins.forEach((v, i) => {
    if (v > peak.v) peak = { x: binX[i], v };
  });

  // CV + slope over the active region (first→last enemy), so a deliberately empty intro/outro
  // doesn't masquerade as pacing contrast.
  const lo = foes.length ? Math.floor(foes[0].x / BIN) : 0;
  const hi = foes.length ? Math.floor(foes[foes.length - 1].x / BIN) : nBins - 1;
  const active = bins.slice(lo, hi + 1);
  const mean = active.reduce((a, v) => a + v, 0) / Math.max(1, active.length);
  const variance = active.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, active.length);
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  // Least-squares slope of density vs bin index, scaled to "threat per 1000px".
  let slope = 0;
  if (active.length > 1) {
    const n = active.length;
    const mx = (n - 1) / 2;
    let num = 0;
    let den = 0;
    active.forEach((v, i) => {
      num += (i - mx) * (v - mean);
      den += (i - mx) ** 2;
    });
    slope = (den ? num / den : 0) * (1000 / BIN);
  }

  // Longest breather: biggest gap between consecutive enemy x's (bounded by stage ends).
  let longestRest = { len: 0, x: 0 };
  const xs = [0, ...foes.map((f) => f.x), s.width];
  for (let i = 1; i < xs.length; i++) {
    const len = xs[i] - xs[i - 1];
    if (len > longestRest.len) longestRest = { len, x: (xs[i] + xs[i - 1]) / 2 };
  }

  // Dead stretch: longest run with no enemy, gap, hazard, pad, or atom (nothing happens).
  const features: number[] = [
    ...foes.map((f) => f.x),
    ...s.gaps.flatMap(([a, b]) => [(a + b) / 2]),
    ...(s.hazards ?? []).map(([a, b]) => (a + b) / 2),
    ...(s.pads ?? []),
    ...s.atoms.map((a) => a.x),
  ].sort((a, b) => a - b);
  let deadStretch: Pacing['deadStretch'] = null;
  const fs = [0, ...features, s.width];
  for (let i = 1; i < fs.length; i++) {
    const len = fs[i] - fs[i - 1];
    if (len > (deadStretch?.len ?? 0)) deadStretch = { len, a: fs[i - 1], b: fs[i] };
  }

  return { bins, binX, totalThreat, peak, cv, slope, longestRest, deadStretch };
}

// ── Node graph ───────────────────────────────────────────────────────────────
type NodeKind = 'floor' | 'ledge' | 'pad';
interface Node {
  id: number;
  kind: NodeKind;
  x1: number;
  x2: number;
  top: number; // surface height the player stands on
}
interface Reward {
  x: number;
  y: number;
  label: string;
  color: number;
  kind: 'atom' | 'gem' | 'padReward' | 'summit';
}

const PAD_PERCH_TOP = GROUND_TOP_Y - 330; // 140 — matches GameScene._buildPad
const PAD_PERCH_W = 130;
const ATOM_FLOAT_Y = GROUND_TOP_Y - 36; // 434 — GameScene default for a non-perched atom

function hGap(a: Node, b: Node): number {
  if (a.x1 <= b.x2 && b.x1 <= a.x2) return 0; // overlapping x
  return b.x1 > a.x2 ? b.x1 - a.x2 : a.x1 - b.x2;
}

/** Contiguous solid-floor spans: the full width minus the gap holes (crumble tiles stay solid). */
function floorSpans(s: StageDef): [number, number][] {
  const gaps = [...s.gaps].sort((p, q) => p[0] - q[0]);
  const spans: [number, number][] = [];
  let x = 0;
  for (const [a, b] of gaps) {
    if (a > x) spans.push([x, a]);
    x = Math.max(x, b);
  }
  if (x < s.width) spans.push([x, s.width]);
  return spans;
}

interface Solved {
  nodes: Node[];
  reachable: Set<number>;
  pred: Map<number, { from: number; mode: Mode }>;
  rewards: (Reward & { reachable: boolean })[];
  warnings: { level: 'ERROR' | 'WARN' | 'INFO'; msg: string }[];
}

function solve(s: StageDef, stageNo: number): Solved {
  const nodes: Node[] = [];
  let id = 0;
  const floors = floorSpans(s);
  for (const [x1, x2] of floors) nodes.push({ id: id++, kind: 'floor', x1, x2, top: GROUND_TOP_Y });
  for (const [x, top, w] of s.platforms ?? []) nodes.push({ id: id++, kind: 'ledge', x1: x, x2: x + w, top });
  // Synthesize the one-way pad perches GameScene adds at runtime (bounce-only reward shelves).
  const padPerchIds: { padX: number; node: Node }[] = [];
  for (const px of s.pads ?? []) {
    const node: Node = { id: id++, kind: 'pad', x1: px - PAD_PERCH_W / 2, x2: px + PAD_PERCH_W / 2, top: PAD_PERCH_TOP };
    nodes.push(node);
    padPerchIds.push({ padX: px, node });
  }

  const reachable = new Set<number>();
  const pred = new Map<number, { from: number; mode: Mode }>();
  const floorNode = (x: number) => nodes.find((n) => n.kind === 'floor' && x >= n.x1 && x <= n.x2);

  // Start: the floor segment under the spawn point (left edge of the stage).
  const start = floorNode(100) ?? nodes.find((n) => n.kind === 'floor');
  if (start) reachable.add(start.id);

  const relax = (): boolean => {
    let changed = false;
    // Bounce pads: reachable straight up from the floor segment they sit on.
    for (const { padX, node } of padPerchIds) {
      if (reachable.has(node.id)) continue;
      const fn = floorNode(padX);
      if (fn && reachable.has(fn.id) && RISE.bounce >= GROUND_TOP_Y - node.top) {
        reachable.add(node.id);
        pred.set(node.id, { from: fn.id, mode: 'bounce' });
        changed = true;
      }
    }
    // Jump/drop edges between every reachable node and every other node.
    for (const a of nodes) {
      if (!reachable.has(a.id)) continue;
      for (const b of nodes) {
        if (b.id === a.id || reachable.has(b.id)) continue;
        if (b.kind === 'pad') continue; // perches are only entered by their own bounce
        const d = hGap(a, b);
        for (const mode of ['single', 'double'] as Mode[]) {
          const r = maxHoriz(a.top, b.top, mode);
          if (r >= 0 && d <= r) {
            reachable.add(b.id);
            pred.set(b.id, { from: a.id, mode });
            changed = true;
            break;
          }
        }
      }
    }
    return changed;
  };
  while (relax()) {}

  // ── Rewards ──────────────────────────────────────────────────────────────
  const rewards: (Reward & { reachable: boolean })[] = [];
  const nearestReachable = (rx: number, ry: number): Node | null => {
    let best: Node | null = null;
    for (const n of nodes) {
      if (!reachable.has(n.id)) continue;
      const withinX = rx >= n.x1 - 45 && rx <= n.x2 + 45;
      const above = n.top - ry; // reward above the surface by this much
      if (withinX && ry <= n.top + 70 && above <= RISE.double + 30) {
        if (!best || n.top < best.top) best = n; // prefer the highest supporting surface
      }
    }
    return best;
  };
  const addReward = (r: Reward) => rewards.push({ ...r, reachable: nearestReachable(r.x, r.y) !== null });

  for (const a of s.atoms) {
    const y = a.y ?? ATOM_FLOAT_Y;
    const col = ELEMENT_COLORS[a.choices[0] as ElementType] ?? 0xcfd6dd;
    addReward({ x: a.x, y, label: a.choices.map((c) => c[0].toUpperCase()).join('/'), color: col, kind: a.y !== undefined ? 'summit' : 'atom' });
  }
  for (const px of s.pads ?? []) {
    addReward({ x: px, y: PAD_PERCH_TOP - 40, label: '*', color: 0xffd700, kind: 'padReward' });
  }
  const gem = NOBLE_BY_STAGE[stageNo];
  if (gem) {
    const def = NOBLE_GAS_BY_ID[gem.gas];
    addReward({ x: gem.x, y: gem.y, label: def.symbol, color: def.color, kind: 'gem' });
  }

  // ── Warnings ──────────────────────────────────────────────────────────────
  const warnings: Solved['warnings'] = [];
  for (const n of nodes) {
    if (reachable.has(n.id)) continue;
    if (n.kind === 'pad') warnings.push({ level: 'WARN', msg: `pad perch @${Math.round((n.x1 + n.x2) / 2)} unreachable — its pad's floor is cut off` });
    else warnings.push({ level: 'WARN', msg: `${n.kind} @[${Math.round(n.x1)},${Math.round(n.top)}] unreachable (no jump lands here)` });
  }
  for (const r of rewards) {
    if (r.reachable) continue;
    const what = r.kind === 'gem' ? `noble gem ${r.label}` : r.kind === 'padReward' ? 'pad reward' : `atom ${r.label}`;
    const inGap = s.gaps.find(([a, b]) => r.x >= a && r.x <= b);
    if (inGap) {
      warnings.push({ level: 'WARN', msg: `${what} @[${Math.round(r.x)},${Math.round(r.y)}] floats inside gap [${inGap[0]},${inGap[1]}] — grabbable only mid-leap over a pit, likely unintended` });
    } else {
      warnings.push({ level: 'ERROR', msg: `${what} @[${Math.round(r.x)},${Math.round(r.y)}] is UNREACHABLE — no reachable ledge supports it (dead content)` });
    }
  }
  // Gaps: crossable directly, only via a stepping stone, or (if the far side is unreachable) not at all.
  for (const [a, b] of s.gaps) {
    const w = b - a;
    const far = nodes.find((n) => n.kind === 'floor' && n.x1 >= b - 1);
    if (far && !reachable.has(far.id)) {
      warnings.push({ level: 'ERROR', msg: `gap [${a},${b}] (w=${w}) — far side floor is unreachable` });
    } else if (w > FLAT_DOUBLE_REACH + 0.5) {
      warnings.push({ level: 'INFO', msg: `gap [${a},${b}] (w=${w}) exceeds a flat double-jump (${Math.round(FLAT_DOUBLE_REACH)}px) — needs a stepping stone` });
    }
  }
  // Structural smell: a ledge whose span sits over a hazard/gap (footing hangs in a bad spot).
  const bad: [number, number][] = [...s.gaps, ...(s.hazards ?? [])];
  for (const [x, top, wid] of s.platforms ?? []) {
    if (top >= GROUND_TOP_Y - 4) continue; // near-floor stepping stones are meant to sit there
    for (const [ha, hb] of bad) {
      if (x < hb && x + wid > ha) {
        warnings.push({ level: 'INFO', msg: `ledge @[${x},${top}] overhangs a gap/hazard [${ha},${hb}]` });
        break;
      }
    }
  }
  return { nodes, reachable, pred, rewards, warnings };
}

// ── SVG rendering ──────────────────────────────────────────────────────────────
const hex = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FLYERS = new Set(['virus', 'pollen', 'spore', 'fly', 'bee']);

function arcPath(a: Node, b: Node, mode: Mode, tx: (x: number) => number, ty: (y: number) => number): string {
  // Recover a takeoff/landing pair near the facing edges, then sample the parabola.
  const goRight = (b.x1 + b.x2) / 2 >= (a.x1 + a.x2) / 2;
  const x0 = goRight ? Math.min(a.x2, (a.x1 + a.x2) / 2 + 10) : Math.max(a.x1, (a.x1 + a.x2) / 2 - 10);
  const xEnd = goRight ? Math.max(b.x1, (b.x1 + b.x2) / 2 - 10) : Math.min(b.x2, (b.x1 + b.x2) / 2 + 10);
  const rise = mode === 'bounce' ? RISE.bounce : RISE[mode];
  const vyEff = Math.sqrt(2 * g * rise);
  const dh = a.top - b.top;
  const disc = Math.max(0, vyEff * vyEff - 2 * g * dh);
  const tEnd = (vyEff + Math.sqrt(disc)) / g;
  const dir = goRight ? 1 : -1;
  const pts: string[] = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = (tEnd * i) / N;
    const wx = x0 + dir * VX * t;
    const wy = a.top - (vyEff * t - 0.5 * g * t * t);
    pts.push(`${tx(wx).toFixed(1)},${ty(wy).toFixed(1)}`);
  }
  // Snap the final point onto the landing ledge for a clean visual.
  pts[pts.length - 1] = `${tx(xEnd).toFixed(1)},${ty(b.top).toFixed(1)}`;
  return pts.join(' ');
}

function renderStage(s: StageDef, stageNo: number, sol: Solved): string {
  const rise = s.rise ?? 0;
  const minY = -(rise + 80);
  const maxY = GROUND_TOP_Y + 100; // show a slice of the pits below the floor
  const SC = 0.19;
  const PAD = 22;
  const W = s.width * SC + PAD * 2;
  const H = (maxY - minY) * SC + PAD * 2;
  const tx = (x: number) => PAD + x * SC;
  const ty = (y: number) => PAD + (y - minY) * SC;
  const g0 = ty(GROUND_TOP_Y);
  const bottom = ty(maxY);
  const parts: string[] = [];

  parts.push(`<svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}" class="stagesvg">`);
  // sky + climbable band
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#0d1420"/>`);
  if (rise > 0) parts.push(`<rect x="${PAD}" y="${ty(minY)}" width="${s.width * SC}" height="${(g0 - ty(minY)).toFixed(1)}" fill="#111c2b"/>`);

  // floor solids + gaps
  for (const [a, b] of floorSpans(s)) parts.push(`<rect x="${tx(a).toFixed(1)}" y="${g0.toFixed(1)}" width="${((b - a) * SC).toFixed(1)}" height="${(bottom - g0).toFixed(1)}" fill="#2a3646"/>`);
  parts.push(`<line x1="${PAD}" y1="${g0.toFixed(1)}" x2="${(W - PAD).toFixed(1)}" y2="${g0.toFixed(1)}" stroke="#4a5f78" stroke-width="1.5"/>`);
  for (const [a, b] of s.gaps) parts.push(`<rect x="${tx(a).toFixed(1)}" y="${g0.toFixed(1)}" width="${((b - a) * SC).toFixed(1)}" height="${(bottom - g0).toFixed(1)}" fill="#070b12"/>`);
  for (const [a, b] of s.crumble ?? []) parts.push(`<rect x="${tx(a).toFixed(1)}" y="${g0.toFixed(1)}" width="${((b - a) * SC).toFixed(1)}" height="8" fill="#6b5a2a" stroke="#caa64a" stroke-dasharray="3 2"/>`);
  for (const [a, b] of s.hazards ?? []) parts.push(`<rect x="${tx(a).toFixed(1)}" y="${(g0 - 4).toFixed(1)}" width="${((b - a) * SC).toFixed(1)}" height="7" fill="#7bd23a" opacity="0.85"/>`);

  // reach arcs (toggle layer)
  parts.push(`<g class="arcs">`);
  for (const n of sol.nodes) {
    const p = sol.pred.get(n.id);
    if (!p) continue;
    const from = sol.nodes.find((m) => m.id === p.from);
    if (!from) continue;
    const d = hGap(from, n);
    const tight = p.mode !== 'bounce' && d > 0.85 * maxHoriz(from.top, n.top, p.mode);
    const col = p.mode === 'bounce' ? '#ff8adf' : tight ? '#ffb347' : '#6fd08c';
    parts.push(`<polyline points="${arcPath(from, n, p.mode, tx, ty)}" fill="none" stroke="${col}" stroke-width="1.1" stroke-dasharray="4 3" opacity="0.75"/>`);
  }
  parts.push(`</g>`);

  // platforms + pad perches, colour-coded by reachability
  for (const n of sol.nodes) {
    if (n.kind === 'floor') continue;
    const reach = sol.reachable.has(n.id);
    const fill = n.kind === 'pad' ? (reach ? '#b98cff' : '#d33') : reach ? '#3f8f5a' : '#c0392b';
    const stroke = reach ? '#bfe8cc' : '#ff6b5a';
    const dash = n.kind === 'pad' ? ` stroke-dasharray="4 2"` : '';
    parts.push(`<rect x="${tx(n.x1).toFixed(1)}" y="${ty(n.top).toFixed(1)}" width="${((n.x2 - n.x1) * SC).toFixed(1)}" height="6" fill="${fill}" stroke="${stroke}" stroke-width="1"${dash}/>`);
  }

  // pad domes on the floor
  for (const px of s.pads ?? []) parts.push(`<circle cx="${tx(px).toFixed(1)}" cy="${(g0 - 3).toFixed(1)}" r="4" fill="#b98cff"/>`);

  // rewards (toggle layer)
  parts.push(`<g class="rewards">`);
  for (const r of sol.rewards) {
    const cx = tx(r.x);
    const cy = ty(r.y);
    const ring = r.reachable ? '#e8c14a' : '#ff3b30';
    if (r.kind === 'gem') parts.push(`<path d="M${cx.toFixed(1)},${(cy - 5).toFixed(1)} L${(cx + 5).toFixed(1)},${cy.toFixed(1)} L${cx.toFixed(1)},${(cy + 5).toFixed(1)} L${(cx - 5).toFixed(1)},${cy.toFixed(1)} Z" fill="${hex(r.color)}" stroke="${ring}" stroke-width="1.5"/>`);
    else parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.4" fill="${hex(r.color)}" stroke="${ring}" stroke-width="1.5"/>`);
    if (!r.reachable) parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7" fill="none" stroke="#ff3b30" stroke-width="1.2"/>`);
  }
  parts.push(`</g>`);

  // enemies (toggle layer)
  parts.push(`<g class="foes">`);
  for (const e of s.enemies) {
    const inHole = s.gaps.some(([a, b]) => e.x >= a && e.x <= b);
    if (inHole) continue; // GameScene skips these
    const ey = e.y ?? (FLYERS.has(e.type) ? 285 : GROUND_TOP_Y - 6);
    parts.push(`<circle cx="${tx(e.x).toFixed(1)}" cy="${ty(ey).toFixed(1)}" r="2.6" fill="${FLYERS.has(e.type) ? '#e08a3a' : '#d0556a'}"/>`);
  }
  parts.push(`</g>`);

  // spawn + exit/boss
  parts.push(`<circle cx="${tx(100).toFixed(1)}" cy="${(g0 - 6).toFixed(1)}" r="4" fill="#4ad4ff"/><text x="${tx(100).toFixed(1)}" y="${(g0 - 12).toFixed(1)}" fill="#4ad4ff" font-size="8" text-anchor="middle">start</text>`);
  if (s.boss) parts.push(`<rect x="${(tx(s.boss.x) - 6).toFixed(1)}" y="${(g0 - 22).toFixed(1)}" width="12" height="16" fill="#ff4d6d"/><text x="${tx(s.boss.x).toFixed(1)}" y="${(g0 - 26).toFixed(1)}" fill="#ff4d6d" font-size="8" text-anchor="middle">BOSS</text>`);
  if (s.exitX) parts.push(`<rect x="${(tx(s.exitX) - 3).toFixed(1)}" y="${(g0 - 24).toFixed(1)}" width="6" height="18" fill="#48d18a"/><text x="${tx(s.exitX).toFixed(1)}" y="${(g0 - 28).toFixed(1)}" fill="#48d18a" font-size="8" text-anchor="middle">exit</text>`);

  parts.push(`</svg>`);
  return parts.join('');
}

/** Threat-density strip, aligned to the map's x-scale. `globalMax` normalizes bar heights so a tall
 *  bar means the same pressure in every stage (cross-stage comparison). */
function renderPacingStrip(width: number, pac: Pacing, globalMax: number): string {
  const SC = 0.19;
  const PAD = 22;
  const W = width * SC + PAD * 2;
  const stripH = 74;
  const base = stripH - 14;
  const barMax = 46;
  const tx = (x: number) => PAD + x * SC;
  const parts: string[] = [`<svg viewBox="0 0 ${W.toFixed(0)} ${stripH}" width="${W.toFixed(0)}" height="${stripH}" class="stripsvg">`];
  parts.push(`<rect x="0" y="0" width="${W}" height="${stripH}" fill="#0d1420"/>`);
  // longest breather band
  if (pac.longestRest.len > 400) {
    const bx = tx(pac.longestRest.x - pac.longestRest.len / 2);
    parts.push(`<rect x="${bx.toFixed(1)}" y="4" width="${(pac.longestRest.len * SC).toFixed(1)}" height="${base - 4}" fill="#2a6bff" opacity="0.12"/>`);
  }
  // bars
  pac.bins.forEach((v, i) => {
    if (v <= 0) return;
    const r = globalMax > 0 ? v / globalMax : 0;
    const h = Math.max(1.5, r * barMax);
    const col = r < 0.34 ? '#3f8f5a' : r < 0.67 ? '#e8c14a' : '#c0392b';
    const x = tx(pac.binX[i] - BIN / 2) + 1;
    parts.push(`<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${(BIN * SC - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${col}"/>`);
  });
  parts.push(`<line x1="${PAD}" y1="${base}" x2="${(W - PAD).toFixed(1)}" y2="${base}" stroke="#4a5f78" stroke-width="1"/>`);
  // peak tick
  if (pac.peak.v > 0) parts.push(`<line x1="${tx(pac.peak.x).toFixed(1)}" y1="4" x2="${tx(pac.peak.x).toFixed(1)}" y2="${base}" stroke="#ff8adf" stroke-width="0.8" stroke-dasharray="2 2"/>`);
  const arrow = pac.slope > RAMP_FLAT ? '▲ rising' : pac.slope < -RAMP_FLAT ? '▼ front-loaded' : '▬ flat';
  parts.push(
    `<text x="${PAD}" y="${stripH - 2}" fill="#7d93ad" font-size="8">threat ${pac.totalThreat.toFixed(1)} · CV ${pac.cv.toFixed(2)} · ramp ${arrow} (${pac.slope >= 0 ? '+' : ''}${pac.slope.toFixed(1)}/1k) · rest ${Math.round(pac.longestRest.len)}px</text>`,
  );
  parts.push(`</svg>`);
  return parts.join('');
}

// ── Assemble the report ────────────────────────────────────────────────────────
function main() {
  const stageBlocks: string[] = [];
  const summaryRows: string[] = [];
  let totalErr = 0;
  let totalWarn = 0;

  console.log(`\nLevel reachability report — reach: single ${RISE.single.toFixed(0)}px, double ${RISE.double.toFixed(0)}px, bounce ${RISE.bounce.toFixed(0)}px; flat double-gap ${FLAT_DOUBLE_REACH.toFixed(0)}px\n`);

  // Pass 1 — solve reachability + pacing for every stage; track the global peak density so the
  // pacing strips share one vertical scale (a tall bar means the same pressure in any stage).
  interface Rec {
    s: StageDef;
    stageNo: number;
    sec: number;
    sub: number;
    sol: Solved;
    pac: Pacing;
    all: Solved['warnings'];
  }
  const recs: Rec[] = [];
  let globalMax = 0;
  for (let i = 0; i < STAGES.length; i++) {
    const s = STAGES[i];
    const stageNo = i + 1;
    const sol = solve(s, stageNo);
    const pac = pacing(s);
    globalMax = Math.max(globalMax, ...pac.bins);
    const pw: Solved['warnings'] = [];
    if (pac.totalThreat > 0 && pac.cv < 0.45) pw.push({ level: 'INFO', msg: `flat threat pacing (CV=${pac.cv.toFixed(2)}) — enemies evenly spread, little tension/rest contrast` });
    if (s.boss && pac.slope < RAMP_FLAT) pw.push({ level: 'INFO', msg: `threat does not build toward the boss (ramp ${pac.slope >= 0 ? '+' : ''}${pac.slope.toFixed(1)}/1k)` });
    if (pac.deadStretch && pac.deadStretch.len > 900) pw.push({ level: 'INFO', msg: `dead stretch ${Math.round(pac.deadStretch.len)}px [${Math.round(pac.deadStretch.a)},${Math.round(pac.deadStretch.b)}] — no enemies, terrain, or rewards` });
    recs.push({ s, stageNo, sec: sectorOf(stageNo), sub: substageOf(stageNo), sol, pac, all: [...sol.warnings, ...pw] });
  }

  // Pass 2 — render maps + pacing strips against the shared scale.
  for (const { s, stageNo, sec, sub, sol, pac, all } of recs) {
    const errs = all.filter((w) => w.level === 'ERROR');
    const warns = all.filter((w) => w.level === 'WARN');
    const infos = all.filter((w) => w.level === 'INFO');
    totalErr += errs.length;
    totalWarn += warns.length;
    const tag = `${sec}-${sub}`;

    const flag = errs.length ? '✗' : warns.length ? '!' : '·';
    const ramp = pac.slope > RAMP_FLAT ? '▲' : pac.slope < -RAMP_FLAT ? '▼' : '▬';
    console.log(`${flag} ${tag} ${s.name}  —  ${errs.length} err, ${warns.length} warn, ${infos.length} info  ·  threat ${pac.totalThreat.toFixed(1)}, CV ${pac.cv.toFixed(2)}, ramp ${ramp}${pac.slope >= 0 ? '+' : ''}${pac.slope.toFixed(1)}, rest ${Math.round(pac.longestRest.len)}px`);
    for (const w of [...errs, ...warns, ...infos]) console.log(`     ${w.level}: ${w.msg}`);

    const wl = all.length ? `<ul class="warns">${[...errs, ...warns, ...infos].map((w) => `<li class="${w.level}">${esc(w.msg)}</li>`).join('')}</ul>` : `<p class="clean">No problems flagged.</p>`;
    stageBlocks.push(
      `<section id="s${stageNo}"><h2>${tag} · ${esc(s.name)} <span class="meta">${SECTORS[sec].name} · w=${s.width} · rise=${s.rise ?? 0} · ${s.boss ? 'BOSS' : 'exit'} · ${s.enemies.length} foes</span></h2>` +
        `<div class="map">${renderStage(s, stageNo, sol)}</div>` +
        `<div class="map strip">${renderPacingStrip(s.width, pac, globalMax)}</div>${wl}</section>`,
    );
    summaryRows.push(
      `<tr class="${errs.length ? 'r-err' : warns.length ? 'r-warn' : 'r-ok'}"><td><a href="#s${stageNo}">${tag}</a></td><td>${esc(s.name)}</td><td>${s.enemies.length}</td><td>${pac.totalThreat.toFixed(1)}</td><td>${pac.cv.toFixed(2)}</td><td>${ramp} ${pac.slope >= 0 ? '+' : ''}${pac.slope.toFixed(1)}</td><td>${Math.round(pac.longestRest.len)}</td><td>${errs.length}</td><td>${warns.length}</td></tr>`,
    );
  }

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Molecular Meltdown — Level Maps</title><style>
:root{color-scheme:dark}
body{margin:0;background:#0a0f18;color:#dfe7f0;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
header{position:sticky;top:0;background:#0a0f18ee;backdrop-filter:blur(6px);padding:14px 20px;border-bottom:1px solid #1e2b3d;z-index:5}
h1{margin:0 0 4px;font-size:16px}
.sub{color:#8aa0ba;font-size:12px}
.toggles{margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;font-size:12px}
.toggles label{cursor:pointer;user-select:none}
main{padding:20px;max-width:1200px;margin:0 auto}
table{border-collapse:collapse;width:100%;margin-bottom:26px;font-size:12px}
th,td{padding:4px 8px;text-align:left;border-bottom:1px solid #17222f}
th{color:#8aa0ba;font-weight:600}
td:nth-child(n+3),th:nth-child(n+3){text-align:right}
a{color:#6fd0ff;text-decoration:none}a:hover{text-decoration:underline}
.r-err td:first-child a{color:#ff6b5a}.r-warn td:first-child a{color:#ffb347}
section{margin:0 0 30px;padding:14px;background:#0d1420;border:1px solid #1a2739;border-radius:8px}
h2{margin:0 0 8px;font-size:14px}
.meta{color:#7d93ad;font-weight:400;font-size:11px}
.map{overflow-x:auto;background:#0d1420;border-radius:6px}
.strip{margin-top:6px;border-top:1px dashed #22303f}
.stagesvg,.stripsvg{display:block}
.warns{margin:10px 0 0;padding-left:18px}
.warns li{margin:2px 0}
.warns .ERROR{color:#ff6b5a}.warns .WARN{color:#ffb347}.warns .INFO{color:#7d93ad}
.clean{color:#6fd08c;margin:8px 0 0}
.legend{display:flex;gap:16px;flex-wrap:wrap;color:#8aa0ba;font-size:11px;margin-top:8px}
.legend span{display:inline-flex;align-items:center;gap:5px}
.sw{width:12px;height:12px;border-radius:2px;display:inline-block}
body.hide-arcs .arcs{display:none}body.hide-rewards .rewards{display:none}body.hide-foes .foes{display:none}
</style></head><body>
<header><h1>Molecular Meltdown — Level Maps, Reachability &amp; Pacing</h1>
<div class="sub">${STAGES.length} stages · reach: single ${RISE.single.toFixed(0)}px / double ${RISE.double.toFixed(0)}px / bounce ${RISE.bounce.toFixed(0)}px · flat double-gap ${FLAT_DOUBLE_REACH.toFixed(0)}px · <b style="color:#ff6b5a">${totalErr} errors</b>, <b style="color:#ffb347">${totalWarn} warnings</b></div>
<div class="legend">
<span><i class="sw" style="background:#3f8f5a"></i>reachable ledge</span>
<span><i class="sw" style="background:#c0392b"></i>unreachable</span>
<span><i class="sw" style="background:#b98cff"></i>bounce perch</span>
<span><i class="sw" style="background:#6fd08c"></i>jump arc</span>
<span><i class="sw" style="background:#ffb347"></i>tight jump</span>
<span><i class="sw" style="background:#ff8adf"></i>bounce arc</span>
<span><i class="sw" style="background:#7bd23a"></i>hazard</span>
<span><i class="sw" style="background:#caa64a"></i>crumble</span>
<span style="color:#ff3b30">◎ unreachable reward</span>
<span>│ strip: threat/250px — <i class="sw" style="background:#3f8f5a"></i>low <i class="sw" style="background:#e8c14a"></i>mid <i class="sw" style="background:#c0392b"></i>high</span>
<span><i class="sw" style="background:#2a6bff"></i>breather</span>
<span style="color:#ff8adf">┊ peak</span>
</div>
<div class="toggles">
<label><input type="checkbox" id="t-arcs" checked> reach arcs</label>
<label><input type="checkbox" id="t-rewards" checked> rewards</label>
<label><input type="checkbox" id="t-foes" checked> enemies</label>
</div></header>
<main>
<table><thead><tr><th>Stage</th><th>Name</th><th>Foes</th><th>Threat</th><th>CV</th><th>Ramp</th><th>Rest</th><th>Err</th><th>Warn</th></tr></thead><tbody>${summaryRows.join('')}</tbody></table>
${stageBlocks.join('\n')}
</main>
<script>
for (const [id,cls] of [['t-arcs','hide-arcs'],['t-rewards','hide-rewards'],['t-foes','hide-foes']]) {
  const el = document.getElementById(id);
  el.addEventListener('change', () => document.body.classList.toggle(cls, !el.checked));
}
</script>
</body></html>`;

  const out = fileURLToPath(new URL('../docs/level-maps.html', import.meta.url));
  writeFileSync(out, html);
  console.log(`\n${totalErr} errors, ${totalWarn} warnings across ${STAGES.length} stages.`);
  console.log(`Wrote ${out}\n`);
}

main();
