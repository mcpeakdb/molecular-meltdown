import Phaser from 'phaser';
import {
  type Difficulty,
  GAME_HEIGHT,
  GAME_WIDTH,
  isFinaleStage,
  RUN_LIVES,
  SECTORS,
  type SectorId,
  STAGE_COUNT,
  sectorOf,
} from '../constants';
import { STAGES } from '../stages';
import MusicSystem from '../systems/MusicSystem';
import { passcodeFor, resolvePasscode } from '../systems/Passcode';
import SaveSystem from '../systems/SaveSystem';
import Settings from '../systems/Settings';
import SoundSystem from '../systems/SoundSystem';
import { attachTap } from '../systems/touchMenu';

const MONO = 'monospace';

// ── Coverflow test-tube rack geometry ──────────────────────────────────────────
// Stages are test tubes in a single rotating rack. The selected tube sits large and upright in the
// centre; its neighbours shrink, squash and fade toward the screen edges (a coverflow carousel).
// Rotating the rack (← →, or the sector hop ↑ ↓) animates `railPos` toward `cursor`, sliding the
// next tube to centre and bringing others in from the sides.
const CX = GAME_WIDTH / 2;
const RAIL_Y = 344; // y of every tube's rounded base — where it seats into the rack rail
const TUBE_W = 44; // outer glass width at centre (scale 1)
const TUBE_H = 156; // glass height at centre (scale 1)
const NEAR_GAP = 174; // centre→first-neighbour spacing
const FAR_GAP = 98; // spacing added per step beyond the first neighbour (outer tubes bunch up)
const BANNER_Y = 108; // sector banner baseline, above the rack
const SECTOR_HOP = 3; // ↑ ↓ jump one sector (three stages)

const FILL_LOCKED = 0.24;
const FILL_OPEN = 0.66;
const FILL_SELECTED = 0.74;

const SECTOR_COLOR: Record<SectorId, number> = {
  1: 0x66cc55,
  2: 0xdd5544,
  3: 0x6688ee,
  4: 0x33ccbb,
  5: 0xe0a52a,
  6: 0xcc4422,
};

/** Screen placement of a tube whose signed distance from the rack centre is `offset`. */
interface Slot {
  x: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  depth: number;
}

export default class StageSelectScene extends Phaser.Scene {
  private difficulty: Difficulty = 'normal';
  private unlocked = 1;
  private cursor = 0; // 0..STAGE_COUNT-1  (stage = cursor + 1)
  private railPos = 0; // animated centre of the rack (eases toward `cursor`)
  private spinTween: Phaser.Tweens.Tween | null = null;
  private tubes: Phaser.GameObjects.Container[] = []; // index = stage - 1
  private tubeGfx: Phaser.GameObjects.Graphics[] = [];
  private tubeNums: Phaser.GameObjects.Text[] = [];
  private reacting = false;

  // Sector banner + detail panel (info for the currently-centred tube).
  private banner!: Phaser.GameObjects.Text;
  private detailTitle!: Phaser.GameObjects.Text;
  private detailName!: Phaser.GameObjects.Text;
  private detailMeta!: Phaser.GameObjects.Text;

  private leftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;
  private confirmKey2!: Phaser.Input.Keyboard.Key;
  private backKey!: Phaser.Input.Keyboard.Key;
  private boardKey!: Phaser.Input.Keyboard.Key;
  private codeKey!: Phaser.Input.Keyboard.Key;

  // Passcode entry modal state. While `entering` is true the rack navigation is frozen and
  // keystrokes are routed to the code buffer instead.
  private entering = false;
  private codeBuf = '';
  private overlay: Phaser.GameObjects.Container | null = null;
  private digitsText: Phaser.GameObjects.Text | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('StageSelectScene');
  }

  create(): void {
    // Restore the menu theme (e.g. when returning here from a run via the pause menu).
    MusicSystem.setTrack((this.sound as Phaser.Sound.WebAudioSoundManager).context, 'title');

    this.difficulty = (this.registry.get('difficulty') as Difficulty | undefined) ?? 'normal';
    this.unlocked = SaveSystem.getUnlockedStage(this.difficulty);
    this.tubes = [];
    this.tubeGfx = [];
    this.tubeNums = [];
    this.reacting = false;
    this.spinTween = null;
    // The scene instance is reused across restarts — clear any stale modal state.
    this.entering = false;
    this.overlay = null;
    this.digitsText = null;
    this.statusText = null;
    // Start the cursor on the furthest unlocked stage so you resume where you left off.
    this.cursor = Phaser.Math.Clamp(this.unlocked - 1, 0, STAGE_COUNT - 1);
    this.railPos = this.cursor;

    this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x060e06).setScrollFactor(0);

    this.add
      .text(CX, 30, 'SELECT STAGE', { fontSize: '26px', color: '#88cc88', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(CX, 56, `Difficulty: ${this.difficulty.toUpperCase()}`, {
        fontSize: '13px',
        color: '#669966',
        fontFamily: MONO,
      })
      .setOrigin(0.5);

    // Sector banner (updates to the centred tube's sector as the rack turns).
    this.banner = this.add
      .text(CX, BANNER_Y, '', { fontSize: '16px', color: '#88cc88', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(120);

    // The wooden rack rail the tube bases seat into.
    const rail = this.add.graphics().setDepth(5);
    const railL = 60;
    const railW = GAME_WIDTH - 120;
    rail.fillStyle(0x2a1c10, 1);
    rail.fillRoundedRect(railL, RAIL_Y - 8, railW, 30, 7);
    rail.fillStyle(0x3c2a18, 1);
    rail.fillRoundedRect(railL, RAIL_Y - 8, railW, 8, 4);

    // Faint rotation chevrons at the rack edges.
    for (const [x, ch] of [
      [30, '‹'],
      [GAME_WIDTH - 30, '›'],
    ] as const) {
      const chev = this.add
        .text(x, RAIL_Y - TUBE_H / 2, ch, { fontSize: '40px', color: '#3a5a3a', fontFamily: MONO })
        .setOrigin(0.5)
        .setDepth(4);
      this.tweens.add({ targets: chev, alpha: { from: 0.35, to: 0.85 }, duration: 900, yoyo: true, repeat: -1 });
    }

    // Build the tubes.
    for (let stage = 1; stage <= STAGE_COUNT; stage++) this._buildTube(stage);

    // Detail panel below the rack.
    const panelY = 384;
    const panel = this.add.graphics().setDepth(40);
    panel.fillStyle(0x0c160c, 0.92);
    panel.fillRoundedRect(CX - 320, panelY, 640, 58, 8);
    panel.lineStyle(1, 0x335533, 0.8);
    panel.strokeRoundedRect(CX - 320, panelY, 640, 58, 8);
    this.detailTitle = this.add
      .text(CX, panelY + 13, '', { fontSize: '16px', color: '#cfe6cf', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(41);
    this.detailName = this.add
      .text(CX, panelY + 33, '', { fontSize: '13px', color: '#9fc89f', fontFamily: MONO })
      .setOrigin(0.5)
      .setDepth(41);
    this.detailMeta = this.add
      .text(CX, panelY + 49, '', { fontSize: '12px', color: '#7f9a7f', fontFamily: MONO })
      .setOrigin(0.5)
      .setDepth(41);

    this.add
      .text(
        CX,
        GAME_HEIGHT - 22,
        Settings.touchActive()
          ? 'Tap a tube to rotate to it, tap the centre tube to play'
          : '← → rotate rack   ↑ ↓ jump sector   Z/Enter play   P code   L leaderboard   ESC back',
        {
          fontSize: '13px',
          color: '#668866',
          fontFamily: MONO,
        },
      )
      .setOrigin(0.5);

    // Tappable corner buttons (mirror the ESC / L keyboard shortcuts) for touch.
    const back = this.add
      .text(20, 30, '‹ BACK', { fontSize: '15px', color: '#88bb88', fontFamily: MONO })
      .setOrigin(0, 0.5)
      .setDepth(50);
    attachTap(
      back,
      () => !this.reacting && this.scene.start('DifficultyScene'),
      () => back.setColor('#ccffcc'),
    );
    back.on('pointerout', () => back.setColor('#88bb88'));

    const board = this.add
      .text(GAME_WIDTH - 20, 30, 'LEADERBOARD ›', { fontSize: '15px', color: '#88bb88', fontFamily: MONO })
      .setOrigin(1, 0.5)
      .setDepth(50);
    attachTap(
      board,
      () =>
        !this.reacting &&
        this.scene.start('LeaderboardScene', { from: 'StageSelectScene', difficulty: this.difficulty }),
      () => board.setColor('#ccffcc'),
    );
    board.on('pointerout', () => board.setColor('#88bb88'));

    // Tappable passcode entry (mirrors the P shortcut).
    const code = this.add
      .text(GAME_WIDTH - 20, GAME_HEIGHT - 52, '⌨ ENTER CODE', { fontSize: '15px', color: '#88bb88', fontFamily: MONO })
      .setOrigin(1, 0.5)
      .setDepth(50);
    attachTap(
      code,
      () => this._openCodeEntry(),
      () => code.setColor('#ccffcc'),
    );
    code.on('pointerout', () => code.setColor('#88bb88'));

    this._refresh();

    // Idle effervescence: a slow stream of bubbles in the centred (unlocked) tube makes the
    // selection feel alive without committing to it.
    this.time.addEvent({
      delay: 320,
      loop: true,
      callback: () => {
        if (this.reacting || this.entering) return;
        const stage = this.cursor + 1;
        if (stage > this.unlocked) return;
        this._spawnBubble(SECTOR_COLOR[sectorOf(stage)], FILL_SELECTED);
      },
    });

    // biome-ignore lint/style/noNonNullAssertion: keyboard always present
    const kb = this.input.keyboard!;
    this.leftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.upKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.confirmKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.confirmKey2 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.backKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.boardKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.codeKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.P);
  }

  // ── Rack layout ────────────────────────────────────────────────────────────

  /** Screen placement for a tube at signed distance `offset` from the rack centre. */
  private _slot(offset: number): Slot {
    const a = Math.abs(offset);
    const dir = Math.sign(offset);
    // x: linear near the centre, compressing beyond the first neighbour so outer tubes bunch.
    const x = CX + dir * (a <= 1 ? a * NEAR_GAP : NEAR_GAP + (a - 1) * FAR_GAP);
    const scale = Math.max(0.34, 1 - 0.3 * a); // shrink with distance
    const squash = Math.max(0.42, 1 - 0.34 * Math.min(a, 2)); // horizontal turn-away
    // Fully visible out to two tubes each side, fading over the third, culled beyond.
    const alpha = a >= 3 ? 0 : a > 2 ? 3 - a : 1;
    const depth = 100 - Math.round(a * 6); // centre sits on top
    return { x, scaleX: scale * squash, scaleY: scale, alpha, depth };
  }

  /** Position/scale/fade every tube for the current `railPos`. */
  private _layout(): void {
    for (let stage = 1; stage <= STAGE_COUNT; stage++) {
      const c = this.tubes[stage - 1];
      const s = this._slot(stage - 1 - this.railPos);
      c.setPosition(s.x, RAIL_Y);
      c.setScale(s.scaleX, s.scaleY);
      c.setAlpha(s.alpha);
      c.setDepth(s.depth);
      c.setVisible(s.alpha > 0.01);
    }
  }

  private _buildTube(stage: number): void {
    const container = this.add.container(0, RAIL_Y);
    const g = this.add.graphics();
    // Stage number etched above the mouth (local coords: base at y=0, mouth at y=-TUBE_H).
    const num = this.add
      .text(0, -TUBE_H - 14, `${stage}${isFinaleStage(stage) ? '☣' : ''}`, {
        fontSize: '15px',
        fontFamily: MONO,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    // Full-tube hit zone. Tap to rotate to it; tap the centred tube to play.
    const zone = this.add.rectangle(0, -TUBE_H / 2, TUBE_W + 18, TUBE_H + 28, 0x000000, 0);
    attachTap(zone, () => {
      if (this.reacting || this.entering) return;
      if (this.cursor === stage - 1) this._confirm();
      else this._moveTo(stage - 1);
    });
    container.add([g, num, zone]);
    this.tubes.push(container); // index = stage - 1
    this.tubeGfx.push(g);
    this.tubeNums.push(num);
  }

  /** Draw one tube in local coords (base origin). Overrides drive the reaction animation. */
  private _drawTube(stage: number, fill?: number, color?: number, jitter = 0): void {
    const g = this.tubeGfx[stage - 1];
    g.clear();

    const jx = jitter ? Phaser.Math.Between(-jitter, jitter) : 0;
    const centered = Math.round(this.railPos) === stage - 1;
    const locked = stage > this.unlocked;
    const accent = SECTOR_COLOR[sectorOf(stage)];

    const left = -TUBE_W / 2 + jx;
    const r = TUBE_W / 2;
    const fill01 = Phaser.Math.Clamp(fill ?? (locked ? FILL_LOCKED : centered ? FILL_SELECTED : FILL_OPEN), 0, 1);
    const liquidColor = color ?? (locked ? 0x2f3a33 : accent);

    // Number tint: bright accent when centred, dim accent otherwise, grey when locked.
    this.tubeNums[stage - 1].setColor(
      locked
        ? '#556055'
        : `#${(centered ? this._lerpColor(accent, 0xffffff, 0.4) : accent).toString(16).padStart(6, '0')}`,
    );

    // Selection halo behind the glass.
    if (centered && !locked) {
      g.lineStyle(4, accent, 0.3);
      g.strokeRoundedRect(left - 4, -TUBE_H - 4, TUBE_W + 8, TUBE_H + 8, { tl: 8, tr: 8, bl: r + 4, br: r + 4 });
    }

    // Liquid (rises from the base at y=0 up to y=-fillH).
    const fillH = Math.max(fill01 * TUBE_H, r + 2);
    const lx = left + 3;
    const lw = TUBE_W - 6;
    const lr = lw / 2;
    g.fillStyle(liquidColor, locked ? 0.5 : 0.85);
    g.fillRoundedRect(lx, -fillH, lw, fillH, { tl: 3, tr: 3, bl: lr, br: lr });
    // Brighter meniscus band at the surface.
    g.fillStyle(this._lerpColor(liquidColor, 0xffffff, 0.45), locked ? 0.4 : 0.8);
    g.fillEllipse(jx, -fillH, lw, 7);

    // Glass body + mouth.
    g.lineStyle(2, locked ? 0x4a5a4a : 0x9fd0c8, 0.85);
    g.strokeRoundedRect(left, -TUBE_H, TUBE_W, TUBE_H, { tl: 5, tr: 5, bl: r, br: r });
    g.lineStyle(2, locked ? 0x4a5a4a : 0xbfe6df, 0.9);
    g.strokeRoundedRect(jx - (TUBE_W + 10) / 2, -TUBE_H - 6, TUBE_W + 10, 9, 3);
    // Vertical shine streak.
    g.fillStyle(0xffffff, 0.1);
    g.fillRoundedRect(left + 6, -TUBE_H + 12, 5, TUBE_H - 48, 3);
  }

  private _lerpColor(a: number, b: number, t: number): number {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(a),
      Phaser.Display.Color.ValueToColor(b),
      100,
      Phaser.Math.Clamp(t, 0, 1) * 100,
    );
    return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
  }

  /** A single rising, fading bubble inside the centred tube's liquid (screen coords). */
  private _spawnBubble(color: number, fill: number): void {
    const lr = (TUBE_W - 6) / 2;
    const bx = CX + Phaser.Math.Between(-lr + 4, lr - 4);
    const surfaceY = RAIL_Y - fill * TUBE_H;
    const startY = RAIL_Y - 16;
    const b = this.add
      .circle(bx, startY, Phaser.Math.Between(2, 4), this._lerpColor(color, 0xffffff, 0.5), 0.8)
      .setDepth(150);
    this.tweens.add({
      targets: b,
      y: surfaceY + Phaser.Math.Between(-4, 4),
      alpha: 0,
      duration: Phaser.Math.Between(700, 1200),
      ease: 'Sine.easeIn',
      onComplete: () => b.destroy(),
    });
  }

  update(): void {
    // While the passcode modal is open or a reaction is playing, navigation is frozen.
    if (this.entering || this.reacting) return;
    if (Phaser.Input.Keyboard.JustDown(this.leftKey)) this._move(-1);
    if (Phaser.Input.Keyboard.JustDown(this.rightKey)) this._move(1);
    if (Phaser.Input.Keyboard.JustDown(this.upKey)) this._move(-SECTOR_HOP);
    if (Phaser.Input.Keyboard.JustDown(this.downKey)) this._move(SECTOR_HOP);
    if (Phaser.Input.Keyboard.JustDown(this.confirmKey) || Phaser.Input.Keyboard.JustDown(this.confirmKey2)) {
      this._confirm();
    }
    if (Phaser.Input.Keyboard.JustDown(this.backKey)) this.scene.start('DifficultyScene');
    if (Phaser.Input.Keyboard.JustDown(this.boardKey)) {
      this.scene.start('LeaderboardScene', { from: 'StageSelectScene', difficulty: this.difficulty });
    }
    if (Phaser.Input.Keyboard.JustDown(this.codeKey)) this._openCodeEntry();
  }

  private _move(delta: number): void {
    this._moveTo(this.cursor + delta);
  }

  /** Rotate the rack so `index` (clamped) becomes the centred tube. */
  private _moveTo(index: number): void {
    const target = Phaser.Math.Clamp(index, 0, STAGE_COUNT - 1);
    if (target === this.cursor && !this.spinTween) return;
    this.cursor = target;
    this._refreshDetail(); // detail reflects the destination immediately

    try {
      const ctx = (this.sound as Phaser.Sound.WebAudioSoundManager).context;
      SoundSystem.play(ctx, 'bounce');
    } catch {
      // No audio context — the rack still turns.
    }

    this.spinTween?.stop();
    this.spinTween = this.tweens.add({
      targets: this,
      railPos: this.cursor,
      duration: 260,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        this._drawAll();
        this._layout();
      },
      onComplete: () => {
        this.spinTween = null;
        this._drawAll();
        this._layout();
      },
    });
  }

  private _drawAll(): void {
    for (let stage = 1; stage <= STAGE_COUNT; stage++) this._drawTube(stage);
  }

  private _refresh(): void {
    this.railPos = this.cursor;
    this._drawAll();
    this._layout();
    this._refreshDetail();
  }

  private _refreshDetail(): void {
    const stage = this.cursor + 1;
    const def = STAGES[stage - 1];
    const locked = stage > this.unlocked;
    const sector = sectorOf(stage);
    const accent = SECTOR_COLOR[sector];
    const accentHex = `#${accent.toString(16).padStart(6, '0')}`;

    this.banner.setText(`SECTOR ${sector} · ${SECTORS[sector].name}`);
    this.banner.setColor(locked ? '#667066' : accentHex);

    this.detailTitle.setText(`STAGE ${stage}${isFinaleStage(stage) ? '   ☣ BOSS' : ''}`);
    this.detailTitle.setColor(locked ? '#778877' : accentHex);
    this.detailName.setText(locked ? '🔒 LOCKED — clear the previous stage to unlock' : def.name);
    this.detailName.setColor(locked ? '#667066' : '#cfe6cf');

    if (locked) {
      this.detailMeta.setText('');
    } else {
      const best = SaveSystem.getBestScore(this.difficulty, stage);
      const bestStr = `Best: ${best > 0 ? best.toLocaleString() : '—'}`;
      const codeStr = stage > 1 ? `     Code ${passcodeFor(stage, this.difficulty)}` : '';
      this.detailMeta.setText(bestStr + codeStr);
    }
  }

  private _confirm(): void {
    if (this.reacting || this.spinTween) return;
    const stage = this.cursor + 1;
    if (stage > this.unlocked) {
      // Locked — quick red flash on the tube to signal it's not available yet.
      const g = this.tubeGfx[stage - 1];
      g.lineStyle(2, 0xff4444, 0.9);
      g.strokeRoundedRect(-TUBE_W / 2, -TUBE_H, TUBE_W, TUBE_H, { tl: 5, tr: 5, bl: TUBE_W / 2, br: TUBE_W / 2 });
      this.cameras.main.shake(120, 0.004);
      return;
    }
    this._react(stage);
  }

  /** The chemical-reaction flourish that plays when a stage is chosen, then launches it. */
  private _react(stage: number): void {
    this.reacting = true;
    const accent = SECTOR_COLOR[sectorOf(stage)];

    try {
      const ctx = (this.sound as Phaser.Sound.WebAudioSoundManager).context;
      SoundSystem.play(ctx, 'reaction');
    } catch {
      // No audio context — the visual reaction still plays.
    }

    // Rapid effervescence as the reaction builds.
    const fizz = this.time.addEvent({
      delay: 40,
      loop: true,
      callback: () => this._spawnBubble(this._lerpColor(accent, 0xffffff, 0.3), 0.95),
    });

    // The liquid surges up the glass, heating from its sector colour toward an incandescent flash.
    const state = { v: 0 };
    this.tweens.add({
      targets: state,
      v: 1,
      duration: 650,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        const fill = FILL_SELECTED + state.v * (1 - FILL_SELECTED);
        const color = this._lerpColor(accent, 0xfff2c0, state.v);
        this._drawTube(stage, fill, color, state.v > 0.5 ? Math.round(state.v * 3) : 0);
      },
      onComplete: () => {
        fizz.remove();
        this._erupt(stage, accent);
      },
    });
  }

  /** Eruption: foam and droplets burst from the tube mouth, the screen flashes, then GameScene loads. */
  private _erupt(_stage: number, accent: number): void {
    const mouthY = RAIL_Y - TUBE_H;
    const flash = this._lerpColor(accent, 0xffffff, 0.5);
    const fc = Phaser.Display.Color.ValueToColor(flash);
    this.cameras.main.flash(260, fc.red, fc.green, fc.blue);
    this.cameras.main.shake(280, 0.006);

    // Expanding foam ring at the mouth.
    const ring = this.add.circle(CX, mouthY, 6, 0xffffff, 0.5).setDepth(200);
    this.tweens.add({
      targets: ring,
      radius: 46,
      alpha: 0,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });

    // Droplets fly up and out of the glass.
    for (let i = 0; i < 26; i++) {
      const d = this.add
        .circle(
          CX + Phaser.Math.Between(-8, 8),
          mouthY,
          Phaser.Math.Between(3, 7),
          this._lerpColor(accent, 0xffffff, 0.4),
          0.95,
        )
        .setDepth(200);
      this.tweens.add({
        targets: d,
        x: CX + Phaser.Math.Between(-140, 140),
        y: mouthY - Phaser.Math.Between(70, 210),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(500, 900),
        ease: 'Quad.easeOut',
        onComplete: () => d.destroy(),
      });
    }

    // A freshly selected stage begins a new run: reset the score, empty the noble-gas collection, and
    // restore a full set of lives.
    this.registry.set('runScore', 0);
    this.registry.set('runNobles', []);
    this.registry.set('lives', RUN_LIVES);
    this.time.delayedCall(520, () => this.scene.start('GameScene', { stage: _stage, difficulty: this.difficulty }));
  }

  // ── Passcode entry modal ──────────────────────────────────────────────────────

  private _openCodeEntry(): void {
    if (this.entering || this.reacting) return;
    this.entering = true;
    this.codeBuf = '';

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const PANEL_W = 300;
    const PANEL_H = 360;

    const container = this.add.container(0, 0).setDepth(100);
    this.overlay = container;

    // Full-screen dimmer; tapping it (outside the panel) cancels.
    const dim = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6);
    attachTap(dim, () => this._closeCodeEntry());
    container.add(dim);

    const panel = this.add.graphics();
    panel.fillStyle(0x0c160c, 0.98);
    panel.fillRoundedRect(cx - PANEL_W / 2, cy - PANEL_H / 2, PANEL_W, PANEL_H, 8);
    panel.lineStyle(2, 0x4a8a4a, 0.9);
    panel.strokeRoundedRect(cx - PANEL_W / 2, cy - PANEL_H / 2, PANEL_W, PANEL_H, 8);
    // Swallow taps on the panel body so they don't fall through to the dimmer's cancel.
    const panelZone = this.add.rectangle(cx, cy, PANEL_W, PANEL_H, 0x000000, 0);
    attachTap(panelZone, () => {});
    container.add([panel, panelZone]);

    const top = cy - PANEL_H / 2;
    container.add(
      this.add
        .text(cx, top + 26, 'ENTER PASSCODE', {
          fontSize: '18px',
          color: '#88cc88',
          fontFamily: MONO,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    container.add(
      this.add
        .text(cx, top + 48, `Difficulty: ${this.difficulty.toUpperCase()}`, {
          fontSize: '12px',
          color: '#669966',
          fontFamily: MONO,
        })
        .setOrigin(0.5),
    );

    this.digitsText = this.add
      .text(cx, top + 84, '', { fontSize: '28px', color: '#cfe6cf', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5);
    container.add(this.digitsText);

    // Numpad: 1-9 grid, then DEL / 0 / OK.
    const keyW = 64;
    const keyH = 44;
    const gap = 10;
    const gridW = keyW * 3 + gap * 2;
    const gx = cx - gridW / 2;
    const gy = top + 116;
    const layout: { label: string; col: number; row: number; onTap: () => void }[] = [];
    for (let i = 1; i <= 9; i++) {
      layout.push({
        label: String(i),
        col: (i - 1) % 3,
        row: Math.floor((i - 1) / 3),
        onTap: () => this._pushDigit(String(i)),
      });
    }
    layout.push({ label: 'DEL', col: 0, row: 3, onTap: () => this._popDigit() });
    layout.push({ label: '0', col: 1, row: 3, onTap: () => this._pushDigit('0') });
    layout.push({ label: 'OK', col: 2, row: 3, onTap: () => this._submitCode() });

    for (const k of layout) {
      const kx = gx + k.col * (keyW + gap) + keyW / 2;
      const ky = gy + k.row * (keyH + gap) + keyH / 2;
      const accent = k.label === 'OK' ? 0x44cc66 : k.label === 'DEL' ? 0xcc6644 : 0x4a8a4a;
      const bg = this.add.rectangle(kx, ky, keyW, keyH, accent, 0.12).setStrokeStyle(1, accent, 0.6);
      const label = this.add
        .text(kx, ky, k.label, { fontSize: '18px', color: '#cfe6cf', fontFamily: MONO })
        .setOrigin(0.5);
      attachTap(bg, k.onTap, () => bg.setFillStyle(accent, 0.28));
      bg.on('pointerout', () => bg.setFillStyle(accent, 0.12));
      container.add([bg, label]);
    }

    this.statusText = this.add
      .text(
        cx,
        cy + PANEL_H / 2 - 26,
        Settings.touchActive()
          ? 'tap the keys · OK to confirm · tap outside to cancel'
          : 'type code · Enter=OK · Esc=cancel',
        {
          fontSize: '11px',
          color: '#668866',
          fontFamily: MONO,
        },
      )
      .setOrigin(0.5);
    container.add(this.statusText);

    this._refreshDigits();

    // biome-ignore lint/style/noNonNullAssertion: keyboard always present
    this.input.keyboard!.on('keydown', this._onCodeKey, this);
  }

  private _onCodeKey = (ev: KeyboardEvent): void => {
    if (!this.entering) return;
    if (ev.key >= '0' && ev.key <= '9') this._pushDigit(ev.key);
    else if (ev.key === 'Backspace') this._popDigit();
    else if (ev.key === 'Enter') this._submitCode();
    else if (ev.key === 'Escape') this._closeCodeEntry();
  };

  private _pushDigit(d: string): void {
    if (this.codeBuf.length >= 6) return;
    this.codeBuf += d;
    this._refreshDigits();
  }

  private _popDigit(): void {
    if (!this.codeBuf) return;
    this.codeBuf = this.codeBuf.slice(0, -1);
    this._refreshDigits();
  }

  private _refreshDigits(): void {
    if (!this.digitsText) return;
    const slots: string[] = [];
    for (let i = 0; i < 6; i++) slots.push(this.codeBuf[i] ?? '_');
    this.digitsText.setText(slots.join(' '));
  }

  private _submitCode(): void {
    const stage = resolvePasscode(this.codeBuf, this.difficulty);
    if (stage === null) {
      this.codeBuf = '';
      this._refreshDigits();
      this.statusText?.setText('INVALID CODE').setColor('#ff6655');
      this.cameras.main.shake(120, 0.004);
      return;
    }
    SaveSystem.unlockUpToStage(this.difficulty, stage);
    this._closeCodeEntry();
    // Rebuild every tube against the new unlock state; create() re-reads the save and
    // snaps the cursor to the furthest unlocked stage.
    this.scene.restart();
  }

  private _closeCodeEntry(): void {
    this.input.keyboard?.off('keydown', this._onCodeKey, this);
    this.overlay?.destroy(true);
    this.overlay = null;
    this.digitsText = null;
    this.statusText = null;
    this.entering = false;
  }
}
