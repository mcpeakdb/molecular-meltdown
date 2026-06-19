import Phaser from 'phaser';
import {
  type AttackId,
  BASE_ATOMS,
  type BaseAtom,
  ELEMENT_COLORS,
  GAME_WIDTH,
  MAX_ELEMENT_LEVEL,
  PLAYER_MAX_HP,
  SLOT_KEY_LABELS,
} from '../constants';
import Settings from '../systems/Settings';
import TouchControls from '../systems/TouchControls';
import type { ArsenalUpdate } from '../types';

const PAD = 14;
const MONO = 'monospace';

const ATOM_SYMBOL: Record<BaseAtom, string> = {
  hydrogen: 'H',
  oxygen: 'O',
  carbon: 'C',
  nitrogen: 'N',
};

const ATTACK_SYMBOL: Record<AttackId, string> = {
  hydrogen: 'H',
  oxygen: 'O',
  carbon: 'C',
  nitrogen: 'N',
  water: 'H₂O',
  ammonia: 'NH₃',
  carbon_dioxide: 'CO₂',
  methane: 'CH₄',
  nitric_oxide: 'NO',
  carbonic_acid: 'H₂CO₃',
};

interface Chip {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  keyText: Phaser.GameObjects.Text;
  symbolText: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  pips: Phaser.GameObjects.Arc[];
  cooldown: Phaser.GameObjects.Rectangle;
  id: string | null;
}

const CHIP_W = 84;
const CHIP_H = 48;
const CHIP_GAP = 4;
const CHIP_COUNT = 10;

export default class HUDScene extends Phaser.Scene {
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private atomBadges!: { circle: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text }[];
  private chips!: Chip[];
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private comboSub!: Phaser.GameObjects.Text;

  /** On-screen touch controls, polled by GameScene each frame. Null when touch controls are off. */
  touch: TouchControls | null = null;

  constructor() {
    super('HUDScene');
  }

  create(): void {
    // ── HP BAR ──────────────────────────────────────────────────────────────
    const hpTrack = this.add.graphics().setScrollFactor(0).setDepth(200);
    hpTrack.fillStyle(0x061008);
    hpTrack.fillRect(PAD, PAD + 4, 206, 16);
    hpTrack.lineStyle(1, 0x1a3a1a, 0.8);
    hpTrack.strokeRect(PAD, PAD + 4, 206, 16);

    this.hpBarFill = this.add
      .rectangle(PAD + 1, PAD + 5, 204, 14, 0x44cc66)
      .setScrollFactor(0)
      .setDepth(201)
      .setOrigin(0, 0);

    const hpTicks = this.add.graphics().setScrollFactor(0).setDepth(203);
    hpTicks.lineStyle(1, 0xffffff, 0.18);
    [51, 102, 153].forEach((x) => {
      hpTicks.lineBetween(PAD + 1 + x, PAD + 5, PAD + 1 + x, PAD + 19);
    });

    this.hpText = this.add
      .text(PAD + 4, PAD + 12, 'HP  100', { fontSize: '13px', color: '#ccffcc', fontFamily: MONO })
      .setScrollFactor(0)
      .setDepth(204)
      .setOrigin(0, 0.5);

    // ── MOLECULAR TREE — owned atom badges ────────────────────────────────────
    this.add
      .text(PAD, PAD + 30, 'MOLECULE', { fontSize: '11px', color: '#4a7a4a', fontFamily: MONO })
      .setScrollFactor(0)
      .setDepth(202);

    this.atomBadges = BASE_ATOMS.map((atom, i) => {
      const cx = PAD + 14 + i * 50;
      const cy = PAD + 60;
      const col = ELEMENT_COLORS[atom];
      this.add
        .circle(cx, cy, 13, Phaser.Display.Color.IntegerToColor(col).darken(70).color)
        .setScrollFactor(0)
        .setDepth(201)
        .setStrokeStyle(1.5, col, 0.5);
      const circle = this.add
        .circle(cx, cy, 13)
        .setScrollFactor(0)
        .setDepth(202)
        .setStrokeStyle(2, col)
        .setFillStyle(0, 0);
      this.add
        .text(cx, cy - 1, ATOM_SYMBOL[atom], {
          fontSize: '14px',
          color: `#${col.toString(16).padStart(6, '0')}`,
          fontFamily: MONO,
          fontStyle: 'bold',
        })
        .setScrollFactor(0)
        .setDepth(203)
        .setOrigin(0.5);
      const label = this.add
        .text(cx + 15, cy + 6, '0', { fontSize: '12px', color: '#88aa88', fontFamily: MONO })
        .setScrollFactor(0)
        .setDepth(203)
        .setOrigin(0, 0.5);
      return { circle, label };
    });

    // ── ATTACK BAR (numpad arsenal) ───────────────────────────────────────────
    const totalW = CHIP_COUNT * CHIP_W + (CHIP_COUNT - 1) * CHIP_GAP;
    const startX = (GAME_WIDTH - totalW) / 2;
    // Top-centre of the HUD — clear of the HP/molecule readout (left) and score/combo (right).
    const barY = PAD + CHIP_H / 2;
    this.chips = [];
    for (let i = 0; i < CHIP_COUNT; i++) {
      const x = startX + i * (CHIP_W + CHIP_GAP) + CHIP_W / 2;
      const container = this.add.container(x, barY).setScrollFactor(0).setDepth(210).setVisible(false);

      const bg = this.add.rectangle(0, 0, CHIP_W, CHIP_H, 0x0a140a, 0.92).setStrokeStyle(2, 0x335533);
      // key badge — Z / X / C for the (up to 3) weapon slots
      const keyLabel = SLOT_KEY_LABELS[i] ?? `${i + 1}`;
      const keyText = this.add
        .text(-CHIP_W / 2 + 6, -CHIP_H / 2 + 4, keyLabel, {
          fontSize: '13px',
          color: '#ffffff',
          fontFamily: MONO,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0);
      const symbolText = this.add
        .text(4, -6, '', { fontSize: '17px', color: '#ffffff', fontFamily: MONO, fontStyle: 'bold' })
        .setOrigin(0.5, 0.5);
      const nameText = this.add
        .text(0, CHIP_H / 2 - 4, '', { fontSize: '9px', color: '#aaccaa', fontFamily: MONO })
        .setOrigin(0.5, 1);
      const pips: Phaser.GameObjects.Arc[] = [];
      for (let p = 0; p < MAX_ELEMENT_LEVEL; p++) {
        pips.push(this.add.circle(CHIP_W / 2 - 8 - p * 8, -CHIP_H / 2 + 8, 3, 0x223322));
      }
      const cooldown = this.add.rectangle(0, -CHIP_H / 2, CHIP_W, 0, 0x000000, 0.55).setOrigin(0.5, 0);

      container.add([bg, cooldown, keyText, symbolText, nameText, ...pips]);
      const chip = { container, bg, keyText, symbolText, nameText, pips, cooldown, id: null };
      this.chips.push(chip);

      // Touch: tapping a visible weapon chip fires that slot (routed through the player like a key press).
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
        if (!this.touch || !chip.container.visible) return;
        ev?.stopPropagation();
        this.touch.queueSlot(i);
        this.tweens.add({ targets: chip.container, scale: 0.92, duration: 70, yoyo: true });
      });
    }

    // ── SCORE ────────────────────────────────────────────────────────────────
    this.add
      .text(GAME_WIDTH - PAD, PAD, 'SCORE', { fontSize: '12px', color: '#4a7a4a', fontFamily: MONO })
      .setScrollFactor(0)
      .setDepth(202)
      .setOrigin(1, 0);
    this.scoreText = this.add
      .text(GAME_WIDTH - PAD, PAD + 16, '0', { fontSize: '20px', color: '#99dd99', fontFamily: MONO })
      .setScrollFactor(0)
      .setDepth(202)
      .setOrigin(1, 0);

    // ── COMBO ────────────────────────────────────────────────────────────────
    this.comboText = this.add
      .text(GAME_WIDTH - PAD, PAD + 44, '', { fontSize: '28px', color: '#aaddaa', fontFamily: MONO, fontStyle: 'bold' })
      .setScrollFactor(0)
      .setDepth(202)
      .setOrigin(1, 0)
      .setAlpha(0);
    this.comboSub = this.add
      .text(GAME_WIDTH - PAD, PAD + 76, '', { fontSize: '13px', color: '#88bb88', fontFamily: MONO })
      .setScrollFactor(0)
      .setDepth(202)
      .setOrigin(1, 0)
      .setAlpha(0);

    // ── EVENTS ───────────────────────────────────────────────────────────────
    const gameScene = this.scene.get('GameScene');
    gameScene.events.on('hud-update', this._onUpdate, this);
    gameScene.events.on('arsenal-update', this._onArsenal, this);
    gameScene.events.on('score-update', (score: number) => this.scoreText.setText(score.toLocaleString()), this);
    gameScene.events.on(
      'combo-update',
      (count: number, mult: number) => {
        if (count < 2) {
          this.tweens.add({ targets: [this.comboText, this.comboSub], alpha: 0, duration: 200 });
        } else {
          this.comboText.setText(`${count} HITS`).setAlpha(1);
          this.comboSub.setText(mult > 1 ? `×${mult.toFixed(1)} COMBO` : 'COMBO').setAlpha(1);
          this.tweens.killTweensOf(this.comboText);
          this.tweens.add({
            targets: this.comboText,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 80,
            ease: 'Power2',
            yoyo: true,
          });
        }
      },
      this,
    );
    gameScene.events.on(
      'boss-activated',
      () => {
        const warn = this.add
          .text(GAME_WIDTH / 2, 96, '! PATHOGEN DETECTED !', {
            fontSize: '26px',
            color: '#cc3322',
            fontFamily: MONO,
            fontStyle: 'bold',
            stroke: '#110000',
            strokeThickness: 3,
          })
          .setScrollFactor(0)
          .setDepth(250)
          .setOrigin(0.5);
        this.tweens.add({ targets: warn, alpha: 0, duration: 2000, delay: 2000, onComplete: () => warn.destroy() });
      },
      this,
    );

    // ── TOUCH CONTROLS ─────────────────────────────────────────────────────────
    this.touch = null;
    if (Settings.touchActive()) {
      const touch = new TouchControls(this);
      touch.onPause = () => gameScene.events.emit('request-pause');
      this.touch = touch;
    }
  }

  /** Hide the weapon chips + on-screen controls so a full-screen overlay (stage-clear banner or
   *  death screen) reads cleanly. The HUD is relaunched fresh on the next stage, so the chips return. */
  hideArsenal(): void {
    for (const chip of this.chips) chip.container.setVisible(false);
    this.touch?.setEnabled(false);
  }

  private _onUpdate({ hp }: { hp: number }): void {
    const pct = hp / PLAYER_MAX_HP;
    this.hpBarFill.width = Math.max(0, 204 * pct);
    this.hpBarFill.fillColor = pct > 0.5 ? 0x44cc66 : pct > 0.25 ? 0xaacc22 : 0xcc4422;
    this.hpText.setText(`HP  ${hp}`);
  }

  private _onArsenal({ slots, counts }: ArsenalUpdate): void {
    // Atom badges
    this.atomBadges.forEach(({ circle, label }, i) => {
      const c = counts[BASE_ATOMS[i]];
      label.setText(`${c}`).setColor(c > 0 ? '#cceecc' : '#557755');
      circle.setAlpha(c > 0 ? 1 : 0.35);
    });

    // One chip per weapon slot. A bound slot shows its compound; an empty slot 1 falls back to the
    // basic Punch; any other empty slot shows a dim, awaiting-assignment placeholder.
    const display = slots.map((slot, i) => {
      if (slot) {
        return {
          id: slot.id as string,
          key: slot.key,
          symbol: ATTACK_SYMBOL[slot.id],
          name: slot.name,
          color: slot.color,
          level: slot.level,
          cooldownRemaining: slot.cooldownRemaining,
          cooldownMs: slot.cooldownMs,
          empty: false,
        };
      }
      return i === 0
        ? {
            id: '__punch__',
            key: 1,
            symbol: '✊',
            name: 'Punch',
            color: 0xcfcfcf,
            level: 0,
            cooldownRemaining: 0,
            cooldownMs: 0,
            empty: false,
          }
        : {
            id: '__empty__',
            key: i + 1,
            symbol: '·',
            name: '— empty —',
            color: 0x556655,
            level: 0,
            cooldownRemaining: 0,
            cooldownMs: 0,
            empty: true,
          };
    });

    // Attack chips — centre the bar on however many weapon slots this difficulty grants
    const totalW = display.length * CHIP_W + (display.length - 1) * CHIP_GAP;
    const startX = (GAME_WIDTH - totalW) / 2;
    for (let i = 0; i < CHIP_COUNT; i++) {
      const chip = this.chips[i];
      const entry = display[i];
      if (!entry) {
        if (chip.container.visible) chip.container.setVisible(false);
        chip.id = null;
        continue;
      }
      chip.container.setVisible(true);
      chip.container.x = startX + i * (CHIP_W + CHIP_GAP) + CHIP_W / 2;
      const hex = `#${entry.color.toString(16).padStart(6, '0')}`;
      if (chip.id !== entry.id) {
        chip.id = entry.id;
        chip.bg.setStrokeStyle(2, entry.color);
        chip.symbolText.setText(entry.symbol).setColor(hex);
        chip.keyText.setText(SLOT_KEY_LABELS[i] ?? `${entry.key}`);
      }
      chip.nameText.setText(entry.name);
      chip.pips.forEach((pip, p) => {
        pip.setFillStyle(p < entry.level ? entry.color : 0x223322);
      });

      // Cooldown overlay wipes down from the top; chip dims while recharging or empty
      const frac = entry.cooldownMs > 0 ? Phaser.Math.Clamp(entry.cooldownRemaining / entry.cooldownMs, 0, 1) : 0;
      chip.cooldown.height = CHIP_H * frac;
      chip.container.setAlpha(entry.empty ? 0.45 : frac > 0 ? 0.62 : 1);
    }

    // Keep the on-screen attack buttons (Z/X/C) in sync with the weapon slots they fire.
    if (this.touch) {
      for (let i = 0; i < SLOT_KEY_LABELS.length; i++) {
        const e = display[i];
        const frac = e && e.cooldownMs > 0 ? Phaser.Math.Clamp(e.cooldownRemaining / e.cooldownMs, 0, 1) : 0;
        this.touch.setAttackSlot(i, { visible: !!e, color: e?.color ?? 0x556655, cooldownFrac: frac });
      }
    }
  }
}
