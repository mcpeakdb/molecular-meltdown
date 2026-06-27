import type Phaser from 'phaser';
import type { AttackId, BaseAtom, ElementType } from './constants';
import type Atom from './entities/Atom';
import type Boss from './entities/Boss';
import type Enemy from './entities/Enemy';

// physics.add.sprite() always creates a dynamic body, but Phaser's type is
// Body | StaticBody | null.  Narrowing to SpriteWithDynamicBody gives us typed
// access to setVelocity / setSize / etc. without casts at every call site.
export type EnemySprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & { enemyRef: Enemy | Boss };
export type AtomSprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & { atomRef: Atom };

export type WasdKeys = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

/** Per-frame on-screen touch input, merged with the keyboard in Player.update. */
export type TouchInputState = {
  /** Analog movement from the floating thumbstick, each axis in [-1, 1] (0 = centred/idle). */
  moveX: number;
  moveY: number;
  /** Jump was tapped this frame (edge-triggered, already consumed). */
  jump: boolean;
  /** Weapon-slot indices tapped this frame (edge-triggered, already drained). */
  slots: number[];
};

export type InputKeys = {
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  wasd: WasdKeys;
  /** Attack slots bound to Z / X / C (index 0 = Z … 2 = C). Each slot lists the key(s) that fire it.
   *  Slot 1 (Z) punches while no attacks are unlocked, then becomes the first armed attack. */
  slotKeys: Phaser.Input.Keyboard.Key[][];
  /** On-screen controls state for the current frame; absent when touch controls are off. */
  touch?: TouchInputState;
};

export type ElementState = { type: ElementType; level: number };

/**
 * Opaque content box of a player animation frame, in source pixels (computed at boot in BootScene).
 * Lets Player fit each frame to a constant on-screen size and ground the body on the feet even when
 * frames have different source resolutions / transparent margins.
 */
export type PlayerFrameBox = { x: number; y: number; w: number; h: number };

/** One available attack, as derived from the owned atoms. */
export type AttackSlot = {
  id: AttackId;
  /** 1..3 */
  level: number;
  /** Slot ordinal (1-based). The HUD renders the bound key letter (Z/X/C) from the slot index. */
  key: number;
};

/** HUD payload: a bound attack plus its live cooldown state. */
export type ArsenalEntry = AttackSlot & {
  name: string;
  color: number;
  cooldownRemaining: number;
  cooldownMs: number;
};

/** Full HUD arsenal snapshot: one entry per weapon slot (null = empty) + owned-atom counts. */
export type ArsenalUpdate = {
  slots: (ArsenalEntry | null)[];
  counts: Record<BaseAtom, number>;
};
