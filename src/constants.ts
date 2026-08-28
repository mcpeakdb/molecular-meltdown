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
export const SLOT_KEY_TOUCH_LABELS = ['1', '2', '3'] as const;
/** Slot key badges to display: keyboard keys (Z/X/C) normally, touch numbers (1/2/3) on touch devices. */
export const slotKeyLabels = (touch: boolean): readonly string[] => (touch ? SLOT_KEY_TOUCH_LABELS : SLOT_KEY_LABELS);

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const WORLD_WIDTH = 5500; // default / widest stage span; individual stages may be shorter

// ── Sectors & stages ─────────────────────────────────────────────────────────
// The game is 18 stages grouped into 6 sectors of 3 stages each. A "sector" is the
// biome/theme (art, music-color, boss); a "stage" is one playable level within it.
// stage 1-18 → sector = ceil(stage/3); the 3rd stage of each sector is the boss finale.
export const STAGE_COUNT = 18;
export type SectorId = 1 | 2 | 3 | 4 | 5 | 6;

export const sectorOf = (stage: number): SectorId => Math.min(6, Math.floor((stage - 1) / 3) + 1) as SectorId;
/** Position of a stage within its sector: 1, 2, or 3 (3 = boss finale). */
export const substageOf = (stage: number): number => ((stage - 1) % 3) + 1;
export const isFinaleStage = (stage: number): boolean => substageOf(stage) === 3;

export const SECTORS: Record<SectorId, { name: string }> = {
  1: { name: 'PETRI DISH' },
  2: { name: 'BLOOD AGAR' },
  3: { name: 'MACCONKEY' },
  // Sectors 4–6 — the player has escaped the dishes and is loose on the lab floor (shared biome).
  4: { name: 'LAB FLOOR' },
  5: { name: 'UNDER THE BENCH' },
  6: { name: 'THE WASTE BIN' },
};

// ── 2D platformer geometry ───────────────────────────────────────────────────
// The world is a true side view: GROUND_TOP_Y is the solid floor surface characters stand on
// (with real holes for gaps), and Y is real height under arcade gravity. Flying enemies hover
// within FLYER_MIN_Y..FLYER_MAX_Y instead of resting on the ground.
export const GROUND_TOP_Y = 470;
export const GRAVITY = 1800; // px/s² applied to the player and ground enemies
export const FLYER_MIN_Y = 140;
export const FLYER_MAX_Y = 430;

// Fixed render layers (side view sorts by role, not by Y as the old 2.5D depth model did).
export const DEPTH = {
  BG: -10,
  GROUND: -5,
  PLATFORM: -3,
  GAP: -2,
  ENEMY: 40,
  BOSS: 45,
  PLAYER: 50,
} as const;

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
  // Sulfur / chlorine / phosphorus base atoms and the molecules they assemble with the existing atoms.
  SULFUR: 'sulfur',
  CHLORINE: 'chlorine',
  PHOSPHORUS: 'phosphorus',
  HYDROGEN_SULFIDE: 'hydrogen_sulfide',
  SULFUR_DIOXIDE: 'sulfur_dioxide',
  SULFURIC_ACID: 'sulfuric_acid',
  HYDROCHLORIC_ACID: 'hydrochloric_acid',
  PHOSPHINE: 'phosphine',
  PHOSPHORIC_ACID: 'phosphoric_acid',
  PHOSPHORUS_TRICHLORIDE: 'phosphorus_trichloride',
  // Sodium — the reactive alkali metal, and the ionic salts it forms with the other atoms.
  SODIUM: 'sodium',
  SODIUM_CHLORIDE: 'sodium_chloride',
  SODIUM_HYDROXIDE: 'sodium_hydroxide',
  SODIUM_CARBONATE: 'sodium_carbonate',
  SODIUM_NITRATE: 'sodium_nitrate',
  GOLD: 'gold',
  // Platinum — an even rarer Gold: pick any atom and gain +3 (three level-ups). ~0.1% of atom nodes.
  PLATINUM: 'platinum',
  // Super weapon — not an atom/compound. Permanently armed once all noble gases are collected.
  PRISMATIC: 'prismatic',
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
  [ELEMENTS.SULFUR]: 0xf2c81e,
  [ELEMENTS.CHLORINE]: 0x8fe04a,
  [ELEMENTS.PHOSPHORUS]: 0xd8ffa0,
  [ELEMENTS.HYDROGEN_SULFIDE]: 0xc9d94a,
  [ELEMENTS.SULFUR_DIOXIDE]: 0xd8cf88,
  [ELEMENTS.SULFURIC_ACID]: 0xf6e61e,
  [ELEMENTS.HYDROCHLORIC_ACID]: 0xa8e86a,
  [ELEMENTS.PHOSPHINE]: 0xbfe87a,
  [ELEMENTS.PHOSPHORIC_ACID]: 0xdff0a0,
  [ELEMENTS.PHOSPHORUS_TRICHLORIDE]: 0xbfe0a0,
  [ELEMENTS.SODIUM]: 0xffb020,
  [ELEMENTS.SODIUM_CHLORIDE]: 0xeef2ff,
  [ELEMENTS.SODIUM_HYDROXIDE]: 0xd9c2ff,
  [ELEMENTS.SODIUM_CARBONATE]: 0xbfe4f0,
  [ELEMENTS.SODIUM_NITRATE]: 0xffd27a,
  [ELEMENTS.GOLD]: 0xffd700,
  [ELEMENTS.PLATINUM]: 0xb9d4e8,
  [ELEMENTS.PRISMATIC]: 0xff66ff,
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
  [ELEMENTS.SULFUR]: 'Sulfur',
  [ELEMENTS.CHLORINE]: 'Chlorine',
  [ELEMENTS.PHOSPHORUS]: 'Phosphorus',
  [ELEMENTS.HYDROGEN_SULFIDE]: 'Hydrogen Sulfide (H₂S)',
  [ELEMENTS.SULFUR_DIOXIDE]: 'Sulfur Dioxide (SO₂)',
  [ELEMENTS.SULFURIC_ACID]: 'Sulfuric Acid (H₂SO₄)',
  [ELEMENTS.HYDROCHLORIC_ACID]: 'Hydrochloric Acid (HCl)',
  [ELEMENTS.PHOSPHINE]: 'Phosphine (PH₃)',
  [ELEMENTS.PHOSPHORIC_ACID]: 'Phosphoric Acid (H₃PO₄)',
  [ELEMENTS.PHOSPHORUS_TRICHLORIDE]: 'Phosphorus Trichloride (PCl₃)',
  [ELEMENTS.SODIUM]: 'Sodium',
  [ELEMENTS.SODIUM_CHLORIDE]: 'Sodium Chloride (NaCl)',
  [ELEMENTS.SODIUM_HYDROXIDE]: 'Sodium Hydroxide (NaOH)',
  [ELEMENTS.SODIUM_CARBONATE]: 'Sodium Carbonate (Na₂CO₃)',
  [ELEMENTS.SODIUM_NITRATE]: 'Sodium Nitrate (NaNO₃)',
  [ELEMENTS.GOLD]: 'Gold (Au)',
  [ELEMENTS.PLATINUM]: 'Platinum (Pt)',
  [ELEMENTS.PRISMATIC]: 'Prismatic Beam',
};

export const PLAYER_MAX_HP = 100;
export const PLAYER_SPEED = 220;
export const PLAYER_MELEE_RANGE = 85;
export const PLAYER_MELEE_DAMAGE = 12;
export const PLAYER_ATTACK_COOLDOWN = 400; // ms
export const PLAYER_INVINCIBILITY_MS = 800;

// Jump — real arcade physics (body velocity + GRAVITY). Peak height ≈ v²/(2·GRAVITY).
export const PLAYER_JUMP_VELOCITY = 720; // px/s initial upward velocity (peak ≈ 144px)
export const PLAYER_DOUBLE_JUMP_VELOCITY = 760; // px/s — a punchy airborne second jump (re-boosts higher)
export const PLAYER_MAX_JUMPS = 2;
export const GAP_FALL_DAMAGE = 15; // taken when the player falls into a pit (then respawns on the last ledge)

// Platforming hazards (added throughout the stages — see src/stages.ts)
export const PLAYER_BOUNCE_VELOCITY = 1626; // bounce-pad launch velocity (peak ≈ 735px — 2× a normal bop)
export const HAZARD_DAMAGE = 10; // per invincibility-throttled tick while standing in acid/spikes
export const CRUMBLE_DELAY_MS = 620; // grace period after stepping on a crumbling tile before it drops

export const MAX_ELEMENT_LEVEL = 3;

// ── Run / lives ────────────────────────────────────────────────────────────────
// A "run" begins when a stage is picked from Stage Select (score, noble-gas collection, and lives all
// reset there). The player has this many lives; each death spends one, and running out ends the run.
export const RUN_LIVES = 3;

// ── Attack registry (molecular tree + weapon-slot arsenal) ──────────────────
// The eight collectable base atoms.
export type BaseAtom = 'hydrogen' | 'oxygen' | 'carbon' | 'nitrogen' | 'sulfur' | 'chlorine' | 'phosphorus' | 'sodium';
export const BASE_ATOMS: BaseAtom[] = [
  'hydrogen',
  'oxygen',
  'carbon',
  'nitrogen',
  'sulfur',
  'chlorine',
  'phosphorus',
  'sodium',
];

// ── Noble gases ─────────────────────────────────────────────────────────────
// Inert collectibles — one of each exists, tucked away on hard-to-reach platforms or guarded by a
// strong germ. They don't build compounds; grabbing one is a big score bonus and a permanent find.
export type NobleGasId = 'helium' | 'neon' | 'argon' | 'krypton' | 'xenon' | 'radon';
export interface NobleGasDef {
  id: NobleGasId;
  name: string;
  symbol: string;
  color: number;
}
export const NOBLE_GASES: NobleGasDef[] = [
  { id: 'helium', name: 'Helium', symbol: 'He', color: 0xfff0a0 },
  { id: 'neon', name: 'Neon', symbol: 'Ne', color: 0xff5db1 },
  { id: 'argon', name: 'Argon', symbol: 'Ar', color: 0x9b7bff },
  { id: 'krypton', name: 'Krypton', symbol: 'Kr', color: 0x5be0d0 },
  { id: 'xenon', name: 'Xenon', symbol: 'Xe', color: 0x6aa8ff },
  { id: 'radon', name: 'Radon', symbol: 'Rn', color: 0x66ff77 },
];
export const NOBLE_GAS_BY_ID: Record<NobleGasId, NobleGasDef> = Object.fromEntries(
  NOBLE_GASES.map((n) => [n.id, n]),
) as Record<NobleGasId, NobleGasDef>;
export const NOBLE_GAS_COUNT = NOBLE_GASES.length;
export const NOBLE_GAS_BONUS = 500; // score awarded for collecting a noble gas

// ── Silver coins ──────────────────────────────────────────────────────────────
// A trail of collectable coins lines every stage. Each is a small score pickup; sweeping up every
// coin in a stage awards a one-time completion bonus. Silver is the coin metal — Ag sits just above
// Gold in periodic group 11 (see the Periodic Table screen).
export const COINS_PER_STAGE = 50; // coins scattered along each stage
export const COIN_SCORE = 25; // points per coin
export const COIN_BONUS = 3000; // bonus for collecting every coin in a stage
export const COIN_COLOR = 0xd8e2ec; // silver

// Clearing every germ in a stage is optional (the exit is never sealed), so it pays a small
// completion bonus on top of the kill scores — the same "clean sweep" shape as COIN_BONUS.
export const PURGE_BONUS = 500;

// ── Healing drops (Ca / Zn) ──────────────────────────────────────────────────
// Non-attack pickups that restore player HP. These are the "elements of life": Calcium (bone/repair)
// heals more but is rarer per stage; Zinc (wound healing / immunity) heals less. Neither opens an
// element choice or builds the molecular tree — collecting one just tops the player up.
export type HealId = 'calcium' | 'zinc';
export const HEAL_DROPS: Record<
  HealId,
  { name: string; symbol: string; color: number; heal: number; texture: string; perStage: number }
> = {
  calcium: { name: 'Calcium', symbol: 'Ca', color: 0xfff2d6, heal: 30, texture: 'atom_calcium', perStage: 1 },
  zinc: { name: 'Zinc', symbol: 'Zn', color: 0xbfeed8, heal: 15, texture: 'atom_zinc', perStage: 2 },
};
export const HEAL_IDS = Object.keys(HEAL_DROPS) as HealId[];

// ── Armor drops (Fe) ─────────────────────────────────────────────────────────
// Non-attack pickups that grant armor — a damage-absorbing buffer that soaks incoming hits before
// they reach HP. Iron (Fe, hemoglobin / the body's iron) is the sole armor drop. Like the healing
// drops it opens no element choice; the armor it grants lasts for the current stage.
export type ArmorId = 'iron';
export const ARMOR_DROPS: Record<
  ArmorId,
  { name: string; symbol: string; color: number; armor: number; texture: string; perStage: number }
> = {
  iron: { name: 'Iron', symbol: 'Fe', color: 0x9aa7b5, armor: 25, texture: 'atom_iron', perStage: 1 },
};
export const ARMOR_IDS = Object.keys(ARMOR_DROPS) as ArmorId[];
/** Cap on the player's armor buffer (absorbs damage before HP). */
export const PLAYER_MAX_ARMOR = 50;

// Every attack maps 1:1 to an element/compound. NONE has no attack; GOLD and PLATINUM are wildcard
// pickups (they grant atoms rather than firing), so they are excluded too.
export type AttackId = Exclude<ElementType, typeof ELEMENTS.NONE | typeof ELEMENTS.GOLD | typeof ELEMENTS.PLATINUM>;

export interface AttackDef {
  id: AttackId;
  /** Stoichiometric recipe — exact atom counts needed to assemble one copy of the molecule. */
  recipe: Partial<Record<BaseAtom, number>>;
  /** Fixed priority used to order the weapon slots (lower = earlier key). */
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
  // ── Sulfur / chlorine / phosphorus base atoms ──────────────────────────────
  [ELEMENTS.SULFUR]: {
    id: ELEMENTS.SULFUR,
    recipe: { sulfur: 1 },
    slot: 11,
    color: 0xf2c81e,
    tierNames: ['Brimstone Lash', 'Sulfur Burn', 'Brimstone Storm'],
    cooldownMs: 800,
  },
  [ELEMENTS.CHLORINE]: {
    id: ELEMENTS.CHLORINE,
    recipe: { chlorine: 1 },
    slot: 12,
    color: 0x8fe04a,
    tierNames: ['Chlorine Gas', 'Bleach Cloud', 'Mustard Fog'],
    cooldownMs: 900,
  },
  [ELEMENTS.PHOSPHORUS]: {
    id: ELEMENTS.PHOSPHORUS,
    recipe: { phosphorus: 1 },
    slot: 13,
    color: 0xd8ffa0,
    tierNames: ['Ember Spark', 'White Phosphorus', 'Incendiary Rain'],
    cooldownMs: 900,
  },
  // ── Compounds the new atoms assemble with the existing ones (and each other) ──
  [ELEMENTS.HYDROGEN_SULFIDE]: {
    id: ELEMENTS.HYDROGEN_SULFIDE,
    recipe: { hydrogen: 2, sulfur: 1 },
    slot: 14,
    color: 0xc9d94a,
    tierNames: ['Rotten Vapor', 'Sour Gas', 'Sulfide Miasma'],
    cooldownMs: 1300,
  },
  [ELEMENTS.SULFUR_DIOXIDE]: {
    id: ELEMENTS.SULFUR_DIOXIDE,
    recipe: { sulfur: 1, oxygen: 2 },
    slot: 15,
    color: 0xd8cf88,
    tierNames: ['Acrid Puff', 'Choking Smog', 'Sulfur Cloudburst'],
    cooldownMs: 1400,
  },
  [ELEMENTS.SULFURIC_ACID]: {
    id: ELEMENTS.SULFURIC_ACID,
    recipe: { hydrogen: 2, sulfur: 1, oxygen: 4 },
    slot: 16,
    color: 0xf6e61e,
    tierNames: ['Vitriol Splash', 'Oil of Vitriol', 'Sulfuric Dissolve'],
    cooldownMs: 1900,
  },
  [ELEMENTS.HYDROCHLORIC_ACID]: {
    id: ELEMENTS.HYDROCHLORIC_ACID,
    recipe: { hydrogen: 1, chlorine: 1 },
    slot: 17,
    color: 0xa8e86a,
    tierNames: ['Muriatic Spit', 'Hydrochloric Spray', 'Chloride Meltdown'],
    cooldownMs: 1200,
  },
  [ELEMENTS.PHOSPHINE]: {
    id: ELEMENTS.PHOSPHINE,
    recipe: { phosphorus: 1, hydrogen: 3 },
    slot: 18,
    color: 0xbfe87a,
    tierNames: ['Phosphine Puff', 'Marsh-Gas Flare', 'Phosphine Detonation'],
    cooldownMs: 1400,
  },
  [ELEMENTS.PHOSPHORIC_ACID]: {
    id: ELEMENTS.PHOSPHORIC_ACID,
    recipe: { hydrogen: 3, phosphorus: 1, oxygen: 4 },
    slot: 19,
    color: 0xdff0a0,
    tierNames: ['Phosphoric Drip', 'Etching Acid', 'Phosphoric Rain'],
    cooldownMs: 1900,
  },
  [ELEMENTS.PHOSPHORUS_TRICHLORIDE]: {
    id: ELEMENTS.PHOSPHORUS_TRICHLORIDE,
    recipe: { phosphorus: 1, chlorine: 3 },
    slot: 20,
    color: 0xbfe0a0,
    tierNames: ['Fuming Splash', 'Smoking Corrosive', 'Trichloride Storm'],
    cooldownMs: 1700,
  },
  // ── Sodium and the ionic salts it forms with the other atoms ────────────────
  [ELEMENTS.SODIUM]: {
    id: ELEMENTS.SODIUM,
    recipe: { sodium: 1 },
    slot: 21,
    color: 0xffb020,
    tierNames: ['Sodium Spark', 'Alkali Burst', 'Alkali Detonation'],
    cooldownMs: 850,
  },
  [ELEMENTS.SODIUM_CHLORIDE]: {
    id: ELEMENTS.SODIUM_CHLORIDE,
    recipe: { sodium: 1, chlorine: 1 },
    slot: 22,
    color: 0xeef2ff,
    tierNames: ['Salt Shot', 'Crystal Shrapnel', 'Halite Storm'],
    cooldownMs: 1000,
  },
  [ELEMENTS.SODIUM_HYDROXIDE]: {
    id: ELEMENTS.SODIUM_HYDROXIDE,
    recipe: { sodium: 1, oxygen: 1, hydrogen: 1 },
    slot: 23,
    color: 0xd9c2ff,
    tierNames: ['Lye Splash', 'Caustic Pool', 'Saponify'],
    cooldownMs: 1500,
  },
  [ELEMENTS.SODIUM_CARBONATE]: {
    id: ELEMENTS.SODIUM_CARBONATE,
    recipe: { sodium: 2, carbon: 1, oxygen: 3 },
    slot: 24,
    color: 0xbfe4f0,
    tierNames: ['Soda Foam', 'Foam Surge', 'Soda Ash Blast'],
    cooldownMs: 1600,
  },
  [ELEMENTS.SODIUM_NITRATE]: {
    id: ELEMENTS.SODIUM_NITRATE,
    recipe: { sodium: 1, nitrogen: 1, oxygen: 3 },
    slot: 25,
    color: 0xffd27a,
    tierNames: ['Oxidizer Flare', 'Saltpeter Ignition', 'Chain Deflagration'],
    cooldownMs: 1800,
  },
  // Super weapon — has no atom recipe; availability is driven by the noble-gas collection, not
  // `levelFor`. It is excluded from ATTACK_ORDER so the recipe machinery never touches it.
  [ELEMENTS.PRISMATIC]: {
    id: ELEMENTS.PRISMATIC,
    recipe: {},
    slot: 99,
    color: 0xff66ff,
    tierNames: ['Prismatic Beam', 'Prismatic Beam', 'Prismatic Beam'],
    cooldownMs: 5000,
  },
};

// ── Damage types & elemental affinity ───────────────────────────────────────
// Every attack deals exactly one *damage type*. Enemies and bosses declare which types they are
// weak or resistant to (see `AFFINITY` in Enemy.ts / Boss.ts), so the arsenal is a set of tools
// with matchups rather than a list of interchangeable damage numbers. Keeping the taxonomy small
// is the point: a player can learn nine types, not twenty-six attacks.
export type DamageType =
  /** Blunt/kinetic force — punches, water jets, foam shoves. */
  | 'impact'
  /** Solids: shards, crystals, claws. */
  | 'piercing'
  /** Combustion and incendiaries. */
  | 'fire'
  /** Freezing and cryogenics. */
  | 'cryo'
  /** Corrosive acids. */
  | 'acid'
  /** Alkalis/bases — the other half of the pH scale. */
  | 'caustic'
  /** Toxic and suffocating gases. */
  | 'gas'
  /** Detonations and shockwaves. */
  | 'explosive'
  /** Plasma and radiant energy. */
  | 'energy'
  /** Unresistable — the noble-gas super weapon only. No affinity ever applies. */
  | 'pure';

/** The damage type of the player's basic melee punch (no atom required). */
export const MELEE_DAMAGE_TYPE: DamageType = 'impact';

export const ATTACK_TYPE: Record<AttackId, DamageType> = {
  [ELEMENTS.HYDROGEN]: 'energy',
  [ELEMENTS.OXYGEN]: 'fire',
  [ELEMENTS.CARBON]: 'piercing',
  [ELEMENTS.NITROGEN]: 'cryo',
  [ELEMENTS.WATER]: 'impact',
  [ELEMENTS.AMMONIA]: 'caustic',
  [ELEMENTS.CARBON_DIOXIDE]: 'gas',
  [ELEMENTS.METHANE]: 'fire',
  [ELEMENTS.NITRIC_OXIDE]: 'impact', // Radical Rush damages by ramming
  [ELEMENTS.CARBONIC_ACID]: 'acid',
  [ELEMENTS.SULFUR]: 'fire',
  [ELEMENTS.CHLORINE]: 'gas',
  [ELEMENTS.PHOSPHORUS]: 'fire',
  [ELEMENTS.HYDROGEN_SULFIDE]: 'gas',
  [ELEMENTS.SULFUR_DIOXIDE]: 'gas',
  [ELEMENTS.SULFURIC_ACID]: 'acid',
  [ELEMENTS.HYDROCHLORIC_ACID]: 'acid',
  [ELEMENTS.PHOSPHINE]: 'fire',
  [ELEMENTS.PHOSPHORIC_ACID]: 'acid',
  [ELEMENTS.PHOSPHORUS_TRICHLORIDE]: 'acid',
  [ELEMENTS.SODIUM]: 'explosive',
  [ELEMENTS.SODIUM_CHLORIDE]: 'piercing',
  [ELEMENTS.SODIUM_HYDROXIDE]: 'caustic',
  [ELEMENTS.SODIUM_CARBONATE]: 'impact',
  [ELEMENTS.SODIUM_NITRATE]: 'explosive',
  [ELEMENTS.PRISMATIC]: 'pure', // the super weapon answers to no matchup
};

/** A creature's damage-type multipliers. Absent = 1 (neutral). >1 weak, <1 resistant. */
export type Affinity = Partial<Record<DamageType, number>>;

/** Above/below these, a hit is loud enough to earn a WEAK!/RESIST cue. */
export const WEAK_CUE_THRESHOLD = 1.25;
export const RESIST_CUE_THRESHOLD = 0.85;

/** Scale `dmg` by a target's affinity for `type`. `pure` ignores affinity entirely. */
export function applyAffinity(dmg: number, type: DamageType, affinity: Affinity | undefined): number {
  if (type === 'pure' || !affinity) return dmg;
  return dmg * (affinity[type] ?? 1);
}

/** The noble-gas super weapon's attack id (gated by collection completeness, not atoms). */
export const SUPER_ATTACK_ID: AttackId = ELEMENTS.PRISMATIC;

/** Attack ids in fixed slot/priority order. Excludes the super weapon (it isn't atom-derived). */
export const ATTACK_ORDER: AttackId[] = Object.values(ATTACKS)
  .filter((a) => a.id !== SUPER_ATTACK_ID)
  .sort((a, b) => a.slot - b.slot)
  .map((a) => a.id);

// ── Element trivia (Phase 7) ────────────────────────────────────────────────
// Short real-world facts surfaced on the choice cards. One is picked at random per
// card build. Keyed by ElementType so base atoms, compounds, and Gold can all carry lore.
export const ELEMENT_FACTS: Partial<Record<ElementType, string[]>> = {
  [ELEMENTS.HYDROGEN]: [
    'The lightest element — and ~75% of all ordinary matter in the universe.',
    "Fuses in the Sun's core, releasing the energy that lights the sky.",
    "So light it escapes Earth's gravity and drifts off into space.",
  ],
  [ELEMENTS.OXYGEN]: [
    'Makes up about 21% of the air you breathe.',
    "The most abundant element in the Earth's crust by mass.",
    'Liquid oxygen is pale blue and faintly magnetic.',
  ],
  [ELEMENTS.CARBON]: [
    'The backbone of all known life — every cell is built on it.',
    'Diamond and graphite are both pure carbon, just arranged differently.',
    'Forms more compounds than any other element.',
  ],
  [ELEMENTS.NITROGEN]: [
    'About 78% of the atmosphere is nitrogen gas.',
    'Liquid nitrogen boils at a frigid -196°C.',
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
  [ELEMENTS.SULFUR]: [
    'The brimstone of legend — it burns with an eerie blue flame.',
    'Yellow and brittle, it reeks of rotten eggs as it reacts.',
    'A building block of gunpowder and, as sulfuric acid, of industry itself.',
  ],
  [ELEMENTS.CHLORINE]: [
    'A choking green-yellow gas — and the sting in every swimming pool.',
    'Half of table salt: sodium plus chlorine makes NaCl.',
    'A ferocious oxidizer that bleaches and disinfects.',
  ],
  [ELEMENTS.PHOSPHORUS]: [
    'White phosphorus bursts into flame in open air.',
    'It glows faintly in the dark — the origin of the word “phosphorescence”.',
    'Vital to life: it forms the backbone of DNA and your bones.',
  ],
  [ELEMENTS.SODIUM]: [
    'So reactive it bursts into flame the moment it touches water.',
    'Stored under oil — bare sodium tarnishes in seconds in open air.',
    'Its flame test burns the vivid yellow of every streetlamp ever made.',
  ],
  [ELEMENTS.GOLD]: [
    'So nonreactive it never tarnishes — gold stays shiny forever.',
    'Dense and soft: a single gram can be hammered into a sheet a meter wide.',
    'Forged in the collisions of neutron stars.',
  ],
};

// ── M.E.G. max-level quips ──────────────────────────────────────────────────
// Celebratory one-liners M.E.G. blurts out the first time you push an element or compound to its
// top tier (Lv3). One is picked at random; `{el}` is replaced with the element/compound name.
export const MEG_MAX_LEVEL_QUIPS: string[] = [
  "Level 3 {el}! You're really in your element now!",
  'Whoa, {el} at full power! That is some peak reactivity!',
  'Max-level {el}! The periodic table salutes you.',
  '{el} at Lv3 — you have got chemistry, kid!',
  'Now THAT is a stable configuration — {el} maxed!',
  'Peak {el}! Even the noble gases are impressed.',
  '{el} at Lv3 — periodic perfection achieved!',
  'Triple-strength {el}! Unbreakable, just like our friendship.',
  '{el} at full tilt — you have reached critical mass!',
];
