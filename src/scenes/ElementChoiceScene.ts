import Phaser from 'phaser';
import {
  ATTACK_ORDER,
  ATTACKS,
  type AttackId,
  type BaseAtom,
  ELEMENT_COLORS,
  ELEMENT_FACTS,
  ELEMENT_NAMES,
  ELEMENTS,
  type ElementType,
  GAME_HEIGHT,
  GAME_WIDTH,
} from '../constants';
import ElementSystem from '../systems/ElementSystem';
import Settings from '../systems/Settings';
import { attachTap } from '../systems/touchMenu';

const ELEMENT_SYMBOLS: Partial<Record<ElementType, string>> = {
  hydrogen: 'H',
  oxygen: 'O',
  water: 'H₂O',
  carbon: 'C',
  nitrogen: 'N',
  ammonia: 'NH₃',
  carbon_dioxide: 'CO₂',
  methane: 'CH₄',
  nitric_oxide: 'NO',
  carbonic_acid: 'H₂CO₃',
  sulfur: 'S',
  chlorine: 'Cl',
  phosphorus: 'P',
  sodium: 'Na',
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

interface Card {
  bg: Phaser.GameObjects.Rectangle;
  border: Phaser.GameObjects.Rectangle;
  element: BaseAtom;
}

interface ChoiceData {
  choices: BaseAtom[];
  counts?: Record<BaseAtom, number>;
  /** Atoms granted per pick (Gold wildcard grants 2, Platinum grants 3). */
  grant?: number;
  /** Render the rare Gold-wildcard framing. */
  gold?: boolean;
  /** Render the ultra-rare Platinum-wildcard framing (takes precedence over gold). */
  platinum?: boolean;
  callback: (chosen: BaseAtom) => void;
}

const PLATINUM_HEX = `#${ELEMENT_COLORS[ELEMENTS.PLATINUM].toString(16).padStart(6, '0')}`;

export default class ElementChoiceScene extends Phaser.Scene {
  private choices!: BaseAtom[];
  private counts!: Record<BaseAtom, number>;
  private callback!: (chosen: BaseAtom) => void;
  private grant = 1;
  private gold = false;
  private platinum = false;
  private selected = 0;
  private cards!: Card[];

  constructor() {
    super('ElementChoiceScene');
  }

  init(data: ChoiceData): void {
    this.choices = data.choices;
    this.counts = data.counts ?? {
      hydrogen: 0,
      oxygen: 0,
      carbon: 0,
      nitrogen: 0,
      sulfur: 0,
      chlorine: 0,
      phosphorus: 0,
      sodium: 0,
    };
    this.grant = data.grant ?? 1;
    this.gold = data.gold ?? false;
    this.platinum = data.platinum ?? false;
    this.callback = data.callback;
    this.selected = 0;
  }

  /** Attacks that picking `element` would unlock or level, given the current molecule. */
  private _changes(element: BaseAtom): { id: AttackId; level: number; isNew: boolean }[] {
    const after = { ...this.counts, [element]: this.counts[element] + this.grant };
    const out: { id: AttackId; level: number; isNew: boolean }[] = [];
    for (const id of ATTACK_ORDER) {
      const before = ElementSystem.levelFor(id, this.counts);
      const level = ElementSystem.levelFor(id, after);
      if (level > before) out.push({ id, level, isNew: before === 0 });
    }
    return out;
  }

  create(): void {
    const w = GAME_WIDTH,
      h = GAME_HEIGHT;

    const special = this.gold || this.platinum;
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, special ? 0.78 : 0.72).setDepth(0);
    const title = this.platinum ? '◆  PLATINUM ATOM  ◆' : this.gold ? '★  GOLD ATOM  ★' : '⚛  ADD AN ATOM  ⚛';
    this.add
      .text(w / 2, 78, title, {
        fontSize: '32px',
        color: this.platinum ? PLATINUM_HEX : this.gold ? '#ffd700' : '#cc88ff',
        fontStyle: 'bold',
        stroke: this.platinum ? '#334455' : this.gold ? '#553300' : '#440066',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(2);
    const subtitle = this.platinum
      ? `An ultra-rare find! Pick any element — it counts as +${this.grant} (three level-ups):`
      : this.gold
        ? `A rare find! Pick any element — it counts as +${this.grant} (two level-ups):`
        : 'Grow your molecule — each pick unlocks & levels attacks:';
    this.add
      .text(w / 2, 122, subtitle, {
        fontSize: '18px',
        color: this.platinum ? '#dceaf6' : this.gold ? '#ffe680' : '#aaaacc',
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.cards = this.choices.map((el, i) => this._buildCard(el, i));

    this.add
      .text(
        w / 2,
        h - 48,
        Settings.touchActive() ? 'Tap a card, tap again to confirm' : '← → to choose   Z to confirm',
        {
          fontSize: '17px',
          color: '#9999aa',
        },
      )
      .setOrigin(0.5)
      .setDepth(2);

    this._highlight(0);

    this.input.keyboard?.on('keydown-LEFT', () => this._move(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this._move(1));
    this.input.keyboard?.on('keydown-A', () => this._move(-1));
    this.input.keyboard?.on('keydown-D', () => this._move(1));
    this.input.keyboard?.on('keydown-Z', () => this._confirm());
    this.input.keyboard?.on('keydown-ENTER', () => this._confirm());
  }

  private _buildCard(element: BaseAtom, index: number): Card {
    const col = this.platinum ? ELEMENT_COLORS[ELEMENTS.PLATINUM] : this.gold ? 0xffd700 : ELEMENT_COLORS[element];
    const hex = `#${col.toString(16).padStart(6, '0')}`;

    // Layout. Up to 4 cards sit in a single tall row (the classic 2-/3-/4-card look). With more than
    // four choices (a Gold pick now offers all eight base atoms) the cards would get too skinny, so we
    // wrap into two rows and switch each card to a shorter, compact content layout.
    const n = this.choices.length;
    const twoRows = n > 4;
    const cols = twoRows ? Math.ceil(n / 2) : n;
    const GAP = twoRows ? 20 : 28;
    const MARGIN = 24; // min breathing room on each side
    const cardW = Math.min(240, Math.floor((GAME_WIDTH - MARGIN * 2 - GAP * (cols - 1)) / cols));
    const cardH = twoRows ? 158 : 336;
    const row = twoRows ? Math.floor(index / cols) : 0;
    const colIndex = index - row * cols;
    const rowCount = twoRows ? (row === 0 ? cols : n - cols) : n; // last row may hold fewer cards
    const rowW = rowCount * cardW + GAP * (rowCount - 1);
    const startX = (GAME_WIDTH - rowW) / 2 + colIndex * (cardW + GAP) + cardW / 2;
    const ROW_GAP = 18;
    const topY = twoRows ? 150 : GAME_HEIGHT / 2 + 36 - cardH / 2;
    const cardY = topY + row * (cardH + ROW_GAP) + cardH / 2;
    const top = cardY - cardH / 2;

    const bg = this.add
      .rectangle(startX, cardY, cardW, cardH, Phaser.Display.Color.IntegerToColor(col).darken(65).color, 0.95)
      .setDepth(1);
    const border = this.add
      .rectangle(startX, cardY, cardW, cardH)
      .setStrokeStyle(3, col)
      .setDepth(2)
      .setFillStyle(0x000000, 0);

    // Touch: tap a card to select it; tap the highlighted card again to confirm the pick.
    attachTap(bg, () => {
      if (this.selected === index) this._confirm();
      else {
        this.selected = index;
        this._highlight(index);
      }
    });

    // Title: "+1  Hydrogen" (or "+2" for a Gold pick)
    this.add
      .text(startX, top + (twoRows ? 18 : 26), `+${this.grant}  ${ELEMENT_NAMES[element]}`, {
        fontSize: twoRows ? '15px' : '21px',
        color: hex,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);

    // Big atom symbol watermark
    this.add
      .text(startX, top + (twoRows ? 44 : 64), ELEMENT_SYMBOLS[element] ?? '?', {
        fontSize: twoRows ? '26px' : '40px',
        color: hex,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3)
      .setAlpha(0.55);

    if (!twoRows) {
      this.add
        .text(startX, cardY - 64, 'UNLOCKS / LEVELS', { fontSize: '11px', color: '#8899aa', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(3);
    }

    const changes = this._changes(element);
    const changesTop = twoRows ? top + 70 : cardY - 44;
    const lineH = twoRows ? 16 : 24;
    const maxLines = twoRows ? 4 : changes.length;
    if (changes.length === 0) {
      this.add
        .text(startX, changesTop + 4, 'All maxed', { fontSize: twoRows ? '12px' : '14px', color: '#888899' })
        .setOrigin(0.5, 0)
        .setDepth(3);
    } else {
      changes.slice(0, maxLines).forEach((c, li) => {
        const cHex = `#${ATTACKS[c.id].color.toString(16).padStart(6, '0')}`;
        const marker = c.isNew ? '★ NEW' : `▲ Lv${c.level}`;
        const sym = ELEMENT_SYMBOLS[c.id] ?? '?';
        const label = twoRows ? `${marker}  ${sym}` : `${marker}  ${sym}  ${ATTACKS[c.id].tierNames[c.level - 1]}`;
        this.add
          .text(startX, changesTop + li * lineH, label, {
            fontSize: twoRows ? '11px' : '13px',
            color: cHex,
            fontStyle: c.isNew ? 'bold' : 'normal',
            wordWrap: { width: cardW - 18 },
          })
          .setOrigin(0.5, 0)
          .setDepth(3);
      });
      if (changes.length > maxLines) {
        this.add
          .text(startX, changesTop + maxLines * lineH, `+${changes.length - maxLines} more…`, {
            fontSize: '10px',
            color: '#8899aa',
            fontStyle: 'italic',
          })
          .setOrigin(0.5, 0)
          .setDepth(3);
      }
    }

    // Fun fact footer — only on the tall single-row cards (the compact cards have no room).
    if (!twoRows) {
      const factY = cardY + cardH / 2 - 64;
      const rule = this.add.graphics().setDepth(3);
      rule.lineStyle(1, col, 0.3);
      rule.lineBetween(startX - cardW / 2 + 16, factY - 8, startX + cardW / 2 - 16, factY - 8);

      const facts = ELEMENT_FACTS[element];
      if (facts && facts.length > 0) {
        const fact = facts[Math.floor(Math.random() * facts.length)];
        this.add
          .text(startX, factY, `💡 ${fact}`, {
            fontSize: '11px',
            color: '#99a3b8',
            fontStyle: 'italic',
            align: 'center',
            wordWrap: { width: cardW - 24 },
            lineSpacing: 2,
          })
          .setOrigin(0.5, 0)
          .setDepth(3);
      }
    }

    return { bg, border, element };
  }

  private _highlight(index: number): void {
    this.cards.forEach((card, i) => {
      const active = i === index;
      card.bg.setAlpha(active ? 1 : 0.55);
      card.border.setAlpha(active ? 1 : 0.35);
      this.tweens.add({
        targets: card.bg,
        scaleX: active ? 1.04 : 1.0,
        scaleY: active ? 1.04 : 1.0,
        duration: 120,
        ease: 'Power2',
      });
    });
  }

  private _move(dir: number): void {
    this.selected = Phaser.Math.Clamp(this.selected + dir, 0, this.choices.length - 1);
    this._highlight(this.selected);
  }

  private _confirm(): void {
    const chosen = this.choices[this.selected];
    const card = this.cards[this.selected];
    this.tweens.add({
      targets: card.bg,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 350,
      ease: 'Power3',
      onComplete: () => this.callback(chosen),
    });
  }
}
