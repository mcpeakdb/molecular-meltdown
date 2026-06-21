# Scoring & Persistence

Scoring, the death summary, save data (unlocks, best scores, leaderboard, noble gases), and
passcodes. Sources: [`src/scenes/GameScene.ts`](../../src/scenes/GameScene.ts),
[`src/systems/SaveSystem.ts`](../../src/systems/SaveSystem.ts),
[`src/systems/Passcode.ts`](../../src/systems/Passcode.ts).

## Scoring

- **REQ-SCORE-001** — Score shall be the cumulative run total, carried across stages via the registry
  key `runScore`, and reset to 0 when a fresh run starts (stage selected, run ended, or retry).
- **REQ-SCORE-002** — WHEN an enemy dies, the game shall add its score: bacterium 100, virus 80,
  dustbunny 150, pollen 60, amoeba 200, spore 70, mite 120; a boss shall award 1000.
- **REQ-SCORE-003** — WHEN a noble gas is collected, the game shall add `NOBLE_GAS_BONUS` (500).
- **REQ-SCORE-004** — WHEN a stage is finalized, the game shall award a time bonus
  `max(0, round((par - elapsed) * 8))` where `par = worldWidth/160 + 25`, plus a flawless bonus of 750
  IF the player finished at full HP, and fold both into the run score.
- **REQ-SCORE-005** — WHEN a stage is finalized, the game shall record the per-stage best score (this
  stage's own contribution = run score minus the score at stage start) and mark the stage cleared.
- **REQ-SCORE-006** — The HUD shall reflect score, combo, HP, owned atoms, and the germ counter via
  `score-update`, `combo-update`, `hud-update`, `arsenal-update`, and `enemies-update` events.

## Death & run summary

- **REQ-DEATH-001** — WHEN the player dies (non-tutorial), the game shall stop the music, hide the
  HUD arsenal, fade in a YOU DIED overlay with a sobbing-scientist animation, submit the run to the
  leaderboard, reset `runScore`, and show a run summary (score, stage reached, atoms, molecules built,
  nobles found, leaderboard placement).
- **REQ-DEATH-002** — WHEN Z is pressed (or the retry label is tapped) on the death screen, the game
  shall retry (restart the current stage, or the tutorial); WHEN ESC is pressed (or the title label is
  tapped), it shall return to `TitleScene`. Both labels shall be tappable so touch players (no
  keyboard) can act, and the choice shall be guarded against a double-fire.
- **REQ-DEATH-003** — IF the death is in the tutorial, THEN no run shall be recorded and no run
  summary shall be shown.

## Run leaderboard submission

- **REQ-RUN-001** — A run shall be submitted at most once (`_runSubmitted` guard) — on death or on
  completing the final stage.
- **REQ-RUN-002** — A submitted `RunRecord` shall carry score, stage reached, difficulty, the final
  atom counts, the assembled attack ids, and a timestamp.

## SaveSystem (localStorage meta)

Persisted under `mm.save.v2`. Records are kept separately per difficulty.

- **REQ-SAVE-001** — Save data shall hold, per difficulty (`normal`/`hard`/`extreme`): the highest
  unlocked stage, per-stage best scores, and a top-5 leaderboard; plus a global list of noble gases
  ever found.
- **REQ-SAVE-002** — `load` shall tolerate missing/corrupt/blocked storage by falling back to empty
  defaults rather than throwing; `unlockedStage` shall be clamped to `1…STAGE_COUNT`.
- **REQ-SAVE-003** — On first read of v2 with no v2 data present, a pre-Phase-7 (`mm.save.v1`) save
  shall be migrated one difficulty notch up (easy→normal, normal→hard, hard→extreme) and persisted.
- **REQ-SAVE-004** — `markStageCleared(difficulty, stage)` shall raise the unlocked stage to at most
  `stage+1` (no-op past the final stage); `unlockUpToStage` shall raise it to at most `stage`.
- **REQ-SAVE-005** — `recordBestScore` shall store a per-stage best only when it beats the previous,
  returning whether it did.
- **REQ-SAVE-006** — `submitRun` shall insert a run into its difficulty's leaderboard sorted by score
  descending, keep the top 5, and return the 0-based rank, or -1 if it did not place.
- **REQ-SAVE-007** — `markNobleFound(id)` shall add a noble gas to the permanent collection, returning
  true only on a first-time find.
- **REQ-SAVE-008** — Atom/molecule progress shall NOT be persisted — the game is arcade and the
  molecular tree is run-scoped (reset each stage/run).

## Noble gas collection

- **REQ-NOBLE-001** — WHEN a noble gas is collected, the game shall add the score bonus, record the
  find via `SaveSystem`, play celebratory FX in the gas colour, float a "+bonus" label, and have
  M.E.G. quip — first finds noting the running `n/6` total.
- **REQ-NOBLE-002** — The six noble gases shall be spread one per sector across the 18 stages
  (centralized in `NOBLE_BY_STAGE`, currently the 2nd stage of each sector: 2, 5, 8, 11, 14, 17),
  each near the top of that stage's sky tower. All are exit-clear stages, so any guard shall be a
  flyer (or none) — descending into reach so the optional climb never gates the stage clear. Where a
  stage already has a summit atom, the gem sits a little higher so both are worth grabbing.
- **REQ-NOBLE-003** — WHEN the noble-gas collection becomes complete (all 6 ever found), the player
  shall permanently unlock the Prismatic Beam super weapon (see
  [elements-and-progression.md](elements-and-progression.md) REQ-SUPER-*).

## Passcodes

- **REQ-CODE-001** — A stage's passcode shall be a deterministic 6-digit FNV-1a hash of
  `(difficulty, stage, salt)` — derived, never stored — and shall be per-difficulty.
- **REQ-CODE-002** — Stage 1 shall have no code (always unlocked); stages 2…9 each have one.
- **REQ-CODE-003** — `resolvePasscode(code, difficulty)` shall return the stage a 6-digit code unlocks
  for that difficulty, or null if it matches none; entering a valid code unlocks every stage up to and
  including it (REQ-STAGESEL-010).
- **REQ-CODE-004** — Bumping `PASSCODE_SALT` shall invalidate all previously shared codes.
