import Phaser from 'phaser';
import type { ArmorId, AttackId, BaseAtom, Difficulty, HealId, NobleGasId, SectorId } from '../constants';
import {
  ARMOR_DROPS,
  ARMOR_IDS,
  ATTACK_ORDER,
  BASE_ATOMS,
  COIN_BONUS,
  COIN_COLOR,
  COIN_SCORE,
  COINS_PER_STAGE,
  CRUMBLE_DELAY_MS,
  DEPTH,
  DIFFICULTY_SCALE,
  ELEMENT_COLORS,
  ELEMENT_NAMES,
  ELEMENTS,
  FLYER_MAX_Y,
  FLYER_MIN_Y,
  GAME_HEIGHT,
  GAME_WIDTH,
  GAP_FALL_DAMAGE,
  GRAVITY,
  GROUND_TOP_Y,
  HAZARD_DAMAGE,
  HEAL_DROPS,
  HEAL_IDS,
  isFinaleStage,
  MAX_ELEMENT_LEVEL,
  MEG_MAX_LEVEL_QUIPS,
  NOBLE_GAS_BONUS,
  NOBLE_GAS_BY_ID,
  NOBLE_GAS_COUNT,
  NOBLE_GASES,
  PLAYER_BOUNCE_VELOCITY,
  PLAYER_MAX_HP,
  RUN_LIVES,
  SECTORS,
  STAGE_COUNT,
  sectorOf,
  slotKeyLabels,
  WORLD_WIDTH,
} from '../constants';
import Atom from '../entities/Atom';
import Boss from '../entities/Boss';
import Enemy, { type EnemyType } from '../entities/Enemy';
import Player from '../entities/Player';
import { fitHeightScale } from '../spriteFit';
import { NOBLE_BY_STAGE, STAGES, type StageDef } from '../stages';
import MusicSystem, { type TrackId } from '../systems/MusicSystem';
import SaveSystem, { type RunRecord } from '../systems/SaveSystem';
import Settings from '../systems/Settings';
import SoundSystem from '../systems/SoundSystem';
import type { AtomSprite, EnemySprite, WasdKeys } from '../types';
import type HUDScene from './HUDScene';

type ProjectileSprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  damage: number;
  knockback: number;
  piercing: boolean;
};

/** Enemy types that fly (hover, no gravity) rather than walking the floor. */
const FLYER_TYPES = new Set<EnemyType>(['virus', 'spore', 'pollen', 'fly', 'bee']);

/** Camera zoom during normal play (tighter on the player). Boss fights pull back to 1.0 (a full
 *  screen) so the whole one-screen arena fits — see `_lockBossArena`. */
const PLAY_ZOOM = 1.5;
const BOSS_ZOOM = 1.0;

/** A crumbling floor tile: its plug collider fills a hole in the base floor until it collapses. */
type CrumbleTile = {
  x1: number;
  x2: number;
  gfx: Phaser.GameObjects.Graphics;
  collider?: Phaser.Physics.Arcade.Sprite;
  state: 'solid' | 'warning' | 'gone';
};

const SECTOR_THEMES: Record<
  number,
  {
    floorLine: number;
    shadow: number;
    label: string;
    tick: number;
    particles: number[];
    flashR: number;
    flashG: number;
    flashB: number;
    clearColor: string;
  }
> = {
  1: {
    floorLine: 0x7a9040,
    shadow: 0x081408,
    label: '#88bb60',
    tick: 0x6a8030,
    particles: [0xc8a040, 0x4aaa60, 0x80c8a0, 0xb8c870],
    flashR: 255,
    flashG: 230,
    flashB: 100,
    clearColor: '#ffee44',
  },
  2: {
    floorLine: 0xa04030,
    shadow: 0x180808,
    label: '#dd7744',
    tick: 0x803020,
    particles: [0xcc5030, 0xee7050, 0xff8860, 0xbb3820],
    flashR: 255,
    flashG: 110,
    flashB: 80,
    clearColor: '#ff9944',
  },
  3: {
    floorLine: 0x5050c0,
    shadow: 0x080812,
    label: '#7788ee',
    tick: 0x4040a0,
    particles: [0x7070cc, 0x5060cc, 0x9090ff, 0x5048cc],
    flashR: 120,
    flashG: 150,
    flashB: 255,
    clearColor: '#aaccff',
  },
  // Sector 4 — LAB FLOOR: clinical grey-blue tiling with teal reagent accents.
  4: {
    floorLine: 0x7b8893,
    shadow: 0x0a0d12,
    label: '#5fc8bb',
    tick: 0x55636e,
    particles: [0xaab0b8, 0xcfd6dd, 0x8a92a0, 0x4fd0c0],
    flashR: 160,
    flashG: 240,
    flashB: 220,
    clearColor: '#9ff0dd',
  },
  // Sectors 5 & 6 share the lab-floor floor/dust but escalate the accent (amber → crimson danger).
  5: {
    floorLine: 0x7b8893,
    shadow: 0x0a0d12,
    label: '#e0b24a',
    tick: 0x55636e,
    particles: [0xaab0b8, 0xcfd6dd, 0x8a92a0, 0xe0b24a],
    flashR: 255,
    flashG: 210,
    flashB: 120,
    clearColor: '#ffd98a',
  },
  6: {
    floorLine: 0x7b8893,
    shadow: 0x0a0d12,
    label: '#ff7a55',
    tick: 0x55636e,
    particles: [0xaab0b8, 0xcfd6dd, 0x8a92a0, 0xcc5540],
    flashR: 255,
    flashG: 120,
    flashB: 90,
    clearColor: '#ffb09a',
  },
};

export default class GameScene extends Phaser.Scene {
  // Declared here so entities can reference them via `import type GameScene`
  player!: Player;
  boss!: Boss;
  audioCtx!: AudioContext;
  score = 0;
  enemyGroup!: Phaser.Physics.Arcade.Group;
  atomGroup!: Phaser.Physics.Arcade.Group;
  projectileGroup!: Phaser.Physics.Arcade.Group;
  enemyProjectileGroup!: Phaser.Physics.Arcade.Group;

  currentStage = 1;
  difficulty: Difficulty = 'normal';
  private stageDef!: StageDef;
  private worldWidth = WORLD_WIDTH;
  /** Climbable sky above the standard screen (px) — drives vertical camera/world bounds. 0 = locked. */
  private _rise = 0;

  // ── Enemy counter (germs cleared this stage; the boss counts as one germ) ──
  private _enemyTotal = 0;
  private _enemyKilled = 0;

  // ── Scoring (score is the cumulative run total, carried between stages) ──
  private _stageStartMs = 0;
  private _stageBaseScore = 0; // run score at the moment this stage began
  private _lastTimeBonus = 0;
  private _lastNoHitBonus = 0;
  private _runSubmitted = false;

  // ── Silver coins (per-stage collectible; a full sweep awards COIN_BONUS) ──
  private _coinsTotal = 0;
  private _coinsCollected = 0;
  private _coinBonusAwarded = false;

  /** Biome/theme group this stage belongs to (1–3). */
  get sector(): SectorId {
    return sectorOf(this.currentStage);
  }

  /** Background track for the current stage — one theme per sector. */
  private _stageTrack(): TrackId {
    return `sector${this.sector}` as TrackId;
  }

  // ── Exit portal (non-boss stages clear by reaching it once enemies are down) ──
  private _exitX = 0;
  private _exitOpen = false;
  private _exitPortal?: Phaser.GameObjects.Container;
  private _exitHint?: Phaser.GameObjects.Text;

  // ── Boss arena (camera locks to one screen once the boss activates) ──
  private _bossArena: { left: number; right: number } | null = null;
  private _bossArenaHandler?: (anchorX: number) => void;
  /** The active boss-arena bounds, or null during normal play. Enemies confine to it only when set. */
  get bossArena(): { left: number; right: number } | null {
    return this._bossArena;
  }

  // Petri-dish iris mask on the camera. Its ellipse is drawn inverse to the camera zoom so the
  // framing stays fixed to the screen edges regardless of how far we're zoomed in (see _redrawDish).
  private _dishMask?: Phaser.GameObjects.Graphics;
  // Screen-fixed vignette overlay, counter-scaled with the zoom (same reason as the dish mask).
  private _vignette?: Phaser.GameObjects.Image;
  // The resting camera zoom for the current context: PLAY_ZOOM during free play, BOSS_ZOOM during a
  // boss fight. Cutscene UI (dialogue, banners) pulls back to BOSS_ZOOM, then restores to this.
  private _playZoom = BOSS_ZOOM;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WasdKeys;
  private slotKeys!: Phaser.Input.Keyboard.Key[][];
  private pauseKey!: Phaser.Input.Keyboard.Key;
  private pauseKeyAlt!: Phaser.Input.Keyboard.Key;
  private isPaused = false;
  private stageCleared = false;

  // ── Tutorial mode (M.E.G.-guided intro level) ──────────────────────────────
  private isTutorial = false;
  private _meg?: Phaser.GameObjects.Sprite;
  private _dlgBg?: Phaser.GameObjects.Rectangle;
  private _dlgName?: Phaser.GameObjects.Text;
  private _dlgText?: Phaser.GameObjects.Text;
  private _dlgPortrait?: Phaser.GameObjects.Sprite;
  private _dlgHint?: Phaser.GameObjects.Text;
  private _dlgQueue: string[] = [];
  private _dlgOnDone?: () => void;
  private _dlgBlocking = false;
  private _dlgAdvance?: () => void;
  private _firedTips = new Set<string>();
  private _activeTip?: string;
  private _tutAtom?: AtomSprite;
  private _tutEnemy?: Enemy;
  private _tutDone = false;
  // ── 2D platforming state ──────────────────────────────────────────────────
  /** Static colliders for the ground segments, ledges, and (until they fall) crumble tiles. */
  private platformGroup!: Phaser.Physics.Arcade.StaticGroup;
  /** Holes in the floor (gaps + crumble ranges) — used to skip enemy spawns and exclude unsafe footing. */
  private _holes: { x1: number; x2: number }[] = [];
  /** Last x where the player stood on solid ground away from a hole — pit-fall respawn point. */
  private _lastSafeX = 120;
  // ── Platforming hazards (data-driven per stage in src/stages.ts) ──
  private _hazards: { x1: number; x2: number }[] = [];
  private _pads: { x: number; gfx: Phaser.GameObjects.Graphics }[] = [];
  private _crumbles: CrumbleTile[] = [];
  private readonly _tutAtomX = 900;
  private readonly _tutEnemyX = 1500;
  private readonly _gapX1 = 2080;
  private readonly _gapX2 = 2210;
  private readonly _tutEndX = 2720;

  constructor() {
    super('GameScene');
  }

  init(data?: { stage?: number; difficulty?: Difficulty; tutorial?: boolean }): void {
    this.isTutorial = data?.tutorial ?? false;
    // Tutorial reuses Sector 1 art/theme but runs its own content + flow
    this.currentStage = this.isTutorial ? 1 : Phaser.Math.Clamp(data?.stage ?? 1, 1, STAGE_COUNT);
    this.stageDef = STAGES[this.currentStage - 1];
    this.worldWidth = this.isTutorial ? WORLD_WIDTH : this.stageDef.width;
    // Score is the cumulative run total, carried across stages via the registry (reset on a fresh run).
    this.score = this.isTutorial ? 0 : ((this.registry.get('runScore') as number | undefined) ?? 0);
    this._stageBaseScore = this.score;
    this._lastTimeBonus = 0;
    this._lastNoHitBonus = 0;
    this._runSubmitted = false;
    this.difficulty = this.isTutorial
      ? 'normal'
      : (data?.difficulty ?? (this.registry.get('difficulty') as Difficulty | undefined) ?? 'normal');

    // Reset per-run state (the scene instance is reused across restarts)
    this.isPaused = false;
    this.stageCleared = false;
    this._holes = [];
    this._lastSafeX = 120;
    this._hazards = [];
    this._pads = [];
    this._crumbles = [];
    this._tutDone = false;
    this._exitOpen = false;
    this._exitPortal = undefined;
    this._exitHint = undefined;
    // Clear any boss-arena lock from a previous run, or restarting a boss stage would clamp the
    // player to the (now stale) arena near the level's end with no way to walk back. Also drop a
    // lingering activation listener (from a run where the player died before the boss woke up).
    this._bossArena = null;
    if (this._bossArenaHandler) {
      this.events.off('boss-activated', this._bossArenaHandler);
      this._bossArenaHandler = undefined;
    }
    // Reused-scene refs (see below) — the dish mask isn't recreated on a tutorial run, so a stale
    // destroyed ref would otherwise survive into it. Reassigned in _buildWorld / _playStageIntro.
    this._vignette = undefined;
    this._dishMask = undefined;
    this._dlgBlocking = false;
    this._dlgQueue = [];
    this._firedTips.clear();
    this._activeTip = undefined;
    // The scene instance is reused across restarts, so these refs would otherwise point at
    // GameObjects destroyed in the previous lifecycle — clear them so the dialogue UI is rebuilt
    // lazily (otherwise `_say` skips the stale-but-truthy `_dlgBg` and shows nothing, soft-locking).
    this._dlgBg = undefined;
    this._dlgPortrait = undefined;
    this._dlgName = undefined;
    this._dlgText = undefined;
    this._dlgHint = undefined;
    this._dlgAdvance = undefined;
  }

  create(): void {
    // Real gravity now. The physics world is taller than the view so the player can fall into
    // pits below the screen (we respawn them); the camera bounds stay one screen tall, which keeps
    // the camera vertically locked (lane + ledges).
    // Vertical extent: stages may rise above the standard screen for climbing. The floor stays at
    // GROUND_TOP_Y; `rise` opens room *above* it (negative y), and the camera follows the player up
    // into it. The world keeps the extra +300 below for pit-falls. rise=0 → vertically locked.
    this._rise = this.isTutorial ? 0 : (this.stageDef.rise ?? 0);
    this.physics.world.gravity.y = GRAVITY;
    this.physics.world.setBounds(0, -this._rise, this.worldWidth, GAME_HEIGHT + this._rise + 300);
    this.cameras.main.setBounds(0, -this._rise, this.worldWidth, GAME_HEIGHT + this._rise);
    this.audioCtx = (this.sound as Phaser.Sound.WebAudioSoundManager).context;
    // Stage music keyed by sector (the boss finale swaps to the boss theme on activation, below).
    // Idempotent, so advancing stages within a sector keeps the same loop running unbroken.
    MusicSystem.setTrack(this.audioCtx, this._stageTrack());

    this.platformGroup = this.physics.add.staticGroup();
    this._buildWorld();

    this.enemyGroup = this.physics.add.group();
    this.atomGroup = this.physics.add.group({ allowGravity: false });
    this.projectileGroup = this.physics.add.group({ allowGravity: false });
    this.enemyProjectileGroup = this.physics.add.group({ allowGravity: false });

    if (this.isTutorial) this._spawnTutorial();
    else this._spawnStage();

    this.player = new Player(this, 120, GROUND_TOP_Y - 40);
    this.player.invincibilityMs = DIFFICULTY_SCALE[this.difficulty].invincMs;
    this.player.elementSystem.setSlotCount(DIFFICULTY_SCALE[this.difficulty].weaponSlots);
    // Super weapon: completing the noble-gas collection *this run* arms the Prismatic Beam, auto-bound
    // to a free slot. The collection is run-scoped (reset when a new run starts), so re-arm on any
    // mid-run stage restart where all six have already been gathered.
    if (!this.isTutorial && this._runNobles().length >= NOBLE_GAS_COUNT) {
      this.player.elementSystem.setSuperUnlocked(true);
      this.player.elementSystem.seedSuperWeapon();
    }
    this.physics.add.collider(this.player.sprite, this.platformGroup);
    this.cameras.main.startFollow(this.player.sprite, true, 0.08, 0.08);
    // Zoom is applied once the intro finishes (free play); see the intro onComplete below. It starts
    // at BOSS_ZOOM (1.0) so the intro letterbox and any cutscene UI frame correctly.
    this.cameras.main.setZoom(BOSS_ZOOM);
    this._playZoom = BOSS_ZOOM;

    this.physics.add.overlap(this.player.sprite, this.atomGroup, (_p, atomSprite) =>
      this._onAtomCollect(atomSprite as AtomSprite),
    );

    this.physics.add.overlap(this.player.sprite, this.enemyProjectileGroup, (_p, proj) => {
      const p = proj as ProjectileSprite;
      if (!p.active) return;
      this.player.takeDamage(p.damage || 8);
      p.destroy();
    });

    this.physics.add.overlap(this.projectileGroup, this.enemyGroup, (proj, enemy) => {
      const p = proj as ProjectileSprite;
      const s = enemy as EnemySprite;
      if (!p.active || !s.active || !s.enemyRef) return;
      const dir = (p.body?.velocity.x ?? 0) > 0 ? 1 : -1;
      s.enemyRef.takeDamage(p.damage || 20, dir * (p.knockback || 2));
      if (!p.piercing) p.destroy();
    });

    this._setupInput();
    this.events.on('pause-resume', () => {
      this.isPaused = false;
      this.physics.resume();
    });
    // On-screen pause button (touch) routes through the same path as the keyboard pause.
    this.events.on('request-pause', () => this._openPause());
    this.scene.launch('HUDScene');
    this.isPaused = true;
    this.physics.pause();
    this.stageCleared = false;

    if (this.isTutorial) {
      this._startTutorial();
    } else {
      this._playStageIntro(() => {
        this.isPaused = false;
        this.physics.resume();
        // Free play begins — zoom in on the player. (Boss/cutscene moments pull back to BOSS_ZOOM.)
        this._playZoom = PLAY_ZOOM;
        this._applyZoom(PLAY_ZOOM, 500);
        // Start the clear timer once the intro is over and the player can actually move.
        this._stageStartMs = this.time.now;
        // Sync the HUD to the carried run score (it defaults to 0 until an event arrives).
        this.events.emit('score-update', this.score);
        this.events.emit('coins-update', { collected: this._coinsCollected, total: this._coinsTotal });
        this._emitEnemyCount();
      });
    }
  }

  private _playStageIntro(onComplete: () => void): void {
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;

    const dishMask = this.add.graphics().setScrollFactor(0).setDepth(-999);
    this._dishMask = dishMask;
    this._redrawDish();
    this.cameras.main.setMask(dishMask.createGeometryMask());

    this.time.delayedCall(0, () => this.events.emit('intro-start'));

    const topBar = this.add.rectangle(0, -30, w, 60, 0x000000).setOrigin(0, 0.5).setScrollFactor(0).setDepth(400);
    const botBar = this.add
      .rectangle(0, h + 30, w, 60, 0x000000)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(400);

    const subText = this.add
      .text(w / 2, h / 2 - 38, `${SECTORS[this.sector].name}  ·  Stage ${this.currentStage} of ${STAGE_COUNT}`, {
        fontSize: '22px',
        color: '#aaaacc',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(401)
      .setAlpha(0);

    const titleText = this.add
      .text(w / 2, h / 2 + 5, this.stageDef.name, {
        fontSize: '42px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(401)
      .setAlpha(0);

    // Slide bars in
    this.tweens.add({ targets: topBar, y: 30, duration: 300, ease: 'Power2' });
    this.tweens.add({
      targets: botBar,
      y: h - 30,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        // Fade title in
        this.tweens.add({
          targets: [subText, titleText],
          alpha: 1,
          duration: 300,
          onComplete: () => {
            // Hold, then retract
            this.time.delayedCall(1200, () => {
              this.events.emit('intro-end');
              this.tweens.add({ targets: [subText, titleText], alpha: 0, duration: 300 });
              this.tweens.add({ targets: topBar, y: -30, duration: 300, ease: 'Power2' });
              this.tweens.add({
                targets: botBar,
                y: h + 30,
                duration: 300,
                ease: 'Power2',
                onComplete: () => {
                  topBar.destroy();
                  botBar.destroy();
                  subText.destroy();
                  titleText.destroy();
                  onComplete();
                },
              });
            });
          },
        });
      },
    });
  }

  private _buildWorld(): void {
    const sector = this.sector;
    const theme = SECTOR_THEMES[sector];
    const w = this.worldWidth;
    // Sectors 4–6 are all the lab floor and share one tile set; only sectors 1–3 have their own art.
    const tileSector = sector >= 4 ? 4 : sector;

    this.add
      .tileSprite(0, -this._rise, w, GAME_HEIGHT + this._rise, `bg_tile_${tileSector}`)
      .setOrigin(0, 0)
      .setScrollFactor(0.3)
      .setDepth(-10);
    this.add
      .tileSprite(0, GROUND_TOP_Y, w, GAME_HEIGHT - GROUND_TOP_Y, `ground_tile_${tileSector}`)
      .setOrigin(0, 0)
      .setDepth(DEPTH.GROUND);

    const gLine = this.add.graphics().setDepth(DEPTH.GROUND + 1);
    gLine.lineStyle(3, theme.floorLine, 0.65);
    gLine.lineBetween(0, GROUND_TOP_Y, w, GROUND_TOP_Y);
    gLine.lineStyle(1, theme.tick, 0.5);
    for (let tx = 0; tx <= w; tx += 100) {
      gLine.lineBetween(tx, GROUND_TOP_Y, tx, GROUND_TOP_Y - (tx % 500 === 0 ? 14 : 7));
    }

    this.add.rectangle(w / 2, GROUND_TOP_Y - 18, w, 36, theme.shadow, 0.9).setDepth(DEPTH.GROUND - 1);

    // Solid floor colliders, with real holes where gaps / crumble tiles sit.
    const holes: [number, number][] = this.isTutorial
      ? [[this._gapX1, this._gapX2]]
      : [...(this.stageDef.gaps ?? []), ...(this.stageDef.crumble ?? [])];
    this._buildFloorColliders(holes, w);

    for (let i = 0; i < 80; i++) {
      const g = this.add.graphics().setDepth(-3);
      const color = theme.particles[i % theme.particles.length];
      const x = Phaser.Math.Between(0, w);
      const y = Phaser.Math.Between(50, GROUND_TOP_Y - 20);
      if (i % 3 === 0) {
        // Cell debris ring
        g.lineStyle(0.8, color, Phaser.Math.FloatBetween(0.08, 0.2));
        g.strokeCircle(x, y, Phaser.Math.FloatBetween(3, 7));
      } else {
        // Granule
        g.fillStyle(color, Phaser.Math.FloatBetween(0.06, 0.2));
        g.fillCircle(x, y, Phaser.Math.FloatBetween(1, 2.5));
      }
    }

    // Per-sector decorative scenery + horizon props, then a screen-fixed vignette for mood.
    this._buildBiomeProps(sector, w);
    this._vignette = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette')
      .setScrollFactor(0)
      .setDepth(250)
      .setAlpha(0.9);
  }

  /** Build the static floor: one solid collider per gap-free span, plus visible ledge platforms. */
  private _buildFloorColliders(holes: [number, number][], worldW: number): void {
    const sorted = [...holes].sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [hx1, hx2] of sorted) {
      if (hx1 > cursor) this._addSolid(cursor, hx1);
      cursor = Math.max(cursor, hx2);
    }
    if (cursor < worldW) this._addSolid(cursor, worldW);
  }

  /** An invisible static floor/ground collider spanning [x1, x2] with its top at GROUND_TOP_Y. */
  private _addSolid(x1: number, x2: number): Phaser.Physics.Arcade.Sprite {
    const w = Math.max(1, x2 - x1);
    const h = GAME_HEIGHT + 200 - GROUND_TOP_Y;
    const r = this.platformGroup.create(
      (x1 + x2) / 2,
      GROUND_TOP_Y + h / 2,
      'particle',
    ) as Phaser.Physics.Arcade.Sprite;
    r.setVisible(false);
    r.displayWidth = w;
    r.displayHeight = h;
    r.refreshBody();
    return r;
  }

  /**
   * A visible, solid ledge the player can jump onto: [xLeft, yTop, width]. When `oneWay`, only the
   * top face collides — the player rises up through it (e.g. off a bounce pad) and lands on top,
   * rather than smacking into its underside. Used for the high pad-reward perches.
   */
  private _addPlatform(xLeft: number, yTop: number, w: number, oneWay = false): void {
    const theme = SECTOR_THEMES[this.sector];
    const thickness = 18;
    const cx = xLeft + w / 2;
    const g = this.add.graphics().setDepth(DEPTH.PLATFORM);
    g.fillStyle(theme.shadow, 0.9);
    g.fillRect(xLeft, yTop, w, thickness + 6);
    g.fillStyle(theme.tick, 0.9);
    g.fillRect(xLeft, yTop, w, thickness);
    g.lineStyle(3, theme.floorLine, 0.8);
    g.lineBetween(xLeft, yTop, xLeft + w, yTop);
    const r = this.platformGroup.create(cx, yTop + thickness / 2, 'particle') as Phaser.Physics.Arcade.Sprite;
    r.setVisible(false);
    r.displayWidth = w;
    r.displayHeight = thickness;
    r.refreshBody();
    if (oneWay) {
      // Solid only on top: pass through it from below/the sides, settle onto its surface.
      const body = r.body as Phaser.Physics.Arcade.StaticBody;
      body.checkCollision.down = false;
      body.checkCollision.left = false;
      body.checkCollision.right = false;
    }
  }

  /** Decorative, per-sector procedural scenery: faint background structures + a horizon prop row. */
  private _buildBiomeProps(sector: SectorId, w: number): void {
    const palette = SECTOR_THEMES[sector].particles;
    const rand = (a: number, b: number) => Phaser.Math.FloatBetween(a, b);

    // ── Background structures (above the floor, slow parallax) ──
    const bgCount = Math.round(w / 360);
    for (let i = 0; i < bgCount; i++) {
      const g = this.add.graphics().setScrollFactor(0.6).setDepth(-8);
      const x = (i + 0.5) * (w / bgCount) + rand(-120, 120);
      const y = rand(60, GROUND_TOP_Y - 70);
      const color = palette[i % palette.length];
      const s = rand(0.8, 1.6);
      if (sector === 1) {
        // Petri — colony blobs with a halo ring
        g.fillStyle(color, 0.1);
        g.fillCircle(x, y, 34 * s);
        g.lineStyle(1.5, color, 0.16);
        g.strokeCircle(x, y, 34 * s);
        g.fillStyle(color, 0.13);
        for (let k = 0; k < 5; k++) g.fillCircle(x + rand(-18, 18) * s, y + rand(-18, 18) * s, rand(4, 9) * s);
      } else if (sector === 2) {
        // Blood agar — biconcave red cells
        g.fillStyle(color, 0.14);
        g.fillEllipse(x, y, 60 * s, 40 * s);
        g.fillStyle(0x300808, 0.1);
        g.fillEllipse(x, y, 26 * s, 18 * s);
      } else if (sector === 3) {
        // MacConkey — crystal shards
        g.fillStyle(color, 0.12);
        g.fillTriangle(x, y - 36 * s, x - 14 * s, y + 22 * s, x + 14 * s, y + 22 * s);
        g.lineStyle(1, color, 0.2);
        g.strokeTriangle(x, y - 36 * s, x - 14 * s, y + 22 * s, x + 14 * s, y + 22 * s);
      } else {
        // Lab floor — faint equipment silhouettes (jars / boxes) in the deep background
        g.fillStyle(color, 0.1);
        g.fillRoundedRect(x - 22 * s, y - 30 * s, 44 * s, 60 * s, 6);
        g.lineStyle(1.5, color, 0.16);
        g.strokeRoundedRect(x - 22 * s, y - 30 * s, 44 * s, 60 * s, 6);
        g.fillStyle(color, 0.12);
        g.fillRect(x - 10 * s, y - 40 * s, 20 * s, 12 * s); // a cap / lid
      }
    }

    // ── Horizon props sitting on the back edge of the floor (behind characters) ──
    const propCount = Math.round(w / 150);
    for (let i = 0; i < propCount; i++) {
      const g = this.add.graphics().setDepth(-3.5);
      const x = (i + 0.5) * (w / propCount) + rand(-40, 40);
      const y = GROUND_TOP_Y + rand(-2, 8);
      const color = palette[(i + 1) % palette.length];
      const s = rand(0.7, 1.3);
      if (sector === 1) {
        // little cilia tufts
        g.lineStyle(2, color, 0.5);
        for (let k = -1; k <= 1; k++)
          g.lineBetween(x + k * 4 * s, y, x + k * 4 * s + rand(-3, 3), y - rand(10, 20) * s);
      } else if (sector === 2) {
        // squat cell mounds
        g.fillStyle(color, 0.4);
        g.fillEllipse(x, y, 26 * s, 12 * s);
      } else if (sector === 3) {
        // upright crystal spikes
        g.fillStyle(color, 0.45);
        g.fillTriangle(x - 5 * s, y, x + 5 * s, y, x, y - rand(16, 28) * s);
      } else {
        // Lab floor — dust clumps & crumbs along the floor
        g.fillStyle(color, 0.4);
        g.fillCircle(x, y - 3 * s, 4 * s);
        g.fillStyle(color, 0.25);
        g.fillCircle(x + 7 * s, y - 1, 2.5 * s);
      }
    }
  }

  private _spawnStage(): void {
    const def = this.stageDef;
    const scale = DIFFICULTY_SCALE[this.difficulty];

    // Atoms — branching choice nodes (see src/stages.ts for the per-stage progression). They float at
    // a reachable height, or at an authored `y` when perched on a ledge.
    // Rare rolls upgrade a node into a wildcard: ~0.1% Platinum (pick any atom, +3) or, failing that,
    // ~1% Gold (pick any atom, +2). Platinum is checked first so its slice is carved out of the roll.
    def.atoms.forEach((a) => {
      const roll = Math.random();
      const platinum = roll < 0.001;
      const gold = !platinum && roll < 0.01;
      const choices = platinum || gold ? [...BASE_ATOMS] : a.choices;
      const atom = new Atom(this, a.x, a.y ?? GROUND_TOP_Y - 36, choices, gold, undefined, false, platinum);
      this.atomGroup.add(atom.sprite);
    });

    // Ledge platforms to jump onto.
    def.platforms?.forEach(([x, y, w]) => {
      this._addPlatform(x, y, w);
    });
    // Gaps first so an enemy overlapping a chasm can be skipped
    def.gaps.forEach(([a, b]) => {
      this._addGap(a, b);
    });
    // Platforming hazards (all optional, see src/stages.ts)
    def.hazards?.forEach(([a, b]) => {
      this._addHazard(a, b);
    });
    def.pads?.forEach((x) => {
      this._addPad(x);
    });
    def.crumble?.forEach(([a, b]) => {
      this._addCrumble(a, b);
    });
    const inHole = (x: number) => this._holes.some((g) => x > g.x1 - 30 && x < g.x2 + 30);

    def.enemies.forEach((en) => {
      if (inHole(en.x)) return;
      // A perched enemy uses its authored y; otherwise the type's default floor/hover band.
      this._spawnEnemy(en.x, en.y ?? this._spawnYFor(en.type), en.type);
    });

    // Later levels (lab floor, sectors 4–6) are flush with extra atoms so the most powerful,
    // atom-hungry compounds become reachable. Sprinkle a sector-scaled row of free-choice (all four
    // base atoms) nodes across the stage, skipping holes and hazard pools.
    const bonusAtoms = this.sector >= 4 ? (this.sector - 3) * 3 : 0;
    if (bonusAtoms > 0) {
      const onHazard = (x: number) => this._hazards.some((h) => x > h.x1 - 20 && x < h.x2 + 20);
      for (let i = 0; i < bonusAtoms; i++) {
        const bx = Math.round(((i + 1) / (bonusAtoms + 1)) * (def.width - 800)) + 400;
        if (inHole(bx) || onHazard(bx)) continue;
        const atom = new Atom(this, bx, GROUND_TOP_Y - 36, [...BASE_ATOMS], false);
        this.atomGroup.add(atom.sprite);
      }
    }

    // Noble-gas bonus pickup — a rare inert gem, spread one per sector (see NOBLE_BY_STAGE). It awards
    // a score bonus every run; the first grab also records a permanent find (see _collectNoble).
    const n = NOBLE_BY_STAGE[this.currentStage];
    if (n) {
      const gem = new Atom(this, n.x, n.y, [], false, n.gas);
      this.atomGroup.add(gem.sprite);
      // Guard spawns right at the gem — a flyer hovers down into reach (so it never gates the exit).
      if (n.guard) this._spawnEnemy(n.x, n.y, n.guard);
    }

    this._spawnCoins();
    this._spawnPickupDrops();

    if (def.boss) {
      // Sector finale — the boss closes out the level
      const boss = new Boss(this, def.boss.x, GROUND_TOP_Y - 80, def.boss.variant);
      boss.hp = Math.round(boss.hp * scale.enemyHp);
      boss.maxHp = Math.round(boss.maxHp * scale.enemyHp);
      boss.speed *= scale.enemySpeed;
      this.boss = boss;
      this.enemyGroup.add(boss.sprite);
      // Joining the arcade group re-applies the group's default body settings, which turns gravity
      // back on. A dormant boss doesn't reposition itself each frame (flyers mask this in their
      // hover AI), so without this it would fall through the floor and never come within activation
      // range of the player. Re-assert the boss's "hovers, never falls" intent after the add.
      boss.sprite.body.setAllowGravity(false);
      this._bossArenaHandler = (anchorX: number) => this._lockBossArena(anchorX);
      this.events.once('boss-activated', this._bossArenaHandler);
      // Cut to the boss theme the moment the fight begins.
      this.events.once('boss-activated', () => MusicSystem.setTrack(this.audioCtx, 'boss'));
    } else if (def.exitX !== undefined) {
      // Regular stage — clear it by reaching the exit once the area is cleared
      this._exitX = def.exitX;
      this._spawnExitPortal(def.exitX);
    }

    // Snapshot how many germs this stage holds (boss included) for the HUD counter.
    this._enemyTotal = this.enemyGroup.countActive(true);
    this._enemyKilled = 0;
  }

  /**
   * Place COINS_PER_STAGE silver coins so every one is reachable and they read as a trail through the
   * level rather than a flat line: coins ride the platform tops (including the sky-tower steps), arc
   * over each gap at jump height, and the remainder fill the walkable ground (skipping pits/acid). All
   * placements sit on or above ground/ledges the player already reaches, so a full sweep is possible.
   */
  private _spawnCoins(): void {
    const def = this.stageDef;
    const inHole = (x: number) => this._holes.some((g) => x > g.x1 - 24 && x < g.x2 + 24);
    const onHazard = (x: number) => this._hazards.some((h) => x > h.x1 - 16 && x < h.x2 + 16);
    const coins: { x: number; y: number }[] = [];
    const push = (x: number, y: number) => coins.push({ x: Math.round(x), y: Math.round(y) });

    // 1) Coins riding each ledge & sky-tower step — 1–3 per platform, spaced across its width, sitting
    //    just above the surface so standing on the platform (however you reach it) sweeps them up.
    for (const [px, py, pw] of def.platforms ?? []) {
      const n = pw >= 200 ? 3 : pw >= 120 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        push(px + 16 + t * (pw - 32), py - 18);
      }
    }
    // 2) One coin arcing over each gap, low enough to be caught during any jump across.
    for (const [a, b] of def.gaps) push((a + b) / 2, GROUND_TOP_Y - 70);

    // 3) Fill the remainder along the walkable ground, evenly spread over solid footing (never a pit or
    //    acid pool), with a gentle wave so the ground run isn't a dead-straight line.
    const left = 240;
    const right = Math.max(left + 100, def.width - 220);
    const need = COINS_PER_STAGE - coins.length;
    if (need > 0) {
      const valid: number[] = [];
      for (let x = left; x <= right; x += 24) if (!inHole(x) && !onHazard(x)) valid.push(x);
      for (let k = 0; k < need && valid.length > 0; k++) {
        const x = valid[Math.min(valid.length - 1, Math.floor(((k + 0.5) / need) * valid.length))];
        push(x, GROUND_TOP_Y - 26 - 20 * (0.5 + 0.5 * Math.sin(k * 0.8)));
      }
    }

    // If the platforms/gaps alone overran the budget, sample an even horizontal spread back down to
    // COINS_PER_STAGE so the coins still span the whole stage.
    let list = coins;
    if (list.length > COINS_PER_STAGE) {
      const sorted = [...coins].sort((p, q) => p.x - q.x);
      const step = sorted.length / COINS_PER_STAGE;
      list = Array.from(
        { length: COINS_PER_STAGE },
        (_, k) => sorted[Math.min(sorted.length - 1, Math.floor(k * step))],
      );
    }

    for (const c of list) {
      const coin = new Atom(this, c.x, c.y, [], false, undefined, true);
      this.atomGroup.add(coin.sprite);
    }
    this._coinsTotal = list.length;
    this._coinsCollected = 0;
    this._coinBonusAwarded = false;
  }

  /**
   * Scatter the life/power-up drops along the stage: healing (Calcium/Zinc) and armor (Iron). Each
   * seeds its `perStage` count, spread evenly across the walkable span and nudged onto solid footing
   * (never a pit or acid pool), with a per-type jitter so different drops don't stack. The tutorial
   * stays clean — no drops there.
   */
  private _spawnPickupDrops(): void {
    if (this.isTutorial) return;
    const def = this.stageDef;
    const inHole = (x: number) => this._holes.some((g) => x > g.x1 - 30 && x < g.x2 + 30);
    const onHazard = (x: number) => this._hazards.some((h) => x > h.x1 - 24 && x < h.x2 + 24);
    // Nudge a target x off any pit/pool onto the nearest solid footing within a short scan.
    const solidX = (x: number): number | null => {
      for (let d = 0; d <= 260; d += 20) {
        for (const cand of d === 0 ? [x] : [x - d, x + d]) {
          if (cand > 200 && cand < def.width - 200 && !inHole(cand) && !onHazard(cand)) return cand;
        }
      }
      return null;
    };
    // Place `n` drops evenly across the mid-span at horizontal offset `jitter`, building each via `make`.
    const scatter = (n: number, jitter: number, make: (x: number) => Atom) => {
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1);
        const target = 200 + Math.max(0.05, Math.min(0.95, t + jitter)) * (def.width - 400);
        const x = solidX(Math.round(target));
        if (x === null) continue;
        this.atomGroup.add(make(x).sprite);
      }
    };

    for (const id of HEAL_IDS) {
      const jitter = id === 'zinc' ? 0.12 : -0.12;
      scatter(
        HEAL_DROPS[id].perStage,
        jitter,
        (x) => new Atom(this, x, GROUND_TOP_Y - 40, [], false, undefined, false, false, id),
      );
    }
    for (const id of ARMOR_IDS) {
      // Iron sits near mid-stage (jitter 0), spaced clear of the flanking heal drops.
      scatter(
        ARMOR_DROPS[id].perStage,
        0,
        (x) => new Atom(this, x, GROUND_TOP_Y - 40, [], false, undefined, false, false, undefined, id),
      );
    }
  }

  /** Push the current germ tally (killed / total) to the HUD. */
  private _emitEnemyCount(): void {
    this.events.emit('enemies-update', { killed: this._enemyKilled, total: this._enemyTotal });
  }

  /** Spawn height by enemy type: flyers in the hover band, ground types just above the floor. */
  private _spawnYFor(type: EnemyType): number {
    return FLYER_TYPES.has(type) ? Phaser.Math.Between(FLYER_MIN_Y + 20, FLYER_MAX_Y - 60) : GROUND_TOP_Y - 30;
  }

  /** Create an enemy, apply the difficulty scale, wire its floor collider (ground types), and register it. */
  private _spawnEnemy(x: number, y: number, type: EnemyType): Enemy {
    const scale = DIFFICULTY_SCALE[this.difficulty];
    const e = new Enemy(this, x, y, type);
    e.hp = Math.round(e.hp * scale.enemyHp);
    e.maxHp = Math.round(e.maxHp * scale.enemyHp);
    e.speed *= scale.enemySpeed;
    this.enemyGroup.add(e.sprite);
    // Ground enemies stand on the floor/ledges; flyers hover (no collider).
    if (!e.fly) this.physics.add.collider(e.sprite, this.platformGroup);
    return e;
  }

  // ── Exit portal (non-boss stage clear) ───────────────────────────────────────

  /** A membrane gateway at the stage end; it stays sealed until every germ is gone. */
  private _spawnExitPortal(x: number): void {
    const theme = SECTOR_THEMES[this.sector];
    const cy = GROUND_TOP_Y - 56;
    const ring = this.add.graphics();
    const glow = this.add.graphics();
    const portal = this.add.container(x, cy, [glow, ring]).setDepth(DEPTH.ENEMY - 1);
    portal.setData('ring', ring);
    portal.setData('glow', glow);
    this._exitPortal = portal;

    this._exitHint = this.add
      .text(x, GROUND_TOP_Y - 140, 'SEALED — clear the area', {
        fontSize: '13px',
        color: theme.label,
        fontStyle: 'italic',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.PLAYER + 10)
      .setAlpha(0.85);

    this._drawExitPortal(false);
    // Gentle idle bob/pulse
    this.tweens.add({
      targets: portal,
      scaleX: 1.06,
      scaleY: 0.94,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  /** Redraw the portal in either its sealed (red) or open (green, inviting) state. */
  private _drawExitPortal(open: boolean): void {
    const portal = this._exitPortal;
    if (!portal) return;
    const ring = portal.getData('ring') as Phaser.GameObjects.Graphics;
    const glow = portal.getData('glow') as Phaser.GameObjects.Graphics;
    const color = open ? 0x55ff99 : 0xff5544;
    ring.clear();
    glow.clear();
    // Outer aura
    glow.fillStyle(color, open ? 0.22 : 0.12);
    glow.fillEllipse(0, 0, 96, 150);
    // Membrane oval rings
    ring.lineStyle(4, color, 0.9);
    ring.strokeEllipse(0, 0, 64, 132);
    ring.lineStyle(2, color, 0.5);
    ring.strokeEllipse(0, 0, 44, 110);
    // Swirling motes inside
    ring.fillStyle(open ? 0xccffdd : 0xffcccc, 0.7);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ring.fillCircle(Math.cos(a) * 14, Math.sin(a) * 40, 2.5);
    }
  }

  // ── Tutorial ────────────────────────────────────────────────────────────────

  private _spawnTutorial(): void {
    // One element to collect
    const atom = new Atom(this, this._tutAtomX, GROUND_TOP_Y - 36, ['hydrogen', 'oxygen']);
    this.atomGroup.add(atom.sprite);
    this._tutAtom = atom.sprite;

    // One weakened bad guy
    const e = new Enemy(this, this._tutEnemyX, GROUND_TOP_Y - 30, 'bacterium');
    e.hp = 18;
    e.maxHp = 18;
    e.speed *= 0.7;
    this.enemyGroup.add(e.sprite);
    this.physics.add.collider(e.sprite, this.platformGroup);
    this._tutEnemy = e;

    // One gap to jump over (the floor collider already has the hole — see _buildWorld)
    this._addGap(this._gapX1, this._gapX2);
  }

  /** Paint a chasm down the floor and register the x-range as a hole (must be jumped). */
  private _addGap(x1: number, x2: number): void {
    this._holes.push({ x1, x2 });
    this._drawChasm(x1, x2);
  }

  /** The visual for a hole in the floor: a dark pit from the surface down past the screen. */
  private _drawChasm(x1: number, x2: number): void {
    const g = this.add.graphics().setDepth(DEPTH.GAP);
    const w = x2 - x1;
    const top = GROUND_TOP_Y - 8;
    g.fillStyle(0x05080a, 1);
    g.fillRect(x1, top, w, GAME_HEIGHT - top);
    g.lineStyle(2, 0x2a3a2a, 0.7);
    g.lineBetween(x1, top, x1, GAME_HEIGHT);
    g.lineBetween(x2, top, x2, GAME_HEIGHT);
    g.fillStyle(0x0d1a12, 0.6);
    for (let yy = GROUND_TOP_Y + 14; yy < GAME_HEIGHT; yy += 22) g.fillRect(x1 + 4, yy, w - 8, 3);
  }

  /**
   * True when world-x `x` sits over a real hole in the floor (an authored gap or an open crumble
   * pit) — i.e. a spot where falling through is intended. Enemies use this to tell a legitimate
   * pit-fall from clipping through solid floor (see `Enemy.update`). Padded to cover the hole edges.
   */
  isOverHole(x: number): boolean {
    return this._holes.some((h) => x > h.x1 - 10 && x < h.x2 + 10);
  }

  /**
   * Pits must be jumped. Walk off a ledge or miss a jump and the player simply falls under gravity;
   * once they drop below the screen, deal pit-fall damage and respawn them on the last safe ledge.
   * (Only falling into a chasm hurts — landing a high drop onto solid ground no longer does.)
   */
  private _updatePitFall(): void {
    const p = this.player;
    if (!p.alive) return;
    const px = p.sprite.x;
    // Remember the last solid footing that isn't a hole, so respawns land somewhere stable.
    if (p.sprite.body.onFloor() && !this.isOverHole(px)) {
      this._lastSafeX = px;
    }
    if (p.sprite.y > GAME_HEIGHT + 60) {
      p.sprite.body.setVelocity(0, 0);
      p.sprite.setPosition(this._lastSafeX, GROUND_TOP_Y - 60);
      SoundSystem.play(this.audioCtx, 'punch');
      this.shake(260, 0.012);
      p.takeDamage(GAP_FALL_DAMAGE); // respects i-frames; lethal only if HP runs out
    }
  }

  // ── Platforming hazards ───────────────────────────────────────────────────────

  /**
   * True only when the player is standing on the ground floor itself, not an elevated platform.
   * Ground-level features (acid pools, bounce pads, crumble tiles) live at GROUND_TOP_Y, so they
   * must ignore a player perched on a platform above them — `onFloor()` alone can't tell the two
   * apart (it's true on any surface), so we also require the body to be resting at floor height.
   */
  private _onGroundFloor(): boolean {
    const body = this.player.sprite.body;
    return body.onFloor() && body.bottom >= GROUND_TOP_Y - 8;
  }

  /** Sector-tinted corrosive-pool colors for hazard strips. */
  private _hazardTheme(): { fill: number; surface: number } {
    if (this.sector === 1) return { fill: 0x88dd33, surface: 0xccff66 };
    if (this.sector === 2) return { fill: 0xdd3322, surface: 0xff7755 };
    if (this.sector === 3) return { fill: 0xaa55dd, surface: 0xdd99ff };
    return { fill: 0x33bbcc, surface: 0x99ffee }; // sector 4 — spilled reagent (teal)
  }

  /** Draw a bubbling corrosive pool sitting on the floor surface and register it as a damage strip. */
  private _addHazard(x1: number, x2: number): void {
    this._hazards.push({ x1, x2 });
    const { fill, surface } = this._hazardTheme();
    const w = x2 - x1;
    const top = GROUND_TOP_Y - 2;
    const depth = 26;
    const g = this.add.graphics().setDepth(DEPTH.GROUND + 2);
    g.fillStyle(fill, 0.5);
    g.fillRect(x1, top, w, depth);
    g.lineStyle(2.5, surface, 0.85);
    g.lineBetween(x1, top, x2, top);
    // Caustic bubbles across the pool surface.
    g.fillStyle(surface, 0.55);
    const bubbles = Math.max(4, Math.round(w / 22));
    for (let i = 0; i < bubbles; i++) {
      g.fillCircle(
        Phaser.Math.Between(x1 + 6, x2 - 6),
        Phaser.Math.Between(top + 3, top + depth - 3),
        Phaser.Math.FloatBetween(2, 4.5),
      );
    }
  }

  /** Stand in acid/spikes on the ground and you sizzle; jumping over is safe. */
  private _updateHazards(): void {
    if (this._hazards.length === 0) return;
    const p = this.player;
    if (!p.alive || !this._onGroundFloor()) return;
    const px = p.sprite.x;
    for (const hz of this._hazards) {
      if (px > hz.x1 && px < hz.x2) {
        if (!p.isInvincible) {
          p.takeDamage(HAZARD_DAMAGE);
          SoundSystem.play(this.audioCtx, 'hazard');
          this.spawnBurst(px, p.sprite.y + 22, this._hazardTheme().surface, {
            count: 6,
            speed: [40, 120],
            angle: [200, 340],
            lifespan: 300,
          });
        }
        break;
      }
    }
  }

  /**
   * Draw a springy bounce-spore dome on the floor (centered on GROUND_TOP_Y so it squashes down),
   * then hang its reward: a one-way perch high overhead — reachable only by the pad's launch, not a
   * double-jump — with a free-choice atom on it. This gives every pad a purpose: bop it to reach an
   * otherwise-unreachable pickup. See the reachability math in `_addPad`'s constants.
   */
  private _addPad(x: number): void {
    const g = this.add
      .graphics()
      .setPosition(x, GROUND_TOP_Y)
      .setDepth(DEPTH.GROUND + 2);
    g.fillStyle(0x1f7a4a, 0.45);
    g.fillEllipse(0, 4, 56, 14); // contact shadow on the ground
    g.fillStyle(0x39c97a, 1);
    g.fillEllipse(0, -12, 50, 36); // springy dome rising above the floor
    g.lineStyle(2, 0x9bffc8, 0.85);
    g.strokeEllipse(0, -12, 50, 36);
    g.fillStyle(0xbfffd8, 0.8);
    g.fillEllipse(-10, -20, 16, 10); // highlight
    this._pads.push({ x, gfx: g });

    // Reward perch. The pad launches feet well above the perch (peak ≈ v²/2g ≈ y-265); a double-jump
    // only reaches ~y166. A perch at y≈140 therefore sits in the pad-only window: unreachable by
    // jumping, comfortably cleared by a bop (the player arcs above it and drops onto its top face).
    const perchW = 130;
    const perchTop = GROUND_TOP_Y - 330; // ≈ y140
    this._addPlatform(x - perchW / 2, perchTop, perchW, true);
    const reward = new Atom(this, x, perchTop - 40, [...BASE_ATOMS], false);
    this.atomGroup.add(reward.sprite);
  }

  /** Land on a pad and you're launched into a high arc. */
  private _updatePads(): void {
    if (this._pads.length === 0) return;
    const p = this.player;
    if (!p.alive || !this._onGroundFloor()) return;
    const px = p.sprite.x;
    for (const pad of this._pads) {
      if (Math.abs(px - pad.x) < 30) {
        p.superJump(PLAYER_BOUNCE_VELOCITY);
        SoundSystem.play(this.audioCtx, 'bounce');
        this.tweens.killTweensOf(pad.gfx);
        pad.gfx.setScale(1);
        this.tweens.add({ targets: pad.gfx, scaleX: 1.3, scaleY: 0.6, duration: 90, yoyo: true, ease: 'Quad.Out' });
        this.spawnBurst(pad.x, GROUND_TOP_Y - 6, 0xbfffd8, {
          count: 8,
          speed: [90, 200],
          angle: [210, 330],
          lifespan: 340,
        });
        break;
      }
    }
  }

  /** A cracked, loose floor tile that plugs a hole until you stand on it, then collapses into a pit. */
  private _addCrumble(x1: number, x2: number): void {
    this._holes.push({ x1, x2 }); // a hole in the base floor — the plug collider fills it until it falls
    const w = x2 - x1;
    const top = GROUND_TOP_Y - 2;
    const tileH = 22;
    const g = this.add.graphics().setDepth(DEPTH.GROUND + 2);
    g.fillStyle(0x6a5436, 0.95);
    g.fillRect(x1, top, w, tileH);
    g.lineStyle(1.5, 0x2a2014, 0.9);
    g.strokeRect(x1 + 1, top, w - 2, tileH);
    g.lineStyle(1.2, 0x1a140c, 0.7);
    for (let cx = x1 + 16; cx < x2 - 6; cx += 24) {
      g.lineBetween(cx, top, cx + Phaser.Math.Between(-6, 6), top + tileH);
    }
    const collider = this._addSolid(x1, x2); // plugs the hole until it collapses
    this._crumbles.push({ x1, x2, gfx: g, collider, state: 'solid' });
  }

  /** Stand on a crumbling tile to start its countdown; it then collapses into a real pit. */
  private _updateCrumbles(): void {
    if (this._crumbles.length === 0) return;
    const p = this.player;
    if (!p.alive || !this._onGroundFloor()) return;
    const px = p.sprite.x;
    for (const c of this._crumbles) {
      if (c.state === 'solid' && px > c.x1 && px < c.x2) this._triggerCrumble(c);
    }
  }

  private _triggerCrumble(c: CrumbleTile): void {
    c.state = 'warning';
    // Rattle + flash to telegraph the imminent collapse.
    this.tweens.add({
      targets: c.gfx,
      alpha: 0.4,
      duration: 90,
      yoyo: true,
      repeat: Math.floor(CRUMBLE_DELAY_MS / 180),
      ease: 'Sine.InOut',
    });
    this.time.delayedCall(CRUMBLE_DELAY_MS, () => this._collapseCrumble(c));
  }

  private _collapseCrumble(c: CrumbleTile): void {
    c.state = 'gone';
    this.tweens.killTweensOf(c.gfx);
    c.gfx.destroy();
    c.collider?.destroy(); // remove the plug — the hole is now open (already in _holes)
    this._drawChasm(c.x1, c.x2);
    SoundSystem.play(this.audioCtx, 'hazard');
    this.shake(200, 0.008);
    this.spawnBurst((c.x1 + c.x2) / 2, GROUND_TOP_Y + 20, 0x8a6a3a, {
      count: 14,
      speed: [40, 170],
      angle: [60, 120],
      lifespan: 600,
      scale: 1.1,
    });
  }

  private _startTutorial(): void {
    this._buildDialogue();
    this._createMeg();

    // Skip-tutorial shortcut + hint — tappable (so touch works) and ESC on keyboard.
    const skip = () => {
      this._tutDone = true;
      this._exitToDifficulty();
    };
    const skipHint = this.add
      .text(14, GAME_HEIGHT - 32, Settings.touchActive() ? 'tap here to skip' : 'ESC — skip tutorial', {
        fontSize: '12px',
        color: '#668899',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(481)
      .setInteractive({ useHandCursor: true });
    skipHint.on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
        ev?.stopPropagation();
        skip();
      },
    );
    this.input.keyboard?.once('keydown-ESC', skip);

    const moveHint = Settings.touchActive() ? 'drag the stick' : 'D / →';
    this._say(
      [
        "Whoa — the shrinky-dink ray-ifier backfired! You've been shrunk down to molecular scale!",
        "I'm your faithful lab assistant, Main Element Guide. You can call me M.E.G.!",
        'To grow back to normal size you must gather elements and fight your way out.',
        `Deep breaths — we'll get you home. Head right (${moveHint}) and I'll explain as we go.`,
      ],
      () => {
        this.isPaused = false;
        this.physics.resume();
      },
    );
  }

  private _createMeg(): void {
    const px = this.player.sprite.x;
    this._meg = this.add.sprite(px - 70, GROUND_TOP_Y - 46, 'meg').setDepth(305);
    this.tweens.add({
      targets: this._meg,
      scaleX: 1.06,
      scaleY: 0.94,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private _buildDialogue(): void {
    const cx = GAME_WIDTH / 2;
    const cy = 158;
    const pw = 620;
    const ph = 120; // tall enough for a 4-line wrapped tip without spilling out the bottom
    this._dlgBg = this.add
      .rectangle(cx, cy, pw, ph, 0x081018, 0.93)
      .setScrollFactor(0)
      .setDepth(480)
      .setStrokeStyle(2, 0x3aa0d0)
      .setVisible(false);
    this._dlgPortrait = this.add
      .sprite(cx - pw / 2 + 42, cy, 'meg')
      .setScrollFactor(0)
      .setDepth(481)
      .setVisible(false);
    this._dlgName = this.add
      .text(cx - pw / 2 + 84, cy - 44, 'M.E.G.', {
        fontSize: '16px',
        color: '#66ddff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setScrollFactor(0)
      .setDepth(481)
      .setVisible(false);
    this._dlgText = this.add
      .text(cx - pw / 2 + 84, cy - 26, '', {
        fontSize: '15px',
        color: '#eef6ff',
        fontFamily: 'monospace',
        wordWrap: { width: pw - 118 },
        lineSpacing: 5,
      })
      .setScrollFactor(0)
      .setDepth(481)
      .setVisible(false);
    this._dlgHint = this.add
      .text(cx + pw / 2 - 16, cy + ph / 2 - 14, Settings.touchActive() ? '▸ Tap' : '▸ Space / Z', {
        fontSize: '12px',
        color: '#6699aa',
        fontFamily: 'monospace',
      })
      .setScrollFactor(0)
      .setDepth(481)
      .setOrigin(1, 0.5)
      .setVisible(false);
  }

  private _showDlg(): void {
    // The dialogue panel is screen-fixed, so pull the camera back to a full screen while it's up.
    this._applyZoom(BOSS_ZOOM, 200);
    this._dlgBg?.setVisible(true);
    this._dlgPortrait?.setVisible(true);
    this._dlgName?.setVisible(true);
    this._dlgText?.setVisible(true);
  }

  private _hideDlg(): void {
    this._dlgBg?.setVisible(false);
    this._dlgPortrait?.setVisible(false);
    this._dlgName?.setVisible(false);
    this._dlgText?.setVisible(false);
    this._dlgHint?.setVisible(false);
    // Restore the free-play / boss zoom once the panel is dismissed.
    this._applyZoom(this._playZoom, 200);
  }

  private _popPortrait(): void {
    if (!this._dlgPortrait) return;
    this.tweens.killTweensOf(this._dlgPortrait);
    this._dlgPortrait.setScale(1);
    this.tweens.add({ targets: this._dlgPortrait, scaleX: 1.14, scaleY: 1.14, duration: 100, yoyo: true });
  }

  /** Lines M.E.G. delivers the first time the player out-synthesizes their weapon slots. */
  private _compoundIntroLines(): string[] {
    const n = this.player.elementSystem.getSlotCount();
    return [
      `Nice work — that's more compounds than your harness can hold! You've only got ${n} weapon key${n === 1 ? '' : 's'}.`,
      `Pause anytime and open COMPOUND SELECTION to choose which compounds ride on ${slotKeyLabels(Settings.touchActive()).slice(0, n).join(' / ')}.`,
      'Swap your loadout whenever you like — bring the right reactions to each fight!',
    ];
  }

  /** Blocking story dialogue — pauses the game, advanced with a tap, Space, or Z. */
  private _say(lines: string[], onDone?: () => void): void {
    if (!this._dlgBg) this._buildDialogue(); // dialogue UI is built lazily outside the tutorial
    this._dlgQueue = [...lines];
    this._dlgOnDone = onDone;
    this._dlgBlocking = true;
    this.isPaused = true;
    this.physics.pause();
    this._showDlg();
    this._dlgHint?.setVisible(true);
    this._nextLine();
    this._dlgAdvance = () => this._nextLine();
    this.input.keyboard?.on('keydown-SPACE', this._dlgAdvance);
    this.input.keyboard?.on('keydown-Z', this._dlgAdvance);
    // Tap anywhere advances too — essential on touch devices, which have no Space/Z key.
    this.input.on('pointerdown', this._dlgAdvance);
  }

  private _nextLine(): void {
    const line = this._dlgQueue.shift();
    if (line === undefined) {
      this._endDlg();
      return;
    }
    this._dlgText?.setText(line);
    this._popPortrait();
  }

  private _endDlg(): void {
    if (this._dlgAdvance) {
      this.input.keyboard?.off('keydown-SPACE', this._dlgAdvance);
      this.input.keyboard?.off('keydown-Z', this._dlgAdvance);
      this.input.off('pointerdown', this._dlgAdvance);
      this._dlgAdvance = undefined;
    }
    this._hideDlg();
    this._dlgBlocking = false;
    const cb = this._dlgOnDone;
    this._dlgOnDone = undefined;
    this.isPaused = false;
    this.physics.resume();
    cb?.();
  }

  /** Non-blocking proximity tip — shows once, auto-dismisses, doesn't pause. */
  private _tip(id: string, text: string): void {
    if (this._dlgBlocking || this._firedTips.has(id)) return;
    this._firedTips.add(id);
    this._activeTip = id;
    this._showDlg();
    this._dlgHint?.setVisible(false);
    this._dlgText?.setText(text);
    this._popPortrait();
    this.time.delayedCall(5500, () => {
      // Only auto-hide if this is still the tip on screen (a newer tip may have replaced it)
      if (!this._dlgBlocking && this._activeTip === id) this._hideDlg();
    });
  }

  /** A short, non-blocking M.E.G. one-liner (e.g. celebrating a max-level element). Reuses the
   *  dialogue box but never pauses and isn't deduped, so it fires every time. Skipped while blocking
   *  story dialogue is up. */
  private _megQuip(text: string): void {
    if (this._dlgBlocking) return;
    if (!this._dlgBg) this._buildDialogue(); // dialogue UI is built lazily outside the tutorial
    const id = '__quip__';
    this._activeTip = id;
    this._showDlg();
    this._dlgHint?.setVisible(false);
    this._dlgText?.setText(text);
    this._popPortrait();
    this.time.delayedCall(4000, () => {
      if (!this._dlgBlocking && this._activeTip === id) this._hideDlg();
    });
  }

  /** Pick a random max-level quip and substitute the element/compound's name (sans formula). */
  private _maxLevelQuip(id: AttackId): string {
    const name = ELEMENT_NAMES[id].replace(/\s*\(.*\)/, '');
    const line = MEG_MAX_LEVEL_QUIPS[Math.floor(Math.random() * MEG_MAX_LEVEL_QUIPS.length)];
    return line.replace(/\{el\}/g, name);
  }

  private _tutorialUpdate(time: number): void {
    const p = this.player;
    if (!p.alive) return;
    const px = p.sprite.x;

    // M.E.G. hovers just behind the player, bobbing
    if (this._meg) {
      const tx = px - 74;
      const ty = GROUND_TOP_Y - 48 + Math.sin(time * 0.004) * 8;
      this._meg.x += (tx - this._meg.x) * 0.08;
      this._meg.y += (ty - this._meg.y) * 0.08;
      this._meg.setDepth(p.sprite.depth + 6);
    }

    // Proximity tips
    if (this._tutAtom?.active && Math.abs(px - this._tutAtomX) < 230) {
      this._tip(
        'element',
        'Hey, do you see that floating atom? If you walk into it, you pick an element to collect and arm an attack.',
      );
    }
    const touch = Settings.touchActive();
    if (this._tutEnemy?.sprite.active && Math.abs(px - this._tutEnemyX) < 300) {
      this._tip(
        'enemy',
        touch
          ? 'Watch out! Germs drain your health. Tap an attack button to fight — a punch, or your element once armed.'
          : 'Watch out! Germs drain your health. Use your attack key (Z) to fight — a punch, or your element once armed.',
      );
    }
    if (px > this._gapX1 - 240 && px < this._gapX1) {
      this._tip(
        'gap',
        touch
          ? 'It might seem scary, but you can jump over gaps. Tap the jump button to JUMP, then tap again mid-air to double-jump.'
          : 'It might seem scary, but you can jump over gaps. Press SPACE to JUMP, then press again mid-air to double-jump.',
      );
    }
    if (px > this._tutEndX && !this._tutDone) this._completeTutorial();
  }

  private _completeTutorial(): void {
    this._tutDone = true;
    this.stageCleared = true;
    this._say(
      [
        "Nice work! Collect, fight, jump... I think you're ready for the real thing.",
        'Now go find the elements and figure out how to get back to normal size. Good luck!',
      ],
      () => this._exitToDifficulty(),
    );
  }

  /** Leave the tutorial for difficulty select. GameScene renders above DifficultyScene, so stop it. */
  private _exitToDifficulty(): void {
    Settings.set({ tutorialDone: true }); // never auto-run the tutorial again after this
    this.scene.stop('HUDScene');
    this.scene.start('DifficultyScene');
    this.scene.stop('GameScene');
  }

  private _setupInput(): void {
    // biome-ignore lint/style/noNonNullAssertion: Phaser always initialises keyboard when InputPlugin is active
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as WasdKeys;
    // Offense on Z / X / C = weapon slots 1-3 (the most you can ever have). Slot 1 (Z) doubles as
    // the basic punch until you arm a compound. Mirrors the on-screen attack buttons on touch.
    const KC = Phaser.Input.Keyboard.KeyCodes;
    const attackKeys = [KC.Z, KC.X, KC.C];
    this.slotKeys = attackKeys.map((k) => [kb.addKey(k)]);
    this.pauseKey = kb.addKey(KC.ESC);
    this.pauseKeyAlt = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  /** Pause the stage and open the pause menu — shared by the keyboard pause keys and the touch button. */
  private _openPause(): void {
    if (this.isPaused || this.stageCleared || this.isTutorial) return;
    this.isPaused = true;
    this.physics.pause();
    this.scene.launch('PauseScene', {
      stage: this.currentStage,
      canSelectCompounds: this.player.elementSystem.getAvailableAttacks().length > 0,
    });
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.pauseKey) || Phaser.Input.Keyboard.JustDown(this.pauseKeyAlt)) {
      this._openPause();
    }

    // On-screen controls are only live while the player is actually playing this stage.
    const touchControls = (this.scene.get('HUDScene') as HUDScene)?.touch ?? null;
    touchControls?.setEnabled(!this.isPaused && !this.stageCleared);

    if (this.isPaused || this.stageCleared) return;

    this.player.update(_time, delta, {
      cursors: this.cursors,
      wasd: this.wasd,
      slotKeys: this.slotKeys,
      touch: touchControls?.snapshot(),
    });

    const clampMin = this._bossArena ? this._bossArena.left + 30 : 40;
    const clampMax = this._bossArena ? this._bossArena.right - 30 : this.worldWidth - 40;
    this.player.sprite.x = Phaser.Math.Clamp(this.player.sprite.x, clampMin, clampMax);

    this.enemyGroup.getChildren().forEach((go) => {
      const s = go as EnemySprite;
      if (s.active && s.enemyRef) {
        s.enemyRef.update(_time, delta, this.player.sprite);
        s.setDepth(s.y);
      }
    });

    this.projectileGroup.getChildren().forEach((go) => {
      const p = go as Phaser.Physics.Arcade.Sprite;
      if (p.active && (p.x < 0 || p.x > this.worldWidth)) p.destroy();
    });
    this.enemyProjectileGroup.getChildren().forEach((go) => {
      const p = go as Phaser.Physics.Arcade.Sprite;
      if (p.active && (p.x < 0 || p.x > this.worldWidth || p.y < 0 || p.y > GAME_HEIGHT)) p.destroy();
    });

    this._updatePitFall();
    this._updateHazards();
    this._updatePads();
    this._updateCrumbles();
    if (this.isTutorial) this._tutorialUpdate(_time);
    else if (this._exitPortal) this._updateExit();

    this.events.emit('hud-update', {
      hp: this.player.hp,
      armor: this.player.armor,
      element: this.player.elementSystem,
    });
  }

  // ── Helpers called by entities ──────────────────────────────────────────────

  /** Camera shake that honors the screen-shake setting. Entities call this.scene.shake(...). */
  shake(duration: number, intensity: number): void {
    if (Settings.get().screenShake) this.cameras.main.shake(duration, intensity);
  }

  spawnHitFlash(x: number, y: number, color = 0xffffff, size = 32): void {
    // The circle is drawn at the object's own origin and the object is placed at (x, y): the scale
    // tween then expands it about its centre. (Drawing at world coords instead would make scaling
    // multiply the offset from the world origin, hurling the flash toward the bottom-right.)
    const g = this.add.graphics({ x, y });
    g.fillStyle(color, 0.85);
    g.fillCircle(0, 0, size * 0.6);
    g.setDepth(100);
    this.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 2.5,
      scaleY: 2.5,
      duration: 300,
      ease: 'Power2',
      onComplete: () => g.destroy(),
    });
  }

  spawnAtomBurst(x: number, y: number, color: number): void {
    const emitter = this.add.particles(x, y, 'particle', {
      lifespan: 600,
      speed: { min: 60, max: 180 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: color,
      emitting: false,
    });
    emitter.setDepth(95);
    emitter.explode(22);
    this.time.delayedCall(700, () => emitter.destroy());
  }

  // ── Reusable juice helpers (color-parameterized; visual only) ────────────────

  /** Radial particle burst — sparks, droplets, ice shards, debris, etc. */
  spawnBurst(
    x: number,
    y: number,
    color: number,
    opts: {
      count?: number;
      speed?: [number, number];
      angle?: [number, number];
      lifespan?: number;
      scale?: number;
    } = {},
  ): void {
    const [sMin, sMax] = opts.speed ?? [60, 180];
    const [aMin, aMax] = opts.angle ?? [0, 360];
    const lifespan = opts.lifespan ?? 500;
    const emitter = this.add.particles(x, y, 'particle', {
      lifespan,
      speed: { min: sMin, max: sMax },
      angle: { min: aMin, max: aMax },
      scale: { start: opts.scale ?? 1.0, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: color,
      emitting: false,
    });
    emitter.setDepth(95);
    emitter.explode(opts.count ?? 16);
    this.time.delayedCall(lifespan + 100, () => emitter.destroy());
  }

  /** Expanding ring shockwave (one or more concentric rings, optional soft fill). */
  spawnNova(
    x: number,
    y: number,
    color: number,
    maxR: number,
    opts: { rings?: number; life?: number; lineWidth?: number; fill?: boolean } = {},
  ): void {
    const rings = opts.rings ?? 2;
    const life = opts.life ?? 26;
    const g = this.add.graphics().setDepth(96);
    let t = 0;
    this.time.addEvent({
      delay: 16,
      repeat: life,
      callback: () => {
        t++;
        const f = t / life;
        g.clear();
        if (opts.fill) {
          g.fillStyle(color, 0.22 * (1 - f));
          g.fillCircle(x, y, maxR * f);
        }
        for (let i = 0; i < rings; i++) {
          const rf = Phaser.Math.Clamp(f - i * 0.18, 0, 1);
          if (rf <= 0) continue;
          g.lineStyle(opts.lineWidth ?? 3, color, 0.85 * (1 - rf));
          g.strokeCircle(x, y, maxR * rf);
        }
        if (t >= life) g.destroy();
      },
    });
  }

  /** A crescent slash that sweeps out in front and fades — for melee specials. */
  spawnSlashArc(x: number, y: number, dir: number, color: number, range = 110, height = 80): void {
    const g = this.add.graphics().setDepth(96);
    g.lineStyle(7, color, 0.95);
    g.beginPath();
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const tt = i / steps;
      const ang = (tt - 0.5) * Math.PI * 0.9;
      const px = dir * Math.cos(ang) * range;
      const py = Math.sin(ang) * height;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.strokePath();
    g.setPosition(x + dir * 25, y).setScale(0.6);
    this.tweens.add({
      targets: g,
      scaleX: 1.15,
      scaleY: 1.1,
      alpha: 0,
      duration: 220,
      ease: 'Quad.Out',
      onComplete: () => g.destroy(),
    });
  }

  /** A lingering, drifting cloud of translucent blobs — gas, fog, smog, acid mist. */
  spawnCloud(
    x: number,
    y: number,
    r: number,
    color: number,
    durationMs: number,
    opts: { blobs?: number; depth?: number; alpha?: number } = {},
  ): void {
    const blobs = opts.blobs ?? 9;
    const g = this.add.graphics().setDepth(opts.depth ?? 86);
    const seeds = Array.from({ length: blobs }, () => ({
      ang: Math.random() * Math.PI * 2,
      dist: Math.random() * r,
      rad: r * 0.3 + Math.random() * r * 0.35,
      ph: Math.random() * Math.PI * 2,
    }));
    const steps = Math.max(1, Math.floor(durationMs / 32));
    const peak = opts.alpha ?? 0.2;
    let t = 0;
    this.time.addEvent({
      delay: 32,
      repeat: steps,
      callback: () => {
        t++;
        const f = t / steps;
        const env = Math.min(1, f * 4) * (1 - Math.max(0, (f - 0.7) / 0.3));
        g.clear();
        for (const s of seeds) {
          const bx = x + Math.cos(s.ang) * s.dist;
          const by = y + Math.sin(s.ang) * s.dist * 0.6 - Math.sin(t * 0.05 + s.ph) * 6;
          const br = s.rad * (0.85 + 0.15 * Math.sin(t * 0.06 + s.ph));
          g.fillStyle(color, peak * env);
          g.fillCircle(bx, by, br);
        }
        if (t >= steps) g.destroy();
      },
    });
  }

  spawnProjectile(x: number, y: number, dir: number, color: number, damage: number, speed = 600, knockback = 2): void {
    const p = this.projectileGroup.create(x, y, 'projectile') as ProjectileSprite;
    p.setTint(color).setDepth(80);
    p.damage = damage;
    p.knockback = knockback;
    p.piercing = false;
    p.body.setAllowGravity(false);
    p.body.setVelocity(dir * speed, 0);
  }

  // Hydrogen Lv2 "Plasma Arc" — a glowing, crackling energy bolt with a trail and an impact burst
  spawnPlasmaBolt(x: number, y: number, dir: number, damage: number): void {
    const p = this.projectileGroup.create(x, y, 'projectile') as ProjectileSprite;
    p.setTint(0x4499ff).setDepth(80).setScale(1.8).setAlpha(0); // base sprite hidden; the plasma graphic is the visual
    p.damage = damage;
    p.knockback = 5;
    p.piercing = false;
    p.body.setAllowGravity(false);
    p.body.setVelocity(dir * 720, 0);

    const gfx = this.add.graphics().setDepth(81);
    const trail: { x: number; y: number }[] = [];
    let t = 0;

    const ev = this.time.addEvent({
      delay: 16,
      repeat: 220,
      callback: () => {
        t++;

        // Destroyed by the projectile↔enemy overlap → it hit something: burst + splash
        if (!p.active) {
          const last = trail[trail.length - 1] ?? { x, y };
          this.spawnHitFlash(last.x, last.y, 0x66bbff, 60);
          this.shake(120, 0.006);
          const ring = this.add.graphics().setDepth(82);
          let rt = 0;
          this.time.addEvent({
            delay: 16,
            repeat: 12,
            callback: () => {
              rt++;
              ring.clear();
              ring.lineStyle(3, 0xaaddff, 0.8 - rt * 0.06);
              ring.strokeCircle(last.x, last.y, rt * 6);
              if (rt >= 12) ring.destroy();
            },
          });
          // Splash damage to nearby enemies
          this.enemyGroup.getChildren().forEach((go) => {
            const s = go as EnemySprite;
            if (!s.active || !s.enemyRef) return;
            if (Phaser.Math.Distance.Between(last.x, last.y, s.x, s.y) < 70) {
              s.enemyRef.takeDamage(Math.round(damage * 0.5), dir * 3);
            }
          });
          gfx.destroy();
          ev.remove();
          return;
        }

        trail.push({ x: p.x, y: p.y });
        if (trail.length > 9) trail.shift();

        gfx.clear();
        // Fading trail
        for (let i = 0; i < trail.length; i++) {
          const f = i / trail.length;
          gfx.fillStyle(0x88ccff, f * 0.45);
          gfx.fillCircle(trail[i].x, trail[i].y, 3 + f * 8);
        }
        // Outer glow → core → white-hot center
        gfx.fillStyle(0x4499ff, 0.35);
        gfx.fillCircle(p.x, p.y, 18);
        gfx.fillStyle(0xaaddff, 0.9);
        gfx.fillCircle(p.x, p.y, 9);
        gfx.fillStyle(0xffffff, 0.95);
        gfx.fillCircle(p.x, p.y, 4);
        // Crackling electric arcs radiating from the core
        gfx.lineStyle(2, 0xcceeff, 0.85);
        for (let k = 0; k < 3; k++) {
          const ang = Math.random() * Math.PI * 2;
          const len = 13 + Math.random() * 11;
          const sx = p.x + Math.cos(ang) * 7;
          const sy = p.y + Math.sin(ang) * 7;
          const mx = p.x + Math.cos(ang) * len * 0.5 + (Math.random() - 0.5) * 9;
          const my = p.y + Math.sin(ang) * len * 0.5 + (Math.random() - 0.5) * 9;
          const ex = p.x + Math.cos(ang) * len;
          const ey = p.y + Math.sin(ang) * len;
          gfx.beginPath();
          gfx.moveTo(sx, sy);
          gfx.lineTo(mx, my);
          gfx.lineTo(ex, ey);
          gfx.strokePath();
        }

        // Flew off without hitting — clean up silently
        if (t >= 220) {
          gfx.destroy();
          ev.remove();
          p.destroy();
        }
      },
    });
  }

  spawnPiercingProjectile(x: number, y: number, dir: number, color: number, damage: number, speed = 650): void {
    const p = this.projectileGroup.create(x, y, 'projectile') as ProjectileSprite;
    p.setTint(color).setDepth(80).setScale(1.4);
    p.damage = damage;
    p.knockback = 1;
    p.piercing = true;
    p.body.setAllowGravity(false);
    p.body.setVelocity(dir * speed, 0);
  }

  spawnEnemyProjectile(x: number, y: number, angle: number, damage: number, speed = 280): void {
    const p = this.enemyProjectileGroup.create(x, y, 'projectile') as ProjectileSprite;
    p.setTint(0xff6600).setDepth(80);
    p.damage = damage;
    p.knockback = 0;
    p.body.setAllowGravity(false);
    p.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  // Water Lv3 "Tidal Force" — a towering curling wave that sweeps the screen
  spawnTidalWave(x: number, _y: number, dir: number): void {
    const d = dir;
    const baseY = GROUND_TOP_Y + 26; // wave foot, just below the floor surface
    const crestY = GROUND_TOP_Y - 260; // wave peak, towering above
    const STEPS = 80;

    // Just behind the player layer so the wave passes behind the caster.
    const body = this.add.graphics().setDepth(DEPTH.PLAYER - 6);
    const foam = this.add.graphics().setDepth(DEPTH.PLAYER - 5);
    let waveX = x - d * 70;
    let step = 0;

    this.shake(500, 0.009);
    // A brief blue wash over the screen as it casts
    const wash = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2299ee, 0)
      .setScrollFactor(0)
      .setDepth(95);
    this.tweens.add({
      targets: wash,
      alpha: 0.18,
      duration: 200,
      yoyo: true,
      hold: 200,
      onComplete: () => wash.destroy(),
    });

    this.time.addEvent({
      delay: 16,
      repeat: STEPS,
      callback: () => {
        step++;
        waveX += d * 13;
        const wob = Math.sin(step * 0.5) * 10;
        const cY = crestY + wob;
        const fade = step > STEPS * 0.8 ? Math.max(0, 1 - (step - STEPS * 0.8) / (STEPS * 0.2)) : 1;
        body.setAlpha(fade);
        foam.setAlpha(fade);

        // Wave silhouette — local x runs along the travel direction; concave curl handled by earcut
        const pt = (sx: number, sy: number) => ({ x: waveX + d * sx, y: sy });
        const outline = [
          pt(-90, baseY),
          pt(-88, baseY - 55),
          pt(-45, (baseY + cY) / 2),
          pt(-12, cY + 26),
          pt(12, cY), // crest peak
          pt(48, cY + 16), // curl lip overhanging forward
          pt(30, cY + 52), // hollow under the curl
          pt(54, baseY - 60), // front face
          pt(62, baseY), // front foot
        ];

        body.clear();
        // Wet trail dragging behind the wave along the floor
        const trailBack = waveX - d * 240;
        body.fillStyle(0x9fe8ff, 0.12 * fade);
        body.fillRect(Math.min(waveX, trailBack), GROUND_TOP_Y + 8, 240, 14);

        // Depth layers: dark back → mid → bright front, offset for parallax volume
        const layers = [
          { col: 0x0d4f8a, a: 0.6, ox: -12 },
          { col: 0x1d8ec4, a: 0.62, ox: 0 },
          { col: 0x4fd0f5, a: 0.5, ox: 10 },
        ];
        for (const L of layers) {
          body.fillStyle(L.col, L.a);
          body.fillPoints(
            outline.map((p) => ({ x: p.x + d * L.ox, y: p.y })) as unknown as Phaser.Math.Vector2[],
            true,
          );
        }

        // Bright specular running down the front face
        body.lineStyle(3, 0xbff4ff, 0.7);
        body.beginPath();
        body.moveTo(pt(12, cY).x, pt(12, cY).y);
        body.lineTo(pt(48, cY + 16).x, pt(48, cY + 16).y);
        body.lineTo(pt(54, baseY - 60).x, pt(54, baseY - 60).y);
        body.strokePath();

        // Churning foam along the crest and curl
        foam.clear();
        for (let i = 0; i < 11; i++) {
          const ph = step * 0.3 + i * 1.7;
          const fx = waveX + d * (i * 5 - 22 + Math.sin(ph) * 26);
          const fy = cY + 10 + Math.cos(ph * 1.3) * 11;
          const r = 6 + (Math.sin(ph) * 0.5 + 0.5) * 7;
          foam.fillStyle(0xffffff, 0.55);
          foam.fillCircle(fx, fy, r);
          foam.fillStyle(0xddf6ff, 0.4);
          foam.fillCircle(fx, fy, r * 0.6);
        }
        // Spray droplets arcing off the crest (rise then fall under gravity)
        for (let i = 0; i < 9; i++) {
          const prog = ((step * 0.5 + i * 2.3) % 13) / 13;
          const dx = d * (10 + prog * 80) + d * Math.sin(i * 3) * 6;
          const dy = -prog * 130 + prog * prog * 95;
          const r = 3 * (1 - prog) + 1;
          foam.fillStyle(0xeaffff, 0.75 * (1 - prog));
          foam.fillCircle(waveX + dx, cY + 12 + dy, r);
        }

        // Damage and shove anything caught in the wave front
        this.enemyGroup.getChildren().forEach((go) => {
          const s = go as EnemySprite;
          if (s.active && s.enemyRef && Math.abs(s.x - waveX) < 95) {
            s.enemyRef.takeDamage(6, d * 6);
          }
        });

        if (step >= STEPS) {
          body.destroy();
          foam.destroy();
        }
      },
    });
  }

  // ── Atom Collection ─────────────────────────────────────────────────────────

  private _onAtomCollect(atomSprite: AtomSprite): void {
    const atom = atomSprite.atomRef;
    if (!atom || atom.collected) return;
    atom.collected = true;

    const { x, y } = atomSprite;
    atom.destroyGlow();
    atomSprite.destroy();

    if (atom.coin) {
      this._collectCoin(x, y);
      return;
    }

    if (atom.heal) {
      this._collectHeal(atom.heal, x, y);
      return;
    }

    if (atom.armor) {
      this._collectArmor(atom.armor, x, y);
      return;
    }

    if (atom.noble) {
      this._collectNoble(atom.noble, x, y);
      return;
    }

    if (atom.platinum) {
      // Platinum wildcard — the flashiest pickup; grants +3 to a chosen base atom
      const col = ELEMENT_COLORS[ELEMENTS.PLATINUM];
      this.spawnHitFlash(x, y, col, 60);
      this.spawnHitFlash(x, y, 0xffffff, 32);
      this.spawnNova(x, y, col, 150, { rings: 3, life: 26, lineWidth: 3, fill: true });
      this.spawnAtomBurst(x, y, col);
      this.shake(240, 0.009);
      SoundSystem.play(this.audioCtx, 'element_upgrade');
      this._showElementChoice(atom.choices ?? [...BASE_ATOMS], { platinum: true, grant: 3 });
      return;
    }

    if (atom.gold) {
      // Gold wildcard — a flashier pickup that grants +2 to a chosen base atom
      this.spawnHitFlash(x, y, 0xffd700, 44);
      this.spawnAtomBurst(x, y, 0xffd700);
      this.shake(180, 0.006);
      SoundSystem.play(this.audioCtx, 'element_upgrade');
      this._showElementChoice(atom.choices ?? [...BASE_ATOMS], { gold: true, grant: 2 });
      return;
    }

    this.spawnHitFlash(x, y, 0xaa44ff, 28);
    this.spawnAtomBurst(x, y, 0xaa44ff);
    this.shake(120, 0.004);
    SoundSystem.play(this.audioCtx, 'atom_collect');

    // Every atom is now a choice node — pick a base atom to grow the molecular tree
    this._showElementChoice(atom.choices ?? ['hydrogen', 'oxygen']);
  }

  /** Grab a silver coin: a small score pickup. Sweeping every coin in the stage awards COIN_BONUS. */
  private _collectCoin(x: number, y: number): void {
    this.score += COIN_SCORE;
    this._coinsCollected++;
    this.events.emit('score-update', this.score);
    this.events.emit('coins-update', { collected: this._coinsCollected, total: this._coinsTotal });

    // Light pickup blip + a small silver sparkle.
    this.spawnHitFlash(x, y, COIN_COLOR, 16);
    SoundSystem.play(this.audioCtx, 'atom_collect');

    if (this._coinsCollected >= this._coinsTotal && !this._coinBonusAwarded) {
      this._coinBonusAwarded = true;
      this.score += COIN_BONUS;
      this.events.emit('score-update', this.score);
      this.spawnNova(x, y, COIN_COLOR, 150, { rings: 3, life: 26, lineWidth: 3, fill: true });
      this.spawnBurst(x, y, COIN_COLOR, { count: 24, speed: [120, 300], lifespan: 650, scale: 1.2 });
      this.shake(200, 0.007);
      SoundSystem.play(this.audioCtx, 'element_upgrade');
      const label = this.add
        .text(x, y - 18, `ALL COINS!  +${COIN_BONUS.toLocaleString()}`, {
          fontSize: '20px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(120);
      this.tweens.add({
        targets: label,
        y: y - 70,
        alpha: 0,
        duration: 1200,
        ease: 'Quad.Out',
        onComplete: () => label.destroy(),
      });
      this._megQuip(
        `Every last silver coin — all ${this._coinsTotal} of them! +${COIN_BONUS.toLocaleString()} for a clean sweep!`,
      );
    }
  }

  /**
   * Grab a healing drop (Ca/Zn): restore HP, capped at max. A green "+N HP" pops up; if the player is
   * already full the drop still fizzes but reads as "FULL" so the pickup never feels wasted-silently.
   */
  private _collectHeal(id: HealId, x: number, y: number): void {
    const def = HEAL_DROPS[id];
    const healed = this.player.heal(def.heal);

    this.spawnHitFlash(x, y, def.color, 26);
    this.spawnBurst(x, y, def.color, { count: 12, speed: [80, 200], lifespan: 550, scale: 1 });
    SoundSystem.play(this.audioCtx, 'element_upgrade');
    if (healed > 0)
      this.events.emit('hud-update', {
        hp: this.player.hp,
        armor: this.player.armor,
        element: this.player.elementSystem,
      });

    const text = healed > 0 ? `+${healed} HP` : 'HP FULL';
    const label = this.add
      .text(x, y - 18, `${def.symbol}  ${text}`, {
        fontSize: '18px',
        color: healed > 0 ? '#7dffb0' : '#cfd8e0',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(120);
    this.tweens.add({
      targets: label,
      y: y - 60,
      alpha: 0,
      duration: 1000,
      ease: 'Quad.Out',
      onComplete: () => label.destroy(),
    });
  }

  /**
   * Grab an armor drop (Fe): add to the Iron-armor buffer, capped at max. A steel "+N ARMOR" pops up;
   * at full armor it reads "ARMOR FULL" so the pickup never feels silently wasted.
   */
  private _collectArmor(id: ArmorId, x: number, y: number): void {
    const def = ARMOR_DROPS[id];
    const gained = this.player.addArmor(def.armor);

    this.spawnHitFlash(x, y, def.color, 26);
    this.spawnBurst(x, y, def.color, { count: 12, speed: [80, 200], lifespan: 550, scale: 1 });
    SoundSystem.play(this.audioCtx, 'element_upgrade');
    if (gained > 0)
      this.events.emit('hud-update', {
        hp: this.player.hp,
        armor: this.player.armor,
        element: this.player.elementSystem,
      });

    const text = gained > 0 ? `+${gained} ARMOR` : 'ARMOR FULL';
    const label = this.add
      .text(x, y - 18, `${def.symbol}  ${text}`, {
        fontSize: '18px',
        color: gained > 0 ? '#bcd4e8' : '#cfd8e0',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(120);
    this.tweens.add({
      targets: label,
      y: y - 60,
      alpha: 0,
      duration: 1000,
      ease: 'Quad.Out',
      onComplete: () => label.destroy(),
    });
  }

  /** The noble gases collected in the current run. Run-scoped (registry): reset when a new run starts. */
  private _runNobles(): NobleGasId[] {
    return (this.registry.get('runNobles') as NobleGasId[] | undefined) ?? [];
  }

  /** Grab a noble gas: a big score bonus, a flashy burst, a run-collection find, and a M.E.G. shout-out. */
  private _collectNoble(gas: NobleGasId, x: number, y: number): void {
    const def = NOBLE_GAS_BY_ID[gas];
    this.score += NOBLE_GAS_BONUS;
    this.events.emit('score-update', this.score);
    const collected = this._runNobles();
    const firstFind = !collected.includes(gas);
    if (firstFind) {
      collected.push(gas);
      this.registry.set('runNobles', collected);
    }

    // Celebratory FX in the gas's color.
    this.spawnHitFlash(x, y, def.color, 70);
    this.spawnHitFlash(x, y, 0xffffff, 36);
    this.spawnNova(x, y, def.color, 150, { rings: 3, life: 26, lineWidth: 3, fill: true });
    this.spawnBurst(x, y, def.color, { count: 26, speed: [120, 320], lifespan: 650, scale: 1.3 });
    this.shake(220, 0.008);
    SoundSystem.play(this.audioCtx, 'element_upgrade');

    // Floating "+bonus" label.
    const label = this.add
      .text(x, y - 18, `${def.name} +${NOBLE_GAS_BONUS.toLocaleString()}`, {
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(120);
    this.tweens.add({
      targets: label,
      y: y - 70,
      alpha: 0,
      duration: 1100,
      ease: 'Quad.Out',
      onComplete: () => label.destroy(),
    });

    const found = collected.length;
    // Completing the collection arms the Prismatic Beam super weapon for the rest of this run (the
    // collection resets when the next run starts). Announce it instead of the usual pickup quip.
    const es = this.player.elementSystem;
    const justCompleted = found >= NOBLE_GAS_COUNT && !es.isSuperUnlocked();
    if (justCompleted) {
      es.setSuperUnlocked(true);
      es.seedSuperWeapon();
      this.events.emit('arsenal-update', this.player.getArsenalUpdate());
    }
    this._megQuip(
      justCompleted
        ? `ALL ${NOBLE_GAS_COUNT} noble gases collected! The PRISMATIC BEAM is armed — pure light, in your hands!`
        : firstFind
          ? `Incredible — pure ${def.name} (${def.symbol})! A noble gas, inert but priceless. ${found}/${NOBLE_GAS_COUNT} found!`
          : `${def.name} (${def.symbol}) secured again — +${NOBLE_GAS_BONUS.toLocaleString()} to the tally!`,
    );
  }

  private _showElementChoice(
    choices: BaseAtom[],
    opts: { gold?: boolean; platinum?: boolean; grant?: number } = {},
  ): void {
    const grant = opts.grant ?? 1;
    this.isPaused = true;
    this.physics.pause();
    this.scene.launch('ElementChoiceScene', {
      choices,
      counts: this.player.elementSystem.getCounts(),
      gold: opts.gold ?? false,
      platinum: opts.platinum ?? false,
      grant,
      callback: (chosen: BaseAtom) => {
        this.isPaused = false;
        this.physics.resume();
        const es = this.player.elementSystem;
        // Snapshot every attack's level before the pick so we can spot any that hit max (Lv3).
        const levelsBefore = new Map<AttackId, number>(ATTACK_ORDER.map((id) => [id, es.getAttackLevel(id)]));
        let upgraded = false;
        for (let i = 0; i < grant; i++) {
          if (es.collectAtom(chosen)) upgraded = true;
        }
        // Auto-bind newly-unlocked weapons to free slots; `overflow` means the loadout is full.
        const { overflow } = es.reconcileBindings();
        if (upgraded) SoundSystem.play(this.audioCtx, 'element_upgrade');
        this.events.emit('arsenal-update', this.player.getArsenalUpdate());
        this.scene.stop('ElementChoiceScene');
        // Any element/compound that just reached its top tier this pick.
        const maxed = ATTACK_ORDER.find(
          (id) => (levelsBefore.get(id) ?? 0) < MAX_ELEMENT_LEVEL && es.getAttackLevel(id) === MAX_ELEMENT_LEVEL,
        );
        if (this.isTutorial) {
          this._tip(
            'armed',
            Settings.touchActive()
              ? 'Armed! Tap an attack button to unleash your attack. Go smash that germ ahead!'
              : 'Armed! Press Z to unleash your attack. Go smash that germ ahead!',
          );
        } else if (overflow.length > 0 && !Settings.get().compoundIntroSeen) {
          // First time the player synthesizes more compounds than they have slots — M.E.G. explains
          // the Compound Selection menu so they know how to choose their loadout.
          Settings.set({ compoundIntroSeen: true });
          this._say(this._compoundIntroLines());
        } else if (maxed) {
          // M.E.G. pops in to celebrate maxing out an element/compound.
          this._megQuip(this._maxLevelQuip(maxed));
        }
      },
    });
  }

  // ── Stage Events ─────────────────────────────────────────────────────────────

  onEnemyDeath(enemy: Enemy | Boss): void {
    const SCORES: Partial<Record<string, number>> = {
      bacterium: 100,
      virus: 80,
      dustbunny: 150,
      pollen: 60,
      amoeba: 200,
      spore: 70,
      mite: 120,
      ant: 110,
      fly: 70,
      bee: 160,
    };
    this.score += enemy.isBoss ? 1000 : (SCORES[(enemy as Enemy).type] ?? 100);
    this.events.emit('score-update', this.score);
    this._enemyKilled = Math.min(this._enemyKilled + 1, this._enemyTotal);
    this._emitEnemyCount();
  }

  /** Lives left in the current run, for the HUD. Returns -1 during the tutorial (no lives shown). */
  livesRemaining(): number {
    return this.isTutorial ? -1 : ((this.registry.get('lives') as number | undefined) ?? RUN_LIVES);
  }

  onPlayerDeath(): void {
    // The tutorial has no run/lives — a death there just offers a straight retry.
    if (this.isTutorial) {
      this._showDeathScreen();
      return;
    }
    const lives = Math.max(0, ((this.registry.get('lives') as number | undefined) ?? RUN_LIVES) - 1);
    this.registry.set('lives', lives);
    this.events.emit('lives-update', lives);
    // A life remains: dust off and retry the stage with the run intact (score + noble collection kept).
    // Out of lives: the run is over — the full death screen sends the player back to Stage Select.
    if (lives > 0) this._showLifeLost(lives);
    else this._showDeathScreen();
  }

  /** A lighter "life lost" overlay shown while lives remain: no run summary, just a prompt to continue
   *  the run by restarting the current stage (score and noble-gas collection are preserved). */
  private _showLifeLost(livesLeft: number): void {
    this.isPaused = true;
    this._applyZoom(BOSS_ZOOM, 250);
    MusicSystem.stop();
    (this.scene.get('HUDScene') as HUDScene | undefined)?.hideArsenal();
    const w = GAME_WIDTH,
      h = GAME_HEIGHT;

    this.add
      .rectangle(w / 2, h / 2, w, h, 0x000000, 0.72)
      .setScrollFactor(0)
      .setDepth(500);
    const title = this.add
      .text(w / 2, h / 2 - 60, 'LIFE LOST', {
        fontSize: '56px',
        color: '#ffcc44',
        fontStyle: 'bold',
        stroke: '#3a2400',
        strokeThickness: 7,
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(501)
      .setScale(2);
    this.tweens.add({ targets: title, scale: 1, duration: 350, ease: 'Back.Out' });
    const hearts = `${'♥'.repeat(livesLeft)}${'♡'.repeat(Math.max(0, RUN_LIVES - livesLeft))}`;
    this.add
      .text(w / 2, h / 2 + 4, `${hearts}\n${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} left`, {
        fontSize: '26px',
        color: '#ff6a7a',
        align: 'center',
        lineSpacing: 8,
        fontStyle: 'bold',
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(501);

    const touch = Settings.touchActive();
    let chose = false;
    const cont = () => {
      if (chose) return;
      chose = true;
      this.scene.stop('HUDScene');
      // Restart the current stage; the run carries on (runScore/runNobles/lives stay in the registry).
      this.scene.start('GameScene', { stage: this.currentStage });
    };
    const prompt = this.add
      .text(w / 2, h - 60, touch ? 'Tap here to continue' : 'Press Z to continue', {
        fontSize: '24px',
        color: '#ffeeaa',
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(501);
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 600, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
    prompt.setInteractive({ useHandCursor: true });
    prompt.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation();
      cont();
    });
    this.input.keyboard?.once('keydown-Z', cont);
  }

  private _showDeathScreen(): void {
    this.isPaused = true;
    // The death overlay is screen-fixed — snap back to a full screen so it frames correctly.
    this._applyZoom(BOSS_ZOOM, 250);
    // Cut the music so the death toll lands; it restarts on retry / when the next scene loads.
    MusicSystem.stop();
    // Clear the weapon chips + on-screen controls so the death overlay reads cleanly.
    (this.scene.get('HUDScene') as HUDScene | undefined)?.hideArsenal();
    const w = GAME_WIDTH,
      h = GAME_HEIGHT;
    const textX = w * 0.34; // text shifted left to make room for the crying scientist

    const overlay = this.add
      .rectangle(w / 2, h / 2, w, h, 0x000000)
      .setScrollFactor(0)
      .setDepth(500)
      .setAlpha(0);
    this.tweens.add({ targets: overlay, alpha: 0.8, duration: 400 });

    this._spawnCryingScientist(w * 0.72, h / 2 + 8);

    const diedText = this.add
      .text(textX, h / 2 - 96, 'YOU DIED', {
        fontSize: '64px',
        color: '#cc1111',
        fontStyle: 'bold',
        stroke: '#330000',
        strokeThickness: 8,
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(501)
      .setScale(2.5);
    this.tweens.add({ targets: diedText, scale: 1, duration: 400, ease: 'Back.Out' });
    if (!this.isTutorial) {
      this.add
        .text(textX, h / 2 - 60, 'GAME OVER — out of lives', { fontSize: '18px', color: '#ff8a8a', fontStyle: 'bold' })
        .setScrollFactor(0)
        .setOrigin(0.5)
        .setDepth(501);
    }

    // Record the run (skip the tutorial) and show a compact summary on the left column.
    const rank = this.isTutorial ? -1 : this._submitRun();
    // The run is over; clear the run-scoped registry state so a new run starts clean.
    if (!this.isTutorial) {
      this.registry.set('runScore', 0);
      this.registry.set('runNobles', []);
      this.registry.set('lives', RUN_LIVES);
    }

    this.add
      .text(textX, h / 2 - 36, `Run score: ${this.score.toLocaleString()}`, {
        fontSize: '28px',
        color: '#ffffff',
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(501);

    if (!this.isTutorial) {
      const sum = this._runSummaryLines();
      const placed = rank >= 0 ? `Leaderboard:  #${rank + 1} on ${this.difficulty.toUpperCase()}` : '';
      this.add
        .text(
          textX,
          h / 2 + 6,
          `Reached Stage ${this.currentStage} of ${STAGE_COUNT}\n${sum.atoms}\n${sum.molecules}\n${sum.nobles}\n${placed}`.trimEnd(),
          {
            fontSize: '14px',
            color: '#cdd8e6',
            fontFamily: 'monospace',
            align: 'center',
            lineSpacing: 5,
            wordWrap: { width: w * 0.5 },
          },
        )
        .setScrollFactor(0)
        .setOrigin(0.5, 0)
        .setDepth(501);
    }

    // Retry / title are reachable by keyboard (Z / ESC) AND by tapping their labels, so touch players
    // (no keyboard) can act. Guarded so a key + tap can't both fire.
    const touch = Settings.touchActive();
    let chose = false;
    const retry = () => {
      if (chose) return;
      chose = true;
      this.scene.stop('HUDScene');
      // Tutorial retries itself; a finished run goes back to Stage Select, where a new run begins.
      if (this.isTutorial) this.scene.start('GameScene', { tutorial: true });
      else this.scene.start('StageSelectScene');
    };
    const toTitle = () => {
      if (chose) return;
      chose = true;
      this.scene.stop('HUDScene');
      this.scene.start('TitleScene');
    };
    const tap = (go: Phaser.GameObjects.Text, action: () => void) => {
      go.setInteractive({ useHandCursor: true });
      go.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
        ev?.stopPropagation();
        action();
      });
    };

    const retryLabel = this.isTutorial
      ? touch
        ? 'Tap here to retry'
        : 'Press Z to retry'
      : touch
        ? 'Tap here for Stage Select'
        : 'Press Z for Stage Select';
    const retryText = this.add
      .text(textX, h - 52, retryLabel, {
        fontSize: '24px',
        color: '#ffeeaa',
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(501);
    tap(retryText, retry);
    this.tweens.add({
      targets: retryText,
      alpha: 0.3,
      duration: 600,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });
    const titleText = this.add
      .text(textX, h - 22, touch ? 'Tap here for title' : 'ESC for title', {
        fontSize: '15px',
        color: '#aa8888',
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(501);
    tap(titleText, toTitle);

    this.input.keyboard?.once('keydown-Z', retry);
    this.input.keyboard?.once('keydown-ESC', toTitle);
  }

  /** A close-up of the scientist sobbing on the death screen — trembling, tears streaming into a puddle. */
  private _spawnCryingScientist(x: number, y: number): void {
    const S = 3.4;
    // The hand-drawn player art already includes arms, so the cameo is just the sprite in a
    // container (so every sob tween moves it together). Normalize the high-res art to a ~70px cameo.
    const sprite = this.add.sprite(0, 0, 'player_0');
    sprite.setScale(fitHeightScale(sprite.height, 70));
    const guy = this.add.container(x, y, [sprite]).setScrollFactor(0).setDepth(501).setScale(S);

    // pop in
    guy.setScale(S * 0.4);
    this.tweens.add({ targets: guy, scaleX: S, scaleY: S, duration: 350, ease: 'Back.Out' });
    // trembling sob — rock + heave
    this.tweens.add({
      targets: guy,
      angle: { from: -5, to: 5 },
      duration: 170,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    this.tweens.add({ targets: guy, y: y - 8, duration: 230, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    // Growing tear puddle at his feet
    const puddleY = y + 36 * S;
    const puddle = this.add
      .ellipse(x, puddleY, 40, 14, 0x66ccff, 0.45)
      .setScrollFactor(0)
      .setDepth(500.9)
      .setScale(0.12, 0.12);
    this.tweens.add({ targets: puddle, scaleX: 4.4, scaleY: 1.25, duration: 5500, ease: 'Sine.Out' });

    // Streaming tears from under each lens (the bottom of his goggles)
    const eyeOffX = 6 * S;
    const eyeOffY = -14 * S;
    for (const ox of [-eyeOffX, eyeOffX]) {
      const tears = this.add
        .particles(0, 0, 'particle', {
          lifespan: 1150,
          speedY: { min: 70, max: 150 },
          speedX: { min: -22, max: 22 },
          gravityY: 650,
          // stay full size on the way down; only shrink near the end (once well below him)
          scale: { start: 0.95, end: 0.12, ease: 'Quint.In' },
          alpha: { start: 0.95, end: 0, ease: 'Quint.In' },
          tint: 0x66ccff,
          frequency: 55,
          quantity: 1,
        })
        .setScrollFactor(0)
        .setDepth(502);
      tears.startFollow(guy, ox, eyeOffY);
    }
  }

  // ── Stage completion ─────────────────────────────────────────────────────────

  /** Reached the exit on a non-boss stage, or no enemies remain — open / advance. */
  private _updateExit(): void {
    if (this.stageCleared || !this._exitPortal) return;
    if (!this._exitOpen) {
      if (this.enemyGroup.countActive(true) === 0) this._openExit();
      return;
    }
    if (this.player.sprite.x >= this._exitX - 20) this._completeStage();
  }

  private _openExit(): void {
    this._exitOpen = true;
    this._drawExitPortal(true);
    this._exitHint?.setText('EXIT OPEN  →').setColor('#bfffd0').setAlpha(1);
    SoundSystem.play(this.audioCtx, 'element_upgrade');
    this.cameras.main.flash(250, 80, 255, 150);
  }

  private _completeStage(): void {
    if (this.stageCleared) return;
    this.stageCleared = true;
    this.player.freeze(); // hold the player still through the clear banner until the next stage
    this._finalizeStageScore();
    const theme = SECTOR_THEMES[this.sector];
    this.cameras.main.flash(500, theme.flashR, theme.flashG, theme.flashB);
    SoundSystem.play(this.audioCtx, 'element_upgrade');
    this.time.delayedCall(550, () => this._showClearBanner());
  }

  /**
   * Boss just activated — frame the fight as a fixed arena. The boss holds station near
   * `anchorX` and the player dodges its attacks within this one screen, so we pin the camera
   * to a single screen-wide window and confine the player to it (no running away mid-fight).
   */
  private _lockBossArena(anchorX: number): void {
    const right = Math.min(this.worldWidth, anchorX + 220);
    const left = Math.max(0, right - GAME_WIDTH);
    this._bossArena = { left, right };
    // Bounds exactly one screen wide → the follow camera has nothing left to scroll, so it locks.
    this.cameras.main.setBounds(left, 0, GAME_WIDTH, GAME_HEIGHT);
    // Pull the camera back to a full screen so the whole one-screen arena is visible for the fight.
    this._playZoom = BOSS_ZOOM;
    this._applyZoom(BOSS_ZOOM, 600);
  }

  /**
   * Smoothly retarget the camera zoom, keeping the screen-fixed framing overlays (vignette + the
   * petri-dish iris mask) glued to the screen edges. They're rendered through the zooming camera, so
   * without the counter-scale in `_rescaleOverlays` they'd inflate off-screen as we zoom in.
   */
  private _applyZoom(target: number, duration: number): void {
    this.tweens.killTweensOf(this.cameras.main);
    if (duration <= 0) {
      this.cameras.main.setZoom(target);
      this._rescaleOverlays();
      return;
    }
    this.tweens.add({
      targets: this.cameras.main,
      zoom: target,
      duration,
      ease: 'Sine.InOut',
      onUpdate: () => this._rescaleOverlays(),
      onComplete: () => this._rescaleOverlays(),
    });
  }

  /** Counter-scale the screen-fixed framing overlays to the current camera zoom (see `_applyZoom`). */
  private _rescaleOverlays(): void {
    const z = this.cameras.main.zoom || 1;
    this._vignette?.setScale(1 / z);
    this._redrawDish();
  }

  /** Draw the petri-dish iris so it frames the screen edges at the current zoom (inverse-sized). */
  private _redrawDish(): void {
    const g = this._dishMask;
    if (!g) return;
    const z = this.cameras.main.zoom || 1;
    g.clear();
    g.fillStyle(0xffffff);
    g.fillEllipse(GAME_WIDTH / 2, GAME_HEIGHT / 2, (GAME_WIDTH - 4) / z, (GAME_HEIGHT - 4) / z);
  }

  /** Called by the Boss on a finale stage once it dies. */
  onBossDefeated(): void {
    this.stageCleared = true;
    this.player.freeze(); // hold the player still through the victory banner until the next stage
    this._enemyKilled = this._enemyTotal;
    this._emitEnemyCount();
    this._finalizeStageScore();
    const theme = SECTOR_THEMES[this.sector];
    this.cameras.main.flash(600, theme.flashR, theme.flashG, theme.flashB);
    this.time.delayedCall(700, () => this._showClearBanner());
  }

  /** Award clear bonuses, fold them into the run score, and persist best-score + unlock. */
  private _finalizeStageScore(): void {
    const elapsed = (this.time.now - this._stageStartMs) / 1000;
    // Par scales with stage length; clearing under par gives a decaying time bonus.
    const par = this.worldWidth / 160 + 25;
    this._lastTimeBonus = Math.max(0, Math.round((par - elapsed) * 8));
    this._lastNoHitBonus = this.player.hp >= PLAYER_MAX_HP ? 750 : 0;
    this.score += this._lastTimeBonus + this._lastNoHitBonus;
    this.events.emit('score-update', this.score);

    const stageScore = this.score - this._stageBaseScore; // this stage's own contribution
    SaveSystem.recordBestScore(this.difficulty, this.currentStage, stageScore);
    SaveSystem.markStageCleared(this.difficulty, this.currentStage);
  }

  /** Insert the finished run onto the leaderboard. Returns 0-based rank, or -1 if it didn't place. */
  private _submitRun(): number {
    if (this._runSubmitted) return -1;
    this._runSubmitted = true;
    const es = this.player.elementSystem;
    const record: RunRecord = {
      score: this.score,
      stageReached: this.currentStage,
      difficulty: this.difficulty,
      atoms: es.getCounts(),
      molecules: es.getAvailableAttacks().map((a) => a.id),
      date: Date.now(),
    };
    return SaveSystem.submitRun(record);
  }

  /** "H2 O1 C0 N0" + assembled molecule names — used by the clear/death summaries. */
  private _runSummaryLines(): { atoms: string; molecules: string; nobles: string } {
    const es = this.player.elementSystem;
    const c = es.getCounts();
    const attacks = es.getAvailableAttacks();
    const found = this._runNobles();
    return {
      atoms: `Atoms:  H${c.hydrogen}  O${c.oxygen}  C${c.carbon}  N${c.nitrogen}`,
      molecules: attacks.length
        ? `Built:  ${attacks.map((a) => ELEMENT_NAMES[a.id]).join(', ')}`
        : 'Built:  nothing this stage',
      nobles: `Noble gases:  ${NOBLE_GASES.map((n) => (found.includes(n.id) ? n.symbol : '·')).join(' ')}  (${found.length}/${NOBLE_GAS_COUNT})`,
    };
  }

  /** Shared victory overlay: STAGE / SECTOR / EXPERIMENT-COMPLETE depending on where we are. */
  private _showClearBanner(): void {
    const w = GAME_WIDTH,
      h = GAME_HEIGHT;
    // The victory overlay is screen-fixed — return to a full screen so it frames correctly.
    this._applyZoom(BOSS_ZOOM, 250);
    const theme = SECTOR_THEMES[this.sector];
    // Clear the playfield UI (weapon chips + touch buttons) so the banner reads cleanly. Direct
    // call (not an event) so it leaves no listener behind on the reused scene emitter.
    (this.scene.get('HUDScene') as HUDScene | undefined)?.hideArsenal();
    this.add
      .rectangle(w / 2, h / 2, w, h, 0x000000, 0.55)
      .setScrollFactor(0)
      .setDepth(300);

    const isFinal = this.currentStage >= STAGE_COUNT;
    const isSectorFinale = isFinaleStage(this.currentStage);
    const title = isFinal ? 'EXPERIMENT COMPLETE!' : isSectorFinale ? 'SECTOR CLEAR!' : 'STAGE CLEAR!';
    const titleY = isFinal ? h / 2 - 120 : h / 2 - 70;
    this.add
      .text(w / 2, titleY, title, {
        fontSize: isFinal ? '40px' : isSectorFinale ? '48px' : '44px',
        color: theme.clearColor,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(301);

    // Score breakdown
    const breakdown: string[] = [];
    if (this._lastTimeBonus > 0) breakdown.push(`Time bonus   +${this._lastTimeBonus.toLocaleString()}`);
    if (this._lastNoHitBonus > 0) breakdown.push(`Flawless     +${this._lastNoHitBonus.toLocaleString()}`);
    if (this._coinsTotal > 0) {
      const swept = this._coinsCollected >= this._coinsTotal;
      const sweepTag = swept ? `  ★ +${COIN_BONUS.toLocaleString()}` : '';
      breakdown.push(`Coins        ${this._coinsCollected}/${this._coinsTotal}${sweepTag}`);
    }
    breakdown.push(`Run score    ${this.score.toLocaleString()}`);
    this.add
      .text(w / 2, titleY + 48, breakdown.join('\n'), {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: 'center',
        lineSpacing: 6,
      })
      .setScrollFactor(0)
      .setOrigin(0.5, 0)
      .setDepth(301);

    if (isFinal) {
      // Run is over — record it and show a summary + leaderboard placement.
      const rank = this._submitRun();
      const sum = this._runSummaryLines();
      const placed = rank >= 0 ? `Leaderboard:  #${rank + 1} on ${this.difficulty.toUpperCase()}` : '';
      this.add
        .text(w / 2, titleY + 150, `${sum.atoms}\n${sum.molecules}\n${sum.nobles}\n${placed}`.trimEnd(), {
          fontSize: '15px',
          color: '#bfe6ff',
          fontFamily: 'monospace',
          align: 'center',
          lineSpacing: 5,
          wordWrap: { width: w - 120 },
        })
        .setScrollFactor(0)
        .setOrigin(0.5, 0)
        .setDepth(301);
    }

    const next = this.currentStage + 1;
    const entersNewSector = !isFinal && sectorOf(next) !== this.sector;
    const dest = isFinal
      ? 'return to stage select'
      : entersNewSector
        ? `enter ${SECTORS[sectorOf(next)].name}`
        : 'continue';
    const prompt = this.add
      .text(w / 2, h - 60, `${Settings.touchActive() ? 'Tap' : 'Press Z'} to ${dest}`, {
        fontSize: '24px',
        color: '#ffeeaa',
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(301);
    this.tweens.add({ targets: prompt, alpha: 0.3, duration: 600, ease: 'Sine.InOut', yoyo: true, repeat: -1 });

    // Advance on a tap as well as Z, so touch players can move on (guarded against double-firing).
    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      this.scene.stop('HUDScene');
      if (isFinal) {
        this.registry.set('runScore', 0); // run finished — next run starts fresh
        this.scene.start('StageSelectScene');
      } else {
        this.registry.set('runScore', this.score); // carry the cumulative score into the next stage
        this.scene.start('GameScene', { stage: next });
      }
    };
    this.input.keyboard?.once('keydown-Z', advance);
    this.input.once('pointerdown', advance);
  }
}
