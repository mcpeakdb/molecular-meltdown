# Molecular Meltdown — EARS Specifications

This directory holds **behavioural specifications** for the game, written in the EARS
(Easy Approach to Requirements Syntax) style. They describe *what the game does*, derived
from the current implementation, so that future work has a single, readable reference for
how each subsystem behaves without re-reading every source file.

These specs are **descriptive of the shipped behaviour**, not aspirational. When you change
behaviour, update the affected spec in the same change (treat it like `PATCH_NOTES.md`). If a
spec and the code ever disagree, the code is the truth — fix the spec.

## How to read EARS

Every requirement uses one of these sentence shapes:

| Pattern | Shape | Use |
|---------|-------|-----|
| **Ubiquitous** | The `<system>` shall `<response>`. | An always-true rule. |
| **Event-driven** | WHEN `<trigger>`, the `<system>` shall `<response>`. | Reaction to an event. |
| **State-driven** | WHILE `<state>`, the `<system>` shall `<response>`. | Behaviour during a state. |
| **Unwanted** | IF `<condition>`, THEN the `<system>` shall `<response>`. | Guard / error / edge case. |
| **Optional** | WHERE `<feature is present>`, the `<system>` shall `<response>`. | Conditional on config/device. |
| **Complex** | Combinations, e.g. WHILE `<state>`, WHEN `<trigger>`, the `<system>` shall `<response>`. | |

Requirements are given stable IDs (`REQ-<AREA>-NNN`) so they can be cross-referenced.

## Index

| Spec | Covers | Primary source |
|------|--------|----------------|
| [glossary.md](glossary.md) | Shared terms, key constants, world geometry | `src/constants.ts` |
| [navigation-and-scenes.md](navigation-and-scenes.md) | Boot, scene graph, all menu screens | `src/main.ts`, `src/scenes/*` |
| [player.md](player.md) | Movement, jumping, melee, damage, death, freeze | `src/entities/Player.ts` |
| [combat-and-attacks.md](combat-and-attacks.md) | Attack registry, per-element specials, cooldowns, combo | `src/entities/Player.ts`, `src/constants.ts` |
| [enemies-and-bosses.md](enemies-and-bosses.md) | Enemy AI/types, bleed/slow, boss phases & attacks | `src/entities/Enemy.ts`, `src/entities/Boss.ts` |
| [stages-and-platforming.md](stages-and-platforming.md) | Stage data, gaps, hazards, pads, crumble, exit, boss arena | `src/stages.ts`, `src/scenes/GameScene.ts` |
| [elements-and-progression.md](elements-and-progression.md) | Atoms, ElementSystem, choice cards, loadout | `src/systems/ElementSystem.ts`, `src/entities/Atom.ts`, `src/scenes/ElementChoiceScene.ts` |
| [scoring-and-persistence.md](scoring-and-persistence.md) | Scoring, save data, leaderboard, unlocks, passcodes, noble gases | `src/systems/SaveSystem.ts`, `src/systems/Passcode.ts` |
| [hud-and-input.md](hud-and-input.md) | HUD, keyboard input, on-screen touch controls | `src/scenes/HUDScene.ts`, `src/systems/TouchControls.ts` |
| [audio-and-settings.md](audio-and-settings.md) | SFX, procedural music, global settings | `src/systems/SoundSystem.ts`, `src/systems/MusicSystem.ts`, `src/systems/Settings.ts` |
| [tutorial.md](tutorial.md) | M.E.G.-guided intro, dialogue, proximity tips, quips | `src/scenes/GameScene.ts` |

## Conventions used in these specs

- **"the game"** refers to the whole runtime; named subsystems (Player, Enemy, GameScene, HUD,
  ElementSystem, SaveSystem, etc.) match the classes in `src/`.
- Numeric values (damage, speed, ms, px) are quoted from `src/constants.ts` and the per-entity config
  tables. They are the source of truth at the time of writing; if a constant changes, the spec value
  is stale — prefer the constant name where one exists.
- "the player" = the controllable scientist entity; "the player-character" and "the scientist" are
  synonyms.
