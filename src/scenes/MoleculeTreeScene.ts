import Phaser from 'phaser';
import {
  ARMOR_DROPS,
  ARMOR_IDS,
  type ArmorId,
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
  HEAL_DROPS,
  HEAL_IDS,
  type HealId,
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
  sodium: 'Na',
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
  sodium_chloride: 'NaCl',
  sodium_hydroxide: 'NaOH',
  sodium_carbonate: 'Na₂CO₃',
  sodium_nitrate: 'NaNO₃',
};

// Real periodic-table data for the collectable atoms (atomic number + standard atomic weight);
// compound weights are summed from their recipes.
const ATOMIC_NUMBER: Record<BaseAtom, number> = {
  hydrogen: 1,
  carbon: 6,
  nitrogen: 7,
  oxygen: 8,
  sodium: 11,
  phosphorus: 15,
  sulfur: 16,
  chlorine: 17,
};
const ATOMIC_MASS: Record<BaseAtom, number> = {
  hydrogen: 1.008,
  carbon: 12.011,
  nitrogen: 14.007,
  oxygen: 15.999,
  sodium: 22.99,
  phosphorus: 30.974,
  sulfur: 32.06,
  chlorine: 35.45,
};

// True periodic (group, period) coordinates so the table reads like the genuine article: H alone
// top-left with Na beneath it in group 1, C/N/O on the right of period 2, P/S/Cl below them in
// period 3, and the noble gases stacked down group 18 (far right).
interface GP {
  g: number;
  p: number;
}
const ATOM_POS: Record<BaseAtom, GP> = {
  hydrogen: { g: 1, p: 1 },
  sodium: { g: 1, p: 3 },
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
// Healing drops (Ca / Zn) — the "elements of life". Real (group, period) cells in period 4: Calcium in
// group 2, Zinc in group 12, both otherwise-empty slots on our sparse table.
const HEAL_POS: Record<HealId, GP> = {
  calcium: { g: 2, p: 4 },
  zinc: { g: 12, p: 4 },
};
const HEAL_DATA: Record<HealId, { number: number; mass: number }> = {
  calcium: { number: 20, mass: 40.078 },
  zinc: { number: 30, mass: 65.38 },
};
// Armor drops (Fe) — Iron in its true cell: group 8, period 4 (between Calcium and Zinc).
const ARMOR_POS: Record<ArmorId, GP> = {
  iron: { g: 8, p: 4 },
};
const ARMOR_DATA: Record<ArmorId, { number: number; mass: number }> = {
  iron: { number: 26, mass: 55.845 },
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

// ── Full periodic table through Radon (Z = 86) ──────────────────────────────────
// Every element up to Rn is shown so the table reads complete. The game's own elements are drawn as
// bright, selectable cells (see create); every other element is a greyed, non-selectable reference
// tile carrying just its atomic number and symbol. Lanthanides (57–71) sit in the detached f-block
// strip on the period-7 row, below the main grid.
interface PElem {
  z: number;
  sym: string;
  g: number;
  p: number;
}
// Main-grid elements 1–86 in their true (group, period) cells (lanthanides handled separately below).
const FULL_TABLE: PElem[] = [
  { z: 1, sym: 'H', g: 1, p: 1 },
  { z: 2, sym: 'He', g: 18, p: 1 },
  { z: 3, sym: 'Li', g: 1, p: 2 },
  { z: 4, sym: 'Be', g: 2, p: 2 },
  { z: 5, sym: 'B', g: 13, p: 2 },
  { z: 6, sym: 'C', g: 14, p: 2 },
  { z: 7, sym: 'N', g: 15, p: 2 },
  { z: 8, sym: 'O', g: 16, p: 2 },
  { z: 9, sym: 'F', g: 17, p: 2 },
  { z: 10, sym: 'Ne', g: 18, p: 2 },
  { z: 11, sym: 'Na', g: 1, p: 3 },
  { z: 12, sym: 'Mg', g: 2, p: 3 },
  { z: 13, sym: 'Al', g: 13, p: 3 },
  { z: 14, sym: 'Si', g: 14, p: 3 },
  { z: 15, sym: 'P', g: 15, p: 3 },
  { z: 16, sym: 'S', g: 16, p: 3 },
  { z: 17, sym: 'Cl', g: 17, p: 3 },
  { z: 18, sym: 'Ar', g: 18, p: 3 },
  { z: 19, sym: 'K', g: 1, p: 4 },
  { z: 20, sym: 'Ca', g: 2, p: 4 },
  { z: 21, sym: 'Sc', g: 3, p: 4 },
  { z: 22, sym: 'Ti', g: 4, p: 4 },
  { z: 23, sym: 'V', g: 5, p: 4 },
  { z: 24, sym: 'Cr', g: 6, p: 4 },
  { z: 25, sym: 'Mn', g: 7, p: 4 },
  { z: 26, sym: 'Fe', g: 8, p: 4 },
  { z: 27, sym: 'Co', g: 9, p: 4 },
  { z: 28, sym: 'Ni', g: 10, p: 4 },
  { z: 29, sym: 'Cu', g: 11, p: 4 },
  { z: 30, sym: 'Zn', g: 12, p: 4 },
  { z: 31, sym: 'Ga', g: 13, p: 4 },
  { z: 32, sym: 'Ge', g: 14, p: 4 },
  { z: 33, sym: 'As', g: 15, p: 4 },
  { z: 34, sym: 'Se', g: 16, p: 4 },
  { z: 35, sym: 'Br', g: 17, p: 4 },
  { z: 36, sym: 'Kr', g: 18, p: 4 },
  { z: 37, sym: 'Rb', g: 1, p: 5 },
  { z: 38, sym: 'Sr', g: 2, p: 5 },
  { z: 39, sym: 'Y', g: 3, p: 5 },
  { z: 40, sym: 'Zr', g: 4, p: 5 },
  { z: 41, sym: 'Nb', g: 5, p: 5 },
  { z: 42, sym: 'Mo', g: 6, p: 5 },
  { z: 43, sym: 'Tc', g: 7, p: 5 },
  { z: 44, sym: 'Ru', g: 8, p: 5 },
  { z: 45, sym: 'Rh', g: 9, p: 5 },
  { z: 46, sym: 'Pd', g: 10, p: 5 },
  { z: 47, sym: 'Ag', g: 11, p: 5 },
  { z: 48, sym: 'Cd', g: 12, p: 5 },
  { z: 49, sym: 'In', g: 13, p: 5 },
  { z: 50, sym: 'Sn', g: 14, p: 5 },
  { z: 51, sym: 'Sb', g: 15, p: 5 },
  { z: 52, sym: 'Te', g: 16, p: 5 },
  { z: 53, sym: 'I', g: 17, p: 5 },
  { z: 54, sym: 'Xe', g: 18, p: 5 },
  { z: 55, sym: 'Cs', g: 1, p: 6 },
  { z: 56, sym: 'Ba', g: 2, p: 6 },
  { z: 72, sym: 'Hf', g: 4, p: 6 },
  { z: 73, sym: 'Ta', g: 5, p: 6 },
  { z: 74, sym: 'W', g: 6, p: 6 },
  { z: 75, sym: 'Re', g: 7, p: 6 },
  { z: 76, sym: 'Os', g: 8, p: 6 },
  { z: 77, sym: 'Ir', g: 9, p: 6 },
  { z: 78, sym: 'Pt', g: 10, p: 6 },
  { z: 79, sym: 'Au', g: 11, p: 6 },
  { z: 80, sym: 'Hg', g: 12, p: 6 },
  { z: 81, sym: 'Tl', g: 13, p: 6 },
  { z: 82, sym: 'Pb', g: 14, p: 6 },
  { z: 83, sym: 'Bi', g: 15, p: 6 },
  { z: 84, sym: 'Po', g: 16, p: 6 },
  { z: 85, sym: 'At', g: 17, p: 6 },
  { z: 86, sym: 'Rn', g: 18, p: 6 },
];
// Lanthanides — the f-block strip (57–71), drawn on the detached period-7 row under group 3.
const LANTHANIDES: { z: number; sym: string }[] = [
  { z: 57, sym: 'La' },
  { z: 58, sym: 'Ce' },
  { z: 59, sym: 'Pr' },
  { z: 60, sym: 'Nd' },
  { z: 61, sym: 'Pm' },
  { z: 62, sym: 'Sm' },
  { z: 63, sym: 'Eu' },
  { z: 64, sym: 'Gd' },
  { z: 65, sym: 'Tb' },
  { z: 66, sym: 'Dy' },
  { z: 67, sym: 'Ho' },
  { z: 68, sym: 'Er' },
  { z: 69, sym: 'Tm' },
  { z: 70, sym: 'Yb' },
  { z: 71, sym: 'Lu' },
];
/** Atomic numbers already drawn as bright, selectable game cells (base atoms, noble gases, Ca/Zn/Fe,
 *  Ag/Au/Pt) — skipped by the greyed filler so they are not drawn twice. */
const GAME_ELEMENTS = new Set<number>([1, 2, 6, 7, 8, 10, 11, 15, 16, 17, 18, 20, 26, 30, 36, 47, 54, 78, 79, 86]);

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
const P_STEP = 44;
const groupX = (g: number): number => MLEFT + (g - 1) * (MTW + MGAP) + MTW / 2;
const periodY = (p: number): number => P_TOP + (p - 1) * P_STEP;

// Compounds sit in a detached row along the very bottom (like the lanthanide/actinide strip), with
// their own wider cells so the formulas stay legible.
const CTW_MAX = 108; // preferred compound tile width; narrowed to fit when a row gets crowded
const CMARGIN = 24; // min breathing room at each screen edge for the compound strip
const CTH = 42;
const CGAP = 8;
const CROW_GAP = 8; // vertical gap between the two compound rows
const COMP_Y = 440; // centre-y of the first compound row (a 2nd row sits CTH+CROW_GAP below when needed)

// The detail panel lives in the classic empty upper-middle void, exactly where a printed table prints
// its key/legend. With the table now filled through Rn, the only genuinely empty span in periods 1–3
// is groups 3–12 (period 2/3 jump straight from group 2 to group 13), so the panel is sized to sit
// strictly inside that span — clear of the group-2 (Be/Mg) and group-13 (B/Al) cells on either side —
// and its foot stops above period 4 (where Calcium/Iron/Zinc sit).
const DET_X = 138;
const DET_Y = 58;
const DET_W = 484;
const DET_H = 144;
const DET_CX = DET_X + DET_W / 2;

type CellKind = 'atom' | 'compound' | 'gold' | 'silver' | 'platinum' | 'noble' | 'super' | 'heal' | 'armor';

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
  /** Present for healing-drop tiles (Ca/Zn) — drives the HP-restore detail. */
  healId?: HealId;
  /** Present for armor-drop tiles (Fe) — drives the armor-buffer detail. */
  armorId?: ArmorId;
}

/**
 * A static reference screen laid out like the real periodic table: the seven collectable base atoms
 * sit in their true (group, period) cells, the six noble gases stack down group 18 on the far right,
 * and the group-11 precious metals — Silver (coins) above Gold (×2 wildcard), with Platinum (×3
 * wildcard) beside Gold — sit in the transition-metal block. The life/power-up drops take their true
 * period-4 cells: the healing drops Calcium (group 2) and Zinc (group 12) flank the armor drop Iron
 * (group 8). The Prismatic super weapon caps the noble-gas column (it is what collecting them all
 * unlocks). The assembled compounds form a detached strip along the very bottom. Selecting any tile
 * (arrows / tap) reveals its detail in the legend.
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
      .text(cx, 44, 'Every element through Radon (86) · bright = in play, grey = reference · compounds below', {
        fontSize: '11px',
        color: '#6699aa',
        fontFamily: MONO,
      })
      .setOrigin(0.5);

    this._drawDecorations();
    this._drawFillerElements();

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

    // Healing drops (Ca / Zn) — the "elements of life", in their true period-4 cells.
    HEAL_IDS.forEach((h) => {
      const pos = HEAL_POS[h];
      const d = HEAL_DATA[h];
      const def = HEAL_DROPS[h];
      this._addCell({
        kind: 'heal',
        x: groupX(pos.g),
        y: periodY(pos.p),
        w: MTW,
        h: MTH,
        num: d.number,
        symbol: def.symbol,
        name: def.name,
        color: def.color,
        mass: d.mass,
        healId: h,
      });
    });

    // Armor drops (Fe) — Iron in its true period-4 cell, between Calcium and Zinc.
    ARMOR_IDS.forEach((a) => {
      const pos = ARMOR_POS[a];
      const d = ARMOR_DATA[a];
      const def = ARMOR_DROPS[a];
      this._addCell({
        kind: 'armor',
        x: groupX(pos.g),
        y: periodY(pos.p),
        w: MTW,
        h: MTH,
        num: d.number,
        symbol: def.symbol,
        name: def.name,
        color: def.color,
        mass: d.mass,
        armorId: a,
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
    // more (the sulfur/chlorine/phosphorus and sodium molecules push the count well past that) they
    // wrap into two rows, and the tiles narrow from their preferred width as needed so even a crowded
    // row never runs off the screen edges. Over-long names shrink to fit inside the tile (see _drawCell).
    const compounds = ATTACK_ORDER.filter((id) => !isBaseAtom(id));
    const perRow = compounds.length > 8 ? Math.ceil(compounds.length / 2) : compounds.length;
    const ctw = Math.min(CTW_MAX, Math.floor((GAME_WIDTH - CMARGIN * 2 - CGAP * (perRow - 1)) / perRow));
    compounds.forEach((id, i) => {
      const row = Math.floor(i / perRow);
      const col = i - row * perRow;
      const rowCount = row === 0 ? perRow : compounds.length - perRow;
      const rowW = rowCount * ctw + (rowCount - 1) * CGAP;
      const cLeft = (GAME_WIDTH - rowW) / 2;
      this._addCell({
        kind: 'compound',
        x: cLeft + col * (ctw + CGAP) + ctw / 2,
        y: COMP_Y + row * (CTH + CROW_GAP),
        w: ctw,
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

  /** Draw every non-game element (through Rn, 86) as a greyed, non-selectable reference tile so the
   *  table reads as the complete real thing. Bright, selectable game cells are drawn separately. */
  private _drawFillerElements(): void {
    for (const e of FULL_TABLE) {
      if (GAME_ELEMENTS.has(e.z)) continue; // its bright, selectable cell is drawn in create()
      this._drawFiller(e.z, e.sym, groupX(e.g), periodY(e.p));
    }
    // Lanthanides (57–71) on the detached f-block strip, aligned from group 3 along the period-7 row.
    LANTHANIDES.forEach((e, i) => {
      this._drawFiller(e.z, e.sym, groupX(3 + i), periodY(7));
    });
    // The classic "*" placeholder in the group-3 / period-6 slot the lanthanides fold out of.
    this.add
      .text(groupX(3), periodY(6), '*', { fontSize: '16px', color: '#3f515a', fontFamily: MONO })
      .setOrigin(0.5)
      .setDepth(2);
  }

  /** One greyed reference tile: atomic number + symbol, dimmed and inert. It swallows taps (so a tap on
   *  it does nothing, rather than dropping through to the backdrop's tap-to-exit) but is never added to
   *  `this.cells`, so the keyboard cursor never lands on it. */
  private _drawFiller(z: number, sym: string, x: number, y: number): void {
    const left = x - MTW / 2;
    const top = y - MTH / 2;
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x0d151b, 0.9);
    g.fillRect(left, top, MTW, MTH);
    g.lineStyle(1, 0x24323b, 0.7);
    g.strokeRect(left, top, MTW, MTH);
    this.add
      .text(left + 5, top + 4, `${z}`, { fontSize: '8px', color: '#3f515a', fontFamily: MONO })
      .setOrigin(0, 0)
      .setDepth(2);
    this.add
      .text(x, y + 2, sym, { fontSize: '14px', color: '#63747d', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);
    const zone = this.add.rectangle(x, y, MTW, MTH, 0x000000, 0).setDepth(4);
    attachTap(zone, () => {}); // greyed elements are not selectable; just swallow the tap
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

    // Rows are pulled up compactly so all content clears the panel's short foot (it sits above the
    // period-4 drop cells); the panel is wide, so descriptions render one line per sentence.
    this.detailSymbol = this.add
      .text(DET_CX, DET_Y + 30, '', { fontSize: '22px', color: '#ffffff', fontFamily: MONO, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(2);
    this.detailRecipe = this.add
      .text(DET_CX, DET_Y + 54, '', { fontSize: '12px', color: '#aebcc6', fontFamily: MONO })
      .setOrigin(0.5)
      .setDepth(2);
    this.detailLabel = this.add
      .text(DET_CX, DET_Y + 74, '', { fontSize: '11px', color: '#5f7f8a', fontFamily: MONO })
      .setOrigin(0.5)
      .setDepth(2);
    this.detailBody = this.add
      .text(DET_CX, DET_Y + 90, '', {
        fontSize: '12px',
        color: '#c4d2da',
        fontFamily: MONO,
        align: 'center',
        lineSpacing: 2,
        wordWrap: { width: DET_W - 40 },
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
      case 'heal': {
        // biome-ignore lint/style/noNonNullAssertion: heal cells always carry a healId
        const def = HEAL_DROPS[cell.healId!];
        this.detailRecipe.setText(`Atomic no. ${cell.num}  ·  standard atomic weight ${cell.mass?.toFixed(3)}`);
        this.detailLabel.setText('HEALING DROP');
        this.detailBody.setText(
          `An element of life — restores ${def.heal} HP when grabbed.\n${def.perStage} ${def.perStage === 1 ? 'drop' : 'drops'} tucked into every level.`,
        );
        break;
      }
      case 'armor': {
        // biome-ignore lint/style/noNonNullAssertion: armor cells always carry an armorId
        const def = ARMOR_DROPS[cell.armorId!];
        this.detailRecipe.setText(`Atomic no. ${cell.num}  ·  standard atomic weight ${cell.mass?.toFixed(3)}`);
        this.detailLabel.setText('ARMOR DROP');
        this.detailBody.setText(
          `Grants ${def.armor} armor — a buffer that soaks damage before HP.\n${def.perStage} ${def.perStage === 1 ? 'drop' : 'drops'} tucked into every level.`,
        );
        break;
      }
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
