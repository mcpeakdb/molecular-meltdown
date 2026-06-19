# Enemies & Bosses

Enemy types and AI, status effects (bleed/slow), and boss phases/attacks. Sources:
[`src/entities/Enemy.ts`](../../src/entities/Enemy.ts),
[`src/entities/Boss.ts`](../../src/entities/Boss.ts).

## Enemy types

`CONFIGS` in `Enemy.ts` — `EnemyType` ∈ bacterium, virus, dustbunny, pollen, amoeba, spore, mite.

| Type | HP | Speed | Dmg | AtkRate | Fly | Notes |
|------|----|-------|-----|---------|-----|-------|
| bacterium | 35 | 90 | 10 | 1600 | no | baseline ground |
| virus | 22 | 130 | 8 | 1200 | yes | hovers |
| dustbunny | 50 | 60 | 14 | 2000 | no | hops, tanky |
| pollen | 18 | 160 | 6 | 900 | yes | fast flyer |
| amoeba | 80 | 48 | 16 | 2200 | no | slow tank (sector 2+) |
| spore | 14 | 180 | 7 | 800 | yes | fast hoverer (sector 2+) |
| mite | 30 | 115 | 11 | 1300 | no | hops, crawler (sector 3+) |

- **REQ-ENEMY-001** — On spawn, an enemy shall take HP/speed from `CONFIGS` scaled by the difficulty
  (`enemyHp`, `enemySpeed`); flyers shall disable gravity, ground types shall fall under gravity and
  get a floor/ledge collider from `GameScene`.

## Activation gate

- **REQ-ENEMY-010** — An enemy shall not be considered "entered view" until its x has been inside the
  camera's world view at least once.
- **REQ-ENEMY-011** — IF an enemy has not entered view, THEN it shall be immune to all damage and
  bleed (`takeDamage`/`applyBleed` no-op). This prevents screen-wide specials killing offscreen foes.
- **REQ-ENEMY-012** — WHILE an enemy has entered view, it shall be clamped to the visible arena
  (`view.x+24 … view.right-24`) so it cannot drift to an unreachable corner and seal the exit.

## AI states

States: PATROL, CHASE, ATTACK, HURT, DEAD.

- **REQ-ENEMY-020** — WHILE patrolling, an enemy shall drift horizontally in a random direction,
  re-rolling the direction on a 1.2–2.8 s timer; gravity (ground) or hover (flyer) owns the Y axis.
- **REQ-ENEMY-021** — WHEN the player comes within `DETECT_RANGE` (320), the enemy shall enter CHASE;
  WHEN the player leaves that range, it shall return to PATROL.
- **REQ-ENEMY-022** — WHILE chasing, a ground enemy shall steer horizontally toward the player; a
  flyer shall also climb/dive toward the player's height.
- **REQ-ENEMY-023** — WHEN within `ATTACK_RANGE` (58), the enemy shall enter ATTACK and stop; it shall
  return to CHASE when the player moves beyond `ATTACK_RANGE × 1.4`.
- **REQ-ENEMY-024** — WHILE attacking and off cooldown (`attackRate`), the enemy shall deal contact
  damage to the player, UNLESS the player is cleanly clearing it mid-jump (REQ-PLAYER-054).
- **REQ-ENEMY-025** — Flyers shall be clamped to the `FLYER_MIN_Y…FLYER_MAX_Y` band and bob while not
  chasing; dustbunny/mite shall perform real arcade hops on a timer while grounded.
- **REQ-ENEMY-026** — Each type shall have a distinct idle animation (pulse, spin, tumble, wobble,
  squash/stretch) per `_applyIdleAnim`.

## Damage & status effects

- **REQ-ENEMY-030** — WHEN an enemy takes damage (and is on-screen and not dead), it shall subtract
  HP, enter HURT briefly, squash, freeze then launch in the knockback direction after a short stagger,
  and flash white.
- **REQ-ENEMY-031** — WHERE an attack applies slow, the enemy's speed shall drop to 30% for ~2 s and
  it shall tint green for the duration.
- **REQ-ENEMY-032** — WHERE an attack applies bleed (`applyBleed(dmg, duration)`), the enemy shall
  take `dmg` every 400 ms for the duration (taking the longer of any overlapping bleeds), flashing red
  per tick.
- **REQ-ENEMY-033** — WHEN an enemy's HP reaches 0 (from a hit or a bleed tick), it shall die: enter
  DEAD, notify `GameScene.onEnemyDeath`, and fade/rise out before destroying its sprite.
- **REQ-ENEMY-034** — IF an enemy falls off a ledge below the screen, THEN it shall die (counting
  toward the clear rather than getting stuck offscreen).

## Bosses

`VARIANTS` in `Boss.ts` — one per sector finale.

| Variant | Sector | HP | Speed | Dmg | Volley | Spread |
|---------|--------|----|-------|-----|--------|--------|
| bacterium (SUPER BACTERIUM) | 1 (stage 3) | 500 | 140 | 22 | 3 shots | 0.30 rad |
| amoeba (AMOEBA TITAN) | 2 (stage 6) | 850 | 120 | 26 | 5 shots | 0.26 rad |
| phage (PHAGE LORD) | 3 (stage 9) | 1300 | 175 | 32 | 7 shots | 0.22 rad |

Boss base stats are also scaled by difficulty (`enemyHp`, `enemySpeed`).

- **REQ-BOSS-001** — A boss shall hover under its own velocity (no gravity) around a fixed `anchorX`
  and shall never pursue the player.
- **REQ-BOSS-002** — A boss shall remain dormant until the player comes within 500 px, then it shall
  `activate()`: show its HP bar, roar, shake, emit `boss-activated`, sweep in from off-right to its
  anchor (ENTER phase), then settle into the IDLE attack loop.
- **REQ-BOSS-003** — IF a boss has not activated, THEN it shall be immune to all damage (so a
  screen-wide special cannot kill it offscreen and soft-lock the stage). The boss is immune to bleed
  always.
- **REQ-BOSS-004** — WHILE idle and off its action timer, the boss shall pick an attack, telegraph it
  with a pulsing tint flash, then fire it; a fired attack sets a recovery window before the next.
- **REQ-BOSS-005** — Attack aggression shall ramp as HP drops: telegraph and recovery windows shorten
  at ≤60% and ≤30% HP, and the attack pool grows more dangerous (more radial/barrage).
- **REQ-BOSS-006** — The boss attack kinds shall be: `volley` (aimed symmetric spread, sidestep),
  `radial` (full ring, move through a gap), `barrage` (re-aiming single shots, keep moving), `sweep`
  (a fan raking across the arena). Counts/spread vary per variant.
- **REQ-BOSS-007** — IF a telegraphed attack is interrupted (boss enters HURT/DEAD mid-wind-up), THEN
  the attack shall be dropped and re-chosen after recovery.
- **REQ-BOSS-008** — WHILE the player stands inside the boss body and off the contact cooldown, the
  boss shall deal half-damage contact (a deterrent against standing-and-mashing).
- **REQ-BOSS-009** — WHEN a boss is defeated, it shall hide its HP bar, shake, play a chain of
  flashes, scale-fade out, and notify `GameScene.onBossDefeated`.
- **REQ-BOSS-010** — Enemy projectiles (from `_aimedSpread`/`_radialBurst`/`_barrage`/`_sweep`) shall
  live in `enemyProjectileGroup`; WHEN one overlaps the player it shall deal its damage and be
  destroyed; projectiles leaving the world/screen shall be destroyed.
