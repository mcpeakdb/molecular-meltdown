# HUD & Input

The in-game HUD and the input model (keyboard + on-screen touch controls). Sources:
[`src/scenes/HUDScene.ts`](../../src/scenes/HUDScene.ts),
[`src/systems/TouchControls.ts`](../../src/systems/TouchControls.ts),
[`src/types.ts`](../../src/types.ts).

## Input model

- **REQ-INPUT-001** — Player input shall be merged per frame from the keyboard and (where active) the
  touch controls into a single `InputKeys` snapshot consumed by `Player.update`, keeping the rest of
  the game input-source agnostic.
- **REQ-INPUT-002** — Keyboard bindings: move ←/→ or A/D; jump Space/↑/W; attack slots Z/X/C; pause
  ESC/Enter. Slot 1 (Z) punches while no attack is bound.
- **REQ-INPUT-003** — WHILE the stage is paused or the clear sequence is running, on-screen touch
  controls shall be disabled.

## HUD readouts

- **REQ-HUD-001** — `HUDScene` shall display: an HP bar (colour shifts green→amber→red as HP drops)
  with numeric HP, the owned base-atom badges (H/O/C/N counts), a centred weapon-chip bar, a germ
  counter, the run score, and the combo readout.
- **REQ-HUD-002** — WHEN `arsenal-update` fires, the HUD shall render one chip per weapon slot: a
  bound slot shows its compound symbol/name/level-pips/cooldown; an empty slot 1 falls back to a
  Punch chip; any other empty slot shows a dim placeholder. The chip bar shall centre on the slot
  count for the difficulty.
- **REQ-HUD-003** — A chip recharging shall show a cooldown wipe and dim; an empty placeholder shall
  be dimmer still. On touch, chip key badges (Z/X/C) shall be hidden.
- **REQ-HUD-004** — WHEN a weapon chip is tapped on touch, the HUD shall route a slot-fire to the
  player via the touch controls (same path as a key press) with a press animation.
- **REQ-HUD-005** — WHEN `combo-update` fires with count ≥2, the HUD shall show "N HITS" + multiplier
  with a pop; with count <2 it shall fade the combo readout out.
- **REQ-HUD-006** — WHEN `enemies-update` fires, the HUD shall show "GERMS killed/total · N LEFT",
  highlighting when none remain; with total 0 it shall hide the counter.
- **REQ-HUD-007** — WHEN `boss-activated` fires, the HUD shall flash a "! PATHOGEN DETECTED !" warning.
- **REQ-HUD-008** — `hideArsenal` shall hide the chips, germ counter, and touch controls so a
  full-screen overlay (clear banner / death screen) reads cleanly; the HUD is relaunched fresh next
  stage.

## Touch controls (`TouchControls`)

Created by the HUD only WHERE `Settings.touchActive()` is true (mode `on`, or `auto` on a
touch-capable device).

- **REQ-TOUCH-001** — A floating thumbstick shall appear wherever the first pointer lands in the
  lower-left movement zone, tracking that pointer until release, producing an analog X/Y in [-1,1]
  with a dead zone; only X drives movement (the 2D side view has no depth axis).
- **REQ-TOUCH-002** — The right-thumb cluster shall provide a JUMP button, up to 3 attack buttons
  (arced up-left of jump), and a PAUSE button parked higher to avoid accidental presses.
- **REQ-TOUCH-003** — Attack buttons shall mirror the weapon slots: the HUD shall keep each button's
  visibility, colour, cooldown dim, and element-symbol label in sync via `setAttackSlot` (font shrinks
  for long formulas).
- **REQ-TOUCH-004** — Touch inputs (jump, slot fires) shall be edge-triggered and drained once per
  frame into the input snapshot; the stick magnitude shall be continuous.
- **REQ-TOUCH-005** — WHEN the controls are disabled, all buttons/stick shall hide, queued inputs
  shall clear, and the movement zone shall stop swallowing taps (so paused-tutorial tap-to-advance
  still works).
- **REQ-TOUCH-006** — Multiple simultaneous touches (move + jump + an attack) shall be supported.
