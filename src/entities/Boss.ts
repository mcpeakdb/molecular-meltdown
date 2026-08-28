import Phaser from 'phaser';
import {
  type Affinity,
  applyAffinity,
  type DamageType,
  DEPTH,
  GROUND_TOP_Y,
  RESIST_CUE_THRESHOLD,
  WEAK_CUE_THRESHOLD,
} from '../constants';
import type GameScene from '../scenes/GameScene';
import SoundSystem from '../systems/SoundSystem';
import type { EnemySprite } from '../types';

const PHASES = {
  ENTER: 'enter', // sliding into the arena — no attacks yet
  IDLE: 'idle', // hovering near its anchor, picking the next attack
  TELEGRAPH: 'telegraph', // winding up a telegraphed attack the player can read
  HURT: 'hurt',
  DEAD: 'dead',
} as const;
type BossPhase = (typeof PHASES)[keyof typeof PHASES];

type AttackKind = 'volley' | 'radial' | 'barrage' | 'sweep';

// Boss hovers around its anchor at this height — low enough that a grounded player's melee can still
// reach it, but high enough to loom. (Player center sits ≈ GROUND_TOP_Y − 22 when standing.)
const HOVER_Y = GROUND_TOP_Y - 80;

export type BossVariant = 'bacterium' | 'amoeba' | 'phage' | 'roach' | 'beetle' | 'hornet';

interface BossVariantCfg {
  texture: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  scale: number;
  bodySize: [number, number];
  bodyOffset: [number, number];
  projectileCount: number; // shots per ranged volley
  projectileSpread: number; // radians between adjacent shots
  labelColor: string;
  activateTint: number;
  fireTint: number;
}

const VARIANTS: Record<BossVariant, BossVariantCfg> = {
  // Sector 1 — the original Super Bacterium: balanced charger with a 3-shot flagella volley
  bacterium: {
    texture: 'boss_bacterium',
    name: 'SUPER BACTERIUM',
    hp: 250,
    speed: 140,
    damage: 22,
    scale: 1.5,
    bodySize: [60, 90],
    bodyOffset: [18, 10],
    projectileCount: 3,
    projectileSpread: 0.3,
    labelColor: '#ffaaaa',
    activateTint: 0xff0000,
    fireTint: 0xff8800,
  },
  // Sector 2 — Amoeba Titan: slower and beefier, lobs a wide 5-shot pseudopod spray
  amoeba: {
    texture: 'boss_amoeba',
    name: 'AMOEBA TITAN',
    hp: 425,
    speed: 120,
    damage: 26,
    scale: 1.7,
    bodySize: [64, 88],
    bodyOffset: [16, 16],
    projectileCount: 5,
    projectileSpread: 0.26,
    labelColor: '#aaffcc',
    activateTint: 0x33ff88,
    fireTint: 0x66ffaa,
  },
  // Sector 3 — Phage Lord: fast, hard-hitting finale boss with a dense 7-shot radial burst
  phage: {
    texture: 'boss_phage',
    name: 'PHAGE LORD',
    hp: 650,
    speed: 175,
    damage: 32,
    scale: 1.6,
    bodySize: [50, 100],
    bodyOffset: [23, 6],
    projectileCount: 7,
    projectileSpread: 0.22,
    labelColor: '#aaddff',
    activateTint: 0x44aaff,
    fireTint: 0x88ccff,
  },
  // Sector 4 — Roach King: the lab-floor finale. Fastest and toughest, with a dense 8-shot spread.
  roach: {
    texture: 'boss_roach',
    name: 'ROACH KING',
    hp: 800,
    speed: 185,
    damage: 34,
    scale: 1.5,
    bodySize: [70, 54],
    bodyOffset: [21, 18],
    projectileCount: 8,
    projectileSpread: 0.2,
    labelColor: '#e0c08a',
    activateTint: 0xaa6622,
    fireTint: 0xffaa44,
  },
  // Sector 5 — Dung Beetle: a slow, hugely armored bruiser with heavy 6-shot volleys.
  beetle: {
    texture: 'boss_beetle',
    name: 'DUNG BEETLE',
    hp: 1000,
    speed: 110,
    damage: 38,
    scale: 1.7,
    bodySize: [78, 60],
    bodyOffset: [17, 16],
    projectileCount: 6,
    projectileSpread: 0.28,
    labelColor: '#cbb083',
    activateTint: 0x6b4a22,
    fireTint: 0xc89a44,
  },
  // Sector 6 — Hornet Queen: the final boss. Fast flyer that floods the arena with wide, fast sprays.
  hornet: {
    texture: 'boss_hornet',
    name: 'HORNET QUEEN',
    hp: 1100,
    speed: 200,
    damage: 36,
    scale: 1.55,
    bodySize: [56, 70],
    bodyOffset: [28, 12],
    projectileCount: 9,
    projectileSpread: 0.18,
    labelColor: '#ffd86a',
    activateTint: 0xe0a000,
    fireTint: 0xffd24a,
  },
};

/**
 * Boss matchups. Deliberately gentler than the trash-mob table (1.5 weak / 0.6–0.8 resist): a finale
 * should reward bringing the right tool, not collapse to a two-hit kill because the loadout guessed
 * right. Every boss has an intended counter and something it shrugs off; none is immune to anything.
 */
const BOSS_AFFINITY: Record<BossVariant, Affinity> = {
  // A colossal germ — still a germ. Disinfectant is the answer; punching it is not.
  bacterium: { caustic: 1.5, acid: 1.3, impact: 0.8 },
  // An enormous water-filled blob: freeze or lyse it. Puncturing does almost nothing.
  amoeba: { cryo: 1.5, caustic: 1.3, piercing: 0.6 },
  // A viral capsid, scaled up: radiation cooks it, gas has nothing to poison.
  phage: { energy: 1.5, cryo: 1.3, gas: 0.6 },
  // The cockroach cliché is true: radiation-proof and armoured. Dissolve the shell instead.
  roach: { acid: 1.5, gas: 1.3, energy: 0.7, explosive: 0.8 },
  // Heavily armoured — get inside the shell with a shockwave rather than chipping at it.
  beetle: { explosive: 1.5, caustic: 1.3, piercing: 0.6, gas: 0.8 },
  // You smoke a hive out, or you burn it.
  hornet: { fire: 1.5, gas: 1.4, cryo: 0.8, piercing: 0.8 },
};

export default class Boss {
  scene: GameScene;
  variant: BossVariant;
  maxHp: number;
  hp: number;
  damage: number;
  speed: number;
  alive = true;
  isBoss = true;

  private readonly scale: number;
  private readonly projectileCount: number;
  private readonly projectileSpread: number;
  private readonly fireTint: number;
  private readonly activateTint: number;

  sprite: EnemySprite;
  phase: BossPhase = PHASES.IDLE;
  hurtTimer = 0;
  actionTimer = 0;
  activated = false;

  /** Horizontal spot the boss holds station around — it never pursues the player. */
  readonly anchorX: number;
  private pendingAttack: AttackKind | null = null;
  private contactCd = 0;

  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBar: Phaser.GameObjects.Rectangle;
  private hpLabel: Phaser.GameObjects.Text;

  constructor(scene: GameScene, x: number, y: number, variant: BossVariant = 'bacterium') {
    this.scene = scene;
    this.variant = variant;
    const cfg = VARIANTS[variant];
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.damage = cfg.damage;
    this.speed = cfg.speed;
    this.scale = cfg.scale;
    this.projectileCount = cfg.projectileCount;
    this.projectileSpread = cfg.projectileSpread;
    this.fireTint = cfg.fireTint;
    this.activateTint = cfg.activateTint;
    this.anchorX = x;

    const base = scene.physics.add.sprite(x, y, cfg.texture) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    base.setScale(cfg.scale);
    base.setDepth(DEPTH.BOSS);
    base.body.setSize(cfg.bodySize[0], cfg.bodySize[1]);
    base.body.setOffset(cfg.bodyOffset[0], cfg.bodyOffset[1]);
    base.body.setCollideWorldBounds(true);
    base.body.setAllowGravity(false); // bosses hover under their own velocity, not gravity
    this.sprite = base as EnemySprite;
    this.sprite.enemyRef = this;

    this.hpBarBg = scene.add.rectangle(0, 0, 300, 18, 0x330000).setDepth(200).setVisible(false);
    this.hpBar = scene.add.rectangle(0, 0, 300, 18, 0xff2222).setDepth(201).setVisible(false);
    this.hpLabel = scene.add
      .text(0, 0, cfg.name, {
        fontSize: '15px',
        color: cfg.labelColor,
        fontStyle: 'bold',
      })
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false);
  }

  activate(): void {
    this.activated = true;
    this.hpBarBg.setVisible(true);
    this.hpBar.setVisible(true);
    this.hpLabel.setVisible(true);
    SoundSystem.play(this.scene.audioCtx, 'boss_roar');
    this.scene.shake(600, 0.018);
    this.sprite.setTint(this.activateTint);
    this.scene.time.delayedCall(500, () => this.sprite.clearTint());
    // The scene locks the camera to the arena before the boss makes its entrance.
    this.scene.events.emit('boss-activated', this.anchorX);

    // Sweep in from off the right edge of the arena to its hover anchor — no chasing,
    // just a dramatic arrival, then it settles into the attack loop.
    this.phase = PHASES.ENTER;
    this.sprite.body.setVelocity(0, 0);
    this.sprite.setPosition(this.anchorX + 360, HOVER_Y);
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.anchorX,
      y: HOVER_Y,
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (this.phase === PHASES.ENTER) {
          this.phase = PHASES.IDLE;
          this.actionTimer = 600;
        }
      },
    });
  }

  update(time: number, delta: number, playerSprite: Phaser.Physics.Arcade.Sprite): void {
    if (!this.alive || !this.sprite.active) return;

    if (!this.activated) {
      const dist = Phaser.Math.Distance.Between(playerSprite.x, playerSprite.y, this.sprite.x, this.sprite.y);
      if (dist < 500) this.activate();
      return;
    }

    this.hurtTimer = Math.max(0, this.hurtTimer - delta);
    this.actionTimer = Math.max(0, this.actionTimer - delta);
    this.contactCd = Math.max(0, this.contactCd - delta);

    const dx = playerSprite.x - this.sprite.x;

    if (this.phase === PHASES.DEAD) return;

    if (this.phase === PHASES.HURT) {
      if (this.hurtTimer <= 0) this.phase = PHASES.IDLE;
      this.sprite.body.setVelocityX(this.sprite.body.velocity.x * 0.9);
      this._updateHPBar();
      return;
    }

    if (this.phase === PHASES.ENTER) {
      // Entrance tween owns position; just keep the facing/HP bar in sync.
      this.sprite.setFlipX(dx < 0);
      this._updateHPBar();
      return;
    }

    // IDLE / TELEGRAPH: hold station near the anchor and bob — never pursue the player.
    this._hover(time);

    if (this.phase === PHASES.IDLE && this.actionTimer <= 0 && this.pendingAttack === null) this._beginAttack();

    // Light contact deterrent so the player can't simply stand inside the boss and mash melee.
    if (this.contactCd <= 0 && !this.scene.player.isClearingEnemy) {
      const pdx = playerSprite.x - this.sprite.x;
      const pdy = playerSprite.y - this.sprite.y;
      if (Math.abs(pdx) < 56 && Math.abs(pdy) < 80) {
        this.scene.player.takeDamage(Math.round(this.damage * 0.5));
        this.contactCd = 800;
      }
    }

    // Slow breathing pulse centred on the variant's base scale
    this.sprite.setScale(this.scale + Math.sin(time * 0.0007) * 0.05);

    this.sprite.setFlipX(dx < 0);
    this.sprite.y = Phaser.Math.Clamp(this.sprite.y, 120, GROUND_TOP_Y - 60);
    this._updateHPBar();
  }

  /** Gentle float around the anchor: horizontal sway + vertical bob, easing via velocity. */
  private _hover(time: number): void {
    const targetX = this.anchorX + Math.sin(time * 0.0008) * 70;
    const targetY = HOVER_Y + Math.sin(time * 0.0012) * 34;
    this.sprite.body.setVelocity((targetX - this.sprite.x) * 2, (targetY - this.sprite.y) * 2);
  }

  /** Pick the next attack, telegraph it, then fire — recovery scales with how hurt the boss is. */
  private _beginAttack(): void {
    const hpPct = this.hp / this.maxHp;
    const kind = this._pickAttack(hpPct);
    this.pendingAttack = kind;
    this.phase = PHASES.TELEGRAPH;

    // Aggression ramps as HP drops: shorter telegraphs and recovery windows.
    const tighten = hpPct > 0.6 ? 1 : hpPct > 0.3 ? 0.8 : 0.62;
    const telegraph = Math.round((kind === 'radial' ? 480 : 360) * tighten);

    // Telegraph: a pulsing tint flash so the player can read the wind-up and start dodging.
    this.sprite.setTint(this.fireTint);
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.scale * 1.12,
      scaleY: this.scale * 1.12,
      duration: telegraph / 2,
      yoyo: true,
    });

    this.scene.time.delayedCall(telegraph, () => {
      if (!this.alive || this.phase === PHASES.DEAD || this.phase === PHASES.HURT) {
        // Interrupted mid-wind-up — drop this attack and let the boss re-choose once it recovers.
        this.sprite.clearTint();
        this.pendingAttack = null;
        return;
      }
      this.sprite.clearTint();
      const recovery = this._fireAttack(kind);
      this.pendingAttack = null;
      this.phase = PHASES.IDLE;
      this.actionTimer = Math.round(recovery * tighten);
    });
  }

  private _pickAttack(hpPct: number): AttackKind {
    const pool: AttackKind[] =
      hpPct > 0.6
        ? ['volley', 'volley', 'sweep']
        : hpPct > 0.3
          ? ['volley', 'sweep', 'radial', 'barrage']
          : ['radial', 'barrage', 'sweep', 'volley', 'radial'];
    return pool[Phaser.Math.Between(0, pool.length - 1)];
  }

  /** Spawn an attack's projectiles. Returns the post-attack recovery in ms (before HP scaling). */
  private _fireAttack(kind: AttackKind): number {
    switch (kind) {
      case 'volley':
        this._aimedSpread();
        return 950;
      case 'radial':
        this._radialBurst();
        return 1150;
      case 'barrage':
        this._barrage();
        return 1300;
      case 'sweep':
        this._sweep();
        return 1000;
    }
  }

  private _muzzle(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** Symmetric spread aimed at the player — sidestep to dodge. Count/spread vary per variant. */
  private _aimedSpread(): void {
    const player = this.scene.player.sprite;
    const { x, y } = this._muzzle();
    const baseAngle = Phaser.Math.Angle.Between(x, y, player.x, player.y);
    const half = (this.projectileCount - 1) / 2;
    for (let i = 0; i < this.projectileCount; i++) {
      const angle = baseAngle + (i - half) * this.projectileSpread;
      this.scene.spawnEnemyProjectile(x, y, angle, this.damage * 0.55, 320);
    }
  }

  /** A full ring of slower shots — find a gap and move through it. */
  private _radialBurst(): void {
    const { x, y } = this._muzzle();
    const count = this.projectileCount * 2 + 4;
    const offset = Math.random() * Math.PI;
    for (let i = 0; i < count; i++) {
      const angle = offset + (i / count) * Math.PI * 2;
      this.scene.spawnEnemyProjectile(x, y, angle, this.damage * 0.5, 200);
    }
  }

  /** A burst of single shots that re-aim at the player — keep moving to break the lead. */
  private _barrage(): void {
    const shots = 5;
    for (let i = 0; i < shots; i++) {
      this.scene.time.delayedCall(i * 140, () => {
        if (!this.alive || this.phase === PHASES.DEAD) return;
        const player = this.scene.player.sprite;
        const { x, y } = this._muzzle();
        const angle = Phaser.Math.Angle.Between(x, y, player.x, player.y);
        this.scene.spawnEnemyProjectile(x, y, angle, this.damage * 0.5, 360);
      });
    }
  }

  /** A fan of shots that rakes across the arena — run with the sweep to stay in a safe lane. */
  private _sweep(): void {
    const player = this.scene.player.sprite;
    const dir = player.x < this.sprite.x ? -1 : 1; // sweep toward the player's side
    const steps = 9;
    const arc = Math.PI * 0.6;
    for (let i = 0; i < steps; i++) {
      this.scene.time.delayedCall(i * 70, () => {
        if (!this.alive || this.phase === PHASES.DEAD) return;
        const { x, y } = this._muzzle();
        // Sweep from straight-down toward the player's flank.
        const angle = Math.PI / 2 + dir * (-arc / 2 + (i / (steps - 1)) * arc);
        this.scene.spawnEnemyProjectile(x, y, angle, this.damage * 0.5, 240);
      });
    }
  }

  private _updateHPBar(): void {
    const pct = Math.max(0, this.hp / this.maxHp);
    const cx = (this.scene.game.config.width as number) / 2;
    this.hpBarBg.setScrollFactor(0).setPosition(cx, 50);
    this.hpBar.setScrollFactor(0).setPosition(cx - 150 + 150 * pct, 50);
    this.hpBar.width = 300 * pct;
    this.hpLabel.setScrollFactor(0).setPosition(cx - 80, 32);
  }

  /** Always false — bosses are bleed-immune, so nothing can ever be set off on them. */
  get isBleeding(): boolean {
    return false;
  }

  applyBleed(_damage: number, _duration: number, _type: DamageType): void {
    /* boss is immune to bleed */
  }

  /** This boss's multiplier against `type` — 1 when neutral. */
  affinityFor(type: DamageType): number {
    return applyAffinity(1, type, BOSS_AFFINITY[this.variant]);
  }

  takeDamage(amount: number, type: DamageType, knockbackDir = 1, _slow = false): void {
    // Not on screen yet — screen-wide specials must not reach the boss before it activates,
    // otherwise it can be killed offscreen and the stage gets stuck in a degenerate state.
    if (!this.activated) return;
    if (!this.alive || this.phase === PHASES.DEAD) return;

    const mult = this.affinityFor(type);
    this.hp = Math.round(this.hp - applyAffinity(amount, type, BOSS_AFFINITY[this.variant]));
    if (mult >= WEAK_CUE_THRESHOLD) this.scene.spawnAffinityCue(this.sprite.x, this.sprite.y, true);
    else if (mult <= RESIST_CUE_THRESHOLD) this.scene.spawnAffinityCue(this.sprite.x, this.sprite.y, false);

    this.sprite.body.setVelocity(0, 0);
    this.scene.time.delayedCall(80, () => {
      if (this.sprite.active) this.sprite.body.setVelocity(knockbackDir * 80, 0);
    });

    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.scale * 1.4,
      scaleY: this.scale * 0.65,
      duration: 80,
      ease: 'Power2',
      yoyo: true,
      onComplete: () => {
        if (this.sprite.active) this.sprite.setScale(this.scale);
      },
    });

    this.sprite.setTint(0xffffff);
    this.scene.time.delayedCall(120, () => {
      if (this.sprite.active) this.sprite.clearTint();
    });
    this.phase = PHASES.HURT;
    this.hurtTimer = 200;

    if (this.hp <= 0) this._die();
  }

  private _die(): void {
    this.alive = false;
    this.phase = PHASES.DEAD;
    this.sprite.body.setVelocity(0, 0);
    this.hpBarBg.destroy();
    this.hpBar.destroy();
    this.hpLabel.destroy();
    this.scene.shake(800, 0.02);

    for (let i = 0; i < 8; i++) {
      this.scene.time.delayedCall(i * 180, () => {
        const ox = Phaser.Math.Between(-40, 40);
        const oy = Phaser.Math.Between(-40, 40);
        this.scene.spawnHitFlash(this.sprite.x + ox, this.sprite.y + oy, 0xff8800, 60);
      });
    }

    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scaleX: 3,
      scaleY: 3,
      duration: 1400,
      onComplete: () => {
        this.sprite.destroy();
        this.scene.onBossDefeated();
      },
    });
  }
}
