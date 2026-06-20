import Phaser from 'phaser';
import { DEPTH, FLYER_MAX_Y, FLYER_MIN_Y, GAME_HEIGHT, GRAVITY } from '../constants';
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

export type EnemyType = 'bacterium' | 'virus' | 'dustbunny' | 'pollen' | 'amoeba' | 'spore' | 'mite' | 'ant';

interface EnemyConfig {
  hp: number;
  speed: number;
  damage: number;
  attackRate: number;
  texture: string;
  scale: number;
  /** Flyers hover in the air (no gravity); ground types fall and walk on the floor/ledges. */
  fly: boolean;
}

const CONFIGS: Record<EnemyType, EnemyConfig> = {
  bacterium: { hp: 35, speed: 90, damage: 10, attackRate: 1600, texture: 'bacterium', scale: 1.0, fly: false },
  virus: { hp: 22, speed: 130, damage: 8, attackRate: 1200, texture: 'virus', scale: 1.0, fly: true },
  dustbunny: { hp: 50, speed: 60, damage: 14, attackRate: 2000, texture: 'dustbunny', scale: 1.0, fly: false },
  pollen: { hp: 18, speed: 160, damage: 6, attackRate: 900, texture: 'pollen', scale: 1.0, fly: true },
  // Sector 2+ newcomers
  amoeba: { hp: 80, speed: 48, damage: 16, attackRate: 2200, texture: 'amoeba', scale: 1.15, fly: false }, // slow tank
  spore: { hp: 14, speed: 180, damage: 7, attackRate: 800, texture: 'spore', scale: 0.9, fly: true }, // fast, hovers
  mite: { hp: 30, speed: 115, damage: 11, attackRate: 1300, texture: 'mite', scale: 0.9, fly: false }, // crawler, hops
  // Sector 4 (LAB FLOOR) — fast, low-HP ground swarmer that scurries (no hop).
  ant: { hp: 24, speed: 150, damage: 9, attackRate: 950, texture: 'ant', scale: 0.95, fly: false },
};

const DETECT_RANGE = 320;
const ATTACK_RANGE = 58;

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

  sprite: EnemySprite;
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

    const cfg = CONFIGS[type] ?? CONFIGS.bacterium;
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.speed = cfg.speed;
    this.damage = cfg.damage;
    this.attackRate = cfg.attackRate;
    this.fly = cfg.fly;

    const base = scene.physics.add.sprite(x, y, cfg.texture) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    base.setScale(cfg.scale);
    base.setDepth(DEPTH.ENEMY);
    base.body.setSize(30, 40);
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

    // Walked off a ledge into a pit — perish (counts toward the clear instead of getting stuck offscreen).
    if (this.sprite.y > GAME_HEIGHT + 40) {
      this._die();
      return;
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

    switch (this.state) {
      case STATES.PATROL:
        this._patrol(speed);
        break;
      case STATES.CHASE:
        this._chase(dx, dy, dist, speed);
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

    // Once an enemy has joined the fight, confine it to the visible arena. Without this a
    // patrolling germ can drift off to an unreachable corner, leaving the exit sealed with
    // "no enemies in view" and the player unable to progress.
    if (this.hasEnteredView) {
      const view = this.scene.cameras.main.worldView;
      this.sprite.x = Phaser.Math.Clamp(this.sprite.x, view.x + 24, view.right - 24);
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
      scaleX: 1.4,
      scaleY: 0.65,
      duration: 60,
      ease: 'Power2',
      yoyo: true,
      onComplete: () => {
        if (this.sprite.active) this.sprite.setScale(1);
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
    switch (this.type) {
      case 'bacterium':
        // Cytoplasm pulse — vertical elongation driven by a per-instance phase offset
        this.sprite.setScale(1, 1 + Math.sin(time * 0.002 + this.sprite.x * 0.005) * 0.07);
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
          this.sprite.setScale(1 + s, 1 - s);
        }
        break;
      case 'amoeba': {
        // Slow gelatinous wobble — wide, sloshing pseudopod blob
        const w = Math.sin(time * 0.0016 + this.sprite.x * 0.004) * 0.09;
        this.sprite.setScale(1.15 * (1 + w), 1.15 * (1 - w));
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
          this.sprite.setScale(0.9 * (1 + s), 0.9 * (1 - s));
        }
        break;
      case 'ant':
        // Quick scuttling jitter — fast little body shudder as it scurries
        if (this.sprite.body.onFloor()) {
          const s = Math.sin(time * 0.02 + this.sprite.x) * 0.04;
          this.sprite.setScale(0.95 * (1 + s), 0.95 * (1 - s));
        }
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
        scaleX: 0.78,
        scaleY: 1.3,
        duration: 90,
        ease: 'Power2',
        yoyo: true,
        onComplete: () => {
          if (this.sprite.active) this.sprite.setScale(this.type === 'mite' ? 0.9 : 1);
        },
      });
    }
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
