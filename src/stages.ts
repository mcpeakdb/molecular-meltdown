import type { BaseAtom, NobleGasId } from './constants';
import type { BossVariant } from './entities/Boss';
import type { EnemyType } from './entities/Enemy';

// ── Stage configuration ───────────────────────────────────────────────────────
// The game is 9 stages (3 sectors × 3 stages). Each stage is fully described here;
// GameScene reads STAGES[stage - 1] and builds the level from it. The 3rd stage of
// every sector is a boss finale (`boss`); the other six clear by reaching `exitX`.
//
// Theme/art is keyed by sector (see constants `SECTORS` / GameScene `SECTOR_THEMES`),
// not by individual stage, so all three stages of a sector share a biome.

export interface StageEnemy {
  x: number;
  type: EnemyType;
}

export interface StageDef {
  /** Flavor sub-name shown in the stage intro, e.g. "Inoculation Zone". */
  name: string;
  /** Total walkable width of this stage (camera + physics bounds). */
  width: number;
  /** Atom pickups — each a branching choice node. `y` perches it on a ledge (defaults to floating). */
  atoms: { x: number; y?: number; choices: BaseAtom[] }[];
  /** Enemy placements (y is randomized within the floor band at spawn). */
  enemies: StageEnemy[];
  /** Chasms to jump; an enemy that would spawn inside one is skipped. */
  gaps: [number, number][];
  /** Solid ledges to jump onto: [xLeft, yTop, width]. The floor surface sits at GROUND_TOP_Y (470). */
  platforms?: [number, number, number][];
  /** Acid pools / spike beds — floor strips that sear the player unless jumped over. */
  hazards?: [number, number][];
  /** Bounce-pad x-positions — step on a springy spore to launch a high arc. */
  pads?: number[];
  /** Crumbling floor tiles [x1, x2] — they collapse into a chasm shortly after you stand on one. */
  crumble?: [number, number][];
  /** A hidden noble-gas bonus pickup — usually perched high or guarded by a strong germ. */
  noble?: { x: number; y: number; gas: NobleGasId; guard?: EnemyType };
  /** Boss finale (3rd stage of a sector). Mutually exclusive with `exitX`. */
  boss?: { variant: BossVariant; x: number };
  /** Non-boss stages clear by reaching this x — an exit portal sits here. */
  exitX?: number;
}

/** Evenly lay out a list of enemy types between x=from and x=to. */
function spread(from: number, to: number, types: EnemyType[]): StageEnemy[] {
  if (types.length === 1) return [{ x: from, type: types[0] }];
  const step = (to - from) / (types.length - 1);
  return types.map((type, i) => ({ x: Math.round(from + i * step), type }));
}

export const STAGES: StageDef[] = [
  // ── Sector 1 — PETRI DISH ────────────────────────────────────────────────
  // 1-1 — gentle introduction: sparse foes, simple H/O atoms, a single gap.
  {
    name: 'INOCULATION ZONE',
    width: 3600,
    atoms: [
      { x: 650, choices: ['hydrogen', 'oxygen'] },
      { x: 1500, choices: ['hydrogen', 'oxygen'] },
      { x: 2500, choices: ['hydrogen', 'carbon'] },
    ],
    enemies: [
      ...spread(600, 1300, ['bacterium', 'virus', 'bacterium']),
      ...spread(1750, 2400, ['virus', 'bacterium', 'pollen']),
      ...spread(2700, 3250, ['bacterium', 'dustbunny', 'virus']),
    ],
    gaps: [[1500, 1620]],
    // Gentle introduction to jumping onto ledges — a low, climbable row.
    platforms: [
      [700, 410, 120],
      [1080, 360, 140],
      [1840, 390, 150],
      [2250, 350, 130],
      [2700, 400, 150],
      [3050, 360, 140],
    ],
    // First taste of platforming: a single springy spore to bop on, just past the gap.
    pads: [2050],
    exitX: 3380,
  },
  // 1-2 — busier petri dish: a couple of gaps, the first real crowd.
  {
    name: 'THE AGAR FLATS',
    width: 4200,
    atoms: [
      { x: 500, choices: ['hydrogen', 'oxygen'] },
      { x: 1400, choices: ['oxygen', 'carbon'] },
      { x: 2300, choices: ['hydrogen', 'oxygen'] },
      { x: 3300, choices: ['hydrogen', 'carbon'] },
    ],
    enemies: [
      ...spread(550, 1250, ['virus', 'bacterium', 'virus', 'pollen']),
      ...spread(1700, 2500, ['bacterium', 'dustbunny', 'virus', 'bacterium']),
      ...spread(2750, 3650, ['virus', 'pollen', 'bacterium', 'dustbunny', 'virus']),
    ],
    gaps: [
      [1450, 1570],
      [2950, 3070],
    ],
    platforms: [
      [600, 400, 120],
      [1000, 350, 140],
      [1750, 380, 140],
      [2150, 360, 140], // staircase up to the Helium gem — each step is a single hop
      [2330, 300, 130],
      [2480, 250, 140], // Helium gem ledge
      [2900, 360, 150],
      [3250, 320, 130],
    ],
    // Helium — up a gentle single-jump staircase mid-stage (unguarded, the easiest find).
    noble: { x: 2550, y: 212, gas: 'helium' },
    pads: [800],
    // First crumbling tile — stand too long and the agar gives way into a chasm.
    crumble: [[3550, 3690]],
    exitX: 3980,
  },
  // 1-3 — Colony Core: the Super Bacterium finale.
  {
    name: 'COLONY CORE',
    width: 5000,
    atoms: [
      { x: 500, choices: ['hydrogen', 'oxygen'] },
      { x: 1300, choices: ['oxygen', 'carbon'] },
      { x: 2100, choices: ['hydrogen', 'oxygen'] },
      { x: 2900, choices: ['hydrogen', 'carbon'] },
      { x: 3700, choices: ['oxygen', 'hydrogen'] },
    ],
    enemies: [
      ...spread(550, 1300, ['bacterium', 'virus', 'bacterium', 'pollen']),
      ...spread(1700, 2500, ['virus', 'dustbunny', 'bacterium', 'virus']),
      ...spread(2950, 3800, ['bacterium', 'pollen', 'virus', 'dustbunny', 'bacterium']),
    ],
    gaps: [
      [1450, 1570],
      [3050, 3170],
    ],
    platforms: [
      [700, 400, 130],
      [1100, 350, 140],
      [1900, 380, 150],
      [2000, 300, 120], // step up toward the Neon gem
      [2150, 240, 130], // Neon gem ledge (high, guarded below)
      [2750, 360, 150],
      [3300, 330, 160],
      [3900, 380, 140],
    ],
    // Neon — high up, with an amoeba standing guard at the base of the climb.
    noble: { x: 2215, y: 202, gas: 'neon', guard: 'amoeba' },
    // First hazard pool appears before the boss run-up; bop the pad to skip it cleanly.
    hazards: [[2300, 2440]],
    pads: [3650],
    boss: { variant: 'bacterium', x: 4500 },
  },

  // ── Sector 2 — BLOOD AGAR ────────────────────────────────────────────────
  // 2-1 — newcomers arrive: amoeba (tank) + spore (fast). Heavier pacing.
  {
    name: 'HEMOLYTIC FIELDS',
    width: 4200,
    atoms: [
      { x: 500, choices: ['oxygen', 'carbon'] },
      { x: 1300, choices: ['hydrogen', 'nitrogen'] },
      { x: 2200, choices: ['oxygen', 'carbon'] },
      { x: 3200, choices: ['hydrogen', 'oxygen'] },
    ],
    enemies: [
      ...spread(550, 1250, ['spore', 'virus', 'spore', 'amoeba']),
      ...spread(1700, 2500, ['virus', 'spore', 'amoeba', 'virus']),
      ...spread(2750, 3650, ['spore', 'bacterium', 'spore', 'amoeba', 'virus']),
    ],
    gaps: [
      [1450, 1580],
      [2950, 3080],
    ],
    platforms: [
      [650, 400, 120],
      [1100, 350, 140],
      [1550, 320, 130],
      [2050, 380, 140],
      [2600, 330, 150],
      [3150, 360, 140],
      [3650, 320, 150],
    ],
    hazards: [[2050, 2200]],
    pads: [800],
    crumble: [[3550, 3700]],
    exitX: 3980,
  },
  // 2-2 — plasma currents: dense spore swarms threading amoeba tanks.
  {
    name: 'PLASMA CURRENTS',
    width: 4600,
    atoms: [
      { x: 500, choices: ['oxygen', 'carbon'] },
      { x: 1200, choices: ['hydrogen', 'nitrogen'] },
      { x: 2000, choices: ['carbon', 'nitrogen'] },
      { x: 2900, choices: ['hydrogen', 'oxygen'] },
      { x: 3800, choices: ['oxygen', 'carbon', 'nitrogen'] },
    ],
    enemies: [
      ...spread(550, 1350, ['spore', 'amoeba', 'spore', 'virus', 'spore']),
      ...spread(1750, 2600, ['amoeba', 'spore', 'virus', 'spore', 'amoeba']),
      ...spread(2900, 3900, ['spore', 'virus', 'amoeba', 'spore', 'virus', 'spore']),
    ],
    gaps: [
      [1500, 1640],
      [3150, 3290],
    ],
    platforms: [
      [700, 390, 130],
      [1150, 340, 130],
      [1400, 290, 120],
      [2000, 370, 140],
      [2600, 330, 140],
      [2850, 260, 130], // Argon gem ledge (high, over solid ground)
      [3500, 330, 150],
      [3950, 360, 140],
    ],
    // Argon — up high over the plasma; a hovering spore makes the climb dangerous.
    noble: { x: 2910, y: 222, gas: 'argon', guard: 'spore' },
    hazards: [
      [900, 1040],
      [2350, 2520],
    ],
    pads: [1900],
    crumble: [[4050, 4200]],
    exitX: 4380,
  },
  // 2-3 — The Beating Heart: the Amoeba Titan finale.
  {
    name: 'THE BEATING HEART',
    width: 5200,
    atoms: [
      { x: 500, choices: ['oxygen', 'carbon'] },
      { x: 1300, choices: ['hydrogen', 'nitrogen'] },
      { x: 2100, choices: ['carbon', 'nitrogen'] },
      { x: 2900, choices: ['hydrogen', 'oxygen'] },
      { x: 3700, choices: ['oxygen', 'carbon', 'nitrogen'] },
    ],
    enemies: [
      ...spread(550, 1350, ['spore', 'amoeba', 'virus', 'spore']),
      ...spread(1750, 2600, ['amoeba', 'spore', 'amoeba', 'virus']),
      ...spread(2950, 3900, ['spore', 'amoeba', 'virus', 'spore', 'amoeba']),
    ],
    gaps: [
      [1500, 1640],
      [3200, 3340],
    ],
    platforms: [
      [700, 400, 130],
      [1150, 350, 140],
      [1500, 300, 130],
      [2100, 370, 140],
      [2400, 330, 140], // step toward the Krypton gem
      [2650, 250, 130], // Krypton gem ledge (high, over solid ground)
      [3500, 330, 150],
      [3950, 360, 150],
    ],
    // Krypton — a high perch between the chasms, with an amoeba guarding the approach.
    noble: { x: 2710, y: 212, gas: 'krypton', guard: 'amoeba' },
    hazards: [[2400, 2560]],
    pads: [1000, 4100],
    crumble: [[3650, 3800]],
    boss: { variant: 'amoeba', x: 4700 },
  },

  // ── Sector 3 — MACCONKEY ─────────────────────────────────────────────────
  // 3-1 — mites crawl in: the toughest mixed roster begins.
  {
    name: 'LACTOSE MARSHES',
    width: 4400,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1200, choices: ['hydrogen', 'oxygen'] },
      { x: 2000, choices: ['oxygen', 'nitrogen'] },
      { x: 2900, choices: ['hydrogen', 'carbon'] },
      { x: 3700, choices: ['carbon', 'oxygen'] },
    ],
    enemies: [
      ...spread(500, 1300, ['mite', 'spore', 'mite', 'amoeba']),
      ...spread(1700, 2600, ['mite', 'amoeba', 'spore', 'mite', 'virus']),
      ...spread(2900, 3850, ['mite', 'spore', 'amoeba', 'mite', 'spore', 'mite']),
    ],
    gaps: [
      [1450, 1590],
      [2700, 2840],
      [3450, 3680], // wide — clear it via the mid-gap stepping stone or a double-jump
    ],
    platforms: [
      [650, 390, 120],
      [1200, 350, 130],
      [1430, 300, 130], // staircase up to the Xenon gem — single hops, partly over the chasm
      [1650, 250, 130],
      [1820, 210, 130], // Xenon gem ledge (high, guarded)
      [2300, 360, 140],
      [3000, 320, 140],
      [3520, 410, 90], // stepping stone in the wide gap
      [3850, 330, 150],
    ],
    // Xenon — tucked high above the marshes, guarded by a mite.
    noble: { x: 1885, y: 172, gas: 'xenon', guard: 'mite' },
    hazards: [
      [1000, 1160],
      [2150, 2310],
    ],
    pads: [2600],
    exitX: 4180,
  },
  // 3-2 — bile salt barrens: three gaps, relentless mite + amoeba pressure.
  {
    name: 'BILE SALT BARRENS',
    width: 4800,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1900, choices: ['oxygen', 'nitrogen'] },
      { x: 2700, choices: ['hydrogen', 'carbon'] },
      { x: 3500, choices: ['carbon', 'oxygen'] },
      { x: 4200, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
    ],
    enemies: [
      ...spread(500, 1350, ['mite', 'amoeba', 'mite', 'spore', 'mite']),
      ...spread(1750, 2650, ['amoeba', 'mite', 'spore', 'mite', 'amoeba']),
      ...spread(3000, 4050, ['mite', 'spore', 'amoeba', 'mite', 'spore', 'mite', 'amoeba']),
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3450, 3590],
      [4000, 4220], // wide — clear it via the mid-gap stepping stone or a double-jump
    ],
    platforms: [
      [700, 390, 130],
      [1150, 340, 130],
      [1600, 300, 130],
      [2050, 350, 130],
      [2900, 330, 140],
      [3150, 270, 120],
      [3600, 330, 150],
      [4060, 410, 100], // stepping stone in the wide gap
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [1900, 3800],
    crumble: [[2650, 2790]],
    exitX: 4580,
  },
  // 3-3 — Crystal Violet Throne: the Phage Lord, final boss of the experiment.
  {
    name: 'CRYSTAL VIOLET THRONE',
    width: 5500,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1900, choices: ['oxygen', 'nitrogen'] },
      { x: 2650, choices: ['hydrogen', 'carbon'] },
      { x: 3400, choices: ['carbon', 'oxygen'] },
      { x: 4150, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
    ],
    enemies: [
      ...spread(500, 1350, ['mite', 'amoeba', 'spore', 'mite']),
      ...spread(1750, 2650, ['amoeba', 'mite', 'spore', 'amoeba', 'mite']),
      ...spread(3000, 4100, ['mite', 'amoeba', 'spore', 'mite', 'amoeba', 'spore']),
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3500, 3640],
      [4100, 4330], // wide — clear it via the mid-gap stepping stone or a double-jump
    ],
    platforms: [
      [700, 390, 130],
      [1150, 350, 130],
      [1360, 300, 140], // staircase up to the Radon gem — single hops, partly over the chasm
      [1580, 255, 140],
      [1800, 215, 140],
      [2030, 180, 150], // Radon gem ledge (the highest perch in the game)
      [2900, 350, 140],
      [3600, 320, 150],
      [4170, 410, 110], // stepping stone in the wide gap
      [4650, 340, 150],
    ],
    // Radon — the final, hardest find: highest perch in the game, guarded by an amoeba.
    noble: { x: 2105, y: 142, gas: 'radon', guard: 'amoeba' },
    hazards: [
      [950, 1120],
      [3000, 3180],
    ],
    pads: [1900, 4500],
    crumble: [[2700, 2850]],
    boss: { variant: 'phage', x: 5000 },
  },
];
