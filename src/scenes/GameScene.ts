import Phaser from 'phaser';
import type { AttackId, BaseAtom, Difficulty, NobleGasId, SectorId } from '../constants';
import {
  ATTACK_ORDER,
  BASE_ATOMS,
  CRUMBLE_DELAY_MS,
  DEPTH,
  DIFFICULTY_SCALE,
  ELEMENT_NAMES,
  FLYER_MAX_Y,
  FLYER_MIN_Y,
  GAME_HEIGHT,
  GAME_WIDTH,
  GAP_FALL_DAMAGE,
  GRAVITY,
  GROUND_TOP_Y,
  HAZARD_DAMAGE,
  isFinaleStage,
  MAX_ELEMENT_LEVEL,
  MEG_MAX_LEVEL_QUIPS,
  NOBLE_GAS_BONUS,
  NOBLE_GAS_BY_ID,
  NOBLE_GAS_COUNT,
  NOBLE_GASES,
  PLAYER_BOUNCE_VELOCITY,
  PLAYER_MAX_HP,
  SECTORS,
  SLOT_KEY_LABELS,
  STAGE_COUNT,
  sectorOf,
  WORLD_WIDTH,
} from '../constants';
import Atom from '../entities/Atom';
import Boss from '../entities/Boss';
import Enemy, { type EnemyType } from '../entities/Enemy';
import Player from '../entities/Player';
import { STAGES, type StageDef } from '../stages';
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
const FLYER_TYPES = new Set<EnemyType>(['virus', 'spore', 'pollen']);

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

  // ── Scoring (score is the cumulative run total, carried between stages) ──
  private _stageStartMs = 0;
  private _stageBaseScore = 0; // run score at the moment this stage began
  private _lastTimeBonus = 0;
  private _lastNoHitBonus = 0;
  private _runSubmitted = false;

  /** Biome/theme group this stage belongs to (1–3). */
  get sector(): SectorId {
    return sectorOf(this.currentStage);
  }

  // ── Exit portal (non-boss stages clear by reaching it once enemies are down) ──
  private _exitX = 0;
  private _exitOpen = false;
  private _exitPortal?: Phaser.GameObjects.Container;
  private _exitHint?: Phaser.GameObjects.Text;

  // ── Boss arena (camera locks to one screen once the boss activates) ──
  private _bossArena: { left: number; right: number } | null = null;
  private _bossArenaHandler?: (anchorX: number) => void;

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
    this.physics.world.gravity.y = GRAVITY;
    this.physics.world.setBounds(0, 0, this.worldWidth, GAME_HEIGHT + 300);
    this.cameras.main.setBounds(0, 0, this.worldWidth, GAME_HEIGHT);
    this.audioCtx = (this.sound as Phaser.Sound.WebAudioSoundManager).context;

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
    this.physics.add.collider(this.player.sprite, this.platformGroup);
    this.cameras.main.startFollow(this.player.sprite, true, 0.08, 0.08);

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
        // Start the clear timer once the intro is over and the player can actually move.
        this._stageStartMs = this.time.now;
        // Sync the HUD to the carried run score (it defaults to 0 until an event arrives).
        this.events.emit('score-update', this.score);
      });
    }
  }

  private _playStageIntro(onComplete: () => void): void {
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;

    const dishMask = this.add.graphics().setScrollFactor(0).setDepth(-999);
    dishMask.fillStyle(0xffffff);
    dishMask.fillEllipse(w / 2, h / 2, w - 4, h - 4);
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

    this.add.tileSprite(0, 0, w, GAME_HEIGHT, `bg_tile_${sector}`).setOrigin(0, 0).setScrollFactor(0.3).setDepth(-10);
    this.add
      .tileSprite(0, GROUND_TOP_Y, w, GAME_HEIGHT - GROUND_TOP_Y, `ground_tile_${sector}`)
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
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette')
      .setScrollFactor(0)
      .setDepth(250)
      .setAlpha(0.9);

    const label = this.isTutorial ? '— TRAINING SECTOR —' : `— ${SECTORS[sector].name} · ${this.stageDef.name} —`;
    this.add
      .text(300, GROUND_TOP_Y - 60, label, {
        fontSize: '18px',
        color: theme.label,
        fontStyle: 'italic',
      })
      .setDepth(5)
      .setAlpha(0.65);
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

  /** A visible, solid ledge the player can jump onto: [xLeft, yTop, width]. */
  private _addPlatform(xLeft: number, yTop: number, w: number): void {
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
      } else {
        // MacConkey — crystal shards
        g.fillStyle(color, 0.12);
        g.fillTriangle(x, y - 36 * s, x - 14 * s, y + 22 * s, x + 14 * s, y + 22 * s);
        g.lineStyle(1, color, 0.2);
        g.strokeTriangle(x, y - 36 * s, x - 14 * s, y + 22 * s, x + 14 * s, y + 22 * s);
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
      } else {
        // upright crystal spikes
        g.fillStyle(color, 0.45);
        g.fillTriangle(x - 5 * s, y, x + 5 * s, y, x, y - rand(16, 28) * s);
      }
    }
  }

  private _spawnStage(): void {
    const def = this.stageDef;
    const scale = DIFFICULTY_SCALE[this.difficulty];

    // Atoms — branching choice nodes (see src/stages.ts for the per-stage ramp). They float at a
    // reachable height, or at an authored `y` when perched on a ledge.
    // A rare 1% roll turns a node into a Gold wildcard (pick any base atom, +2).
    def.atoms.forEach((a) => {
      const gold = Math.random() < 0.01;
      const atom = new Atom(this, a.x, a.y ?? GROUND_TOP_Y - 36, gold ? [...BASE_ATOMS] : a.choices, gold);
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
      this._spawnEnemy(en.x, this._spawnYFor(en.type), en.type);
    });

    // Noble-gas bonus pickup — a rare inert gem, usually perched high and/or guarded. It awards a
    // score bonus every run; the first grab also records a permanent find (see _collectNoble).
    if (def.noble) {
      const n = def.noble;
      const gem = new Atom(this, n.x, n.y, [], false, n.gas);
      this.atomGroup.add(gem.sprite);
      // Guard spawns right at the gem — a ground type drops onto its ledge, a flyer hovers there.
      if (n.guard) this._spawnEnemy(n.x, n.y, n.guard);
    }

    if (def.boss) {
      // Sector finale — the boss closes out the level
      const boss = new Boss(this, def.boss.x, GROUND_TOP_Y - 80, def.boss.variant);
      boss.hp = Math.round(boss.hp * scale.enemyHp);
      boss.maxHp = Math.round(boss.maxHp * scale.enemyHp);
      boss.speed *= scale.enemySpeed;
      this.boss = boss;
      this.enemyGroup.add(boss.sprite);
      this._bossArenaHandler = (anchorX: number) => this._lockBossArena(anchorX);
      this.events.once('boss-activated', this._bossArenaHandler);
    } else if (def.exitX !== undefined) {
      // Regular stage — clear it by reaching the exit once the area is cleared
      this._exitX = def.exitX;
      this._spawnExitPortal(def.exitX);
    }
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
   * Pits must be jumped. Walk off a ledge or miss a jump and the player simply falls under gravity;
   * once they drop below the screen, deal fall damage and respawn them on the last safe ledge.
   */
  private _updatePitFall(): void {
    const p = this.player;
    if (!p.alive) return;
    const px = p.sprite.x;
    // Remember the last solid footing that isn't a hole, so respawns land somewhere stable.
    if (p.sprite.body.onFloor() && !this._holes.some((h) => px > h.x1 - 10 && px < h.x2 + 10)) {
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

  /** Sector-tinted corrosive-pool colors for hazard strips. */
  private _hazardTheme(): { fill: number; surface: number } {
    if (this.sector === 1) return { fill: 0x88dd33, surface: 0xccff66 };
    if (this.sector === 2) return { fill: 0xdd3322, surface: 0xff7755 };
    return { fill: 0xaa55dd, surface: 0xdd99ff };
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
    if (!p.alive || !p.sprite.body.onFloor()) return;
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

  /** Draw a springy bounce-spore dome on the floor. Centered on GROUND_TOP_Y so it squashes down. */
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
  }

  /** Land on a pad and you're launched into a high arc. */
  private _updatePads(): void {
    if (this._pads.length === 0) return;
    const p = this.player;
    if (!p.alive || !p.sprite.body.onFloor()) return;
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
    if (!p.alive || !p.sprite.body.onFloor()) return;
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

    // Skip-tutorial shortcut + hint
    this.add
      .text(14, GAME_HEIGHT - 32, 'ESC — skip tutorial', {
        fontSize: '12px',
        color: '#668899',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(481);
    this.input.keyboard?.once('keydown-ESC', () => {
      this._tutDone = true;
      this._exitToDifficulty();
    });

    this._say(
      [
        "Whoa — the shrink-ray backfired! You've been shrunk to the molecular scale!",
        "I'm M.E.G., your Main Element Guide. Deep breaths — we'll get you home.",
        'To grow back to normal size you must gather elements and fight your way out.',
        "Let's run a quick drill. Head right (D / → or the stick) and I'll explain as we go.",
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
    const ph = 104;
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
      .text(cx - pw / 2 + 84, cy - 36, 'M.E.G.', {
        fontSize: '16px',
        color: '#66ddff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setScrollFactor(0)
      .setDepth(481)
      .setVisible(false);
    this._dlgText = this.add
      .text(cx - pw / 2 + 84, cy - 12, '', {
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
      .text(cx + pw / 2 - 16, cy + ph / 2 - 14, '▸ Tap / Space', {
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
      `Pause anytime (Esc) and open COMPOUND SELECTION to choose which compounds ride on ${SLOT_KEY_LABELS.slice(0, n).join(' / ')}.`,
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
      this._tip('element', 'See that glowing atom? Walk into it, then pick an element to ARM an attack.');
    }
    if (this._tutEnemy?.sprite.active && Math.abs(px - this._tutEnemyX) < 300) {
      this._tip(
        'enemy',
        'A germ ahead! Press Z (or tap the Z button) to attack — a punch, or your element once armed.',
      );
    }
    if (px > this._gapX1 - 240 && px < this._gapX1) {
      this._tip(
        'gap',
        "A gap in the floor! You can't walk it — press SPACE to JUMP. Tap again mid-air to double-jump.",
      );
    }
    if (px > this._tutEndX && !this._tutDone) this._completeTutorial();
  }

  private _completeTutorial(): void {
    this._tutDone = true;
    this.stageCleared = true;
    this._say(
      [
        'Outstanding! Collect, fight, jump — you have the essentials down.',
        'Now go find the elements and grow back to full size. Good luck out there!',
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

    this.events.emit('hud-update', { hp: this.player.hp, element: this.player.elementSystem });
  }

  // ── Helpers called by entities ──────────────────────────────────────────────

  /** Camera shake that honors the screen-shake setting. Entities call this.scene.shake(...). */
  shake(duration: number, intensity: number): void {
    if (Settings.get().screenShake) this.cameras.main.shake(duration, intensity);
  }

  spawnHitFlash(x: number, y: number, color = 0xffffff, size = 32): void {
    const g = this.add.graphics();
    g.fillStyle(color, 0.85);
    g.fillCircle(x, y, size * 0.6);
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

    if (atom.noble) {
      this._collectNoble(atom.noble, x, y);
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

  /** Grab a noble gas: a big score bonus, a flashy burst, a permanent find, and a M.E.G. shout-out. */
  private _collectNoble(gas: NobleGasId, x: number, y: number): void {
    const def = NOBLE_GAS_BY_ID[gas];
    this.score += NOBLE_GAS_BONUS;
    this.events.emit('score-update', this.score);
    const firstFind = SaveSystem.markNobleFound(gas);

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

    const found = SaveSystem.getNoblesFound().length;
    this._megQuip(
      firstFind
        ? `Incredible — pure ${def.name} (${def.symbol})! A noble gas, inert but priceless. ${found}/${NOBLE_GAS_COUNT} found!`
        : `${def.name} (${def.symbol}) secured again — +${NOBLE_GAS_BONUS.toLocaleString()} to the tally!`,
    );
  }

  private _showElementChoice(choices: BaseAtom[], opts: { gold?: boolean; grant?: number } = {}): void {
    const grant = opts.grant ?? 1;
    this.isPaused = true;
    this.physics.pause();
    this.scene.launch('ElementChoiceScene', {
      choices,
      counts: this.player.elementSystem.getCounts(),
      gold: opts.gold ?? false,
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
          this._tip('armed', 'Armed! Press Z (or tap the Z button) to unleash your attack. Go smash that germ ahead!');
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
    };
    this.score += enemy.isBoss ? 1000 : (SCORES[(enemy as Enemy).type] ?? 100);
    this.events.emit('score-update', this.score);
  }

  onPlayerDeath(): void {
    this._showDeathScreen();
  }

  private _showDeathScreen(): void {
    this.isPaused = true;
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

    // Record the run (skip the tutorial) and show a compact summary on the left column.
    const rank = this.isTutorial ? -1 : this._submitRun();
    if (!this.isTutorial) this.registry.set('runScore', 0); // the run is over; retry starts fresh

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

    const retryText = this.add
      .text(textX, h - 52, 'Press Z to retry', {
        fontSize: '24px',
        color: '#ffeeaa',
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(501);
    this.tweens.add({
      targets: retryText,
      alpha: 0.3,
      duration: 600,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });
    this.add
      .text(textX, h - 24, 'ESC for title', {
        fontSize: '15px',
        color: '#aa8888',
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(501);

    this.input.keyboard?.once('keydown-Z', () => {
      this.scene.stop('HUDScene');
      this.scene.start('GameScene', this.isTutorial ? { tutorial: true } : { stage: this.currentStage });
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      this.scene.stop('HUDScene');
      this.scene.start('TitleScene');
    });
  }

  /** A close-up of the scientist sobbing on the death screen — trembling, tears streaming into a puddle. */
  private _spawnCryingScientist(x: number, y: number): void {
    const S = 3.4;
    // The in-world player draws its arms as a separate Graphics overlay (Player._armsGraphic),
    // so the bare 'player_0' texture has none. Re-create the idle arms at his sides and group them
    // with the sprite in a container so every sob tween moves it together.
    const sprite = this.add.sprite(0, 0, 'player_0');
    const arms = this.add.graphics();
    arms.fillStyle(0xe8e8f2);
    arms.fillRect(-16, -7, 5, 15); // left sleeve
    arms.fillStyle(0x88ccdd);
    arms.fillRect(-16, 6, 5, 5); // left glove
    arms.fillStyle(0xe8e8f2);
    arms.fillRect(11, -7, 5, 15); // right sleeve
    arms.fillStyle(0x88ccdd);
    arms.fillRect(11, 6, 5, 5); // right glove
    const guy = this.add.container(x, y, [sprite, arms]).setScrollFactor(0).setDepth(501).setScale(S);

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
  }

  /** Called by the Boss on a finale stage once it dies. */
  onBossDefeated(): void {
    this.stageCleared = true;
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
    const found = SaveSystem.getNoblesFound();
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
      .text(w / 2, h - 60, `Tap or press Z to ${dest}`, {
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
