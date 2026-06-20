import Phaser from 'phaser';
import {
  type Difficulty,
  GAME_HEIGHT,
  GAME_WIDTH,
  isFinaleStage,
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

// ── Test-tube rack geometry ────────────────────────────────────────────────────
// The nine stages are nine test tubes in a rack, grouped three-per-sector. Tube x is derived
// from the sector (group) and the substage (position within the group); see `_tubeX`.
const TUBE_PITCH = 70; // center-to-center within a sector group
const GROUP_GAP = 56; // extra space between sector groups
const FIRST_X = 214; // x of the first tube (sector 1, stage 1), centers the rack at GAME_WIDTH/2
const TUBE_W = 40; // outer glass width
const TUBE_TOP = 150; // y of the glass mouth
const TUBE_H = 214; // glass height (bottom at TUBE_TOP + TUBE_H)

const FILL_LOCKED = 0.24;
const FILL_OPEN = 0.66;
const FILL_SELECTED = 0.74;

const SECTOR_COLOR: Record<SectorId, number> = {
  1: 0x66cc55,
  2: 0xdd5544,
  3: 0x6688ee,
};

export default class StageSelectScene extends Phaser.Scene {
  private difficulty: Difficulty = 'normal';
  private unlocked = 1;
  private cursor = 0; // 0..STAGE_COUNT-1  (stage = cursor + 1)
  private tubes: Phaser.GameObjects.Graphics[] = [];
  private reacting = false;

  // Detail panel (info for the currently-highlighted tube).
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

  // Passcode entry modal state. While `entering` is true the card navigation is frozen and
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
    this.reacting = false;
    // The scene instance is reused across restarts — clear any stale modal state.
    this.entering = false;
    this.overlay = null;
    this.digitsText = null;
    this.statusText = null;
    // Start the cursor on the furthest unlocked stage so you resume where you left off.
    this.cursor = Phaser.Math.Clamp(this.unlocked - 1, 0, STAGE_COUNT - 1);

    const cx = GAME_WIDTH / 2;
    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x060e06).setScrollFactor(0);

    this.add
      .text(cx, 36, 'SELECT STAGE', { fontSize: '26px', color: '#88cc88', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, 64, `Difficulty: ${this.difficulty.toUpperCase()}`, {
        fontSize: '13px',
        color: '#669966',
        fontFamily: MONO,
      })
      .setOrigin(0.5);

    // The wooden rack rail the tubes slot into.
    const railY = TUBE_TOP + TUBE_H - 26;
    const rail = this.add.graphics();
    rail.fillStyle(0x2a1c10, 1);
    rail.fillRoundedRect(FIRST_X - 44, railY, GAME_WIDTH - 2 * (FIRST_X - 44), 30, 6);
    rail.fillStyle(0x3c2a18, 1);
    rail.fillRoundedRect(FIRST_X - 44, railY, GAME_WIDTH - 2 * (FIRST_X - 44), 8, 4);

    // Sector group headers, centered over each trio of tubes.
    for (let s = 0; s < 3; s++) {
      const sector = (s + 1) as SectorId;
      const midX = this._tubeX(s * 3 + 2); // middle tube of the group
      this.add
        .text(midX, 108, SECTORS[sector].name, {
          fontSize: '14px',
          color: `#${SECTOR_COLOR[sector].toString(16).padStart(6, '0')}`,
          fontFamily: MONO,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
    }

    // Build the nine tubes.
    for (let stage = 1; stage <= STAGE_COUNT; stage++) {
      this._buildTube(stage);
    }

    // Detail panel below the rack.
    const panelY = 408;
    const panel = this.add.graphics();
    panel.fillStyle(0x0c160c, 0.9);
    panel.fillRoundedRect(cx - 320, panelY, 640, 70, 8);
    panel.lineStyle(1, 0x335533, 0.8);
    panel.strokeRoundedRect(cx - 320, panelY, 640, 70, 8);
    this.detailTitle = this.add
      .text(cx, panelY + 16, '', { fontSize: '16px', color: '#cfe6cf', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.detailName = this.add
      .text(cx, panelY + 38, '', { fontSize: '13px', color: '#9fc89f', fontFamily: MONO })
      .setOrigin(0.5);
    this.detailMeta = this.add
      .text(cx, panelY + 56, '', { fontSize: '12px', color: '#7f9a7f', fontFamily: MONO })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        GAME_HEIGHT - 22,
        Settings.touchActive()
          ? 'Tap a tube, tap again to play    ·    use the on-screen buttons'
          : '← → ↑ ↓ navigate   Z/Enter play   P code   L leaderboard   ESC back',
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
      .setOrigin(0, 0.5);
    attachTap(
      back,
      () => !this.reacting && this.scene.start('DifficultyScene'),
      () => back.setColor('#ccffcc'),
    );
    back.on('pointerout', () => back.setColor('#88bb88'));

    const board = this.add
      .text(GAME_WIDTH - 20, 30, 'LEADERBOARD ›', { fontSize: '15px', color: '#88bb88', fontFamily: MONO })
      .setOrigin(1, 0.5);
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
      .setOrigin(1, 0.5);
    attachTap(
      code,
      () => this._openCodeEntry(),
      () => code.setColor('#ccffcc'),
    );
    code.on('pointerout', () => code.setColor('#88bb88'));

    this._refresh();

    // Idle effervescence: a slow stream of bubbles in the currently-highlighted (unlocked) tube
    // makes the selection feel alive without committing to it.
    this.time.addEvent({
      delay: 320,
      loop: true,
      callback: () => {
        if (this.reacting || this.entering) return;
        const stage = this.cursor + 1;
        if (stage > this.unlocked) return;
        this._spawnBubble(stage, SECTOR_COLOR[sectorOf(stage)], FILL_SELECTED);
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

  /** x of a tube's center for the given stage (1-based). */
  private _tubeX(stage: number): number {
    const group = sectorOf(stage) - 1; // 0..2
    const sub = (stage - 1) % 3; // 0..2
    return FIRST_X + group * (2 * TUBE_PITCH + GROUP_GAP) + sub * TUBE_PITCH;
  }

  private _buildTube(stage: number): void {
    const x = this._tubeX(stage);
    const g = this.add.graphics();
    this.tubes.push(g); // index = stage - 1

    // Stage number etched above the mouth.
    const accent = SECTOR_COLOR[sectorOf(stage)];
    const locked = stage > this.unlocked;
    this.add
      .text(x, TUBE_TOP - 18, `${stage}${isFinaleStage(stage) ? '☣' : ''}`, {
        fontSize: '13px',
        color: locked ? '#556055' : `#${accent.toString(16).padStart(6, '0')}`,
        fontFamily: MONO,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Touch: a hit zone over the whole tube. Tap to highlight; tap the highlighted tube to play.
    const zone = this.add.rectangle(x, TUBE_TOP + TUBE_H / 2, TUBE_W + 18, TUBE_H + 24, 0x000000, 0).setOrigin(0.5);
    attachTap(zone, () => {
      if (this.reacting) return;
      if (this.cursor === stage - 1) this._confirm();
      else {
        this.cursor = stage - 1;
        this._refresh();
      }
    });
  }

  /** Draw a single tube. `fill`/`color` override the resting state during the reaction animation. */
  private _drawStage(stage: number, fill?: number, color?: number, jitter = 0): void {
    const g = this.tubes[stage - 1];
    g.clear();

    const baseX = this._tubeX(stage);
    const x = baseX + (jitter ? Phaser.Math.Between(-jitter, jitter) : 0);
    const selected = stage - 1 === this.cursor;
    const locked = stage > this.unlocked;
    const accent = SECTOR_COLOR[sectorOf(stage)];

    const left = x - TUBE_W / 2;
    const r = TUBE_W / 2;
    const fill01 = Phaser.Math.Clamp(fill ?? (locked ? FILL_LOCKED : selected ? FILL_SELECTED : FILL_OPEN), 0, 1);
    const liquidColor = color ?? (locked ? 0x2f3a33 : accent);

    // Selection halo behind the glass.
    if (selected && !locked) {
      g.lineStyle(4, accent, 0.28);
      g.strokeRoundedRect(left - 4, TUBE_TOP - 4, TUBE_W + 8, TUBE_H + 8, { tl: 8, tr: 8, bl: r + 4, br: r + 4 });
    }

    // Liquid.
    const fillH = Math.max(fill01 * TUBE_H, r + 2);
    const liquidTop = TUBE_TOP + TUBE_H - fillH;
    const lx = left + 3;
    const lw = TUBE_W - 6;
    const lr = lw / 2;
    g.fillStyle(liquidColor, locked ? 0.5 : 0.85);
    g.fillRoundedRect(lx, liquidTop, lw, fillH, { tl: 3, tr: 3, bl: lr, br: lr });
    // Brighter meniscus band at the surface.
    g.fillStyle(this._lerpColor(liquidColor, 0xffffff, 0.45), locked ? 0.4 : 0.8);
    g.fillEllipse(x, liquidTop, lw, 7);

    // Glass body + mouth.
    g.lineStyle(2, locked ? 0x4a5a4a : 0x9fd0c8, 0.85);
    g.strokeRoundedRect(left, TUBE_TOP, TUBE_W, TUBE_H, { tl: 5, tr: 5, bl: r, br: r });
    g.lineStyle(2, locked ? 0x4a5a4a : 0xbfe6df, 0.9);
    g.strokeRoundedRect(x - (TUBE_W + 10) / 2, TUBE_TOP - 6, TUBE_W + 10, 9, 3);
    // Vertical shine streak.
    g.fillStyle(0xffffff, 0.1);
    g.fillRoundedRect(left + 6, TUBE_TOP + 12, 5, TUBE_H - 48, 3);
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

  /** A single rising, fading bubble inside a tube's liquid. */
  private _spawnBubble(stage: number, color: number, fill: number): void {
    const x = this._tubeX(stage);
    const lr = (TUBE_W - 6) / 2;
    const bx = x + Phaser.Math.Between(-lr + 4, lr - 4);
    const surfaceY = TUBE_TOP + TUBE_H - fill * TUBE_H;
    const startY = TUBE_TOP + TUBE_H - 16;
    const b = this.add
      .circle(bx, startY, Phaser.Math.Between(2, 4), this._lerpColor(color, 0xffffff, 0.5), 0.8)
      .setDepth(50);
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
    if (Phaser.Input.Keyboard.JustDown(this.upKey)) this._move(-3);
    if (Phaser.Input.Keyboard.JustDown(this.downKey)) this._move(3);
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
    this.cursor = Phaser.Math.Clamp(this.cursor + delta, 0, STAGE_COUNT - 1);
    this._refresh();
  }

  private _refresh(): void {
    for (let stage = 1; stage <= STAGE_COUNT; stage++) this._drawStage(stage);
    this._refreshDetail();
  }

  private _refreshDetail(): void {
    const stage = this.cursor + 1;
    const def = STAGES[stage - 1];
    const locked = stage > this.unlocked;
    const accent = SECTOR_COLOR[sectorOf(stage)];

    this.detailTitle.setText(`STAGE ${stage}${isFinaleStage(stage) ? '   ☣ BOSS' : ''}`);
    this.detailTitle.setColor(locked ? '#778877' : `#${accent.toString(16).padStart(6, '0')}`);
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
    if (this.reacting) return;
    const stage = this.cursor + 1;
    if (stage > this.unlocked) {
      // Locked — quick red flash on the tube to signal it's not available yet.
      const g = this.tubes[stage - 1];
      const x = this._tubeX(stage);
      g.lineStyle(2, 0xff4444, 0.9);
      g.strokeRoundedRect(x - TUBE_W / 2, TUBE_TOP, TUBE_W, TUBE_H, { tl: 5, tr: 5, bl: TUBE_W / 2, br: TUBE_W / 2 });
      this.cameras.main.shake(120, 0.004);
      return;
    }
    this._react(stage);
  }

  /** The chemical-reaction flourish that plays when a stage is chosen, then launches it. */
  private _react(stage: number): void {
    this.reacting = true;
    const accent = SECTOR_COLOR[sectorOf(stage)];
    const x = this._tubeX(stage);

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
      callback: () => this._spawnBubble(stage, this._lerpColor(accent, 0xffffff, 0.3), 0.95),
    });

    // The liquid surges up the glass, heating from its sector color toward an incandescent flash.
    const state = { v: 0 };
    this.tweens.add({
      targets: state,
      v: 1,
      duration: 650,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        const fill = FILL_SELECTED + state.v * (1 - FILL_SELECTED);
        const color = this._lerpColor(accent, 0xfff2c0, state.v);
        this._drawStage(stage, fill, color, state.v > 0.5 ? Math.round(state.v * 3) : 0);
      },
      onComplete: () => {
        fizz.remove();
        this._erupt(stage, x, accent);
      },
    });
  }

  /** Eruption: foam and droplets burst from the tube mouth, the screen flashes, then GameScene loads. */
  private _erupt(stage: number, x: number, accent: number): void {
    const flash = this._lerpColor(accent, 0xffffff, 0.5);
    const fc = Phaser.Display.Color.ValueToColor(flash);
    this.cameras.main.flash(260, fc.red, fc.green, fc.blue);
    this.cameras.main.shake(280, 0.006);

    // Expanding foam ring at the mouth.
    const ring = this.add.circle(x, TUBE_TOP, 6, 0xffffff, 0.5).setDepth(60);
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
          x + Phaser.Math.Between(-8, 8),
          TUBE_TOP,
          Phaser.Math.Between(3, 7),
          this._lerpColor(accent, 0xffffff, 0.4),
          0.95,
        )
        .setDepth(60);
      this.tweens.add({
        targets: d,
        x: x + Phaser.Math.Between(-140, 140),
        y: TUBE_TOP - Phaser.Math.Between(70, 210),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(500, 900),
        ease: 'Quad.easeOut',
        onComplete: () => d.destroy(),
      });
    }

    this.registry.set('runScore', 0); // a freshly selected stage begins a new run
    this.time.delayedCall(520, () => this.scene.start('GameScene', { stage, difficulty: this.difficulty }));
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
