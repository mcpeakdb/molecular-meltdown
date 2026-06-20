# Audio & Settings

Procedural sound effects, procedural background music, and the global settings that gate them.
Sources: [`src/systems/SoundSystem.ts`](../../src/systems/SoundSystem.ts),
[`src/systems/MusicSystem.ts`](../../src/systems/MusicSystem.ts),
[`src/systems/Settings.ts`](../../src/systems/Settings.ts).

## Constraint

- **REQ-AUDIO-001** — All audio shall be synthesized live from Web Audio oscillators/noise — there
  are no audio asset files (a hard project constraint).

## Settings (`Settings`, localStorage `mm.settings.v1`)

- **REQ-CFG-001** — Settings shall hold: volume (0–1), muted, sfx, music, screenShake, touchControls
  (`on`/`off`), fullscreen, tutorialDone, compoundIntroSeen — cached in memory and mirrored to
  localStorage.
- **REQ-CFG-002** — Reads (`get`) shall be cheap and never throw; writes (`set`) shall merge, persist,
  and keep the cache hot, tolerating blocked/full storage by silently not persisting.
- **REQ-CFG-003** — `effectiveVolume` (SFX) shall be 0 when muted or SFX off, else the clamped volume;
  `musicVolume` shall be 0 when muted or music off, else half the clamped volume (music sits under
  SFX).
- **REQ-CFG-004** — `touchControls` shall be an explicit `on`/`off` (no `auto`). `touchActive` shall
  return true iff it is `on`. The first-run default (and any legacy `auto` value) shall resolve to
  `on` for touch-capable devices and `off` otherwise; `cycleTouchControls` toggles between the two.

## Sound effects (`SoundSystem`)

- **REQ-SFX-001** — Every SFX shall route through one master gain per `AudioContext` set to
  `effectiveVolume`, so volume/mute/sfx apply globally.
- **REQ-SFX-002** — IF `effectiveVolume` is 0, THEN `play` shall return immediately (no sound). IF the
  context is suspended, THEN `play` shall resume it first.
- **REQ-SFX-003** — The system shall provide these keyed effects: `punch`, `atom_collect`,
  `element_upgrade`, `boss_roar`, `player_death`, `bounce`, `hazard`, `reaction` — each a short
  synthesized envelope.

## Music (`MusicSystem`)

- **REQ-MUS-001** — Music shall be a stateful singleton driving a look-ahead step sequencer on the
  shared `AudioContext`, scheduling notes precisely on the audio clock; it shall outlive scene
  restarts so music flows unbroken between stages.
- **REQ-MUS-002** — There shall be 5 data-driven tracks: `title`, `sector1`, `sector2`, `sector3`,
  `boss`, each with its own bpm, chord progression, bass/lead lines, pad voicing, drum pattern, and
  oscillator waveforms.
- **REQ-MUS-003** — `setTrack` shall be idempotent — re-requesting the currently playing track shall
  keep it going seamlessly (so advancing stages within a sector does not restart the loop).
- **REQ-MUS-004** — Menus shall use the `title` track; a stage shall use `sector${sector}`; WHEN a
  boss activates the music shall cut to the `boss` track; on player death the music shall stop.
- **REQ-MUS-005** — Each scheduler tick shall set the master gain to `Settings.musicVolume() × track
  gain`, so toggling Music or volume in Settings applies within a tick.
- **REQ-MUS-006** — IF the audio context is not running (e.g. before first user input), THEN the
  scheduler shall attempt to resume it and schedule nothing until it is; IF it falls behind (tab
  backgrounded), THEN it shall resync rather than burst-schedule.
- **REQ-MUS-007** — WHEN stopped, the sequencer shall halt and ramp the master gain down; already
  scheduled notes ring out under their own envelopes.
