import type Phaser from 'phaser';
import SoundSystem from './SoundSystem';

/** Base scale of the tiny player-avatar menu cursor. */
const CURSOR_SCALE = 0.34;

/**
 * The selected-menu-item marker: a tiny version of the player sprite (replaces the old "›" carat).
 * Faces right, so placed just left of a menu item it "points" at the current selection. The caller
 * positions it (and may set scrollFactor/depth); move it with `.setY(...)` as the cursor changes.
 */
export function makeCursorIcon(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y, 'player_0').setOrigin(0.5, 0.5).setScale(CURSOR_SCALE);
}

/**
 * Confirming a menu item: the avatar cursor throws a quick jab (lunge toward the item + scale pop +
 * punch SFX), then runs `onDone` to perform the selection. Re-entry is guarded so a double-press
 * can't fire the action twice while the jab is playing.
 */
export function punchCursorIcon(scene: Phaser.Scene, icon: Phaser.GameObjects.Image, onDone: () => void): void {
  if (icon.getData('punching')) return;
  icon.setData('punching', true);
  const baseX = icon.x;
  const baseScale = icon.scaleX;
  try {
    SoundSystem.play((scene.sound as Phaser.Sound.WebAudioSoundManager).context, 'punch');
  } catch {
    // No Web Audio context (or non-WebAudio backend) — the jab still plays silently.
  }
  scene.tweens.add({
    targets: icon,
    x: baseX + 12,
    scaleX: baseScale * 1.18,
    scaleY: baseScale * 1.18,
    duration: 70,
    yoyo: true,
    ease: 'Quad.easeOut',
    onComplete: () => {
      icon.setX(baseX).setScale(baseScale).setData('punching', false);
      onDone();
    },
  });
}

/**
 * Make a game object respond to mouse/touch input so the keyboard-driven menus are also tappable.
 * `onTap` fires on press; the optional `onHover` mirrors keyboard cursor movement on pointer-over.
 * Propagation is stopped so a tap doesn't also reach an underlying control (e.g. the touch stick).
 */
export function attachTap(target: Phaser.GameObjects.GameObject, onTap: () => void, onHover?: () => void): void {
  target.setInteractive({ useHandCursor: true });
  if (onHover) target.on('pointerover', onHover);
  target.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
    ev?.stopPropagation();
    onTap();
  });
}
