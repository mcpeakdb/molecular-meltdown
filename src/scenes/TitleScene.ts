import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import Settings from '../systems/Settings';
import { attachTap } from '../systems/touchMenu';

const MONO = 'monospace';
const ITEMS = ['START', 'MOLECULE TREE', 'LEADERBOARD', 'CONTROLS', 'SETTINGS'] as const;
const MENU_TOP = 286; // y of the first menu item
const MENU_DY = 38; // vertical spacing between menu items

export default class TitleScene extends Phaser.Scene {
  private cursor = 0;
  private itemTexts: Phaser.GameObjects.Text[] = [];
  private cursorText!: Phaser.GameObjects.Text;
  private electrons: Phaser.GameObjects.Arc[] = [];
  // Drifting background flair: germs and atoms floating around behind the menu.
  private decor: { go: Phaser.GameObjects.Sprite; vx: number; vy: number; spin: number }[] = [];

  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;
  private confirmKey2!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('TitleScene');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.cursor = 0;
    this.itemTexts = [];
    this.electrons = [];
    this.decor = [];

    this.add
      .rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05090f)
      .setScrollFactor(0)
      .setDepth(-10);

    this._spawnDecor();

    // Decorative orbiting atom behind the title
    const atomY = 110;
    this.add.circle(cx, atomY, 16, 0x44bbf0).setAlpha(0.9);
    this.add.circle(cx, atomY, 9, 0x88ddff);
    for (let i = 0; i < 3; i++) {
      const ring = this.add.graphics().setPosition(cx, atomY);
      ring.lineStyle(1.5, 0x4488cc, 0.5);
      ring.strokeEllipse(0, 0, 120, 44);
      ring.setRotation((i * Math.PI) / 3);
      const e = this.add.circle(cx + 60, atomY, 4, 0xaaf0ff);
      this.electrons.push(e);
      this.tweens.add({
        targets: { t: 0 },
        t: Math.PI * 2,
        duration: 2600 + i * 700,
        repeat: -1,
        onUpdate: (_tw, tgt: { t: number }) => {
          const a = (tgt as { t: number }).t;
          const rot = (i * Math.PI) / 3;
          const ex = Math.cos(a) * 60;
          const ey = Math.sin(a) * 22;
          e.setPosition(cx + ex * Math.cos(rot) - ey * Math.sin(rot), atomY + ex * Math.sin(rot) + ey * Math.cos(rot));
        },
      });
    }

    this.add
      .text(cx, 202, 'MOLECULAR MELTDOWN', {
        fontSize: '46px',
        color: '#aaf0ff',
        fontFamily: MONO,
        fontStyle: 'bold',
        stroke: '#04212e',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 240, 'a molecular-scale beat ’em up', {
        fontSize: '15px',
        color: '#6699aa',
        fontFamily: MONO,
        fontStyle: 'italic',
      })
      .setOrigin(0.5);

    this.cursorText = this.add
      .text(cx - 130, MENU_TOP, '›', { fontSize: '20px', color: '#aaffaa', fontFamily: MONO })
      .setOrigin(0, 0.5);

    this.itemTexts = ITEMS.map((label, i) => {
      const t = this.add
        .text(cx - 104, MENU_TOP + i * MENU_DY, label, { fontSize: '19px', color: '#88bb88', fontFamily: MONO })
        .setOrigin(0, 0.5);
      attachTap(
        t,
        () => {
          this.cursor = i;
          this._refresh();
          this._confirm();
        },
        () => {
          this.cursor = i;
          this._refresh();
        },
      );
      return t;
    });

    this.add
      .text(cx, GAME_HEIGHT - 24, '↑↓ select    Z / Enter confirm', {
        fontSize: '13px',
        color: '#557755',
        fontFamily: MONO,
      })
      .setOrigin(0.5);

    this._refresh();

    // biome-ignore lint/style/noNonNullAssertion: keyboard always present
    const kb = this.input.keyboard!;
    this.upKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.confirmKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.confirmKey2 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  /** Scatter germs + atoms that slowly drift across the screen behind the menu. */
  private _spawnDecor(): void {
    const germs = ['bacterium', 'virus', 'dustbunny', 'pollen', 'amoeba', 'spore', 'mite'];
    const atoms = ['atom_hydrogen', 'atom_oxygen', 'atom_carbon', 'atom_nitrogen', 'atom_gold'];
    const between = Phaser.Math.Between;
    const float = Phaser.Math.FloatBetween;

    const make = (keys: string[], count: number, spinny: boolean) => {
      for (let i = 0; i < count; i++) {
        const key = keys[between(0, keys.length - 1)];
        const go = this.add
          .sprite(between(40, GAME_WIDTH - 40), between(40, GAME_HEIGHT - 40), key)
          .setDepth(-5)
          .setScale(float(0.7, 1.15))
          .setAlpha(float(0.35, 0.7));
        const ang = float(0, Math.PI * 2);
        const speed = float(12, 30);
        this.decor.push({
          go,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          spin: spinny ? float(-0.6, 0.6) : float(-0.15, 0.15),
        });
      }
    };
    make(germs, 6, false);
    make(atoms, 7, true);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const m = 40; // wrap margin past the edges
    for (const d of this.decor) {
      d.go.x += d.vx * dt;
      d.go.y += d.vy * dt;
      d.go.rotation += d.spin * dt;
      if (d.go.x < -m) d.go.x = GAME_WIDTH + m;
      else if (d.go.x > GAME_WIDTH + m) d.go.x = -m;
      if (d.go.y < -m) d.go.y = GAME_HEIGHT + m;
      else if (d.go.y > GAME_HEIGHT + m) d.go.y = -m;
    }

    if (Phaser.Input.Keyboard.JustDown(this.upKey)) this._move(-1);
    if (Phaser.Input.Keyboard.JustDown(this.downKey)) this._move(1);
    if (Phaser.Input.Keyboard.JustDown(this.confirmKey) || Phaser.Input.Keyboard.JustDown(this.confirmKey2)) {
      this._confirm();
    }
  }

  private _move(dir: number): void {
    this.cursor = (this.cursor + dir + ITEMS.length) % ITEMS.length;
    this._refresh();
  }

  private _refresh(): void {
    this.itemTexts.forEach((t, i) => {
      t.setColor(i === this.cursor ? '#ccffcc' : '#88bb88');
    });
    this.cursorText.setY(MENU_TOP + this.cursor * MENU_DY);
  }

  private _confirm(): void {
    switch (this.cursor) {
      case 0: // START
        if (Settings.get().tutorialDone) this.scene.start('DifficultyScene');
        else this.scene.start('GameScene', { tutorial: true });
        break;
      case 1: // MOLECULE TREE
        this.scene.start('MoleculeTreeScene', { from: 'TitleScene' });
        break;
      case 2: // LEADERBOARD
        this.scene.start('LeaderboardScene', { from: 'TitleScene' });
        break;
      case 3: // CONTROLS
        this.scene.start('HelpScene', { from: 'TitleScene' });
        break;
      case 4: // SETTINGS
        this.scene.start('SettingsScene', { from: 'TitleScene' });
        break;
    }
  }
}
