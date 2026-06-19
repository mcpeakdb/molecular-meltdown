# Molecular Meltdown — Development Plan

## Current State (v0.17 — latest shipped: Phase 11 Stage Passcodes; see per-phase sections below)

- **Front-end & QOL** (Phase 5): boots to a `TitleScene` main menu (Start / Stage Select / Molecule
  Tree / Leaderboard / Controls / Settings); `SettingsScene` + `Settings` system persist volume,
  mute, SFX, and screen-shake to `localStorage` (sound routes through a master gain, shakes honor the
  toggle); `LeaderboardScene` browses top-5 runs per difficulty; `HelpScene` shows controls;
  `MoleculeTreeScene` is a data-driven reference of every atom/compound recipe and its tier attacks.
  Procedural art pass adds per-sector decorative scenery, parallax props, and a vignette (still no
  external assets). Renamed **Molecule Mayhem → Molecular Meltdown**. Every menu/end screen has an
  exit back to the title (Difficulty ESC, Pause → QUIT TO TITLE, death screen ESC).
- **Hand-drawn art migration** (complete — see [GRAPHIC_MIGRATION_PLAN.md](GRAPHIC_MIGRATION_PLAN.md)):
  every in-scope sprite (player frames, M.E.G., all enemies, all bosses, all atoms, hit/projectile/
  particle FX) now loads as a hand-drawn PNG from `public/assets/sprites/` via the `ASSET_SPECS`
  manifest in `BootScene.preload()`, keyed and sized identically to the old procedural textures so no
  game code changed. The procedural `_makeXxx()` sprite generators and the `?exportTextures`/`migrated`
  migration scaffolding have been removed. Stage maps (`bg_tile`/`ground_tile`), the vignette, and
  runtime vector FX stay procedural by design.


- **9 stages across 3 sectors** (Petri Dish / Blood Agar / MacConkey), 3 stages each, plus the
  tutorial. Sector = `ceil(stage/3)` drives biome/theme; all level content is data-driven in
  [../src/stages.ts](../src/stages.ts) (`STAGES[9]`), consumed by `GameScene`.
- **Progression & meta** (Phase 4): `StageSelectScene` with per-stage sequential unlocks + best
  scores; `SaveSystem` persists unlocks / best scores / a top-5 leaderboard to `localStorage`, keyed
  per difficulty. Score is a **cumulative run total** (carried across stages, reset on death) with
  **time** + **no-hit** clear bonuses; death and completion show a run summary. Atom model is
  **arcade** (tree resets each stage).
- **Sector finales** (stages 3/6/9) are boss fights; the other six clear by reaching an **exit
  portal** that opens once all enemies are defeated. Banners: STAGE / SECTOR / EXPERIMENT COMPLETE.
- **7 enemy types**: bacterium, virus, dustbunny, pollen + new amoeba (tank), spore (fast hover),
  mite (crawler). **3 bosses**: Super Bacterium, Amoeba Titan, Phage Lord — one per sector.
- **2D side-view movement** (v0.21.0): real arcade gravity, a solid floor of static colliders with
  real holes for gaps, and physics-driven jumping (camera vertically locked — lane + ledges). The old
  2.5D depth band / fake `jumpOffset` is gone. `GROUND_TOP_Y` is the floor surface; `DEPTH` sorts by
  role, not Y. Stages place lots of `platforms` (`[xLeft, yTop, width]`) — climbable staircases,
  perches, and routes — to jump onto (v0.23.0 expanded these heavily).
- **Noble gases** (v0.23.0): one of each of the six (`NOBLE_GASES` in `constants.ts`) is hidden as a
  glowing gem on a high/guarded perch (`noble: { x, y, gas, guard? }` in `stages.ts`). Inert (no
  compounds) — collecting one is a +`NOBLE_GAS_BONUS` score bonus (`_collectNoble`) and a permanent
  find (`SaveSystem.markNobleFound`); the run summaries show the `n/6` collection.
- **Pits**: walk off a ledge or miss a jump and you fall; drop below the screen → fall damage +
  respawn on the last safe ledge (`_updatePitFall`, reusing `GAP_FALL_DAMAGE`).
- **Enemies**: ground types (bacterium/dustbunny/amoeba/mite) walk & rest on floor/ledges under
  gravity (hoppers real-jump); flyers (virus/spore/pollen) hover and chase the player's height; an
  enemy that falls into a pit dies. Bosses hover just above the floor so melee can reach them.
- **Platforming hazards** (v0.20.0, re-grounded in v0.21.0): data-driven optional `hazards` / `pads` /
  `crumble` fields in `stages.ts`, now surface objects on the real floor. **Hazard pools** (sector-
  tinted) sear the player on the ground unless jumped over (`_updateHazards`); **bounce pads** launch
  a high arc that keeps the air double-jump (`_updatePads` → `Player.superJump`); **crumbling tiles**
  plug a real hole that opens when they collapse (`_updateCrumbles`). Sector 3 adds wide gaps cleared
  via a mid-gap stepping stone or a double-jump. Tuned as a gentle ramp (Sector 1 stays introductory)
- **10 attacks** — H, O, C, N + 6 molecules, each restyled to its atom color
- **Molecular tree**: every atom pickup is a branching choice; compounds use real stoichiometry
  (H₂O = 2H+1O, etc.); level = complete recipe copies. Sectors ramp the atom supply (4 → 6 → 9)
- **Numpad arsenal**: owned atoms unlock multiple simultaneous attacks on `1–9`/`0` (number-row
  mirrors), each with its own cooldown; slot `1` is the basic punch until you unlock an attack;
  HUD shows atom badges + a numpad attack bar
- All graphics procedural (no external assets) · **Phaser 4.1.0**
- **Tutorial**: M.E.G.-guided training sector on boot — story setup (you've been shrunk), one element,
  one bad guy, one gap, with proximity tips; ESC to skip
- **Jump**: velocity-based arc with double jump (front-roll on the second leap); a clean leap over an enemy dodges its contact attack (timing dodge, not blanket airborne immunity)

See [PLAN_PHASE6.md](PLAN_PHASE6.md) and [tasks/PHASE6_TASKS.md](tasks/PHASE6_TASKS.md) for details.

### Added in Phase 1

- Procedural sound effects (Web Audio API) — punch, collect, upgrade fanfare, boss roar, death
- Procedural background music (`MusicSystem`, Web Audio look-ahead sequencer) — title/menu theme, one
  track per sector, and a boss theme; toggled via the Music setting (v0.25.0)
- Particle bursts on atom collection (element-colored)
- Player walk animation (3-frame procedural cycle)
- Enemy & boss hit stagger (freeze + scale squish + delayed knockback)
- Combo counter with damage multiplier (every 5 hits = +×0.5, shown in HUD)
- Stage intro letterbox sequence
- Death screen with score display and retry
- Score tracker (per-enemy kill values, live HUD display)
- Per-stage germ counter (killed / total / remaining, shown in HUD; v0.24.2)
- **Player jumping** (Space — arc with ground shadow, natural invulnerability while airborne)

### Added in Phase 2

- **Carbon (C)** — Carbon Claw (bleed DOT), Diamond Shard (piercing bolt), Graphene Shockwave (ground crack AOE)
- **Nitrogen (N)** — Nitrogen Frost (freeze melee), Cryo Burst (freeze AOE), Absolute Zero (freeze all on screen)
- **Ammonia (NH₃)** combo — Caustic Spray / Acid Cloud / Toxic Deluge (DOT + slow chains)
- **Carbon Dioxide (CO₂)** combo — Smog Pulse / Suffocation Field / Blackout (camera fog + AOE)
- **Methane (CH₄)** combo — Gas Ignite / Chain Blast / Fireball (detonating projectile, chain explosions at lv2)
- **Nitric Oxide (NO)** combo — Radical Rush / Reactive Aura / Overclock (speed boost ×1.5–2.0, pulsing aura damage)
- **Carbonic Acid (H₂CO₃)** combo — Acid Drop / Corrosive Spray / Acid Rain (targeted falling drops + bleed)
- Bleed DOT system on Enemy (`applyBleed()`, ticks every 400 ms, red flash)
- Piercing projectile (`piercing` flag on `ProjectileSprite`, `spawnPiercingProjectile()`)
- Carbon and Nitrogen atom textures (procedural, added to `_makeAtoms()`)
- Mystery atom choices updated to offer C and N in Stage 1
- `ElementChoiceScene` updated with descriptions + `ELEMENT_SYMBOLS` lookup for all 10 elements
- HP always rounded to whole numbers across all entities

---

## Phase 3 — Distinct Sector Content

Three sectors already ship (Sector 1 nutrient agar, Sector 2 blood agar, Sector 3 MacConkey agar),
but they currently **reskin the same four enemies** (bacterium / virus / dustbunny / pollen) and a
per-sector scaled **Super Bacterium** boss. This phase gives each sector its own identity: unique
enemies, unique bosses, and a stage mechanic.

> Atom availability per sector is now handled by the Phase 6 molecular tree (authored atom-choice
> nodes in `_spawnStage()`), not by "introducing" one specific atom per stage.

### Sector 2 — Blood Agar

- New enemies:
  - **Red Blood Cell** — slow, high HP, rams the player
  - **White Blood Cell** — aggressive chaser, calls for backup (spawns smaller enemies)
  - **Platelet** — fast, low HP, sticks to the player and slows movement
- Boss: **Giant White Blood Cell** — summons minion waves between phases
- Mechanic: a current pushes the player back slowly (must keep advancing right)

### Sector 3 — MacConkey / Lung Cavity

- New enemies:
  - **Pollen Cluster** — splits into 3 smaller pollens on death
  - **Allergen Spore** — explodes on death dealing AOE damage
  - **Mold Filament** — long thin enemy that whips
- Boss: **Mega Allergen** — periodic screen-wide sneeze spray
- Mechanic: air pockets that briefly boost jump height / speed (jump + double-jump now exist)

### Sector 4 — Cell Nucleus (new, final)

- Highest difficulty; all prior enemy types + upgraded variants (bigger, faster, more HP)
- Boss: **DNA Strand Guardian** — two-phase: strand form (dodge attack gaps) + core form (radial attacks)
- Wire a 4th sector into the `currentStage` flow, themes, and `_spawnStage()` configs

---

## Phase 4 — Progression & Meta ✅ COMPLETE (v0.10.0)

Shipped 2026-06-06. Decisions: **arcade** atom model, **per-stage** unlocks, records **per
difficulty**. Work breakdown in [tasks/PHASE4_TASKS.md](tasks/PHASE4_TASKS.md).

- [x] **Stage select screen** (`StageSelectScene`) — 9 stages grouped by sector, sequential per-stage
      unlocks, best score per stage shown
- [x] **Atom persistence** — resolved as **arcade** (tree resets each stage); no carry. Closes the
      Phase 6 deferred follow-up.
- [x] **Score system** — per-enemy kills + combo (Phase 1) now plus a cumulative run score with
      **time bonus** and **no-hit bonus** on clear
- [x] **Leaderboard** (local) — `SaveSystem` stores top 5 runs per difficulty with the atom/molecule
      path (`localStorage` `mm.save.v1`)
- [x] **Run summary** — death + EXPERIMENT COMPLETE show molecules assembled, atom path, stage
      reached, score, and leaderboard placement

---

## Phase 5 — Content & QOL ✅ COMPLETE (v0.11.0)

Front-end & QOL pass, shipped 2026-06-06. Work breakdown in [tasks/PHASE5_TASKS.md](tasks/PHASE5_TASKS.md).

- [x] **Difficulty modes** — Easy / Normal / Hard (`DifficultyScene`, scales enemy HP/speed + i-frames) — v0.4.0
- [x] **Pause menu** — in-game pause (ESC/Enter) with resume / restart / quit (`PauseScene`) — v0.4.0
- [x] **Title screen + menu** (`TitleScene`) — Start / Stage Select / Leaderboard / Controls / Settings
- [x] **Settings** (`SettingsScene` + `Settings`) — volume, mute, SFX, screen-shake, persisted
- [x] **Leaderboard viewer** (`LeaderboardScene`) + **Controls screen** (`HelpScene`)
- [x] **Procedural art pass** — per-sector decorative scenery, parallax props, vignette (no external assets)
- [ ] **Mobile/gamepad support** — deferred (Phaser gamepad API, on-screen buttons)
- [~] **Sprite art pass / Tilemap stages** — the external-asset items; reinterpreted as the procedural
      art/terrain pass to keep the no-external-assets rule. Literal external-asset versions not pursued.

---

## Phase 6 — Molecular Tree & Numpad Arsenal ✅ COMPLETE (v0.6.0)

Combat/progression overhaul, shipped 2026-06-04: every atom pickup is a branching choice (a molecular
*tree*), owning atoms unlocks **multiple simultaneous attacks** bound to the numpad (up to 10, with
real stoichiometry — H₂O = 2H+1O, etc.), each special restyled to its atom color, plus a numpad/HUD
arsenal and choice-overlay tree feedback. Full design in [PLAN_PHASE6.md](PLAN_PHASE6.md); work
breakdown in [tasks/PHASE6_TASKS.md](tasks/PHASE6_TASKS.md).

Deferred follow-ups (also folded into Phase 4): atom persistence across sectors; choice-overlay
progress hints toward locked compounds.

---

## Phase 11 — Stage Passcodes ✅ COMPLETE (v0.16.0)

Shipped 2026-06-07. Adds classic arcade unlock codes so progress can be resumed without replaying.

- **`Passcode` system** ([../src/systems/Passcode.ts](../src/systems/Passcode.ts)): codes are derived,
  not stored — `passcodeFor(stage, difficulty)` is an FNV-1a hash of `difficulty|stage|salt` reduced to
  a 6-digit string; `resolvePasscode(code, difficulty)` scans stages 2..`STAGE_COUNT` for a match.
  Codes are per-difficulty; stage 1 has none (always unlocked). All 24 codes verified collision-free.
- **`SaveSystem.unlockUpToStage(difficulty, stage)`** sets `unlockedStage = max(current, stage)`,
  mirroring `markStageCleared`; unlocks persist through the existing `localStorage` save.
- **Stage Select entry** ([../src/scenes/StageSelectScene.ts](../src/scenes/StageSelectScene.ts)):
  the **P** key or a tappable **⌨ ENTER CODE** button opens an in-scene numpad modal (no new scene,
  no DOM input). It accepts taps and physical keys (digits, Backspace, Enter=submit, Esc=cancel),
  flashes/shakes on an invalid code, and `scene.restart()`s on success to refresh the grid.
  Every unlocked stage past the first shows its `Code ######` on the card.

## Phase 10 — Mobile / Touch Support ✅ COMPLETE (v0.15.0)

Shipped 2026-06-06. Makes the game fully playable by touch alongside the keyboard.

- **Attacks rebound to Z / X / C** (weapon slots 1-3) via `SLOT_KEY_LABELS` in
  [../src/constants.ts](../src/constants.ts); `GameScene._setupInput` binds those keys, and the HUD
  chips render the letters. Z is the basic punch when slot 1 is empty.
- **`TouchControls` system** ([../src/systems/TouchControls.ts](../src/systems/TouchControls.ts)):
  a floating left-half thumbstick (analog `moveX`/`moveY`), a right-thumb cluster of **Z/X/C attack
  buttons** (colour/cooldown synced from the HUD via `setAttackSlot`), a jump (⤒) button, and a pause
  (❚❚) button parked clear of the attacks. Hosted by `HUDScene`; multi-touch enabled. Polled each
  frame by `GameScene.update` and merged into the player via the optional `InputKeys.touch`
  (`Player.update` reads stick + jump/slot edges).
- **Tappable HUD weapon chips** queue a slot fire through the same path as a key press; the on-screen
  pause button routes through a `request-pause` event into the shared `GameScene._openPause()`.
  Controls auto-hide during intros/pause via `TouchControls.setEnabled`, which also disables the
  movement zone's hit-testing so it doesn't swallow taps meant for other handlers.
- **Tap to advance dialogue**: `GameScene._say` listens for `pointerdown` (alongside Space/Z) so
  M.E.G.'s blocking tutorial/story boxes advance by tap — essential on touch devices.
- **`Settings.touchControls`** (`auto` | `on` | `off`, default `auto`) with `Settings.touchActive()`
  resolving `auto` against `isTouchDevice()`. New Touch Controls row in `SettingsScene`.
- **All menus tappable** via the shared `attachTap` helper
  ([../src/systems/touchMenu.ts](../src/systems/touchMenu.ts)) — Title, Difficulty, Stage Select
  (+ ‹ BACK / LEADERBOARD ›), Leaderboard, Settings, Help, Pause + Compound Selection, and the
  element picker. Card menus use tap-to-select → tap-again-to-confirm.
- **`index.html`** viewport hardened for mobile (no pinch/double-tap zoom, `touch-action: none`).
- **Scaling/centering**: the canvas (Phaser `Scale.FIT` + `CENTER_BOTH`) now centers correctly on
  every aspect ratio — the body no longer also flex-centers it (that double-offset letterboxed
  builds). Uses `100dvh` so the mobile address bar doesn't shrink the game, plus a CSS-only
  `#rotate-hint` overlay (`@media (orientation: portrait) and (pointer: coarse)`) prompting phones
  to rotate to landscape.

## Phase 9 — Stationary Boss Duels ✅ COMPLETE (v0.14.0)

Shipped 2026-06-06. Bosses no longer chase the player; they enter the arena, hold station, and use
telegraphed attack patterns to dodge while the player whittles their HP. The camera locks to a
single screen-wide arena on activation (`GameScene._lockBossArena`). See
[../src/entities/Boss.ts](../src/entities/Boss.ts) (hover + `volley`/`radial`/`barrage`/`sweep`).

## Phase 8 — Weapon Loadouts & Compound Selection ✅ COMPLETE (v0.13.0)

Shipped 2026-06-06. Replaces the "auto-wield your strongest" arsenal with a player-chosen loadout.

- **Bindable slots per difficulty**: `DifficultyScale.weaponSlots` (Normal/Hard = 3, Extreme = 2)
  drives `ElementSystem.setSlotCount`. The old `simplifiedArsenal` flag is gone.
- **`ElementSystem` loadout model**: tracks `bindings: (AttackId | null)[]` plus a `known` set.
  `reconcileBindings()` (called once after each atom pickup) auto-fills empty slots with
  newly-unlocked weapons and reports `overflow` when the loadout is full. `getBindings` / `setBinding`
  expose the loadout; firing & the HUD read bindings (not "available, sliced").
- **Compound Selection menu**: a sub-mode inside `PauseScene` (←/→ cycle compound, ↑/↓ pick key, Esc
  back), duplicate-free across slots, emitting `arsenal-update` so the HUD reflects edits live.
- **M.E.G. coaching**: on the first `overflow`, `GameScene._say(_compoundIntroLines())` explains the
  menu once (gated by `Settings.compoundIntroSeen`). `_say` now lazy-builds the dialogue UI so it
  works outside the tutorial.
- HUD `arsenal-update` payload changed from `attacks[]` to per-slot `slots: (ArsenalEntry|null)[]`.

## Phase 7 — Difficulty Rework, Gold Wildcard & Element Facts ✅ COMPLETE (v0.12.0)

Shipped 2026-06-06. A QOL + content pass with four independent features. Work breakdown in
[tasks/PHASE7_TASKS.md](tasks/PHASE7_TASKS.md).

### 1. Element facts on the choice screen

Each card in `ElementChoiceScene` shows one randomly-chosen fact about its element at the bottom of
the button. Facts come from a new authored pool keyed by element.

- New `ELEMENT_FACTS: Partial<Record<ElementType, string[]>>` data (in `src/constants.ts` or a new
  `src/facts.ts`); several facts per base atom **and** per compound, plus Gold.
- `ElementChoiceScene._buildCard()` picks one fact at random and renders it in a dedicated footer
  zone (small, dim, word-wrapped). Card height / internal layout adjusted so the fact never collides
  with the "UNLOCKS / LEVELS" list.
- Picked per card build (i.e. fresh each time the overlay opens), not per frame.

### 2. Easy-mode simplification — single strongest weapon

On the easiest tier the player no longer carries the whole numpad arsenal. Instead they wield **only
the single most-advanced available attack**, bound to key `1`. This keeps the easiest mode a
one-button experience.

- Drive it from data, not a hardcoded difficulty string: add `simplifiedArsenal: boolean` to the
  `DIFFICULTY_SCALE` entries (true only on the easiest tier).
- `ElementSystem.getAvailableAttacks()` (or a new `getSimplifiedArsenal()`) returns just
  `[getPrimary()]` numbered as key `1` when the flag is set. `Player._fireSlot` / HUD already render
  whatever the arsenal reports, so the numpad bar collapses to one slot automatically.
- The molecular tree still grows normally underneath (atom counts accumulate); only what's *bound and
  shown* is reduced to the strongest attack.

### 3. Difficulty rename — Normal / Hard / Extreme

Drop the "Easy" label. The three existing tiers shift up one notch: the current Easy tuning becomes
**Normal** (and gains the single-weapon simplification above), current Normal becomes **Hard**, and
current Hard becomes **Extreme**.

- Rename the `Difficulty` union to `'normal' | 'hard' | 'extreme'` and re-key `DIFFICULTY_SCALE`,
  carrying the existing numbers forward: normal = old easy (×0.70 / ×0.75 / 1.4s, `simplifiedArsenal`),
  hard = old normal (×1.00 / ×1.00 / 0.8s), extreme = old hard (×1.40 / ×1.25 / 0.5s).
- Update every consumer: `DifficultyScene` (labels/colors/descriptions), `SaveSystem`
  (`DIFFICULTIES`, `emptySave`), `LeaderboardScene` (`DIFFS`, `DIFF_COLOR`), `StageSelectScene`,
  `TitleScene` default, `GameScene` tutorial default (`'easy'` → `'normal'`).
- **Save migration:** records are keyed by difficulty string in `localStorage` (`mm.save.v1`). Bump
  to `mm.save.v2` and migrate old `easy/normal/hard` slots into `normal/hard/extreme` on load (best
  effort; tolerate absence), so existing unlocks/leaderboards survive the relabel.

### 4. Gold — the 1% wildcard atom

A new rare collectible. Gold is **not** an attack and not a base atom; it's a wildcard that lets the
player pick any base element and grants it **+2** (worth two level-ups toward that element).

- Add `GOLD` to `ELEMENTS`, `ELEMENT_COLORS` (`0xffd700`), `ELEMENT_NAMES`. It stays out of `ATTACKS`
  / `BaseAtom` / `ATTACK_ORDER` (it has no special of its own).
- Spawn: when `GameScene._spawnStage()` creates an atom node, a **1% roll** makes it a Gold node
  instead. `Atom` gains a `gold` flag; `BootScene` gets a distinct shimmering gold `atom_gold` texture.
- Collect: opens a Gold variant of the choice overlay — pick one of the four base atoms; on confirm,
  `ElementSystem.collectAtom(chosen)` is applied **twice** (+2 count). Distinct fanfare + gold
  particle burst.
- The Gold overlay shows the +2 framing and each base atom's fact; reuse `ElementChoiceScene` with a
  `gold: true` / `grant: 2` mode rather than a second scene.

> **Locked decisions:**
> - **Gold scope:** the player chooses among the **four base atoms** and receives **+2** to that
>   atom's count. Compounds are excluded (their levels are derived from atom counts, so a base-atom
>   +2 is the clean, representable fit).
> - **Difficulty:** rename the internal `Difficulty` keys to `normal/hard/extreme` and migrate the
>   save (`mm.save.v1` → `mm.save.v2`), rather than keeping the old keys and only relabeling the UI.

---

## Architecture Notes for Future Work

**Adding a new enemy type:**

1. Add config entry in `Enemy.ts` `CONFIGS` object
2. Add texture generation in `BootScene._makeEnemyTextures()` (or new method)
3. Add to `GameScene._spawnStage()` `enemyDefs` array

**Adding a new element / molecule** (see [CLAUDE.md](../CLAUDE.md) for the full version):

1. Add to `ELEMENTS` / `ELEMENT_COLORS` / `ELEMENT_NAMES` in `constants.ts`
2. Add an `ATTACKS` registry entry (`recipe`, `slot`, `color`, `tierNames`, `cooldownMs`) in `constants.ts`
3. Add a `_specialXxx()` method + a `_dispatchAttack()` branch in `Player.ts`
4. Add the symbol to `ATTACK_SYMBOL` (HUD) and `ELEMENT_SYMBOLS` (`ElementChoiceScene`)
5. For a new base atom: extend `BaseAtom`/`BASE_ATOMS`, add its texture, and author it into `_spawnStage()` choices

**Adding a new stage:**

- Copy `GameScene._spawnStage()` pattern into a `StageData` config file (array of stages)
- `GameScene` reads the active stage index and loads the appropriate config
