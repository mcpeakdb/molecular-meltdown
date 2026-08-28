# Elements & Progression

Atom collection, the molecular tree (`ElementSystem`), the element-choice overlay, and the
weapon loadout (Compound Selection). Sources:
[`src/systems/ElementSystem.ts`](../../src/systems/ElementSystem.ts),
[`src/entities/Atom.ts`](../../src/entities/Atom.ts),
[`src/scenes/ElementChoiceScene.ts`](../../src/scenes/ElementChoiceScene.ts),
[`src/scenes/PauseScene.ts`](../../src/scenes/PauseScene.ts).

## Atom pickups

- **REQ-PROG-001** — Most atom pickups shall be **choice nodes**: walking into one opens a 2–3 way
  choice of base atoms. On spawn each node rolls a wildcard upgrade: ~0.1% **Platinum** (pick any base
  atom, +3) checked first, else ~1% **Gold** (pick any base atom, +2); a wildcard node offers all
  eight base atoms and uses the Platinum/Gold framing in `ElementChoiceScene`. A **noble** pickup and
  a **silver coin** are inert score pickups (no choice) — see
  [scoring-and-persistence.md](scoring-and-persistence.md).
- **REQ-PROG-001a** — Later levels (lab-floor sectors 4–6) shall spawn additional free-choice atom
  nodes (all eight base atoms) beyond those authored in the stage, scaled by sector (`(sector-3)*3`),
  spread across the stage and skipping holes/hazards — so the most atom-hungry compounds become
  reachable. (`GameScene._spawnStage`.)
- **REQ-PROG-002** — An atom shall bob and rotate; a noble gem shall additionally render a pulsing
  coloured halo so it reads as special.
- **REQ-PROG-003** — WHEN the player overlaps an uncollected atom, the game shall mark it collected,
  destroy it (and its glow), and branch: noble → score bonus flow; gold → choice overlay (+2,
  any-atom); normal → choice overlay (+1) with collect FX and SFX.

## ElementSystem (molecular tree, run-scoped)

- **REQ-PROG-010** — `ElementSystem` shall track per-base-atom counts (run-scoped; reset each run, not
  persisted) and derive available attacks from them.
- **REQ-PROG-011** — An attack's level shall be `levelFor(id, counts)` = the complete recipe copies
  the counts allow, capped at 3; an attack with level ≥1 is "available/unlocked".
- **REQ-PROG-012** — `getAvailableAttacks` / `attacksFor` shall return available attacks in
  `ATTACK_ORDER`; `getPrimary` (highest-slot available) shall drive the player tint.
- **REQ-PROG-013** — `collectAtom` shall increment a count and report whether it unlocked a new attack
  or raised any level (used to decide whether to play the upgrade SFX).

## Weapon loadout (bindable slots)

- **REQ-PROG-020** — The player shall have a fixed number of bindable weapon slots from the difficulty
  (3 on Normal/Hard, 2 on Extreme); slot keys are Z/X/C (1/2/3 on touch).
- **REQ-PROG-021** — WHEN a new attack unlocks, `reconcileBindings` shall auto-bind it to the first
  empty slot; IF every slot is already full, THEN the new attack shall be reported as `overflow`
  (the cue to teach Compound Selection — see REQ-PROG-040).
- **REQ-PROG-022** — `setBinding(slot, id)` shall bind an available attack (or null) to an in-range
  slot; it shall be a no-op for an out-of-range slot or an unavailable attack id.

## Element-choice overlay (`ElementChoiceScene`)

- **REQ-CHOICE-001** — WHEN an atom choice is triggered, `GameScene` shall pause and launch
  `ElementChoiceScene` with the choices, current counts, grant amount, and gold flag.
- **REQ-CHOICE-002** — Each choice card shall preview the attacks that picking it would unlock or
  level (★ NEW vs ▲ Lv n), show the element name, symbol watermark, and a random real-world fact, and
  the cards shall resize to fit.
- **REQ-CHOICE-002a** — WHERE there are more than four choices (a Gold/free-choice pick offers all
  eight base atoms), the cards shall wrap into **two rows** (`ceil(n/2)` per row) and switch to a
  compact layout — shorter cards, condensed unlock list (capped with a "+k more" line), and no
  fun-fact footer — so the cards never become too skinny to read. Four or fewer choices keep the
  single tall row unchanged.
- **REQ-CHOICE-003** — ←/→ (or tapping) shall select a card; Z/Enter (or re-tapping a card) shall
  confirm, playing a pop animation, then invoking the callback with the chosen atom.
- **REQ-CHOICE-004** — WHEN a choice is confirmed, `GameScene` shall resume, apply `grant` copies of
  the chosen atom, run `reconcileBindings`, emit an arsenal update, and stop the overlay; IF anything
  upgraded, THEN it shall play the upgrade SFX.
- **REQ-CHOICE-005** — WHEN a pick pushes any attack to its top tier (Lv3) for the first time this
  pick, M.E.G. shall pop in with a random max-level quip (outside the tutorial).
- **REQ-CHOICE-006** — WHEN a pick produces `overflow` for the first time ever
  (`Settings.compoundIntroSeen` false), M.E.G. shall explain Compound Selection and the flag shall be
  set so it is shown only once.

## Compound Selection (Pause sub-menu)

- **REQ-LOADOUT-001** — The pause menu shall offer COMPOUND SELECTION only when at least one attack is
  available; it shall list one row per weapon slot showing the bound compound and its level.
- **REQ-LOADOUT-002** — In Compound Selection, ←/→ (or tapping a row) shall cycle a slot's binding
  through "empty" plus every available attack not bound to another slot; ↑/↓ shall move between slots;
  Esc shall return to the pause menu.
- **REQ-LOADOUT-003** — WHEN a binding changes, the game shall emit an arsenal update so the HUD and
  touch buttons reflect it immediately.

## Super weapon unlock (Prismatic Beam)

The firing/effect of the Prismatic Beam is in [combat-and-attacks.md](combat-and-attacks.md)
(REQ-ATK-300…302).

- **REQ-SUPER-001** — The Prismatic Beam shall be armed for the current run once the run's noble-gas
  collection is complete (`GameScene._runNobles().length >= NOBLE_GAS_COUNT`) — i.e. all six must be
  gathered within a single run. The collection (and the Prismatic Beam) resets when a new run starts.
- **REQ-SUPER-002** — `ElementSystem` shall track the unlock as an instance flag
  (`setSuperUnlocked`/`isSuperUnlocked`); `getAttackLevel`/`getAvailableAttacks` shall report the
  super weapon only while that flag is set; the static `levelFor` shall always return 0 for it (it is
  not atom-derived).
- **REQ-SUPER-003** — WHEN a non-tutorial stage loads with the collection already complete, the game
  shall arm the super weapon and seed it (`seedSuperWeapon`) into the **last free** weapon slot,
  preserving the basic punch on slot 1.
- **REQ-SUPER-004** — WHEN the player collects the final noble gas mid-run (completing the set for the
  first time), the game shall arm and seed the super weapon immediately, emit an arsenal update, and
  have M.E.G. announce it (replacing the usual noble-pickup quip).
- **REQ-SUPER-005** — IF every weapon slot is already full when the super weapon is seeded, THEN it
  shall remain unbound but available, bindable via Compound Selection.
- **REQ-SUPER-006** — The super weapon shall NOT appear in atom-choice previews
  (`ElementChoiceScene`) or the periodic-table reference (`MoleculeTreeScene`), since neither is
  atom-derived; it is excluded from `ATTACK_ORDER`.
