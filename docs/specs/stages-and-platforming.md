# Stages & Platforming

Stage data model, world building, platforming hazards, the exit-clear flow, and the boss arena.
Sources: [`src/stages.ts`](../../src/stages.ts), [`src/scenes/GameScene.ts`](../../src/scenes/GameScene.ts).

## Stage data model

- **REQ-STAGE-001** — The game shall consist of `STAGES[9]` (`StageDef`), one per stage; `GameScene`
  shall read `STAGES[currentStage - 1]` and build the level from it.
- **REQ-STAGE-002** — A `StageDef` shall carry: `name`, `width`, `atoms` (choice nodes, optionally
  perched at `y`), `enemies`, `gaps`, and optionally `rise` (climbable sky height), `platforms`,
  `hazards`, `pads`, `crumble`, `noble`, and either `boss` (finale) or `exitX` (reach-the-exit clear).
  `boss` and `exitX` are mutually exclusive.
- **REQ-STAGE-003** — Theme/art shall be keyed by sector (not per-stage): `SECTOR_THEMES` colours and
  the `bg_tile_${sector}` / `ground_tile_${sector}` textures. All three stages of a sector share a
  biome.
- **REQ-STAGE-004** — The 3rd stage of each sector shall be a boss finale (`boss` set); the other six
  shall clear via `exitX`.

## World construction

- **REQ-WORLD-001** — `GameScene` shall set physics-world bounds taller than the viewport (so the
  player can fall into pits below the floor).
- **REQ-WORLD-001a** — WHERE a stage sets `rise > 0`, the camera and world bounds shall extend that
  many px **above** the standard screen (into negative y, the floor staying at `GROUND_TOP_Y`), and
  the camera shall follow the player vertically up into that climbable space (a free 2-axis camera).
  WHERE `rise` is omitted/0, the camera bounds stay one screen tall, leaving the camera vertically
  locked as before. The camera never scrolls below the standard screen (pits remain off-bottom).
- **REQ-WORLD-001b** — The parallax background shall extend to cover the climbable sky when `rise > 0`.
- **REQ-WORLD-002** — The floor shall be built as solid static colliders spanning every gap-free
  range, with real holes at each gap and crumble range (`_buildFloorColliders`); ledge platforms
  shall be added as visible solid colliders the player can jump onto.
- **REQ-WORLD-003** — The world shall render parallax background tiles, per-sector decorative scenery
  and horizon props, a ground line with tick marks, and a screen-fixed vignette.
- **REQ-WORLD-004** — The camera shall follow the player smoothly within the world bounds.

## Spawning

- **REQ-SPAWN-001** — Each stage atom shall spawn as a choice node (see
  [elements-and-progression.md](elements-and-progression.md)); a rare 1% roll shall turn a node into a
  Gold wildcard (any base atom, +2).
- **REQ-SPAWN-002** — Enemies shall spawn at their authored x; flyers spawn in the hover band, ground
  types just above the floor. IF an enemy's x falls inside a hole, THEN that enemy shall be skipped.
- **REQ-SPAWN-003** — WHERE a stage defines a `noble` pickup, the gem shall spawn at its position and,
  WHERE a `guard` is set, a guard enemy shall spawn at the gem.
- **REQ-SPAWN-004** — The stage's germ total (boss counted as one) shall be snapshotted at spawn for
  the HUD counter.

## Pits / gaps

- **REQ-PIT-001** — Gaps shall be drawn as dark chasms and registered as holes that must be jumped.
- **REQ-PIT-002** — WHILE the player stands on solid ground away from any hole, the game shall record
  that x as the last safe respawn point.
- **REQ-PIT-003** — WHEN the player falls below the screen, the game shall respawn them at the last
  safe x just above the floor, play an impact, shake, and apply `GAP_FALL_DAMAGE` (15) (respecting
  i-frames; lethal only if HP runs out).

## Hazards (acid / spike strips)

- **REQ-HAZ-001** — Hazards shall be drawn as bubbling corrosive pools on the floor surface, tinted
  per sector.
- **REQ-HAZ-002** — WHILE the player stands on the ground inside a hazard and is not invincible, the
  game shall apply `HAZARD_DAMAGE` (10) per throttled tick with a sizzle SFX and burst. Jumping over
  is safe.

## Bounce pads

- **REQ-PAD-001** — Pads shall be drawn as springy spore domes on the floor.
- **REQ-PAD-002** — WHEN the player lands on the ground within ~30 px of a pad, the game shall launch
  them via `superJump(PLAYER_BOUNCE_VELOCITY)` with a boing SFX and squash animation.

## Crumbling tiles

- **REQ-CRUMBLE-001** — A crumble range shall be a hole in the base floor plugged by a removable solid
  collider, drawn as a cracked tile.
- **REQ-CRUMBLE-002** — WHEN the player stands on a solid crumble tile, it shall enter a warning state
  (rattle/flash) and, after `CRUMBLE_DELAY_MS` (620 ms), collapse: remove its plug collider, redraw as
  an open chasm, play a sizzle, shake and burst.

## Exit clear (non-boss stages)

- **REQ-EXIT-001** — A non-boss stage shall place an exit portal at `exitX`, sealed (red) with a hint.
- **REQ-EXIT-002** — WHILE any enemy remains active, the exit shall stay sealed; WHEN the last enemy
  dies, the exit shall open (green), play a fanfare and camera flash, and update the hint.
- **REQ-EXIT-003** — WHEN the player reaches the open exit, the game shall complete the stage
  (`_completeStage`).

## Boss arena (finale stages)

- **REQ-ARENA-001** — WHEN a boss activates (`boss-activated`), `GameScene` shall lock the camera to a
  single screen window around the boss anchor and confine the player to that arena (no running away),
  and shall cut the music to the `boss` track.
- **REQ-ARENA-002** — On stage (re)load, any previous boss-arena lock and lingering activation
  listener shall be cleared so a restarted boss stage does not clamp the player to a stale arena.

## Stage completion

- **REQ-CLEAR-001** — WHEN a stage is completed (exit reached) or a boss is defeated, the game shall
  freeze the player, finalize the stage score (see [scoring-and-persistence.md](scoring-and-persistence.md)),
  flash the camera in the sector colour, and after a short delay show the clear banner.
- **REQ-CLEAR-002** — The clear banner shall read STAGE CLEAR, SECTOR CLEAR (finale, not final), or
  EXPERIMENT COMPLETE (stage 9), show the score breakdown, and prompt to continue (tap or Z).
- **REQ-CLEAR-003** — WHEN continuing from a non-final clear, the game shall carry the cumulative run
  score into the next stage and start it; WHEN continuing from the final clear, it shall reset the run
  score and return to `StageSelectScene`.
- **REQ-CLEAR-004** — A stage intro overlay (sector + stage title) shall play on load before the
  player is allowed to move and before the clear timer starts; the playfield shall be masked into a
  petri-dish ellipse during the intro.
