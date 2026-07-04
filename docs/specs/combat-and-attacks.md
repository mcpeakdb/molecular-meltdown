# Combat & Attacks

The data-driven attack registry, per-attack dispatch, cooldowns, and the effect of each
element/compound at each tier. Sources: [`src/constants.ts`](../../src/constants.ts) (`ATTACKS`),
[`src/entities/Player.ts`](../../src/entities/Player.ts) (`_special*`, `_dispatchAttack`).

## Attack model

- **REQ-ATK-001** — Every attack shall be one entry in the `ATTACKS` registry, keyed by `AttackId`
  (an `ElementType` excluding `NONE` and `GOLD`), carrying its `recipe`, `slot` priority, `color`,
  three `tierNames`, and `cooldownMs`.
- **REQ-ATK-002** — An attack's **level** (1–3) shall be the number of complete copies of its recipe
  the owned atoms can assemble, capped at `MAX_ELEMENT_LEVEL` (3); level 0 = unavailable. (Defined in
  `ElementSystem.levelFor`; see [elements-and-progression.md](elements-and-progression.md).)
- **REQ-ATK-003** — `ATTACK_ORDER` shall be the `ATTACKS` ids sorted ascending by `slot`, and shall
  be the canonical ordering for menus, the choice preview, and the HUD.
- **REQ-ATK-004** — WHEN a weapon-slot key is pressed and an attack is bound to that slot, the player
  shall fire that attack via `_fireAttack`; an unbound slot 1 shall instead punch (REQ-PLAYER-030).

## Firing & cooldowns

- **REQ-ATK-010** — `_fireAttack` shall do nothing IF the player is dead, the attack's level is 0, or
  the attack's own cooldown is still active.
- **REQ-ATK-011** — WHEN an attack fires, the player shall start that attack's independent cooldown
  and dispatch the tier-specific effect in the facing direction.
- **REQ-ATK-012** — Each attack shall have its own cooldown keyed by id (cooldowns tick down per
  frame, independent across attacks). Nitric Oxide's cooldown shall be `2×` its buff duration for the
  level; all others use their fixed `cooldownMs`.
- **REQ-ATK-013** — `_dispatchAttack` shall route each `AttackId` to its `_special*` handler; adding a
  new attack requires a new handler and a new branch here.

## Damage helpers

- **REQ-ATK-020** — `_damageArc(cx, cy, rangeX, rangeY, dmg, dir, slow?, knockback?)` shall damage
  every active enemy within the box around (cx,cy), applying knockback `dir × knockback` and an
  optional slow; it returns whether anything was hit.
- **REQ-ATK-021** — `_damageRadius(cx, cy, radius, dmg, slow?)` shall damage every active enemy within
  `radius`, knocking each away from the centre; it returns whether anything was hit.
- **REQ-ATK-022** — WHEN any special hits at least one enemy, the player shall register a combo hit
  (REQ-PLAYER-040).

## Per-attack behaviour (Lv1 / Lv2 / Lv3)

Damage values are multiples of `PLAYER_MELEE_DAMAGE` (12).

- **REQ-ATK-100 Hydrogen** — Lv1 *Proton Punch*: a heavier melee arc (~2× dmg) with shake/flash.
  Lv2 *Plasma Arc*: a fast crackling plasma bolt (~3× dmg) with trail + splash on impact. Lv3
  *Fusion Burst*: a radial detonation (~4× dmg, r≈190) with novas, burst and big shake.
- **REQ-ATK-110 Oxygen** — Lv1 *Oxidize*: a corrosive slashing arc (~1.5× dmg, slows). Lv2 *Reactive
  Cloud*: a lingering corrosive haze radius (~2× dmg, slows). Lv3 *Oxidation Nova*: a large corrosive
  blast (~3.5× dmg, r≈280, slows).
- **REQ-ATK-120 Carbon** — Lv1 *Carbon Claw*: triple rake arc (~1.8× dmg) that applies bleed to those
  hit. Lv2 *Diamond Shard*: a piercing crystalline bolt (~3× dmg). Lv3 *Graphene Shockwave*: an
  expanding ground crack that detonates (~5× dmg) with flung debris.
- **REQ-ATK-130 Nitrogen** — Lv1 *Nitrogen Frost*: a freezing arc (~1.5× dmg, slows). Lv2 *Cryo
  Burst*: a radial freeze (~2.5× dmg, slows). Lv3 *Absolute Zero*: a screen-wide flash-freeze that
  damages every enemy (~5× dmg) and slows.
- **REQ-ATK-140 Water** — Lv1 *Water Jet*: a pressurized projectile (~2× dmg). Lv2 *Hydro Wave*: a
  forward surge arc (~2.5× dmg) with shake. Lv3 *Tidal Force*: a towering travelling wave
  (`spawnTidalWave`) that damages and shoves enemies across the screen.
- **REQ-ATK-150 Ammonia** — Lv1/Lv2 *Caustic Spray / Acid Cloud*: a caustic radius (r 90/150) that
  damages and applies bleed. Lv3 *Toxic Deluge*: a full-screen caustic haze that damages every enemy
  and applies a long bleed.
- **REQ-ATK-160 Carbon Dioxide** — Lv1/Lv2 *Smog Pulse / Suffocation Field*: a smog radius (r 100/180,
  ~2× dmg) plus a screen fog wash. Lv3 *Blackout*: choking smog that damages every enemy (~3× dmg)
  with a heavy screen fog + shake.
- **REQ-ATK-170 Methane** — A travelling gas bolt with a flame trail that detonates on first enemy
  contact or after ~650 ms. Blast radius/damage scale by tier (r 100/140/220; ~3×/3.5×/6× dmg); Lv2+
  adds delayed secondary flashes on nearby enemies.
- **REQ-ATK-180 Nitric Oxide** — A self-buff (not a strike): for `RADICAL_DURATIONS` (3000/5000/8000
  ms) the player gains a speed boost (×1.5/1.8/2.0) AND becomes invincible AND rams enemies for
  contact damage on a fast tick (~0.35× dmg). Its cooldown is `2×` the duration, so the buff has real
  downtime. An aura graphic pulses for the duration.
- **REQ-ATK-190 Carbonic Acid** — Lv1/Lv2 *Acid Drop / Corrosive Spray*: 5/9 acid drops rain in front
  of the player (~1.2× dmg each), Lv2 also applies bleed. Lv3 *Acid Rain*: one drop targeted on each
  active enemy (~2× dmg + bleed).
- **REQ-ATK-200 Sulfur** — brimstone: Lv1 *Brimstone Lash* a searing arc (~1.6× dmg + burn bleed);
  Lv2 *Sulfur Burn* a lingering burning cloud (r 150, ~2× dmg + bleed); Lv3 *Brimstone Storm* a big
  firestorm nova (r 280, ~3.5× dmg + heavy bleed).
- **REQ-ATK-210 Chlorine** — poison gas: Lv1/Lv2 *Chlorine Gas / Bleach Cloud* a lingering green cloud
  (r 110/165, ~1.5/2× dmg + bleed, Lv2 slows); Lv3 *Mustard Fog* a screen-filling haze (~2× dmg +
  strong bleed on all).
- **REQ-ATK-220 Phosphorus** — incendiary: Lv1 *Ember Spark* an igniting bolt (~2× dmg); Lv2 *White
  Phosphorus* a blinding burst (r 170, ~2.5× dmg + burn bleed); Lv3 *Incendiary Rain* burning
  phosphorus on every enemy (~2.5× dmg + heavy bleed).
- **REQ-ATK-230 Hydrogen Sulfide (H₂S)** — a toxic gas radius (r 100/160/210) that damages
  (~1.4/1.9/2.4×) and poisons (bleed) everything inside.
- **REQ-ATK-240 Sulfur Dioxide (SO₂)** — a choking smog: Lv1/Lv2 a fog + suffocation radius
  (r 110/185, ~2× dmg, Lv2 slows); Lv3 *Sulfur Cloudburst* a whole-screen choke (~3× dmg on all).
- **REQ-ATK-250 Sulfuric Acid (H₂SO₄)** — the strongest corrosive: Lv1 *Vitriol Splash* an acid arc
  (~2× dmg + bleed); Lv2 *Oil of Vitriol* a searing pool (r 165, ~2.8× dmg + bleed); Lv3 *Sulfuric
  Dissolve* a colossal blast (r 300, ~4× dmg + heavy bleed, all slowed).
- **REQ-ATK-260 Hydrochloric Acid (HCl)** — Lv1 *Muriatic Spit* a corrosive bolt (~2× dmg); Lv2
  *Hydrochloric Spray* a corrosive fan (~2.4× dmg + bleed); Lv3 *Chloride Meltdown* a wide corrosive
  detonation (r 260, ~3.2× dmg + bleed).
- **REQ-ATK-270 Phosphine (PH₃)** — a travelling flammable gas bolt (like Methane) that detonates on
  first enemy contact or after 650 ms into green fire (r 100/145/220, ~3/3.5/5.5× dmg, Lv2+ bleed).
- **REQ-ATK-280 Phosphoric Acid (H₃PO₄)** — an etching acid rain (like Carbonic Acid): 5/9 drops in
  front (~1.4× each, Lv2 bleed); Lv3 *Phosphoric Rain* one drop per enemy (~2× dmg + bleed).
- **REQ-ATK-290 Phosphorus Trichloride (PCl₃)** — fumes (cross-combo of the two new atoms): Lv1
  *Fuming Splash* a corrosive arc leaving smoke (~1.8× dmg + bleed); Lv2 *Smoking Corrosive* a bolt
  bursting into a corrosive cloud (r 150, ~2× dmg + bleed, slows); Lv3 *Trichloride Storm* a billowing
  corrosive detonation (r 280, ~3.4× dmg + bleed).

## Super weapon — Prismatic Beam

The noble-gas super weapon (`SUPER_ATTACK_ID = ELEMENTS.PRISMATIC`). Unlock/availability is in
[elements-and-progression.md](elements-and-progression.md) (REQ-SUPER-*); this section covers its
firing/effect.

- **REQ-ATK-300** — The Prismatic Beam shall be a first-class `AttackId` with a registry entry
  (color, name, `cooldownMs` 5000) but no atom recipe; it is excluded from `ATTACK_ORDER` so the
  recipe machinery never derives it.
- **REQ-ATK-301** — WHILE armed, the Prismatic Beam shall behave like any other weapon: it occupies a
  normal Z/X/C slot, dispatches through `_fireAttack`/`_dispatchAttack`, shows on the HUD chips and
  touch buttons (symbol ✦), respects its 5-second cooldown, and is re-bindable via Compound Selection.
- **REQ-ATK-302** — WHEN fired (`_specialPrismatic`), the weapon shall deal `PLAYER_MELEE_DAMAGE × 10`
  to every active enemy ahead of the muzzle within its lane (≈900 px long, ±~70 px tall in the facing
  direction), knocking them back, and shall render a piercing rainbow beam (stacked colour bands +
  white-hot core) with a muzzle burst, screen flash, and shake. It is a single fixed power tier.

## Reusable juice helpers (visual)

- **REQ-ATK-200** — `GameScene` shall provide colour-parameterized visual helpers used by attacks and
  pickups: `spawnHitFlash`, `spawnBurst`, `spawnNova`, `spawnSlashArc`, `spawnCloud`, `spawnAtomBurst`,
  `spawnProjectile`, `spawnPiercingProjectile`, `spawnPlasmaBolt`, `spawnTidalWave`,
  `spawnEnemyProjectile`. These are visual/effect-only except where they carry damage payloads.
- **REQ-ATK-201** — Player projectiles shall live in `projectileGroup`; WHEN a player projectile
  overlaps an enemy it shall deal its `damage` with knockback and be destroyed unless `piercing`.
  Projectiles that leave the world horizontally shall be destroyed.
