// Simple shared state between tabs — no route params needed
import AsyncStorage from '@react-native-async-storage/async-storage';

function _getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
let _workoutFinished = false;
const _listeners: Array<(v: boolean) => void> = [];

// Per-day timer state keyed by dayIndex
type _TimerEntry = { startedAt: number | null; pausedElapsed: number };
const _timers: Record<number, _TimerEntry> = {};

// Wall-clock start times — actual real-world timestamp when a workout first started
// Persisted to AsyncStorage so timer survives app restarts
const _wallStartTimes: Record<number, number | null> = {};
function _getTimer(dayIndex: number): _TimerEntry {
  if (!_timers[dayIndex]) _timers[dayIndex] = { startedAt: null, pausedElapsed: 0 };
  return _timers[dayIndex];
}
const _timerListeners: Array<() => void> = [];

// Stores last completed exercise data per workout type (e.g. 'Push Day', 'Pull Day', 'Leg Day')
// Each entry maps exercise name -> array of { reps, weight } per set
// date: timestamp of the workout — only newer entries replace older ones
type PrevSetData = { reps: number; weight: number; hold?: number };
type PrevExerciseData = { name: string; sets: PrevSetData[]; mode?: 'reps' | 'hold' };
type PrevEntry = { exercises: PrevExerciseData[]; date: number };
const _prevData: Record<string, PrevEntry> = {};
const _prevDataBackup: Record<string, PrevEntry | undefined> = {};

// Exercise weight history — accumulates over time for the progress chart
// Key = exercise name, value = array of { date (timestamp), weight (heaviest set), bestSetVolume (best reps×weight) }
export type ExerciseHistoryEntry = { date: number; weight: number; bestSetVolume: number; programColor?: string };
const _exerciseHistory: Record<string, ExerciseHistoryEntry[]> = {};

// Workout log — one entry per completed workout for volume/stats tracking
export type WorkoutLogEntry = { date: number; volume: number; durationSecs: number };
const _workoutLog: WorkoutLogEntry[] = [];

// Workout journal — full detail log for the journal screen
export type LoggedSet = { reps: number; weight: number | null; hold: number; isWarmup: boolean };
export type LoggedExercise = { name: string; mode: 'reps' | 'hold'; sets: LoggedSet[]; notes?: string };
export type LoggedSession = { label: string; exercises: LoggedExercise[] };
export type WorkoutJournalEntry = {
  id: string;
  date: number;
  programName: string;
  programColor: string;
  dayLabel: string;
  durationSecs: number;
  totalVolume: number;
  sessions: LoggedSession[];
};
const _journalLog: WorkoutJournalEntry[] = [];

// AsyncStorage keys
const JOURNAL_KEY = '@journal_v1';
const HISTORY_KEY = '@history_v1';
const PREV_KEY = '@prev_v2';

// Internal helper — updates prev data for a label only if the new date is >= stored date
function _savePrevInternal(dayLabel: string, exercises: PrevExerciseData[], date: number) {
  const current = _prevData[dayLabel];
  if (!current || date > current.date) {
    _prevData[dayLabel] = { exercises, date };
  }
}

// Listeners notified whenever _prevData changes (so workout tab can reload exercises)
const _prevListeners: Array<() => void> = [];
function _notifyPrevChanged() {
  _prevListeners.forEach(fn => fn());
}

// Listeners notified when a journal entry is updated (so workout tab can patch its cache)
const _journalUpdateListeners: Array<(entry: WorkoutJournalEntry) => void> = [];
function _notifyJournalUpdate(entry: WorkoutJournalEntry) {
  _journalUpdateListeners.forEach(fn => fn(entry));
}

// Persist all prev data to AsyncStorage
function _persistPrev() {
  AsyncStorage.setItem(PREV_KEY, JSON.stringify(_prevData)).catch(() => {});
}

// Persist journal to AsyncStorage
function _persistJournal() {
  AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(_journalLog)).catch(() => {});
}

// Persist history to AsyncStorage
function _persistHistory() {
  AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(_exerciseHistory)).catch(() => {});
}

export const workoutState = {
  get finished() { return _workoutFinished; },
  setFinished(v: boolean) {
    _workoutFinished = v;
    _listeners.forEach(fn => fn(v));
  },
  subscribe(fn: (v: boolean) => void) {
    _listeners.push(fn);
    return () => {
      const i = _listeners.indexOf(fn);
      if (i >= 0) _listeners.splice(i, 1);
    };
  },

  // Load all persisted data from AsyncStorage — call once on app startup
  async initStorage(): Promise<void> {
    try {
      const [journalRaw, historyRaw, prevRaw] = await Promise.all([
        AsyncStorage.getItem(JOURNAL_KEY),
        AsyncStorage.getItem(HISTORY_KEY),
        AsyncStorage.getItem(PREV_KEY),
      ]);

      if (journalRaw) {
        const parsed: WorkoutJournalEntry[] = JSON.parse(journalRaw);
        _journalLog.length = 0;
        _journalLog.push(...parsed.map(e => ({ ...e, date: Number(e.date) })));
      }

      if (historyRaw) {
        const parsed: Record<string, ExerciseHistoryEntry[]> = JSON.parse(historyRaw);
        for (const [k, v] of Object.entries(parsed)) {
          _exerciseHistory[k] = v;
        }
      }

      if (prevRaw) {
        const parsed: Record<string, PrevEntry> = JSON.parse(prevRaw);
        for (const [k, v] of Object.entries(parsed)) {
          _prevData[k] = v;
        }
      } else {
        // Migration: load old-format prev data (array only, no date) if present
        const oldPrevRaw = await AsyncStorage.getItem('@prev_data');
        if (oldPrevRaw) {
          const parsed: Record<string, PrevExerciseData[]> = JSON.parse(oldPrevRaw);
          for (const [k, v] of Object.entries(parsed)) {
            _prevData[k] = { exercises: v, date: 0 };
          }
          _persistPrev();
        }
      }
      _notifyPrevChanged();
    } catch {}
  },

  // Timer (per-day)
  /** Returns the dayIndex of any active (running or paused) workout, or null */
  getActiveDay(): number | null {
    for (const [key, t] of Object.entries(_timers)) {
      if (t.startedAt || t.pausedElapsed > 0) return Number(key);
    }
    return null;
  },
  getTimerStartedAt(day: number) { return _getTimer(day).startedAt; },
  getTimerPausedElapsed(day: number) { return _getTimer(day).pausedElapsed; },
  /** Total elapsed seconds for a given day */
  getElapsed(day: number) {
    const t = _getTimer(day);
    if (t.startedAt) return t.pausedElapsed + Math.floor((Date.now() - t.startedAt) / 1000);
    return t.pausedElapsed;
  },
  startTimer(day: number) {
    const t = _getTimer(day);
    if (!t.startedAt) {
      // Record actual wall-clock start time only on first start (not on resume after pause)
      if (!_wallStartTimes[day]) {
        const now = Date.now();
        _wallStartTimes[day] = now;
        AsyncStorage.setItem(`@wall_start_${day}`, String(now)).catch(() => {});
      }
      t.startedAt = Date.now();
      _timerListeners.forEach(fn => fn());
    }
  },
  pauseTimer(day: number) {
    const t = _getTimer(day);
    if (t.startedAt) {
      t.pausedElapsed += Math.floor((Date.now() - t.startedAt) / 1000);
      t.startedAt = null;
      _timerListeners.forEach(fn => fn());
    }
  },
  resetTimer(day: number) {
    _timers[day] = { startedAt: null, pausedElapsed: 0 };
    _wallStartTimes[day] = null;
    AsyncStorage.removeItem(`@wall_start_${day}`).catch(() => {});
    _timerListeners.forEach(fn => fn());
  },
  stopTimer(day: number) {
    _timers[day] = { startedAt: null, pausedElapsed: 0 };
    _wallStartTimes[day] = null;
    AsyncStorage.removeItem(`@wall_start_${day}`).catch(() => {});
    _timerListeners.forEach(fn => fn());
  },

  // Wall-clock time accessors
  getWallStartTime(day: number): number | null {
    return _wallStartTimes[day] ?? null;
  },
  async loadWallStartTime(day: number): Promise<number | null> {
    try {
      const raw = await AsyncStorage.getItem(`@wall_start_${day}`);
      if (raw) {
        _wallStartTimes[day] = Number(raw);
        return Number(raw);
      }
    } catch {}
    return null;
  },
  subscribeTimer(fn: () => void) {
    _timerListeners.push(fn);
    return () => {
      const i = _timerListeners.indexOf(fn);
      if (i >= 0) _timerListeners.splice(i, 1);
    };
  },

  // Subscribe to prev data changes (e.g. journal entry saved) — workout tab uses this to reload exercises
  subscribePrev(fn: () => void) {
    _prevListeners.push(fn);
    return () => {
      const i = _prevListeners.indexOf(fn);
      if (i >= 0) _prevListeners.splice(i, 1);
    };
  },

  // Subscribe to journal entry updates — workout tab uses this to patch its live exercise cache
  subscribeJournalUpdate(fn: (entry: WorkoutJournalEntry) => void) {
    _journalUpdateListeners.push(fn);
    return () => {
      const i = _journalUpdateListeners.indexOf(fn);
      if (i >= 0) _journalUpdateListeners.splice(i, 1);
    };
  },

  // Save prev data for a session — only updates if date is more recent than what's stored
  savePrev(dayLabel: string, exercises: PrevExerciseData[], date?: number) {
    const ts = date ?? Date.now();
    _prevDataBackup[dayLabel] = _prevData[dayLabel];
    _savePrevInternal(dayLabel, exercises, ts);
    _persistPrev();
    _notifyPrevChanged();
  },
  restorePrev(dayLabel: string) {
    if (_prevDataBackup[dayLabel] !== undefined) {
      // A backup exists — restore to the state before savePrev was called
      if (_prevDataBackup[dayLabel]) {
        _prevData[dayLabel] = _prevDataBackup[dayLabel]!;
      } else {
        delete _prevData[dayLabel];
      }
      delete _prevDataBackup[dayLabel];
      _persistPrev();
      _notifyPrevChanged();
    }
    // No backup means savePrev was never called for this label — leave existing data untouched
  },
  getPrev(dayLabel: string): PrevExerciseData[] | undefined {
    return _prevData[dayLabel]?.exercises;
  },

  // Exercise history — records max weight per exercise each time a workout is saved
  saveHistory(exercises: PrevExerciseData[], date?: number) {
    const ts = date ?? Date.now();
    for (const ex of exercises) {
      const maxWeight = Math.max(...ex.sets.map(s => s.weight), 0);
      if (maxWeight <= 0) continue;
      if (!_exerciseHistory[ex.name]) _exerciseHistory[ex.name] = [];
      _exerciseHistory[ex.name].push({ date: ts, weight: maxWeight });
    }
    _persistHistory();
  },
  getHistory(exerciseName: string, programName?: string): ExerciseHistoryEntry[] {
    // Derive both metrics from the journal log (authoritative, persisted source)
    const byDay = new Map<string, ExerciseHistoryEntry>();
    const journalEntries = programName
      ? _journalLog.filter(e => e.programName === programName)
      : _journalLog;
    for (const entry of journalEntries) {
      for (const session of entry.sessions) {
        const ex = session.exercises.find(e => e.name === exerciseName);
        if (!ex) continue;
        const validSets = ex.sets.filter(s => (s.weight ?? 0) > 0);
        if (validSets.length === 0) continue;
        const maxWeight = Math.max(...validSets.map(s => s.weight ?? 0));
        const bestSetVol = Math.max(...validSets.map(s =>
          ex.mode === 'hold'
            ? (s.hold ?? 0) * (s.weight ?? 0)
            : (s.reps ?? 0) * (s.weight ?? 0)
        ));
        const day = new Date(entry.date).toDateString();
        const existing = byDay.get(day);
        if (!existing) {
          byDay.set(day, { date: entry.date, weight: maxWeight, bestSetVolume: bestSetVol, programColor: entry.programColor });
        } else {
          byDay.set(day, {
            date: entry.date,
            weight: Math.max(existing.weight, maxWeight),
            bestSetVolume: Math.max(existing.bestSetVolume, bestSetVol),
            programColor: maxWeight > existing.weight ? entry.programColor : existing.programColor,
          });
        }
      }
    }
    // Fall back to stored history for any days not covered by the journal (legacy data, no program filter)
    if (!programName) {
      for (const e of (_exerciseHistory[exerciseName] || [])) {
        const day = new Date(e.date).toDateString();
        if (!byDay.has(day)) byDay.set(day, { ...e, bestSetVolume: e.bestSetVolume ?? 0 });
      }
    }
    return Array.from(byDay.values()).sort((a, b) => a.date - b.date);
  },

  // Workout log — records each completed workout with volume & duration
  logWorkout(volume: number, durationSecs: number) {
    _workoutLog.push({ date: Date.now(), volume, durationSecs });
  },
  getWorkoutLog(programName?: string): WorkoutLogEntry[] {
    // Derive from the persisted journal log so stats survive app restarts
    // and include workouts logged manually via the journal
    const entries = programName
      ? _journalLog.filter(e => e.programName === programName)
      : _journalLog;
    return [...entries]
      .sort((a, b) => a.date - b.date)
      .map(e => ({ date: e.date, volume: e.totalVolume, durationSecs: e.durationSecs }));
  },

  // Journal — full detail log per completed workout
  logJournalEntry(entry: WorkoutJournalEntry) {
    _journalLog.push(entry);
    // Update prev data and exercise history for each session
    for (const session of entry.sessions) {
      const exercises = session.exercises.map(e => ({
        name: e.name,
        mode: e.mode,
        sets: e.sets.map(s => ({ reps: s.reps, weight: s.weight ?? 0, hold: s.hold ?? 0 })),
      }));
      _savePrevInternal(session.label, exercises, entry.date);
      // Record max weight and best set volume per exercise in history
      for (const ex of exercises) {
        const maxWeight = Math.max(...ex.sets.map(s => s.weight), 0);
        if (maxWeight <= 0) continue;
        const bestSetVolume = Math.max(...ex.sets.map(s =>
          ex.mode === 'hold' ? (s.hold ?? 0) * s.weight : s.reps * s.weight
        ), 0);
        if (!_exerciseHistory[ex.name]) _exerciseHistory[ex.name] = [];
        _exerciseHistory[ex.name].push({ date: entry.date, weight: maxWeight, bestSetVolume });
      }
    }
    _persistHistory();
    _persistPrev();
    _notifyPrevChanged();
    _persistJournal();
  },
  updateJournalEntry(entry: WorkoutJournalEntry) {
    // Recalculate totalVolume from actual set data
    const totalVolume = entry.sessions.reduce((sum, session) =>
      sum + session.exercises.reduce((eSum, ex) =>
        eSum + ex.sets.reduce((sSum, set) => {
          if (ex.mode === 'hold') return sSum + ((set.hold ?? 0) * (set.weight ?? 0)) / 30;
          return sSum + (set.reps * (set.weight ?? 0));
        }, 0), 0), 0);
    const updatedEntry = { ...entry, totalVolume };
    const idx = _journalLog.findIndex(e => e.id === entry.id);
    if (idx >= 0) _journalLog[idx] = updatedEntry;
    // Update prev data and exercise history for each session
    const entryDateStr = new Date(entry.date).toDateString();
    for (const session of updatedEntry.sessions) {
      const exercises = session.exercises.map(e => ({
        name: e.name,
        mode: e.mode,
        sets: e.sets.map(s => ({ reps: s.reps, weight: s.weight ?? 0, hold: s.hold ?? 0 })),
      }));
      _savePrevInternal(session.label, exercises, entry.date);
      // Replace history entries for this date with updated max weights
      for (const ex of exercises) {
        const maxWeight = Math.max(...ex.sets.map(s => s.weight), 0);
        const bestSetVolume = Math.max(...ex.sets.map(s =>
          ex.mode === 'hold' ? (s.hold ?? 0) * s.weight : s.reps * s.weight
        ), 0);
        if (!_exerciseHistory[ex.name]) _exerciseHistory[ex.name] = [];
        _exerciseHistory[ex.name] = _exerciseHistory[ex.name].filter(
          e => new Date(e.date).toDateString() !== entryDateStr
        );
        if (maxWeight > 0) _exerciseHistory[ex.name].push({ date: entry.date, weight: maxWeight, bestSetVolume });
      }
    }
    _persistHistory();
    _persistPrev();
    _notifyPrevChanged();
    _notifyJournalUpdate(updatedEntry);
    _persistJournal();
  },
  getJournalLog(): WorkoutJournalEntry[] {
    return [..._journalLog].sort((a, b) => b.date - a.date);
  },
  getJournalEntry(id: string): WorkoutJournalEntry | undefined {
    return _journalLog.find(e => e.id === id);
  },
  deleteJournalEntry(id: string) {
    const idx = _journalLog.findIndex(e => e.id === id);
    if (idx >= 0) _journalLog.splice(idx, 1);
    _persistJournal();
    // Rebuild prev data from remaining journal entries so deletion rolls back correctly
    const keys = Object.keys(_prevData);
    for (const k of keys) delete _prevData[k];
    // Replay all remaining journal entries from oldest to newest
    const sorted = [..._journalLog].sort((a, b) => a.date - b.date);
    for (const e of sorted) {
      for (const session of e.sessions) {
        const exercises = session.exercises.map(ex => ({
          name: ex.name,
          mode: ex.mode,
          sets: ex.sets.map(s => ({ reps: s.reps, weight: s.weight ?? 0, hold: s.hold ?? 0 })),
        }));
        _savePrevInternal(session.label, exercises, e.date);
      }
    }
    _persistPrev();
    _notifyPrevChanged();
  },

  // Remove the workout log entry for a given calendar day (most recent match)
  deleteWorkoutLog(date: Date) {
    const dateStr = date.toDateString();
    for (let i = _workoutLog.length - 1; i >= 0; i--) {
      if (new Date(_workoutLog[i].date).toDateString() === dateStr) {
        _workoutLog.splice(i, 1);
        break;
      }
    }
  },

  // Cycle offset — persists across sessions via AsyncStorage.
  // Tracks which day of the program cycle is "today", advancing each day automatically.
  async getCycleOffset(programId: string, cycleLength: number): Promise<number> {
    if (cycleLength <= 1) return 0;
    const key = `@cycle_${programId}`;
    const today = _getTodayStr();
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) {
        await AsyncStorage.setItem(key, JSON.stringify({ offset: 0, date: today }));
        return 0;
      }
      const stored: { offset: number; date: string } = JSON.parse(raw);
      if (stored.date === today) return stored.offset;
      const storedDate = new Date(stored.date + 'T00:00:00');
      const todayDate = new Date(today + 'T00:00:00');
      const daysPassed = Math.round((todayDate.getTime() - storedDate.getTime()) / 86400000);
      if (daysPassed <= 0) return stored.offset;
      const newOffset = ((stored.offset + daysPassed) % cycleLength + cycleLength) % cycleLength;
      await AsyncStorage.setItem(key, JSON.stringify({ offset: newOffset, date: today }));
      return newOffset;
    } catch { return 0; }
  },

  // Reset cycle so today = Day 1 (splitDays[0]) of the program
  async resetCycleOffset(programId: string): Promise<void> {
    const key = `@cycle_${programId}`;
    try {
      await AsyncStorage.setItem(key, JSON.stringify({ offset: 0, date: _getTodayStr() }));
    } catch {}
  },

  // Remove exercise history entries recorded on a given calendar day
  deleteHistoryForDate(date: Date) {
    const dateStr = date.toDateString();
    for (const name of Object.keys(_exerciseHistory)) {
      _exerciseHistory[name] = _exerciseHistory[name].filter(
        e => new Date(e.date).toDateString() !== dateStr
      );
    }
    _persistHistory();
  },
};
