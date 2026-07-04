import Phaser from 'phaser';
import { DEPTH, FLYER_MAX_Y, FLYER_MIN_Y, GAME_HEIGHT, GRAVITY, GROUND_TOP_Y } from '../constants';
import type GameScene from '../scenes/GameScene';
import type { EnemySprite } from '../types';

/** Per-type vertical jump impulse for hopping ground enemies (real arcade jump now). */
const HOP_VELOCITY = 520;

const STATES = {
  PATROL: 'patrol',
  CHASE: 'chase',
  ATTACK: 'attack',
  HURT: 'hurt',
  DEAD: 'dead',
} as const;
type EnemyState = (typeof STATES)[keyof typeof STATES];

export type EnemyType =
  | 'bacterium'
  | 'virus'
  | 'dustbunny'
  | 'pollen'
  | 'amoeba'
  | 'spore'
  | 'mite'
  | 'ant'
  | 'fly'
  | 'bee';

/** Ranged-attack profile for enemies that shoot projectiles instead of (only) meleeing. */
interface RangedConfig {
  /** Max distance at which the enemy will open fire and hold a standoff hover. */
  range: number;
  /** Number of projectiles per volley (>1 → fan spread). */
  shots: number;
  /** Radians between adjacent shots in a spread volley. */
  spread: number;
  /** Per-projectile damage and travel speed. */
  damage: number;
  speed: number;
}

interface EnemyConfig {
  hp: number;
  speed: number;
  damage: number;
  attackRate: number;
  texture: string;
  /** IF present, this enemy fires projectiles at the player from `ranged.range` (see `_tryFire`). */
  ranged?: RangedConfig;
  /**
   * Relative size multiplier vs. a standard enemy (1.0). The on-screen size is enforced
   * independently of the source PNG's pixel resolution — see {@link BASE_DISPLAY}. A small
   * native sprite is never upscaled past this value; a huge sprite is shrunk to fit the box.
   */
  scale: number;
  /** Flyers hover in the air (no gravity); ground types fall and walk on the floor/ledges. */
  fly: boolean;
}

/**
 * Target on-screen size (px, longest edge) for a standard enemy (scale 1.0). Whatever the
 * source artwork's resolution, the sprite is fit into a BASE_DISPLAY × cfg.scale box so a
 * 2048×2732 PNG and a 32×32 PNG end up the same size in-game. The physics body is sized in
 * source pixels to land at the intended world size after this scaling (see constructor).
 */
const BASE_DISPLAY = 56;

const CONFIGS: Record<EnemyType, EnemyConfig> = {
  bacterium: { hp: 35, speed: 90, damage: 10, attackRate: 1600, texture: 'bacterium', scale: 1.0, fly: false },
  // Ranged flyer — keeps a standoff and spits a single fast virion at the player.
  virus: {
    hp: 22,
    speed: 130,
    damage: 8,
    attackRate: 1400,
    texture: 'virus',
    scale: 1.0,
    fly: true,
    ranged: { range: 300, shots: 1, spread: 0, damage: 6, speed: 210 },
  },
  dustbunny: { hp: 50, speed: 60, damage: 14, attackRate: 2000, texture: 'dustbunny', scale: 1.0, fly: false },
  // Ranged flyer — drifts at range and puffs a 3-shot spread of irritant pollen.
  pollen: {
    hp: 18,
    speed: 160,
    damage: 6,
    attackRate: 1100,
    texture: 'pollen',
    scale: 1.0,
    fly: true,
    ranged: { range: 280, shots: 3, spread: 0.22, damage: 4, speed: 160 },
  },
  // Sector 2+ newcomers
  amoeba: { hp: 80, speed: 48, damage: 16, attackRate: 2200, texture: 'amoeba', scale: 1.15, fly: false }, // slow tank
  spore: { hp: 14, speed: 180, damage: 7, attackRate: 800, texture: 'spore', scale: 0.9, fly: true }, // fast, hovers
  mite: { hp: 30, speed: 115, damage: 11, attackRate: 1300, texture: 'mite', scale: 0.9, fly: false }, // crawler, hops
  // Sector 4 (LAB FLOOR) — fast, low-HP ground swarmer that scurries (no hop).
  ant: { hp: 24, speed: 150, damage: 9, attackRate: 950, texture: 'ant', scale: 0.95, fly: false },
  // Sectors 5–6 (LAB FLOOR) — fast fragile flyer, and a tougher aggressive flyer.
  fly: { hp: 16, speed: 205, damage: 8, attackRate: 850, texture: 'fly', scale: 0.85, fly: true },
  bee: { hp: 42, speed: 150, damage: 14, attackRate: 1100, texture: 'bee', scale: 1.0, fly: true },
};

const DETECT_RANGE = 320;
const ATTACK_RANGE = 58;

/**
 * Types whose hand-drawn art ships interchangeable visual variants (`_2`/`_3` keys, all loaded in
 * BootScene). Each spawn picks one at random so a swarm of the same enemy type reads as a varied
 * crowd rather than identical clones. Types absent here use their single `cfg.texture`.
 */
const TEXTURE_VARIANTS: Partial<Record<EnemyType, readonly string[]>> = {
  bacterium: ['bacterium', 'bacterium_2'],
  virus: ['virus', 'virus_2'],
  pollen: ['pollen', 'pollen_2', 'pollen_3'],
  amoeba: ['amoeba', 'amoeba_2', 'amoeba_3'],
  spore: ['spore', 'spore_2', 'spore_3'],
  mite: ['mite', 'mite_2'],
};

export default class Enemy {
  scene: GameScene;
  type: EnemyType;
  maxHp: number;
  hp: number;
  speed: number;
  damage: number;
  attackRate: number;
  isBoss = false;
  readonly fly: boolean;
  /** Ranged-attack profile, or null for melee-only enemies. */
  private readonly ranged: RangedConfig | null;

  sprite: EnemySprite;
  /** Where this enemy was spawned — used to recover it if it ever clips through solid floor. */
  private readonly spawnX: number;
  private readonly spawnY: number;
  /**
   * Display scale that fits this enemy's source texture into its size box. All squash/stretch
   * animation must be expressed relative to this value, never as a raw scale, or a high-res PNG
   * would snap back to full resolution the instant an animation sets scale.
   */
  private baseScale = 1;
  state: EnemyState = STATES.PATROL;
  patrolDir: number = Math.random() < 0.5 ? 1 : -1;
  patrolTimer = 0;
  attackTimer = 0;
  hurtTimer = 0;
  slowTimer = 0;
  bleedTimer = 0;
  bleedDamage = 0;
  private bleedTickTimer = 0;
  private hopTimer = 0;
  private hoverTime = 0;
  // Stays false until the enemy has scrolled into the camera view; attacks can't reach it before then
  private hasEnteredView = false;

  constructor(scene: GameScene, x: number, y: number, type: EnemyType = 'bacterium') {
    this.scene = scene;
    this.type = type;

    this.spawnX = x;
    this.spawnY = y;

    const cfg = CONFIGS[type] ?? CONFIGS.bacterium;
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.speed = cfg.speed;
    this.damage = cfg.damage;
    this.attackRate = cfg.attackRate;
    this.fly = cfg.fly;
    this.ranged = cfg.ranged ?? null;

    // Pick a random art variant for types that have them; otherwise the single configured texture.
    const variants = TEXTURE_VARIANTS[type];
    const texture = variants ? Phaser.Utils.Array.GetRandom(variants as string[]) : cfg.texture;
    const base = scene.physics.add.sprite(x, y, texture) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

    // Enforce a consistent on-screen size regardless of the source PNG's pixel resolution.
    // Fit the texture into a BASE_DISPLAY × cfg.scale box (by its longest edge), but never
    // upscale a sprite that's already smaller than its box — small native art stays as authored.
    const src = base.texture.getSourceImage();
    const box = BASE_DISPLAY * cfg.scale;
    const fit = Math.min(box / src.width, box / src.height);
    this.baseScale = Math.min(cfg.scale, fit);
    base.setScale(this.baseScale);
    base.setDepth(DEPTH.ENEMY);
    // Hitbox = the full (cropped) sprite image. The Arcade body is in source pixels and scales with
    // the sprite, so the full frame at baseScale lands a body matching the on-screen creature.
    base.body.setSize(src.width, src.height, true);
    base.body.setCollideWorldBounds(true);
    // Flyers hover (no gravity); ground types fall onto the floor/ledges (collider added by GameScene).
    if (cfg.fly) base.body.setAllowGravity(false);
    else base.body.setGravityY(GRAVITY);
    this.sprite = base as EnemySprite;
    this.sprite.enemyRef = this;
    if (type === 'dustbunny' || type === 'mite') this.hopTimer = Phaser.Math.Between(300, 700);
    if (cfg.fly) this.hoverTime = Math.random() * Math.PI * 2;
  }

  update(time: number, delta: number, playerSprite: Phaser.Physics.Arcade.Sprite): void {
    if (!this.sprite.active || this.state === STATES.DEAD) return;

    // Vertical recovery: a ground enemy sunk below the floor surface either fell into a real pit or
    // clipped through solid floor. If it's over an actual hole (an authored gap / open crumble pit),
    // let it drop off-screen and perish — that counts toward the clear. Otherwise it must have
    // clipped through solid ground (a physics tunneling glitch), which would strand it off-screen and
    // block the clear, so snap it back to where it spawned. Flyers have no gravity and never fall.
    if (!this.fly && this.sprite.y > GROUND_TOP_Y + 60) {
      if (this.scene.isOverHole(this.sprite.x)) {
        if (this.sprite.y > GAME_HEIGHT + 40) {
          this._die();
          return;
        }
      } else {
        this._recoverToSpawn();
      }
    }

    if (!this.hasEnteredView) {
      const view = this.scene.cameras.main.worldView;
      if (this.sprite.x >= view.x && this.sprite.x <= view.right) this.hasEnteredView = true;
    }

    this.hurtTimer = Math.max(0, this.hurtTimer - delta);
    this.attackTimer = Math.max(0, this.attackTimer - delta);
    this.slowTimer = Math.max(0, this.slowTimer - delta);
    this.patrolTimer = Math.max(0, this.patrolTimer - delta);

    if (this.bleedTimer > 0) {
      this.bleedTimer -= delta;
      this.bleedTickTimer -= delta;
      if (this.bleedTickTimer <= 0) {
        this.bleedTickTimer = 400;
        this.hp = Math.round(this.hp - this.bleedDamage);
        this.sprite.setTint(0xff4444);
        this.scene.time.delayedCall(100, () => {
          if (this.sprite.active) this.sprite.clearTint();
        });
        if (this.hp <= 0) this._die();
      }
    }

    const speed = this.slowTimer > 0 ? this.speed * 0.3 : this.speed;

    if (this.state === STATES.HURT) {
      if (this.hurtTimer <= 0) this.state = STATES.PATROL;
      return;
    }

    const dx = playerSprite.x - this.sprite.x;
    const dy = playerSprite.y - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < DETECT_RANGE && this.state === STATES.PATROL) this.state = STATES.CHASE;
    if (dist >= DETECT_RANGE && this.state === STATES.CHASE) this.state = STATES.PATROL;

    // Ranged enemies open fire as soon as the player is within range — independent of melee state,
    // sharing the attack cooldown so they don't also melee in the same window.
    if (this.ranged && this.hasEnteredView && dist < this.ranged.range) this._tryFire(dx, dy);

    switch (this.state) {
      case STATES.PATROL:
        this._patrol(speed);
        break;
      case STATES.CHASE:
        // Ranged flyers hold a standoff and strafe rather than ramming into melee range.
        if (this.ranged && dist < this.ranged.range) this._standoff(dx, dy, dist, speed);
        else this._chase(dx, dy, dist, speed);
        break;
      case STATES.ATTACK:
        this._tryAttack(playerSprite);
        break;
    }

    if (this.type === 'dustbunny' || this.type === 'mite') this._applyHop(delta);
    if (this.fly) this._applyHover(delta);
    this._applyIdleAnim(time, delta);

    if (this.state === STATES.CHASE && dist < ATTACK_RANGE) this.state = STATES.ATTACK;
    if (this.state === STATES.ATTACK && dist > ATTACK_RANGE * 1.4) this.state = STATES.CHASE;

    this.sprite.setFlipX(this.sprite.body.velocity.x < 0);
    // Flyers stay within the hover band; ground types are held on the floor/ledges by gravity + colliders.
    if (this.fly) this.sprite.y = Phaser.Math.Clamp(this.sprite.y, FLYER_MIN_Y, FLYER_MAX_Y);

    // During a locked boss fight, confine enemies to the boss arena so they stay reachable while the
    // player is penned in. In normal play enemies roam freely and may wander off-screen (the world
    // bounds collider keeps them inside the level); they're still tracked for the stage clear.
    const arena = this.scene.bossArena;
    if (arena) {
      this.sprite.x = Phaser.Math.Clamp(this.sprite.x, arena.left + 24, arena.right - 24);
    }

    this.sprite.setTint(this.slowTimer > 0 ? 0x44ffaa : 0xffffff);
    if (this.slowTimer <= 0) this.sprite.clearTint();
  }

  private _patrol(speed: number): void {
    if (this.patrolTimer <= 0) {
      this.patrolDir = Math.random() < 0.5 ? 1 : -1;
      this.patrolTimer = Phaser.Math.Between(1200, 2800);
    }
    // Horizontal drift only; gravity (ground) or hover (flyer) owns the vertical axis.
    this.sprite.body.setVelocityX(this.patrolDir * speed * 0.4);
  }

  private _chase(dx: number, dy: number, dist: number, speed: number): void {
    if (dist < 1) return;
    this.sprite.body.setVelocityX((dx / dist) * speed);
    // Flyers also climb/dive toward the player's height; ground types leave Y to gravity.
    if (this.fly) this.sprite.body.setVelocityY((dy / dist) * speed * 0.6);
  }

  /**
   * Ranged hover: maintain a comfortable firing distance from the player — back off when crowded,
   * close a little when too far — while loosely tracking the player's height.
   */
  private _standoff(dx: number, dy: number, dist: number, speed: number): void {
    if (dist < 1) return;
    const hold = (this.ranged as RangedConfig).range * 0.6;
    // Retreat when crowded, ease back in when drifted out, otherwise hold position.
    let vx = 0;
    if (dist < hold * 0.8) vx = -(dx / dist) * speed * 0.8;
    else if (dist > hold * 1.2) vx = (dx / dist) * speed * 0.5;
    this.sprite.body.setVelocityX(vx);
    if (this.fly) this.sprite.body.setVelocityY((dy / dist) * speed * 0.3);
  }

  /** Fire a projectile (or fan spread) at the player, gated by the shared attack cooldown. */
  private _tryFire(dx: number, dy: number): void {
    if (this.attackTimer > 0 || this.state === STATES.HURT) return;
    this.attackTimer = this.attackRate;
    const r = this.ranged as RangedConfig;
    const base = Math.atan2(dy, dx);
    const half = (r.shots - 1) / 2;
    for (let i = 0; i < r.shots; i++) {
      this.scene.spawnEnemyProjectile(this.sprite.x, this.sprite.y, base + (i - half) * r.spread, r.damage, r.speed);
    }
  }

  private _tryAttack(_playerSprite: Phaser.Physics.Arcade.Sprite): void {
    this.sprite.body.setVelocityX(0);
    if (this.fly) this.sprite.body.setVelocityY(0);
    if (this.attackTimer <= 0) {
      this.attackTimer = this.attackRate;
      // Player leaping cleanly over this enemy dodges the contact hit
      if (this.scene.player.isClearingEnemy) return;
      this.scene.player.takeDamage(this.damage);
      this.sprite.setTint(0xff6666);
      this.scene.time.delayedCall(150, () => this.sprite.clearTint());
    }
  }

  applyBleed(damage: number, duration: number): void {
    if (!this.hasEnteredView) return;
    this.bleedDamage = damage;
    this.bleedTimer = Math.max(this.bleedTimer, duration);
    this.bleedTickTimer = 0;
  }

  takeDamage(amount: number, knockbackDir = 1, slow = false): void {
    // Offscreen enemies that haven't scrolled in yet are untouchable by any attack
    if (!this.hasEnteredView || this.state === STATES.DEAD) return;
    this.hp = Math.round(this.hp - amount);

    // Freeze, squish, then launch after a brief stagger window
    this.sprite.body.setVelocity(0, 0);
    this.scene.time.delayedCall(80, () => {
      if (this.sprite.active) this.sprite.body.setVelocity(knockbackDir * 200, -50);
    });

    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.baseScale * 1.4,
      scaleY: this.baseScale * 0.65,
      duration: 60,
      ease: 'Power2',
      yoyo: true,
      onComplete: () => {
        if (this.sprite.active) this.sprite.setScale(this.baseScale);
      },
    });

    this.sprite.setTint(0xffffff);
    this.scene.time.delayedCall(120, () => {
      if (this.sprite.active) this.sprite.clearTint();
    });

    if (slow) this.slowTimer = 2000;
    this.state = STATES.HURT;
    this.hurtTimer = 300;

    if (this.hp <= 0) this._die();
  }

  private _applyIdleAnim(time: number, delta: number): void {
    // Squash/stretch is expressed as a factor around baseScale so high-res textures stay boxed.
    const b = this.baseScale;
    switch (this.type) {
      case 'bacterium':
        // Cytoplasm pulse — vertical elongation driven by a per-instance phase offset
        this.sprite.setScale(b, b * (1 + Math.sin(time * 0.002 + this.sprite.x * 0.005) * 0.07));
        break;
      case 'virus':
        // Slow continuous spin — protein coat rotating
        this.sprite.rotation += delta * 0.001;
        break;
      case 'pollen':
        // Gentle tumble
        this.sprite.rotation += delta * 0.0006;
        break;
      case 'dustbunny':
        // Squash/stretch breathing while grounded between hops
        if (this.sprite.body.onFloor()) {
          const s = Math.sin(time * 0.003) * 0.04;
          this.sprite.setScale(b * (1 + s), b * (1 - s));
        }
        break;
      case 'amoeba': {
        // Slow gelatinous wobble — wide, sloshing pseudopod blob
        const w = Math.sin(time * 0.0016 + this.sprite.x * 0.004) * 0.09;
        this.sprite.setScale(b * (1 + w), b * (1 - w));
        break;
      }
      case 'spore':
        // Quick jittery spin
        this.sprite.rotation += delta * 0.0016;
        break;
      case 'mite':
        // Squash/stretch breathing while grounded between hops (lighter than dustbunny)
        if (this.sprite.body.onFloor()) {
          const s = Math.sin(time * 0.004) * 0.05;
          this.sprite.setScale(b * (1 + s), b * (1 - s));
        }
        break;
      case 'ant':
        // Quick scuttling jitter — fast little body shudder as it scurries
        if (this.sprite.body.onFloor()) {
          const s = Math.sin(time * 0.02 + this.sprite.x) * 0.04;
          this.sprite.setScale(b * (1 + s), b * (1 - s));
        }
        break;
      case 'fly':
        // Frantic buzzing wing-blur — fast tiny vertical shimmer
        this.sprite.setScale(b, b * (1 + Math.sin(time * 0.05) * 0.08));
        break;
      case 'bee':
        // Heavier hovering buzz
        this.sprite.setScale(b * (1 + Math.sin(time * 0.035) * 0.05), b * (1 - Math.sin(time * 0.035) * 0.05));
        break;
    }
  }

  private _applyHover(delta: number): void {
    if (this.state === STATES.HURT || this.state === STATES.DEAD) return;
    // While chasing, _chase steers the flyer toward the player's height; only bob otherwise.
    if (this.state === STATES.CHASE) return;
    this.hoverTime += delta / 1000;
    this.sprite.body.setVelocityY(80 * Math.cos(this.hoverTime * 2.6));
  }

  /** Real arcade hop — when grounded and the timer fires, kick off a vertical jump; gravity lands it. */
  private _applyHop(delta: number): void {
    if (this.state === STATES.HURT || this.state === STATES.DEAD) return;
    if (!this.sprite.body.onFloor()) return; // mid-hop — let it arc and land
    this.hopTimer -= delta;
    if (this.hopTimer <= 0) {
      this.hopTimer = Phaser.Math.Between(500, 1100);
      this.sprite.body.setVelocityY(-HOP_VELOCITY);
      // Takeoff stretch
      this.scene.tweens.killTweensOf(this.sprite);
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: this.baseScale * 0.78,
        scaleY: this.baseScale * 1.3,
        duration: 90,
        ease: 'Power2',
        yoyo: true,
        onComplete: () => {
          if (this.sprite.active) this.sprite.setScale(this.baseScale);
        },
      });
    }
  }

  /**
   * Clipped through solid floor — teleport back to the spawn point with a clean, grounded state so
   * the enemy stays reachable rather than falling forever off-screen and blocking the stage clear.
   */
  private _recoverToSpawn(): void {
    this.sprite.body.setVelocity(0, 0);
    // Land just above the floor if the spawn point was itself below the surface for any reason.
    const y = Math.min(this.spawnY, GROUND_TOP_Y - 30);
    this.sprite.setPosition(this.spawnX, y);
    this.state = STATES.PATROL;
  }

  private _die(): void {
    this.state = STATES.DEAD;
    this.sprite.body.setVelocity(0, 0);
    this.scene.onEnemyDeath(this);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      y: this.sprite.y - 20,
      duration: 400,
      onComplete: () => this.sprite.destroy(),
    });
  }
}
