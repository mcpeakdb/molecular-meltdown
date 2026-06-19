import Settings from './Settings';

export type SoundKey =
  | 'punch'
  | 'atom_collect'
  | 'element_upgrade'
  | 'boss_roar'
  | 'player_death'
  | 'bounce'
  | 'hazard'
  | 'reaction';

export default class SoundSystem {
  // One master gain per AudioContext; every note routes through it so volume/mute apply globally.
  private static _masters = new WeakMap<AudioContext, GainNode>();

  private static _master(ctx: AudioContext): GainNode {
    let master = SoundSystem._masters.get(ctx);
    if (!master) {
      master = ctx.createGain();
      master.connect(ctx.destination);
      SoundSystem._masters.set(ctx, master);
    }
    master.gain.value = Settings.effectiveVolume();
    return master;
  }

  static play(ctx: AudioContext, key: SoundKey): void {
    if (Settings.effectiveVolume() <= 0) return; // muted or SFX disabled
    if (ctx.state === 'suspended') ctx.resume();
    SoundSystem._master(ctx).gain.value = Settings.effectiveVolume();
    const now = ctx.currentTime;
    switch (key) {
      case 'punch':
        SoundSystem._punch(ctx, now);
        break;
      case 'atom_collect':
        SoundSystem._atomCollect(ctx, now);
        break;
      case 'element_upgrade':
        SoundSystem._elementUpgrade(ctx, now);
        break;
      case 'boss_roar':
        SoundSystem._bossRoar(ctx, now);
        break;
      case 'player_death':
        SoundSystem._playerDeath(ctx, now);
        break;
      case 'bounce':
        SoundSystem._bounce(ctx, now);
        break;
      case 'hazard':
        SoundSystem._hazard(ctx, now);
        break;
      case 'reaction':
        SoundSystem._reaction(ctx, now);
        break;
    }
  }

  private static _note(
    ctx: AudioContext,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    at: number,
    duration: number,
    volume: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, at);
    if (endFreq !== startFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + duration);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    osc.connect(gain);
    gain.connect(SoundSystem._master(ctx));
    osc.start(at);
    osc.stop(at + duration);
  }

  // Square wave pitch drop — impact thud
  private static _punch(ctx: AudioContext, now: number): void {
    SoundSystem._note(ctx, 'square', 180, 80, now, 0.05, 0.35);
  }

  // Two ascending sine tones — collect sparkle
  private static _atomCollect(ctx: AudioContext, now: number): void {
    SoundSystem._note(ctx, 'sine', 440, 440, now, 0.08, 0.2);
    SoundSystem._note(ctx, 'sine', 660, 660, now + 0.06, 0.08, 0.2);
  }

  // C4 → E4 → G4 — upgrade fanfare
  private static _elementUpgrade(ctx: AudioContext, now: number): void {
    [261.63, 329.63, 392].forEach((freq, i) => {
      SoundSystem._note(ctx, 'sine', freq, freq, now + i * 0.09, 0.1, 0.28);
    });
  }

  // Sawtooth sweep down — low boss rumble
  private static _bossRoar(ctx: AudioContext, now: number): void {
    SoundSystem._note(ctx, 'sawtooth', 80, 40, now, 0.4, 0.4);
  }

  // Descending sine + square dissonance — death toll
  private static _playerDeath(ctx: AudioContext, now: number): void {
    SoundSystem._note(ctx, 'sine', 440, 110, now, 0.35, 0.3);
    SoundSystem._note(ctx, 'square', 220, 55, now, 0.35, 0.1);
  }

  // Quick upward "boing" — bounce-pad launch
  private static _bounce(ctx: AudioContext, now: number): void {
    SoundSystem._note(ctx, 'sine', 220, 660, now, 0.18, 0.3);
  }

  // Short noisy sizzle — stepping into acid / spikes
  private static _hazard(ctx: AudioContext, now: number): void {
    SoundSystem._note(ctx, 'sawtooth', 320, 90, now, 0.12, 0.22);
    SoundSystem._note(ctx, 'square', 160, 60, now + 0.02, 0.1, 0.12);
  }

  // Bubbling fizz that builds into an effervescent rising swell — the test-tube reaction
  // when a stage is chosen. A stream of quick upward "blip" sines (the bubbles) layered over
  // a rising sawtooth swell (the liquid climbing the glass) and capped with a bright pop.
  private static _reaction(ctx: AudioContext, now: number): void {
    for (let i = 0; i < 9; i++) {
      const t = now + i * 0.07;
      const base = 300 + i * 55;
      SoundSystem._note(ctx, 'sine', base, base * 1.7, t, 0.09, 0.14);
    }
    SoundSystem._note(ctx, 'sawtooth', 120, 520, now, 0.7, 0.16);
    SoundSystem._note(ctx, 'triangle', 660, 1320, now + 0.62, 0.22, 0.26); // eruption pop
  }
}
