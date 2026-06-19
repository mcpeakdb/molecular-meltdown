import {
  ATTACK_ORDER,
  ATTACKS,
  type AttackId,
  BASE_ATOMS,
  type BaseAtom,
  ELEMENTS,
  type ElementType,
  MAX_ELEMENT_LEVEL,
  SUPER_ATTACK_ID,
} from '../constants';
import type { AttackSlot, ElementState } from '../types';

/**
 * Tracks the multiset of base atoms the player has collected, derives the set of attacks that
 * become available from them (Phase 6), and manages the player's weapon loadout (Phase 8).
 *
 * - A base attack (H/O/C/N) is available once its atom is owned; level = min(count, 3).
 * - A compound attack is available once all its constituent atoms are owned;
 *   level = min(complete recipe copies, 3).
 * - The player has a fixed number of bindable slots (keys 1..slotCount) — 3 on Normal/Hard, 2 on
 *   Extreme. Newly-unlocked weapons auto-fill empty slots; once the slots are full the player
 *   rebinds them by hand via the Compound Selection menu.
 */
export default class ElementSystem {
  private counts: Record<BaseAtom, number> = { hydrogen: 0, oxygen: 0, carbon: 0, nitrogen: 0 };
  /** Number of bindable weapon slots (keys 1..slotCount) — set from the difficulty. */
  private slotCount = 3;
  /** The attack bound to each slot (index 0 = key 1); null = empty. Length always === slotCount. */
  private bindings: (AttackId | null)[] = [null, null, null];
  /** Every attack that has ever become available — used to detect *newly* unlocked weapons. */
  private known = new Set<AttackId>();
  /** The noble-gas super weapon is armed once the full collection is complete (permanent unlock). */
  private superUnlocked = false;

  /** Set the number of weapon slots (from the difficulty), preserving existing bindings. */
  setSlotCount(n: number): void {
    this.slotCount = Math.max(1, n);
    const next = this.bindings.slice(0, this.slotCount);
    while (next.length < this.slotCount) next.push(null);
    this.bindings = next;
  }

  getSlotCount(): number {
    return this.slotCount;
  }

  /** Increment an atom's count. Returns true if this unlocked a new attack or raised a level. */
  collectAtom(atom: BaseAtom): boolean {
    const before = this._signature();
    this.counts[atom]++;
    return this._signature() !== before;
  }

  /**
   * Fold any newly-unlocked weapons into the loadout: each is auto-assigned to the first empty
   * slot. Weapons that unlock when every slot is already full are returned as `overflow` — the
   * cue to teach the player about manual Compound Selection. Call once after a collect.
   */
  reconcileBindings(): { newlyUnlocked: AttackId[]; overflow: AttackId[] } {
    const newlyUnlocked: AttackId[] = [];
    const overflow: AttackId[] = [];
    for (const id of ATTACK_ORDER) {
      if (ElementSystem.levelFor(id, this.counts) <= 0 || this.known.has(id)) continue;
      this.known.add(id);
      newlyUnlocked.push(id);
      const empty = this.bindings.indexOf(null);
      if (empty >= 0) this.bindings[empty] = id;
      else overflow.push(id);
    }
    return { newlyUnlocked, overflow };
  }

  /** The attack bound to each slot (index 0 = key 1); null = empty slot. */
  getBindings(): (AttackId | null)[] {
    return [...this.bindings];
  }

  /** Bind a weapon (or null to clear) to a slot. No-op for an out-of-range slot or unavailable id. */
  setBinding(slot: number, id: AttackId | null): void {
    if (slot < 0 || slot >= this.slotCount) return;
    if (id !== null && this.getAttackLevel(id) <= 0) return;
    this.bindings[slot] = id;
  }

  getCounts(): Record<BaseAtom, number> {
    return { ...this.counts };
  }

  /** Arm/disarm the noble-gas super weapon (set from the saved collection — see SaveSystem). */
  setSuperUnlocked(on: boolean): void {
    this.superUnlocked = on;
  }

  isSuperUnlocked(): boolean {
    return this.superUnlocked;
  }

  /** Auto-bind the super weapon to the *last* free slot (so the basic punch keeps slot 1). No-op if
   *  it's already bound or every slot is full (the player can then bind it via Compound Selection). */
  seedSuperWeapon(): void {
    if (!this.superUnlocked || this.bindings.includes(SUPER_ATTACK_ID)) return;
    for (let i = this.bindings.length - 1; i >= 0; i--) {
      if (this.bindings[i] === null) {
        this.bindings[i] = SUPER_ATTACK_ID;
        return;
      }
    }
  }

  /** Every attack the owned atoms make available, in fixed priority order (for menus & summaries).
   *  The super weapon, when armed, is appended so it appears in Compound Selection and summaries. */
  getAvailableAttacks(): AttackSlot[] {
    const list = ElementSystem.attacksFor(this.counts);
    if (this.superUnlocked) list.push({ id: SUPER_ATTACK_ID, level: MAX_ELEMENT_LEVEL, key: 0 });
    return list;
  }

  getAttackLevel(id: AttackId): number {
    if (id === SUPER_ATTACK_ID) return this.superUnlocked ? MAX_ELEMENT_LEVEL : 0;
    return ElementSystem.levelFor(id, this.counts);
  }

  /**
   * Pure: the attack level a given counts map yields (0 = unavailable).
   * Level = how many complete copies of the molecule's recipe the atoms can assemble, capped at 3.
   * e.g. Water needs 2H+1O: 2H/1O → Lv1, 4H/2O → Lv2, 6H/3O → Lv3.
   */
  static levelFor(id: AttackId, counts: Record<BaseAtom, number>): number {
    // The super weapon has no atom recipe; its availability is tracked per-instance, not here.
    if (id === SUPER_ATTACK_ID) return 0;
    const recipe = ATTACKS[id].recipe;
    let copies = MAX_ELEMENT_LEVEL;
    for (const atom of Object.keys(recipe) as BaseAtom[]) {
      const need = recipe[atom] ?? 0;
      copies = Math.min(copies, Math.floor(counts[atom] / need));
    }
    return Math.min(copies, MAX_ELEMENT_LEVEL);
  }

  /** Pure: available attacks for an arbitrary counts map (used to preview a pick). */
  static attacksFor(counts: Record<BaseAtom, number>): AttackSlot[] {
    const slots: { id: AttackId; level: number }[] = [];
    for (const id of ATTACK_ORDER) {
      const level = ElementSystem.levelFor(id, counts);
      if (level > 0) slots.push({ id, level });
    }
    return slots.map((s, i) => ({ ...s, key: i < 9 ? i + 1 : 0 }));
  }

  isUnlocked(id: AttackId): boolean {
    return this.getAttackLevel(id) > 0;
  }

  /** Most-advanced available attack (highest slot) — used for the player tint. */
  getPrimary(): AttackId | null {
    const available = ElementSystem.attacksFor(this.counts);
    return available.length ? available[available.length - 1].id : null;
  }

  getSpecialName(id: AttackId, level: number): string {
    return ATTACKS[id].tierNames[Math.max(0, level - 1)] ?? '—';
  }

  // ── Backward-compatible accessors (player tint, etc.) ──────────────────────
  get type(): ElementType {
    return this.getPrimary() ?? ELEMENTS.NONE;
  }

  get level(): number {
    const p = this.getPrimary();
    return p ? this.getAttackLevel(p) : 0;
  }

  getState(): ElementState {
    return { type: this.type, level: this.level };
  }

  private _signature(): string {
    // Changes whenever an attack unlocks or a level rises (until everything is capped).
    return BASE_ATOMS.map((a) => Math.min(this.counts[a], MAX_ELEMENT_LEVEL)).join(',');
  }
}
