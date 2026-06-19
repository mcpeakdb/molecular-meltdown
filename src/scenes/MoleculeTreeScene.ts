import Phaser from 'phaser';
import {
  ATTACK_ORDER,
  ATTACKS,
  type AttackId,
  BASE_ATOMS,
  type BaseAtom,
  ELEMENT_NAMES,
  GAME_HEIGHT,
  GAME_WIDTH,
} from '../constants';
import { attachTap } from '../systems/touchMenu';

const MONO = 'monospace';

const ATOM_SYMBOL: Record<BaseAtom, string> = {
  hydrogen: 'H',
  oxygen: 'O',
  carbon: 'C',
  nitrogen: 'N',
};

const COMPOUND_SYMBOL: Partial<Record<AttackId, string>> = {
  water: 'H₂O',
  ammonia: 'NH₃',
  carbon_dioxide: 'CO₂',
  methane: 'CH₄',
  nitric_oxide: 'NO',
  carbonic_acid: 'H₂CO₃',
};

// Real periodic-table facts for the four collectable atoms, so each cell reads like the genuine
// article (atomic number top-left, standard atomic weight bottom). Compound weights are summed.
const ATOMIC_NUMBER: Record<BaseAtom, number> = { hydrogen: 1, carbon: 6, nitrogen: 7, oxygen: 8 };
const ATOMIC_MASS: Record<BaseAtom, number> = { hydrogen: 1.008, carbon: 12.011, nitrogen: 14.007, oxygen: 15.999 };
// Atoms laid out in their true periodic positions (H alone top-left; C/N/O on the right of period 2).
const ATOM_ORDER: BaseAtom[] = ['hydrogen', 'carbon', 'nitrogen', 'oxygen'];
const ATOM_COL: Record<BaseAtom, number> = { hydrogen: 0, carbon: 5, nitrogen: 6, oxygen: 7 };

const hex = (col: number): string => `#${col.toString(16).padStart(6, '0')}`;
const isBaseAtom = (id: AttackId): id is BaseAtom => (BASE_ATOMS as string[]).includes(id);
const shortName = (id: AttackId): string => ELEMENT_NAMES[id].replace(/\s*\(.*\)/, '');
const symbolOf = (id: AttackId): string => (isBaseAtom(id) ? ATOM_SYMBOL[id] : (COMPOUND_SYMBOL[id] ?? '?'));
const colorOf = (id: AttackId): number => ATTACKS[id].color;
const molarMass = (id: AttackId): number => {
  if (isBaseAtom(id)) return ATOMIC_MASS[id];
  const r = ATTACKS[id].recipe;
  return BASE_ATOMS.reduce((sum, a) => sum + (r[a] ?? 0) * ATOMIC_MASS[a], 0);
};

// ── Periodic grid geometry ─────────────────────────────────────────────────────
const COLS = 8;
const TW = 104;
const TH = 104;
const GAP = 8;
const GRID_W = COLS * TW + (COLS - 1) * GAP;
const LEFT = (GAME_WIDTH - GRID_W) / 2;
const colCenter = (c: number): number => LEFT + c * (TW + GAP) + TW / 2;
const ATOM_Y = 148; // period-1/2 atoms row
const COMP_Y = 266; // the assembled compounds row

interface Cell {
  id: AttackId;
  x: number;
  y: number;
  /** Number shown in the cell corner: atomic number for atoms, catalogue index for compounds. */
  num: number;
}

/**
 * A static reference screen styled like a periodic table. The four collectable base atoms sit in
 * their true periodic positions; the assembled compounds form a second period below. Each tile shows
 * its symbol/formula, name and molar mass; selecting one (arrows / tap) reveals its recipe and the
 * three tier attack names in the detail panel. Data-driven from ATTACKS, so it stays in sync.
 */
export default class MoleculeTreeScene extends Phaser.Scene {
  private from = 'TitleScene';
  private cells: Cell[] = [];
  private cursor = 0;
  private selGfx!: Phaser.GameObjects.Graphics;

  private detailSymbol!: Phaser.GameObjects.Text;
  private detailRecipe!: Phaser.GameObjects.Text;
  private detailTiers!: Phaser.GameObjects.Text;

  private leftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;
  private confirmKey2!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MoleculeTreeScene');
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? 'TitleScene';
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.cells = [];
    this.cursor = 0;

    const bg = this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05090f).setScrollFactor(0);
    // Touch: tap the backdrop (not a tile) to go back (mirrors ESC / Z).
    attachTap(bg, () => this.scene.start(this.from));

    this.add
      .text(cx, 30, 'PERIODIC TABLE', { fontSize: '28px', color: '#aaf0ff', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, 56, 'Collect atoms to arm attacks — combine them into compounds for stronger ones', {
        fontSize: '12px',
        color: '#6699aa',
        fontFamily: MONO,
      })
      .setOrigin(0.5);

    // Row labels evoking real periodic periods.
    this.add
      .text(LEFT - 14, ATOM_Y, 'ATOMS', { fontSize: '10px', color: '#3f5f6a', fontFamily: MONO })
      .setOrigin(1, 0.5)
      .setAngle(-90);
    this.add
      .text(LEFT - 14, COMP_Y, 'COMPOUNDS', { fontSize: '10px', color: '#3f5f6a', fontFamily: MONO })
      .setOrigin(0.5, 0.5)
      .setAngle(-90);

    // Atom tiles in true periodic positions.
    ATOM_ORDER.forEach((a) => {
      const cell: Cell = { id: a, x: colCenter(ATOM_COL[a]), y: ATOM_Y, num: ATOMIC_NUMBER[a] };
      this.cells.push(cell);
      this._drawCell(cell);
    });

    // Compound tiles form the second period, catalogued 1..n.
    const compounds = ATTACK_ORDER.filter((id) => !isBaseAtom(id));
    compounds.forEach((id, i) => {
      const cell: Cell = { id, x: colCenter(1 + i), y: COMP_Y, num: i + 1 };
      this.cells.push(cell);
      this._drawCell(cell);
    });

    // Selection ring sits above the tiles.
    this.selGfx = this.add.graphics().setDepth(6);

    this._buildDetailPanel();

    this.add
      .text(cx, GAME_HEIGHT - 18, '← → ↑ ↓ inspect    ESC / Z  or tap  to go back', {
        fontSize: '12px',
        color: '#557766',
        fontFamily: MONO,
      })
      .setOrigin(0.5);

    this._refresh();

    // biome-ignore lint/style/noNonNullAssertion: keyboard always present
    const kb = this.input.keyboard!;
    this.leftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.upKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.escKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.confirmKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.confirmKey2 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  /** Draw one periodic-table tile: corner number, big symbol, name, molar mass — coloured per element. */
  private _drawCell(cell: Cell): void {
    const { id, x, y } = cell;
    const col = colorOf(id);
    const left = x - TW / 2;
    const top = y - TH / 2;

    const g = this.add.graphics().setDepth(1);
    g.fillStyle(Phaser.Display.Color.IntegerToColor(col).darken(74).color, 0.95);
    g.fillRect(left, top, TW, TH);
    g.lineStyle(1.5, col, 0.5);
    g.strokeRect(left, top, TW, TH);
    // A coloured cap strip across the top edge — a classic periodic-cell flourish.
    g.fillStyle(col, 0.5);
    g.fillRect(left, top, TW, 4);

    this.add
      .text(left + 8, top + 8, `${cell.num}`, { fontSize: '12px', color: '#9fb4bd', fontFamily: MONO })
      .setOrigin(0, 0)
      .setDepth(3);
    this.add
      .text(x, y - 8, symbolOf(id), { fontSize: '26px', color: hex(col), fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(3);
    this.add
      .text(x, y + 24, shortName(id), { fontSize: '10px', color: '#cfe0e8', fontFamily: MONO })
      .setOrigin(0.5)
      .setDepth(3);
    this.add
      .text(x, y + 40, molarMass(id).toFixed(2), { fontSize: '10px', color: '#7d93a0', fontFamily: MONO })
      .setOrigin(0.5)
      .setDepth(3);

    // Touch: tap a tile to inspect it.
    const idx = this.cells.length - 1;
    const zone = this.add.rectangle(x, y, TW, TH, 0x000000, 0).setDepth(4);
    attachTap(zone, () => {
      this.cursor = idx;
      this._refresh();
    });
  }

  private _buildDetailPanel(): void {
    const cx = GAME_WIDTH / 2;
    const top = 330;
    const w = 860;
    const h = 178;
    const panel = this.add.graphics().setDepth(1);
    panel.fillStyle(0x0a1820, 0.92);
    panel.fillRoundedRect(cx - w / 2, top, w, h, 8);
    panel.lineStyle(1.5, 0x2a4a55, 0.9);
    panel.strokeRoundedRect(cx - w / 2, top, w, h, 8);

    this.detailSymbol = this.add
      .text(cx, top + 30, '', { fontSize: '24px', color: '#ffffff', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);
    this.detailRecipe = this.add
      .text(cx, top + 64, '', { fontSize: '14px', color: '#aebcc6', fontFamily: MONO })
      .setOrigin(0.5)
      .setDepth(2);
    this.add
      .text(cx, top + 94, 'ATTACK TIERS', { fontSize: '11px', color: '#5f7f8a', fontFamily: MONO })
      .setOrigin(0.5)
      .setDepth(2);
    this.detailTiers = this.add
      .text(cx, top + 116, '', {
        fontSize: '13px',
        color: '#c4d2da',
        fontFamily: MONO,
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5, 0)
      .setDepth(2);
  }

  private _refresh(): void {
    const cell = this.cells[this.cursor];
    const col = colorOf(cell.id);

    // Selection ring around the active tile.
    this.selGfx.clear();
    this.selGfx.lineStyle(3, col, 1);
    this.selGfx.strokeRect(cell.x - TW / 2 - 2, cell.y - TH / 2 - 2, TW + 4, TH + 4);
    this.selGfx.lineStyle(2, col, 0.3);
    this.selGfx.strokeRect(cell.x - TW / 2 - 6, cell.y - TH / 2 - 6, TW + 12, TH + 12);

    // Detail panel.
    this.detailSymbol.setText(`${symbolOf(cell.id)}   ${shortName(cell.id)}`).setColor(hex(col));
    if (isBaseAtom(cell.id)) {
      this.detailRecipe.setText(`Atomic no. ${ATOMIC_NUMBER[cell.id]}  ·  base atom — collect it directly`);
    } else {
      const recipe = BASE_ATOMS.filter((a) => ATTACKS[cell.id].recipe[a])
        .map((a) => `${ATTACKS[cell.id].recipe[a]} ${ATOM_SYMBOL[a]}`)
        .join('  +  ');
      this.detailRecipe.setText(`Recipe:  ${recipe}`);
    }
    this.detailTiers.setText(ATTACKS[cell.id].tierNames.map((n, i) => `Lv${i + 1}   ${n}`).join('\n'));
  }

  /** Move the cursor. ±1 steps along the flat list; up/down hop between the atom and compound rows. */
  private _move(dx: number, dy: number): void {
    const atomCount = ATOM_ORDER.length;
    if (dx !== 0) {
      this.cursor = (this.cursor + dx + this.cells.length) % this.cells.length;
    } else if (dy > 0 && this.cursor < atomCount) {
      // Atom → compound: keep roughly the same horizontal slot.
      this.cursor = Math.min(this.cells.length - 1, atomCount + this.cursor);
    } else if (dy < 0 && this.cursor >= atomCount) {
      this.cursor = Math.min(atomCount - 1, this.cursor - atomCount);
    }
    this._refresh();
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.leftKey)) this._move(-1, 0);
    if (Phaser.Input.Keyboard.JustDown(this.rightKey)) this._move(1, 0);
    if (Phaser.Input.Keyboard.JustDown(this.upKey)) this._move(0, -1);
    if (Phaser.Input.Keyboard.JustDown(this.downKey)) this._move(0, 1);
    if (
      Phaser.Input.Keyboard.JustDown(this.escKey) ||
      Phaser.Input.Keyboard.JustDown(this.confirmKey) ||
      Phaser.Input.Keyboard.JustDown(this.confirmKey2)
    ) {
      this.scene.start(this.from);
    }
  }
}
