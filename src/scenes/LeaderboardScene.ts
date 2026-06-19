import Phaser from 'phaser';
import { type Difficulty, GAME_HEIGHT, GAME_WIDTH } from '../constants';
import SaveSystem from '../systems/SaveSystem';
import { attachTap } from '../systems/touchMenu';

const MONO = 'monospace';
const DIFFS: Difficulty[] = ['normal', 'hard', 'extreme'];
// Matches the difficulty-select accents (green / amber / red) so the lab look ties together.
const DIFF_COLOR: Record<Difficulty, number> = { normal: 0x44cc66, hard: 0xe0a52a, extreme: 0xcc4422 };

// Rank "medals" — gold / silver / bronze, then the difficulty accent for the rest.
const MEDAL = [0xffd700, 0xc8d2da, 0xcd7f32];

// ── Graduated-cylinder geometry ────────────────────────────────────────────────
const CYL_W = 76;
const CYL_TOP = 158; // glass mouth
const CYL_H = 208; // glass height (bottom at CYL_TOP + CYL_H)
const PITCH = 168; // column spacing
const MIN_FILL = 0.16; // even the lowest score shows a little liquid

const hexS = (col: number): string => `#${col.toString(16).padStart(6, '0')}`;

interface Cyl {
  x: number;
  fill: number; // 0..1 liquid level
  color: number;
}

export default class LeaderboardScene extends Phaser.Scene {
  private diffIndex = 0; // default Normal
  private from = 'TitleScene';
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private tabUnderline!: Phaser.GameObjects.Graphics;
  /** Everything that changes when the difficulty tab switches lives here and is rebuilt each refresh. */
  private board!: Phaser.GameObjects.Container;
  private cyls: Cyl[] = [];

  private leftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('LeaderboardScene');
  }

  init(data: { from?: string; difficulty?: Difficulty }): void {
    this.from = data.from ?? 'TitleScene';
    this.diffIndex = data.difficulty ? DIFFS.indexOf(data.difficulty) : 0;
    if (this.diffIndex < 0) this.diffIndex = 0;
    this.tabTexts = [];
    this.cyls = [];
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.cyls = [];
    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x060e06).setScrollFactor(0);

    this.add
      .text(cx, 40, 'LEADERBOARD', { fontSize: '30px', color: '#88cc88', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, 66, 'top specimens — fuller cylinder, higher score', {
        fontSize: '12px',
        color: '#669966',
        fontFamily: MONO,
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    // Difficulty tabs with an accent underline under the active one.
    const tabW = 150;
    this.tabUnderline = this.add.graphics();
    this.tabTexts = DIFFS.map((d, i) => {
      const t = this.add
        .text(cx + (i - 1) * tabW, 100, d.toUpperCase(), { fontSize: '16px', color: '#557755', fontFamily: MONO })
        .setOrigin(0.5);
      attachTap(t, () => {
        this.diffIndex = i;
        this._refresh();
      });
      return t;
    });

    // Lab bench the cylinders stand on.
    const benchY = CYL_TOP + CYL_H + 6;
    const bench = this.add.graphics();
    bench.fillStyle(0x241a10, 1);
    bench.fillRect(60, benchY, GAME_WIDTH - 120, 9);
    bench.fillStyle(0x33271a, 1);
    bench.fillRect(60, benchY, GAME_WIDTH - 120, 3);

    this.board = this.add.container(0, 0);

    this.add
      .text(cx, GAME_HEIGHT - 22, '← → switch difficulty    ESC / Z back', {
        fontSize: '13px',
        color: '#668866',
        fontFamily: MONO,
      })
      .setOrigin(0.5);

    const back = this.add
      .text(20, 30, '‹ BACK', { fontSize: '15px', color: '#88bb88', fontFamily: MONO })
      .setOrigin(0, 0.5);
    attachTap(
      back,
      () => this.scene.start(this.from),
      () => back.setColor('#ccffcc'),
    );
    back.on('pointerout', () => back.setColor('#88bb88'));

    this._refresh();

    // Gentle effervescence in the filled cylinders, so the bench feels alive.
    this.time.addEvent({
      delay: 280,
      loop: true,
      callback: () => {
        const lit = this.cyls.filter((c) => c.fill > MIN_FILL + 0.02);
        if (lit.length === 0) return;
        this._bubble(Phaser.Utils.Array.GetRandom(lit));
      },
    });

    // biome-ignore lint/style/noNonNullAssertion: keyboard always present
    const kb = this.input.keyboard!;
    this.leftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.escKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.confirmKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.leftKey)) this._switch(-1);
    if (Phaser.Input.Keyboard.JustDown(this.rightKey)) this._switch(1);
    if (Phaser.Input.Keyboard.JustDown(this.escKey) || Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
      this.scene.start(this.from);
    }
  }

  private _switch(dir: number): void {
    this.diffIndex = (this.diffIndex + dir + DIFFS.length) % DIFFS.length;
    this._refresh();
  }

  private _refresh(): void {
    const cx = GAME_WIDTH / 2;
    const diff = DIFFS[this.diffIndex];
    const accent = DIFF_COLOR[diff];

    // Tabs.
    this.tabUnderline.clear();
    this.tabTexts.forEach((t, i) => {
      const active = i === this.diffIndex;
      t.setColor(active ? hexS(DIFF_COLOR[DIFFS[i]]) : '#557755');
      t.setFontStyle(active ? 'bold' : 'normal');
      if (active) {
        this.tabUnderline.fillStyle(DIFF_COLOR[DIFFS[i]], 0.9);
        this.tabUnderline.fillRect(t.x - 42, 116, 84, 3);
      }
    });

    // Rebuild the bench contents.
    this.board.removeAll(true);
    this.cyls = [];

    const runs = SaveSystem.getLeaderboard(diff).slice(0, 5);
    if (runs.length === 0) {
      const msg = this.add
        .text(cx, CYL_TOP + CYL_H / 2, 'No runs recorded yet.\nClear a stage to set a score!', {
          fontSize: '16px',
          color: '#779977',
          fontFamily: MONO,
          align: 'center',
          lineSpacing: 8,
        })
        .setOrigin(0.5);
      this.board.add(msg);
      return;
    }

    const top = runs[0].score || 1;
    const startX = cx - ((runs.length - 1) * PITCH) / 2;

    runs.forEach((r, i) => {
      const x = startX + i * PITCH;
      const fill = MIN_FILL + (1 - MIN_FILL) * (r.score / top);
      this.cyls.push({ x, fill, color: accent });

      this._drawCylinder(x, fill, accent);

      const medal = MEDAL[i] ?? accent;
      // Rank badge above the mouth.
      this.board.add(
        this.add
          .text(x, CYL_TOP - 18, `#${i + 1}`, {
            fontSize: '18px',
            color: hexS(medal),
            fontFamily: MONO,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );

      // Labels below the cylinder.
      const bottom = CYL_TOP + CYL_H;
      const a = r.atoms;
      const date = new Date(r.date);
      const dStr = `${date.toLocaleString('en', { month: 'short' })} ${date.getDate()}`;
      this.board.add(
        this.add
          .text(x, bottom + 22, r.score.toLocaleString(), {
            fontSize: '17px',
            color: hexS(medal),
            fontFamily: MONO,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
      this.board.add(
        this.add
          .text(x, bottom + 42, `Stage ${r.stageReached}`, { fontSize: '12px', color: '#cfe0cf', fontFamily: MONO })
          .setOrigin(0.5),
      );
      this.board.add(
        this.add
          .text(x, bottom + 58, `H${a.hydrogen} O${a.oxygen} C${a.carbon} N${a.nitrogen}`, {
            fontSize: '11px',
            color: '#7f9a7f',
            fontFamily: MONO,
          })
          .setOrigin(0.5),
      );
      this.board.add(
        this.add.text(x, bottom + 74, dStr, { fontSize: '11px', color: '#5f7f5f', fontFamily: MONO }).setOrigin(0.5),
      );
    });
  }

  /** A graduated measuring cylinder: glass body, tick marks, tinted liquid, meniscus, shine, foot. */
  private _drawCylinder(x: number, fill: number, color: number): void {
    const g = this.add.graphics();
    this.board.add(g);

    const left = x - CYL_W / 2;
    const top = CYL_TOP;
    const bottom = CYL_TOP + CYL_H;
    const innerL = left + 4;
    const innerW = CYL_W - 8;

    // Base foot for stability.
    g.fillStyle(0x16241a, 1);
    g.fillEllipse(x, bottom + 4, CYL_W + 22, 12);

    // Liquid (rounded bottom).
    const liqH = fill * (CYL_H - 12);
    const liqTop = bottom - 6 - liqH;
    g.fillStyle(color, 0.82);
    g.fillRoundedRect(innerL, liqTop, innerW, bottom - 6 - liqTop, { tl: 3, tr: 3, bl: 10, br: 10 });
    // Bright meniscus band at the surface.
    g.fillStyle(this._lerp(color, 0xffffff, 0.5), 0.85);
    g.fillEllipse(x, liqTop, innerW, 6);

    // Graduation ticks up the left inner wall (every ~1/8, longer at the halves).
    g.lineStyle(1, 0xbfe6df, 0.5);
    for (let k = 1; k <= 7; k++) {
      const ty = bottom - 6 - (k / 8) * (CYL_H - 12);
      const len = k % 2 === 0 ? 14 : 8;
      g.lineBetween(innerL, ty, innerL + len, ty);
    }

    // Glass body.
    g.lineStyle(2, 0xbfe6df, 0.9);
    g.strokeRoundedRect(left, top, CYL_W, CYL_H, { tl: 4, tr: 4, bl: 12, br: 12 });
    // Pour spout at the top-right lip.
    g.lineStyle(2, 0xdcf3ee, 0.95);
    g.beginPath();
    g.moveTo(left + CYL_W - 12, top + 2);
    g.lineTo(left + CYL_W + 6, top - 4);
    g.strokePath();
    // Vertical shine streak.
    g.fillStyle(0xffffff, 0.1);
    g.fillRoundedRect(left + 7, top + 10, 5, CYL_H - 34, 3);
  }

  /** One rising, fading bubble inside a cylinder's liquid. */
  private _bubble(c: Cyl): void {
    if (c.fill <= MIN_FILL + 0.02) return;
    const innerW = CYL_W - 8;
    const bottom = CYL_TOP + CYL_H;
    const surfaceY = bottom - 6 - c.fill * (CYL_H - 12);
    const bx = c.x + Phaser.Math.Between(-innerW / 2 + 4, innerW / 2 - 4);
    const b = this.add
      .circle(bx, bottom - 14, Phaser.Math.Between(2, 4), this._lerp(c.color, 0xffffff, 0.5), 0.8)
      .setDepth(5);
    this.board.add(b);
    this.tweens.add({
      targets: b,
      y: surfaceY + Phaser.Math.Between(-3, 3),
      alpha: 0,
      duration: Phaser.Math.Between(700, 1200),
      ease: 'Sine.easeIn',
      onComplete: () => b.destroy(),
    });
  }

  private _lerp(a: number, b: number, t: number): number {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(a),
      Phaser.Display.Color.ValueToColor(b),
      100,
      Phaser.Math.Clamp(t, 0, 1) * 100,
    );
    return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
  }
}
