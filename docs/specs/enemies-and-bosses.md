# Enemies & Bosses

Enemy types and AI, status effects (bleed/slow), and boss phases/attacks. Sources:
[`src/entities/Enemy.ts`](../../src/entities/Enemy.ts),
[`src/entities/Boss.ts`](../../src/entities/Boss.ts).

## Enemy types

`CONFIGS` in `Enemy.ts` — `EnemyType` ∈ bacterium, virus, dustbunny, pollen, amoeba, spore, mite.

| Type | HP | Speed | Dmg | AtkRate | Fly | Notes |
|------|----|-------|-----|---------|-----|-------|
| bacterium | 35 | 90 | 10 | 1600 | no | baseline ground |
| virus | 22 | 130 | 8 | 1400 | yes | hovers, ranged (single virion) |
| dustbunny | 50 | 60 | 14 | 2000 | no | hops, tanky |
| pollen | 18 | 160 | 6 | 1100 | yes | fast flyer, ranged (3-shot spread) |
| amoeba | 80 | 48 | 16 | 2200 | no | slow tank (sector 2+) |
| spore | 14 | 180 | 7 | 800 | yes | fast hoverer (sector 2+) |
| mite | 30 | 115 | 11 | 1300 | no | hops, crawler (sector 3+) |
| ant | 24 | 150 | 9 | 950 | no | fast ground swarmer, scurries (sector 4) |
| fly | 16 | 205 | 8 | 850 | yes | very fast, fragile flyer (sectors 5–6) |
| bee | 42 | 150 | 14 | 1100 | yes | tougher, aggressive flyer (sectors 5–6) |

- **REQ-ENEMY-001** — On spawn, an enemy shall take HP/speed from `CONFIGS` scaled by the difficulty
  (`enemyHp`, `enemySpeed`); flyers shall disable gravity, ground types shall fall under gravity and
  get a floor/ledge collider from `GameScene`.
- **REQ-ENEMY-002** — On spawn, an enemy's on-screen size shall be enforced independently of its
  source texture's pixel resolution: the sprite shall be fit (by its longest edge) into a
  `BASE_DISPLAY × cfg.scale` box, never upscaled beyond `cfg.scale`. The computed `baseScale` shall
  be the basis for all squash/stretch animation. The physics body (hitbox) shall be the full sprite
  frame, so that — with art cropped tight to the creature — the hitbox matches the on-screen image.
- **REQ-ENEMY-003** — On spawn, an enemy of a type with interchangeable art variants
  (`TEXTURE_VARIANTS`: bacterium, virus, pollen, amoeba, spore, mite) shall pick one of its variant
  textures at random; all other types use their single configured texture. Variant choice is purely
  visual and does not affect stats, body, or behaviour.

## Activation gate

- **REQ-ENEMY-010** — An enemy shall not be considered "entered view" until its x has been inside the
  camera's world view at least once.
- **REQ-ENEMY-011** — IF an enemy has not entered view, THEN it shall be immune to all damage and
  bleed (`takeDamage`/`applyBleed` no-op). This prevents screen-wide specials killing offscreen foes.
- **REQ-ENEMY-012** — In normal play enemies shall roam freely and may wander off-screen (kept inside
  the level only by the world-bounds collider). WHILE a boss arena is locked, enemies shall instead be
  clamped to the arena (`arena.left+24 … arena.right-24`) so they stay reachable while the player is
  penned in.

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
- **REQ-ENEMY-027** — A ranged enemy (`cfg.ranged`: virus, pollen) shall, WHILE the player is within
  `ranged.range` and on-screen, fire a projectile volley toward the player off the shared
  `attackRate` cooldown (`spawnEnemyProjectile`), and WHILE chasing within that range shall hold a
  standoff hover (~`range × 0.6`) — retreating when crowded, easing in when too far — instead of
  closing to melee. virus fires a single fast shot; pollen fires a 3-shot spread.
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
- **REQ-ENEMY-034** — IF a ground enemy sinks below the floor surface WHILE over a real hole (an
  authored gap or open crumble pit) and drops below the screen, THEN it shall die (counting toward
  the clear rather than getting stuck offscreen).
- **REQ-ENEMY-035** — IF a ground enemy sinks below the floor surface while NOT over a hole (it has
  clipped through solid floor), THEN it shall be recovered to its spawn point with zeroed velocity
  and returned to PATROL, so it stays reachable and cannot strand the stage clear. Flyers have no
  gravity and are exempt.

## Bosses

`VARIANTS` in `Boss.ts` — one per sector finale.

| Variant | Sector | HP | Speed | Dmg | Volley | Spread |
|---------|--------|----|-------|-----|--------|--------|
| bacterium (SUPER BACTERIUM) | 1 (stage 3) | 500 | 140 | 22 | 3 shots | 0.30 rad |
| amoeba (AMOEBA TITAN) | 2 (stage 6) | 850 | 120 | 26 | 5 shots | 0.26 rad |
| phage (PHAGE LORD) | 3 (stage 9) | 1300 | 175 | 32 | 7 shots | 0.22 rad |
| roach (ROACH KING) | 4 (stage 12) | 1600 | 185 | 34 | 8 shots | 0.20 rad |
| beetle (DUNG BEETLE) | 5 (stage 15) | 2000 | 110 | 38 | 6 shots | 0.28 rad |
| hornet (HORNET QUEEN) | 6 (stage 18) | 2200 | 200 | 36 | 9 shots | 0.18 rad |

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
