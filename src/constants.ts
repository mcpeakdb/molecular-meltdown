export type Difficulty = 'normal' | 'hard' | 'extreme';
export interface DifficultyScale {
  enemyHp: number;
  enemySpeed: number;
  invincMs: number;
  /** Number of bindable weapon slots (keys 1..weaponSlots). The player assigns compounds to these
   *  via the Compound Selection menu; the first unlocks auto-fill them. */
  weaponSlots: number;
}
// Tiers shifted up a notch from the old Easy/Normal/Hard: the gentle tuning is the baseline
// "Normal", with Hard/Extreme above it. Normal/Hard carry three weapon slots; Extreme only two.
export const DIFFICULTY_SCALE: Record<Difficulty, DifficultyScale> = {
  normal: { enemyHp: 0.7, enemySpeed: 0.75, invincMs: 1400, weaponSlots: 3 },
  hard: { enemyHp: 1.0, enemySpeed: 1.0, invincMs: 800, weaponSlots: 3 },
  extreme: { enemyHp: 1.4, enemySpeed: 1.25, invincMs: 500, weaponSlots: 2 },
};

/** Keyboard keys bound to weapon slots 1..N (and the labels shown on the HUD chips + touch buttons). */
export const SLOT_KEY_LABELS = ['Z', 'X', 'C'] as const;

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const WORLD_WIDTH = 5500; // default / widest stage span; individual stages may be shorter

// ── Sectors & stages ─────────────────────────────────────────────────────────
// The game is 9 stages grouped into 3 sectors of 3 stages each. A "sector" is the
// biome/theme (art, music-color, boss); a "stage" is one playable level within it.
// stage 1-9 → sector = ceil(stage/3); the 3rd stage of each sector is the boss finale.
export const STAGE_COUNT = 9;
export type SectorId = 1 | 2 | 3;

export const sectorOf = (stage: number): SectorId => Math.min(3, Math.floor((stage - 1) / 3) + 1) as SectorId;
/** Position of a stage within its sector: 1, 2, or 3 (3 = boss finale). */
export const substageOf = (stage: number): number => ((stage - 1) % 3) + 1;
export const isFinaleStage = (stage: number): boolean => substageOf(stage) === 3;

export const SECTORS: Record<SectorId, { name: string }> = {
  1: { name: 'PETRI DISH' },
  2: { name: 'BLOOD AGAR' },
  3: { name: 'MACCONKEY' },
};

// Walkable band — characters move freely within this Y range
export const FLOOR_MIN_Y = 310;
export const FLOOR_MAX_Y = 460;
export const FLOOR_CENTER_Y = 400;

export const ELEMENTS = {
  NONE: 'none',
  HYDROGEN: 'hydrogen',
  OXYGEN: 'oxygen',
  WATER: 'water',
  CARBON: 'carbon',
  NITROGEN: 'nitrogen',
  AMMONIA: 'ammonia',
  CARBON_DIOXIDE: 'carbon_dioxide',
  METHANE: 'methane',
  NITRIC_OXIDE: 'nitric_oxide',
  CARBONIC_ACID: 'carbonic_acid',
  GOLD: 'gold',
} as const;

export type ElementType = (typeof ELEMENTS)[keyof typeof ELEMENTS];

export const ELEMENT_COLORS: Record<ElementType, number> = {
  [ELEMENTS.NONE]: 0x888888,
  [ELEMENTS.HYDROGEN]: 0x4499ff,
  [ELEMENTS.OXYGEN]: 0xff5533,
  [ELEMENTS.WATER]: 0x22ccff,
  [ELEMENTS.CARBON]: 0x888888,
  [ELEMENTS.NITROGEN]: 0x44ddcc,
  [ELEMENTS.AMMONIA]: 0xaadd44,
  [ELEMENTS.CARBON_DIOXIDE]: 0x99bbcc,
  [ELEMENTS.METHANE]: 0xff9922,
  [ELEMENTS.NITRIC_OXIDE]: 0xdd44aa,
  [ELEMENTS.CARBONIC_ACID]: 0x33aadd,
  [ELEMENTS.GOLD]: 0xffd700,
};

export const ELEMENT_NAMES: Record<ElementType, string> = {
  [ELEMENTS.NONE]: 'None',
  [ELEMENTS.HYDROGEN]: 'Hydrogen',
  [ELEMENTS.OXYGEN]: 'Oxygen',
  [ELEMENTS.WATER]: 'Water (H₂O)',
  [ELEMENTS.CARBON]: 'Carbon',
  [ELEMENTS.NITROGEN]: 'Nitrogen',
  [ELEMENTS.AMMONIA]: 'Ammonia (NH₃)',
  [ELEMENTS.CARBON_DIOXIDE]: 'Carbon Dioxide (CO₂)',
  [ELEMENTS.METHANE]: 'Methane (CH₄)',
  [ELEMENTS.NITRIC_OXIDE]: 'Nitric Oxide (NO)',
  [ELEMENTS.CARBONIC_ACID]: 'Carbonic Acid (H₂CO₃)',
  [ELEMENTS.GOLD]: 'Gold (Au)',
};

export const PLAYER_MAX_HP = 100;
export const PLAYER_SPEED = 220;
export const PLAYER_MELEE_RANGE = 85;
export const PLAYER_MELEE_DAMAGE = 12;
export const PLAYER_ATTACK_COOLDOWN = 400; // ms
export const PLAYER_SPECIAL_COOLDOWN = 1200; // ms
export const PLAYER_INVINCIBILITY_MS = 800;

// Jump — manual vertical integration (jumpOffset lifts the sprite visually above its ground Y)
export const PLAYER_JUMP_VELOCITY = 540; // px/s initial upward velocity (peak ≈ 90px)
export const PLAYER_DOUBLE_JUMP_VELOCITY = 470; // px/s for the airborne second jump
export const PLAYER_JUMP_GRAVITY = 1600; // px/s²
export const PLAYER_MAX_JUMPS = 2;
export const GAP_FALL_DAMAGE = 15; // taken when the player lands inside a chasm instead of clearing it

// Platforming hazards (added throughout the stages — see src/stages.ts)
export const PLAYER_BOUNCE_VELOCITY = 840; // bounce-pad launch velocity (peak ≈ 220px)
export const HAZARD_DAMAGE = 10; // per invincibility-throttled tick while standing in acid/spikes
export const CRUMBLE_DELAY_MS = 620; // grace period after stepping on a crumbling tile before it drops

export const MAX_ELEMENT_LEVEL = 3;

// ── Attack registry (Phase 6: molecular tree + numpad arsenal) ──────────────
// The four collectable base atoms.
export type BaseAtom = 'hydrogen' | 'oxygen' | 'carbon' | 'nitrogen';
export const BASE_ATOMS: BaseAtom[] = ['hydrogen', 'oxygen', 'carbon', 'nitrogen'];

// Every attack maps 1:1 to an element/compound. NONE has no attack; GOLD is a wildcard
// pickup (it grants atoms rather than firing), so it is excluded too.
export type AttackId = Exclude<ElementType, typeof ELEMENTS.NONE | typeof ELEMENTS.GOLD>;

export interface AttackDef {
  id: AttackId;
  /** Stoichiometric recipe — exact atom counts needed to assemble one copy of the molecule. */
  recipe: Partial<Record<BaseAtom, number>>;
  /** Fixed priority used to order the numpad slots (lower = earlier key). */
  slot: number;
  /** Effect/HUD color — tuned to match the atom or compound. */
  color: number;
  /** Per-tier special names (Lv1, Lv2, Lv3). */
  tierNames: [string, string, string];
  /** Independent cooldown for this attack, in ms. */
  cooldownMs: number;
}

export const ATTACKS: Record<AttackId, AttackDef> = {
  [ELEMENTS.HYDROGEN]: {
    id: ELEMENTS.HYDROGEN,
    recipe: { hydrogen: 1 },
    slot: 1,
    color: 0x4499ff,
    tierNames: ['Proton Punch', 'Plasma Arc', 'Fusion Burst'],
    cooldownMs: 700,
  },
  [ELEMENTS.OXYGEN]: {
    id: ELEMENTS.OXYGEN,
    recipe: { oxygen: 1 },
    slot: 2,
    color: 0xff5533,
    tierNames: ['Oxidize', 'Reactive Cloud', 'Oxidation Nova'],
    cooldownMs: 800,
  },
  [ELEMENTS.CARBON]: {
    id: ELEMENTS.CARBON,
    recipe: { carbon: 1 },
    slot: 3,
    color: 0x888888,
    tierNames: ['Carbon Claw', 'Diamond Shard', 'Graphene Shockwave'],
    cooldownMs: 800,
  },
  [ELEMENTS.NITROGEN]: {
    id: ELEMENTS.NITROGEN,
    recipe: { nitrogen: 1 },
    slot: 4,
    color: 0x44ddcc,
    tierNames: ['Nitrogen Frost', 'Cryo Burst', 'Absolute Zero'],
    cooldownMs: 900,
  },
  [ELEMENTS.WATER]: {
    id: ELEMENTS.WATER,
    recipe: { hydrogen: 2, oxygen: 1 },
    slot: 5,
    color: 0x22ccff,
    tierNames: ['Water Jet', 'Hydro Wave', 'Tidal Force'],
    cooldownMs: 1200,
  },
  [ELEMENTS.AMMONIA]: {
    id: ELEMENTS.AMMONIA,
    recipe: { nitrogen: 1, hydrogen: 3 },
    slot: 6,
    color: 0xaadd44,
    tierNames: ['Caustic Spray', 'Acid Cloud', 'Toxic Deluge'],
    cooldownMs: 1300,
  },
  [ELEMENTS.CARBON_DIOXIDE]: {
    id: ELEMENTS.CARBON_DIOXIDE,
    recipe: { carbon: 1, oxygen: 2 },
    slot: 7,
    color: 0x99bbcc,
    tierNames: ['Smog Pulse', 'Suffocation Field', 'Blackout'],
    cooldownMs: 1300,
  },
  [ELEMENTS.METHANE]: {
    id: ELEMENTS.METHANE,
    recipe: { carbon: 1, hydrogen: 4 },
    slot: 8,
    color: 0xff9922,
    tierNames: ['Gas Ignite', 'Chain Blast', 'Fireball'],
    cooldownMs: 1100,
  },
  [ELEMENTS.NITRIC_OXIDE]: {
    id: ELEMENTS.NITRIC_OXIDE,
    recipe: { nitrogen: 1, oxygen: 1 },
    slot: 9,
    color: 0xdd44aa,
    tierNames: ['Radical Rush', 'Reactive Aura', 'Overclock'],
    cooldownMs: 1400,
  },
  [ELEMENTS.CARBONIC_ACID]: {
    id: ELEMENTS.CARBONIC_ACID,
    recipe: { hydrogen: 2, carbon: 1, oxygen: 3 },
    slot: 10,
    color: 0x33aadd,
    tierNames: ['Acid Drop', 'Corrosive Spray', 'Acid Rain'],
    cooldownMs: 1800,
  },
};

/** Attack ids in fixed slot/priority order. */
export const ATTACK_ORDER: AttackId[] = Object.values(ATTACKS)
  .sort((a, b) => a.slot - b.slot)
  .map((a) => a.id);

// ── Element trivia (Phase 7) ────────────────────────────────────────────────
// Short real-world facts surfaced on the choice cards. One is picked at random per
// card build. Keyed by ElementType so base atoms, compounds, and Gold can all carry lore.
export const ELEMENT_FACTS: Partial<Record<ElementType, string[]>> = {
  [ELEMENTS.HYDROGEN]: [
    'The lightest element — and ~75% of all ordinary matter in the universe.',
    'Fuses in the Sun’s core, releasing the energy that lights the sky.',
    'So light it escapes Earth’s gravity and drifts off into space.',
  ],
  [ELEMENTS.OXYGEN]: [
    'Makes up about 21% of the air you breathe.',
    'The most abundant element in the Earth’s crust by mass.',
    'Liquid oxygen is pale blue and faintly magnetic.',
  ],
  [ELEMENTS.CARBON]: [
    'The backbone of all known life — every cell is built on it.',
    'Diamond and graphite are both pure carbon, just arranged differently.',
    'Forms more compounds than any other element.',
  ],
  [ELEMENTS.NITROGEN]: [
    'About 78% of the atmosphere is nitrogen gas.',
    'Liquid nitrogen boils at a frigid −196°C.',
    'Essential to amino acids — the building blocks of proteins.',
  ],
  [ELEMENTS.WATER]: [
    'The only common substance found naturally as solid, liquid, and gas.',
    'Expands when it freezes — which is why ice floats.',
    'Two parts hydrogen, one part oxygen: H₂O.',
  ],
  [ELEMENTS.AMMONIA]: [
    'Its pungent smell warns you long before it harms you.',
    'A key ingredient in fertilizer that feeds half the planet.',
    'NH₃: one nitrogen bonded to three hydrogens.',
  ],
  [ELEMENTS.CARBON_DIOXIDE]: [
    'What you exhale with every breath.',
    'Frozen solid, it becomes “dry ice” that sublimates into fog.',
    'Plants breathe it in and turn it into sugar.',
  ],
  [ELEMENTS.METHANE]: [
    'The main component of natural gas.',
    'A potent greenhouse gas — and cow burps are a real source.',
    'CH₄: one carbon surrounded by four hydrogens.',
  ],
  [ELEMENTS.NITRIC_OXIDE]: [
    'Your body uses it as a signal to widen blood vessels.',
    'A free radical — reactive and short-lived.',
    'Named “Molecule of the Year” by Science in 1992.',
  ],
  [ELEMENTS.CARBONIC_ACID]: [
    'The fizz in every carbonated drink.',
    'Forms when CO₂ dissolves in water.',
    'A weak acid, but it slowly carves out limestone caves.',
  ],
  [ELEMENTS.GOLD]: [
    'So unreactive it never tarnishes — gold stays shiny forever.',
    'Dense and soft: a single gram can be hammered into a sheet a meter wide.',
    'Forged in the collisions of neutron stars.',
  ],
};

// ── M.E.G. max-level quips ──────────────────────────────────────────────────
// Celebratory one-liners M.E.G. blurts out the first time you push an element or compound to its
// top tier (Lv3). One is picked at random; `{el}` is replaced with the element/compound name.
export const MEG_MAX_LEVEL_QUIPS: string[] = [
  "Level 3! You're really in your element now!",
  'Whoa, {el} at full power! That is some peak reactivity!',
  'Max-level {el}! The periodic table salutes you.',
  '{el} at Lv3 — you have got chemistry, kid!',
  'Now THAT is a stable configuration — {el} maxed!',
  'Peak {el}! Even the noble gases are impressed.',
  '{el} at Lv3 — periodic perfection achieved!',
  'Triple-strength {el}! Unbreakable, just like our friendship.',
  '{el} at full tilt — you have reached critical mass!',
];
