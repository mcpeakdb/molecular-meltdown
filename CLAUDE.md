# Molecular Meltdown — CLAUDE.md

## Project Overview

A molecular-scale beat 'em up browser game built with **Phaser 4.1.0** and **TypeScript**. The player
is a mad scientist fighting through microscopic environments across **18 stages (6 sectors × 3)**.

**Art**: sprites are PNG assets under [public/assets/sprites/](public/assets/sprites/) (see the
[README](public/assets/sprites/README.md) there). Most are hand-drawn; the lab-floor creatures/bosses
and the pickup drops are rasterized by `scripts/gen-sprites.mjs`. Stage tiles, the vignette, and all
in-game FX are still drawn procedurally. **Audio is 100% procedural** (Web Audio) — no audio files;
that remains a hard constraint.

## Tech Stack

| Tool | Purpose |
|------|---------|
| Phaser 4.1.0 | Game framework |
| TypeScript 6 | Language |
| Vite 8 | Dev server & bundler (rolldown-powered) |
| Biome | Linting + formatting |
| Husky | Pre-commit hooks |
| GitHub Actions | Builds + deploys `dist/` to GitHub Pages on push to `main` (`.github/workflows/deploy.yml`) |

## Dev Commands

```bash
npm run dev          # start Vite dev server (localhost:5173)
npm run build        # production build → dist/
npm run preview      # preview the dist build
npm run lint         # biome check src/ (read-only)
npm run lint:fix     # biome check --write src/
npm run typecheck    # tsc --noEmit
npm run gen:sprites  # regenerate the script-drawn PNGs → public/assets/sprites/
npm run levels       # level-design tool: solve reachability for all stages →
                     # docs/level-maps.html (open in a browser) + a warning report to stdout
```

Pre-commit hook runs `biome check --fix` and `tsc --noEmit` automatically on every commit.

## Level-design tooling

`npm run levels` (`tools/level-map.ts`) reads the real `STAGES` data — including the
clusters/summit/noble enrichment loops in [src/stages.ts](src/stages.ts) — and solves what the player
can actually reach using the game's real jump physics (single/double jump, bounce pads, full air
control). It writes an interactive SVG map of every stage to `docs/level-maps.html` (colour-coded
reachable/unreachable ledges, jump arcs, rewards, hazards, enemies, with layer toggles) and prints a
per-stage validation report: unreachable ledges, unreachable/mis-placed rewards (e.g. an atom floating
inside a gap), and wide gaps that exceed a flat double-jump with no stepping stone to bridge them (the
checks are tuned to flag real defects only, not intentional footing). It also does **pacing analysis** — a
threat-weighted density strip under each map (threat per 250px, normalized across all stages), plus
metrics per stage: total threat, CV (uniformity — low = monotone), ramp (does pressure build toward
the finale?), longest breather, and dead stretches. Threat weights mirror `Enemy` CONFIGS via a
transparent formula (tune the `W_*` constants). The reachability model is deliberately
**conservative** (it under-counts multi-jump hang time, so it never claims reachable when the game
can't). Not part of the game build; run it after editing stage geometry to check intent survived.
The tool loads the TS source via a small extensionless-import resolver (`tools/ts-hooks.mjs`).

## Source Layout

```
src/
  main.ts                  # Phaser game config + scene list (+ touch fullscreen-on-first-tap)
  constants.ts             # ELEMENTS, ATTACKS registry, sectors, drops/coins/nobles, damage & tuning
  types.ts                 # Shared TypeScript types (input, arsenal, sprite refs)
  stages.ts                # STAGES[18] — data-driven config for all 18 stages (6 sectors × 3)
  spriteFit.ts             # fitHeightScale() — render art at a target on-screen height, any source res
  entities/
    Player.ts              # Movement, attack, 26 specials, combo, armor/heal, death
    Enemy.ts               # Enemy AI, takeDamage, bleed DOT, death (10 types), art variants
    Boss.ts                # Boss variants (6), phases, projectiles, activation
    Atom.ts                # Collectible atom / noble gem / gold + platinum wildcard sprite
  scenes/
    BootScene.ts           # ASSET_SPECS PNG manifest + preload; procedural stage tiles & vignette
    TitleScene.ts          # Main menu (Start / Periodic Table / Leaderboard / Controls / Settings)
    GameScene.ts           # Main game loop, spawning, physics, overlaps, scoring, M.E.G. tutorial
    HUDScene.ts            # Score, HP/armor, lives, atom counts, weapon slots, combo (parallel scene)
    ElementChoiceScene.ts  # Level-up choice overlay (atom node → pick a branch)
    DifficultyScene.ts     # Normal/Hard/Extreme select (flask + burner art) → StageSelectScene
    StageSelectScene.ts    # Coverflow test-tube rack; per-stage unlocks, best scores, passcode entry
    LeaderboardScene.ts    # Top-5 runs per difficulty
    SettingsScene.ts       # Volume / mute / SFX / music / screen-shake / touch / fullscreen
    HelpScene.ts           # Controls reference (touch- or keyboard-specific)
    MoleculeTreeScene.ts   # Periodic-table reference screen (atoms, nobles, drops, compounds)
    PauseScene.ts          # In-game pause menu + Compound Selection loadout sub-menu
  systems/
    ElementSystem.ts       # Atom counts → available attacks, levels, weapon-slot bindings, super
    SoundSystem.ts         # Procedural Web Audio SFX (settings-aware master gain)
    MusicSystem.ts         # Procedural Web Audio music — look-ahead sequencer, 8 tracks (title/6 sectors/boss)
    SaveSystem.ts          # localStorage meta: unlocks, best scores, leaderboard (per difficulty, v2 + v1 migration)
    Settings.ts            # localStorage prefs: volume, mute, sfx, music, screenShake, touch, fullscreen, tutorial flags
    Passcode.ts            # Derived 6-digit per-difficulty stage unlock codes (FNV-1a hash, no table)
    TouchControls.ts       # Floating thumbstick + jump/attack/pause buttons for touch devices
    touchMenu.ts           # Shared menu helpers: Meg-avatar cursor, punch-confirm, attachTap
scripts/
  gen-sprites.mjs          # Zero-dep rasterizer: Phaser-style draw calls → PNG assets (npm run gen:sprites)
public/assets/sprites/     # All sprite PNGs, by folder (player/npc/enemies/bosses/atoms/fx) + README
tools/
  level-map.ts             # Reachability + pacing validator (npm run levels)
  ts-hooks.mjs             # Node loader hooks so the tool can import the TS source directly
docs/
  specs/                   # EARS behavioural specs (what the game does), per subsystem — the living
                           # reference; read these first to understand a system, keep in sync on change
    README.md              # Index + EARS conventions; start here
    glossary.md            # Shared terms, key constants, world geometry
    navigation-and-scenes.md, player.md, combat-and-attacks.md, enemies-and-bosses.md,
    stages-and-platforming.md, elements-and-progression.md, scoring-and-persistence.md,
    hud-and-input.md, audio-and-settings.md, tutorial.md
  PATCH_NOTES.md           # Version history (must stay current)
  level-maps.html          # Generated by npm run levels (not hand-edited)
```

## After Making Changes

After completing any meaningful change or feature:

1. **If behaviour changed**, update the affected [docs/specs/](docs/specs/) file(s) so the EARS specs stay true to the code — they are the living reference and are descriptive, not aspirational.
2. **If the version in [package.json](package.json) changed**, update [docs/PATCH_NOTES.md](docs/PATCH_NOTES.md) with a new entry for that version describing what changed.

## Versioning

Version lives in `package.json` → `"version"`. Use semantic versioning:

- **patch** (0.38.1 → 0.38.2) — bug fixes, minor tweaks
- **minor** (0.38.x → 0.39.0) — new gameplay features, new elements, new stages
- **major** (0.x → 1.0.0) — content-complete, shippable milestone

Whenever the version is bumped, add a new entry to [docs/PATCH_NOTES.md](docs/PATCH_NOTES.md) before committing.

## Architecture Reference

### Sectors & stages

- The game is **18 stages = 6 sectors × 3**. `currentStage` (1–`STAGE_COUNT`) is the unit of play;
  the sector (biome/theme) is derived by `sectorOf` in [src/constants.ts](src/constants.ts), with
  `substageOf` / `isFinaleStage` alongside it. The 3rd stage of each sector is a boss finale; the
  other two clear by reaching `exitX`.
- Sectors 1–3 are the dishes (PETRI DISH, BLOOD AGAR, MACCONKEY); sectors 4–6 are the lab floor
  (LAB FLOOR, UNDER THE BENCH, THE WASTE BIN) and share a biome.
- All stage content lives in [src/stages.ts](src/stages.ts) as `STAGES[18]` (`StageDef`): per-stage
  `name`, `width`, optional `rise` (climbable sky), `atoms`, `enemies`, `gaps`, `platforms`,
  `hazards`, `pads`, `crumble`, and either `boss` or `exitX`. Stages may also start and/or finish off
  the floor: `spawn: { x, y }` sets the player down on a ledge, and `exitY` stands the exit portal on
  one (a raised exit is only cleared from at-or-above its footing, never from the ground below).
  Vertical geometry is built from `spire()` / `descent()` / `skybridge()`, which keep every step
  inside the real jump budget (single 144px rise, double 304px, bounce 734px). Enrichment loops at the bottom of the
  file place noble gems (`NOBLE_BY_STAGE`) and guarantee every summit carries a reward.
- Theme/art is keyed by sector: `SECTOR_THEMES` in `GameScene` and `bg_tile_${sector}` /
  `ground_tile_${sector}` procedural textures in `BootScene`.

### Difficulty & weapon slots

`DIFFICULTY_SCALE` in [src/constants.ts](src/constants.ts) defines **normal / hard / extreme**
(enemy HP, speed, i-frames, and `weaponSlots`). Attacks are bound to slots keyed **Z / X / C**
(numbered 1/2/3 on touch — see `slotKeyLabels`); Extreme grants only two slots. The player rebinds
compounds via Pause → **Compound Selection**. Runs carry `RUN_LIVES` lives.

### Adding a new element / molecule

Attacks are data-driven by the `ATTACKS` registry. Each element/compound is one attack with a
stoichiometric `recipe`; `ElementSystem` derives the level (= complete recipe copies, capped at
`MAX_ELEMENT_LEVEL`) and slot ordering from it.

1. Add to `ELEMENTS` and `ELEMENT_COLORS` / `ELEMENT_NAMES` in [src/constants.ts](src/constants.ts)
2. Add an `ATTACKS` entry in [src/constants.ts](src/constants.ts): `recipe` (atom→count), `slot`
   (priority/order), `color`, `tierNames` (Lv1–3), `cooldownMs`. `ATTACK_ORDER` derives automatically.
   For a brand-new **base atom**, also extend `BaseAtom` / `BASE_ATOMS`. Optionally add trivia to
   `ELEMENT_FACTS`.
3. Add a `_specialXxx()` method in [src/entities/Player.ts](src/entities/Player.ts) and a branch in
   `_dispatchAttack()`
4. Add the symbol to `ATTACK_SYMBOL` (and `ATOM_SYMBOL` for a new base atom) in
   [src/scenes/HUDScene.ts](src/scenes/HUDScene.ts), `ELEMENT_SYMBOLS` in
   [src/scenes/ElementChoiceScene.ts](src/scenes/ElementChoiceScene.ts), and
   `COMPOUND_SYMBOL` in [src/scenes/MoleculeTreeScene.ts](src/scenes/MoleculeTreeScene.ts)
5. For a new base atom: also give it `ATOM_SYMBOL` / `ATOMIC_NUMBER` / `ATOMIC_MASS` / `ATOM_POS`
   (+ `GAME_ELEMENTS`) entries in `MoleculeTreeScene`, a PNG (`atoms/atom_xxx.png`) registered in
   `ASSET_SPECS` in [src/scenes/BootScene.ts](src/scenes/BootScene.ts), and include it in the stage
   `choices` / `CLUSTER_ATOMS` tables in [src/stages.ts](src/stages.ts)

### Damage types & elemental affinity

Every attack deals exactly one `DamageType` (`ATTACK_TYPE` in [src/constants.ts](src/constants.ts)):
`impact`, `piercing`, `fire`, `cryo`, `acid`, `caustic`, `gas`, `explosive`, `energy`, or `pure`
(unresistable — the Prismatic super only). Each enemy type declares an `Affinity` in `AFFINITY`
([src/entities/Enemy.ts](src/entities/Enemy.ts)) and each boss variant in `BOSS_AFFINITY`
([src/entities/Boss.ts](src/entities/Boss.ts)): per-type multipliers, absent = 1.0, kept inside
0.5–1.9 so nothing is useless and nothing one-shots. `takeDamage(amount, type, ...)` scales the hit
and pops a floating **WEAK!** / **RESIST** cue (`GameScene.spawnAffinityCue`) — the only in-game
readout, by design.

The type is resolved once in `_dispatchAttack` and passed **as a parameter** into each `_specialXxx`,
so delayed effects (detonations, pools, rains, chains) keep the matchup they were fired with. It is a
required argument on `_damageArc` / `_damageRadius` / `_bleedInRadius` / `takeDamage` / `applyBleed`,
so the compiler catches any damage path that loses it.

### Adding a new enemy

1. Add the type to `EnemyType` and a config entry to `CONFIGS` in
   [src/entities/Enemy.ts](src/entities/Enemy.ts) (hover/hop/idle flair and any `ranged` profile go
   there too); add interchangeable art keys to `TEXTURE_VARIANTS` if it ships more than one look.
   Also give it an `AFFINITY` entry — a weakness or two and a resistance, reasoned from what it is
2. Add the PNG(s) under `public/assets/sprites/enemies/` and register each key in `ASSET_SPECS` in
   [src/scenes/BootScene.ts](src/scenes/BootScene.ts). If the art is script-drawn, add it to
   `scripts/gen-sprites.mjs` and re-run `npm run gen:sprites`
3. Reference the type from any stage's `enemies` list in [src/stages.ts](src/stages.ts); optionally
   add a score in `GameScene.onEnemyDeath()`

### Adding a new boss

1. Add the variant to `BossVariant` + `VARIANTS` in [src/entities/Boss.ts](src/entities/Boss.ts)
   (texture, name, stats, scale/body, projectile volley, tints), plus a `BOSS_AFFINITY` entry giving
   it an intended counter and something it shrugs off
2. Add its PNG under `public/assets/sprites/bosses/` and register the key in `ASSET_SPECS` in
   [src/scenes/BootScene.ts](src/scenes/BootScene.ts)
3. Set it as a stage finale via `boss: { variant, x }` in [src/stages.ts](src/stages.ts)

### Progression & pickups beyond atoms

- **Coins** (`COINS_PER_STAGE`) — score per pickup plus a full-collection bonus.
- **Heal drops** — Calcium / Zinc (`HEAL_DROPS`); **armor drop** — Iron (`ARMOR_DROPS`, capped at
  `PLAYER_MAX_ARMOR`). Neither opens an element choice.
- **Wildcards** — Gold (+1 to any atom) and the much rarer Platinum (+3).
- **Noble gases** — one hidden gem in the 2nd stage of each sector (`NOBLE_BY_STAGE`); collecting all six
  permanently arms the **Prismatic** super weapon (`SUPER_ATTACK_ID`). Noble progress is run-scoped.
- **Passcodes** — `Passcode.ts` derives a 6-digit code per (stage, difficulty); entering one in
  StageSelect unlocks every stage up to it. Bump `PASSCODE_SALT` to invalidate all shared codes.

### Input

`InputKeys` (in [src/types.ts](src/types.ts)) merges keyboard (cursors + WASD + slot keys) with an
optional per-frame `TouchInputState` from `TouchControls`, so gameplay code stays input-source
agnostic. `Settings.touchActive()` decides whether on-screen controls are shown; `HelpScene` and the
HUD/slot badges relabel themselves accordingly.
