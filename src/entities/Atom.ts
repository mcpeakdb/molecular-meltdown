import type Phaser from 'phaser';
import {
  ARMOR_DROPS,
  type ArmorId,
  type BaseAtom,
  HEAL_DROPS,
  type HealId,
  NOBLE_GAS_BY_ID,
  type NobleGasId,
} from '../constants';
import type { AtomSprite } from '../types';

/**
 * An atom pickup. Most are *choice nodes* (Phase 6): collecting one opens a 2–3 way choice of base
 * atoms, growing the player's molecular tree. A rare Gold node grants +2. A `noble` pickup is an
 * inert noble gas — no choice, just a big score bonus and a permanent find (Phase 7+). A `coin`
 * pickup is a silver coin — a small score pickup, 50 per stage, with a bonus for a full sweep. A
 * `heal` pickup is a Calcium/Zinc drop — no choice, just restores player HP on contact (Phase 8+). An
 * `armor` pickup is an Iron drop — grants a damage-absorbing armor buffer on contact (Phase 8+).
 */
export default class Atom {
  scene: Phaser.Scene;
  choices: BaseAtom[];
  /** Rare wildcard pickup (Phase 7): lets the player pick any base atom and grants it +2. */
  gold: boolean;
  /** Ultra-rare wildcard pickup: pick any base atom and gain +3 (like Gold, but rarer & bigger). */
  platinum: boolean;
  /** Noble-gas pickup: inert, collected for a score bonus rather than building the tree. */
  noble?: NobleGasId;
  /** Silver-coin pickup: a small score bonus; sweeping every coin in a stage awards a full-set bonus. */
  coin: boolean;
  /** Healing-drop pickup (Ca/Zn): restores player HP on contact; no choice, no tree growth. */
  heal?: HealId;
  /** Armor-drop pickup (Fe): grants a damage-absorbing armor buffer on contact; no choice. */
  armor?: ArmorId;
  collected = false;
  sprite: AtomSprite;
  /** Pulsing halo behind a noble gem (undefined for ordinary atoms). */
  glow?: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    choices: BaseAtom[],
    gold = false,
    noble?: NobleGasId,
    coin = false,
    platinum = false,
    heal?: HealId,
    armor?: ArmorId,
  ) {
    this.scene = scene;
    this.choices = choices;
    this.gold = gold;
    this.platinum = platinum;
    this.noble = noble;
    this.coin = coin;
    this.heal = heal;
    this.armor = armor;

    const texture = coin
      ? 'coin_silver'
      : heal
        ? HEAL_DROPS[heal].texture
        : armor
          ? ARMOR_DROPS[armor].texture
          : platinum
            ? 'atom_platinum'
            : noble
              ? 'atom_noble'
              : gold
                ? 'atom_gold'
                : 'atom_node';
    const base = scene.physics.add.sprite(x, y, texture);
    base.body.setAllowGravity(false);
    base.setDepth(50);
    if (platinum) base.setScale(1.1);
    this.sprite = base as AtomSprite;
    this.sprite.atomRef = this;

    // Coins are small and spin like a flipping coin (scaleX yoyo) rather than bobbing/rotating.
    if (coin) {
      base.setScale(0.85);
      scene.tweens.add({
        targets: base,
        scaleX: -0.85,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
      return;
    }

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
    } else if (heal) {
      // A soft, gently pulsing halo in the drop's healing tint — reads as a restorative pickup.
      const color = HEAL_DROPS[heal].color;
      this.glow = scene.add.image(x, y, 'particle').setTint(color).setScale(3).setAlpha(0.3).setDepth(49);
      bobTargets.push(this.glow);
      scene.tweens.add({
        targets: this.glow,
        alpha: 0.6,
        scale: 4,
        duration: 850,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    } else if (armor) {
      // A cool steel halo — reads as a protective pickup.
      const color = ARMOR_DROPS[armor].color;
      this.glow = scene.add.image(x, y, 'particle').setTint(color).setScale(3).setAlpha(0.28).setDepth(49);
      bobTargets.push(this.glow);
      scene.tweens.add({
        targets: this.glow,
        alpha: 0.55,
        scale: 4,
        duration: 900,
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
    // Heal/armor drops bob but don't spin — a tumbling capsule/shield reads oddly; the halo carries it.
    if (!heal && !armor) {
      scene.tweens.add({
        targets: this.sprite,
        angle: 360,
        duration: noble ? 3200 : 2200,
        repeat: -1,
        ease: 'Linear',
      });
    }
  }

  /** Tear down the gem and its halo together (the sprite is usually destroyed by the collector). */
  destroyGlow(): void {
    this.glow?.destroy();
    this.glow = undefined;
  }
}
