import type Phaser from 'phaser';
import { type BaseAtom, NOBLE_GAS_BY_ID, type NobleGasId } from '../constants';
import type { AtomSprite } from '../types';

/**
 * An atom pickup. Most are *choice nodes* (Phase 6): collecting one opens a 2–3 way choice of base
 * atoms, growing the player's molecular tree. A rare Gold node grants +2. A `noble` pickup is an
 * inert noble gas — no choice, just a big score bonus and a permanent find (Phase 7+).
 */
export default class Atom {
  scene: Phaser.Scene;
  choices: BaseAtom[];
  /** Rare wildcard pickup (Phase 7): lets the player pick any base atom and grants it +2. */
  gold: boolean;
  /** Noble-gas pickup: inert, collected for a score bonus rather than building the tree. */
  noble?: NobleGasId;
  collected = false;
  sprite: AtomSprite;
  /** Pulsing halo behind a noble gem (undefined for ordinary atoms). */
  glow?: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, choices: BaseAtom[], gold = false, noble?: NobleGasId) {
    this.scene = scene;
    this.choices = choices;
    this.gold = gold;
    this.noble = noble;

    const texture = noble ? 'atom_noble' : gold ? 'atom_gold' : 'atom_node';
    const base = scene.physics.add.sprite(x, y, texture);
    base.body.setAllowGravity(false);
    base.setDepth(50);
    this.sprite = base as AtomSprite;
    this.sprite.atomRef = this;

    const bobTargets: Phaser.GameObjects.GameObject[] = [this.sprite];

    if (noble) {
      const color = NOBLE_GAS_BY_ID[noble].color;
      base.setTint(color).setScale(1.2);
      // A bright pulsing halo so the rare gem reads as special from a distance.
      this.glow = scene.add.image(x, y, 'particle').setTint(color).setScale(4).setAlpha(0.28).setDepth(49);
      bobTargets.push(this.glow);
      scene.tweens.add({
        targets: this.glow,
        alpha: 0.5,
        scale: 5,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }

    scene.tweens.add({
      targets: bobTargets,
      y: y - 14,
      duration: 900 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    scene.tweens.add({
      targets: this.sprite,
      angle: 360,
      duration: noble ? 3200 : 2200,
      repeat: -1,
      ease: 'Linear',
    });
  }

  /** Tear down the gem and its halo together (the sprite is usually destroyed by the collector). */
  destroyGlow(): void {
    this.glow?.destroy();
    this.glow = undefined;
  }
}
