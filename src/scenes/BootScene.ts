import Phaser from 'phaser';

// === Hand-drawn art manifest ===
// Every in-scope sprite is a hand-drawn PNG under `public/assets/sprites/`, loaded by key in
// preload(). Game code references these textures only by key, so the art lives entirely here.
// Stage maps (bg_tile / ground_tile), the vignette, and runtime vector FX stay procedural — see
// _makeBackground / _makeVignette below.
type AssetSpec = { key: string; file: string };
const ASSET_SPECS: AssetSpec[] = [
  // Player (multi-frame → player_walk / player_idle / player_jump anims)
  { key: 'player_0', file: 'player/player_0.png' },
  { key: 'player_1', file: 'player/player_1.png' },
  { key: 'player_2', file: 'player/player_2.png' },
  { key: 'player_jump', file: 'player/player_jump.png' },
  // NPC
  { key: 'meg', file: 'npc/meg.png' },
  // Enemies
  { key: 'bacterium', file: 'enemies/bacterium.png' },
  { key: 'virus', file: 'enemies/virus.png' },
  { key: 'dustbunny', file: 'enemies/dustbunny.png' },
  { key: 'pollen', file: 'enemies/pollen.png' },
  { key: 'amoeba', file: 'enemies/amoeba.png' },
  { key: 'spore', file: 'enemies/spore.png' },
  { key: 'mite', file: 'enemies/mite.png' },
  // Bosses
  { key: 'boss_bacterium', file: 'bosses/boss_bacterium.png' },
  { key: 'boss_amoeba', file: 'bosses/boss_amoeba.png' },
  { key: 'boss_phage', file: 'bosses/boss_phage.png' },
  // Atoms
  { key: 'atom_hydrogen', file: 'atoms/atom_hydrogen.png' },
  { key: 'atom_oxygen', file: 'atoms/atom_oxygen.png' },
  { key: 'atom_carbon', file: 'atoms/atom_carbon.png' },
  { key: 'atom_nitrogen', file: 'atoms/atom_nitrogen.png' },
  { key: 'atom_mystery', file: 'atoms/atom_mystery.png' },
  { key: 'atom_node', file: 'atoms/atom_node.png' },
  { key: 'atom_gold', file: 'atoms/atom_gold.png' },
  // Effects (projectile/particle are tinted at runtime — the art is kept near-neutral)
  { key: 'fx_hit', file: 'fx/fx_hit.png' },
  { key: 'projectile', file: 'fx/projectile.png' },
  { key: 'particle', file: 'fx/particle.png' },
];

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[art] failed to load "${file.key}" (${file.src})`);
    });
    for (const a of ASSET_SPECS) {
      this.load.image(a.key, `assets/sprites/${a.file}`);
    }
  }

  create(): void {
    this._makePlayerAnims();
    this._makeBackground();
    this._makeVignette();
    this._makeNobleGem();
    // Sectors 4–6 (LAB FLOOR) creatures have no hand-drawn PNG yet, so draw them procedurally here.
    this._makeAnt();
    this._makeRoachBoss();
    this._makeFly();
    this._makeBee();
    this._makeBeetleBoss();
    this._makeHornetBoss();
    this.scene.start('TitleScene');
  }

  // A house fly — fast fragile flyer (key 'fly'). Facing right.
  private _makeFly(): void {
    const g = this._g();
    // Wings (translucent, up).
    g.fillStyle(0xddeeff, 0.5);
    g.fillEllipse(12, 6, 16, 9);
    g.fillStyle(0xccddee, 0.4);
    g.fillEllipse(16, 7, 12, 7);
    // Body: abdomen (left) → thorax (mid) → head (right).
    g.fillStyle(0x2a2a30, 1);
    g.fillEllipse(11, 14, 16, 11);
    g.fillStyle(0x3a3a44, 1);
    g.fillEllipse(19, 14, 8, 9);
    g.fillStyle(0x222228, 1);
    g.fillCircle(25, 13, 4);
    // Big red compound eye + abdomen banding.
    g.fillStyle(0xcc3322, 1);
    g.fillCircle(26, 12, 2.4);
    g.lineStyle(1, 0x55555f, 0.8);
    g.lineBetween(7, 11, 7, 18);
    g.lineBetween(11, 10, 11, 19);
    g._done('fly', 30, 24);
  }

  // A bee — tougher aggressive flyer (key 'bee'). Facing right.
  private _makeBee(): void {
    const g = this._g();
    const dark = 0x201810;
    // Wings.
    g.fillStyle(0xeef6ff, 0.55);
    g.fillEllipse(15, 7, 16, 10);
    g.fillEllipse(20, 8, 11, 7);
    // Yellow body + black stripes.
    g.fillStyle(0xf0c030, 1);
    g.fillEllipse(15, 16, 22, 16);
    g.fillStyle(dark, 1);
    g.fillRect(9, 9, 3, 14);
    g.fillRect(15, 8, 3, 16);
    g.fillRect(21, 9, 3, 14);
    // Head (right) + eye + antennae + stinger (left rear).
    g.fillStyle(dark, 1);
    g.fillCircle(27, 15, 5);
    g.fillStyle(0x55452a, 1);
    g.fillCircle(28, 14, 1.8);
    g.lineStyle(1.5, dark, 1);
    g.lineBetween(29, 11, 32, 6);
    g.fillStyle(dark, 1);
    g.fillTriangle(5, 14, 5, 18, 0, 16);
    g._done('bee', 32, 28);
  }

  // The Dung Beetle — slow armored bruiser boss (key 'boss_beetle'). Facing right.
  private _makeBeetleBoss(): void {
    const g = this._g();
    const shell = 0x4a3a22;
    const shell2 = 0x6a5430;
    const dark = 0x2a2012;
    const leg = 0x1e160c;
    const eye = 0x100a04;
    // Thick legs.
    g.lineStyle(5, leg, 1);
    g.lineBetween(50, 56, 38, 86);
    g.lineBetween(66, 60, 62, 88);
    g.lineBetween(82, 58, 98, 86);
    g.lineBetween(46, 56, 28, 82);
    g.lineBetween(62, 60, 56, 88);
    g.lineBetween(78, 58, 92, 82);
    // Big domed carapace + shine + segment line.
    g.fillStyle(shell, 1);
    g.fillEllipse(58, 46, 96, 64);
    g.fillStyle(shell2, 0.5);
    g.fillEllipse(54, 32, 52, 22);
    g.lineStyle(2.5, dark, 0.7);
    g.lineBetween(20, 46, 96, 46);
    // Head + upward horn (front right) + eyes.
    g.fillStyle(dark, 1);
    g.fillCircle(96, 52, 12);
    g.fillStyle(0x3a2c16, 1);
    g.fillTriangle(100, 44, 116, 18, 104, 46);
    g.fillStyle(eye, 1);
    g.fillCircle(98, 50, 2.4);
    g.fillCircle(98, 58, 2.4);
    g._done('boss_beetle', 120, 96);
  }

  // The Hornet Queen — fast flying final boss (key 'boss_hornet'). Facing right.
  private _makeHornetBoss(): void {
    const g = this._g();
    const yellow = 0xf0b820;
    const dark = 0x1c140a;
    const eye = 0x3a2a10;
    // Large wings (up).
    g.fillStyle(0xeef6ff, 0.5);
    g.fillEllipse(40, 26, 60, 30);
    g.fillEllipse(58, 22, 40, 22);
    // Thorax.
    g.fillStyle(dark, 1);
    g.fillEllipse(58, 50, 30, 28);
    // Striped abdomen curving down-left to the stinger.
    g.fillStyle(yellow, 1);
    g.fillEllipse(38, 72, 46, 34);
    g.fillStyle(dark, 1);
    g.fillEllipse(38, 60, 44, 8);
    g.fillEllipse(34, 76, 40, 8);
    g.fillEllipse(30, 90, 30, 8);
    g.fillTriangle(14, 98, 4, 104, 18, 102);
    // Head (right) + eyes + antennae.
    g.fillStyle(dark, 1);
    g.fillCircle(78, 44, 11);
    g.fillStyle(eye, 1);
    g.fillCircle(80, 40, 3);
    g.fillCircle(80, 48, 3);
    g.lineStyle(2.5, dark, 1);
    g.lineBetween(82, 38, 98, 20);
    g.lineBetween(84, 42, 102, 30);
    g._done('boss_hornet', 104, 110);
  }

  // A reddish-brown ant — fast lab-floor ground swarmer (key 'ant'). Drawn facing RIGHT (head on the
  // right) to match the engine convention: enemies flip via setFlipX(velocity.x < 0).
  private _makeAnt(): void {
    const g = this._g();
    const body = 0x7a3b1a;
    const body2 = 0x8a4520;
    const head = 0x5e2f12;
    const leg = 0x32190a;
    // Legs first so the body covers their roots.
    g.lineStyle(2, leg, 1);
    g.lineBetween(21, 15, 26, 25);
    g.lineBetween(18, 16, 19, 26);
    g.lineBetween(16, 15, 11, 25);
    // Abdomen (rear, left) → thorax (mid) → head (front, right).
    g.fillStyle(body, 1);
    g.fillEllipse(9, 12, 18, 14);
    g.fillStyle(body2, 1);
    g.fillEllipse(19, 13, 11, 11);
    g.fillStyle(head, 1);
    g.fillCircle(28, 12, 5);
    // Antennae (forward, up-right).
    g.lineStyle(1.5, leg, 1);
    g.lineBetween(30, 9, 34, 3);
    g.lineBetween(28, 8, 30, 2);
    // Eye + abdomen shine.
    g.fillStyle(0x140a04, 1);
    g.fillCircle(29, 11, 1.4);
    g.fillStyle(0xb56a3a, 0.5);
    g.fillEllipse(11, 9, 7, 4);
    g._done('ant', 34, 28);
  }

  // The Roach King — a giant cockroach boss (key 'boss_roach'). Drawn facing RIGHT (head on the right).
  private _makeRoachBoss(): void {
    const g = this._g();
    const shell = 0x6b4423;
    const shell2 = 0x8a5a2e;
    const pron = 0x4e3018;
    const leg = 0x2a1810;
    const eye = 0x140a06;
    // Six splayed legs.
    g.lineStyle(3, leg, 1);
    g.lineBetween(66, 50, 78, 76);
    g.lineBetween(54, 54, 60, 80);
    g.lineBetween(42, 52, 28, 78);
    g.lineBetween(62, 50, 86, 74);
    g.lineBetween(50, 54, 46, 80);
    g.lineBetween(36, 50, 16, 74);
    // Carapace + center wing-seam.
    g.fillStyle(shell, 1);
    g.fillEllipse(54, 44, 92, 56);
    g.lineStyle(2, pron, 0.6);
    g.lineBetween(12, 44, 72, 44);
    // Pronotum shield over the head (front, right).
    g.fillStyle(pron, 1);
    g.fillEllipse(76, 38, 34, 30);
    // Head + long antennae (forward, up-right).
    g.fillStyle(0x3a2410, 1);
    g.fillCircle(90, 38, 9);
    g.lineStyle(3, leg, 1);
    g.lineBetween(96, 34, 112, 14);
    g.lineBetween(94, 32, 108, 6);
    // Eyes + shell shine.
    g.fillStyle(eye, 1);
    g.fillCircle(93, 33, 2.4);
    g.fillCircle(93, 43, 2.4);
    g.fillStyle(shell2, 0.5);
    g.fillEllipse(48, 34, 40, 16);
    g._done('boss_roach', 112, 86);
  }

  // A faceted gem for noble-gas pickups, drawn in white/greys so it tints to each gas's color.
  private _makeNobleGem(): void {
    const g = this._g();
    const pts = (arr: [number, number][]) => arr.map(([x, y]) => ({ x, y })) as Phaser.Math.Vector2[];
    // Hexagonal gem body
    g.fillStyle(0xededed, 1);
    g.fillPoints(
      pts([
        [13, 1],
        [24, 8],
        [24, 18],
        [13, 25],
        [2, 18],
        [2, 8],
      ]),
      true,
    );
    // Crown facet (top, brightest)
    g.fillStyle(0xffffff, 1);
    g.fillPoints(
      pts([
        [13, 1],
        [24, 8],
        [13, 13],
        [2, 8],
      ]),
      true,
    );
    // Left/right pavilion facets (shaded for depth)
    g.fillStyle(0xbdbdbd, 1);
    g.fillPoints(
      pts([
        [2, 8],
        [13, 13],
        [13, 25],
      ]),
      true,
    );
    g.fillStyle(0xd6d6d6, 1);
    g.fillPoints(
      pts([
        [24, 8],
        [13, 13],
        [13, 25],
      ]),
      true,
    );
    // Sparkle highlight
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(9, 6, 1.6);
    g._done('atom_noble', 26, 26);
  }

  // Graphics helper for the remaining procedural stage maps.
  private _g(): Phaser.GameObjects.Graphics & { _done(key: string, w: number, h: number): void } {
    const g = this.add.graphics() as Phaser.GameObjects.Graphics & { _done(key: string, w: number, h: number): void };
    g._done = (key, w, h) => {
      g.generateTexture(key, w, h);
      g.destroy();
    };
    return g;
  }

  // Player animations are built from the loaded player_0..2 / player_jump frame textures.
  private _makePlayerAnims(): void {
    this.anims.create({
      key: 'player_walk',
      frames: [{ key: 'player_0' }, { key: 'player_1' }, { key: 'player_2' }, { key: 'player_1' }],
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'player_idle',
      frames: [{ key: 'player_0' }],
      frameRate: 1,
      repeat: -1,
    });
    this.anims.create({
      key: 'player_jump',
      frames: [{ key: 'player_jump' }],
      frameRate: 1,
      repeat: -1,
    });
  }

  // Radial vignette overlay — a screen-fixed darkening of the edges for depth/mood.
  private _makeVignette(): void {
    const w = 960;
    const h = 540;
    const tex = this.textures.createCanvas('vignette', w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.42, w / 2, h / 2, h * 0.95);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
  }

  private _makeBackground(): void {
    // === Sector 1 — nutrient agar (muted olive-green) ===
    {
      const g = this._g();
      g.fillStyle(0x7a9050);
      g.fillRect(0, 0, 64, 64);
      // Wet-glass sheen — lighter bands fading down from the surface
      g.fillStyle(0xaabb68, 0.22);
      g.fillRect(0, 0, 64, 14);
      g.fillStyle(0xbbcc78, 0.12);
      g.fillRect(0, 0, 64, 5);
      // Grid (dish markings visible through agar)
      g.lineStyle(1, 0x587038, 0.4);
      g.lineBetween(0, 32, 64, 32);
      g.lineBetween(32, 0, 32, 64);
      // Surface texture — irregular agar patches
      g.fillStyle(0x8a9e58, 0.28);
      g.fillCircle(16, 44, 9);
      g.fillCircle(50, 22, 7);
      g.fillStyle(0x506030, 0.2);
      g.fillCircle(44, 54, 6);
      g._done('ground_tile_1', 64, 64);
    }
    {
      const g = this._g();
      g.fillStyle(0x060c05);
      g.fillRect(0, 0, 64, 64);
      // Grid lines — barely visible in dark medium
      g.lineStyle(1, 0x0c1808, 1.0);
      g.lineBetween(0, 32, 64, 32);
      g.lineBetween(32, 0, 32, 64);
      // Cell debris — faint membrane rings
      g.lineStyle(1, 0x142010, 0.55);
      g.strokeCircle(20, 18, 8);
      g.lineStyle(0.8, 0x0e1a0c, 0.4);
      g.strokeCircle(48, 46, 5);
      g.lineStyle(0.8, 0x142010, 0.35);
      g.strokeCircle(36, 10, 3);
      // Granular spots
      g.fillStyle(0x0c1a0a, 0.5);
      g.fillCircle(10, 42, 2.5);
      g.fillCircle(54, 28, 1.5);
      g.fillCircle(30, 56, 2);
      g._done('bg_tile_1', 64, 64);
    }
    // === Sector 2 — blood agar (muted terracotta) ===
    {
      const g = this._g();
      g.fillStyle(0x986858);
      g.fillRect(0, 0, 64, 64);
      // Wet-glass sheen
      g.fillStyle(0xbb8870, 0.22);
      g.fillRect(0, 0, 64, 14);
      g.fillStyle(0xcc9980, 0.12);
      g.fillRect(0, 0, 64, 5);
      // Grid
      g.lineStyle(1, 0x785040, 0.4);
      g.lineBetween(0, 32, 64, 32);
      g.lineBetween(32, 0, 32, 64);
      // Surface texture
      g.fillStyle(0xaa7868, 0.28);
      g.fillCircle(16, 44, 9);
      g.fillCircle(50, 22, 7);
      g.fillStyle(0x663838, 0.2);
      g.fillCircle(44, 54, 6);
      g._done('ground_tile_2', 64, 64);
    }
    {
      const g = this._g();
      g.fillStyle(0x0c0505);
      g.fillRect(0, 0, 64, 64);
      g.lineStyle(1, 0x160808, 1.0);
      g.lineBetween(0, 32, 64, 32);
      g.lineBetween(32, 0, 32, 64);
      g.lineStyle(1, 0x1e0c0a, 0.55);
      g.strokeCircle(20, 18, 8);
      g.lineStyle(0.8, 0x180a0a, 0.4);
      g.strokeCircle(48, 46, 5);
      g.lineStyle(0.8, 0x1e0c0a, 0.35);
      g.strokeCircle(36, 10, 3);
      g.fillStyle(0x180808, 0.5);
      g.fillCircle(10, 42, 2.5);
      g.fillCircle(54, 28, 1.5);
      g.fillCircle(30, 56, 2);
      g._done('bg_tile_2', 64, 64);
    }
    // === Sector 3 — deep agar (muted slate-purple) ===
    {
      const g = this._g();
      g.fillStyle(0x585080);
      g.fillRect(0, 0, 64, 64);
      // Wet-glass sheen
      g.fillStyle(0x7870a0, 0.22);
      g.fillRect(0, 0, 64, 14);
      g.fillStyle(0x8880b0, 0.12);
      g.fillRect(0, 0, 64, 5);
      // Grid
      g.lineStyle(1, 0x403860, 0.4);
      g.lineBetween(0, 32, 64, 32);
      g.lineBetween(32, 0, 32, 64);
      // Surface texture
      g.fillStyle(0x686090, 0.28);
      g.fillCircle(16, 44, 9);
      g.fillCircle(50, 22, 7);
      g.fillStyle(0x303050, 0.2);
      g.fillCircle(44, 54, 6);
      g._done('ground_tile_3', 64, 64);
    }
    {
      const g = this._g();
      g.fillStyle(0x05050e);
      g.fillRect(0, 0, 64, 64);
      g.lineStyle(1, 0x0a0a18, 1.0);
      g.lineBetween(0, 32, 64, 32);
      g.lineBetween(32, 0, 32, 64);
      g.lineStyle(1, 0x0e0e22, 0.55);
      g.strokeCircle(20, 18, 8);
      g.lineStyle(0.8, 0x0a0a1e, 0.4);
      g.strokeCircle(48, 46, 5);
      g.lineStyle(0.8, 0x0e0e22, 0.35);
      g.strokeCircle(36, 10, 3);
      g.fillStyle(0x080818, 0.5);
      g.fillCircle(10, 42, 2.5);
      g.fillCircle(54, 28, 1.5);
      g.fillCircle(30, 56, 2);
      g._done('bg_tile_3', 64, 64);
    }
    // === Sector 4 — lab floor (grey-blue linoleum tile + grout seams) ===
    {
      const g = this._g();
      g.fillStyle(0x9aa4ac);
      g.fillRect(0, 0, 64, 64);
      // Wet-glass / polished sheen
      g.fillStyle(0xc2ccd2, 0.18);
      g.fillRect(0, 0, 64, 14);
      g.fillStyle(0xd2dce2, 0.1);
      g.fillRect(0, 0, 64, 5);
      // Tile grout seams (thicker cross than the agar grids)
      g.lineStyle(2, 0x6b7680, 0.55);
      g.lineBetween(0, 32, 64, 32);
      g.lineBetween(32, 0, 32, 64);
      // Flecks in the flooring
      g.fillStyle(0x808a92, 0.3);
      g.fillCircle(16, 46, 2.2);
      g.fillCircle(48, 20, 1.6);
      g.fillStyle(0xb0bac0, 0.25);
      g.fillCircle(44, 52, 2);
      g._done('ground_tile_4', 64, 64);
    }
    {
      const g = this._g();
      g.fillStyle(0x070a0e);
      g.fillRect(0, 0, 64, 64);
      g.lineStyle(1, 0x0e151c, 1.0);
      g.lineBetween(0, 32, 64, 32);
      g.lineBetween(32, 0, 32, 64);
      g.lineStyle(1, 0x18222c, 0.5);
      g.strokeCircle(20, 18, 8);
      g.lineStyle(0.8, 0x121b22, 0.4);
      g.strokeCircle(48, 46, 5);
      g.fillStyle(0x121a22, 0.5);
      g.fillCircle(10, 42, 2.5);
      g.fillCircle(54, 28, 1.5);
      g.fillCircle(30, 56, 2);
      g._done('bg_tile_4', 64, 64);
    }
  }
}
