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
  /** Climbable "sky" above the standard screen, in px. When set, the camera follows the player
   *  vertically up to `rise` px above the normal view and structures can be built into negative y
   *  (the floor stays at GROUND_TOP_Y). Omitted/0 keeps the camera vertically locked as before. */
  rise?: number;
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
    // First vertical stage: the camera now follows the player up a climbable tower (see `rise`).
    rise: 480,
    atoms: [
      { x: 650, choices: ['hydrogen', 'oxygen'] },
      { x: 1500, choices: ['hydrogen', 'oxygen'] },
      // Reward for the climb — a third atom perched at the top of the tower.
      { x: 2610, y: -300, choices: ['hydrogen', 'carbon'] },
    ],
    enemies: [
      ...spread(600, 1300, ['bacterium', 'virus', 'bacterium']),
      ...spread(1750, 2400, ['virus', 'bacterium', 'pollen']),
      ...spread(2900, 3250, ['bacterium', 'dustbunny', 'virus']),
    ],
    gaps: [[1500, 1620]],
    platforms: [
      // Gentle introduction to jumping onto ledges — a low row.
      [700, 410, 120],
      [1080, 360, 140],
      [1840, 390, 150],
      [2250, 350, 130],
      // A zig-zag tower climbing into the sky; each step is a single hop, the top holds an atom.
      [2520, 400, 130],
      [2720, 300, 120],
      [2520, 200, 120],
      [2720, 90, 120],
      [2520, -20, 120],
      [2720, -140, 130],
      [2540, -260, 150],
      // Back down to the ground run-up to the exit.
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
    rise: 460,
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
      [2480, 250, 140], // Helium gem ledge — base of the sky tower
      // Sky tower up to the Helium gem (zig-zag single hops into the sky).
      [2660, 150, 130],
      [2480, 50, 130],
      [2660, -60, 130],
      [2480, -170, 150],
      [2900, 360, 150],
      [3250, 320, 130],
    ],
    // Helium — up a gentle single-jump staircase mid-stage (unguarded, the easiest find).
    pads: [800],
    // First crumbling tile — stand too long and the agar gives way into a chasm.
    crumble: [[3550, 3690]],
    exitX: 3980,
  },
  // 1-3 — Colony Core: the Super Bacterium finale.
  {
    name: 'COLONY CORE',
    width: 5000,
    rise: 480,
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
      [2150, 240, 130], // Neon gem ledge — base of the sky tower
      // Sky tower up to the Neon gem.
      [2330, 140, 130],
      [2150, 40, 130],
      [2330, -70, 130],
      [2150, -180, 150],
      [2750, 360, 150],
      [3300, 330, 160],
      [3900, 380, 140],
    ],
    // Neon — high up, with an amoeba standing guard at the base of the climb.
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
    rise: 420,
    atoms: [
      { x: 500, choices: ['oxygen', 'carbon'] },
      { x: 1300, choices: ['hydrogen', 'nitrogen'] },
      { x: 2675, y: -150, choices: ['oxygen', 'carbon'] }, // summit reward atop the sky tower
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
      [2600, 330, 150], // base of the sky tower
      // Sky tower to a perched atom reward.
      [2780, 220, 130],
      [2600, 110, 130],
      [2780, 0, 130],
      [2600, -110, 150],
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
    rise: 480,
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
      [2850, 260, 130], // Argon gem ledge — base of the sky tower
      // Sky tower up to the Argon gem; the hovering spore harasses the climb.
      [2660, 150, 130],
      [2850, 40, 130],
      [2660, -70, 130],
      [2850, -180, 150],
      [3500, 330, 150],
      [3950, 360, 140],
    ],
    // Argon — up high over the plasma; a hovering spore makes the climb dangerous.
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
    rise: 500,
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
      [2650, 250, 130], // Krypton gem ledge — base of the sky tower
      // Sky tower up to the Krypton gem.
      [2470, 140, 130],
      [2650, 30, 130],
      [2470, -80, 130],
      [2650, -190, 150],
      [3500, 330, 150],
      [3950, 360, 150],
    ],
    // Krypton — a high perch between the chasms, with an amoeba guarding the approach.
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
    rise: 540,
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
      [1820, 210, 130], // Xenon gem ledge — base of the sky tower
      // Sky tower up to the Xenon gem.
      [1640, 100, 130],
      [1820, -10, 130],
      [1640, -120, 130],
      [1820, -230, 150],
      [2300, 360, 140],
      [3000, 320, 140],
      [3520, 410, 90], // stepping stone in the wide gap
      [3850, 330, 150],
    ],
    // Xenon — tucked high above the marshes, guarded by a mite.
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
    rise: 420,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 2125, y: -130, choices: ['oxygen', 'nitrogen'] }, // summit reward atop the sky tower
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
      [2050, 350, 130], // base of the sky tower
      // Sky tower to a perched atom reward.
      [2230, 240, 130],
      [2050, 130, 130],
      [2230, 20, 130],
      [2050, -90, 150],
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
    rise: 600,
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
      [2030, 180, 150], // Radon gem ledge — base of the sky tower
      // Sky tower up to the Radon gem (the highest climb in the game).
      [1840, 70, 140],
      [2030, -40, 140],
      [1840, -150, 140],
      [2030, -260, 160],
      [2900, 350, 140],
      [3600, 320, 150],
      [4170, 410, 110], // stepping stone in the wide gap
      [4650, 340, 150],
    ],
    // Radon — the final, hardest find: highest perch in the game, guarded by an amoeba.
    hazards: [
      [950, 1120],
      [3000, 3180],
    ],
    pads: [1900, 4500],
    crumble: [[2700, 2850]],
    boss: { variant: 'phage', x: 5000 },
  },

  // ── Sector 4 — LAB FLOOR ──────────────────────────────────────────────────
  // Escaped the dishes onto the lab bench/floor: ants swarm and mites crawl, ending at the Roach King.
  // 4-1 — emerging onto the bench: ants arrive alongside the familiar mites.
  {
    name: 'BENCHTOP SPILL',
    width: 4600,
    rise: 520,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2675, y: -120, choices: ['hydrogen', 'carbon'] }, // summit reward atop the sky tower
      { x: 3700, choices: ['carbon', 'oxygen'] },
    ],
    enemies: [
      ...spread(500, 1300, ['ant', 'mite', 'ant', 'ant']),
      ...spread(1700, 2600, ['mite', 'ant', 'ant', 'mite', 'ant']),
      ...spread(2950, 3950, ['ant', 'mite', 'ant', 'ant', 'mite', 'ant']),
    ],
    gaps: [
      [1450, 1590],
      [2950, 3090],
    ],
    platforms: [
      [650, 390, 120],
      [1150, 350, 130],
      [1600, 310, 130],
      [2050, 360, 140],
      // sky tower
      [2600, 360, 140],
      [2790, 250, 130],
      [2600, 140, 130],
      [2790, 30, 130],
      [2600, -80, 150],
      [3300, 340, 150],
      [3850, 360, 140],
    ],
    hazards: [[2150, 2300]],
    pads: [900],
    crumble: [[4050, 4200]],
    exitX: 4380,
  },
  // 4-2 — crumb trails: four gaps, dense ant + mite pressure, two reagent spills.
  {
    name: 'CRUMB TRAILS',
    width: 4900,
    rise: 560,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2945, y: -230, choices: ['hydrogen', 'carbon'] }, // summit reward atop the sky tower
      { x: 3500, choices: ['carbon', 'oxygen'] },
      { x: 4200, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
    ],
    enemies: [
      ...spread(500, 1350, ['ant', 'mite', 'ant', 'ant', 'mite']),
      ...spread(1750, 2650, ['mite', 'ant', 'ant', 'mite', 'ant']),
      ...spread(3000, 4100, ['ant', 'mite', 'ant', 'ant', 'mite', 'ant', 'mite']),
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3500, 3640],
      [4100, 4320], // wide — clear it via the mid-gap stepping stone or a double-jump
    ],
    platforms: [
      [700, 390, 130],
      [1150, 350, 130],
      [1600, 300, 130],
      [2050, 350, 130],
      // sky tower
      [2680, 360, 140],
      [2870, 250, 130],
      [2680, 140, 130],
      [2870, 30, 130],
      [2680, -80, 130],
      [2870, -190, 150],
      [3700, 330, 150],
      [4170, 410, 110], // stepping stone in the wide gap
      [4600, 340, 150],
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [1900, 3800],
    crumble: [[2250, 2390]],
    exitX: 4680,
  },
  // 4-3 — The Roach Nest: the Roach King, final boss of the game.
  {
    name: 'THE ROACH NEST',
    width: 5600,
    rise: 620,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2760, y: -360, choices: ['hydrogen', 'carbon'] }, // summit reward (the highest climb in the game)
      { x: 3500, choices: ['carbon', 'oxygen'] },
      { x: 4150, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
    ],
    enemies: [
      ...spread(500, 1350, ['ant', 'mite', 'ant', 'ant']),
      ...spread(1750, 2650, ['mite', 'ant', 'ant', 'mite', 'ant']),
      ...spread(3000, 4100, ['ant', 'mite', 'ant', 'ant', 'mite', 'ant']),
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
      [1600, 300, 130],
      [2050, 350, 130],
      // sky tower — the tallest climb in the game
      [2680, 360, 140],
      [2870, 250, 140],
      [2680, 140, 140],
      [2870, 30, 140],
      [2680, -90, 140],
      [2870, -200, 150],
      [2680, -320, 160],
      [2900, 350, 140],
      [3600, 320, 150],
      [4170, 410, 110], // stepping stone in the wide gap
      [4650, 340, 150],
    ],
    hazards: [
      [950, 1120],
      [3000, 3180],
    ],
    pads: [1900, 4500],
    crumble: [[2250, 2390]],
    boss: { variant: 'roach', x: 5100 },
  },

  // ── Sector 5 — UNDER THE BENCH ────────────────────────────────────────────
  // Deeper into the lab: flies and bees join the ant/mite crawlers; finale is the Dung Beetle.
  // 5-1 — spill tray: first flyers harass the climbs.
  {
    name: 'SPILL TRAY',
    width: 4800,
    rise: 560,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2945, y: -230, choices: ['hydrogen', 'carbon'] }, // summit reward
      { x: 3600, choices: ['carbon', 'oxygen'] },
      { x: 4300, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
    ],
    enemies: [
      ...spread(500, 1350, ['ant', 'fly', 'ant', 'mite', 'fly']),
      ...spread(1750, 2650, ['mite', 'ant', 'fly', 'ant', 'mite']),
      ...spread(3000, 4050, ['ant', 'fly', 'mite', 'ant', 'fly', 'ant']),
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3500, 3640],
    ],
    platforms: [
      [700, 390, 130],
      [1150, 350, 130],
      [1600, 300, 130],
      [2050, 350, 130],
      [2680, 360, 130],
      [2870, 250, 130],
      [2680, 140, 130],
      [2870, 30, 130],
      [2680, -80, 130],
      [2870, -190, 150],
      [3700, 330, 150],
      [4250, 350, 150],
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [1900, 3800],
    crumble: [[2250, 2390]],
    exitX: 4580,
  },
  // 5-2 — sugar stain: bees arrive; four gaps including a wide one.
  {
    name: 'SUGAR STAIN',
    width: 5000,
    rise: 560,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2945, y: -230, choices: ['hydrogen', 'carbon'] }, // summit reward
      { x: 3600, choices: ['carbon', 'oxygen'] },
      { x: 4300, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
    ],
    enemies: [
      ...spread(500, 1350, ['ant', 'bee', 'mite', 'fly', 'ant']),
      ...spread(1750, 2650, ['fly', 'ant', 'bee', 'mite', 'ant']),
      ...spread(3000, 4150, ['ant', 'fly', 'bee', 'mite', 'ant', 'fly']),
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3500, 3640],
      [4150, 4370], // wide — clear it via the mid-gap stepping stone or a double-jump
    ],
    platforms: [
      [700, 390, 130],
      [1150, 350, 130],
      [1600, 300, 130],
      [2050, 350, 130],
      [2680, 360, 130],
      [2870, 250, 130],
      [2680, 140, 130],
      [2870, 30, 130],
      [2680, -80, 130],
      [2870, -190, 150],
      [3700, 330, 150],
      [4220, 410, 110], // stepping stone in the wide gap
      [4650, 340, 150],
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [1900, 3800],
    crumble: [[2250, 2390]],
    exitX: 4780,
  },
  // 5-3 — The Dung Heap: the Dung Beetle, a slow armored bruiser.
  {
    name: 'THE DUNG HEAP',
    width: 5600,
    rise: 620,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2760, y: -360, choices: ['hydrogen', 'carbon'] }, // summit reward (tall climb)
      { x: 3500, choices: ['carbon', 'oxygen'] },
      { x: 4150, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
    ],
    enemies: [
      ...spread(500, 1350, ['ant', 'bee', 'mite', 'fly']),
      ...spread(1750, 2650, ['mite', 'ant', 'bee', 'fly', 'ant']),
      ...spread(3000, 4100, ['ant', 'fly', 'bee', 'mite', 'ant', 'bee']),
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3500, 3640],
      [4100, 4330],
    ],
    platforms: [
      [700, 390, 130],
      [1150, 350, 130],
      [1600, 300, 130],
      [2050, 350, 130],
      [2680, 360, 140],
      [2870, 250, 140],
      [2680, 140, 140],
      [2870, 30, 140],
      [2680, -90, 140],
      [2870, -200, 150],
      [2680, -320, 160],
      [2900, 350, 140],
      [3600, 320, 150],
      [4170, 410, 110], // stepping stone in the wide gap
      [4650, 340, 150],
    ],
    hazards: [
      [950, 1120],
      [3000, 3180],
    ],
    pads: [1900, 4500],
    crumble: [[2250, 2390]],
    boss: { variant: 'beetle', x: 5100 },
  },

  // ── Sector 6 — THE WASTE BIN ──────────────────────────────────────────────
  // The grimy depths where the Hornet Queen nests — the hardest run, ending the game.
  // 6-1 — grease trap.
  {
    name: 'GREASE TRAP',
    width: 5000,
    rise: 580,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2945, y: -230, choices: ['hydrogen', 'carbon'] }, // summit reward
      { x: 3600, choices: ['carbon', 'oxygen'] },
      { x: 4300, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
    ],
    enemies: [
      ...spread(500, 1350, ['bee', 'ant', 'fly', 'mite', 'bee']),
      ...spread(1750, 2650, ['ant', 'bee', 'fly', 'mite', 'ant']),
      ...spread(3000, 4150, ['bee', 'fly', 'ant', 'bee', 'mite', 'fly']),
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3500, 3640],
      [4150, 4370],
    ],
    platforms: [
      [700, 390, 130],
      [1150, 350, 130],
      [1600, 300, 130],
      [2050, 350, 130],
      [2680, 360, 130],
      [2870, 250, 130],
      [2680, 140, 130],
      [2870, 30, 130],
      [2680, -80, 130],
      [2870, -190, 150],
      [3700, 330, 150],
      [4220, 410, 110], // stepping stone in the wide gap
      [4650, 340, 150],
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [1900, 3800],
    crumble: [[2250, 2390]],
    exitX: 4780,
  },
  // 6-2 — rotting refuse: relentless flyer + crawler pressure.
  {
    name: 'ROTTING REFUSE',
    width: 5200,
    rise: 600,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2945, y: -260, choices: ['hydrogen', 'carbon'] }, // summit reward
      { x: 3600, choices: ['carbon', 'oxygen'] },
      { x: 4350, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
    ],
    enemies: [
      ...spread(500, 1350, ['bee', 'ant', 'bee', 'fly', 'mite']),
      ...spread(1750, 2650, ['ant', 'bee', 'fly', 'bee', 'ant']),
      ...spread(3000, 4250, ['bee', 'fly', 'ant', 'bee', 'mite', 'fly', 'bee']),
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3500, 3640],
      [4200, 4420],
    ],
    platforms: [
      [700, 390, 130],
      [1150, 350, 130],
      [1600, 300, 130],
      [2050, 350, 130],
      [2680, 360, 130],
      [2870, 250, 130],
      [2680, 140, 130],
      [2870, 20, 130],
      [2680, -100, 130],
      [2870, -220, 150],
      [3700, 330, 150],
      [4270, 410, 110], // stepping stone in the wide gap
      [4700, 340, 150],
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [1900, 3900],
    crumble: [[2250, 2390]],
    exitX: 4980,
  },
  // 6-3 — The Hornet Hive: the Hornet Queen, final boss of the game.
  {
    name: 'THE HORNET HIVE',
    width: 5800,
    rise: 640,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2760, y: -380, choices: ['hydrogen', 'carbon'] }, // summit reward (highest climb in the game)
      { x: 3500, choices: ['carbon', 'oxygen'] },
      { x: 4150, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
    ],
    enemies: [
      ...spread(500, 1350, ['bee', 'ant', 'fly', 'bee']),
      ...spread(1750, 2650, ['ant', 'bee', 'fly', 'bee', 'ant']),
      ...spread(3000, 4100, ['bee', 'fly', 'ant', 'bee', 'fly', 'bee']),
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3500, 3640],
      [4100, 4330],
    ],
    platforms: [
      [700, 390, 130],
      [1150, 350, 130],
      [1600, 300, 130],
      [2050, 350, 130],
      [2680, 360, 140],
      [2870, 240, 140],
      [2680, 120, 140],
      [2870, 0, 140],
      [2680, -120, 140],
      [2870, -240, 150],
      [2680, -340, 160],
      [2900, 350, 140],
      [3600, 320, 150],
      [4170, 410, 110], // stepping stone in the wide gap
      [4700, 340, 150],
    ],
    hazards: [
      [950, 1120],
      [3000, 3180],
    ],
    pads: [1900, 4500],
    crumble: [[2250, 2390]],
    boss: { variant: 'hornet', x: 5300 },
  },
];

/**
 * Noble-gas gems, spread one per sector across the 18 stages — each tucked at the top of the
 * second stage's sky tower (so they're evenly distributed, not clustered in the early game).
 * Keyed by stage number. Guards on these exit-clear stages are flyers (or none) so the optional
 * climb never gates the stage clear; where a stage already has a summit atom, the gem sits a little
 * higher so both are worth grabbing.
 */
export const NOBLE_BY_STAGE: Record<number, { x: number; y: number; gas: NobleGasId; guard?: EnemyType }> = {
  2: { x: 2555, y: -210, gas: 'helium' }, // sector 1
  5: { x: 2925, y: -220, gas: 'neon', guard: 'spore' }, // sector 2
  8: { x: 2125, y: -180, gas: 'argon', guard: 'spore' }, // sector 3
  11: { x: 2945, y: -280, gas: 'krypton' }, // sector 4
  14: { x: 2945, y: -280, gas: 'xenon', guard: 'bee' }, // sector 5
  17: { x: 2945, y: -310, gas: 'radon', guard: 'bee' }, // sector 6
};
