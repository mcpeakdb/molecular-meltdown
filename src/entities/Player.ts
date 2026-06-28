import Phaser from 'phaser';
import {
  ATTACKS,
  type AttackId,
  DEPTH,
  ELEMENT_COLORS,
  ELEMENTS,
  FALL_DAMAGE_MAX,
  FALL_DAMAGE_PER_PX,
  FALL_DAMAGE_SAFE_HEIGHTS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  GROUND_TOP_Y,
  PLAYER_ATTACK_COOLDOWN,
  PLAYER_DOUBLE_JUMP_VELOCITY,
  PLAYER_HEIGHT,
  PLAYER_INVINCIBILITY_MS,
  PLAYER_JUMP_VELOCITY,
  PLAYER_MAX_HP,
  PLAYER_MAX_JUMPS,
  PLAYER_MELEE_DAMAGE,
  PLAYER_MELEE_RANGE,
  PLAYER_SPEED,
} from '../constants';
import type GameScene from '../scenes/GameScene';
import ElementSystem from '../systems/ElementSystem';
import SoundSystem from '../systems/SoundSystem';
import type { ArsenalEntry, EnemySprite, InputKeys, PlayerFrameBox } from '../types';

/** Nitric Oxide (Radical Rush) buff duration per tier, in ms. Its cooldown is twice this. */
const RADICAL_DURATIONS = [3000, 5000, 8000] as const;

// === Sprite sizing (resolution-independent) ===
// Player frames are authored at different source resolutions (high-res walk frames + a small jump
// frame), so the sprite is fit per-frame: the character's opaque content is rendered PLAYER_CONTENT_H
// px tall and the physics body is re-derived in source pixels so it stays a constant world size.
/** On-screen height (px) of the scientist's drawn body, regardless of the source PNG resolution. */
const PLAYER_CONTENT_H = 64;
/** Distance (px) from the sprite centre down to the feet — half the content height (content is centred). */
const PLAYER_FEET_OFFSET = PLAYER_CONTENT_H / 2;

export default class Player {
  scene: GameScene;
  hp: number = PLAYER_MAX_HP;
  alive: boolean = true;
  /** Halted in place until the next stage loads (death / stage clear / boss defeat). */
  frozen: boolean = false;
  facingRight: boolean = true;
  elementSystem: ElementSystem = new ElementSystem();
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

  comboCount = 0;
  comboMultiplier = 1;

  invincibilityMs = PLAYER_INVINCIBILITY_MS;

  private attackCooldown = 0;
  /** Per-attack cooldown remaining (ms), keyed by attack id. */
  private _cooldowns = new Map<AttackId, number>();
  private invincibleTimer = 0;
  private _hitFlash = false;
  private jumpCount = 0;
  private _onGround = false;
  private _wasOnGround = false;
  /**
   * World-Y of the ramp surface directly under the player this frame, or null when not over a ramp.
   * Set by {@link GameScene} before `update` (Arcade bodies are AABB-only, so sloped ledges are
   * walked via a per-frame snap rather than a real collider). See the ramp-snap block in `update`.
   */
  rampSurfaceY: number | null = null;
  /** Y of the surface the player last left (takeoff/walk-off point) — the reference for fall damage. */
  private _takeoffY = 0;
  private _isRolling = false;
  private _rollTween: Phaser.Tweens.Tween | null = null;
  private _jumpShadow!: Phaser.GameObjects.Graphics;
  private _jumpKey!: Phaser.Input.Keyboard.Key;
  private _speedBoost = 1.0;
  private _speedBoostTimer = 0;
  private _speedBoostAura: Phaser.GameObjects.Graphics | null = null;
  /** Opaque content box per frame texture, measured at boot — drives resolution-independent sizing. */
  private _frameBounds: Record<string, PlayerFrameBox> = {};
  /** Fit scale for the current frame (so its content renders PLAYER_CONTENT_H tall). */
  private _frameScale = 1;
  /** Momentary squash/stretch multipliers layered on top of the frame fit (e.g. landing). */
  private _squashX = 1;
  private _squashY = 1;
  private _punchArmGraphic: Phaser.GameObjects.Graphics | null = null;
  private _punchArmDir = 1;

  constructor(scene: GameScene, x: number, y: number) {
    this.scene = scene;
    this._frameBounds = (scene.registry.get('playerFrameBounds') ?? {}) as Record<string, PlayerFrameBox>;
    this.sprite = scene.physics.add.sprite(x, y, 'player_0') as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    this.sprite.setDepth(DEPTH.PLAYER);
    this.sprite.body.setCollideWorldBounds(true);
    this.sprite.body.setGravityY(GRAVITY);
    this.sprite.play('player_idle');
    // Normalize the spawn frame's on-screen size and collision body before the first update tick.
    this._fitFrame();
    this._takeoffY = y; // so the first landing from the spawn drop isn't counted as a fall
    this._jumpShadow = scene.add.graphics().setDepth(DEPTH.PLAYER - 1);
    this._jumpKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) as Phaser.Input.Keyboard.Key;
    // The player has no idle arms — only the transient punch arm, which this keeps glued to the body.
    scene.events.on('postupdate', this._updatePunchArm, this);
  }

  /** Airborne and not plummeting — a well-timed jump leaps clean over contact attacks (projectiles still hit). */
  get isClearingEnemy(): boolean {
    return !this._onGround && this.sprite.body.velocity.y < 120;
  }

  /** True whenever the player is off the ground. */
  get airborne(): boolean {
    return !this._onGround;
  }

  /** Y of the player's feet — the local "ground level" for ground-targeted FX. */
  private get _feetY(): number {
    return this.sprite.y + PLAYER_FEET_OFFSET;
  }

  /** True while the post-hit invincibility window is active (no further damage will land). */
  get isInvincible(): boolean {
    return this.invincibleTimer > 0 || this._speedBoostTimer > 0;
  }

  /** True while the Nitric Oxide radical buff is active — the player is immune and rams enemies. */
  get isRadicalActive(): boolean {
    return this._speedBoostTimer > 0;
  }

  update(time: number, delta: number, keys: InputKeys): void {
    if (!this.alive || this.frozen) return;

    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.invincibleTimer = Math.max(0, this.invincibleTimer - delta);
    this._tickCooldowns(delta);

    const flickerAlpha = this.invincibleTimer > 0 && Math.floor(time / 80) % 2 === 0 ? 0.3 : 1;
    this.sprite.setAlpha(flickerAlpha);

    const { cursors, wasd, slotKeys, touch } = keys;
    const left = cursors.left.isDown || wasd.A.isDown;
    const right = cursors.right.isDown || wasd.D.isDown;

    // Grounded state drives jumping, animation, and the shadow (real arcade physics now).
    this._onGround = this.sprite.body.onFloor();
    // Ramp snap: WHILE the player is over a slanted ledge and settling onto it (not jumping up),
    // clamp the feet to the slope surface and treat it as solid ground — gives a true walk-up ramp
    // on top of Arcade's AABB-only colliders. The upward-velocity guard keeps jumps off the ramp.
    if (this.rampSurfaceY !== null && this.sprite.body.velocity.y >= -20) {
      const feetY = this.sprite.y + PLAYER_FEET_OFFSET;
      if (feetY >= this.rampSurfaceY - 12 && feetY <= this.rampSurfaceY + 30) {
        this.sprite.y = this.rampSurfaceY - PLAYER_FEET_OFFSET;
        this.sprite.body.setVelocityY(0);
        this._onGround = true;
      }
    }
    if (this._onGround && this.sprite.body.velocity.y >= 0) this.jumpCount = 0;
    if (this._onGround && !this._wasOnGround) this._onLand();
    else if (!this._onGround && this._wasOnGround) this._takeoffY = this.sprite.y; // just left the ground
    this._wasOnGround = this._onGround;

    if (this._speedBoostTimer > 0) {
      this._speedBoostTimer -= delta;
      if (this._speedBoostTimer <= 0) {
        this._speedBoost = 1.0;
        if (this._speedBoostAura) {
          this._speedBoostAura.destroy();
          this._speedBoostAura = null;
        }
      }
    }

    const spd = PLAYER_SPEED * this._speedBoost;
    let vx = 0;
    if (touch && touch.moveX !== 0) {
      // Analog thumbstick — horizontal only now (depth movement is gone in the 2D side view).
      vx = touch.moveX * spd;
      if (touch.moveX < -0.05) this.facingRight = false;
      else if (touch.moveX > 0.05) this.facingRight = true;
    } else {
      if (left) {
        vx = -spd;
        this.facingRight = false;
      }
      if (right) {
        vx = spd;
        this.facingRight = true;
      }
    }

    // Horizontal via physics; vertical is owned by gravity + jump impulses.
    this.sprite.body.setVelocityX(vx);
    this.sprite.setFlipX(!this.facingRight);

    // Walk/idle on the ground; the jump pose is held while airborne
    if (this._onGround) {
      const currentAnim = this.sprite.anims.currentAnim?.key;
      if (vx !== 0 && currentAnim !== 'player_walk') this.sprite.play('player_walk');
      else if (vx === 0 && currentAnim !== 'player_idle') this.sprite.play('player_idle');
    } else if (this.sprite.anims.currentAnim?.key !== 'player_jump') {
      this.sprite.play('player_jump');
    }

    // Re-fit whichever frame is now showing: walk/idle/jump frames have different source
    // resolutions, so size + body must be recomputed as the animation swaps between them.
    this._fitFrame();

    // Drop shadow projected onto the main floor, fading/shrinking with height above it.
    const feetY = this.sprite.y + PLAYER_FEET_OFFSET;
    const heightAbove = GROUND_TOP_Y - feetY;
    if (heightAbove > 6) {
      const t = Math.min(1, heightAbove / 200);
      this._jumpShadow.setPosition(this.sprite.x, GROUND_TOP_Y + 4);
      this._jumpShadow.clear();
      this._jumpShadow.fillStyle(0x000000, 0.4 * (1 - t * 0.7));
      this._jumpShadow.fillEllipse(0, 0, 32 * (1 - t * 0.3), 10 * (1 - t * 0.3));
    } else {
      this._jumpShadow.clear();
    }

    if (this._hitFlash) {
      this.sprite.setTint(0xdd2222);
    } else if (this.elementSystem.type !== ELEMENTS.NONE) {
      const col = ELEMENT_COLORS[this.elementSystem.type];
      this.sprite.setTint(Phaser.Display.Color.IntegerToColor(col).lighten(40).color);
    } else {
      this.sprite.clearTint();
    }

    if (this._speedBoostAura) {
      this._speedBoostAura.setPosition(this.sprite.x, this.sprite.y).setDepth(DEPTH.PLAYER - 2);
    }

    // Jump on Space, Up/W, or the touch jump button.
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this._jumpKey) ||
      Phaser.Input.Keyboard.JustDown(cursors.up) ||
      Phaser.Input.Keyboard.JustDown(wasd.W) ||
      (touch?.jump ?? false);
    if (jumpPressed) this._doJump();
    const bindings = this.elementSystem.getBindings();
    for (let i = 0; i < slotKeys.length; i++) {
      const pressed = slotKeys[i].some((k) => Phaser.Input.Keyboard.JustDown(k)) || (touch?.slots.includes(i) ?? false);
      if (!pressed) continue;
      const id = i < bindings.length ? bindings[i] : null;
      if (id) this._fireAttack(id);
      else if (i === 0 && this.attackCooldown === 0) this._doMeleeAttack(); // slot 1 (Z) = punch while empty
    }

    this.scene.events.emit('arsenal-update', this.getArsenalUpdate());
  }

  /** Full HUD snapshot: bound weapon slots + owned-atom counts. */
  getArsenalUpdate() {
    return { slots: this.getSlots(), counts: this.elementSystem.getCounts() };
  }

  private _tickCooldowns(delta: number): void {
    for (const [id, t] of this._cooldowns) {
      const nt = t - delta;
      if (nt <= 0) this._cooldowns.delete(id);
      else this._cooldowns.set(id, nt);
    }
  }

  /** One HUD entry per bound weapon slot (null = empty), with live cooldown state. */
  getSlots(): (ArsenalEntry | null)[] {
    return this.elementSystem.getBindings().map((id, i) => {
      if (id === null) return null;
      const level = this.elementSystem.getAttackLevel(id);
      const def = ATTACKS[id];
      return {
        id,
        level,
        key: i + 1,
        name: def.tierNames[Math.max(0, level - 1)],
        color: def.color,
        cooldownRemaining: this._cooldowns.get(id) ?? 0,
        cooldownMs: this._cooldownFor(id, level),
      };
    });
  }

  /** Fire a specific bound attack. */
  private _fireAttack(id: AttackId): void {
    if (!this.alive) return;
    const level = this.elementSystem.getAttackLevel(id);
    if (level <= 0) return;
    if ((this._cooldowns.get(id) ?? 0) > 0) return;
    this._cooldowns.set(id, this._cooldownFor(id, level));
    const dir = this.facingRight ? 1 : -1;
    this._dispatchAttack(id, level, dir);
  }

  /** Per-attack cooldown. Radical Rush scales with its buff duration (2× duration); the rest are fixed. */
  private _cooldownFor(id: AttackId, level: number): number {
    if (id === ELEMENTS.NITRIC_OXIDE) return RADICAL_DURATIONS[level - 1] * 2;
    return ATTACKS[id].cooldownMs;
  }

  private _dispatchAttack(id: AttackId, level: number, dir: number): void {
    if (id === ELEMENTS.HYDROGEN) this._specialHydrogen(level, dir);
    else if (id === ELEMENTS.OXYGEN) this._specialOxygen(level, dir);
    else if (id === ELEMENTS.WATER) this._specialWater(level, dir);
    else if (id === ELEMENTS.CARBON) this._specialCarbon(level, dir);
    else if (id === ELEMENTS.NITROGEN) this._specialNitrogen(level, dir);
    else if (id === ELEMENTS.AMMONIA) this._specialAmmonia(level, dir);
    else if (id === ELEMENTS.CARBON_DIOXIDE) this._specialCarbonDioxide(level, dir);
    else if (id === ELEMENTS.METHANE) this._specialMethane(level, dir);
    else if (id === ELEMENTS.NITRIC_OXIDE) this._specialNitricOxide(level, dir);
    else if (id === ELEMENTS.CARBONIC_ACID) this._specialCarbonicAcid(level, dir);
    else if (id === ELEMENTS.PRISMATIC) this._specialPrismatic(level, dir);
  }

  private _doJump(): void {
    if (!this.alive) return;

    if (this._onGround) {
      // First jump — upward impulse with a takeoff stretch
      this.sprite.body.setVelocityY(-PLAYER_JUMP_VELOCITY);
      this.jumpCount = 1;
      this.sprite.play('player_jump');
      this._squashPulse(0.9, 1.15, 110);
    } else if (this.jumpCount < PLAYER_MAX_JUMPS) {
      // Air jump — a dramatic re-boost with a snappy flip and a kick-off flourish.
      this.sprite.body.setVelocityY(-PLAYER_DOUBLE_JUMP_VELOCITY);
      this.jumpCount = Math.max(this.jumpCount, 1) + 1;
      this._startRoll();
      this._doubleJumpFx();
    }
  }

  /** Mid-air flourish for the double jump: a downward kick-off puff, shockwave ring, flash + boing. */
  private _doubleJumpFx(): void {
    const x = this.sprite.x;
    const y = this.sprite.y + 14;
    SoundSystem.play(this.scene.audioCtx, 'bounce');
    this.scene.spawnNova(x, y, 0x88ccff, 72, { rings: 2, life: 18, lineWidth: 3 });
    this.scene.spawnBurst(x, y, 0xcfe6ff, { count: 14, speed: [90, 240], angle: [55, 125], lifespan: 360, scale: 1.0 });
    this.scene.spawnHitFlash(x, y, 0xaad4ff, 38);
    this.scene.shake(90, 0.005);
  }

  /** Launched off a bounce pad: a high arc that still leaves the airborne double-jump available. */
  superJump(velocity: number): void {
    if (!this.alive) return;
    this.sprite.body.setVelocityY(-velocity);
    this.jumpCount = 1; // the ground jump is spent, but one air jump remains
    this.sprite.play('player_jump');
    this._squashPulse(0.82, 1.22, 120);
  }

  private _startRoll(): void {
    this._isRolling = true;
    this._rollTween?.remove();
    // Forward roll in the direction the player faces
    const dir = this.facingRight ? 1 : -1;
    this.sprite.setRotation(0);
    this._rollTween = this.scene.tweens.add({
      targets: this.sprite,
      rotation: dir * Math.PI * 2,
      duration: 300,
      ease: 'Cubic.Out',
      onComplete: () => this._endRoll(),
    });
  }

  private _endRoll(): void {
    if (!this._isRolling) return;
    this._isRolling = false;
    this._rollTween?.remove();
    this._rollTween = null;
    this.sprite.setRotation(0);
  }

  /**
   * Fit the currently-shown animation frame to a constant on-screen size and re-derive the physics
   * body, so frames of different source resolutions (walk vs. jump) and any transparent margins all
   * render the scientist at PLAYER_CONTENT_H tall with the body grounded on his feet.
   */
  private _fitFrame(): void {
    const box = this._frameBounds[this.sprite.texture.key];
    if (!box) return;
    this._frameScale = PLAYER_CONTENT_H / box.h;
    this._applyScale();
    // Hitbox = the character's opaque content box (the visible image), with its bottom on his feet.
    // The Arcade body scales with the sprite, so a squash/stretch would otherwise shrink the body —
    // and a vertical squash on landing would lift its bottom off the floor, retriggering the land in
    // a jitter loop. Divide out the squash here so the *physics* body stays put while the sprite
    // still deforms visually. (At rest squash = 1, so this reduces to the plain content box.)
    const ox = this.sprite.displayOriginX;
    const oy = this.sprite.displayOriginY;
    this.sprite.body.setSize(box.w / this._squashX, box.h / this._squashY, false);
    this.sprite.body.setOffset(ox + (box.x - ox) / this._squashX, oy + (box.y - oy) / this._squashY);
  }

  /** Apply the current frame fit plus any momentary squash/stretch to the sprite. */
  private _applyScale(): void {
    this.sprite.setScale(this._frameScale * this._squashX, this._frameScale * this._squashY);
  }

  /**
   * A brief squash/stretch flourish (jump takeoff, bounce). Expressed as multipliers on the frame
   * fit — never as raw sprite scale — so it composes with the per-frame resolution normalization
   * instead of fighting it. Yoyos back to neutral.
   */
  private _squashPulse(sx: number, sy: number, duration: number): void {
    this.scene.tweens.killTweensOf(this);
    this._squashX = 1;
    this._squashY = 1;
    this.scene.tweens.add({
      targets: this,
      _squashX: sx,
      _squashY: sy,
      duration,
      yoyo: true,
      onUpdate: () => this._fitFrame(),
      onComplete: () => {
        this._squashX = 1;
        this._squashY = 1;
        this._fitFrame();
      },
    });
  }

  /** Touched down after being airborne — squash and clear the air roll. */
  private _onLand(): void {
    this.jumpCount = 0;
    this._endRoll();
    this._applyFallDamage();
    // Landing squash — expressed as multipliers on the frame fit so high-res frames stay boxed.
    this.scene.tweens.killTweensOf(this);
    this._squashX = 1.2;
    this._squashY = 0.8;
    this._applyScale();
    this.scene.tweens.add({
      targets: this,
      _squashX: 1,
      _squashY: 1,
      duration: 120,
      ease: 'Quad.Out',
      onUpdate: () => this._fitFrame(),
      onComplete: () => {
        this._squashX = 1;
        this._squashY = 1;
        this._fitFrame();
      },
    });
  }

  /**
   * Hard-landing fall damage. Measured as the net drop below the takeoff point (so jumping up and
   * landing where you started costs nothing); free fall up to FALL_DAMAGE_SAFE_HEIGHTS body-heights
   * is harmless, beyond which damage scales with the distance fallen (capped).
   */
  private _applyFallDamage(): void {
    const drop = this.sprite.y - this._takeoffY;
    const safe = FALL_DAMAGE_SAFE_HEIGHTS * PLAYER_HEIGHT;
    if (drop <= safe || this.isInvincible) return;
    const dmg = Math.min(FALL_DAMAGE_MAX, Math.round((drop - safe) * FALL_DAMAGE_PER_PX));
    if (dmg <= 0) return;
    this.takeDamage(dmg);
    SoundSystem.play(this.scene.audioCtx, 'hazard');
    this.scene.shake(180, 0.008);
    this.scene.spawnBurst(this.sprite.x, this._feetY, 0xccccdd, {
      count: 8,
      speed: [60, 170],
      angle: [200, 340],
      lifespan: 320,
    });
  }

  /** Reset the fall-damage reference to the current height (e.g. after a pit respawn teleport). */
  resetFall(): void {
    this._takeoffY = this.sprite.y;
  }

  private _doMeleeAttack(): void {
    this.attackCooldown = PLAYER_ATTACK_COOLDOWN;
    SoundSystem.play(this.scene.audioCtx, 'punch');
    const dir = this.facingRight ? 1 : -1;
    const cx = this.sprite.x + dir * 50;
    const cy = this.sprite.y;

    this._spawnPunchArm(dir);
    this.scene.shake(80, 0.003);

    let hitSomething = false;
    this.scene.enemyGroup.getChildren().forEach((go) => {
      const s = go as EnemySprite;
      if (!s.active || !s.enemyRef) return;
      const dx = s.x - cx,
        dy = s.y - cy;
      if (Math.abs(dx) < PLAYER_MELEE_RANGE && Math.abs(dy) < 80) {
        s.enemyRef.takeDamage(Math.round(PLAYER_MELEE_DAMAGE * this.comboMultiplier), dir);
        hitSomething = true;
      }
    });

    if (hitSomething) this._registerHit();
  }

  private _registerHit(): void {
    this.comboCount++;
    this.comboMultiplier = 1 + Math.floor(this.comboCount / 5) * 0.5;
    this.scene.events.emit('combo-update', this.comboCount, this.comboMultiplier);
  }

  /**
   * The player shows no arms while idle/walking — only the single punch arm spawned by
   * `_spawnPunchArm` (in the facing direction) while attacking. This keeps that arm glued to the
   * body each frame; it's hidden during a front roll, where it'd detach from the spinning sprite.
   */
  private _updatePunchArm(): void {
    const arm = this._punchArmGraphic;
    if (!arm) return;
    if (!this.alive || this._isRolling) {
      arm.setVisible(false);
      return;
    }
    arm
      .setVisible(true)
      .setPosition(this.sprite.x + this._punchArmDir * 11, this.sprite.y - 7)
      .setDepth(this.sprite.depth + 1);
  }

  private _spawnPunchArm(
    dir: number,
    opts: {
      sleeveColor?: number;
      fistColor?: number;
      fistRadius?: number;
      sleeveLen?: number;
      sleeveH?: number;
      glow?: number;
    } = {},
  ): void {
    const sleeveColor = opts.sleeveColor ?? 0xf0f0f5;
    const fistColor = opts.fistColor ?? 0x88ccdd;
    const fistRadius = opts.fistRadius ?? 8;
    const sleeveLen = opts.sleeveLen ?? 44;
    const sleeveH = opts.sleeveH ?? 9;
    const fistX = sleeveLen + fistRadius - 2;

    this._punchArmDir = dir;
    const arm = this.scene.add.graphics();
    const s = dir > 0 ? 1 : -1;
    // Optional glow halo behind the fist (used by element-charged punches)
    if (opts.glow !== undefined) {
      arm.fillStyle(opts.glow, 0.4);
      arm.fillCircle(s * fistX, 0, fistRadius + 5);
    }
    arm.fillStyle(sleeveColor);
    arm.fillRect(s > 0 ? 0 : -sleeveLen, -sleeveH / 2, sleeveLen, sleeveH);
    arm.fillStyle(fistColor);
    arm.fillCircle(s * fistX, 0, fistRadius);
    if (opts.glow !== undefined) {
      arm.fillStyle(0xffffff, 0.5);
      arm.fillCircle(s * fistX - s * 3, -3, Math.max(2, fistRadius * 0.3));
    }
    this._punchArmGraphic = arm;
    this.scene.tweens.add({
      targets: arm,
      alpha: 0,
      duration: 180,
      delay: 50,
      onComplete: () => {
        arm.destroy();
        this._punchArmGraphic = null;
      },
    });
  }

  private _specialHydrogen(level: number, dir: number): void {
    const x = this.sprite.x,
      y = this.sprite.y;
    if (level === 1) {
      // Proton Punch — a bigger, harder version of the basic punch, charged hydrogen-blue
      SoundSystem.play(this.scene.audioCtx, 'punch');
      this._spawnPunchArm(dir, { fistColor: 0x3366ee, glow: 0x88aaff, fistRadius: 13, sleeveLen: 50, sleeveH: 11 });
      this.scene.spawnHitFlash(x + dir * 62, y, 0x4499ff, 55);
      this.scene.shake(120, 0.006);
      if (this._damageArc(x + dir * 50, y, 130, 70, PLAYER_MELEE_DAMAGE * 2, dir, false, 4)) this._registerHit();
    } else if (level === 2) {
      // Plasma Arc — crackling hydrogen-blue energy bolt
      SoundSystem.play(this.scene.audioCtx, 'punch');
      this.scene.spawnHitFlash(x + dir * 40, y, 0xaaddff, 40);
      this.scene.shake(80, 0.004);
      this.scene.spawnPlasmaBolt(x + dir * 30, y, dir, PLAYER_MELEE_DAMAGE * 3);
    } else {
      // Fusion Burst — white-hot detonation with hydrogen-blue shockwave rings
      SoundSystem.play(this.scene.audioCtx, 'punch');
      this.scene.spawnHitFlash(x, y, 0xffffff, 90);
      this.scene.spawnHitFlash(x, y, 0x4499ff, 150);
      this.scene.spawnNova(x, y, 0x66bbff, 200, { rings: 3, life: 30, lineWidth: 4, fill: true });
      this.scene.spawnBurst(x, y, 0x88bbff, { count: 26, speed: [120, 320], lifespan: 550, scale: 1.3 });
      this.scene.shake(280, 0.012);
      if (this._damageRadius(x, y, 190, PLAYER_MELEE_DAMAGE * 4)) this._registerHit();
    }
  }

  private _specialOxygen(level: number, dir: number): void {
    const x = this.sprite.x,
      y = this.sprite.y;
    if (level === 1) {
      // Oxidize — a corrosive rust-orange slash
      this.scene.spawnSlashArc(x, y, dir, 0xff7744, 120, 70);
      this.scene.spawnHitFlash(x + dir * 55, y, 0xff5533, 45);
      this.scene.spawnBurst(x + dir * 50, y, 0xff8855, {
        count: 10,
        speed: [80, 200],
        angle: dir > 0 ? [-45, 45] : [135, 225],
        lifespan: 380,
      });
      if (this._damageArc(x + dir * 40, y, 110, 65, PLAYER_MELEE_DAMAGE * 1.5, dir, true)) this._registerHit();
    } else if (level === 2) {
      // Reactive Cloud — lingering corrosive haze that slows
      this.scene.spawnCloud(x, y, 150, 0xff5533, 1300, { alpha: 0.16 });
      this.scene.spawnHitFlash(x, y, 0xff6644, 90);
      this.scene.spawnNova(x, y, 0xff7744, 150, { rings: 1, life: 22 });
      if (this._damageRadius(x, y, 150, PLAYER_MELEE_DAMAGE * 2, true)) this._registerHit();
    } else {
      // Oxidation Nova — huge corrosive blast
      this.scene.spawnHitFlash(x, y, 0xff5533, 200);
      this.scene.spawnNova(x, y, 0xff7744, 280, { rings: 3, life: 32, lineWidth: 4, fill: true });
      this.scene.spawnBurst(x, y, 0xff8855, { count: 28, speed: [120, 340], lifespan: 600, scale: 1.3 });
      this.scene.shake(300, 0.012);
      if (this._damageRadius(x, y, 280, PLAYER_MELEE_DAMAGE * 3.5, true)) this._registerHit();
    }
  }

  private _specialWater(level: number, dir: number): void {
    const x = this.sprite.x,
      y = this.sprite.y;
    if (level === 1) {
      // Water Jet — pressurized bolt with a spray of droplets at the muzzle
      this.scene.spawnProjectile(x, y, dir, 0x22ccff, PLAYER_MELEE_DAMAGE * 2, 700, 3);
      this.scene.spawnHitFlash(x + dir * 30, y, 0x88eeff, 32);
      this.scene.spawnBurst(x + dir * 24, y, 0x66ddff, {
        count: 8,
        speed: [120, 260],
        angle: dir > 0 ? [-30, 30] : [150, 210],
        lifespan: 360,
      });
    } else if (level === 2) {
      // Hydro Wave — a forward surge of water
      this.scene.spawnSlashArc(x + dir * 30, y, dir, 0x66ddff, 200, 120);
      this.scene.spawnHitFlash(x + dir * 80, y, 0x22ccff, 100);
      this.scene.spawnBurst(x + dir * 90, y, 0x88eeff, {
        count: 16,
        speed: [140, 320],
        angle: dir > 0 ? [-40, 40] : [140, 220],
        lifespan: 480,
        scale: 1.1,
      });
      this.scene.shake(180, 0.007);
      if (this._damageArc(x + dir * 80, y, 220, 120, PLAYER_MELEE_DAMAGE * 2.5, dir, false, 5)) this._registerHit();
    } else {
      this.scene.shake(500, 0.015);
      this.scene.spawnTidalWave(x, y, dir);
    }
  }

  private _specialCarbon(level: number, dir: number): void {
    const x = this.sprite.x,
      y = this.sprite.y;
    if (level === 1) {
      // Carbon Claw — three raking grey slashes that draw blood
      this.scene.spawnSlashArc(x, y, dir, 0xbbbbbb, 110, 64);
      this.scene.spawnSlashArc(x, y - 14, dir, 0x999999, 100, 50);
      this.scene.spawnSlashArc(x, y + 14, dir, 0x999999, 100, 50);
      this.scene.spawnHitFlash(x + dir * 55, y, 0xaaaaaa, 40);
      const hit = this._damageArc(x + dir * 40, y, 110, 60, PLAYER_MELEE_DAMAGE * 1.8, dir);
      if (hit) {
        this._registerHit();
        this.scene.spawnBurst(x + dir * 50, y, 0xcc3322, { count: 8, speed: [60, 160], lifespan: 360 });
        this.scene.enemyGroup.getChildren().forEach((go) => {
          const s = go as EnemySprite;
          if (!s.active || !s.enemyRef) return;
          if (Math.abs(s.x - (x + dir * 40)) < 110 && Math.abs(s.y - y) < 60) s.enemyRef.applyBleed(3, 2400);
        });
      }
    } else if (level === 2) {
      // Diamond Shard — piercing crystalline bolt with a sparkle at launch
      this.scene.spawnPiercingProjectile(x, y, dir, 0xaaddff, PLAYER_MELEE_DAMAGE * 3, 650);
      this.scene.spawnHitFlash(x + dir * 26, y, 0xddffff, 30);
      this.scene.spawnBurst(x + dir * 24, y, 0xcceeff, {
        count: 8,
        speed: [100, 240],
        angle: dir > 0 ? [-25, 25] : [155, 205],
        lifespan: 380,
      });
    } else {
      // Graphene Shockwave — expanding crack + flung debris
      this.scene.shake(300, 0.012);
      this.scene.spawnHitFlash(x, y, 0x777777, 100);
      this.scene.spawnNova(x, y, 0x999999, 180, { rings: 2, life: 28 });
      this.scene.spawnBurst(x, y + 16, 0x888888, {
        count: 20,
        speed: [120, 300],
        angle: [200, 340],
        lifespan: 600,
        scale: 1.2,
      });
      const crack = this.scene.add.graphics().setDepth(90);
      let t = 0;
      this.scene.time.addEvent({
        delay: 16,
        repeat: 30,
        callback: () => {
          t++;
          crack.clear();
          crack.fillStyle(0x999999, 0.6 - t * 0.018);
          crack.fillRect(x - t * 12, y + 16, t * 24, 8);
          if (t === 15) {
            if (this._damageRadius(x, y, t * 12, PLAYER_MELEE_DAMAGE * 5)) this._registerHit();
          }
          if (t >= 30) crack.destroy();
        },
      });
    }
  }

  private _specialNitrogen(level: number, dir: number): void {
    const x = this.sprite.x,
      y = this.sprite.y;
    if (level === 1) {
      // Nitrogen Frost — a freezing slash that scatters ice crystals
      this.scene.spawnSlashArc(x, y, dir, 0x88eeff, 110, 64);
      this.scene.spawnHitFlash(x + dir * 55, y, 0xaaf4ff, 45);
      this.scene.spawnBurst(x + dir * 50, y, 0xbbf6ff, { count: 12, speed: [60, 180], lifespan: 460 });
      if (this._damageArc(x + dir * 40, y, 110, 60, PLAYER_MELEE_DAMAGE * 1.5, dir, true)) this._registerHit();
    } else if (level === 2) {
      // Cryo Burst — radial freeze that shatters outward
      this.scene.spawnHitFlash(x, y, 0x66ddff, 80);
      this.scene.spawnNova(x, y, 0x88eeff, 160, { rings: 2, life: 26, fill: true });
      this.scene.spawnBurst(x, y, 0xbbf6ff, { count: 22, speed: [120, 300], lifespan: 520, scale: 1.2 });
      this.scene.shake(150, 0.006);
      if (this._damageRadius(x, y, 160, PLAYER_MELEE_DAMAGE * 2.5, true)) this._registerHit();
    } else {
      // Absolute Zero — the whole screen flash-freezes
      this.scene.shake(500, 0.015);
      this.scene.cameras.main.flash(220, 180, 230, 255);
      this.scene.spawnNova(x, this._feetY, 0x88eeff, 420, { rings: 3, life: 34, lineWidth: 4 });
      let hit = false;
      this.scene.enemyGroup.getChildren().forEach((go) => {
        const s = go as EnemySprite;
        if (!s.active || !s.enemyRef) return;
        s.enemyRef.takeDamage(PLAYER_MELEE_DAMAGE * 5, 0, true);
        this.scene.spawnBurst(s.x, s.y, 0xbbf6ff, { count: 10, speed: [60, 200], lifespan: 480 });
        hit = true;
      });
      if (hit) this._registerHit();
    }
  }

  private _specialAmmonia(level: number, _dir: number): void {
    const x = this.sprite.x,
      y = this.sprite.y;
    const radii = [90, 150, 0];
    const dmgs = [PLAYER_MELEE_DAMAGE * 1.5, PLAYER_MELEE_DAMAGE * 2, PLAYER_MELEE_DAMAGE * 1.5];
    this.scene.spawnHitFlash(x, y, 0xaadd44, level === 1 ? 50 : level === 2 ? 80 : 100);
    if (level < 3) {
      this.scene.spawnCloud(x, y, radii[level - 1], 0xaadd44, level === 1 ? 1100 : 1700, { alpha: 0.2 });
      const hit = this._damageRadius(x, y, radii[level - 1], dmgs[level - 1], level === 2);
      if (hit) {
        this._registerHit();
        this.scene.enemyGroup.getChildren().forEach((go) => {
          const s = go as EnemySprite;
          if (!s.active || !s.enemyRef) return;
          if (Phaser.Math.Distance.Between(x, y, s.x, s.y) < radii[level - 1]) s.enemyRef.applyBleed(2, 3000);
        });
      }
    } else {
      // Toxic Deluge — caustic haze blankets the screen
      const haze = this.scene.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x99cc33, 0)
        .setScrollFactor(0)
        .setDepth(340);
      this.scene.tweens.add({
        targets: haze,
        alpha: 0.18,
        duration: 300,
        yoyo: true,
        hold: 1600,
        onComplete: () => haze.destroy(),
      });
      let hit = false;
      this.scene.enemyGroup.getChildren().forEach((go) => {
        const s = go as EnemySprite;
        if (!s.active || !s.enemyRef) return;
        s.enemyRef.takeDamage(PLAYER_MELEE_DAMAGE * 1.5, 0);
        s.enemyRef.applyBleed(3, 4000);
        this.scene.spawnCloud(s.x, s.y, 40, 0xaadd44, 1400, { blobs: 4, alpha: 0.2 });
        hit = true;
      });
      if (hit) this._registerHit();
    }
  }

  private _specialCarbonDioxide(level: number, _dir: number): void {
    const x = this.sprite.x,
      y = this.sprite.y;
    const radii = [100, 180, 0];
    this.scene.spawnHitFlash(x, y, 0x99bbcc, level < 3 ? 60 : 120);
    const fogAlpha = level === 1 ? 0.25 : level === 2 ? 0.35 : 0.5;
    const fogDur = level === 1 ? 1000 : level === 2 ? 1800 : 2800;
    const fog = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x445555, 0)
      .setScrollFactor(0)
      .setDepth(350);
    this.scene.tweens.add({
      targets: fog,
      alpha: fogAlpha,
      duration: 300,
      yoyo: true,
      hold: fogDur - 600,
      onComplete: () => fog.destroy(),
    });
    if (level < 3) {
      this.scene.spawnCloud(x, y, radii[level - 1], 0x99bbcc, level === 1 ? 1100 : 1700, { alpha: 0.22 });
      this.scene.spawnNova(x, y, 0xbbccdd, radii[level - 1], { rings: 1, life: 22 });
      if (this._damageRadius(x, y, radii[level - 1], PLAYER_MELEE_DAMAGE * 2)) this._registerHit();
    } else {
      // Blackout — choking smog across the whole screen
      this.scene.shake(400, 0.012);
      let hit = false;
      this.scene.enemyGroup.getChildren().forEach((go) => {
        const s = go as EnemySprite;
        if (!s.active || !s.enemyRef) return;
        s.enemyRef.takeDamage(PLAYER_MELEE_DAMAGE * 3, 0);
        this.scene.spawnCloud(s.x, s.y, 50, 0x99bbcc, 1400, { blobs: 4, alpha: 0.25 });
        hit = true;
      });
      if (hit) this._registerHit();
    }
  }

  private _specialMethane(level: number, dir: number): void {
    const x = this.sprite.x,
      y = this.sprite.y;
    const proj = this.scene.physics.add.sprite(x, y, 'projectile') as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    proj.setTint(0xff9922).setDepth(80).setScale(1.8);
    proj.body.setAllowGravity(false);
    proj.body.setVelocity(dir * 220, 0);
    this.scene.spawnHitFlash(x + dir * 24, y, 0xffbb44, 30);
    // Trailing flames follow the gas bolt
    const trail = this.scene.time.addEvent({
      delay: 40,
      loop: true,
      callback: () => {
        if (proj.active)
          this.scene.spawnBurst(proj.x, proj.y, 0xff7722, { count: 2, speed: [10, 50], lifespan: 280, scale: 0.8 });
      },
    });

    const detonate = () => {
      if (!proj.active) return;
      trail.remove();
      const ex = proj.x,
        ey = proj.y;
      proj.destroy();
      const r = level === 1 ? 100 : level === 2 ? 140 : 220;
      this.scene.spawnHitFlash(ex, ey, 0xff6600, 80);
      this.scene.spawnNova(ex, ey, 0xff8822, r, { rings: 2, life: 24, fill: true });
      this.scene.spawnBurst(ex, ey, 0xffaa33, {
        count: level === 3 ? 30 : 18,
        speed: [120, 340],
        lifespan: 560,
        scale: 1.3,
      });
      this.scene.shake(200, 0.008);
      const dmg =
        level === 1 ? PLAYER_MELEE_DAMAGE * 3 : level === 2 ? PLAYER_MELEE_DAMAGE * 3.5 : PLAYER_MELEE_DAMAGE * 6;
      if (this._damageRadius(ex, ey, r, dmg)) this._registerHit();
      if (level >= 2) {
        this.scene.enemyGroup.getChildren().forEach((go) => {
          const s = go as EnemySprite;
          if (!s.active || !s.enemyRef) return;
          if (Phaser.Math.Distance.Between(ex, ey, s.x, s.y) < r + 40) {
            this.scene.time.delayedCall(150, () => this.scene.spawnHitFlash(s.x, s.y, 0xff4400, 40));
          }
        });
      }
    };

    this.scene.time.delayedCall(650, detonate);
    this.scene.physics.add.overlap(proj, this.scene.enemyGroup, () => detonate());
  }

  private _specialNitricOxide(level: number, _dir: number): void {
    const boosts = [1.5, 1.8, 2.0];
    const durations = RADICAL_DURATIONS;
    this._speedBoost = boosts[level - 1];
    // Setting the boost timer also flips `isRadicalActive`/`isInvincible` on (see those getters):
    // for the whole duration the player takes no damage and rams enemies for contact damage.
    this._speedBoostTimer = durations[level - 1];

    // Reactive flare as the radical buff kicks in
    this.scene.spawnHitFlash(this.sprite.x, this._feetY, 0xdd44aa, 70);
    this.scene.spawnNova(this.sprite.x, this._feetY, 0xff66cc, 90, { rings: 2, life: 20 });
    this.scene.spawnBurst(this.sprite.x, this._feetY, 0xff88dd, { count: 16, speed: [120, 280], lifespan: 480 });

    if (this._speedBoostAura) this._speedBoostAura.destroy();
    this._speedBoostAura = this.scene.add.graphics().setDepth(this.sprite.depth - 1);
    const auraR = level === 1 ? 40 : level === 2 ? 60 : 80;
    this._speedBoostAura.lineStyle(2, 0xdd44aa, 0.7);
    this._speedBoostAura.strokeCircle(0, 0, auraR);

    this.scene.tweens.add({
      targets: this._speedBoostAura,
      alpha: 0.3,
      duration: 400,
      yoyo: true,
      repeat: -1,
    });

    // Contact damage — while rushing around (and immune) the player chips anything they run into.
    // Ticks quickly so it reads as a ramming melee rather than a slow aura.
    const tick = 200;
    this.scene.time.addEvent({
      delay: tick,
      repeat: Math.floor(durations[level - 1] / tick) - 1,
      callback: () => {
        if (!this.alive || !this.isRadicalActive) return;
        this._damageRadius(this.sprite.x, this._feetY, auraR, PLAYER_MELEE_DAMAGE * 0.35);
      },
    });
  }

  private _specialCarbonicAcid(level: number, dir: number): void {
    const count = level === 1 ? 5 : level === 2 ? 9 : 0;
    const spreadX = level === 1 ? 120 : 200;
    const groundY = this._feetY; // stable ground line for this cast (drops land here)

    if (level < 3) {
      for (let i = 0; i < count; i++) {
        const tx = this.sprite.x + dir * Phaser.Math.FloatBetween(30, spreadX);
        const ty = groundY - Phaser.Math.FloatBetween(80, 160);
        const delay = i * 80;
        this.scene.time.delayedCall(delay, () => {
          if (!this.alive) return;
          const drop = this.scene.add.graphics().setDepth(88);
          drop.fillStyle(0x33aadd, 0.9);
          drop.fillCircle(tx, ty, 5);
          this.scene.tweens.add({
            targets: drop,
            y: `+=${Phaser.Math.FloatBetween(80, 160)}`,
            duration: 300,
            ease: 'Quad.In',
            onComplete: () => {
              this.scene.spawnHitFlash(tx, groundY, 0x33aadd, 20);
              this.scene.spawnBurst(tx, groundY, 0x66ccee, {
                count: 6,
                speed: [40, 130],
                angle: [200, 340],
                lifespan: 320,
              });
              this.scene.spawnCloud(tx, groundY, 26, 0x33aadd, 700, { blobs: 3, alpha: 0.22 });
              this._damageRadius(tx, groundY, 35, PLAYER_MELEE_DAMAGE * 1.2);
              if (level === 2) {
                this.scene.enemyGroup.getChildren().forEach((go) => {
                  const s = go as EnemySprite;
                  if (s.active && s.enemyRef && Phaser.Math.Distance.Between(tx, groundY, s.x, s.y) < 35)
                    s.enemyRef.applyBleed(2, 1500);
                });
              }
              drop.destroy();
            },
          });
        });
      }
      this._registerHit();
    } else {
      // Acid Rain — one drop per enemy
      this.scene.shake(300, 0.01);
      this.scene.enemyGroup.getChildren().forEach((go, i) => {
        const s = go as EnemySprite;
        if (!s.active || !s.enemyRef) return;
        this.scene.time.delayedCall(i * 100, () => {
          const drop = this.scene.add.graphics().setDepth(88);
          drop.fillStyle(0x33aadd, 0.9);
          drop.fillCircle(s.x, s.y - 140, 6);
          this.scene.tweens.add({
            targets: drop,
            y: '+=140',
            duration: 280,
            ease: 'Quad.In',
            onComplete: () => {
              this.scene.spawnHitFlash(s.x, s.y, 0x33aadd, 24);
              this.scene.spawnBurst(s.x, s.y, 0x66ccee, {
                count: 7,
                speed: [50, 150],
                angle: [200, 340],
                lifespan: 340,
              });
              this.scene.spawnCloud(s.x, s.y, 30, 0x33aadd, 800, { blobs: 3, alpha: 0.22 });
              if (s.enemyRef) {
                s.enemyRef.takeDamage(PLAYER_MELEE_DAMAGE * 2, 0);
                s.enemyRef.applyBleed(3, 2000);
              }
              drop.destroy();
            },
          });
        });
      });
      this._registerHit();
    }
  }

  /**
   * Prismatic Beam (noble-gas super weapon) — a wide, piercing rainbow beam fired in the facing
   * direction that shreds everything in its lane and shoves it back. Single, fixed power tier.
   */
  private _specialPrismatic(_level: number, dir: number): void {
    const x = this.sprite.x;
    const y = this.sprite.y;
    const x0 = x + dir * 30;
    const range = 900; // lane length
    const halfH = 70; // lane half-height

    SoundSystem.play(this.scene.audioCtx, 'element_upgrade');
    this.scene.shake(380, 0.013);
    this.scene.spawnHitFlash(x0, y, 0xffffff, 90);
    this.scene.cameras.main.flash(160, 255, 230, 255);

    // Stacked rainbow bands + a white-hot core, drawn just behind the player and faded out.
    const colors = [0xff3b3b, 0xff9e3b, 0xffe23b, 0x3bff6e, 0x3bd4ff, 0x6e3bff, 0xff3bd4];
    const g = this.scene.add.graphics().setDepth(DEPTH.PLAYER - 1);
    const left = dir > 0 ? x0 : x0 - range;
    const bandH = (halfH * 2) / colors.length;
    colors.forEach((c, i) => {
      g.fillStyle(c, 0.85);
      g.fillRect(left, y - halfH + i * bandH, range, bandH);
    });
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(left, y - 9, range, 18);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 450, ease: 'Quad.Out', onComplete: () => g.destroy() });

    this.scene.spawnBurst(x0, y, 0xffffff, {
      count: 30,
      speed: [140, 400],
      angle: dir > 0 ? [-42, 42] : [138, 222],
      lifespan: 620,
      scale: 1.3,
    });

    // Damage every enemy ahead of the muzzle within the lane.
    const dmg = PLAYER_MELEE_DAMAGE * 10;
    let hit = false;
    this.scene.enemyGroup.getChildren().forEach((go) => {
      const s = go as EnemySprite;
      if (!s.active || !s.enemyRef) return;
      const ahead = dir > 0 ? s.x >= x0 - 20 : s.x <= x0 + 20;
      if (ahead && Math.abs(s.x - x) < range && Math.abs(s.y - y) < halfH + 12) {
        s.enemyRef.takeDamage(dmg, dir * 6);
        hit = true;
      }
    });
    if (hit) this._registerHit();
  }

  private _damageArc(
    cx: number,
    cy: number,
    rangeX: number,
    rangeY: number,
    dmg: number,
    dir: number,
    slow = false,
    knockback = 2,
  ): boolean {
    let hit = false;
    this.scene.enemyGroup.getChildren().forEach((go) => {
      const s = go as EnemySprite;
      if (!s.active || !s.enemyRef) return;
      const dx = s.x - cx,
        dy = s.y - cy;
      if (Math.abs(dx) < rangeX && Math.abs(dy) < rangeY) {
        s.enemyRef.takeDamage(dmg, dir * knockback, slow);
        hit = true;
      }
    });
    return hit;
  }

  private _damageRadius(cx: number, cy: number, radius: number, dmg: number, slow = false): boolean {
    let hit = false;
    this.scene.enemyGroup.getChildren().forEach((go) => {
      const s = go as EnemySprite;
      if (!s.active || !s.enemyRef) return;
      const dist = Phaser.Math.Distance.Between(cx, cy, s.x, s.y);
      if (dist < radius) {
        s.enemyRef.takeDamage(dmg, (s.x < cx ? -1 : 1) * 3, slow);
        hit = true;
      }
    });
    return hit;
  }

  takeDamage(amount: number): void {
    if (!this.alive || this.isInvincible) return;
    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.scene.events.emit('combo-update', 0, 1);
    this.hp = Math.max(0, Math.round(this.hp - amount));
    this.invincibleTimer = this.invincibilityMs;
    this._hitFlash = true;
    this.scene.time.delayedCall(160, () => {
      this._hitFlash = false;
    });
    if (this.hp === 0) this._die();
  }

  /**
   * Halt the player in place until the next stage loads — no input, no slide, no fall. Phaser's
   * physics step keeps running even after GameScene.update() early-returns on stage clear / death,
   * so zeroing velocity isn't enough on its own; we also kill gravity so an airborne player doesn't
   * drift down. A fresh Player is built when the next stage starts, so this never needs undoing.
   */
  freeze(): void {
    this.frozen = true;
    this._endRoll();
    const body = this.sprite.body;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);
    body.setAllowGravity(false);
    if (this.alive) this.sprite.play('player_idle', true);
  }

  private _die(): void {
    this.alive = false;
    this.freeze(); // stop dead in place — no post-death slide or fall
    this._squashX = 1;
    this._squashY = 1;
    this._fitFrame();
    this.sprite.setRotation(0);
    this._jumpShadow.clear();
    this._punchArmGraphic?.destroy();
    this._punchArmGraphic = null;
    SoundSystem.play(this.scene.audioCtx, 'player_death');
    this.sprite.setTint(0x888888);
    // The bawling tantrum plays out on the death screen, not in the world (see GameScene._showDeathScreen)
    this.scene.time.delayedCall(900, () => this.scene.onPlayerDeath());
  }
}
