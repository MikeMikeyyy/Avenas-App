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
type PrevSetData = { reps: number; weight: number; hold?: number };
type PrevExerciseData = { name: string; sets: PrevSetData[]; mode?: 'reps' | 'hold' };
const _prevData: Record<string, PrevExerciseData[]> = {};
// One level of backup so a reset can restore the prev stats from before the now-reset workout
const _prevDataBackup: Record<string, PrevExerciseData[] | undefined> = {};

// Exercise weight history — accumulates over time for the progress chart
// Key = exercise name, value = array of { date (timestamp), weight (max across sets) }
export type ExerciseHistoryEntry = { date: number; weight: number };
const _exerciseHistory: Record<string, ExerciseHistoryEntry[]> = {};

// Workout log — one entry per completed workout for volume/stats tracking
export type WorkoutLogEntry = { date: number; volume: number; durationSecs: number };
const _workoutLog: WorkoutLogEntry[] = [];

// Workout journal — full detail log for the journal screen
export type LoggedSet = { reps: number; weight: number | null; hold: number; isWarmup: boolean };
export type LoggedExercise = { name: string; mode: 'reps' | 'hold'; sets: LoggedSet[] };
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

  savePrev(dayLabel: string, exercises: PrevExerciseData[]) {
    _prevDataBackup[dayLabel] = _prevData[dayLabel]; // keep previous value so reset can restore it
    _prevData[dayLabel] = exercises;
  },
  restorePrev(dayLabel: string) {
    if (_prevDataBackup[dayLabel] !== undefined) {
      _prevData[dayLabel] = _prevDataBackup[dayLabel]!;
    } else {
      delete _prevData[dayLabel];
    }
    delete _prevDataBackup[dayLabel];
  },
  getPrev(dayLabel: string): PrevExerciseData[] | undefined {
    return _prevData[dayLabel];
  },

  // Exercise history — records max weight per exercise each time a workout is saved
  saveHistory(exercises: PrevExerciseData[]) {
    const now = Date.now();
    for (const ex of exercises) {
      const maxWeight = Math.max(...ex.sets.map(s => s.weight), 0);
      if (maxWeight <= 0) continue;
      if (!_exerciseHistory[ex.name]) _exerciseHistory[ex.name] = [];
      _exerciseHistory[ex.name].push({ date: now, weight: maxWeight });
    }
  },
  getHistory(exerciseName: string): ExerciseHistoryEntry[] {
    return _exerciseHistory[exerciseName] || [];
  },

  // Workout log — records each completed workout with volume & duration
  logWorkout(volume: number, durationSecs: number) {
    _workoutLog.push({ date: Date.now(), volume, durationSecs });
  },
  getWorkoutLog(): WorkoutLogEntry[] {
    return _workoutLog;
  },

  // Journal — full detail log per completed workout
  logJournalEntry(entry: WorkoutJournalEntry) {
    _journalLog.push(entry);
  },
  updateJournalEntry(entry: WorkoutJournalEntry) {
    const idx = _journalLog.findIndex(e => e.id === entry.id);
    if (idx >= 0) _journalLog[idx] = entry;
  },
  getJournalLog(): WorkoutJournalEntry[] {
    return [..._journalLog].reverse();
  },
  getJournalEntry(id: string): WorkoutJournalEntry | undefined {
    return _journalLog.find(e => e.id === id);
  },
  deleteJournalEntry(id: string) {
    const idx = _journalLog.findIndex(e => e.id === id);
    if (idx >= 0) _journalLog.splice(idx, 1);
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
  },
};
