import Phaser from 'phaser';
import { type Difficulty, GAME_HEIGHT, GAME_WIDTH } from '../constants';
import MusicSystem from '../systems/MusicSystem';
import SoundSystem from '../systems/SoundSystem';
import { attachTap } from '../systems/touchMenu';

const MONO = 'monospace';

// Each difficulty is an Erlenmeyer flask over a Bunsen burner. The flame's height + fury and the
// liquid's boil rate escalate with difficulty, so the danger reads at a glance: a calm blue simmer
// for Normal, a roaring red boil for Extreme. `heat` (0..1) drives flame size and bubble rate.
const OPTIONS: { key: Difficulty; label: string; color: number; heat: number; desc: string; stats: string }[] = [
  {
    key: 'normal',
    label: 'NORMAL',
    color: 0x44cc66,
    heat: 0.4,
    desc: 'GENTLE SIMMER',
    stats: 'ENEMY HP     ×0.70\nENEMY SPEED  ×0.75\nI-FRAMES     1.4s\nARSENAL      3 WEAPONS',
  },
  {
    key: 'hard',
    label: 'HARD',
    color: 0xe0a52a,
    heat: 0.72,
    desc: 'ROLLING BOIL',
    stats: 'ENEMY HP     ×1.00\nENEMY SPEED  ×1.00\nI-FRAMES     0.8s\nARSENAL      3 WEAPONS',
  },
  {
    key: 'extreme',
    label: 'EXTREME',
    color: 0xcc4422,
    heat: 1.0,
    desc: 'CRITICAL MELTDOWN',
    stats: 'ENEMY HP     ×1.40\nENEMY SPEED  ×1.25\nI-FRAMES     0.5s\nARSENAL      2 WEAPONS',
  },
];

const CARD_CX = [200, 480, 760] as const;

// Flask geometry (relative to a card's center x).
const MOUTH_Y = 132;
const NECK_HALF = 11;
const NECK_BOTTOM_Y = 168;
const BODY_BOTTOM_Y = 282;
const BODY_HALF = 64;
const FILL = 0.6; // liquid level as a fraction of body height

// Burner / flame geometry.
const BURNER_TOP_Y = 344;
const BURNER_BOTTOM_Y = 384;

export default class DifficultyScene extends Phaser.Scene {
  private cursor = 0; // default Normal (the easiest, recommended entry)
  private bodies: Phaser.GameObjects.Graphics[] = [];
  private flames: Phaser.GameObjects.Graphics[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private reacting = false;
  private reactSurge = 0; // 0..1 extra flame/boil applied to the chosen flask while confirming

  private leftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;
  private confirmKey2!: Phaser.Input.Keyboard.Key;
  private backKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('DifficultyScene');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    // Restore the menu theme (e.g. when returning here from a run via the pause menu).
    MusicSystem.setTrack((this.sound as Phaser.Sound.WebAudioSoundManager).context, 'title');

    // The scene instance is reused across restarts — clear stale refs from a prior visit.
    this.bodies = [];
    this.flames = [];
    this.labels = [];
    this.cursor = 0;
    this.reacting = false;
    this.reactSurge = 0;

    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x060e06).setScrollFactor(0);

    this.add
      .text(cx, 46, 'SELECT DIFFICULTY', { fontSize: '26px', color: '#88cc88', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, 72, 'crank the burner — hotter means deadlier', {
        fontSize: '13px',
        color: '#669966',
        fontFamily: MONO,
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    // A shared lab bench the burners stand on.
    const bench = this.add.graphics();
    bench.fillStyle(0x241a10, 1);
    bench.fillRect(100, BURNER_BOTTOM_Y, GAME_WIDTH - 200, 10);
    bench.fillStyle(0x33271a, 1);
    bench.fillRect(100, BURNER_BOTTOM_Y, GAME_WIDTH - 200, 3);

    OPTIONS.forEach((opt, i) => {
      const x = CARD_CX[i];

      this.labels.push(
        this.add
          .text(x, 100, opt.label, {
            fontSize: '22px',
            color: `#${opt.color.toString(16).padStart(6, '0')}`,
            fontFamily: MONO,
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );

      // Retort stand: the rod + base go behind everything (so the flask/burner sit in front of
      // them); the clamp that grips the neck is drawn later, on top of the glass.
      const standBack = this.add.graphics();
      this._drawStandBack(standBack, x);

      // Flame sits behind the glass; the glass/liquid is drawn on top.
      const flame = this.add.graphics();
      this.flames.push(flame);
      const body = this.add.graphics();
      this.bodies.push(body);

      const standClamp = this.add.graphics();
      this._drawStandClamp(standClamp, x);

      this.add
        .text(x, BODY_BOTTOM_Y - 84, opt.desc, {
          fontSize: '12px',
          color: '#cfe6cf',
          fontFamily: MONO,
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5);

      this.add
        .text(x, BURNER_BOTTOM_Y + 22, opt.stats, {
          fontSize: '12px',
          color: '#779977',
          fontFamily: MONO,
          align: 'left',
          lineSpacing: 4,
        })
        .setOrigin(0.5, 0);

      // Touch: tap a flask to highlight; tap the highlighted flask again to confirm.
      const zone = this.add.rectangle(x, (MOUTH_Y + BURNER_BOTTOM_Y) / 2, BODY_HALF * 2 + 30, 270, 0x000000, 0);
      attachTap(zone, () => {
        if (this.reacting) return;
        if (this.cursor === i) this._confirm();
        else {
          this.cursor = i;
          this._refresh();
        }
      });
    });

    this.add
      .text(cx, GAME_HEIGHT - 22, '← → navigate     Z / Enter confirm     ESC back to title', {
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
      () => !this.reacting && this.scene.start('TitleScene'),
      () => back.setColor('#ccffcc'),
    );
    back.on('pointerout', () => back.setColor('#88bb88'));

    this._refresh();

    // Steady stream of rising bubbles inside each flask; busier flasks boil harder.
    this.time.addEvent({
      delay: 90,
      loop: true,
      callback: () => this._tickBubbles(),
    });

    // biome-ignore lint/style/noNonNullAssertion: keyboard always present
    const kb = this.input.keyboard!;
    this.leftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.confirmKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.confirmKey2 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.backKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  update(time: number): void {
    // Only the highlighted flask's burner is lit — its flame flickers (and surges while confirming);
    // the others stay dark. Redraw every frame for the flicker, clear the unlit ones.
    OPTIONS.forEach((opt, i) => {
      if (i !== this.cursor) {
        this.flames[i].clear();
        return;
      }
      const surge = this.reacting ? this.reactSurge : 0;
      this._drawFlame(this.flames[i], CARD_CX[i], opt, time, surge);
    });

    if (this.reacting) return;
    if (Phaser.Input.Keyboard.JustDown(this.leftKey)) this._move(-1);
    if (Phaser.Input.Keyboard.JustDown(this.rightKey)) this._move(1);
    if (Phaser.Input.Keyboard.JustDown(this.confirmKey) || Phaser.Input.Keyboard.JustDown(this.confirmKey2)) {
      this._confirm();
    }
    if (Phaser.Input.Keyboard.JustDown(this.backKey)) this.scene.start('TitleScene');
  }

  private _move(dir: number): void {
    this.cursor = (this.cursor + dir + OPTIONS.length) % OPTIONS.length;
    this._refresh();
  }

  private _refresh(): void {
    OPTIONS.forEach((opt, i) => {
      this._drawBody(this.bodies[i], CARD_CX[i], opt, i === this.cursor);
      this.labels[i].setAlpha(i === this.cursor ? 1 : 0.55);
    });
  }

  /** Liquid surface y inside the cone for the current fill level. */
  private _liquidTopY(): number {
    return BODY_BOTTOM_Y - FILL * (BODY_BOTTOM_Y - NECK_BOTTOM_Y);
  }

  /** Cone half-width at a given y between the neck base and the body base. */
  private _halfWidthAt(y: number): number {
    const t = Phaser.Math.Clamp((y - NECK_BOTTOM_Y) / (BODY_BOTTOM_Y - NECK_BOTTOM_Y), 0, 1);
    return Phaser.Math.Linear(NECK_HALF, BODY_HALF, t);
  }

  /** Draw the glass flask + liquid + Bunsen burner. */
  private _drawBody(g: Phaser.GameObjects.Graphics, x: number, opt: (typeof OPTIONS)[number], selected: boolean): void {
    g.clear();

    // ── Bunsen burner (barrel + base) under the flask ──
    g.fillStyle(0x445055, 1);
    g.fillRect(x - 8, BURNER_TOP_Y, 16, BURNER_BOTTOM_Y - BURNER_TOP_Y);
    g.fillStyle(0x2c3438, 1);
    g.fillTriangle(x - 22, BURNER_BOTTOM_Y, x + 22, BURNER_BOTTOM_Y, x, BURNER_BOTTOM_Y - 16);

    // ── Liquid (lower cone) ──
    const liqTop = this._liquidTopY();
    const hwTop = this._halfWidthAt(liqTop);
    const fillAlpha = selected ? 0.9 : 0.65;
    g.fillStyle(opt.color, fillAlpha);
    g.beginPath();
    g.moveTo(x - hwTop, liqTop);
    g.lineTo(x + hwTop, liqTop);
    g.lineTo(x + BODY_HALF - 4, BODY_BOTTOM_Y - 3);
    g.lineTo(x - BODY_HALF + 4, BODY_BOTTOM_Y - 3);
    g.closePath();
    g.fillPath();
    // Bright meniscus band at the surface.
    g.fillStyle(this._lerp(opt.color, 0xffffff, 0.5), fillAlpha);
    g.fillEllipse(x, liqTop, hwTop * 2, 6);

    // ── Glass outline (Erlenmeyer silhouette) ──
    if (selected) {
      g.lineStyle(5, opt.color, 0.25);
      this._flaskPath(g, x);
      g.strokePath();
    }
    g.lineStyle(2, 0xbfe6df, 0.9);
    this._flaskPath(g, x);
    g.strokePath();
    // Lip at the mouth.
    g.lineStyle(2, 0xdcf3ee, 0.95);
    g.strokeRoundedRect(x - NECK_HALF - 3, MOUTH_Y - 4, NECK_HALF * 2 + 6, 6, 2);
    // Shine streak down the body.
    g.fillStyle(0xffffff, 0.1);
    g.fillTriangle(
      x - BODY_HALF * 0.45,
      BODY_BOTTOM_Y - 14,
      x - BODY_HALF * 0.2,
      BODY_BOTTOM_Y - 14,
      x - NECK_HALF,
      NECK_BOTTOM_Y + 6,
    );
  }

  private _flaskPath(g: Phaser.GameObjects.Graphics, x: number): void {
    g.beginPath();
    g.moveTo(x - NECK_HALF, MOUTH_Y);
    g.lineTo(x - NECK_HALF, NECK_BOTTOM_Y);
    g.lineTo(x - BODY_HALF, BODY_BOTTOM_Y);
    g.lineTo(x + BODY_HALF, BODY_BOTTOM_Y);
    g.lineTo(x + NECK_HALF, NECK_BOTTOM_Y);
    g.lineTo(x + NECK_HALF, MOUTH_Y);
  }

  /** Draw a flickering flame beneath the flask, sized by `heat` (+ confirm `surge`). */
  private _drawFlame(
    g: Phaser.GameObjects.Graphics,
    x: number,
    opt: (typeof OPTIONS)[number],
    time: number,
    surge: number,
  ): void {
    g.clear();
    const heat = Phaser.Math.Clamp(opt.heat + surge * 0.8, 0, 1.6);
    const baseY = BURNER_TOP_Y;
    const flick = Math.sin(time * 0.02 + x) * 0.12 + Math.sin(time * 0.047 + x * 2) * 0.06;
    const h = (52 + heat * 78) * (1 + flick);
    const halfW = 13 + heat * 13;
    const tipDx = Math.sin(time * 0.018 + x) * (4 + heat * 5);

    // Hot glow halo.
    g.fillStyle(this._lerp(opt.color, 0xff7722, 0.4), 0.18 + heat * 0.12);
    g.fillEllipse(x, baseY - h * 0.4, halfW * 2.6, h * 0.9);

    // Outer flame (difficulty color).
    g.fillStyle(opt.color, 0.55);
    g.fillTriangle(x - halfW, baseY, x + halfW, baseY, x + tipDx, baseY - h);

    // Mid flame (toward orange).
    g.fillStyle(this._lerp(opt.color, 0xffaa33, 0.7), 0.8);
    g.fillTriangle(x - halfW * 0.6, baseY, x + halfW * 0.6, baseY, x + tipDx * 0.7, baseY - h * 0.78);

    // Bright inner core.
    g.fillStyle(0xfff3c0, 0.95);
    g.fillTriangle(x - halfW * 0.32, baseY, x + halfW * 0.32, baseY, x + tipDx * 0.4, baseY - h * 0.5);

    // Extra side tongues when it's really cooking.
    if (heat > 0.6) {
      const side = halfW * 0.7;
      g.fillStyle(this._lerp(opt.color, 0xffaa33, 0.6), 0.5);
      g.fillTriangle(x - side - 4, baseY, x - side + 6, baseY, x - side + Math.sin(time * 0.03) * 4, baseY - h * 0.5);
      g.fillTriangle(x + side - 6, baseY, x + side + 4, baseY, x + side + Math.cos(time * 0.03) * 4, baseY - h * 0.5);
    }
  }

  // Retort-stand geometry (relative to a card's center x). The rod stands to the right of the flask
  // so it never overlaps the glass; the clamp arm reaches left to grip the neck.
  private _rodX(x: number): number {
    return x + BODY_HALF + 20;
  }
  private static readonly CLAMP_Y = (MOUTH_Y + NECK_BOTTOM_Y) / 2;
  private static readonly STEEL = 0x6a747a;
  private static readonly STEEL_DARK = 0x40484d;
  private static readonly STEEL_LITE = 0x99a4aa;

  /** Heavy base + vertical rod, drawn behind the flask and burner so they appear to rest on it. */
  private _drawStandBack(g: Phaser.GameObjects.Graphics, x: number): void {
    g.clear();
    const rodX = this._rodX(x);
    const rodW = 7;
    const baseBottom = BURNER_BOTTOM_Y;
    const baseTop = baseBottom - 9;
    const rodTop = MOUTH_Y - 20;

    // Vertical rod (dark fill + left-edge sheen + rounded cap).
    g.fillStyle(DifficultyScene.STEEL_DARK, 1);
    g.fillRect(rodX - rodW / 2, rodTop, rodW, baseTop - rodTop + 3);
    g.fillStyle(DifficultyScene.STEEL, 1);
    g.fillRect(rodX - rodW / 2, rodTop, 3, baseTop - rodTop + 3);
    g.fillStyle(DifficultyScene.STEEL_LITE, 1);
    g.fillCircle(rodX, rodTop, rodW / 2 + 1);

    // Cast base plate, extending left under the burner for stability.
    const bx = x - 30;
    const bw = rodX + 14 - bx;
    g.fillStyle(DifficultyScene.STEEL_DARK, 1);
    g.fillRoundedRect(bx, baseTop, bw, baseBottom - baseTop, 3);
    g.fillStyle(DifficultyScene.STEEL, 1);
    g.fillRoundedRect(bx, baseTop, bw, 4, 3);
  }

  /** Clamp boss on the rod + arm + jaws gripping the flask neck, drawn on top of the glass. */
  private _drawStandClamp(g: Phaser.GameObjects.Graphics, x: number): void {
    g.clear();
    const rodX = this._rodX(x);
    const cy = DifficultyScene.CLAMP_Y;

    // Boss that clamps onto the rod, with a thumb-screw knob.
    g.fillStyle(DifficultyScene.STEEL_DARK, 1);
    g.fillRoundedRect(rodX - 8, cy - 10, 14, 20, 3);
    g.fillStyle(DifficultyScene.STEEL_LITE, 1);
    g.fillCircle(rodX + 5, cy, 4);

    // Horizontal arm reaching from the rod to the neck.
    const armLeft = x + NECK_HALF - 2;
    g.fillStyle(DifficultyScene.STEEL, 1);
    g.fillRect(armLeft, cy - 3, rodX - armLeft, 6);
    g.fillStyle(DifficultyScene.STEEL_LITE, 1);
    g.fillRect(armLeft, cy - 3, rodX - armLeft, 2);

    // Upper + lower jaws wrapping the neck.
    g.fillStyle(DifficultyScene.STEEL_DARK, 1);
    g.fillRoundedRect(x - NECK_HALF - 4, cy - 12, NECK_HALF * 2 + 8, 5, 2);
    g.fillRoundedRect(x - NECK_HALF - 4, cy + 7, NECK_HALF * 2 + 8, 5, 2);
    g.fillStyle(DifficultyScene.STEEL, 1);
    g.fillRect(x - NECK_HALF - 4, cy - 12, NECK_HALF * 2 + 8, 2);
  }

  /** Only the highlighted (lit) flask boils — hotter difficulties bubble harder, a torrent while
   *  confirming. The unlit flasks sit still. */
  private _tickBubbles(): void {
    const i = this.cursor;
    const opt = OPTIONS[i];
    const rate = opt.heat + (this.reacting ? 2 : 0);
    const count = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    for (let n = 0; n < count; n++) this._spawnBubble(CARD_CX[i], opt.color);
  }

  private _spawnBubble(x: number, color: number): void {
    const liqTop = this._liquidTopY();
    const startY = BODY_BOTTOM_Y - Phaser.Math.Between(6, 24);
    const hw = this._halfWidthAt(startY) - 6;
    const bx = x + Phaser.Math.Between(-hw, hw);
    const b = this.add
      .circle(bx, startY, Phaser.Math.Between(2, 4), this._lerp(color, 0xffffff, 0.5), 0.85)
      .setDepth(5);
    this.tweens.add({
      targets: b,
      y: liqTop + Phaser.Math.Between(-3, 3),
      alpha: 0,
      duration: Phaser.Math.Between(600, 1100),
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

  private _confirm(): void {
    if (this.reacting) return;
    this.reacting = true;
    const opt = OPTIONS[this.cursor];
    const x = CARD_CX[this.cursor];

    try {
      const ctx = (this.sound as Phaser.Sound.WebAudioSoundManager).context;
      SoundSystem.play(ctx, 'reaction');
    } catch {
      // No audio context — the visual reaction still plays.
    }

    // Crank the burner: the flame roars up and the flask boils over.
    this.tweens.add({
      targets: this,
      reactSurge: 1,
      duration: 620,
      ease: 'Sine.easeIn',
      onComplete: () => this._boilOver(x, opt.color),
    });
  }

  /** Boil-over eruption: foam at the mouth + escaping droplets, screen flash, then Stage Select. */
  private _boilOver(x: number, color: number): void {
    const flash = this._lerp(color, 0xffffff, 0.5);
    const fc = Phaser.Display.Color.ValueToColor(flash);
    this.cameras.main.flash(240, fc.red, fc.green, fc.blue);
    this.cameras.main.shake(300, 0.006);

    const ring = this.add.circle(x, MOUTH_Y, 5, 0xffffff, 0.5).setDepth(20);
    this.tweens.add({
      targets: ring,
      radius: 40,
      alpha: 0,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });

    for (let i = 0; i < 24; i++) {
      const d = this.add
        .circle(
          x + Phaser.Math.Between(-6, 6),
          MOUTH_Y,
          Phaser.Math.Between(3, 6),
          this._lerp(color, 0xffffff, 0.4),
          0.95,
        )
        .setDepth(20);
      this.tweens.add({
        targets: d,
        x: x + Phaser.Math.Between(-130, 130),
        y: MOUTH_Y - Phaser.Math.Between(50, 170),
        alpha: 0,
        scale: 0.2,
        duration: Phaser.Math.Between(480, 880),
        ease: 'Quad.easeOut',
        onComplete: () => d.destroy(),
      });
    }

    this.registry.set('difficulty', OPTIONS[this.cursor].key);
    // Pick a stage next (sequential unlocks live in StageSelectScene).
    this.time.delayedCall(500, () => this.scene.start('StageSelectScene'));
  }
}
