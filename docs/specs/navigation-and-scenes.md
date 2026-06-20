# Navigation & Scenes

Boot sequence, the scene graph, and every menu/overlay screen. Sources:
[`src/main.ts`](../../src/main.ts), [`src/scenes/`](../../src/scenes/).

## Boot & game configuration

- **REQ-BOOT-001** — The game shall run on Phaser arcade physics at a fixed `960×540` design
  resolution, scaled with `Phaser.Scale.FIT` and centred.
- **REQ-BOOT-002** — On launch, `BootScene` shall preload every hand-drawn sprite listed in
  `ASSET_SPECS` (player frames, M.E.G., enemies, bosses, atoms, FX) from
  `public/assets/sprites/` by key.
- **REQ-BOOT-003** — After loading, `BootScene` shall build the player walk/idle/jump animations,
  the procedural per-sector `bg_tile_*`/`ground_tile_*` maps, the `vignette` overlay, and the
  `atom_noble` gem texture, then start `TitleScene`.
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
  3-per-sector (currently 12 tubes in 4 groups), reading the difficulty from the registry and the
  unlock state from `SaveSystem`. The rack auto-centers for `STAGE_COUNT / 3` sector groups.
- **REQ-STAGESEL-002** — On open, the cursor shall start on the furthest unlocked stage.
- **REQ-STAGESEL-003** — A stage tube shall render locked (dim) WHILE its stage number exceeds the
  unlocked stage, and the detail panel shall show "LOCKED" with no best score.
- **REQ-STAGESEL-004** — WHILE a stage is highlighted and unlocked, its detail panel shall show the
  stage name, best score, and (for stages 2-9) its passcode.
- **REQ-STAGESEL-005** — WHEN an unlocked stage is confirmed, the scene shall play the test-tube
  reaction/eruption flourish, reset the run score to 0, and start `GameScene` with that stage and
  difficulty.
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

- **REQ-TREE-001** — `MoleculeTreeScene` shall present a periodic-table reference: the four base
  atoms in their true periodic positions, with the compounds catalogued as a second row, each tile
  data-driven from `ATTACKS` (symbol/formula, name, molar mass).
- **REQ-TREE-002** — WHILE a tile is selected, the detail panel shall show its recipe (or "base atom"
  for the four) and its three tier attack names.
- **REQ-TREE-003** — ←/→/↑/↓ shall move the cursor (up/down hop between the atom and compound rows);
  ESC/Z/Enter or tapping the backdrop shall return to the `from` scene.

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
