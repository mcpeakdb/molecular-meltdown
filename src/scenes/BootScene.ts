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
    this.scene.start('TitleScene');
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
  }
}
