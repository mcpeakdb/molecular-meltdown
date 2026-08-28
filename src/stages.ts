import { type BaseAtom, GROUND_TOP_Y, type NobleGasId } from './constants';
import type { BossVariant } from './entities/Boss';
import type { EnemyType } from './entities/Enemy';

// ── Stage configuration ───────────────────────────────────────────────────────
// The game is 18 stages (6 sectors × 3 stages). Each stage is fully described here;
// GameScene reads STAGES[stage - 1] and builds the level from it. The 3rd stage of
// every sector is a boss finale (`boss`); the other twelve clear by reaching `exitX`.
//
// Theme/art is keyed by sector (see constants `SECTORS` / GameScene `SECTOR_THEMES`),
// not by individual stage, so all three stages of a sector share a biome.

export interface StageEnemy {
  x: number;
  type: EnemyType;
  /** Perch height (sprite y) for an enemy placed on a ledge; defaults to the floor band. */
  y?: number;
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
  /** Surface top the exit portal stands on, for stages that finish *above* the floor. Omitted =
   *  GROUND_TOP_Y (the classic ground-level exit). WHERE this is set, reaching `exitX` only clears the
   *  stage if the player is at least as high as the portal's footing, so walking past underneath at
   *  ground level does not count — the climb is the finale. */
  exitY?: number;
  /** Where the player starts. `y` is the surface top they stand on; omitted = the floor at x=120.
   *  A raised spawn must sit on a ledge listed in `platforms` (validated by `npm run levels`). */
  spawn?: { x: number; y: number };
}

/** A hand-placed squad: enemies clustered tightly around `x` as one encounter — the opposite of an
 *  even `spread`. The offsets only keep sprites from stacking; the design intent lives in *where* each
 *  pack sits and *what* it contains, so stages can be paced (fights, breathers, a ramp) by hand. */
function pack(x: number, ...types: EnemyType[]): StageEnemy[] {
  const step = 58;
  const mid = (types.length - 1) / 2;
  return types.map((type, i) => ({ x: Math.round(x + (i - mid) * step), type }));
}

/** Standard ledge width. Climb steps are sized against it: a zig-zag with an `offset` of 180 leaves a
 *  50px edge gap, and a single jump clears 130px even while rising 105px, so every step is one hop. */
const LEDGE_W = 130;

/** A zig-zag climb: `steps` ledges alternating between the columns at `x` and `x + offset`, each one
 *  `up` px above the last. The workhorse of vertical sections — a tower, a chimney, a spire. */
function spire(
  x: number,
  baseTop: number,
  steps: number,
  up = 105,
  offset = 180,
  w = LEDGE_W,
): [number, number, number][] {
  return Array.from(
    { length: steps },
    (_, i) => [x + (i % 2) * offset, baseTop - i * up, w] as [number, number, number],
  );
}

/** Terraces stepping down *and forward* from a high perch. Falling is free, so these run wider and
 *  faster than a climb — a descent is momentum, not effort. Used to open a stage up in the air. */
function descent(x: number, top: number, steps: number, drop = 130, offset = 250, w = 150): [number, number, number][] {
  return Array.from({ length: steps }, (_, i) => [x + i * offset, top + i * drop, w] as [number, number, number]);
}

/** A level run of ledges at one height: verticality you travel *along* rather than up. Spans a chasm
 *  or a stretch of floor high above it, so the danger is the drop rather than the climb. */
function skybridge(x: number, top: number, count: number, gap = 145, w = 120): [number, number, number][] {
  return Array.from({ length: count }, (_, i) => [x + i * (w + gap), top, w] as [number, number, number]);
}

export const STAGES: StageDef[] = [
  // ── Sector 1 — PETRI DISH ────────────────────────────────────────────────
  // 1-1 — gentle introduction: sparse foes, simple H/O atoms, a single gap.
  {
    name: 'INOCULATION ZONE',
    width: 4700,
    // First vertical stage: the camera now follows the player up a climbable tower (see `rise`).
    rise: 480,
    atoms: [
      { x: 650, choices: ['hydrogen', 'oxygen'] },
      { x: 1500, choices: ['hydrogen', 'oxygen'] },
      // Reward for the climb — a third atom perched at the top of the tower.
      { x: 2610, y: -300, choices: ['hydrogen', 'carbon'] },
      { x: 3750, y: 266, choices: ['hydrogen', 'oxygen'] }, // on the bridging ledge
      { x: 4400, y: 246, choices: ['oxygen', 'carbon'] },
    ],
    // Pacing: a gentle teaching ramp — one germ to learn on, a pair holding the gap, ranged harassers,
    // then a clear breather over the pad + tower climb before the stage's only real crowd guards the exit.
    enemies: [
      { x: 650, type: 'bacterium' }, // intro — a lone germ to practice basic combat on
      ...pack(1120, 'bacterium', 'virus'), // a pair holding the run-up to the gap
      ...pack(1850, 'pollen', 'virus'), // ranged harassers on the far side of the gap
      // breather 2050–2900: the bounce pad and sky-tower climb are the beat here — no ground foes
      ...pack(3060, 'bacterium', 'dustbunny', 'bacterium'), // the spike: the first real crowd
      { x: 3270, type: 'virus' }, // exit sentry
      ...pack(3550, 'bacterium', 'virus'), // holds the run-up to the new chasm
      ...pack(4180, 'dustbunny', 'bacterium', 'pollen'), // the exit push along the rim
    ],
    gaps: [
      [1500, 1620],
      [3700, 3830],
    ],
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
      // The rim run: a low ledge chain past a fresh chasm — first-stage verticality stays gentle.
      [3450, 370, 150],
      [3680, 310, 150], // bridges the chasm below it
      [4060, 350, 150],
      [4330, 290, 140],
    ],
    // First taste of platforming: a single springy spore to bop on, just past the gap.
    pads: [2050],
    exitX: 4500,
  },
  // 1-2 — busier petri dish: a couple of gaps, the first real crowd.
  {
    name: 'THE AGAR FLATS',
    width: 5400,
    rise: 500,
    atoms: [
      { x: 500, choices: ['hydrogen', 'oxygen'] },
      { x: 1400, choices: ['oxygen', 'carbon'] },
      { x: 2300, choices: ['hydrogen', 'oxygen'] },
      { x: 3300, choices: ['hydrogen', 'carbon'] },
      { x: 4370, y: 126, choices: ['oxygen', 'carbon'] }, // perched mid-climb, so the ascent pays as you go
    ],
    // Pacing: intro pair → a rising fight → breather across the tower + Helium gem climb (and gap 2) →
    // the spike after the gap → a final push past the crumbling agar to the exit.
    enemies: [
      ...pack(600, 'bacterium', 'virus'), // intro skirmish
      ...pack(1080, 'virus', 'pollen'), // ranged pair before the first gap
      ...pack(1850, 'bacterium', 'dustbunny', 'virus'), // rising: a proper fight
      // breather 2100–3070: sky tower to the Helium gem, then gap 2 — the platforming beat, no ground foes
      ...pack(3250, 'virus', 'bacterium', 'pollen', 'virus'), // the spike, past gap 2
      ...pack(3760, 'dustbunny', 'bacterium'), // exit push, just past the crumbling tiles
      ...pack(3900, 'bacterium', 'dustbunny'), // last of the ground fight
      ...pack(4420, 'virus', 'pollen'), // flyers harassing the climb
    ],
    gaps: [
      [1450, 1570],
      [2950, 3070],
      [4100, 4240],
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
      // The rim climb: a four-step spire onto a shelf the exit sits on — the stage ends in the air.
      ...spire(4300, 380, 4),
      [4650, 65, 220], // exit shelf
    ],
    // Helium — up a gentle single-jump staircase mid-stage (unguarded, the easiest find).
    pads: [800],
    // First crumbling tile — stand too long and the agar gives way into a chasm.
    crumble: [[3550, 3690]],
    exitX: 4760,
    exitY: 65, // the stage finishes up on the ledge, not down on the floor
  },
  // 1-3 — Colony Core: the Super Bacterium finale.
  {
    name: 'COLONY CORE',
    width: 5900,
    rise: 480,
    atoms: [
      { x: 500, choices: ['hydrogen', 'oxygen'] },
      { x: 1300, choices: ['oxygen', 'carbon'] },
      { x: 2100, choices: ['hydrogen', 'oxygen'] },
      { x: 2900, choices: ['hydrogen', 'carbon'] },
      { x: 3700, choices: ['oxygen', 'hydrogen'] },
      { x: 4430, y: 106, choices: ['hydrogen', 'oxygen'] }, // summit of the approach spire
    ],
    // Pacing (boss stage): a deliberate escalation toward the arena. The front is a light screen of
    // lone foes; each encounter is bigger than the last; the heaviest crowd forms a wall right in
    // front of the Super Bacterium.
    enemies: [
      { x: 600, type: 'bacterium' }, // intro — a lone germ
      { x: 1080, type: 'virus' }, // a single ranged harasser before the first gap
      ...pack(1950, 'bacterium', 'virus'), // first pair, by the tower base / hazard
      ...pack(2800, 'pollen', 'dustbunny'), // build-up before gap 2
      // ramp into the boss (past gap 2 and the pad) — pressure climbs to a wall:
      ...pack(3550, 'virus', 'bacterium', 'pollen'), // the pressure mounts
      ...pack(4200, 'dustbunny', 'bacterium', 'bacterium', 'virus'), // the wall right before the arena
      ...pack(4800, 'bacterium', 'virus'), // first rank of the wall before the arena
      ...pack(5050, 'dustbunny', 'bacterium', 'pollen'), // and the second
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
      // A compact spire on the approach — climb it for the reward, then drop into the arena.
      ...spire(4370, 360, 3, 105, 150, 120),
    ],
    // Neon — high up, with an amoeba standing guard at the base of the climb.
    // First hazard pool appears before the boss run-up; bop the pad to skip it cleanly.
    hazards: [[2300, 2440]],
    pads: [3650],
    boss: { variant: 'bacterium', x: 5400 },
  },

  // ── Sector 2 — BLOOD AGAR ────────────────────────────────────────────────
  // 2-1 — newcomers arrive: amoeba (tank) + spore (fast). Heavier pacing.
  {
    name: 'HEMOLYTIC FIELDS',
    width: 5200,
    rise: 480,
    spawn: { x: 220, y: 170 }, // dropped in on a shelf above the field
    atoms: [
      { x: 500, choices: ['oxygen', 'carbon'] },
      { x: 1300, choices: ['hydrogen', 'nitrogen'] },
      { x: 2675, y: -150, choices: ['oxygen', 'carbon'] }, // summit reward atop the sky tower
      { x: 3200, choices: ['hydrogen', 'oxygen'] },
      { x: 4505, y: 286, choices: ['oxygen', 'carbon', 'sodium'] }, // mid-bridge, over the chasm
    ],
    // Pacing: intro skirmish → rising fight → breather over the tower + gap 2 → spike → exit push.
    enemies: [
      ...pack(600, 'spore', 'virus'), // intro
      ...pack(1080, 'virus', 'amoeba'), // a tank joins, before the first gap
      ...pack(1800, 'spore', 'virus', 'amoeba'), // rising fight
      // breather 2300–3080: tower climb + gap 2
      ...pack(3350, 'spore', 'bacterium', 'virus'), // the spike, past gap 2
      ...pack(3720, 'spore', 'amoeba'), // exit push, past the crumbling tiles
      ...pack(3900, 'amoeba', 'spore'), // guards the lip of the chasm
      ...pack(4800, 'bacterium', 'virus', 'amoeba'), // the far side, between bridge and exit
    ],
    gaps: [
      [1450, 1580],
      [2950, 3080],
      [4200, 4520], // too wide to leap — cross it on the skybridge above
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
      // Opens in the air: terraces down into the field. Ends on a skybridge over a wide chasm.
      ...descent(150, 170, 3), // the opening drop-in
      ...skybridge(4180, 330, 3), // over the chasm below
    ],
    hazards: [[2050, 2200]],
    pads: [800],
    crumble: [[3550, 3700]],
    exitX: 4980,
  },
  // 2-2 — plasma currents: dense spore swarms threading amoeba tanks.
  {
    name: 'PLASMA CURRENTS',
    width: 5700,
    rise: 540,
    atoms: [
      { x: 500, choices: ['oxygen', 'carbon'] },
      { x: 1200, choices: ['hydrogen', 'nitrogen'] },
      { x: 2000, choices: ['carbon', 'nitrogen'] },
      { x: 2900, choices: ['hydrogen', 'oxygen'] },
      { x: 3800, choices: ['oxygen', 'carbon', 'nitrogen'] },
      { x: 4715, y: 126, choices: ['oxygen', 'carbon', 'sodium'] }, // halfway up the wall
    ],
    // Pacing: intro → rising fight → breather over the tower + Argon gem + gap 2 → spike → exit push.
    enemies: [
      ...pack(600, 'spore', 'amoeba'), // intro
      ...pack(1100, 'spore', 'virus'), // ranged pair before the first gap
      ...pack(1750, 'spore', 'amoeba', 'virus'), // rising fight
      // breather 2350–3290: hazard, tower, Argon gem, gap 2
      ...pack(3450, 'spore', 'virus', 'amoeba'), // the spike, past gap 2
      ...pack(3800, 'spore', 'spore', 'amoeba'), // pressure holds
      ...pack(4300, 'spore', 'spore', 'virus'), // exit push, past the crumbling tiles
      ...pack(4200, 'amoeba', 'spore'), // the last ground fight
      ...pack(4700, 'virus', 'spore'), // flyers contesting the wall
    ],
    gaps: [
      [1500, 1640],
      [3150, 3290],
      [4450, 4590],
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
      // The vessel wall: a five-step spire climbing past the old exit to a shelf high above it.
      ...spire(4650, 380, 5),
      [4900, -40, 260], // exit shelf
    ],
    // Argon — up high over the plasma; a hovering spore makes the climb dangerous.
    hazards: [
      [900, 1040],
      [2350, 2520],
    ],
    pads: [1900],
    crumble: [[4050, 4200]],
    exitX: 5030,
    exitY: -40, // the stage finishes up on the ledge, not down on the floor
  },
  // 2-3 — The Beating Heart: the Amoeba Titan finale.
  {
    name: 'THE BEATING HEART',
    width: 6100,
    rise: 560,
    spawn: { x: 240, y: 65 }, // the stage opens high in the chamber
    atoms: [
      { x: 500, choices: ['oxygen', 'carbon'] },
      { x: 1300, choices: ['hydrogen', 'nitrogen'] },
      { x: 2100, choices: ['carbon', 'nitrogen'] },
      { x: 2900, choices: ['hydrogen', 'oxygen'] },
      { x: 3700, choices: ['oxygen', 'carbon', 'nitrogen'] },
      { x: 4620, y: 1, choices: ['oxygen', 'carbon', 'sodium'] }, // summit of the approach spire
    ],
    // Pacing (boss stage): light front → escalate → a wall of amoeba tanks right before the Amoeba Titan.
    enemies: [
      { x: 600, type: 'spore' }, // intro — a lone spore
      { x: 1100, type: 'virus' }, // a single harasser before the first gap
      ...pack(1800, 'spore', 'amoeba'), // first pair, before the hazard
      // breather 2400–3340: hazard, tower, gap 2
      ...pack(3450, 'amoeba', 'spore', 'virus'), // the pressure mounts, past gap 2
      ...pack(3950, 'spore', 'amoeba'), // build
      ...pack(4400, 'amoeba', 'amoeba', 'spore', 'virus'), // the wall right before the arena
      ...pack(4950, 'amoeba', 'spore', 'virus'), // the wall before the arena
      ...pack(5250, 'amoeba', 'virus'),
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
      // Opens on a descent into the chamber; a spire on the approach before the arena floor.
      ...descent(170, 65, 4, 100), // the opening drop-in
      ...spire(4380, 360, 4, 105, 175),
    ],
    // Krypton — a high perch between the chasms, with an amoeba guarding the approach.
    hazards: [[2400, 2560]],
    pads: [1000, 4100],
    crumble: [[3650, 3800]],
    boss: { variant: 'amoeba', x: 5600 },
  },

  // ── Sector 3 — MACCONKEY ─────────────────────────────────────────────────
  // 3-1 — mites crawl in: the toughest mixed roster begins.
  {
    name: 'LACTOSE MARSHES',
    width: 5600,
    rise: 600,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1200, choices: ['hydrogen', 'oxygen'] },
      { x: 2000, choices: ['oxygen', 'nitrogen'] },
      { x: 2900, choices: ['hydrogen', 'carbon'] },
      { x: 3700, choices: ['carbon', 'oxygen'] },
      { x: 4765, y: 136, choices: ['nitrogen', 'carbon', 'sodium'] },
      { x: 4935, y: 36, choices: ['nitrogen', 'carbon', 'sodium'] }, // higher up the ascent
    ],
    // Pacing: intro → early tower breather → mid fights around the pad → spike between the wide gaps →
    // exit push past the widest chasm.
    enemies: [
      ...pack(600, 'mite', 'spore'), // intro
      ...pack(1150, 'mite', 'amoeba'), // a tank, before the first gap
      // breather 1640–1820: the Xenon-gem tower climb
      ...pack(2000, 'mite', 'virus'), // mid fight past the tower
      ...pack(2550, 'mite', 'spore'), // by the pad, before gap 2
      ...pack(3050, 'mite', 'amoeba', 'mite'), // the spike, between the chasms
      ...pack(3800, 'mite', 'spore', 'amoeba'), // exit push, past the wide gap
      ...pack(4100, 'mite', 'amoeba'), // before the chasm
      ...pack(4700, 'spore', 'virus'), // over the bile, contesting the climb
      ...pack(5000, 'mite', 'spore'),
    ],
    gaps: [
      [1450, 1590],
      [2700, 2840],
      [3450, 3680], // wide — clear it via the mid-gap stepping stone or a double-jump
      [4250, 4390],
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
      // The crystal ascent: a six-step spire out of the marsh, its base guarded by a bile pool.
      ...spire(4700, 380, 6, 100, 170),
      [5040, -120, 240], // exit shelf
    ],
    // Xenon — tucked high above the marshes, guarded by a mite.
    hazards: [
      [1000, 1160],
      [2150, 2310],
      [4450, 4620], // pooled bile at the foot of the ascent
    ],
    pads: [2600],
    exitX: 5160,
    exitY: -120, // the stage finishes up on the ledge, not down on the floor
  },
  // 3-2 — bile salt barrens: three gaps, relentless mite + amoeba pressure.
  {
    name: 'BILE SALT BARRENS',
    width: 6000,
    rise: 620,
    spawn: { x: 250, y: -40 }, // the barrens stage never touches the floor at its ends
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 2125, y: -130, choices: ['oxygen', 'nitrogen'] }, // summit reward atop the sky tower
      { x: 2700, choices: ['hydrogen', 'carbon'] },
      { x: 3350, choices: ['carbon', 'oxygen'] }, // on solid ground just before the [3450,3590] gap (grab, then leap)
      { x: 4200, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
      { x: 5115, y: 116, choices: ['nitrogen', 'carbon', 'sodium'] },
      { x: 5290, y: 11, choices: ['nitrogen', 'carbon', 'sodium'] }, // higher still
    ],
    // Pacing: intro → rising fight → breather over the tower + crumble + gap 2 → two spikes → exit push.
    enemies: [
      ...pack(600, 'mite', 'amoeba'), // intro
      ...pack(1150, 'mite', 'spore'), // before the first gap
      ...pack(1750, 'mite', 'amoeba', 'mite'), // rising fight, by the pad
      // breather 2300–2900: tower, crumbling tiles, gap 2
      ...pack(3000, 'mite', 'amoeba', 'spore'), // spike, before the hazard + gap 3
      ...pack(3650, 'mite', 'spore', 'amoeba'), // second spike, past gap 3
      ...pack(4400, 'mite', 'mite', 'spore', 'amoeba'), // exit push, past the widest chasm
      ...pack(4400, 'mite', 'amoeba', 'spore'), // before the chasm
      ...pack(5000, 'mite', 'spore'), // at the foot of the ascent
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3450, 3590],
      [4000, 4220], // wide — clear it via the mid-gap stepping stone or a double-jump
      [4700, 4980], // wide — take the stepping stone
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
      // Airborne at both ends: a long descent in, a six-step ascent out, floor only in between.
      ...descent(180, -40, 5, 105, 245), // the opening drop-in
      [4800, 410, 120], // stepping stone in the wide chasm
      ...spire(5050, 370, 6, 105, 175),
      [5400, -155, 240], // exit shelf
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [1900, 3800],
    crumble: [[2650, 2790]],
    exitX: 5520,
    exitY: -155, // the stage finishes up on the ledge, not down on the floor
  },
  // 3-3 — Crystal Violet Throne: the Phage Lord, final boss of the experiment.
  {
    name: 'CRYSTAL VIOLET THRONE',
    width: 6400,
    rise: 640,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1900, choices: ['oxygen', 'nitrogen'] },
      { x: 2650, choices: ['hydrogen', 'carbon'] },
      { x: 3400, choices: ['carbon', 'oxygen'] },
      { x: 4150, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
      { x: 4685, y: -109, choices: ['nitrogen', 'carbon', 'sodium'] }, // summit of the approach spire
    ],
    // Pacing (boss stage): light front → escalate → a heavy wall right before the Phage Lord.
    enemies: [
      { x: 600, type: 'mite' }, // intro — a lone mite
      { x: 1100, type: 'mite' }, // a second scout before the first gap
      ...pack(1750, 'mite', 'spore'), // by the pad / Radon tower base
      // breather 1840–2540: the Radon-gem tower climb, gap 2
      ...pack(2900, 'mite', 'amoeba'), // pressure resumes, before the hazard + gap 3
      ...pack(3700, 'spore', 'mite', 'amoeba'), // build, past gap 3
      ...pack(4600, 'amoeba', 'amoeba', 'spore', 'amoeba', 'mite', 'spore'), // a wall of three tanks before the arena
      ...pack(5250, 'mite', 'amoeba', 'spore'), // the wall before the throne
      ...pack(5550, 'amoeba', 'mite'),
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
      // A five-step ascent on the approach, then the drop into the throne room.
      ...spire(4620, 355, 5, 105, 175),
    ],
    // Radon — the final, hardest find: highest perch in the game, guarded by an amoeba.
    hazards: [
      [950, 1120],
      [3000, 3180],
    ],
    pads: [1900, 4500],
    crumble: [[2700, 2850]],
    boss: { variant: 'phage', x: 5900 },
  },

  // ── Sector 4 — LAB FLOOR ──────────────────────────────────────────────────
  // Escaped the dishes onto the lab bench/floor: ants swarm and mites crawl, ending at the Roach King.
  // Signature terrain: WIDE LOW BENCHES and few gaps — broad, forgiving footing to learn the biome.
  // 4-1 — emerging onto the bench: ants arrive alongside the familiar mites.
  {
    name: 'BENCHTOP SPILL',
    width: 5600,
    rise: 560,
    spawn: { x: 230, y: 170 }, // starts up on the bench, not the floor
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2675, y: -120, choices: ['hydrogen', 'carbon'] }, // summit reward atop the sky tower
      { x: 3700, choices: ['carbon', 'oxygen'] },
      { x: 5050, y: 76, choices: ['phosphorus', 'hydrogen'] }, // up on the shelf — only the pad reaches it
    ],
    // Pacing: intro → ant swarm builds → breather over the tower → spike → exit push.
    enemies: [
      ...pack(600, 'ant', 'mite'), // intro
      ...pack(1100, 'ant', 'ant'), // an ant rush before the only gap
      ...pack(1800, 'ant', 'mite', 'ant'), // rising, before the hazard
      // breather 2350–3060: the tower climb
      ...pack(3300, 'ant', 'mite', 'ant'), // the spike
      ...pack(3700, 'ant', 'mite'), // hold
      ...pack(4250, 'ant', 'ant', 'mite'), // exit push, past the crumbling tiles
      ...pack(4300, 'ant', 'mite'), // before the chasm
      ...pack(5100, 'ant', 'mite', 'ant'), // the exit push
    ],
    gaps: [
      [1450, 1590],
      [4500, 4640],
    ],
    platforms: [
      // Wide low lab-bench surfaces — broad footing, few gaps: the gentle bench biome.
      [560, 410, 180],
      [1080, 370, 240],
      [1600, 400, 240],
      [1900, 380, 200],
      // sky tower
      [2600, 360, 140],
      [2790, 250, 130],
      [2600, 140, 130],
      [2790, 30, 130],
      [2600, -80, 150],
      [3250, 400, 240],
      [3750, 400, 240],
      [4150, 400, 220],
      // Off the bench at the start; later a spore pad flings you up to an optional high shelf.
      ...descent(160, 170, 3), // down off the benchtop
      [4980, 120, 150],
      [5230, 120, 150],
    ],
    hazards: [[2150, 2300]],
    pads: [900, 4750],
    crumble: [[4050, 4200]],
    exitX: 5380,
  },
  // 4-2 — crumb trails: four gaps, dense ant + mite pressure, two reagent spills.
  {
    name: 'CRUMB TRAILS',
    width: 6000,
    rise: 600,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2945, y: -230, choices: ['hydrogen', 'carbon'] }, // summit reward atop the sky tower
      { x: 3500, choices: ['carbon', 'oxygen'] },
      { x: 4200, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
      { x: 5015, y: 121, choices: ['phosphorus', 'hydrogen'] }, // halfway up the leg
    ],
    // Pacing: intro → swarm builds → breather over the tower → two spikes → exit push.
    enemies: [
      ...pack(600, 'ant', 'mite'), // intro
      ...pack(1150, 'ant', 'ant', 'mite'), // ant rush before the first gap
      ...pack(1850, 'ant', 'mite'), // rising, by the pad
      // breather 2350–3060: crumbling tiles, the tower climb
      ...pack(3050, 'ant', 'mite', 'ant'), // spike, before the hazard + gap 2
      ...pack(3700, 'ant', 'mite', 'ant'), // second spike, past gap 2
      ...pack(4300, 'ant', 'ant', 'mite', 'mite'), // exit push
      ...pack(4450, 'ant', 'mite'),
      ...pack(5000, 'mite', 'ant', 'mite'), // at the foot of the climb
    ],
    gaps: [
      [1450, 1590],
      [3500, 3640],
      [4750, 4890],
    ],
    platforms: [
      // Wide low lab-bench surfaces — broad footing, few gaps.
      [560, 410, 200],
      [1080, 370, 240],
      [1650, 400, 200],
      [2100, 380, 200],
      // sky tower
      [2680, 360, 140],
      [2870, 250, 130],
      [2680, 140, 130],
      [2870, 30, 130],
      [2680, -80, 130],
      [2870, -190, 150],
      [3250, 400, 240],
      [3750, 400, 240],
      [4300, 400, 220],
      // Up the bench leg: a six-step spire to a shelf the exit sits on.
      ...spire(4950, 375, 6, 105, 175),
      [5300, -150, 240], // exit shelf
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [1900],
    crumble: [[2250, 2390]],
    exitX: 5420,
    exitY: -150, // the stage finishes up on the ledge, not down on the floor
  },
  // 4-3 — The Roach Nest: the Roach King, final boss of the game.
  {
    name: 'THE ROACH NEST',
    width: 6500,
    rise: 660,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2760, y: -360, choices: ['hydrogen', 'carbon'] }, // summit reward (the highest climb in the game)
      { x: 3500, choices: ['carbon', 'oxygen'] },
      { x: 4150, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
      { x: 4785, y: -109, choices: ['phosphorus', 'hydrogen'] }, // summit of the approach spire
    ],
    // Pacing (boss stage): light front → escalate → a swarming wall right before the Roach King.
    enemies: [
      { x: 600, type: 'ant' }, // intro — a lone ant
      { x: 1100, type: 'ant' }, // a scout before the first gap
      ...pack(1800, 'ant', 'mite'), // by the pad
      // breather 2350–3060: the tower climb
      ...pack(3050, 'ant', 'mite'), // pressure resumes, before the hazard + gap 2
      ...pack(3750, 'ant', 'ant', 'mite'), // build, past gap 2
      ...pack(4700, 'ant', 'mite', 'ant', 'ant', 'mite', 'ant'), // the swarming wall before the arena
      ...pack(5350, 'ant', 'mite', 'ant'), // the wall before the nest
      ...pack(5650, 'mite', 'ant'),
    ],
    gaps: [
      [1450, 1590],
      [3500, 3640],
    ],
    platforms: [
      // Wide low lab-bench surfaces — broad footing, few gaps.
      [560, 410, 200],
      [1150, 370, 240],
      [1650, 400, 200],
      [2100, 380, 200],
      // sky tower — the tallest climb in the game
      [2680, 360, 140],
      [2870, 250, 140],
      [2680, 140, 140],
      [2870, 30, 140],
      [2680, -90, 140],
      [2870, -200, 150],
      [2680, -320, 160],
      [3300, 400, 240],
      [3800, 400, 240],
      [4400, 400, 240],
      // A five-step ascent on the approach before the nest floor opens out.
      ...spire(4720, 355, 5, 105, 175),
    ],
    hazards: [
      [950, 1120],
      [3000, 3180],
    ],
    pads: [1900],
    crumble: [[2250, 2390]],
    boss: { variant: 'roach', x: 6000 },
  },

  // ── Sector 5 — UNDER THE BENCH ────────────────────────────────────────────
  // Deeper into the lab: flies and bees join the ant/mite crawlers; finale is the Dung Beetle.
  // Signature terrain: TIGHT PILLARS OVER PITS — narrow footholds and more chasms, precision jumping.
  // 5-1 — spill tray: first flyers harass the climbs.
  {
    name: 'SPILL TRAY',
    width: 5900,
    rise: 620,
    spawn: { x: 240, y: 65 }, // starts on the lip of the tray
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2945, y: -230, choices: ['hydrogen', 'carbon'] }, // summit reward
      { x: 3600, choices: ['carbon', 'oxygen'] },
      { x: 4300, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
      { x: 5065, y: 116, choices: ['sulfur', 'oxygen'] },
      { x: 5240, y: 11, choices: ['sulfur', 'oxygen'] }, // higher up the stack
    ],
    // Pacing: intro → flyers harass the pillars → breather over the tower → spike → exit push.
    enemies: [
      ...pack(600, 'ant', 'fly'), // intro
      ...pack(1150, 'fly', 'mite'), // flyers over the first wide pit
      ...pack(1850, 'ant', 'fly', 'ant'), // rising, by the pad
      // breather 2400–3060: the tower climb
      ...pack(3050, 'ant', 'mite', 'fly'), // spike, before the hazard + wide gap 3
      ...pack(3900, 'ant', 'ant', 'mite', 'fly'), // hold, past the wide gap
      ...pack(4350, 'ant', 'mite'), // exit push
      ...pack(4400, 'ant', 'fly', 'mite'), // before the chasm
      ...pack(5050, 'fly', 'mite'), // harassing the stack
    ],
    gaps: [
      [1350, 1650],
      [2400, 2540],
      [3450, 3750],
      [4700, 4980], // wide — take the stepping stone
    ],
    platforms: [
      // Narrow footholds and stepping pillars — precision hops over the pits.
      [650, 400, 100],
      [1000, 340, 100],
      [1430, 405, 90], // stepping pillar in the front pit
      [1570, 405, 90],
      [1700, 360, 90],
      [2050, 310, 90],
      [2250, 360, 90],
      // sky tower
      [2680, 360, 130],
      [2870, 250, 130],
      [2680, 140, 130],
      [2870, 30, 130],
      [2680, -80, 130],
      [2870, -190, 150],
      [3530, 405, 90], // stepping pillars in the back pit
      [3670, 405, 90],
      [3950, 360, 90],
      [4200, 340, 100],
      [4400, 380, 100],
      // Off the tray lip at the start, up the drip stack at the end — both ends are in the air.
      ...descent(170, 65, 4, 100), // down off the tray lip
      [4800, 410, 120], // stepping stone in the wide chasm
      ...spire(5000, 370, 6, 105, 175),
      [5350, -155, 240], // exit shelf
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [1900],
    crumble: [[2250, 2390]],
    exitX: 5470,
    exitY: -155, // the stage finishes up on the ledge, not down on the floor
  },
  // 5-2 — sugar stain: bees arrive; four gaps including a wide one.
  {
    name: 'SUGAR STAIN',
    width: 6100,
    rise: 620,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2945, y: -230, choices: ['hydrogen', 'carbon'] }, // summit reward
      { x: 3600, choices: ['carbon', 'oxygen'] },
      { x: 4300, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
      { x: 5115, y: 121, choices: ['sulfur', 'oxygen'] }, // halfway up the stack
    ],
    // Pacing: intro → bees join → breather over the tower → spike → exit push past the wide pit.
    enemies: [
      ...pack(600, 'ant', 'fly'), // intro
      ...pack(1150, 'ant', 'mite'), // before the first wide pit
      ...pack(1850, 'bee', 'fly', 'ant'), // rising, by the pad
      // breather 2400–3060: the tower climb
      ...pack(3050, 'ant', 'ant', 'mite'), // spike, before the hazard + gap 3
      ...pack(3850, 'ant', 'fly', 'mite'), // hold, between gaps 3 and 4
      ...pack(4500, 'bee', 'bee', 'fly'), // exit push, past the wide pit
      ...pack(4550, 'bee', 'ant'),
      ...pack(5100, 'fly', 'mite', 'bee'), // contesting the stack
    ],
    gaps: [
      [1350, 1650],
      [2400, 2540],
      [3450, 3750],
      [4200, 4400], // wide pit — cross via the pillar in the middle
      [4850, 4990],
    ],
    platforms: [
      // Narrow footholds and stepping pillars — precision hops over the pits.
      [650, 400, 100],
      [1000, 340, 100],
      [1430, 405, 90],
      [1570, 405, 90],
      [1700, 360, 90],
      [2050, 310, 90],
      [2250, 360, 90],
      // sky tower
      [2680, 360, 130],
      [2870, 250, 130],
      [2680, 140, 130],
      [2870, 30, 130],
      [2680, -80, 130],
      [2870, -190, 150],
      [3530, 405, 90],
      [3670, 405, 90],
      [3950, 360, 90],
      [4270, 405, 90], // pillar in the wide pit
      [4550, 380, 100],
      // The drip stack: a six-step spire out of the sugar to a shelf the exit sits on.
      ...spire(5050, 375, 6, 105, 175),
      [5400, -150, 240], // exit shelf
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [1900],
    crumble: [[2250, 2390]],
    exitX: 5520,
    exitY: -150, // the stage finishes up on the ledge, not down on the floor
  },
  // 5-3 — The Dung Heap: the Dung Beetle, a slow armored bruiser.
  {
    name: 'THE DUNG HEAP',
    width: 6500,
    rise: 660,
    spawn: { x: 250, y: -40 }, // dropped in from above the heap
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2760, y: -360, choices: ['hydrogen', 'carbon'] }, // summit reward (tall climb)
      { x: 3500, choices: ['carbon', 'oxygen'] },
      { x: 4450, choices: ['hydrogen', 'oxygen', 'nitrogen'] }, // reward on the far side of the wide [4100,4330] pit
      { x: 4785, y: -109, choices: ['sulfur', 'oxygen'] }, // summit of the approach spire
    ],
    // Pacing (boss stage): light front → escalate → a mixed wall right before the Dung Beetle.
    enemies: [
      { x: 600, type: 'ant' }, // intro — a lone ant
      { x: 1100, type: 'fly' }, // a flyer before the first pit
      ...pack(1800, 'ant', 'mite'), // by the pad
      // breather 2400–3060: the tower climb
      ...pack(3050, 'bee', 'fly', 'ant'), // pressure resumes, before the hazard + gap 3
      ...pack(3800, 'bee', 'mite'), // build, past gap 3
      ...pack(4600, 'bee', 'ant', 'fly', 'bee', 'ant', 'mite'), // the wall right before the arena
      ...pack(5350, 'bee', 'ant', 'mite'), // the wall before the arena
      ...pack(5650, 'fly', 'bee'),
    ],
    gaps: [
      [1350, 1650],
      [2400, 2540],
      [3450, 3750],
      [4100, 4330],
    ],
    platforms: [
      // Narrow footholds and stepping pillars — precision hops over the pits.
      [650, 400, 100],
      [1000, 340, 100],
      [1430, 405, 90],
      [1570, 405, 90],
      [1700, 360, 90],
      [2050, 310, 90],
      [2250, 360, 90],
      // sky tower
      [2680, 360, 140],
      [2870, 250, 140],
      [2680, 140, 140],
      [2870, 30, 140],
      [2680, -90, 140],
      [2870, -200, 150],
      [2680, -320, 160],
      [3530, 405, 90],
      [3670, 405, 90],
      [3950, 360, 90],
      [4210, 405, 90], // pillar in the wide pit
      [4550, 380, 100],
      // A long descent onto the heap, then a five-step ascent on the approach to the arena.
      ...descent(180, -40, 5, 105, 245), // the opening drop-in
      ...spire(4720, 355, 5, 105, 175),
    ],
    hazards: [
      [950, 1120],
      [3000, 3180],
    ],
    pads: [1900],
    crumble: [[2250, 2390]],
    boss: { variant: 'beetle', x: 6000 },
  },

  // ── Sector 6 — THE WASTE BIN ──────────────────────────────────────────────
  // The grimy depths where the Hornet Queen nests — the hardest run, ending the game.
  // Signature terrain: VERTICAL BOUNCE SHAFTS — extra pads and staggered footholds; climb by launching.
  // 6-1 — grease trap.
  {
    name: 'GREASE TRAP',
    width: 6300,
    rise: 700,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2945, y: -230, choices: ['hydrogen', 'carbon'] }, // summit reward
      { x: 3600, choices: ['carbon', 'oxygen'] },
      { x: 4300, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
      { x: 5115, y: 121, choices: ['chlorine', 'carbon', 'sodium'] }, // low on the climb
      { x: 5115, y: -89, choices: ['chlorine', 'carbon', 'sodium'] }, // and high on it
    ],
    // Pacing: intro → bounce-shaft fights → breather over the tower → spike → exit push past the wide pit.
    enemies: [
      ...pack(600, 'bee', 'ant'), // intro, by the first bounce pad
      ...pack(1150, 'fly', 'mite'), // before the first gap
      ...pack(1850, 'bee', 'fly', 'ant'), // rising, by the pad
      // breather 2400–3060: the tower climb
      ...pack(3050, 'bee', 'mite', 'fly'), // spike, before the hazard + gap 3
      ...pack(3750, 'ant', 'bee'), // by the back pad, past gap 3
      ...pack(4550, 'bee', 'ant', 'fly', 'mite'), // exit push, past the wide pit
      ...pack(4550, 'bee', 'ant'),
      ...pack(5100, 'fly', 'bee', 'mite'), // contesting the climb out
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3500, 3640],
      [4150, 4370],
      [4850, 4990],
    ],
    platforms: [
      // Staggered footholds strung between the bounce shafts — climb by pad, not by walking.
      [1000, 350, 120],
      [1250, 290, 120],
      [1600, 380, 120],
      [2050, 300, 120],
      // sky tower
      [2680, 360, 130],
      [2870, 250, 130],
      [2680, 140, 130],
      [2870, 30, 130],
      [2680, -80, 130],
      [2870, -190, 150],
      [3250, 300, 120],
      [3550, 400, 120],
      [4270, 410, 110], // stepping stone in the wide gap
      [4600, 340, 130],
      // The climb out of the bin: an eight-step spire, the tallest ascent in the game.
      ...spire(5050, 375, 8, 105, 175),
      [5400, -360, 240], // exit shelf, near the rim
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [700, 1900, 3800],
    crumble: [[2250, 2390]],
    exitX: 5520,
    exitY: -360, // the stage finishes up on the ledge, not down on the floor
  },
  // 6-2 — rotting refuse: relentless flyer + crawler pressure.
  {
    name: 'ROTTING REFUSE',
    width: 6400,
    rise: 700,
    spawn: { x: 250, y: -150 }, // starts near the rim, descending into the refuse
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2945, y: -260, choices: ['hydrogen', 'carbon'] }, // summit reward
      { x: 3600, choices: ['carbon', 'oxygen'] },
      { x: 4350, choices: ['hydrogen', 'oxygen', 'nitrogen'] },
      { x: 5215, y: 121, choices: ['chlorine', 'carbon', 'sodium'] }, // low on the climb
      { x: 5215, y: -89, choices: ['chlorine', 'carbon', 'sodium'] }, // and high on it
    ],
    // Pacing: intro → swarm builds → breather over the tower → spike → exit push past the wide pit.
    enemies: [
      ...pack(600, 'bee', 'ant'), // intro
      ...pack(1150, 'bee', 'fly', 'mite'), // before the first gap
      ...pack(1850, 'ant', 'bee', 'fly'), // rising, by the pad
      // breather 2400–3060: the tower climb
      ...pack(3050, 'bee', 'fly', 'ant'), // spike, before the hazard + gap 3
      ...pack(3850, 'bee', 'mite'), // by the back pad, past gap 3
      ...pack(4600, 'bee', 'bee', 'ant', 'fly'), // exit push, past the wide pit
      ...pack(4600, 'bee', 'ant', 'fly'),
      ...pack(5200, 'fly', 'bee'), // contesting the climb out
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3500, 3640],
      [4200, 4420],
      [4950, 5090],
    ],
    platforms: [
      // Staggered footholds strung between the bounce shafts.
      [1000, 350, 120],
      [1250, 290, 120],
      [1600, 380, 120],
      [2050, 300, 120],
      // sky tower
      [2680, 360, 130],
      [2870, 250, 130],
      [2680, 140, 130],
      [2870, 20, 130],
      [2680, -100, 130],
      [2870, -220, 150],
      [3250, 300, 120],
      [3550, 400, 120],
      [4310, 410, 110], // stepping stone in the wide gap
      [4650, 340, 130],
      // In from the rim, down through the refuse, then all the way back out — both ends near the top.
      ...descent(180, -150, 6, 105, 245), // the long way down from the rim
      ...spire(5150, 375, 8, 105, 175),
      [5500, -360, 240], // exit shelf, near the rim
    ],
    hazards: [
      [900, 1080],
      [3150, 3320],
    ],
    pads: [700, 1900, 3900],
    crumble: [[2250, 2390]],
    exitX: 5620,
    exitY: -360, // the stage finishes up on the ledge, not down on the floor
  },
  // 6-3 — The Hornet Hive: the Hornet Queen, final boss of the game.
  {
    name: 'THE HORNET HIVE',
    width: 6700,
    rise: 700,
    atoms: [
      { x: 450, choices: ['nitrogen', 'carbon'] },
      { x: 1150, choices: ['hydrogen', 'oxygen'] },
      { x: 1950, choices: ['oxygen', 'nitrogen'] },
      { x: 2760, y: -380, choices: ['hydrogen', 'carbon'] }, // summit reward (highest climb in the game)
      { x: 3500, choices: ['carbon', 'oxygen'] },
      { x: 4450, choices: ['hydrogen', 'oxygen', 'nitrogen'] }, // reward on the far side of the wide [4100,4330] pit
      { x: 5160, y: -214, choices: ['chlorine', 'carbon', 'sodium'] }, // summit of the approach spire
    ],
    // Pacing (final boss stage): light front → escalate → the game's heaviest wall right before the Hornet Queen.
    enemies: [
      { x: 600, type: 'bee' }, // intro — a lone hornet, by the first pad
      { x: 1100, type: 'ant' }, // a scout before the first gap
      ...pack(1800, 'bee', 'fly'), // by the pad
      // breather 2400–3060: the tower climb
      ...pack(3050, 'bee', 'ant'), // pressure resumes, before the hazard + gap 3
      ...pack(3750, 'bee', 'fly'), // build, past gap 3
      ...pack(4750, 'bee', 'ant', 'fly', 'bee', 'ant', 'bee'), // the final wall before the arena
      ...pack(5550, 'bee', 'ant', 'mite'), // the wall before the hive
      ...pack(5850, 'fly', 'bee', 'ant'),
    ],
    gaps: [
      [1450, 1590],
      [2400, 2540],
      [3500, 3640],
      [4100, 4330],
    ],
    platforms: [
      // Staggered footholds strung between the bounce shafts.
      [1000, 350, 120],
      [1250, 290, 120],
      [1600, 380, 120],
      [2050, 300, 120],
      // sky tower
      [2680, 360, 140],
      [2870, 240, 140],
      [2680, 120, 140],
      [2870, 0, 140],
      [2680, -120, 140],
      [2870, -240, 150],
      [2680, -340, 160],
      [3250, 300, 120],
      [3550, 400, 120],
      [4210, 410, 110], // stepping stone in the wide gap
      [4640, 340, 130],
      // A six-step ascent on the approach — the hive is entered from height.
      ...spire(4920, 355, 6, 105, 175),
    ],
    hazards: [
      [950, 1120],
      [3000, 3180],
    ],
    pads: [700, 1900, 4500],
    crumble: [[2250, 2390]],
    boss: { variant: 'hornet', x: 6200 },
  },
];

// ── Guarded ledge clusters ────────────────────────────────────────────────────
// Every stage is enriched with extra floating ledges that hold a bonus atom — more platforming, more
// pickups, and more foes posted on the platforms. The ledges sit within a single jump of the floor
// (see addLedgeCluster). Clusters are placed only on clear flat ground (never over a gap, hazard, or
// the central sky-tower climb), so they can be appended to all 18 hand-authored stages without
// disturbing the existing layouts.

/** Ground-type foes posted on the new ledges, per sector (flyers would hover off a perch). */
const CLUSTER_GUARD: Record<number, EnemyType[]> = {
  1: ['bacterium', 'dustbunny'],
  2: ['amoeba', 'bacterium'],
  3: ['mite', 'amoeba'],
  4: ['ant', 'mite'],
  5: ['ant', 'mite'],
  6: ['ant', 'mite'],
};

/** Atom choices on the new ledges, matched to each sector's existing palette. The lab-floor sectors
 *  (4–6) each headline one of the heavy atoms so its molecules become buildable where it fits the
 *  theme: phosphorus on the bench, sulfur beneath it, chlorine in the waste bin.
 *
 *  Sodium is the exception — it is offered as a third pick across the culture-media sectors (2–3),
 *  since every agar plate is salted, and again alongside chlorine in the waste bin (6) so NaCl can
 *  finally be assembled late in a run. It is offered *in addition to* each sector's existing pair
 *  rather than replacing a pick, so adding an eighth atom widens the menu instead of thinning the
 *  odds of the seven that were already there. */
const CLUSTER_ATOMS: Record<number, BaseAtom[]> = {
  1: ['hydrogen', 'oxygen'],
  2: ['oxygen', 'carbon', 'sodium'],
  3: ['nitrogen', 'carbon', 'sodium'],
  4: ['phosphorus', 'hydrogen'],
  5: ['sulfur', 'oxygen'],
  6: ['chlorine', 'carbon', 'sodium'],
};

/** Append one guarded ledge cluster (floating ledge, perched atom, posted guard) at world-x `x`. */
function addLedgeCluster(s: StageDef, x: number, sector: number, variant: number): void {
  const guards = CLUSTER_GUARD[sector];
  const guard = guards[variant % guards.length];
  const choices = CLUSTER_ATOMS[sector];
  const ledgeW = 170;
  const ledgeTop = GROUND_TOP_Y - 90; // within a single jump (peak ≈ 144px) of the floor
  const ledgeX = x + 75; // sit the ledge inside the reserved span, leaving room to jump up from either side
  const ledgeMid = ledgeX + ledgeW / 2;
  s.platforms = [...(s.platforms ?? []), [ledgeX, ledgeTop, ledgeW] as [number, number, number]];
  s.atoms = [...s.atoms, { x: ledgeMid + 30, y: ledgeTop - 44, choices }];
  s.enemies = [...s.enemies, { x: ledgeMid - 24, y: ledgeTop - 30, type: guard }];
}

const CLUSTER_SPAN = 320; // reserved footprint per cluster

/** Every x-span a new cluster must steer clear of: gaps, hazards, existing ledges, the tower. */
function occupiedSpans(s: StageDef): [number, number][] {
  const spans: [number, number][] = [[2350, 3060]]; // the central sky-tower climb
  for (const [a, b] of s.gaps) spans.push([a, b]);
  for (const [a, b] of s.hazards ?? []) spans.push([a, b]);
  for (const [px, , pw] of s.platforms ?? []) spans.push([px, px + pw]);
  return spans;
}

/** Nearest cluster origin to `target` whose [x, x+span] (plus margin) hits nothing in `blocked`. */
function findClusterSpot(target: number, blocked: [number, number][], width: number): number | null {
  let best: number | null = null;
  for (let x = 220; x < width - 340; x += 40) {
    const lo = x - 60;
    const hi = x + CLUSTER_SPAN + 60;
    if (blocked.some(([a, b]) => lo < b && hi > a)) continue;
    if (best === null || Math.abs(x - target) < Math.abs(best - target)) best = x;
  }
  return best;
}

// Spread two guarded ledge clusters across each stage — one toward the front, one toward the back —
// placed only on ground clear of every existing structure, and never overlapping each other.
for (let i = 0; i < STAGES.length; i++) {
  const s = STAGES[i];
  const sector = Math.ceil((i + 1) / 3);
  const blocked = occupiedSpans(s);
  for (const [variant, target] of [
    [0, Math.round(s.width * 0.16)],
    [1, Math.round(s.width * 0.72)],
  ] as const) {
    const x = findClusterSpot(target, blocked, s.width);
    if (x === null) continue;
    addLedgeCluster(s, x, sector, variant);
    blocked.push([x, x + CLUSTER_SPAN]); // reserve it so the next cluster keeps its distance
  }
}

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

// ── Higher platforms must pay off ──────────────────────────────────────────────
// A climb with nothing at the summit is a dead end. Guarantee every stage's tallest platform (the
// top of its sky tower) carries a reward: if no atom or noble gem already sits up there, perch a
// sector-appropriate atom on it. On stages whose summit already holds a reward this is a no-op.
for (let i = 0; i < STAGES.length; i++) {
  const s = STAGES[i];
  const stageNo = i + 1;
  const sector = Math.ceil(stageNo / 3);
  let top: [number, number, number] | null = null;
  for (const p of s.platforms ?? []) if (!top || p[1] < top[1]) top = p;
  if (!top) continue;
  const [px, py, pw] = top;
  const cx = px + pw / 2;
  // Already rewarded if an atom is perched near/above this platform, or the sector's gem lives here.
  const hasAtom = s.atoms.some((a) => Math.abs(a.x - cx) < 150 && (a.y ?? GROUND_TOP_Y) < py + 80);
  const gem = NOBLE_BY_STAGE[stageNo];
  const hasGem = gem !== undefined && Math.abs(gem.x - cx) < 170;
  if (!hasAtom && !hasGem) {
    s.atoms.push({ x: Math.round(cx), y: py - 44, choices: CLUSTER_ATOMS[sector] });
  }
}
