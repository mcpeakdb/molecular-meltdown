# Navigation & Scenes

Boot sequence, the scene graph, and every menu/overlay screen. Sources:
[`src/main.ts`](../../src/main.ts), [`src/scenes/`](../../src/scenes/).

## Boot & game configuration

- **REQ-BOOT-001** — The game shall run on Phaser arcade physics at a fixed `960×540` design
  resolution, scaled with `Phaser.Scale.FIT` and centred.
- **REQ-BOOT-002** — On launch, `BootScene` shall preload every sprite listed in `ASSET_SPECS`
  (player frames, M.E.G., enemies, bosses, atoms incl. the noble gem, FX) from
  `public/assets/sprites/` by key. (The lab-floor creatures and the noble gem are PNG files generated
  by `scripts/gen-sprites.mjs` rather than hand-drawn, but load identically.)
- **REQ-BOOT-003** — After loading, `BootScene` shall build the player walk/idle/jump animations and
  the only remaining procedural textures — the per-sector `bg_tile_*`/`ground_tile_*` stage maps and
  the `vignette` overlay — then start `TitleScene`.
- **REQ-BOOT-004** — IF an asset fails to load, THEN `BootScene` shall log a warning and continue
  (it shall not block startup).
- **REQ-BOOT-005** — WHERE the `fullscreen` setting is on and the device is touch-capable, the game
  shall attempt to enter fullscreen on the first user pointer gesture (best-effort; silently ignored
  where unsupported).

## Scene graph & flow

Registered scenes (`main.ts`): Boot, Title, Difficulty, StageSelect, Leaderboard, Settings, Help,
MoleculeTree, Game, HUD, ElementChoice, Pause.

```
Boot → Title ─┬─ START ─────► (tutorial not done) GameScene{tutorial} ─► DifficultyScene
              │              (tutorial done)      DifficultyScene
              ├─ MOLECULE TREE ► MoleculeTreeScene ─ESC─► caller
              ├─ LEADERBOARD ──► LeaderboardScene ──ESC─► caller
              ├─ CONTROLS ─────► HelpScene ─────────ESC─► caller
              └─ SETTINGS ─────► SettingsScene ─────ESC─► caller

DifficultyScene ─confirm─► StageSelectScene ─confirm─► GameScene{stage,difficulty}
GameScene (+HUDScene in parallel) ─clear─► next GameScene | StageSelectScene (after stage 9)
GameScene ─death─► retry GameScene | TitleScene
GameScene ─pause─► PauseScene (overlay)
GameScene ─atom─► ElementChoiceScene (overlay)
```

- **REQ-NAV-001** — WHEN the player confirms START on the title, IF the tutorial has not been
  completed (`Settings.tutorialDone` false), THEN the game shall launch `GameScene` in tutorial mode;
  OTHERWISE it shall open `DifficultyScene`.
- **REQ-NAV-002** — The `from` scene passed to MoleculeTree / Leaderboard / Help / Settings shall be
  the scene returned to on back, so these screens are reachable from both the title and in-game flow.
- **REQ-NAV-003** — `HUDScene` shall run in parallel with `GameScene` and shall be explicitly stopped
  whenever `GameScene` is left (retry, quit, stage change, difficulty select).

## Menu interaction model (shared)

All menus support both keyboard and pointer/touch via `src/systems/touchMenu.ts`.

- **REQ-MENU-001** — Menu scenes shall accept ↑/↓ (or ←/→ where horizontal) to move the cursor and
  Z or Enter to confirm; selectable items shall also be tappable.
- **REQ-MENU-002** — WHEN a menu item is tapped, the menu shall move the cursor to it; WHEN the
  already-highlighted item is tapped again, the menu shall confirm it (tap-to-select-then-confirm).
- **REQ-MENU-003** — WHEN a selection is confirmed, the avatar cursor icon shall play a punch
  flourish (lunge + scale pop + punch SFX) and then perform the action; re-entry shall be guarded so
  a double-press cannot fire the action twice during the flourish (`punchCursorIcon`).
- **REQ-MENU-004** — The selected-item marker shall be a small player-avatar image
  (`makeCursorIcon`) positioned just left of the active item.

## TitleScene

- **REQ-TITLE-001** — `TitleScene` shall present the menu: START, MOLECULE TREE, LEADERBOARD,
  CONTROLS, SETTINGS, and shall set the `title` music track.
- **REQ-TITLE-002** — The title shall render decorative drifting germs/atoms and an orbiting-electron
  atom behind the menu; WHILE the scene runs, decor shall wrap around the screen edges.

## DifficultyScene

- **REQ-DIFF-001** — `DifficultyScene` shall offer NORMAL, HARD, EXTREME, each shown as an
  Erlenmeyer flask over a Bunsen burner whose flame size and boil rate scale with difficulty.
- **REQ-DIFF-002** — WHILE a flask is highlighted, only that flask's burner shall be lit and its
  liquid shall bubble; the others shall sit dark and still.
- **REQ-DIFF-003** — Each card shall display its enemy-HP/speed multipliers, i-frame duration, and
  weapon-slot count (mirroring `DIFFICULTY_SCALE`).
- **REQ-DIFF-004** — WHEN a difficulty is confirmed, the scene shall play the `reaction` SFX, run a
  boil-over eruption + screen flash, store the chosen difficulty in the registry, and start
  `StageSelectScene`.
- **REQ-DIFF-005** — WHEN ESC/BACK is pressed (and no reaction is mid-play), the scene shall return
  to `TitleScene`.

## StageSelectScene

- **REQ-STAGESEL-001** — `StageSelectScene` shall render the stages as test tubes in a rack, grouped
  3-per-sector, reading the difficulty from the registry and the unlock state from `SaveSystem`. The
  rack holds up to three sector groups (9 tubes) per shelf and stacks onto a second shelf below when
  there are more (currently 18 tubes on two shelves: sectors 1–3 on top, 4–6 below). Up/down navigation
  hops between shelves.
- **REQ-STAGESEL-002** — On open, the cursor shall start on the furthest unlocked stage.
- **REQ-STAGESEL-003** — A stage tube shall render locked (dim) WHILE its stage number exceeds the
  unlocked stage, and the detail panel shall show "LOCKED" with no best score.
- **REQ-STAGESEL-004** — WHILE a stage is highlighted and unlocked, its detail panel shall show the
  stage name, best score, and (for stages 2-9) its passcode.
- **REQ-STAGESEL-005** — WHEN an unlocked stage is confirmed, the scene shall play the test-tube
  reaction/eruption flourish, begin a new run — resetting the run score (`runScore`=0), emptying the
  noble collection (`runNobles`=[]), and restoring lives (`lives`=`RUN_LIVES`) — and start `GameScene`
  with that stage and difficulty. (This is the sole entry point for a new run; see REQ-LIVES-001.)
- **REQ-STAGESEL-006** — IF a locked stage is confirmed, THEN the scene shall flash the tube red and
  shake, and shall not start the stage.
- **REQ-STAGESEL-007** — Navigation: ←/→ move by 1, ↑/↓ move by 3 (between rows); ESC → Difficulty,
  L → Leaderboard, P (or the on-screen button) → passcode entry.
- **REQ-STAGESEL-008** — WHILE the passcode modal is open OR a reaction is playing, tube navigation
  shall be frozen.

### Passcode entry modal
- **REQ-STAGESEL-009** — The passcode modal shall accept a 6-digit code via an on-screen numpad or
  the keyboard digits, with Backspace/DEL to erase, Enter/OK to submit, and Esc/tap-outside to cancel.
- **REQ-STAGESEL-010** — WHEN a valid code for the current difficulty is submitted, the scene shall
  unlock every stage up to that code's stage and restart so the rack reflects the new unlocks.
- **REQ-STAGESEL-011** — IF an entered code is invalid, THEN the modal shall clear the buffer, show
  "INVALID CODE", and shake.

## LeaderboardScene

- **REQ-BOARD-001** — `LeaderboardScene` shall show the top-5 runs for the selected difficulty as
  graduated cylinders whose fill is proportional to score relative to the top run, with rank medals
  (gold/silver/bronze) and per-run labels (score, stage reached, atom counts, date).
- **REQ-BOARD-002** — ←/→ (or tapping a tab) shall switch the difficulty; ESC/Z (or BACK) shall
  return to the `from` scene.
- **REQ-BOARD-003** — IF no runs are recorded for the selected difficulty, THEN the scene shall show
  an empty-state message.

## MoleculeTreeScene

- **REQ-TREE-001** — `MoleculeTreeScene` shall present a real periodic-table layout on an 18-group ×
  7-period lattice: the seven base atoms in their true (group, period) cells (H alone; C/N/O in
  period 2; P/S/Cl below them in period 3); the six noble gases down group 18 (far right) under a
  highlight; the group-11 precious metals — Silver (period 5) above Gold (period 6) — with Platinum
  beside Gold; the life/power-up drops in their true period-4 cells — the healing drops Calcium (group
  2) and Zinc (group 12) flanking the armor drop Iron (group 8), all seated below the detail panel;
  and the Prismatic super weapon capping the foot of the noble-gas column. The assembled compounds
  shall form a detached, labelled strip along the very bottom. Real elements show their true atomic
  number and standard atomic weight; the super weapon shows neither.
- **REQ-TREE-001a** — The table shall be completed through Radon (Z = 86): every element that is not a
  game element shall be drawn as a greyed, **non-selectable** reference tile in its true (group,
  period) cell showing only its atomic number and symbol. The lanthanides (57–71) shall sit in a
  detached f-block strip on the period-7 row (with a `*` placeholder in the group-3/period-6 slot).
  Because periods 2–3 now fill groups 2 and 13, the detail panel shall be sized to sit strictly within
  the still-empty groups 3–12 span so it never overlaps a cell.
- **REQ-TREE-002** — WHILE a tile is selected, the central legend/detail panel shall show content per
  tile kind: a base atom's atomic number + tier attack names; a compound's recipe + tier attack
  names; Gold's wildcard note (grants +2 of one atom); Platinum's wildcard note (grants +3, ~0.1%);
  Silver's note (silver coins — 50 per stage, each scores, full sweep bonus); a healing drop's note
  (Ca/Zn restore HP — the amount and per-stage count); an armor drop's note (Fe grants armor that
  soaks damage before HP — the amount and per-stage count); a noble gas's inert note (collect all six
  to arm the Prismatic Beam); and the super weapon's requirement + effect.
- **REQ-TREE-003** — ←/→/↑/↓ shall move the cursor to the nearest **selectable** (game) tile in the
  pressed direction (reaching the noble-gas column, the precious metals, the super weapon, and the
  detached compounds); the greyed reference tiles are skipped by the cursor and swallow taps (a tap on
  one does nothing). ESC/Z/Enter or tapping the backdrop shall return to the `from` scene.

## HelpScene

- **REQ-HELP-001** — `HelpScene` shall list the controls (move, jump/double-jump, attack, collect,
  loadout, pause, touch, hazard warning); ESC/Z/Enter or any tap shall return to the `from` scene.

## SettingsScene

- **REQ-SET-001** — `SettingsScene` shall expose rows for Volume, Mute, Sound FX, Music, Screen
  Shake, Touch Controls, Fullscreen, and BACK, and shall display the app version (`__APP_VERSION__`).
- **REQ-SET-002** — ←/→ shall adjust the highlighted row (volume in 0.1 steps; booleans set by
  direction; Touch Controls toggles on/off); Z/Enter shall toggle a boolean / nudge volume up
  (wrapping at max) / activate BACK.
- **REQ-SET-003** — WHEN a row that produces sound is adjusted on (volume/mute-off/sfx-on), the scene
  shall play a preview blip.
- **REQ-SET-004** — WHEN Fullscreen is toggled, the scene shall enter/leave real fullscreen where
  supported; the preference shall persist regardless.
- **REQ-SET-005** — All setting changes shall persist immediately via `Settings.set` and shall apply
  to live audio within a music scheduler tick (see [audio-and-settings.md](audio-and-settings.md)).

## PauseScene

See also [elements-and-progression.md](elements-and-progression.md) for Compound Selection.

- **REQ-PAUSE-001** — WHEN the player pauses (ESC/Enter or the on-screen ❚❚ button) during active
  play, `GameScene` shall pause physics and launch `PauseScene`; pausing shall be a no-op while
  already paused, during the stage-clear sequence, or in the tutorial.
- **REQ-PAUSE-002** — The pause menu shall list RESUME, COMPOUND SELECTION (only when at least one
  attack is available), RESTART STAGE, DIFFICULTY SELECT, RESTART GAME, QUIT TO TITLE.
- **REQ-PAUSE-003** — WHEN RESUME (or ESC) is chosen, `PauseScene` shall emit `pause-resume`, which
  resumes `GameScene` physics, and shall stop itself.
- **REQ-PAUSE-004** — RESTART STAGE shall restart `GameScene` at the current stage; RESTART GAME
  shall restart in tutorial mode; DIFFICULTY SELECT shall stop the game and open `DifficultyScene`;
  QUIT TO TITLE shall stop the game and open `TitleScene`. Each shall stop `HUDScene`.
