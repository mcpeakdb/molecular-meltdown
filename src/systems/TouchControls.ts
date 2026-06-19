import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../constants';
import type { TouchInputState } from '../types';

// Layout (in the 960×540 design space — the HUD camera never scrolls, so these are screen coords).
const STICK_RADIUS = 58; // max knob travel from the touch origin
const STICK_DEADZONE = 0.16; // ignore tiny drifts so a still thumb reads as idle
const MOVE_ZONE_W = GAME_WIDTH * 0.55; // left portion that summons the floating stick
const DEPTH = 240;

// Right-thumb cluster: a big JUMP at the corner, the 3 attack buttons (Z/X/C) arcing up-left of it,
// and the pause button parked higher up so it can't be hit while mashing attacks.
const JUMP = { x: GAME_WIDTH - 70, y: GAME_HEIGHT - 62, r: 44 };
const PAUSE = { x: GAME_WIDTH - 55, y: 165, r: 22 };
const ATTACK_R = 33;
const ATTACK_ARC_RADIUS = 118;
const ATTACK_ANGLES_DEG = [196, 232, 268]; // measured from JUMP, sweeping up-left

interface AttackButton {
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  wantVisible: boolean;
}

/**
 * On-screen controls for touch devices: a floating thumbstick on the left half for movement, and a
 * right-thumb cluster of attack buttons (Z/X/C), a jump button and a pause button. The attack
 * buttons mirror the HUD weapon chips — the HUD keeps their colour/cooldown in sync via
 * {@link setAttackSlot}. State is polled once per frame by GameScene and merged into the player's
 * keyboard input, so the rest of the game stays input-source agnostic.
 */
export default class TouchControls {
  moveX = 0;
  moveY = 0;
  onPause?: () => void;

  private readonly scene: Phaser.Scene;
  private enabled = true;

  private jumpQueued = false;
  private slotQueue: number[] = [];

  // Floating stick — tracks whichever pointer first lands in the movement zone.
  private readonly zone: Phaser.GameObjects.Zone;
  private stickPointerId: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private readonly stickBase: Phaser.GameObjects.Arc;
  private readonly stickKnob: Phaser.GameObjects.Arc;
  private readonly stickRing: Phaser.GameObjects.Arc;

  // Jump + pause: shown/hidden purely by `enabled`.
  private readonly fixedButtons: (Phaser.GameObjects.Arc | Phaser.GameObjects.Text)[] = [];
  // Attack buttons: shown only while enabled AND the slot is active (set by the HUD).
  private readonly attackButtons: AttackButton[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Allow several simultaneous touches (move + jump + an attack) — the default is one pointer.
    scene.input.addPointer(2);

    // Movement zone: the lower-left region summons the stick wherever the thumb lands.
    this.zone = scene.add
      .zone(0, 0, MOVE_ZONE_W, GAME_HEIGHT)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive();
    this.zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this._claimStick(pointer));
    scene.input.on('pointermove', this._onPointerMove, this);
    scene.input.on('pointerup', this._onPointerUp, this);

    // Stick visuals (hidden until a thumb is down).
    this.stickRing = scene.add
      .circle(0, 0, STICK_RADIUS, 0x000000, 0.18)
      .setStrokeStyle(3, 0x88ddff, 0.45)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setVisible(false);
    this.stickBase = scene.add
      .circle(0, 0, STICK_RADIUS - 6, 0x0a1620, 0.0)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setVisible(false);
    this.stickKnob = scene.add
      .circle(0, 0, 30, 0x88ddff, 0.55)
      .setStrokeStyle(2, 0xccf2ff, 0.9)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1)
      .setVisible(false);

    this._makeFixedButton(JUMP.x, JUMP.y, JUMP.r, 0x2a5a2a, 0x88ffaa, '⤒', () => {
      this.jumpQueued = true;
    });
    this._makeFixedButton(PAUSE.x, PAUSE.y, PAUSE.r, 0x33405a, 0xaaccff, '❚❚', () => this.onPause?.());

    // Attack buttons arcing up-left of the jump button. Each is labelled with the element/compound
    // it currently fires (set live by the HUD via setAttackSlot), not a key — touch has no keyboard.
    for (let i = 0; i < ATTACK_ANGLES_DEG.length; i++) {
      const a = Phaser.Math.DegToRad(ATTACK_ANGLES_DEG[i]);
      const x = JUMP.x + Math.cos(a) * ATTACK_ARC_RADIUS;
      const y = JUMP.y + Math.sin(a) * ATTACK_ARC_RADIUS;
      this._makeAttackButton(i, x, y);
    }
  }

  /** Jump / pause: a round, semi-transparent button with a glyph and a quick press-flash. */
  private _makeFixedButton(
    x: number,
    y: number,
    r: number,
    fill: number,
    stroke: number,
    glyph: string,
    action: () => void,
  ): void {
    const circle = this.scene.add
      .circle(x, y, r, fill, 0.4)
      .setStrokeStyle(3, stroke, 0.8)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add
      .text(x, y, glyph, { fontSize: `${Math.round(r * 0.9)}px`, color: '#ffffff', fontFamily: 'monospace' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1);
    circle.on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev?: Phaser.Types.Input.EventData) => {
        if (!this.enabled) return;
        ev?.stopPropagation();
        action();
        this.scene.tweens.add({ targets: [circle, label], scale: 0.85, duration: 70, yoyo: true });
      },
    );
    this.fixedButtons.push(circle, label);
  }

  /** An attack button that fires weapon slot `index`; colour/cooldown are driven by the HUD. */
  private _makeAttackButton(index: number, x: number, y: number): void {
    const circle = this.scene.add
      .circle(x, y, ATTACK_R, 0x444444, 0.4)
      .setStrokeStyle(3, 0xaaaaaa, 0.8)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add
      .text(x, y, '', {
        fontSize: `${Math.round(ATTACK_R * 0.9)}px`,
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1)
      .setVisible(false);
    const btn: AttackButton = { circle, label, wantVisible: false };
    circle.on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev?: Phaser.Types.Input.EventData) => {
        if (!this.enabled || !btn.wantVisible) return;
        ev?.stopPropagation();
        this.slotQueue.push(index);
        this.scene.tweens.add({ targets: [circle, label], scale: 0.85, duration: 70, yoyo: true });
      },
    );
    this.attackButtons.push(btn);
  }

  /** Sync an attack button to its weapon slot (called by the HUD each arsenal update). The label is
   *  the element/compound symbol the slot fires (e.g. "H", "H₂O", "✊"), sized to fit the button. */
  setAttackSlot(index: number, opts: { visible: boolean; color: number; cooldownFrac: number; symbol: string }): void {
    const btn = this.attackButtons[index];
    if (!btn) return;
    btn.wantVisible = opts.visible;
    const cooling = opts.cooldownFrac > 0;
    btn.circle.setStrokeStyle(3, opts.color, 0.85).setFillStyle(opts.color, 0.28);
    const alpha = cooling ? 0.45 : 1;
    btn.circle.setAlpha(alpha);
    btn.label.setAlpha(alpha);
    if (btn.label.text !== opts.symbol) {
      btn.label.setText(opts.symbol);
      // Shrink the font for longer formulas (e.g. H₂CO₃) so they stay inside the button.
      btn.label.setFontSize(Math.min(Math.round(ATTACK_R * 0.9), Math.round(93 / Math.max(1, opts.symbol.length))));
    }
    const show = this.enabled && opts.visible;
    btn.circle.setVisible(show);
    btn.label.setVisible(show);
  }

  private _claimStick(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || this.stickPointerId !== null) return;
    this.stickPointerId = pointer.id;
    this.stickOriginX = pointer.x;
    this.stickOriginY = pointer.y;
    this.stickRing.setPosition(pointer.x, pointer.y).setVisible(true);
    this.stickBase.setPosition(pointer.x, pointer.y).setVisible(true);
    this.stickKnob.setPosition(pointer.x, pointer.y).setVisible(true);
  }

  private _onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.stickPointerId) return;
    const dx = pointer.x - this.stickOriginX;
    const dy = pointer.y - this.stickOriginY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, STICK_RADIUS);
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;
    this.stickKnob.setPosition(this.stickOriginX + nx * clamped, this.stickOriginY + ny * clamped);

    const mag = clamped / STICK_RADIUS;
    if (mag < STICK_DEADZONE) {
      this.moveX = 0;
      this.moveY = 0;
    } else {
      this.moveX = nx * mag;
      this.moveY = ny * mag;
    }
  }

  private _onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.stickPointerId) return;
    this._releaseStick();
  }

  private _releaseStick(): void {
    this.stickPointerId = null;
    this.moveX = 0;
    this.moveY = 0;
    this.stickRing.setVisible(false);
    this.stickBase.setVisible(false);
    this.stickKnob.setVisible(false);
  }

  /** Queue a weapon-slot fire (called by the HUD when a chip is tapped). */
  queueSlot(index: number): void {
    if (this.enabled) this.slotQueue.push(index);
  }

  /** True once if jump was tapped since the last poll. */
  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  /** Slot indices tapped since the last poll (cleared by this call). */
  private _drainSlots(): number[] {
    if (this.slotQueue.length === 0) return [];
    const out = this.slotQueue;
    this.slotQueue = [];
    return out;
  }

  /** A snapshot of this frame's input for {@link Player.update}. */
  snapshot(): TouchInputState {
    return { moveX: this.moveX, moveY: this.moveY, jump: this.consumeJump(), slots: this._drainSlots() };
  }

  /** Show/hide and (when disabling) reset all input — used to silence controls during pause/intros. */
  setEnabled(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    for (const b of this.fixedButtons) b.setVisible(on);
    for (const b of this.attackButtons) {
      const show = on && b.wantVisible;
      b.circle.setVisible(show);
      b.label.setVisible(show);
    }
    // Stop the movement zone from swallowing taps while disabled — otherwise tap-to-advance
    // dialogue (handled by GameScene) never sees left-half taps during a paused tutorial.
    if (this.zone.input) this.zone.input.enabled = on;
    if (!on) {
      this._releaseStick();
      this.jumpQueued = false;
      this.slotQueue = [];
    }
  }
}
