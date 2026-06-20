import Settings from './Settings';

// ── Procedural background music ───────────────────────────────────────────────
// Like SoundSystem, everything is synthesized live from oscillators — no audio
// files (a hard project constraint). Unlike SFX, music is continuous, so this is a
// stateful singleton driving a look-ahead step sequencer (the standard Web Audio
// scheduling pattern): a cheap timer wakes every LOOKAHEAD_MS and schedules any
// notes that fall inside the next SCHEDULE_AHEAD-second window, precisely on the
// AudioContext clock. The AudioContext + this module both outlive scene restarts,
// so music flows unbroken between stages; `setTrack` only re-cuts when the
// requested track actually changes.

export type TrackId = 'title' | 'sector1' | 'sector2' | 'sector3' | 'sector4' | 'boss';

interface TrackDef {
  bpm: number;
  /** Frequency of the key root, in the mid (pad) octave. Bass plays an octave below, lead an octave above. */
  root: number;
  /** Chord roots in semitones from `root`, one per bar — the harmonic loop. */
  prog: number[];
  /**
   * Bass notes are semitone offsets from the *current chord* root (or null = rest). Length is any
   * multiple of 16 (one or more bars): a 16-step line repeats every bar, while a `prog.length × 16`
   * line is through-composed across the whole progression. It loops over its own length.
   */
  bass: (number | null)[];
  /**
   * Lead notes are offsets from the *key* root (stays in key over the moving chords). Same length
   * rule as `bass`: 16 steps repeats per bar, or `prog.length × 16` plays a full melody across the
   * progression (e.g. to resolve differently on the last bar). It loops over its own length.
   */
  lead: (number | null)[];
  /** Chord voicing layered as a soft pad at each bar start — root/fifth/octave (no third → fits major or minor). */
  voicing: number[];
  kick: boolean[];
  snare: boolean[];
  hat: boolean[];
  waves: { bass: OscillatorType; lead: OscillatorType; pad: OscillatorType };
  /** Track-level mix trim. */
  gain: number;
}

const STEPS_PER_BAR = 16;
const LOOKAHEAD_MS = 30;
const SCHEDULE_AHEAD = 0.18; // seconds of audio scheduled in advance

const hz = (root: number, semis: number): number => root * 2 ** (semis / 12);

// Power-chord pad voicing reused everywhere (root + fifth + octave): no third, so it never fights the
// major/minor colour the lead and bassline imply.
const POWER: number[] = [0, 7, 12];

// Boolean drum pattern from the indices that fire (keeps the track tables readable).
const beat = (...on: number[]): boolean[] => {
  const a = Array(STEPS_PER_BAR).fill(false);
  for (const i of on) a[i] = true;
  return a;
};

const TRACKS: Record<TrackId, TrackDef> = {
  // Calm, curious lab ambient — sparse, no drums. A minor.
  title: {
    bpm: 86,
    root: 220,
    prog: [0, 8, 3, 10], // Am – F – C – G
    bass: [0, null, null, null, null, null, 7, null, 0, null, null, null, 5, null, null, null],
    // biome-ignore format: one bar (16 steps) per line — keep the 4-bar grid readable
    lead: [
      12, null, null, 15, null, 14, null, null, 10, null, 12, null, 7, null, null, null,
      12, null, null, 15, null, 14, null, null, 10, null, 12, null, 7, null, null, null,
      12, null, null, 15, null, 14, null, null, 10, null, 12, null, 7, null, null, null,
      12, null, null, 15, null, 14, null, null, 10, null, 12, null, 19, null, 17, null,
    ],
    voicing: POWER,
    kick: beat(),
    snare: beat(),
    hat: beat(2, 6, 10, 14),
    waves: { bass: 'triangle', lead: 'sine', pad: 'triangle' },
    gain: 0.9,
  },

  // Sector 1 — bright, bouncy, cellular green. C major.
  sector1: {
    bpm: 122,
    root: 261.63,
    prog: [0, 7, 9, 5], // C – G – Am – F
    bass: [0, null, 7, null, 0, null, 7, null, 0, null, 12, null, 7, null, 7, null],
    // biome-ignore format: one bar (16 steps) per line — keep the 4-bar grid readable
    lead: [
      12, null, 16, 19, 21, null, 19, 16, 17, null, 21, 24, 21, null, 19, null,
      12, null, 16, 19, 21, null, 19, 16, 17, null, 21, 24, 21, null, 19, null,
      12, null, 16, 19, 21, null, 19, 16, 17, null, 21, 24, 21, null, 19, null,
      21, null, 19, 17, 16, null, 17, 16, 17, null, 19, 16, 17, 14, 16, 11,
    ],
    voicing: POWER,
    kick: beat(0, 8, 11),
    snare: beat(4, 12),
    hat: beat(2, 6, 10, 14),
    waves: { bass: 'square', lead: 'square', pad: 'triangle' },
    gain: 0.85,
  },

  // Sector 2 — driving, grittier, dorian sway. A dorian.
  sector2: {
    bpm: 128,
    root: 220,
    prog: [0, 5, 10, 8], // Am – Dm – G – F
    bass: [0, 0, null, 0, 7, null, 0, null, 0, 0, null, 12, 7, null, 10, null],
    // biome-ignore format: one bar (16 steps) per line — keep the 4-bar grid readable
    lead: [
      9, null, 12, null, 14, 12, null, 9, 7, null, 9, 12, 14, null, null, null,
      9, null, 12, null, 14, 12, null, 9, 7, null, 9, 12, 14, null, null, null,
      9, null, 12, null, 14, 12, null, 9, 7, null, 9, 12, 14, null, null, null,
      14, null, null, 12, null, null, 9, null, null, 7, null, null, 9, null, 12, null,
    ],
    voicing: POWER,
    kick: beat(0, 6, 8, 14),
    snare: beat(4, 12),
    hat: beat(0, 2, 4, 6, 8, 10, 12, 14),
    waves: { bass: 'sawtooth', lead: 'square', pad: 'sawtooth' },
    gain: 0.8,
  },

  // Sector 3 — cold, tense, crystalline. A phrygian (the b2 supplies the unease).
  sector3: {
    bpm: 132,
    root: 220,
    prog: [0, 1, 8, 7], // Am – Bb – F – Em
    bass: [0, null, 0, 1, 0, null, 7, null, 0, null, 0, 1, 0, null, 8, null],
    lead: [12, 13, null, 12, 8, null, 7, null, 8, 13, null, 12, 8, 7, null, null],
    voicing: POWER,
    kick: beat(0, 8),
    snare: beat(4, 12),
    hat: beat(2, 5, 6, 10, 13, 14),
    waves: { bass: 'square', lead: 'triangle', pad: 'square' },
    gain: 0.78,
  },

  // Sector 4 — LAB FLOOR: driving, mechanical, a touch industrial. A minor with a tense bVI/V pull.
  sector4: {
    bpm: 138,
    root: 220,
    prog: [0, 5, 3, 7], // Am – Dm – C – E
    bass: [0, 0, 0, 7, 0, 0, 3, 0, 0, 0, 0, 7, 5, 5, 7, 7],
    lead: [12, null, 15, null, 19, null, 15, 12, 14, null, 12, null, 10, null, null, null],
    voicing: POWER,
    kick: beat(0, 4, 6, 8, 12, 14),
    snare: beat(4, 12),
    hat: beat(0, 2, 4, 6, 8, 10, 12, 14),
    waves: { bass: 'sawtooth', lead: 'square', pad: 'sawtooth' },
    gain: 0.8,
  },

  // Boss — fast, aggressive, relentless 16th-note bass. A minor with an E-major lift for menace.
  boss: {
    bpm: 150,
    root: 220,
    prog: [0, 10, 3, 7], // Am – G – C – E
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 7, 7, 12, 7],
    lead: [12, null, 12, 15, null, 14, 12, null, 17, null, 15, null, 12, null, 11, null],
    voicing: POWER,
    kick: beat(0, 3, 6, 8, 11, 14),
    snare: beat(4, 12),
    hat: beat(0, 2, 4, 6, 8, 10, 12, 14),
    waves: { bass: 'sawtooth', lead: 'square', pad: 'sawtooth' },
    gain: 0.88,
  },
};

export default class MusicSystem {
  private static ctx: AudioContext | null = null;
  private static master: GainNode | null = null;
  private static noise: AudioBuffer | null = null;

  private static trackId: TrackId | null = null;
  private static track: TrackDef | null = null;
  private static step = 0;
  private static nextTime = 0;
  private static timer: number | null = null;

  /** Switch to a track (idempotent — re-requesting the playing one keeps it going seamlessly). */
  static setTrack(ctx: AudioContext, id: TrackId): void {
    MusicSystem._ensure(ctx);
    if (MusicSystem.trackId === id && MusicSystem.timer !== null) return;
    MusicSystem.trackId = id;
    MusicSystem.track = TRACKS[id];
    MusicSystem.step = 0;
    MusicSystem.nextTime = ctx.currentTime + 0.06;
    if (MusicSystem.timer === null) {
      MusicSystem.timer = window.setInterval(() => MusicSystem._scheduler(), LOOKAHEAD_MS);
    }
  }

  /** Stop the sequencer. Already-scheduled notes ring out under their own envelopes. */
  static stop(): void {
    if (MusicSystem.timer !== null) {
      clearInterval(MusicSystem.timer);
      MusicSystem.timer = null;
    }
    MusicSystem.trackId = null;
    MusicSystem.track = null;
    if (MusicSystem.master && MusicSystem.ctx) {
      MusicSystem.master.gain.setTargetAtTime(0, MusicSystem.ctx.currentTime, 0.08);
    }
  }

  private static _ensure(ctx: AudioContext): void {
    if (MusicSystem.ctx === ctx && MusicSystem.master) return;
    MusicSystem.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    MusicSystem.master = master;
    // One second of white noise, reused for every percussion hit.
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    MusicSystem.noise = buf;
  }

  private static _scheduler(): void {
    const ctx = MusicSystem.ctx;
    const track = MusicSystem.track;
    const master = MusicSystem.master;
    if (!ctx || !track || !master) return;
    // Don't schedule against a frozen clock — wait for the browser to unlock audio on first input.
    if (ctx.state !== 'running') {
      ctx.resume?.();
      return;
    }
    // Resync if we fell behind (e.g. the tab was backgrounded or audio just unlocked).
    if (MusicSystem.nextTime < ctx.currentTime) MusicSystem.nextTime = ctx.currentTime + 0.06;

    // Track live settings — toggling Music / volume in the menu applies within a tick.
    master.gain.setTargetAtTime(Settings.musicVolume() * track.gain, ctx.currentTime, 0.08);

    const sp16 = 60 / track.bpm / 4; // seconds per 16th note
    const total = STEPS_PER_BAR * track.prog.length;
    while (MusicSystem.nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      MusicSystem._scheduleStep(track, MusicSystem.step, MusicSystem.nextTime, sp16);
      MusicSystem.step = (MusicSystem.step + 1) % total;
      MusicSystem.nextTime += sp16;
    }
  }

  private static _scheduleStep(track: TrackDef, step: number, at: number, sp16: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR) % track.prog.length;
    const s = step % STEPS_PER_BAR;
    const chord = track.prog[bar];

    // Bass/lead index by the full step position (mod their own length) so a 16-step array repeats
    // per bar while a multi-bar array plays through the whole progression. Drums stay per-bar (`s`).
    const b = track.bass[step % track.bass.length];
    if (b !== null) MusicSystem._tone(track.waves.bass, hz(track.root / 2, chord + b), at, sp16 * 1.7, 0.34, 0.004);

    const l = track.lead[step % track.lead.length];
    if (l !== null) MusicSystem._tone(track.waves.lead, hz(track.root * 2, l), at, sp16 * 1.5, 0.14, 0.01);

    if (s === 0) {
      for (const v of track.voicing) {
        MusicSystem._pad(track.waves.pad, hz(track.root, chord + v), at, sp16 * STEPS_PER_BAR);
      }
    }

    if (track.kick[s]) MusicSystem._kick(at);
    if (track.snare[s]) MusicSystem._snare(at);
    if (track.hat[s]) MusicSystem._hat(at);
  }

  // ── Voices ──────────────────────────────────────────────────────────────────

  private static _tone(type: OscillatorType, freq: number, at: number, dur: number, vol: number, attack: number): void {
    const ctx = MusicSystem.ctx;
    const master = MusicSystem.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  // Detuned pair through a gentle low-pass — a soft sustained chord bed.
  private static _pad(type: OscillatorType, freq: number, at: number, dur: number): void {
    const ctx = MusicSystem.ctx;
    const master = MusicSystem.master;
    if (!ctx || !master) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.06, at + dur * 0.15);
    g.gain.linearRampToValueAtTime(0.045, at + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    filter.connect(g);
    g.connect(master);
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, at);
      osc.detune.setValueAtTime(detune, at);
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    }
  }

  private static _kick(at: number): void {
    const ctx = MusicSystem.ctx;
    const master = MusicSystem.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(48, at + 0.12);
    g.gain.setValueAtTime(0.5, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 0.18);
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + 0.2);
  }

  private static _snare(at: number): void {
    const ctx = MusicSystem.ctx;
    const master = MusicSystem.master;
    const noise = MusicSystem.noise;
    if (!ctx || !master || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 0.16);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(at);
    src.stop(at + 0.18);
  }

  private static _hat(at: number): void {
    const ctx = MusicSystem.ctx;
    const master = MusicSystem.master;
    const noise = MusicSystem.noise;
    if (!ctx || !master || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 0.04);
    src.connect(hp);
    hp.connect(g);
    g.connect(master);
    src.start(at);
    src.stop(at + 0.05);
  }
}
