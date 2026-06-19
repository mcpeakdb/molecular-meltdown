// ── Global game settings ──────────────────────────────────────────────────────
// Small, synchronously-readable settings cached in memory and mirrored to
// localStorage. Unlike SaveSystem (progression, per-difficulty), these are global
// preferences read on hot paths (every sound, every screen shake), so access must
// be cheap and never throw.

/** On-screen touch controls: always on, always off, or shown only on touch-capable devices. */
export type TouchMode = 'auto' | 'on' | 'off';

export interface GameSettings {
  volume: number; // 0..1 master volume
  muted: boolean;
  sfx: boolean; // sound effects enabled
  music: boolean; // background music enabled
  screenShake: boolean;
  touchControls: TouchMode; // on-screen joystick + buttons for mobile
  fullscreen: boolean; // auto-enter fullscreen on touch devices (hides the mobile URL bar)
  tutorialDone: boolean; // set once the M.E.G. tutorial has been completed/skipped
  compoundIntroSeen: boolean; // set once M.E.G. has explained the Compound Selection menu
}

const KEY = 'mm.settings.v1';

const DEFAULTS: GameSettings = {
  volume: 0.8,
  muted: false,
  sfx: true,
  music: true,
  screenShake: true,
  touchControls: 'auto',
  fullscreen: false,
  tutorialDone: false,
  compoundIntroSeen: false,
};

const TOUCH_MODES: readonly TouchMode[] = ['auto', 'on', 'off'];

let cache: GameSettings | null = null;

export default class Settings {
  static get(): GameSettings {
    if (!cache) cache = Settings._load();
    return cache;
  }

  /** Merge a partial update, persist, and keep the in-memory cache hot. */
  static set(patch: Partial<GameSettings>): void {
    cache = { ...Settings.get(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      // Storage blocked/full — settings just won't persist this session.
    }
  }

  /** Whether on-screen touch controls should be shown, resolving the `auto` mode against the device. */
  static touchActive(): boolean {
    const mode = Settings.get().touchControls;
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return Settings.isTouchDevice();
  }

  /** Best-effort touch-capability sniff (used to resolve the `auto` touch-controls mode). */
  static isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  }

  /** Cycle the touch-controls mode (auto → on → off → auto). Returns the new mode. */
  static cycleTouchControls(dir = 1): TouchMode {
    const i = TOUCH_MODES.indexOf(Settings.get().touchControls);
    const next = TOUCH_MODES[(i + dir + TOUCH_MODES.length) % TOUCH_MODES.length];
    Settings.set({ touchControls: next });
    return next;
  }

  /** Volume actually applied to audio: 0 when muted or SFX are off. */
  static effectiveVolume(): number {
    const s = Settings.get();
    if (s.muted || !s.sfx) return 0;
    return Math.max(0, Math.min(1, s.volume));
  }

  /** Volume applied to background music: 0 when muted or music is off, otherwise tucked under SFX. */
  static musicVolume(): number {
    const s = Settings.get();
    if (s.muted || !s.music) return 0;
    return Math.max(0, Math.min(1, s.volume)) * 0.5;
  }

  private static _load(): GameSettings {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULTS.volume,
        muted: parsed.muted ?? DEFAULTS.muted,
        sfx: parsed.sfx ?? DEFAULTS.sfx,
        music: parsed.music ?? DEFAULTS.music,
        screenShake: parsed.screenShake ?? DEFAULTS.screenShake,
        touchControls: TOUCH_MODES.includes(parsed.touchControls as TouchMode)
          ? (parsed.touchControls as TouchMode)
          : DEFAULTS.touchControls,
        fullscreen: parsed.fullscreen ?? DEFAULTS.fullscreen,
        tutorialDone: parsed.tutorialDone ?? DEFAULTS.tutorialDone,
        compoundIntroSeen: parsed.compoundIntroSeen ?? DEFAULTS.compoundIntroSeen,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }
}
