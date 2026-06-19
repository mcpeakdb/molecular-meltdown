# Molecular Meltdown — CLAUDE.md

## Project Overview

A molecular-scale beat 'em up browser game built with **Phaser 4.1.0** and **TypeScript**. The player is a mad scientist fighting through microscopic environments. All graphics and audio are procedural — no external asset files.

## Tech Stack

| Tool | Purpose |
|------|---------|
| Phaser 4.1.0 | Game framework |
| TypeScript 6 | Language |
| Vite 8 | Dev server & bundler (rolldown-powered) |
| Biome | Linting + formatting |
| Husky | Pre-commit hooks |

## Dev Commands

```bash
npm run dev        # start Vite dev server (localhost:5173)
npm run build      # production build → dist/
npm run preview    # preview the dist build
npm run lint       # biome check (read-only)
npm run lint:fix   # biome check --write (auto-fix)
npm run typecheck  # tsc --noEmit
```

Pre-commit hook runs `biome check --fix` and `tsc --noEmit` automatically on every commit.

## Source Layout

```
src/
  main.ts                  # Phaser game config + scene list
  constants.ts             # ELEMENTS, colors, names, damage values, game constants
  types.ts                 # Shared TypeScript types
  stages.ts                # STAGES[9] — data-driven config for all 9 stages (3 sectors × 3)
  entities/
    Player.ts              # Player movement, attack, specials, combo, death
    Enemy.ts               # Enemy AI, takeDamage, bleed DOT, death (7 types incl. amoeba/spore/mite)
    Boss.ts                # Boss variants (bacterium/amoeba/phage), phases, projectiles, activation
    Atom.ts                # Collectible atom sprite
  scenes/
    BootScene.ts           # Procedural texture generation for all sprites → TitleScene
    TitleScene.ts          # Main menu (Start / Stage Select / Leaderboard / Controls / Settings)
    GameScene.ts           # Main game loop, spawning, physics, overlaps, scoring
    HUDScene.ts            # Score, HP, element, combo UI (runs in parallel)
    ElementChoiceScene.ts  # Level-up choice overlay
    DifficultyScene.ts     # Easy/Normal/Hard select → StageSelectScene
    StageSelectScene.ts    # Stage picker (9 stages by sector, per-stage unlocks, best scores)
    LeaderboardScene.ts    # Top-5 runs per difficulty
    SettingsScene.ts       # Volume / mute / SFX / screen-shake options
    HelpScene.ts           # Controls reference
    PauseScene.ts          # In-game pause menu + Compound Selection loadout sub-menu
  systems/
    ElementSystem.ts       # Atom counts → available attacks, level tracking, weapon-slot bindings
    SoundSystem.ts         # Procedural Web Audio SFX (routed through a settings-aware master gain)
    MusicSystem.ts         # Procedural Web Audio music — look-ahead step sequencer, 5 data-driven tracks
    SaveSystem.ts          # localStorage meta: unlocks, best scores, leaderboard (per difficulty)
    Settings.ts            # localStorage global prefs: volume, mute, sfx, music, screenShake, tutorialDone
docs/
  specs/                   # EARS behavioural specs (what the game does), per subsystem — the living
                           # reference; read these first to understand a system, keep in sync on change
    README.md              # Index + EARS conventions; start here
    glossary.md            # Shared terms, key constants, world geometry
    navigation-and-scenes.md, player.md, combat-and-attacks.md, enemies-and-bosses.md,
    stages-and-platforming.md, elements-and-progression.md, scoring-and-persistence.md,
    hud-and-input.md, audio-and-settings.md, tutorial.md
  PATCH_NOTES.md           # Version history (must stay current)
```

## After Making Changes

After completing any meaningful change or feature:

1. **If behaviour changed**, update the affected [docs/specs/](docs/specs/) file(s) so the EARS specs stay true to the code — they are the living reference and are descriptive, not aspirational.
2. **If the version in [package.json](package.json) changed**, update [docs/PATCH_NOTES.md](docs/PATCH_NOTES.md) with a new entry for that version describing what changed.

## Versioning

Version lives in `package.json` → `"version"`. Use semantic versioning:

- **patch** (0.2.1 → 0.2.2) — bug fixes, minor tweaks
- **minor** (0.2.x → 0.3.0) — new gameplay features, new elements, new stages
- **major** (0.x → 1.0.0) — content-complete, shippable milestone

Whenever the version is bumped, add a new entry to [docs/PATCH_NOTES.md](docs/PATCH_NOTES.md) before committing.

## Architecture Reference

### Adding a new element / molecule (Phase 6 molecular-tree model)

Attacks are data-driven by the `ATTACKS` registry. Each element/compound is one attack with a
stoichiometric `recipe`; `ElementSystem` derives the level (= complete recipe copies, capped at 3)
and the numpad slot ordering from it. There is no longer a `_resolve()` combo table or
`CHOICE_DESCRIPTIONS`.

1. Add to `ELEMENTS` and `ELEMENT_COLORS` / `ELEMENT_NAMES` in [src/constants.ts](src/constants.ts)
2. Add an `ATTACKS` entry in [src/constants.ts](src/constants.ts): `recipe` (atom→count), `slot`
   (priority/order), `color`, `tierNames` (Lv1–3), `cooldownMs`. `ATTACK_ORDER` derives automatically.
   For a brand-new **base atom**, also extend `BaseAtom` / `BASE_ATOMS`.
3. Add a `_specialXxx()` method in [src/entities/Player.ts](src/entities/Player.ts) and a branch in
   `_dispatchAttack()`
4. Add the symbol to `ATTACK_SYMBOL` (and `ATOM_SYMBOL` for a new base atom) in
   [src/scenes/HUDScene.ts](src/scenes/HUDScene.ts) and `ELEMENT_SYMBOLS` in
   [src/scenes/ElementChoiceScene.ts](src/scenes/ElementChoiceScene.ts)
5. For a new base atom: add its texture in [src/scenes/BootScene.ts](src/scenes/BootScene.ts) and
   include it in `GameScene._spawnStage()` `atomDefs` choices

### Adding a new enemy

1. Add the type to `EnemyType` and a config entry to `CONFIGS` in
   [src/entities/Enemy.ts](src/entities/Enemy.ts) (wire any hover/hop/idle flair there too)
2. Add a procedural texture method in [src/scenes/BootScene.ts](src/scenes/BootScene.ts) and call it in
   `create()`
3. Reference the type from any stage's `enemies` list in [src/stages.ts](src/stages.ts); optionally add a
   score in `GameScene.onEnemyDeath()`

### Adding a new boss

1. Add the variant to `BossVariant` + `VARIANTS` in [src/entities/Boss.ts](src/entities/Boss.ts)
   (texture, name, stats, scale/body, projectile volley, tints)
2. Add its procedural texture in [src/scenes/BootScene.ts](src/scenes/BootScene.ts)
3. Set it as a stage finale via `boss: { variant, x }` in [src/stages.ts](src/stages.ts)

### Sectors & stages

- The game is **9 stages = 3 sectors × 3 stages**. `currentStage` (1–9) is the unit of play; the
  sector (biome/theme) is derived as `ceil(stage/3)` (`sectorOf` in
  [src/constants.ts](src/constants.ts)). The 3rd stage of each sector is a boss finale.
- All stage content lives in [src/stages.ts](src/stages.ts) as `STAGES[9]` (`StageDef`): per-stage
  `name`, `width`, `atoms`, `enemies`, `gaps`, and either `boss` (finale) or `exitX` (reach-the-exit
  clear). `GameScene` reads `STAGES[currentStage - 1]` — to add/retune a stage, edit that array.
- Theme/art is keyed by sector: `SECTOR_THEMES` in `GameScene` and `bg_tile_${sector}` /
  `ground_tile_${sector}` textures in `BootScene`.
