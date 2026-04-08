// Simple shared state between tabs — no route params needed
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

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
export type ExerciseHistoryEntry = { date: number; weight: number; repsWeight?: number; bestMultiRepWeight?: number; bestSetVolume: number; bestSetWeight?: number; bestSetReps?: number; bestIsometricWeight?: number; bestIsometricHold?: number; programColor?: string; programId?: string; programName?: string };
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
  programId?: string;
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
const DRAFT_KEY = '@workout_draft_v1';

let _draftTimer: ReturnType<typeof setTimeout> | null = null;
let _lastDraftActiveDay: number | null = null;
let _lastDraftCache: Record<string, unknown> | null = null;

// Strip undefined values so Firestore doesn't reject the write
function _stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_, v) => v === undefined ? null : v));
}

// Firestore sync
let _currentUserId: string | null = null;
let _fsTimer: ReturnType<typeof setTimeout> | null = null;
function _syncToFirestore() {
  if (!_currentUserId) return;
  if (_fsTimer) clearTimeout(_fsTimer);
  _fsTimer = setTimeout(async () => {
    if (!_currentUserId) return;
    try {
      await setDoc(doc(db, 'users', _currentUserId, 'data', 'workout'), {
        journal: _stripUndefined(_journalLog),
        prev: _stripUndefined(_prevData),
        updatedAt: serverTimestamp(),
      });
    } catch {}
  }, 2000);
}
// Immediate sync — used for high-importance writes like completing a workout
function _syncToFirestoreNow() {
  if (!_currentUserId) return;
  if (_fsTimer) { clearTimeout(_fsTimer); _fsTimer = null; }
  setDoc(doc(db, 'users', _currentUserId, 'data', 'workout'), {
    journal: _stripUndefined(_journalLog),
    prev: _stripUndefined(_prevData),
    updatedAt: serverTimestamp(),
  }).catch(() => {});
}

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

// Persist all prev data to AsyncStorage and Firestore
function _persistPrev() {
  AsyncStorage.setItem(PREV_KEY, JSON.stringify(_prevData)).catch(() => {});
  _syncToFirestore();
}

// Persist journal to AsyncStorage and Firestore
function _persistJournal(immediate = false) {
  AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(_journalLog)).catch(() => {});
  if (immediate) _syncToFirestoreNow(); else _syncToFirestore();
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
        // Restore finished flag if today was already logged
        const todayStr = _getTodayStr();
        const loggedToday = _journalLog.some(e => {
          const d = new Date(e.date);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
        });
        if (loggedToday) {
          _workoutFinished = true;
          _listeners.forEach(fn => fn(true));
        }
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
    if (Object.prototype.hasOwnProperty.call(_prevDataBackup, dayLabel)) {
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
        const maxRepsWeight = ex.mode !== 'hold' ? maxWeight : 0;
        let bestSetVol = 0, bestSetWeight = 0, bestSetReps = 0, bestMultiRepWeight = 0;
        let bestIsoVol = 0, bestIsoWeight = 0, bestIsoHold = 0;
        for (const s of validSets) {
          if (ex.mode === 'hold') {
            const vol = (s.hold ?? 0) * (s.weight ?? 0);
            if (vol > bestIsoVol) { bestIsoVol = vol; bestIsoWeight = s.weight ?? 0; bestIsoHold = s.hold ?? 0; }
          } else {
            const vol = (s.reps ?? 0) * (s.weight ?? 0);
            if (vol > bestSetVol) { bestSetVol = vol; bestSetWeight = s.weight ?? 0; bestSetReps = s.reps ?? 0; }
            if ((s.reps ?? 0) >= 2 && (s.weight ?? 0) > bestMultiRepWeight) bestMultiRepWeight = s.weight ?? 0;
          }
        }
        const day = new Date(entry.date).toDateString();
        const existing = byDay.get(day);
        if (!existing) {
          byDay.set(day, { date: entry.date, weight: maxWeight, repsWeight: maxRepsWeight || undefined, bestMultiRepWeight: bestMultiRepWeight || undefined, bestSetVolume: bestSetVol, bestSetWeight: bestSetWeight || undefined, bestSetReps: bestSetReps || undefined, bestIsometricWeight: bestIsoWeight || undefined, bestIsometricHold: bestIsoHold || undefined, programColor: entry.programColor, programId: entry.programId, programName: entry.programName });
        } else {
          const useNew = maxWeight > existing.weight;
          const useBestVol = bestSetVol > existing.bestSetVolume;
          const existingIsoVol = (existing.bestIsometricWeight ?? 0) * (existing.bestIsometricHold ?? 0);
          const useBestIso = bestIsoVol > existingIsoVol;
          byDay.set(day, {
            date: entry.date,
            weight: Math.max(existing.weight, maxWeight),
            repsWeight: Math.max(existing.repsWeight ?? 0, maxRepsWeight) || undefined,
            bestMultiRepWeight: Math.max(existing.bestMultiRepWeight ?? 0, bestMultiRepWeight) || undefined,
            bestSetVolume: Math.max(existing.bestSetVolume, bestSetVol),
            bestSetWeight: useBestVol ? (bestSetWeight || undefined) : existing.bestSetWeight,
            bestSetReps: useBestVol ? (bestSetReps || undefined) : existing.bestSetReps,
            bestIsometricWeight: useBestIso ? (bestIsoWeight || undefined) : existing.bestIsometricWeight,
            bestIsometricHold: useBestIso ? (bestIsoHold || undefined) : existing.bestIsometricHold,
            programColor: useNew ? entry.programColor : existing.programColor,
            programId: useNew ? entry.programId : existing.programId,
            programName: useNew ? entry.programName : existing.programName,
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
        const maxRepsWeight = ex.mode !== 'hold' ? maxWeight : 0;
        let bestSetVolume = 0, bestSetWeight = 0, bestSetReps = 0, bestMultiRepWeight = 0;
        let bestIsoVolume = 0, bestIsoWeight = 0, bestIsoHold = 0;
        for (const s of ex.sets) {
          if (ex.mode === 'hold') {
            const vol = (s.hold ?? 0) * s.weight;
            if (vol > bestIsoVolume) { bestIsoVolume = vol; bestIsoWeight = s.weight; bestIsoHold = s.hold ?? 0; }
          } else {
            const vol = s.reps * s.weight;
            if (vol > bestSetVolume) { bestSetVolume = vol; bestSetWeight = s.weight; bestSetReps = s.reps; }
            if (s.reps >= 2 && s.weight > bestMultiRepWeight) bestMultiRepWeight = s.weight;
          }
        }
        if (!_exerciseHistory[ex.name]) _exerciseHistory[ex.name] = [];
        _exerciseHistory[ex.name].push({ date: entry.date, weight: maxWeight, repsWeight: maxRepsWeight || undefined, bestMultiRepWeight: bestMultiRepWeight || undefined, bestSetVolume, bestSetWeight: bestSetWeight || undefined, bestSetReps: bestSetReps || undefined, bestIsometricWeight: bestIsoWeight || undefined, bestIsometricHold: bestIsoHold || undefined });
      }
    }
    _persistHistory();
    _persistPrev();
    _notifyPrevChanged();
    _persistJournal(true); // immediate Firestore sync — don't risk losing it if app closes
  },
  updateJournalEntry(entry: WorkoutJournalEntry) {
    // Recalculate totalVolume from actual set data
    const totalVolume = entry.sessions.reduce((sum, session) =>
      sum + session.exercises.reduce((eSum, ex) =>
        eSum + ex.sets.reduce((sSum, set) => {
          if (ex.mode === 'hold') return sSum;
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
        const maxRepsWeight = ex.mode !== 'hold' ? maxWeight : 0;
        let bestSetVolume = 0, bestSetWeight = 0, bestSetReps = 0, bestMultiRepWeight = 0;
        let bestIsoVolume = 0, bestIsoWeight = 0, bestIsoHold = 0;
        for (const s of ex.sets) {
          if (ex.mode === 'hold') {
            const vol = (s.hold ?? 0) * s.weight;
            if (vol > bestIsoVolume) { bestIsoVolume = vol; bestIsoWeight = s.weight; bestIsoHold = s.hold ?? 0; }
          } else {
            const vol = s.reps * s.weight;
            if (vol > bestSetVolume) { bestSetVolume = vol; bestSetWeight = s.weight; bestSetReps = s.reps; }
            if (s.reps >= 2 && s.weight > bestMultiRepWeight) bestMultiRepWeight = s.weight;
          }
        }
        if (!_exerciseHistory[ex.name]) _exerciseHistory[ex.name] = [];
        _exerciseHistory[ex.name] = _exerciseHistory[ex.name].filter(
          e => new Date(e.date).toDateString() !== entryDateStr
        );
        if (maxWeight > 0) _exerciseHistory[ex.name].push({ date: entry.date, weight: maxWeight, repsWeight: maxRepsWeight || undefined, bestMultiRepWeight: bestMultiRepWeight || undefined, bestSetVolume, bestSetWeight: bestSetWeight || undefined, bestSetReps: bestSetReps || undefined, bestIsometricWeight: bestIsoWeight || undefined, bestIsometricHold: bestIsoHold || undefined });
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

  // Set today to a specific split day index (0-based)
  async setCycleOffset(programId: string, offset: number): Promise<void> {
    const key = `@cycle_${programId}`;
    try {
      await AsyncStorage.setItem(key, JSON.stringify({ offset, date: _getTodayStr() }));
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

  // Set current user — pass null on logout to clear all in-memory state
  setUser(uid: string | null) {
    _currentUserId = uid;
    if (!uid) {
      if (_fsTimer) { clearTimeout(_fsTimer); _fsTimer = null; }
      _journalLog.length = 0;
      for (const k of Object.keys(_prevData)) delete _prevData[k];
      for (const k of Object.keys(_exerciseHistory)) delete _exerciseHistory[k];
      _workoutFinished = false;
      _listeners.forEach(fn => fn(false));
      if (_draftTimer) { clearTimeout(_draftTimer); _draftTimer = null; }
      AsyncStorage.multiRemove([JOURNAL_KEY, HISTORY_KEY, PREV_KEY, DRAFT_KEY]).catch(() => {});
      _notifyPrevChanged();
    }
  },

  // Load workout data for a logged-in user from Firestore (overrides local cache)
  async loadForUser(uid: string): Promise<void> {
    _currentUserId = uid;
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'data', 'workout'));
      if (snap.exists()) {
        const data = snap.data();
        const fsJournal: WorkoutJournalEntry[] = data.journal ?? [];
        const fsPrev: Record<string, PrevEntry> = data.prev ?? {};

        // Merge: local AsyncStorage may have entries that failed to sync to Firestore
        // (e.g. due to a write error). Recover them so no workout data is lost.
        const localRaw = await AsyncStorage.getItem(JOURNAL_KEY).catch(() => null);
        const localJournal: WorkoutJournalEntry[] = localRaw
          ? (JSON.parse(localRaw) as WorkoutJournalEntry[]).map(e => ({ ...e, date: Number(e.date) }))
          : [];
        const fsDateSet = new Set(fsJournal.map(e => e.date));
        const localOnly = localJournal.filter(e => !fsDateSet.has(e.date));
        const mergedJournal = localOnly.length > 0
          ? [...fsJournal, ...localOnly].sort((a, b) => a.date - b.date)
          : fsJournal;

        _journalLog.length = 0;
        _journalLog.push(...mergedJournal);
        for (const k of Object.keys(_prevData)) delete _prevData[k];
        for (const [k, v] of Object.entries(fsPrev)) _prevData[k] = v;
        // Rebuild finished flag
        const todayStr = _getTodayStr();
        const loggedToday = _journalLog.some(e => {
          const d = new Date(e.date);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
        });
        _workoutFinished = loggedToday;
        _listeners.forEach(fn => fn(loggedToday));
        _notifyPrevChanged();
        // Keep AsyncStorage in sync and re-upload if local had unsynced entries
        AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(_journalLog)).catch(() => {});
        AsyncStorage.setItem(PREV_KEY, JSON.stringify(_prevData)).catch(() => {});
        if (localOnly.length > 0) _syncToFirestoreNow();
      } else {
        // Firestore has no workout document yet.
        // This happens when the Firestore sync didn't complete before the app closed
        // (the 2-second debounce was still pending). Local AsyncStorage data is the
        // source of truth — do NOT wipe it. Upload it so Firestore catches up.
        if (_journalLog.length > 0 || Object.keys(_prevData).length > 0) {
          _syncToFirestoreNow();
        }
        // Rebuild finished flag from local journal (already set by initStorage, but re-derive to be safe)
        const todayStr = _getTodayStr();
        const loggedToday = _journalLog.some(e => {
          const d = new Date(e.date);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
        });
        _workoutFinished = loggedToday;
        _listeners.forEach(fn => fn(loggedToday));
        _notifyPrevChanged();
      }
    } catch {}
  },

  // In-progress workout draft — persists exerciseCache to AsyncStorage so a mid-workout
  // phone death doesn't wipe the user's reps/weights. Debounced to avoid thrashing storage.
  saveDraft(activeDay: number, cache: Record<string, unknown>): void {
    _lastDraftActiveDay = activeDay;
    _lastDraftCache = cache;
    if (_draftTimer) clearTimeout(_draftTimer);
    _draftTimer = setTimeout(() => {
      _draftTimer = null;
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ date: _getTodayStr(), savedAt: Date.now(), activeDay, cache })).catch(() => {});
    }, 1500);
  },
  // Write the pending draft immediately — call this when the app backgrounds so data
  // isn't lost if the OS kills the process during the normal 1.5 s debounce window.
  flushDraft(): void {
    if (_lastDraftActiveDay === null || _lastDraftCache === null) return;
    if (_draftTimer) { clearTimeout(_draftTimer); _draftTimer = null; }
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ date: _getTodayStr(), savedAt: Date.now(), activeDay: _lastDraftActiveDay, cache: _lastDraftCache })).catch(() => {});
  },
  async loadDraft(): Promise<{ date: string; savedAt?: number; activeDay: number; cache: Record<string, unknown> } | null> {
    try {
      const raw = await AsyncStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  clearDraft(): void {
    if (_draftTimer) { clearTimeout(_draftTimer); _draftTimer = null; }
    _lastDraftActiveDay = null;
    _lastDraftCache = null;
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
  },
};
