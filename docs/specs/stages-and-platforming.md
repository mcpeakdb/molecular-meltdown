# Stages & Platforming

Stage data model, world building, platforming hazards, the exit-clear flow, and the boss arena.
Sources: [`src/stages.ts`](../../src/stages.ts), [`src/scenes/GameScene.ts`](../../src/scenes/GameScene.ts).

## Stage data model

- **REQ-STAGE-001** — The game shall consist of `STAGES[STAGE_COUNT]` (`StageDef`, currently 18 — six
  sectors of three), one per stage; `GameScene` shall read `STAGES[currentStage - 1]` and build the
  level from it. Sectors: 1 PETRI DISH, 2 BLOOD AGAR, 3 MACCONKEY, 4 LAB FLOOR, 5 UNDER THE BENCH,
  6 THE WASTE BIN. Sectors 4–6 share the lab-floor biome/tiles (only 1–3 have unique tile art).
- **REQ-STAGE-002** — A `StageDef` shall carry: `name`, `width`, `atoms` (choice nodes, optionally
  perched at `y`), `enemies` (optionally perched at `y`), `gaps`, and optionally `rise` (climbable sky
  height), `platforms`, `hazards`, `pads`, `crumble`, `noble`, and either `boss` (finale) or
  `exitX` (reach-the-exit clear). `boss` and `exitX` are mutually exclusive. It may also carry
  `spawn` (where the player is set down — `y` is the surface top they stand on) and `exitY` (the
  surface the exit portal stands on); omitting either gives the classic ground-level start/finish.
- **REQ-STAGE-002a** — Stages shall *sometimes* begin and/or end above the floor rather than always on
  it, so a run is not a flat left-to-right corridor. A raised `spawn` must land on a ledge listed in
  `platforms`, and a raised exit's footing must be reachable from the spawn — both are checked by
  `npm run levels`, which errors rather than shipping a stage that starts in mid-air or ends somewhere
  the player cannot climb to.
- **REQ-STAGE-002b** — Vertical geometry shall be built from three named shapes in
  [`src/stages.ts`](../../src/stages.ts) so climbs stay inside the jump budget by construction:
  `spire(x, baseTop, steps, up, offset, w)` (a zig-zag climb — the default 180px offset against a
  130px ledge leaves a 50px edge gap, well inside the 130px a single jump covers while rising 105px),
  `descent(x, top, steps, drop, offset, w)` (forward-and-down terraces, wider because falling is free),
  and `skybridge(x, top, count, gap, w)` (a level run at one height, travelled along rather than up).
- **REQ-STAGE-005** — After the hand-authored `STAGES` literal, every stage shall be enriched with up
  to two guarded ledge clusters (`addLedgeCluster`): a floating ledge (within a single jump of the
  floor, ~90px up) that carries a bonus atom and a posted ground-type guard. The two clusters shall be
  spread out (one biased toward the front ~16% of the stage, one toward ~72%) and placed only on the
  nearest origin to that target whose footprint is clear of every existing structure — gaps, hazards,
  ledges, the central sky-tower band, and any already-placed cluster (`occupiedSpans` /
  `findClusterSpot`). A cluster is skipped when no clear span exists.
- **REQ-STAGE-005a** — A cluster's atom shall offer that sector's `CLUSTER_ATOMS` choices, matched to
  its theme: the dish sectors carry the light atoms, and the lab-floor sectors each headline one heavy
  atom so its molecules become buildable where it fits (phosphorus on the bench, sulfur beneath it,
  chlorine in the waste bin). Sodium is offered as an *additional* third pick in the culture-media
  sectors (2–3) and again beside chlorine in the waste bin (6) — widening the menu rather than
  displacing an existing pick, so an eighth atom does not thin the odds of the other seven.
- **REQ-STAGE-006** — After clusters and nobles are placed, every stage's tallest platform (its
  sky-tower summit) shall be guaranteed a reward: WHERE no atom is already perched near/above it and
  no noble gem sits there, a sector-appropriate choice atom shall be perched on it. On stages whose
  summit already holds a reward this is a no-op. (Higher platforms always pay off.)
- **REQ-STAGE-003** — Theme/art shall be keyed by sector (not per-stage): `SECTOR_THEMES` colours and
  the `bg_tile_${sector}` / `ground_tile_${sector}` textures. All three stages of a sector share a
  biome.
- **REQ-STAGE-004** — The 3rd stage of each sector shall be a boss finale (`boss` set); the other six
  shall clear via `exitX`.
- **REQ-STAGE-007** — Sectors that share a biome shall still be differentiated by a signature
  platforming style so late-game stages do not feel like copies: **Sector 4 (LAB FLOOR)** shall use
  wide low benches and few gaps; **Sector 5 (UNDER THE BENCH)** shall use narrow footholds and
  stepping pillars over additional pits (precision jumping); **Sector 6 (THE WASTE BIN)** shall use
  extra bounce pads and staggered footholds so ascent is by launching (vertical bounce shafts). In
  every case the central sky-tower climb (and its summit reward / noble gem) is preserved unchanged;
  only the front approach, back run-up, and gap/pad layout carry the signature.

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
- **REQ-WORLD-005** — During free play the camera shall zoom in on the player (`PLAY_ZOOM`); it shall
  pull back to a full screen (`BOSS_ZOOM` = 1.0) for the boss arena, any dialogue/quip/tip panel, and
  the stage-clear / death overlays — all of which are screen-fixed UI that only frames correctly at
  1.0. The zoom is applied after the stage intro (the tutorial stays at 1.0). The screen-fixed
  framing overlays (vignette, petri-dish iris mask) shall be counter-scaled to the current zoom so
  they stay glued to the screen edges (`_applyZoom` / `_rescaleOverlays`).

## Spawning

- **REQ-SPAWN-001** — Each stage atom shall spawn as a choice node (see
  [elements-and-progression.md](elements-and-progression.md)); a rare 1% roll shall turn a node into a
  Gold wildcard (any base atom, +2).
- **REQ-SPAWN-002** — Enemies shall spawn at their authored x; a perched enemy uses its authored `y`,
  otherwise flyers spawn in the hover band and ground types just above the floor. IF an enemy's x
  falls inside a hole, THEN that enemy shall be skipped.
- **REQ-SPAWN-002a** — Each stage's `enemies` are hand-placed into paced encounters (the `pack` squad
  helper, not an even fill): a light teaching intro, rising fights, a clear breather over the sky-tower
  climb, then a spike — exit stages guard the exit, and boss stages escalate into a heavier crowd
  right before the arena so threat builds toward the boss. `tools/level-map.ts` (`npm run levels`)
  scores this (threat density, ramp, breather); placements sit on solid ground, not in gaps.
- **REQ-SPAWN-003** — WHERE a stage defines a `noble` pickup, the gem shall spawn at its position and,
  WHERE a `guard` is set, a guard enemy shall spawn at the gem.
- **REQ-SPAWN-004** — The stage's germ total (boss counted as one) shall be snapshotted at spawn for
  the HUD counter.
- **REQ-SPAWN-005** — Every non-tutorial stage shall scatter life/power-up drops, spread across the
  walkable span and nudged onto solid footing (never a pit or acid pool); each opens no element choice
  and does not build the molecular tree:
  - Healing drops per `HEAL_DROPS` — Calcium (`Ca`, heals 30, 1 per stage) and Zinc (`Zn`, heals 15,
    2 per stage). WHEN collected the game shall call `Player.heal` (REQ-PLAYER-056) and pop a `+N HP`
    (or `HP FULL`) label with a chime.
  - Armor drops per `ARMOR_DROPS` — Iron (`Fe`, +25 armor, 1 per stage). WHEN collected the game shall
    call `Player.addArmor` (REQ-PLAYER-057) and pop a `+N ARMOR` (or `ARMOR FULL`) label with a chime.

## Pits / gaps

- **REQ-PIT-001** — Gaps shall be drawn as dark chasms and registered as holes that must be jumped.
- **REQ-PIT-002** — WHILE the player stands on solid footing, the game shall record that position —
  both x and height — as the last safe respawn point. Footing well above the floor line (a ledge)
  always counts, since a ledge is solid even where it bridges a pit; down on the floor itself, only
  ground away from a hole counts.
- **REQ-PIT-003** — WHEN the player falls below the screen, the game shall respawn them just above
  that last safe footing — back on the ledge they fell from, not down on the floor — play an impact,
  shake, and apply `GAP_FALL_DAMAGE` (15) (respecting i-frames; lethal only if HP runs out).

## Hazards (acid / spike strips)

- **REQ-HAZ-001** — Hazards shall be drawn as bubbling corrosive pools on the floor surface, tinted
  per sector.
- **REQ-HAZ-002** — WHILE the player stands on the ground inside a hazard and is not invincible, the
  game shall apply `HAZARD_DAMAGE` (10) per throttled tick with a sizzle SFX and burst. Jumping over
  is safe.
- **REQ-HAZ-003** — Ground-level features (hazards, bounce pads, crumble tiles) shall act only while
  the player is standing on the **ground floor itself** (`_onGroundFloor`: on a surface AND resting
  at floor height), never while perched on a platform above them. (`onFloor()` alone is true on any
  surface and cannot distinguish the two.)

## Bounce pads

- **REQ-PAD-001** — Pads shall be drawn as springy spore domes on the floor.
- **REQ-PAD-002** — WHEN the player lands on the ground within ~30 px of a pad, the game shall launch
  them via `superJump(PLAYER_BOUNCE_VELOCITY)` with a boing SFX and squash animation.
- **REQ-PAD-003** — Every pad shall carry a reward directly overhead: a one-way perch (`_addPlatform`
  with `oneWay`, solid on its top face only) at `GROUND_TOP_Y - 330`, with a free-choice atom on it.
  The perch height sits in the pad-only reachability window — above a double-jump's reach (feet
  ≈ y166) yet below the pad launch's apex (feet ≈ y-265 at `PLAYER_BOUNCE_VELOCITY`) — so the perch
  is reachable only by bouncing, and the bounce rises up through the one-way surface to land on top.

## Crumbling tiles

- **REQ-CRUMBLE-001** — A crumble range shall be a hole in the base floor plugged by a removable solid
  collider, drawn as a cracked tile.
- **REQ-CRUMBLE-002** — WHEN the player stands on a solid crumble tile, it shall enter a warning state
  (rattle/flash) and, after `CRUMBLE_DELAY_MS` (620 ms), collapse: remove its plug collider, redraw as
  an open chasm, play a sizzle, shake and burst.

## Exit clear (non-boss stages)

- **REQ-EXIT-001** — A non-boss stage shall place an exit portal at `exitX`, standing on `exitY`
  (default: the floor), open (green) with an "EXIT →" hint above it, from the moment the stage loads.
- **REQ-EXIT-002** — The exit shall never be gated on enemies: surviving enemies shall not hold it
  shut, so the player may fight or bypass them freely.
- **REQ-EXIT-003** — WHEN the player reaches the exit, the game shall complete the stage
  (`_completeStage`). A floor-level exit sits at the end of the world, so crossing its x is the whole
  test. WHERE the exit is raised (`exitY` set), the player shall additionally have to be at least as
  high as its footing — walking the ground beneath it shall not clear the stage, since that would
  throw away the climb the ending was built around. Being *above* the portal still counts.
- **REQ-EXIT-004** — A finale stage has no exit portal and shall clear only by defeating its boss
  (`onBossDefeated`).

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
  EXPERIMENT COMPLETE (the final stage, `STAGE_COUNT`), show the score breakdown, and prompt to
  continue (tap or Z).
- **REQ-CLEAR-003** — WHEN continuing from a non-final clear, the game shall carry the cumulative run
  score into the next stage and start it; WHEN continuing from the final clear, it shall reset the run
  score and return to `StageSelectScene`.
- **REQ-CLEAR-004** — A stage intro overlay (sector + stage title) shall play on load before the
  player is allowed to move and before the clear timer starts; the playfield shall be masked into a
  petri-dish ellipse during the intro.
