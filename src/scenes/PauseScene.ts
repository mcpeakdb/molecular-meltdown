import Phaser from 'phaser';
import { type AttackId, ELEMENT_NAMES, GAME_HEIGHT, GAME_WIDTH } from '../constants';
import Settings from '../systems/Settings';
import { attachTap, makeCursorIcon, punchCursorIcon } from '../systems/touchMenu';
import type GameScene from './GameScene';

const MONO = 'monospace';

export default class PauseScene extends Phaser.Scene {
  private stage = 1;
  private canSelectCompounds = false;
  private gameScene!: GameScene;

  /** Top-level pause menu vs. the Compound Selection loadout sub-screen. */
  private mode: 'menu' | 'compound' = 'menu';

  // ── Top-level menu ──
  private options: string[] = [];
  private cursor = 0;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private cursorIcon!: Phaser.GameObjects.Image;
  private title!: Phaser.GameObjects.Text;
  private menuObjs: (Phaser.GameObjects.Text | Phaser.GameObjects.Graphics | Phaser.GameObjects.Image)[] = [];

  // ── Compound Selection ──
  private compoundCursor = 0;
  private compoundObjs: (Phaser.GameObjects.Text | Phaser.GameObjects.Image)[] = [];
  private slotRows: Phaser.GameObjects.Text[] = [];
  private compoundCursorIcon!: Phaser.GameObjects.Image;

  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private leftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;
  private confirmKey2!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('PauseScene');
  }

  init(data: { stage?: number; canSelectCompounds?: boolean }): void {
    this.stage = data.stage ?? 1;
    this.canSelectCompounds = data.canSelectCompounds ?? false;
    this.cursor = 0;
    this.compoundCursor = 0;
    this.mode = 'menu';
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.gameScene = this.scene.get('GameScene') as GameScene;

    // Overlay
    this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78).setScrollFactor(0).setDepth(500);

    // Title (text swaps between modes)
    this.title = this.add
      .text(cx, cy - 84, 'PAUSED', { fontSize: '30px', color: '#88cc88', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(501);

    this._buildMenu(cx, cy);
    this._buildCompound(cx, cy);
    this._setMode('menu');

    // biome-ignore lint/style/noNonNullAssertion: keyboard always present
    const kb = this.input.keyboard!;
    this.upKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.leftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.confirmKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.confirmKey2 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  // ── Top-level menu ──────────────────────────────────────────────────────────

  private _buildMenu(cx: number, cy: number): void {
    this.options = [
      'RESUME',
      ...(this.canSelectCompounds ? ['COMPOUND SELECTION'] : []),
      'RESTART STAGE',
      'DIFFICULTY SELECT',
      'RESTART GAME',
      'QUIT TO TITLE',
    ];

    const lastY = cy - 30 + (this.options.length - 1) * 34;
    const g = this.add.graphics().setScrollFactor(0).setDepth(501);
    g.lineStyle(1, 0x1a3a1a, 0.7);
    g.lineBetween(cx - 140, cy - 50, cx + 140, cy - 50);
    g.lineBetween(cx - 140, lastY + 24, cx + 140, lastY + 24);
    this.menuObjs.push(g);

    this.cursorIcon = makeCursorIcon(this, cx - 114, cy - 30)
      .setScrollFactor(0)
      .setDepth(502);
    this.menuObjs.push(this.cursorIcon);

    this.optionTexts = this.options.map((label, i) => {
      const t = this.add
        .text(cx - 100, cy - 30 + i * 34, label, { fontSize: '18px', color: '#669966', fontFamily: MONO })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(502);
      attachTap(
        t,
        () => {
          this.cursor = i;
          this._refreshCursor();
          this._confirm();
        },
        () => {
          this.cursor = i;
          this._refreshCursor();
        },
      );
      return t;
    });
    this.menuObjs.push(...this.optionTexts);

    this._refreshCursor();
  }

  private _moveCursor(dir: number): void {
    this.cursor = (this.cursor + dir + this.options.length) % this.options.length;
    this._refreshCursor();
  }

  private _refreshCursor(): void {
    const cy = GAME_HEIGHT / 2;
    this.cursorIcon.setY(cy - 30 + this.cursor * 34);
    this.optionTexts.forEach((t, i) => {
      t.setColor(i === this.cursor ? '#ccffcc' : '#669966');
    });
  }

  private _confirm(): void {
    // The avatar throws a punch, then the menu action fires.
    punchCursorIcon(this, this.cursorIcon, () => this._activate());
  }

  private _activate(): void {
    switch (this.options[this.cursor]) {
      case 'RESUME':
        this._resume();
        break;
      case 'COMPOUND SELECTION':
        this._setMode('compound');
        break;
      case 'RESTART STAGE':
        this.scene.stop('HUDScene');
        this.scene.stop('PauseScene');
        this.scene.start('GameScene', { stage: this.stage });
        break;
      case 'DIFFICULTY SELECT':
        // GameScene renders above DifficultyScene, so it must be stopped or it hides the menu
        this.scene.stop('HUDScene');
        this.scene.stop('GameScene');
        this.scene.start('DifficultyScene');
        this.scene.stop('PauseScene');
        break;
      case 'RESTART GAME':
        this.scene.stop('HUDScene');
        this.scene.stop('PauseScene');
        this.scene.start('GameScene', { tutorial: true });
        break;
      case 'QUIT TO TITLE':
        this.scene.stop('HUDScene');
        this.scene.stop('GameScene');
        this.scene.start('TitleScene');
        this.scene.stop('PauseScene');
        break;
    }
  }

  // ── Compound Selection ───────────────────────────────────────────────────────

  private _buildCompound(cx: number, cy: number): void {
    const slotCount = this.gameScene.player.elementSystem.getSlotCount();

    const help = this.add
      .text(
        cx,
        cy - 50,
        Settings.touchActive()
          ? 'Tap a slot to change its compound    ·    tap BACK'
          : '←/→ change compound    ↑/↓ pick key    Esc back',
        {
          fontSize: '12px',
          color: '#6699aa',
          fontFamily: MONO,
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(502);
    this.compoundObjs.push(help);

    this.compoundCursorIcon = makeCursorIcon(this, cx - 160, cy - 10)
      .setScrollFactor(0)
      .setDepth(502);
    this.compoundObjs.push(this.compoundCursorIcon);

    this.slotRows = [];
    for (let i = 0; i < slotCount; i++) {
      const row = this.add
        .text(cx - 146, cy - 10 + i * 34, '', { fontSize: '17px', color: '#669966', fontFamily: MONO })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(502);
      // Touch: tapping a row selects it and cycles to the next compound (← / → still work on keyboard).
      attachTap(row, () => {
        this.compoundCursor = i;
        this._cycle(1);
      });
      this.slotRows.push(row);
      this.compoundObjs.push(row);
    }

    const back = this.add
      .text(cx, cy + slotCount * 34 + 14, '‹ BACK', { fontSize: '15px', color: '#88bb88', fontFamily: MONO })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(502);
    attachTap(back, () => this._setMode('menu'));
    this.compoundObjs.push(back);
  }

  /** Candidate compounds for a slot: "empty" plus every available weapon not bound to another slot. */
  private _candidates(slot: number): (AttackId | null)[] {
    const es = this.gameScene.player.elementSystem;
    const taken = new Set<AttackId>();
    es.getBindings().forEach((id, j) => {
      if (id && j !== slot) taken.add(id);
    });
    const avail = es
      .getAvailableAttacks()
      .map((a) => a.id)
      .filter((id) => !taken.has(id));
    return [null, ...avail];
  }

  private _moveCompound(dir: number): void {
    this.compoundCursor = (this.compoundCursor + dir + this.slotRows.length) % this.slotRows.length;
    this._refreshCompound();
  }

  private _cycle(dir: number): void {
    const es = this.gameScene.player.elementSystem;
    const slot = this.compoundCursor;
    const cands = this._candidates(slot);
    const cur = es.getBindings()[slot];
    let idx = cands.indexOf(cur);
    if (idx < 0) idx = 0;
    idx = (idx + dir + cands.length) % cands.length;
    es.setBinding(slot, cands[idx]);
    this.gameScene.events.emit('arsenal-update', this.gameScene.player.getArsenalUpdate());
    this._refreshCompound();
  }

  private _refreshCompound(): void {
    const es = this.gameScene.player.elementSystem;
    const bindings = es.getBindings();
    this.slotRows.forEach((row, i) => {
      const id = bindings[i];
      const label = id ? `${ELEMENT_NAMES[id]} · Lv${es.getAttackLevel(id)}` : '— empty —';
      row.setText(`${i + 1}   ‹ ${label} ›`);
      row.setColor(i === this.compoundCursor ? '#ccffcc' : '#669966');
    });
    this.compoundCursorIcon.setY(GAME_HEIGHT / 2 - 10 + this.compoundCursor * 34);
  }

  // ── Mode switching ───────────────────────────────────────────────────────────

  private _setMode(mode: 'menu' | 'compound'): void {
    this.mode = mode;
    const inMenu = mode === 'menu';
    this.menuObjs.forEach((o) => {
      o.setVisible(inMenu);
    });
    this.compoundObjs.forEach((o) => {
      o.setVisible(!inMenu);
    });
    this.title.setText(inMenu ? 'PAUSED' : 'COMPOUND SELECTION');
    if (inMenu) this._refreshCursor();
    else {
      this.compoundCursor = 0;
      this._refreshCompound();
    }
  }

  // ── Input ────────────────────────────────────────────────────────────────────

  update(): void {
    if (this.mode === 'menu') {
      if (Phaser.Input.Keyboard.JustDown(this.upKey)) this._moveCursor(-1);
      if (Phaser.Input.Keyboard.JustDown(this.downKey)) this._moveCursor(1);
      if (Phaser.Input.Keyboard.JustDown(this.confirmKey) || Phaser.Input.Keyboard.JustDown(this.confirmKey2))
        this._confirm();
      if (Phaser.Input.Keyboard.JustDown(this.escKey)) this._resume();
    } else {
      if (Phaser.Input.Keyboard.JustDown(this.upKey)) this._moveCompound(-1);
      if (Phaser.Input.Keyboard.JustDown(this.downKey)) this._moveCompound(1);
      if (Phaser.Input.Keyboard.JustDown(this.leftKey)) this._cycle(-1);
      if (Phaser.Input.Keyboard.JustDown(this.rightKey)) this._cycle(1);
      if (Phaser.Input.Keyboard.JustDown(this.escKey)) this._setMode('menu');
    }
  }

  private _resume(): void {
    this.scene.get('GameScene').events.emit('pause-resume');
    this.scene.stop();
  }
}
