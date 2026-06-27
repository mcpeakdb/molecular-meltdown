# Player

Movement, jumping, basic melee, damage, invincibility, death, and the freeze state.
Source: [`src/entities/Player.ts`](../../src/entities/Player.ts). Attack effects live in
[combat-and-attacks.md](combat-and-attacks.md).

## Lifecycle & state

- **REQ-PLAYER-001** — A fresh `Player` shall be constructed at the stage start position
  (`x=120`, just above the floor) each time a stage loads; per-run state is not carried in the entity.
- **REQ-PLAYER-002** — The player shall start with `hp = PLAYER_MAX_HP` (100), facing right, alive,
  not frozen, and own its own `ElementSystem`.
- **REQ-PLAYER-003** — On construction, the player shall set its invincibility window from the
  difficulty (`DIFFICULTY_SCALE[difficulty].invincMs`) and its weapon-slot count from the difficulty.
- **REQ-PLAYER-004** — The player's on-screen size shall be enforced independently of its frame
  textures' source resolutions: each animation frame's opaque content box (measured once at boot in
  `BootScene` → registry `playerFrameBounds`) shall be fit to `PLAYER_CONTENT_H` tall as the
  walk/idle/jump frames swap. The physics body (hitbox) shall be set to that content box, so the
  hitbox matches the on-screen scientist with its bottom on his feet (`PLAYER_FEET_OFFSET` below the
  sprite centre). Squash/stretch (e.g. the landing pop) shall be applied as a multiplier on the fit.

## Movement

- **REQ-PLAYER-010** — WHILE alive and not frozen, the player shall move horizontally at
  `PLAYER_SPEED` from ←/→ or A/D, or proportionally from the touch thumbstick's X axis.
- **REQ-PLAYER-011** — The player's vertical motion shall be owned entirely by gravity and jump
  impulses (true arcade physics); horizontal input never sets Y.
- **REQ-PLAYER-012** — The player shall face the direction of horizontal travel and flip its sprite
  accordingly; `facingRight` shall determine attack direction.
- **REQ-PLAYER-013** — WHILE on the ground, the player shall play the walk animation when moving and
  the idle animation when still; WHILE airborne it shall hold the jump pose.
- **REQ-PLAYER-014** — The player shall be confined to the world bounds (or, during a boss fight, the
  boss arena bounds — see [stages-and-platforming.md](stages-and-platforming.md)).

## Jumping

- **REQ-PLAYER-020** — WHEN jump is pressed (Space, ↑, W, or the touch jump button) and the player is
  on the ground, the player shall apply `PLAYER_JUMP_VELOCITY` upward and a takeoff squash-stretch.
- **REQ-PLAYER-021** — WHEN jump is pressed while airborne and fewer than `PLAYER_MAX_JUMPS` (2)
  jumps have been used, the player shall apply `PLAYER_DOUBLE_JUMP_VELOCITY` upward, play a mid-air
  roll, and emit a double-jump flourish (nova, burst, flash, bounce SFX, small shake).
- **REQ-PLAYER-022** — WHEN the player lands after being airborne, the jump count shall reset to 0,
  any air-roll shall end, and a landing squash shall play.
- **REQ-PLAYER-023** — WHEN the player is launched by a bounce pad (`superJump`), it shall apply the
  given velocity, treat the ground jump as spent but leave one air jump available.
- **REQ-PLAYER-024** — A drop shadow shall be projected onto the main floor, shrinking and fading as
  the player rises above it.

## Basic melee (punch)

- **REQ-PLAYER-030** — WHILE weapon slot 1 is unarmed (no attack bound), pressing slot-1 (Z / first
  attack button) shall perform a basic punch, gated by `PLAYER_ATTACK_COOLDOWN` (400 ms).
- **REQ-PLAYER-031** — A basic punch shall damage every active enemy within `PLAYER_MELEE_RANGE`
  horizontally and 80 px vertically of the punch point, dealing `PLAYER_MELEE_DAMAGE` scaled by the
  current combo multiplier, knocking back in the facing direction; it shall play the punch SFX, a
  punch-arm graphic, and a small shake.
- **REQ-PLAYER-032** — WHEN a punch hits at least one enemy, the player shall register a combo hit.
- **REQ-PLAYER-033** — The player shall draw no separate arm graphics while idle/walking (the sprite
  art carries its own arms). Only WHILE attacking shall a single punch arm appear, extended in the
  facing direction (`_spawnPunchArm` → `_updatePunchArm`); it is hidden during a front roll.

## Combo

- **REQ-PLAYER-040** — WHEN any attack hits at least one enemy, the combo count shall increment and
  the multiplier shall become `1 + floor(comboCount / 5) * 0.5`; a `combo-update` event shall fire.
- **REQ-PLAYER-041** — WHEN the player takes damage, the combo count and multiplier shall reset to
  0 / 1 and a `combo-update` shall fire.

## Damage, invincibility & death

- **REQ-PLAYER-050** — WHEN `takeDamage` is called and the player is alive and not invincible, the
  player shall subtract the amount from HP (floored at 0), reset the combo, start the post-hit
  invincibility timer, and flash red briefly.
- **REQ-PLAYER-051** — WHILE the post-hit invincibility timer is active, further damage shall be
  ignored and the sprite shall flicker.
- **REQ-PLAYER-052** — WHILE the Nitric-Oxide radical buff is active, the player shall be invincible
  (`isInvincible`/`isRadicalActive` true) and shall ram enemies for contact damage (see
  [combat-and-attacks.md](combat-and-attacks.md)).
- **REQ-PLAYER-053** — WHEN HP reaches 0, the player shall die: become not-alive, freeze in place,
  clear its visuals, tint grey, play the death SFX, and after ~900 ms notify `GameScene.onPlayerDeath`.
- **REQ-PLAYER-054** — WHILE airborne with downward velocity below a small threshold (`isClearingEnemy`),
  a well-timed jump shall let the player clear an enemy's *contact* attack (projectiles still hit).
- **REQ-PLAYER-055** — WHEN the player lands, IF the net drop below the takeoff point exceeds
  `FALL_DAMAGE_SAFE_HEIGHTS × PLAYER_HEIGHT` (≈3 body-heights), THEN the player shall take fall
  damage scaling with the extra distance (`FALL_DAMAGE_PER_PX`), capped at `FALL_DAMAGE_MAX`, with a
  landing thud/shake/burst. Fall distance is measured from the surface last left (takeoff), NOT the
  jump apex, so jumping straight up and landing where you started never causes damage.
- **REQ-PLAYER-056** — The takeoff reference shall be captured when the player leaves the ground and
  reset on a pit respawn (`resetFall`), so a respawn teleport's drop is not counted as a fall.

## Freeze

- **REQ-PLAYER-060** — WHEN `freeze()` is called (stage clear, boss defeat, or death), the player
  shall zero its velocity/acceleration, disable its gravity, end any roll, and ignore all input until
  the next stage builds a fresh player. (Physics keeps stepping after `GameScene.update` early-returns,
  so killing gravity is required to stop an airborne player drifting down.)
