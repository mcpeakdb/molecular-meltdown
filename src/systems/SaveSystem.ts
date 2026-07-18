import type { BaseAtom, Difficulty } from '../constants';
import { STAGE_COUNT } from '../constants';

// ── Meta persistence ──────────────────────────────────────────────────────────
// All cross-session progression lives in one namespaced localStorage key. Records
// are kept separately per difficulty (a Hard clear must not unlock Easy records).
// Atom carry between stages is *not* here — the game is arcade (atoms reset each
// stage), so the molecular tree is run-scoped, not saved.

const SAVE_KEY = 'mm.save.v2';
const LEGACY_KEY_V1 = 'mm.save.v1';
const LEADERBOARD_SIZE = 5;

// Phase 7 renamed the difficulty tiers (easy/normal/hard → normal/hard/extreme). Old v1
// saves are migrated one notch up the first time v2 is read.
const LEGACY_DIFF_MAP: Record<string, Difficulty> = { easy: 'normal', normal: 'hard', hard: 'extreme' };

/** One finished playthrough, stored on the leaderboard. */
export interface RunRecord {
  score: number;
  stageReached: number; // 1..STAGE_COUNT
  difficulty: Difficulty;
  atoms: Record<BaseAtom, number>; // the atom path of the last stage played
  molecules: string[]; // assembled attack/molecule ids
  date: number; // epoch ms
}

interface DifficultySave {
  /** Highest stage the player may select (clearing N unlocks N+1). */
  unlockedStage: number;
  /** Best score earned within a single stage, keyed by stage number. */
  bestScores: Record<number, number>;
  leaderboard: RunRecord[];
}

interface SaveData {
  normal: DifficultySave;
  hard: DifficultySave;
  extreme: DifficultySave;
}

const DIFFICULTIES: Difficulty[] = ['normal', 'hard', 'extreme'];

function emptyDifficulty(): DifficultySave {
  return { unlockedStage: 1, bestScores: {}, leaderboard: [] };
}

function emptySave(): SaveData {
  return {
    normal: emptyDifficulty(),
    hard: emptyDifficulty(),
    extreme: emptyDifficulty(),
  };
}

export default class SaveSystem {
  /** Read the whole save, tolerating missing/corrupt data by falling back to defaults. */
  static load(): SaveData {
    const base = emptySave();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return SaveSystem._migrateV1() ?? base;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      for (const d of DIFFICULTIES) {
        const slot = parsed[d];
        if (!slot) continue;
        base[d] = {
          unlockedStage: clampStage(slot.unlockedStage ?? 1),
          bestScores: slot.bestScores ?? {},
          leaderboard: Array.isArray(slot.leaderboard) ? slot.leaderboard.slice(0, LEADERBOARD_SIZE) : [],
        };
      }
    } catch {
      // Corrupt or unavailable storage — start fresh rather than crash.
      return emptySave();
    }
    return base;
  }

  /** One-time migration of a pre-Phase-7 (v1) save into the renamed tiers; persists & returns it. */
  private static _migrateV1(): SaveData | null {
    try {
      const raw = localStorage.getItem(LEGACY_KEY_V1);
      if (!raw) return null;
      const old = JSON.parse(raw) as Record<string, Partial<DifficultySave>>;
      const base = emptySave();
      for (const oldKey of Object.keys(LEGACY_DIFF_MAP)) {
        const newKey = LEGACY_DIFF_MAP[oldKey];
        const slot = old[oldKey];
        if (!slot) continue;
        const board = Array.isArray(slot.leaderboard) ? slot.leaderboard.slice(0, LEADERBOARD_SIZE) : [];
        base[newKey] = {
          unlockedStage: clampStage(slot.unlockedStage ?? 1),
          bestScores: slot.bestScores ?? {},
          leaderboard: board.map((r) => ({ ...r, difficulty: newKey })),
        };
      }
      SaveSystem._save(base);
      return base;
    } catch {
      return null;
    }
  }

  private static _save(data: SaveData): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked (e.g. private mode) — progression just won't persist.
    }
  }

  static getUnlockedStage(difficulty: Difficulty): number {
    return SaveSystem.load()[difficulty].unlockedStage;
  }

  /** Record a stage clear: unlock the next stage. No-op past the final stage. */
  static markStageCleared(difficulty: Difficulty, stage: number): void {
    const data = SaveSystem.load();
    const next = clampStage(stage + 1);
    data[difficulty].unlockedStage = Math.max(data[difficulty].unlockedStage, next);
    SaveSystem._save(data);
  }

  /** Unlock everything up to `stage` (e.g. via a passcode). No-op if already past it. */
  static unlockUpToStage(difficulty: Difficulty, stage: number): void {
    const data = SaveSystem.load();
    data[difficulty].unlockedStage = Math.max(data[difficulty].unlockedStage, clampStage(stage));
    SaveSystem._save(data);
  }

  static getBestScore(difficulty: Difficulty, stage: number): number {
    return SaveSystem.load()[difficulty].bestScores[stage] ?? 0;
  }

  /** Store a per-stage best score; returns true if it beat the previous best. */
  static recordBestScore(difficulty: Difficulty, stage: number, score: number): boolean {
    const data = SaveSystem.load();
    const prev = data[difficulty].bestScores[stage] ?? 0;
    if (score <= prev) return false;
    data[difficulty].bestScores[stage] = score;
    SaveSystem._save(data);
    return true;
  }

  /** Insert a finished run into its difficulty leaderboard. Returns 0-based rank, or -1 if it didn't place. */
  static submitRun(record: RunRecord): number {
    const data = SaveSystem.load();
    const board = data[record.difficulty].leaderboard;
    board.push(record);
    board.sort((a, b) => b.score - a.score);
    const rank = board.indexOf(record);
    data[record.difficulty].leaderboard = board.slice(0, LEADERBOARD_SIZE);
    SaveSystem._save(data);
    return rank < LEADERBOARD_SIZE ? rank : -1;
  }

  static getLeaderboard(difficulty: Difficulty): RunRecord[] {
    return SaveSystem.load()[difficulty].leaderboard;
  }
}

function clampStage(stage: number): number {
  if (!Number.isFinite(stage)) return 1;
  return Math.min(STAGE_COUNT, Math.max(1, Math.floor(stage)));
}
