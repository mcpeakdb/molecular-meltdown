# Tutorial (M.E.G.-guided intro)

The first-run guided level and the dialogue/tip/quip system it shares with the rest of the game.
Source: [`src/scenes/GameScene.ts`](../../src/scenes/GameScene.ts) (tutorial + dialogue sections).

## Entry & flow

- **REQ-TUT-001** — WHEN START is chosen on the title and the tutorial has not been completed, the
  game shall launch `GameScene` in tutorial mode (Normal difficulty, Sector 1 art, its own content).
- **REQ-TUT-002** — The tutorial layout shall contain one choice atom, one weakened bacterium, and one
  gap to jump, with M.E.G. hovering just behind the player.
- **REQ-TUT-003** — On start, M.E.G. shall deliver the intro dialogue, then unpause so the player can
  move right.
- **REQ-TUT-004** — A persistent "ESC — skip tutorial" hint shall be shown; WHEN ESC is pressed, the
  tutorial shall end and proceed to difficulty select.
- **REQ-TUT-005** — WHEN the player reaches the end of the tutorial corridor, M.E.G. shall deliver the
  closing dialogue and the tutorial shall proceed to difficulty select.
- **REQ-TUT-006** — WHEN the tutorial is completed or skipped, `Settings.tutorialDone` shall be set so
  it never auto-runs again, and the game shall stop `HUDScene`/`GameScene` and start `DifficultyScene`.

## Proximity tips

- **REQ-TUT-010** — WHILE in the tutorial and near a teaching beat (the atom, the enemy, the gap), the
  game shall fire the matching one-shot proximity tip; each tip shall fire at most once.
- **REQ-TUT-011** — WHEN the player arms an attack during the tutorial, M.E.G. shall prompt them to
  use it (instead of the normal max-level / compound-intro flows).

## Dialogue / tip / quip system (shared, also used outside the tutorial)

- **REQ-DLG-001** — Blocking story dialogue (`_say`) shall pause the game and physics, show M.E.G.'s
  portrait + lines, and advance one line per tap / Space / Z; WHEN the queue empties it shall unpause,
  remove its input listeners, and run the optional completion callback.
- **REQ-DLG-002** — The dialogue UI shall be built lazily so it also works outside the tutorial
  (e.g. the compound-intro and max-level quips during normal play).
- **REQ-DLG-003** — A proximity tip (`_tip`) shall be non-blocking, show once per id, not pause, and
  auto-dismiss after ~5.5 s (only if not replaced by a newer tip).
- **REQ-DLG-004** — A quip (`_megQuip`) shall be a short non-blocking one-liner that does not pause and
  is not deduped (fires every time), but shall be suppressed while blocking dialogue is up.
- **REQ-DLG-005** — On stage (re)load, all dialogue/tip references and queues shall be cleared, since
  the reused scene instance would otherwise hold GameObjects destroyed in the prior lifecycle.
