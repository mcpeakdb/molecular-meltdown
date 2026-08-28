# Glossary & Key Constants

Shared vocabulary and the constants the rest of the specs lean on. Source of truth:
[`src/constants.ts`](../../src/constants.ts).

## Domain terms

| Term | Meaning |
|------|---------|
| **Stage** | One playable level. There are `STAGE_COUNT = 18` stages, numbered 1–18. The unit of play and unlocking. |
| **Sector** | A biome/theme grouping 3 stages. `sectorOf(stage) = min(6, floor((stage-1)/3)+1)`. Sectors: 1 = PETRI DISH, 2 = BLOOD AGAR, 3 = MACCONKEY, 4 = LAB FLOOR, 5 = UNDER THE BENCH, 6 = THE WASTE BIN (4–6 share the lab-floor biome/tiles). |
| **Substage** | Position within a sector, 1–3. `substageOf(stage) = ((stage-1) % 3) + 1`. |
| **Finale stage** | The 3rd stage of each sector (`substage === 3`, i.e. stages 3, 6, 9, 12, 15, 18) — a boss fight. `isFinaleStage`. |
| **Spire / descent / skybridge** | The three named vertical shapes stages are built from (`src/stages.ts`): a zig-zag climb, forward-and-down terraces, and a level high run. |
| **Raised spawn / raised exit** | A stage that starts (`spawn`) and/or finishes (`exitY`) on a ledge instead of the floor. |
| **Base atom** | One of the eight collectables: hydrogen, oxygen, carbon, nitrogen, sulfur, chlorine, phosphorus, sodium (`BASE_ATOMS`). |
| **Damage type** | The single elemental category an attack deals (`DamageType`, `ATTACK_TYPE`): impact, piercing, fire, cryo, acid, caustic, gas, explosive, energy, or `pure`. |
| **Affinity** | A creature's per-damage-type multiplier (`Affinity`). Absent = 1.0; >1 weak, <1 resistant. `pure` bypasses it entirely. |
| **Compound** | An attack assembled from a stoichiometric recipe of base atoms (water, ammonia, etc.). |
| **Attack / weapon** | Any element/compound the player can fire (`AttackId`); excludes `NONE` and `GOLD`. |
| **Weapon slot** | A bindable attack key. 3 slots on Normal/Hard (Z/X/C), 2 on Extreme. |
| **Noble gas** | An inert collectible (helium…radon) — a score bonus and a run-scoped collection find (reset each run), never a weapon. Completing the set arms the Prismatic Beam for that run. |
| **Healing drop** | A Calcium (`Ca`, +30 HP) or Zinc (`Zn`, +15 HP) pickup (`HEAL_DROPS`) that restores player HP; never a weapon or tree node. |
| **Armor drop** | An Iron (`Fe`, +25 armor) pickup (`ARMOR_DROPS`) that adds to the `armor` buffer, which soaks damage before HP (cap `PLAYER_MAX_ARMOR`); never a weapon or tree node. |
| **M.E.G.** | "Main Element Guide" — the lab-assistant NPC who narrates the tutorial and pops in with quips. |
| **Run** | A single playthrough, begun by picking a stage from Stage Select. Grants `RUN_LIVES` (3) lives; score and the noble-gas collection are run-scoped and reset when a new run starts. Ends when lives run out or the final stage is cleared. |
| **Molecular tree** | The run-scoped set of atoms collected and the attacks they unlock. Not persisted (arcade). |

## World geometry (2D side view)

| Constant | Value | Meaning |
|----------|-------|---------|
| `GAME_WIDTH` / `GAME_HEIGHT` | 960 × 540 | Design resolution / camera viewport. |
| `WORLD_WIDTH` | 5500 | Default/widest world span; each stage overrides via `StageDef.width`. |
| `GROUND_TOP_Y` | 470 | The solid floor surface characters stand on. |
| `GRAVITY` | 1800 px/s² | Applied to the player and ground enemies. |
| `FLYER_MIN_Y` / `FLYER_MAX_Y` | 140 / 430 | Hover band for flying enemies. |
| `DEPTH` | enum | Fixed render layers: BG −10, GROUND −5, PLATFORM −3, GAP −2, ENEMY 40, BOSS 45, PLAYER 50. |

## Player constants

| Constant | Value |
|----------|-------|
| `PLAYER_MAX_HP` | 100 |
| `PLAYER_SPEED` | 220 px/s |
| `PLAYER_MELEE_RANGE` / `PLAYER_MELEE_DAMAGE` | 85 px / 12 |
| `PLAYER_ATTACK_COOLDOWN` | 400 ms (basic punch) |
| `PLAYER_JUMP_VELOCITY` / `PLAYER_DOUBLE_JUMP_VELOCITY` | 720 / 760 px/s |
| `PLAYER_MAX_JUMPS` | 2 |
| `PLAYER_BOUNCE_VELOCITY` | 1150 px/s (bounce pad) |
| `GAP_FALL_DAMAGE` | 15 |
| `HAZARD_DAMAGE` | 10 per throttled tick |
| `CRUMBLE_DELAY_MS` | 620 ms grace before a crumbling tile drops |
| `MAX_ELEMENT_LEVEL` | 3 |

## Difficulty scale (`DIFFICULTY_SCALE`)

| Difficulty | enemyHp | enemySpeed | invincMs | weaponSlots |
|------------|---------|-----------|----------|-------------|
| normal | ×0.70 | ×0.75 | 1400 | 3 |
| hard | ×1.00 | ×1.00 | 800 | 3 |
| extreme | ×1.40 | ×1.25 | 500 | 2 |

The three tiers were renamed from easy/normal/hard one notch up in Phase 7; the gentle tuning is the
baseline "Normal". Slot keys: Z/X/C on keyboard (`SLOT_KEY_LABELS`), 1/2/3 on touch.

## Atoms, attacks & recipes (`ATTACKS`)

| Attack | Recipe | Slot | Cooldown (ms) | Tier names (Lv1 / Lv2 / Lv3) |
|--------|--------|------|---------------|------------------------------|
| Hydrogen | 1 H | 1 | 700 | Proton Punch / Plasma Arc / Fusion Burst |
| Oxygen | 1 O | 2 | 800 | Oxidize / Reactive Cloud / Oxidation Nova |
| Carbon | 1 C | 3 | 800 | Carbon Claw / Diamond Shard / Graphene Shockwave |
| Nitrogen | 1 N | 4 | 900 | Nitrogen Frost / Cryo Burst / Absolute Zero |
| Water | 2 H + 1 O | 5 | 1200 | Water Jet / Hydro Wave / Tidal Force |
| Ammonia | 1 N + 3 H | 6 | 1300 | Caustic Spray / Acid Cloud / Toxic Deluge |
| Carbon Dioxide | 1 C + 2 O | 7 | 1300 | Smog Pulse / Suffocation Field / Blackout |
| Methane | 1 C + 4 H | 8 | 1100 | Gas Ignite / Chain Blast / Fireball |
| Nitric Oxide | 1 N + 1 O | 9 | (2× buff duration) | Radical Rush / Reactive Aura / Overclock |
| Carbonic Acid | 2 H + 1 C + 3 O | 10 | 1800 | Acid Drop / Corrosive Spray / Acid Rain |
| Prismatic Beam (super) | none (all 6 noble gases) | n/a | 5000 | Prismatic Beam (single tier) |

`ATTACK_ORDER` is derived by sorting on `slot` and **excludes** the Prismatic Beam (`SUPER_ATTACK_ID`),
which is gated by the noble-gas collection rather than an atom recipe. Gold is a wildcard pickup
(grants atoms, not an attack). See [combat-and-attacks.md](combat-and-attacks.md) for effects.

**Super weapon** — the Prismatic Beam: a permanent unlock earned by completing the noble-gas
collection. It is a normal-slot weapon (rides Z/X/C, bindable in Compound Selection), not a separate
ultimate key.

## Noble gases (`NOBLE_GASES`)

Six gases — helium, neon, argon, krypton, xenon, radon — each worth `NOBLE_GAS_BONUS = 500` and one
permanent collection slot (`NOBLE_GAS_COUNT = 6`). One is hidden per stages 1-2 … 3-3 (see
[stages-and-platforming.md](stages-and-platforming.md)).
