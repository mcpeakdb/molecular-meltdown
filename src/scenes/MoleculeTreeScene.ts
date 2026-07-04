import Phaser from 'phaser';
import {
  ATTACK_ORDER,
  ATTACKS,
  type AttackId,
  BASE_ATOMS,
  type BaseAtom,
  COIN_BONUS,
  COIN_COLOR,
  COIN_SCORE,
  COINS_PER_STAGE,
  ELEMENT_COLORS,
  ELEMENT_NAMES,
  ELEMENTS,
  GAME_HEIGHT,
  GAME_WIDTH,
  NOBLE_GAS_COUNT,
  NOBLE_GASES,
} from '../constants';
import Settings from '../systems/Settings';
import { attachTap } from '../systems/touchMenu';

const MONO = 'monospace';

const ATOM_SYMBOL: Record<BaseAtom, string> = {
  hydrogen: 'H',
  oxygen: 'O',
  carbon: 'C',
  nitrogen: 'N',
  sulfur: 'S',
  chlorine: 'Cl',
  phosphorus: 'P',
};

const COMPOUND_SYMBOL: Partial<Record<AttackId, string>> = {
  water: 'H₂O',
  ammonia: 'NH₃',
  carbon_dioxide: 'CO₂',
  methane: 'CH₄',
  nitric_oxide: 'NO',
  carbonic_acid: 'H₂CO₃',
  hydrogen_sulfide: 'H₂S',
  sulfur_dioxide: 'SO₂',
  sulfuric_acid: 'H₂SO₄',
  hydrochloric_acid: 'HCl',
  phosphine: 'PH₃',
  phosphoric_acid: 'H₃PO₄',
  phosphorus_trichloride: 'PCl₃',
};

// Real periodic-table data for the collectable atoms (atomic number + standard atomic weight);
// compound weights are summed from their recipes.
const ATOMIC_NUMBER: Record<BaseAtom, number> = {
  hydrogen: 1,
  carbon: 6,
  nitrogen: 7,
  oxygen: 8,
  phosphorus: 15,
  sulfur: 16,
  chlorine: 17,
};
const ATOMIC_MASS: Record<BaseAtom, number> = {
  hydrogen: 1.008,
  carbon: 12.011,
  nitrogen: 14.007,
  oxygen: 15.999,
  phosphorus: 30.974,
  sulfur: 32.06,
  chlorine: 35.45,
};

// True periodic (group, period) coordinates so the table reads like the genuine article: H alone
// top-left, C/N/O on the right of period 2, P/S/Cl below them in period 3, and the noble gases
// stacked down group 18 (far right).
interface GP {
  g: number;
  p: number;
}
const ATOM_POS: Record<BaseAtom, GP> = {
  hydrogen: { g: 1, p: 1 },
  carbon: { g: 14, p: 2 },
  nitrogen: { g: 15, p: 2 },
  oxygen: { g: 16, p: 2 },
  phosphorus: { g: 15, p: 3 },
  sulfur: { g: 16, p: 3 },
  chlorine: { g: 17, p: 3 },
};
// Noble gases fill group 18, one per period (He→Rn). Real atomic numbers / weights alongside.
const NOBLE_POS: Record<string, GP> = {
  helium: { g: 18, p: 1 },
  neon: { g: 18, p: 2 },
  argon: { g: 18, p: 3 },
  krypton: { g: 18, p: 4 },
  xenon: { g: 18, p: 5 },
  radon: { g: 18, p: 6 },
};
const NOBLE_DATA: Record<string, { number: number; mass: number }> = {
  helium: { number: 2, mass: 4.003 },
  neon: { number: 10, mass: 20.18 },
  argon: { number: 18, mass: 39.948 },
  krypton: { number: 36, mass: 83.798 },
  xenon: { number: 54, mass: 131.29 },
  radon: { number: 86, mass: 222 },
};
const GOLD_POS: GP = { g: 11, p: 6 }; // Au — transition-metal block, period 6
const GOLD_NUMBER = 79;
const GOLD_MASS = 196.97;
const SILVER_POS: GP = { g: 11, p: 5 }; // Ag — group 11, directly above Gold (the coin metal)
const SILVER_NUMBER = 47;
const SILVER_MASS = 107.868;
const PLATINUM_POS: GP = { g: 10, p: 6 }; // Pt — beside Gold (the ×3 wildcard)
const PLATINUM_NUMBER = 78;
const PLATINUM_MASS = 195.08;
const SUPER_POS: GP = { g: 18, p: 7 }; // caps the noble-gas column — the weapon they unlock

const hex = (col: number): string => `#${col.toString(16).padStart(6, '0')}`;
const isBaseAtom = (id: AttackId): id is BaseAtom => (BASE_ATOMS as string[]).includes(id);
const shortName = (id: AttackId): string => ELEMENT_NAMES[id].replace(/\s*\(.*\)/, '');
const symbolOf = (id: AttackId): string => (isBaseAtom(id) ? ATOM_SYMBOL[id] : (COMPOUND_SYMBOL[id] ?? '?'));
const molarMass = (id: AttackId): number => {
  if (isBaseAtom(id)) return ATOMIC_MASS[id];
  const r = ATTACKS[id].recipe;
  return BASE_ATOMS.reduce((sum, a) => sum + (r[a] ?? 0) * ATOMIC_MASS[a], 0);
};

// ── Periodic grid geometry ─────────────────────────────────────────────────────
// The main table is an 18-group × 7-period lattice with compact cells; only our elements are placed.
const GROUPS = 18;
const MTW = 46; // main tile width
const MTH = 40; // main tile height
const MGAP = 4;
const GRID_W = GROUPS * MTW + (GROUPS - 1) * MGAP;
const MLEFT = (GAME_WIDTH - GRID_W) / 2;
const P_TOP = 100;
const P_STEP = 46;
const groupX = (g: number): number => MLEFT + (g - 1) * (MTW + MGAP) + MTW / 2;
const periodY = (p: number): number => P_TOP + (p - 1) * P_STEP;

// Compounds sit in a detached row along the very bottom (like the lanthanide/actinide strip), with
// their own wider cells so the formulas stay legible.
const CTW = 108;
const CTH = 42;
const CGAP = 8;
const CROW_GAP = 8; // vertical gap between the two compound rows
const COMP_Y = 440; // centre-y of the first compound row (a 2nd row sits CTH+CROW_GAP below when needed)

// The detail panel lives in the classic empty upper-middle void (the transition-metal gap of periods
// 1–4), exactly where a printed table prints its key/legend. Its foot stops above the group-11
// precious-metals column (Silver in period 5, Gold in period 6), which sits just below it.
const DET_X = 84;
const DET_Y = 58;
const DET_W = 592;
const DET_H = 200;
const DET_CX = DET_X + DET_W / 2;

type CellKind = 'atom' | 'compound' | 'gold' | 'silver' | 'platinum' | 'noble' | 'super';

interface Cell {
  kind: CellKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner number: atomic number for real elements, catalogue index for compounds; omitted for the
   *  super weapon (no periodic identity). */
  num?: number;
  symbol: string;
  name: string;
  color: number;
  /** Molar / atomic mass (omitted for the super weapon). */
  mass?: number;
  /** Present for atom & compound tiles — drives the recipe + attack-tier detail. */
  id?: AttackId;
}

/**
 * A static reference screen laid out like the real periodic table: the seven collectable base atoms
 * sit in their true (group, period) cells, the six noble gases stack down group 18 on the far right,
 * and the group-11 precious metals — Silver (coins) above Gold (×2 wildcard), with Platinum (×3
 * wildcard) beside Gold — sit in the transition-metal block. The Prismatic super weapon caps the
 * noble-gas column (it is what collecting them all unlocks). The assembled compounds form a detached
 * strip along the very bottom. Selecting any tile (arrows / tap) reveals its detail in the legend.
 */
export default class MoleculeTreeScene extends Phaser.Scene {
  private from = 'TitleScene';
  private cells: Cell[] = [];
  private cursor = 0;
  private selGfx!: Phaser.GameObjects.Graphics;

  private detailSymbol!: Phaser.GameObjects.Text;
  private detailRecipe!: Phaser.GameObjects.Text;
  private detailLabel!: Phaser.GameObjects.Text;
  private detailBody!: Phaser.GameObjects.Text;

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
      .text(cx, 22, 'PERIODIC TABLE', { fontSize: '24px', color: '#aaf0ff', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, 44, 'Atoms & noble gases in their true groups · compounds assembled below', {
        fontSize: '11px',
        color: '#6699aa',
        fontFamily: MONO,
      })
      .setOrigin(0.5);

    this._drawDecorations();

    // Base atoms in true periodic positions.
    (Object.keys(ATOM_POS) as BaseAtom[]).forEach((a) => {
      const pos = ATOM_POS[a];
      this._addCell({
        kind: 'atom',
        x: groupX(pos.g),
        y: periodY(pos.p),
        w: MTW,
        h: MTH,
        num: ATOMIC_NUMBER[a],
        symbol: ATOM_SYMBOL[a],
        name: shortName(a),
        color: ATTACKS[a].color,
        mass: ATOMIC_MASS[a],
        id: a,
      });
    });

    // Silver — the coin metal — sits in group 11, directly above Gold.
    this._addCell({
      kind: 'silver',
      x: groupX(SILVER_POS.g),
      y: periodY(SILVER_POS.p),
      w: MTW,
      h: MTH,
      num: SILVER_NUMBER,
      symbol: 'Ag',
      name: 'Silver',
      color: COIN_COLOR,
      mass: SILVER_MASS,
    });

    // Platinum — the ×3 wildcard — sits beside Gold in the transition-metal block.
    this._addCell({
      kind: 'platinum',
      x: groupX(PLATINUM_POS.g),
      y: periodY(PLATINUM_POS.p),
      w: MTW,
      h: MTH,
      num: PLATINUM_NUMBER,
      symbol: 'Pt',
      name: 'Platinum',
      color: ELEMENT_COLORS[ELEMENTS.PLATINUM],
      mass: PLATINUM_MASS,
    });

    // Gold — the wildcard — sits in the transition-metal block.
    this._addCell({
      kind: 'gold',
      x: groupX(GOLD_POS.g),
      y: periodY(GOLD_POS.p),
      w: MTW,
      h: MTH,
      num: GOLD_NUMBER,
      symbol: 'Au',
      name: 'Gold',
      color: ELEMENT_COLORS[ELEMENTS.GOLD],
      mass: GOLD_MASS,
    });

    // Noble gases fill group 18 (far-right column), one per period.
    NOBLE_GASES.forEach((n) => {
      const pos = NOBLE_POS[n.id];
      const d = NOBLE_DATA[n.id];
      this._addCell({
        kind: 'noble',
        x: groupX(pos.g),
        y: periodY(pos.p),
        w: MTW,
        h: MTH,
        num: d.number,
        symbol: n.symbol,
        name: n.name,
        color: n.color,
        mass: d.mass,
      });
    });

    // Super weapon caps the noble-gas column.
    this._addCell({
      kind: 'super',
      x: groupX(SUPER_POS.g),
      y: periodY(SUPER_POS.p),
      w: MTW,
      h: MTH,
      symbol: '✦',
      name: 'Prismatic',
      color: ATTACKS[ELEMENTS.PRISMATIC].color,
    });

    // Compounds — detached strip along the very bottom, catalogued 1..n. Up to eight fit one row; with
    // more (the sulfur/chlorine/phosphorus molecules push the count past that) they wrap into two rows
    // so the wide, legible cells never run off the screen edges.
    const compounds = ATTACK_ORDER.filter((id) => !isBaseAtom(id));
    const perRow = compounds.length > 8 ? Math.ceil(compounds.length / 2) : compounds.length;
    compounds.forEach((id, i) => {
      const row = Math.floor(i / perRow);
      const col = i - row * perRow;
      const rowCount = row === 0 ? perRow : compounds.length - perRow;
      const rowW = rowCount * CTW + (rowCount - 1) * CGAP;
      const cLeft = (GAME_WIDTH - rowW) / 2;
      this._addCell({
        kind: 'compound',
        x: cLeft + col * (CTW + CGAP) + CTW / 2,
        y: COMP_Y + row * (CTH + CROW_GAP),
        w: CTW,
        h: CTH,
        num: i + 1,
        symbol: symbolOf(id),
        name: shortName(id),
        color: ATTACKS[id].color,
        mass: molarMass(id),
        id,
      });
    });

    // Selection ring sits above the tiles.
    this.selGfx = this.add.graphics().setDepth(6);

    this._buildDetailPanel();

    this.add
      .text(
        cx,
        GAME_HEIGHT - 12,
        Settings.touchActive()
          ? 'Tap a tile to inspect    ·    tap to go back'
          : '← → ↑ ↓ inspect    ESC / Z  or tap  to go back',
        {
          fontSize: '12px',
          color: '#557766',
          fontFamily: MONO,
        },
      )
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

  /** Period numbers, the noble-gas group highlight, and the detached-compounds divider. */
  private _drawDecorations(): void {
    // Faint period numbers down the left edge.
    for (let p = 1; p <= 6; p++) {
      this.add
        .text(MLEFT - 16, periodY(p), `${p}`, { fontSize: '10px', color: '#33505a', fontFamily: MONO })
        .setOrigin(0.5);
    }

    // Highlight box behind group 18 — "the noble gases" — extended down over the super weapon.
    const gx = groupX(18);
    const boxTop = periodY(1) - MTH / 2 - 4;
    const boxBot = periodY(7) + MTH / 2 + 4;
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x2a3a4a, 0.35);
    g.fillRoundedRect(gx - MTW / 2 - 4, boxTop, MTW + 8, boxBot - boxTop, 6);
    g.lineStyle(1, 0x4a6a7a, 0.4);
    g.strokeRoundedRect(gx - MTW / 2 - 4, boxTop, MTW + 8, boxBot - boxTop, 6);
    this.add.text(gx, boxTop - 9, 'NOBLE', { fontSize: '8px', color: '#7fa0b0', fontFamily: MONO }).setOrigin(0.5);

    // Divider + label above the detached compounds strip.
    const dy = COMP_Y - CTH / 2 - 16;
    const dg = this.add.graphics().setDepth(0);
    dg.lineStyle(1, 0x2a4a55, 0.6);
    dg.lineBetween(80, dy, GAME_WIDTH - 80, dy);
    this.add
      .text(GAME_WIDTH / 2, dy - 9, 'COMPOUNDS — atoms assembled into stronger attacks', {
        fontSize: '10px',
        color: '#5f7f8a',
        fontFamily: MONO,
      })
      .setOrigin(0.5);
  }

  private _addCell(cell: Cell): void {
    this.cells.push(cell);
    this._drawCell(cell);
  }

  /** Draw one periodic-table tile: corner number + symbol (main cells) or formula + name (compounds). */
  private _drawCell(cell: Cell): void {
    const { x, y, w, h, color: col } = cell;
    const left = x - w / 2;
    const top = y - h / 2;

    const g = this.add.graphics().setDepth(1);
    g.fillStyle(Phaser.Display.Color.IntegerToColor(col).darken(72).color, 0.95);
    g.fillRect(left, top, w, h);
    g.lineStyle(cell.kind === 'super' ? 2 : 1.25, col, cell.kind === 'super' ? 0.9 : 0.5);
    g.strokeRect(left, top, w, h);
    // A coloured cap strip across the top edge — a classic periodic-cell flourish.
    g.fillStyle(col, 0.5);
    g.fillRect(left, top, w, 3);

    if (cell.num !== undefined) {
      this.add
        .text(left + 5, top + 4, `${cell.num}`, { fontSize: '9px', color: '#9fb4bd', fontFamily: MONO })
        .setOrigin(0, 0)
        .setDepth(3);
    }

    if (cell.kind === 'compound') {
      this.add
        .text(x, y - 8, cell.symbol, { fontSize: '16px', color: hex(col), fontFamily: MONO, fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(3);
      const nameT = this.add
        .text(x, y + 11, cell.name, { fontSize: '9px', color: '#cfe0e8', fontFamily: MONO })
        .setOrigin(0.5)
        .setDepth(3);
      // Shrink names too wide for the cell (e.g. "Phosphorus Trichloride") so they never spill out.
      const maxNameW = w - 8;
      if (nameT.width > maxNameW) nameT.setScale(maxNameW / nameT.width);
    } else {
      // Compact main cell: just the symbol, centred (name & mass appear in the detail panel).
      this.add
        .text(x, y + 2, cell.symbol, {
          fontSize: cell.kind === 'super' ? '20px' : '18px',
          color: hex(col),
          fontFamily: MONO,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(3);
    }

    // Touch: tap a tile to inspect it.
    const idx = this.cells.length - 1;
    const zone = this.add.rectangle(x, y, w, h, 0x000000, 0).setDepth(4);
    attachTap(zone, () => {
      this.cursor = idx;
      this._refresh();
    });
  }

  private _buildDetailPanel(): void {
    const panel = this.add.graphics().setDepth(1);
    panel.fillStyle(0x0a1820, 0.92);
    panel.fillRoundedRect(DET_X, DET_Y, DET_W, DET_H, 8);
    panel.lineStyle(1.5, 0x2a4a55, 0.9);
    panel.strokeRoundedRect(DET_X, DET_Y, DET_W, DET_H, 8);
    this.add
      .text(DET_X + 10, DET_Y + 8, 'SELECTED', { fontSize: '9px', color: '#3f5f6a', fontFamily: MONO })
      .setOrigin(0, 0)
      .setDepth(2);

    this.detailSymbol = this.add
      .text(DET_CX, DET_Y + 40, '', { fontSize: '24px', color: '#ffffff', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);
    this.detailRecipe = this.add
      .text(DET_CX, DET_Y + 76, '', { fontSize: '13px', color: '#aebcc6', fontFamily: MONO })
      .setOrigin(0.5)
      .setDepth(2);
    this.detailLabel = this.add
      .text(DET_CX, DET_Y + 108, '', { fontSize: '11px', color: '#5f7f8a', fontFamily: MONO })
      .setOrigin(0.5)
      .setDepth(2);
    this.detailBody = this.add
      .text(DET_CX, DET_Y + 130, '', {
        fontSize: '13px',
        color: '#c4d2da',
        fontFamily: MONO,
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: DET_W - 44 },
      })
      .setOrigin(0.5, 0)
      .setDepth(2);
  }

  private _refresh(): void {
    const cell = this.cells[this.cursor];
    const col = cell.color;

    // Selection ring around the active tile.
    this.selGfx.clear();
    this.selGfx.lineStyle(3, col, 1);
    this.selGfx.strokeRect(cell.x - cell.w / 2 - 2, cell.y - cell.h / 2 - 2, cell.w + 4, cell.h + 4);
    this.selGfx.lineStyle(2, col, 0.3);
    this.selGfx.strokeRect(cell.x - cell.w / 2 - 6, cell.y - cell.h / 2 - 6, cell.w + 12, cell.h + 12);

    // Detail panel — content varies by tile kind.
    this.detailSymbol.setText(`${cell.symbol}   ${cell.name}`).setColor(hex(col));

    switch (cell.kind) {
      case 'atom':
        this.detailRecipe.setText(`Atomic no. ${cell.num}  ·  base atom — collect it directly`);
        this.detailLabel.setText('ATTACK TIERS');
        // biome-ignore lint/style/noNonNullAssertion: atom cells always carry an id
        this.detailBody.setText(ATTACKS[cell.id!].tierNames.map((n, i) => `Lv${i + 1}   ${n}`).join('\n'));
        break;
      case 'compound': {
        // biome-ignore lint/style/noNonNullAssertion: compound cells always carry an id
        const id = cell.id!;
        const recipe = BASE_ATOMS.filter((a) => ATTACKS[id].recipe[a])
          .map((a) => `${ATTACKS[id].recipe[a]} ${ATOM_SYMBOL[a]}`)
          .join('  +  ');
        this.detailRecipe.setText(`Recipe:  ${recipe}`);
        this.detailLabel.setText('ATTACK TIERS');
        this.detailBody.setText(ATTACKS[id].tierNames.map((n, i) => `Lv${i + 1}   ${n}`).join('\n'));
        break;
      }
      case 'gold':
        this.detailRecipe.setText(`Atomic no. ${cell.num}  ·  rare wildcard pickup (~1%)`);
        this.detailLabel.setText('WILDCARD  ×2');
        this.detailBody.setText(
          'Grab it to pick any one atom and gain TWO of it at once —\ntwo level-ups from a single find.',
        );
        break;
      case 'platinum':
        this.detailRecipe.setText(`Atomic no. ${cell.num}  ·  ultra-rare wildcard pickup (~0.1%)`);
        this.detailLabel.setText('WILDCARD  ×3');
        this.detailBody.setText(
          'Even rarer than Gold. Pick any one atom and gain THREE —\nthree level-ups from a single find.',
        );
        break;
      case 'silver':
        this.detailRecipe.setText(`Atomic no. ${cell.num}  ·  standard atomic weight ${cell.mass?.toFixed(3)}`);
        this.detailLabel.setText('SILVER COINS');
        this.detailBody.setText(
          `${COINS_PER_STAGE} coins line every level — each worth ${COIN_SCORE} pts.\nSweep them all in a stage for a +${COIN_BONUS.toLocaleString()} bonus.`,
        );
        break;
      case 'noble':
        this.detailRecipe.setText(`Atomic no. ${cell.num}  ·  standard atomic weight ${cell.mass?.toFixed(3)}`);
        this.detailLabel.setText('NOBLE GAS');
        this.detailBody.setText(
          `Inert — no attack of its own, but a big score bonus.\nCollect all ${NOBLE_GAS_COUNT} noble gases to arm the Prismatic Beam.`,
        );
        break;
      case 'super':
        this.detailRecipe.setText(
          `Requires all ${NOBLE_GAS_COUNT} noble gases:  ${NOBLE_GASES.map((n) => n.symbol).join('  ')}`,
        );
        this.detailLabel.setText('SUPER WEAPON');
        this.detailBody.setText(
          'A sweeping rainbow beam that scours the whole screen.\nArmed permanently once every noble gas is collected.',
        );
        break;
    }
  }

  /** Directional cursor move: pick the nearest tile that lies in the pressed direction. */
  private _move(dirX: number, dirY: number): void {
    const cur = this.cells[this.cursor];
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    this.cells.forEach((c, i) => {
      if (i === this.cursor) return;
      const ddx = c.x - cur.x;
      const ddy = c.y - cur.y;
      let primary: number;
      let cross: number;
      if (dirX !== 0) {
        if (Math.sign(ddx) !== dirX) return;
        primary = Math.abs(ddx);
        cross = Math.abs(ddy);
      } else {
        if (Math.sign(ddy) !== dirY) return;
        primary = Math.abs(ddy);
        cross = Math.abs(ddx);
      }
      const score = primary + cross * 2; // strongly prefer tiles aligned with the travel axis
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) {
      this.cursor = best;
      this._refresh();
    }
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
