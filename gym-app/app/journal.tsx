import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  Animated,
  Dimensions,
  Alert,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { workoutState, WorkoutJournalEntry, LoggedSession } from '../workoutState';
import { useTheme } from '../themeStore';
import { useUnits } from '../unitsStore';
import { useProgramStore, getDayLabel, getDayExerciseCount } from '../programStore';
import type { Program } from '../programStore';
import { BottomSheetModal } from '../components/BottomSheetModal';
import { ExerciseInfoModal } from '../components/ExerciseInfoModal';
import exerciseDbRaw from '../assets/data/exercises.json';

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const exerciseImageMap: Record<string, string> = {};
(exerciseDbRaw as { name: string; image: string }[]).forEach(e => {
  if (e.name && e.image) exerciseImageMap[e.name] = e.image;
});
function getExerciseImageUrl(name: string): string | null {
  const path = exerciseImageMap[name];
  if (!path) return null;
  return IMAGE_BASE + path.split('/').map(encodeURIComponent).join('/');
}

function BounceButton({ style, children, onPress, ...rest }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start()}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.(); }}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-AU', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function countExercises(entry: WorkoutJournalEntry): number {
  return entry.sessions.reduce((sum, s) => sum + s.exercises.length, 0);
}


// ─── Calendar helpers ────────────────────────────────────────────────────────

function toDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type MonthData = {
  key: string; label: string; year: number; month: number; weeks: (number | null)[][];
};

function buildMonths(entries: WorkoutJournalEntry[]): MonthData[] {
  const today = new Date();
  const sy = 2026, sm = 0; // January 2026 is the earliest month shown
  const months: MonthData[] = [];
  // Start one month ahead so the next month is always visible at the bottom
  let y = today.getFullYear(), m = today.getMonth() + 1;
  if (m > 11) { m = 0; y++; }
  while (y > sy || (y === sy && m >= sm)) {
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
    months.push({ key: `${y}-${m}`, label: new Date(y, m, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }), year: y, month: m, weeks });
    m--; if (m < 0) { m = 11; y--; }
  }
  // Reverse so oldest month is at the top, latest (+ one ahead) at the bottom
  return months.reverse();
}

const CELL_SIZE = Math.floor((Dimensions.get('window').width - 72) / 7);
const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ─── Detail View ────────────────────────────────────────────────────────────

function JournalDetail({
  entry,
  colors,
  isDark,
  onUpdateEntry,
}: {
  entry: WorkoutJournalEntry;
  colors: any;
  isDark: boolean;
  onUpdateEntry: (updated: WorkoutJournalEntry) => void;
}) {
  const { programs } = useProgramStore();
  const { unit, toDisplay, toKg } = useUnits();
  // Always reflect the current program color, even if it was changed after logging
  const entryColor = programs.find(p => p.id === entry.programId)?.color ?? programs.find(p => p.name === entry.programName)?.color ?? entry.programColor;
  const fmtW = (kg: number) => { const v = toDisplay(kg); if (unit === 'lbs') return String(Math.round(v)); const r = Math.round(v * 10) / 10; return `${r % 1 === 0 ? Math.round(r) : r.toFixed(1)}`; };
  const totalExercises = countExercises(entry);
  const showSessionLabel = entry.sessions.length > 1;

  const [editTarget, setEditTarget] = useState<{ si: number; ei: number; setI: number; mode: 'reps' | 'hold' } | null>(null);
  const [editVal1, setEditVal1] = useState(''); // weight
  const [editVal2, setEditVal2] = useState(''); // reps or hold secs
  const weightRefs = useRef<Record<string, TextInput | null>>({});
  const repsRefs = useRef<Record<string, TextInput | null>>({});
  const notesRefs = useRef<Record<string, TextInput | null>>({});

  const [editingNotesKey, setEditingNotesKey] = useState<string | null>(null);
  const [notesVal, setNotesVal] = useState('');

  const [exerciseMenuKey, setExerciseMenuKey] = useState<string | null>(null);
  const [infoExerciseName, setInfoExerciseName] = useState<string | null>(null);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);
  const [changeExerciseTarget, setChangeExerciseTarget] = useState<{ si: number; ei: number } | null>(null);
  const [newExerciseName, setNewExerciseName] = useState('');

  const [showDurationEdit, setShowDurationEdit] = useState(false);
  const [durationH, setDurationH] = useState('');
  const [durationM, setDurationM] = useState('');

  const openDurationEdit = () => {
    const h = Math.floor(entry.durationSecs / 3600);
    const m = Math.floor((entry.durationSecs % 3600) / 60);
    setDurationH(h > 0 ? String(h) : '');
    setDurationM(m > 0 ? String(m) : '');
    setShowDurationEdit(true);
  };

  const commitDuration = () => {
    const h = parseInt(durationH) || 0;
    const m = parseInt(durationM) || 0;
    const secs = h * 3600 + m * 60;
    if (secs <= 0) {
      Alert.alert('Invalid Duration', 'Please enter at least 1 minute.');
      return;
    }
    onUpdateEntry({ ...entry, durationSecs: secs });
    setShowDurationEdit(false);
  };

  const startEdit = (si: number, ei: number, setI: number, set: any, mode: 'reps' | 'hold', focusField: 'weight' | 'reps' = 'weight') => {
    setEditTarget({ si, ei, setI, mode });
    setEditVal1(set.weight != null ? fmtW(set.weight) : '');
    setEditVal2(mode === 'hold' ? (set.hold > 0 ? String(set.hold) : '') : (set.reps > 0 ? String(set.reps) : ''));
    const key = `${si}-${ei}-${setI}`;
    setTimeout(() => (focusField === 'reps' ? repsRefs.current[key] : weightRefs.current[key])?.focus(), 50);
  };

  const commitNotes = (si: number, ei: number) => {
    const newEntry: WorkoutJournalEntry = JSON.parse(JSON.stringify(entry));
    const trimmed = notesVal.trim();
    newEntry.sessions[si].exercises[ei].notes = trimmed || undefined;
    onUpdateEntry(newEntry);
    setEditingNotesKey(null);
  };

  const toggleMode = (si: number, ei: number) => {
    const newEntry: WorkoutJournalEntry = JSON.parse(JSON.stringify(entry));
    const ex = newEntry.sessions[si].exercises[ei];
    ex.mode = ex.mode === 'hold' ? 'reps' : 'hold';
    ex.sets = ex.sets.map(s => ({ ...s, reps: 0, hold: 0 }));
    onUpdateEntry(newEntry);
  };

  const moveExercise = (si: number, ei: number, dir: 'up' | 'down') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newEntry: WorkoutJournalEntry = JSON.parse(JSON.stringify(entry));
    const exs = newEntry.sessions[si].exercises;
    const swap = dir === 'up' ? ei - 1 : ei + 1;
    [exs[ei], exs[swap]] = [exs[swap], exs[ei]];
    onUpdateEntry(newEntry);
    setExerciseMenuKey(`${si}-${swap}`);
  };

  const removeExercise = (si: number, ei: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newEntry: WorkoutJournalEntry = JSON.parse(JSON.stringify(entry));
    newEntry.sessions[si].exercises.splice(ei, 1);
    onUpdateEntry(newEntry);
    setExerciseMenuKey(null);
    setConfirmRemoveKey(null);
  };

  const toggleSetWarmup = (si: number, ei: number, setI: number) => {
    const newEntry: WorkoutJournalEntry = JSON.parse(JSON.stringify(entry));
    const s = newEntry.sessions[si].exercises[ei].sets[setI];
    s.isWarmup = !s.isWarmup;
    onUpdateEntry(newEntry);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const addSet = (si: number, ei: number) => {
    const newEntry: WorkoutJournalEntry = JSON.parse(JSON.stringify(entry));
    const ex = newEntry.sessions[si].exercises[ei];
    const lastSet = ex.sets[ex.sets.length - 1];
    ex.sets.push({ reps: 0, weight: lastSet?.weight ?? null, hold: 0, isWarmup: false });
    onUpdateEntry(newEntry);
  };

  const removeLastSet = (si: number, ei: number) => {
    const newEntry: WorkoutJournalEntry = JSON.parse(JSON.stringify(entry));
    const ex = newEntry.sessions[si].exercises[ei];
    if (ex.sets.length <= 1) return;
    ex.sets.pop();
    if (editTarget && editTarget.si === si && editTarget.ei === ei && editTarget.setI >= ex.sets.length) {
      setEditTarget(null);
    }
    onUpdateEntry(newEntry);
  };

  const commitChangeExercise = () => {
    if (!changeExerciseTarget || !newExerciseName.trim()) return;
    const { si, ei } = changeExerciseTarget;
    const newEntry: WorkoutJournalEntry = JSON.parse(JSON.stringify(entry));
    newEntry.sessions[si].exercises[ei].name = newExerciseName.trim();
    onUpdateEntry(newEntry);
    setChangeExerciseTarget(null);
    setNewExerciseName('');
  };

  const commitEdit = () => {
    if (!editTarget) return;
    const { si, ei, setI, mode } = editTarget;
    const newEntry: WorkoutJournalEntry = JSON.parse(JSON.stringify(entry));
    const s = newEntry.sessions[si].exercises[ei].sets[setI];
    const w = editVal1 === '' ? null : parseFloat(editVal1);
    s.weight = (w === null || isNaN(w)) ? null : toKg(w);
    if (mode === 'hold') {
      s.hold = parseFloat(editVal2) || 0;
    } else {
      s.reps = parseInt(editVal2) || 0;
    }
    onUpdateEntry(newEntry);
    setEditTarget(null);
    Keyboard.dismiss();
  };

  const advanceToSet = (nextSi: number, nextEi: number, nextSetI: number, nextSet: any, nextMode: 'reps' | 'hold') => {
    if (!editTarget) return;
    const { si, ei, setI, mode } = editTarget;
    // Save current set data
    const newEntry: WorkoutJournalEntry = JSON.parse(JSON.stringify(entry));
    const s = newEntry.sessions[si].exercises[ei].sets[setI];
    const w = editVal1 === '' ? null : parseFloat(editVal1);
    s.weight = (w === null || isNaN(w)) ? null : toKg(w);
    if (mode === 'hold') {
      s.hold = parseFloat(editVal2) || 0;
    } else {
      s.reps = parseInt(editVal2) || 0;
    }
    onUpdateEntry(newEntry);
    // Update state first (makes next set's inputs editable=true)
    setEditTarget({ si: nextSi, ei: nextEi, setI: nextSetI, mode: nextMode });
    setEditVal1(nextSet.weight != null ? fmtW(nextSet.weight) : '');
    setEditVal2(nextMode === 'hold' ? (nextSet.hold > 0 ? String(nextSet.hold) : '') : (nextSet.reps > 0 ? String(nextSet.reps) : ''));
    // Focus AFTER state update so the input is editable when focused
    setTimeout(() => weightRefs.current[`${nextSi}-${nextEi}-${nextSetI}`]?.focus(), 50);
  };

  return (
    <ScrollView contentContainerStyle={styles.detailScrollContent} showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets={true} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.detailHeader}>
        <Text style={[styles.detailTitle, { color: colors.primaryText }]} numberOfLines={1}>
          {entry.dayLabel}
        </Text>
        <Text style={[styles.detailSubtitle, { color: colors.secondaryText }]}>
          {entry.programName}  ·  {formatDate(entry.date)}
        </Text>
      </View>

      {/* Stats row */}
      <View style={styles.statRow}>
        <TouchableOpacity
          style={[styles.statPill, { backgroundColor: `${entryColor}20`, borderColor: entryColor }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDurationEdit(); }}
          activeOpacity={0.7}
        >
          <Ionicons name="time-outline" size={14} color={isDark ? entryColor : colors.primaryText} />
          <Text style={[styles.statPillText, { color: isDark ? entryColor : colors.primaryText }]}>
            {entry.durationSecs > 0 ? formatDuration(entry.durationSecs) : 'Add time'}
          </Text>
          <Ionicons name="pencil-outline" size={11} color={isDark ? entryColor : colors.primaryText} style={{ opacity: 0.6 }} />
        </TouchableOpacity>
        {(() => {
          const repsVol = entry.sessions.reduce((sum, s) =>
            sum + s.exercises.reduce((eSum, ex) =>
              ex.mode === 'hold' ? eSum :
              eSum + ex.sets.reduce((sSum, set) => sSum + (set.reps * (set.weight ?? 0)), 0), 0), 0);
          if (repsVol <= 0) return null;
          return (
            <View style={[styles.statPill, { backgroundColor: `${entryColor}20`, borderColor: entryColor }]}>
              <Ionicons name="barbell-outline" size={14} color={isDark ? entryColor : colors.primaryText} />
              <Text style={[styles.statPillText, { color: isDark ? entryColor : colors.primaryText }]}>
                {Math.round(toDisplay(repsVol)).toLocaleString()} {unit}
              </Text>
            </View>
          );
        })()}
        <View style={[styles.statPill, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statPillText, { color: colors.secondaryText }]}>
            {totalExercises} exercise{totalExercises !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Sessions */}
      {entry.sessions.map((session, si) => (
        <View key={si} style={styles.sessionBlock}>
          {showSessionLabel && (
            <Text style={[styles.sessionLabel, { color: colors.secondaryText }]}>
              {session.label.toUpperCase()}
            </Text>
          )}
          {session.exercises.map((exercise, ei) => {
            const workingSets = exercise.sets.filter(s => !s.isWarmup);
            const warmupSets = exercise.sets.filter(s => s.isWarmup);
            return (
              <View
                key={ei}
                style={[styles.exerciseCard, { backgroundColor: colors.cardTranslucent, borderColor: isDark ? colors.cardBorder : 'rgba(0,0,0,0.1)' }]}
              >
                {/* Exercise header */}
                {(() => {
                  const menuKey = `${si}-${ei}`;
                  const isMenuOpen = exerciseMenuKey === menuKey;
                  const imageUrl = getExerciseImageUrl(exercise.name);
                  return (
                    <View style={styles.exerciseHeader}>
                      <TouchableOpacity
                        style={styles.exerciseNameRow}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setInfoExerciseName(exercise.name); }}
                        activeOpacity={0.7}
                      >
                        {imageUrl && (
                          <Image
                            source={{ uri: imageUrl }}
                            style={styles.exerciseThumb}
                            resizeMode="cover"
                          />
                        )}
                        <Text style={[styles.exerciseName, { color: colors.primaryText }]} numberOfLines={1}>{exercise.name}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setExerciseMenuKey(prev => prev === menuKey ? null : menuKey);
                          setConfirmRemoveKey(null);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ paddingRight: 14 }}
                      >
                        <Ionicons name={isMenuOpen ? 'checkmark-circle' : 'ellipsis-horizontal'} size={isMenuOpen ? 24 : 22} color={isMenuOpen ? entryColor : colors.secondaryText} />
                      </TouchableOpacity>
                    </View>
                  );
                })()}
                {/* Set rows */}
                {exercise.sets.map((set, si2) => {
                  const isWarmup = set.isWarmup;
                  const workingIdx = exercise.sets.slice(0, si2).filter(s => !s.isWarmup).length + 1;
                  const hasData = exercise.mode === 'hold'
                    ? (set.hold > 0 || set.weight != null)
                    : set.reps > 0;
                  const rowDividerColor = isDark ? colors.border : 'rgba(0,0,0,0.09)';
                  const isEditing = editTarget !== null && editTarget.si === si && editTarget.ei === ei && editTarget.setI === si2;
                  const isLastSet = si2 === exercise.sets.length - 1;
                  const refKey = `${si}-${ei}-${si2}`;
                  return (
                    <TouchableOpacity
                      key={si2}
                      style={[styles.setRow, si2 < exercise.sets.length - 1 && { borderBottomWidth: 1, borderBottomColor: rowDividerColor }]}
                      onPress={() => {
                        if (isEditing) return;
                        if (editTarget) commitEdit();
                        startEdit(si, ei, si2, set, exercise.mode ?? 'reps');
                      }}
                      activeOpacity={isEditing ? 1 : 0.55}
                    >
                      {/* Set label — tap to toggle warmup/working */}
                      <TouchableOpacity
                        onPress={() => toggleSetWarmup(si, ei, si2)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={[styles.setLabelBox, { borderColor: isWarmup ? '#F5A623' : (isDark ? colors.border : 'rgba(0,0,0,0.25)') }]}
                      >
                        <Text style={[styles.setLabelText, { color: isWarmup ? '#F5A623' : colors.primaryText }]}>
                          {isWarmup ? 'W' : workingIdx}
                        </Text>
                      </TouchableOpacity>
                      {/* Always-mounted inputs — collapsed to 0×0 when not editing so keyboard never dismisses on focus transfer */}
                      <View
                        pointerEvents={isEditing ? 'auto' : 'none'}
                        style={[
                          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
                          isEditing ? { flex: 1 } : { width: 0, height: 0, overflow: 'hidden', opacity: 0 },
                        ]}
                      >
                        <TextInput
                          ref={r => { weightRefs.current[refKey] = r; }}
                          style={[styles.editInput, { color: colors.primaryText, borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', backgroundColor: colors.inputBg }]}
                          value={isEditing ? editVal1 : ''}
                          onChangeText={isEditing ? setEditVal1 : () => {}}
                          editable={isEditing}
                          keyboardType="decimal-pad"
                          returnKeyType="next"
                          blurOnSubmit={false}
                          onSubmitEditing={() => {
                            if (isEditing) setTimeout(() => repsRefs.current[refKey]?.focus(), 50);
                          }}
                          placeholder="0"
                          placeholderTextColor={colors.tertiaryText}
                          selectTextOnFocus
                        />
                        <Text style={{ color: colors.tertiaryText, fontSize: 12, fontFamily: 'Arimo_400Regular' }}>{unit}</Text>
                        <TextInput
                          ref={r => { repsRefs.current[refKey] = r; }}
                          style={[styles.editInput, { color: colors.primaryText, borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', backgroundColor: colors.inputBg }]}
                          value={isEditing ? editVal2 : ''}
                          onChangeText={isEditing ? setEditVal2 : () => {}}
                          editable={isEditing}
                          keyboardType="decimal-pad"
                          returnKeyType={isLastSet ? 'done' : 'next'}
                          blurOnSubmit={isLastSet}
                          onSubmitEditing={() => {
                            if (!isEditing) return;
                            if (!isLastSet) {
                              advanceToSet(si, ei, si2 + 1, exercise.sets[si2 + 1], exercise.mode ?? 'reps');
                            } else {
                              commitEdit();
                            }
                          }}
                          placeholder="0"
                          placeholderTextColor={colors.tertiaryText}
                          selectTextOnFocus
                        />
                        <Text style={{ color: colors.tertiaryText, fontSize: 12, fontFamily: 'Arimo_400Regular' }}>
                          {exercise.mode === 'hold' ? 's' : 'reps'}
                        </Text>
                      </View>
                      {/* Checkmark — only when editing */}
                      {isEditing && (
                        <TouchableOpacity
                          onPress={commitEdit}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={styles.rowIconSlot}
                        >
                          <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="ellipse" size={22} color={entryColor} style={{ position: 'absolute' }} />
                            <Ionicons name="checkmark" size={13} color={isDark ? '#fff' : '#111'} />
                          </View>
                        </TouchableOpacity>
                      )}
                      {/* Display — two fixed columns so all rows align like a table */}
                      {!isEditing && (
                        <>
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
                            {/* Weight column — right-aligned, fixed width */}
                            <TouchableOpacity
                              onPress={() => { if (editTarget) commitEdit(); startEdit(si, ei, si2, set, exercise.mode ?? 'reps', 'weight'); }}
                              activeOpacity={0.5}
                              style={{ width: 80, alignItems: 'flex-end' }}
                            >
                              <Text style={[styles.setValue, { color: set.weight != null ? colors.primaryText : colors.tertiaryText }]}>
                                {set.weight != null ? `${fmtW(set.weight)} ${unit}` : '—'}
                              </Text>
                            </TouchableOpacity>
                            {/* Separator */}
                            <Text style={[styles.setValue, { color: colors.tertiaryText, marginHorizontal: 10 }]}>×</Text>
                            {/* Reps / hold column — left-aligned, flex */}
                            <TouchableOpacity
                              onPress={() => { if (editTarget) commitEdit(); startEdit(si, ei, si2, set, exercise.mode ?? 'reps', 'reps'); }}
                              activeOpacity={0.5}
                              style={{ flex: 1 }}
                            >
                              {exercise.mode === 'hold' ? (
                                <Text style={[styles.setValue, { color: set.hold > 0 ? colors.primaryText : colors.tertiaryText }]}>
                                  {set.hold > 0 ? `${set.hold}s` : '—'}
                                </Text>
                              ) : (
                                <Text style={[styles.setValue, { color: set.reps > 0 ? colors.primaryText : colors.tertiaryText }]}>
                                  {set.reps > 0 ? `${set.reps} reps` : '—'}
                                </Text>
                              )}
                            </TouchableOpacity>
                          </View>
                          <View style={styles.rowIconSlot}>
                            <Ionicons name="pencil-outline" size={13} color={colors.tertiaryText} style={{ opacity: 0.5 }} />
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {/* Exercise controls */}
                {exerciseMenuKey === `${si}-${ei}` && (() => {
                  const menuKey = `${si}-${ei}`;
                  const totalExs = session.exercises.length;
                  const divColor = isDark ? colors.border : 'rgba(0,0,0,0.09)';
                  return (
                    <View style={[styles.exerciseControls, { borderTopColor: divColor, borderBottomColor: divColor }]}>
                      {/* Add / Remove Set */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity style={[styles.exerciseMenuBtn, { flex: 1, backgroundColor: colors.inputBg, marginTop: 0 }]} onPress={() => addSet(si, ei)} activeOpacity={0.7}>
                          <Ionicons name="add" size={16} color={colors.primaryText} />
                          <Text style={[styles.exerciseMenuText, { color: colors.primaryText }]}>Add Set</Text>
                        </TouchableOpacity>
                        {exercise.sets.length > 1 && (
                          <TouchableOpacity style={[styles.exerciseMenuBtn, { flex: 1, backgroundColor: colors.inputBg, marginTop: 0 }]} onPress={() => removeLastSet(si, ei)} activeOpacity={0.7}>
                            <Ionicons name="remove" size={16} color={colors.primaryText} />
                            <Text style={[styles.exerciseMenuText, { color: colors.primaryText }]}>Remove Set</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      {/* Move Up / Down */}
                      {(ei > 0 || ei < totalExs - 1) && (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {ei > 0 && (
                            <TouchableOpacity style={[styles.exerciseMenuBtn, { flex: 1, backgroundColor: colors.inputBg }]} onPress={() => moveExercise(si, ei, 'up')} activeOpacity={0.7}>
                              <Ionicons name="arrow-up" size={16} color={colors.primaryText} />
                              <Text style={[styles.exerciseMenuText, { color: colors.primaryText }]}>Move Up</Text>
                            </TouchableOpacity>
                          )}
                          {ei < totalExs - 1 && (
                            <TouchableOpacity style={[styles.exerciseMenuBtn, { flex: 1, backgroundColor: colors.inputBg }]} onPress={() => moveExercise(si, ei, 'down')} activeOpacity={0.7}>
                              <Ionicons name="arrow-down" size={16} color={colors.primaryText} />
                              <Text style={[styles.exerciseMenuText, { color: colors.primaryText }]}>Move Down</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                      {/* Change Exercise */}
                      <TouchableOpacity style={[styles.exerciseMenuBtn, { backgroundColor: colors.inputBg }]} onPress={() => { setNewExerciseName(exercise.name); setChangeExerciseTarget({ si, ei }); }} activeOpacity={0.7}>
                        <Ionicons name="swap-horizontal" size={16} color={colors.primaryText} />
                        <Text style={[styles.exerciseMenuText, { color: colors.primaryText }]}>Change Exercise</Text>
                      </TouchableOpacity>
                      {/* Toggle Mode */}
                      <TouchableOpacity style={[styles.exerciseMenuBtn, { backgroundColor: colors.inputBg }]} onPress={() => toggleMode(si, ei)} activeOpacity={0.7}>
                        <Ionicons name={exercise.mode === 'hold' ? 'timer-outline' : 'barbell-outline'} size={16} color={colors.primaryText} />
                        <Text style={[styles.exerciseMenuText, { color: colors.primaryText }]}>{exercise.mode === 'hold' ? 'Isometric Hold' : 'Standard Reps'}</Text>
                        <View style={{ flex: 1 }} />
                        <Ionicons name="repeat" size={16} color={colors.secondaryText} />
                      </TouchableOpacity>
                      {/* Remove Exercise */}
                      {confirmRemoveKey !== menuKey ? (
                        <TouchableOpacity style={[styles.exerciseMenuBtn, { backgroundColor: '#FF3B3018' }]} onPress={() => setConfirmRemoveKey(menuKey)} activeOpacity={0.7}>
                          <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                          <Text style={[styles.exerciseMenuText, { color: '#FF3B30' }]}>Remove Exercise</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity style={[styles.exerciseMenuBtn, { flex: 1, backgroundColor: colors.inputBg, marginTop: 0 }]} onPress={() => setConfirmRemoveKey(null)} activeOpacity={0.7}>
                            <Text style={[styles.exerciseMenuText, { color: colors.primaryText }]}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.exerciseMenuBtn, { flex: 1, backgroundColor: '#FF3B30', marginTop: 0 }]} onPress={() => removeExercise(si, ei)} activeOpacity={0.7}>
                            <Text style={[styles.exerciseMenuText, { color: '#fff' }]}>Confirm Remove</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })()}
                {/* Notes row — always renders TextInput to prevent layout shift on focus */}
                {(() => {
                  const notesKey = `${si}-${ei}`;
                  const isEditingNotes = editingNotesKey === notesKey;
                  const divColor = isDark ? colors.border : 'rgba(0,0,0,0.09)';
                  const hasNote = !!exercise.notes;
                  const textColor = isEditingNotes
                    ? colors.primaryText
                    : hasNote ? colors.secondaryText : colors.tertiaryText;
                  return (
                    <TouchableOpacity
                      style={[styles.notesRow, { borderTopColor: divColor }]}
                      onPress={() => {
                        if (isEditingNotes) return;
                        if (editTarget) commitEdit();
                        setEditingNotesKey(notesKey);
                        setNotesVal(exercise.notes || '');
                        setTimeout(() => notesRefs.current[notesKey]?.focus(), 50);
                      }}
                      activeOpacity={isEditingNotes ? 1 : 0.6}
                    >
                      <Ionicons name="create-outline" size={13} color={textColor} />
                      <View pointerEvents={isEditingNotes ? 'auto' : 'none'} style={{ flex: 1 }}>
                        <TextInput
                          ref={r => { notesRefs.current[notesKey] = r; }}
                          style={[styles.notesInput, { color: textColor }]}
                          value={isEditingNotes ? notesVal : (exercise.notes || '')}
                          onChangeText={isEditingNotes ? setNotesVal : undefined}
                          editable={isEditingNotes}
                          placeholder="Add note"
                          placeholderTextColor={colors.tertiaryText}
                          multiline
                          onBlur={isEditingNotes ? () => commitNotes(si, ei) : undefined}
                          returnKeyType="done"
                          blurOnSubmit
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            );
          })}
        </View>
      ))}
      {/* Change Exercise modal */}
      <BottomSheetModal visible={!!changeExerciseTarget} onDismiss={() => { setChangeExerciseTarget(null); setNewExerciseName(''); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.durationSheet, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.durationSheetTitle, { color: colors.primaryText }]}>Change Exercise</Text>
            <TextInput
              style={[styles.changeExInput, { color: colors.primaryText, backgroundColor: colors.inputBg, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]}
              value={newExerciseName}
              onChangeText={setNewExerciseName}
              placeholder="Exercise name"
              placeholderTextColor={colors.tertiaryText}
              returnKeyType="done"
              onSubmitEditing={commitChangeExercise}
              autoFocus
            />
            <View style={styles.durationSheetActions}>
              <TouchableOpacity style={[styles.durationActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} onPress={() => { setChangeExerciseTarget(null); setNewExerciseName(''); }} activeOpacity={0.7}>
                <Text style={[styles.durationActionText, { color: colors.secondaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.durationActionBtn, { backgroundColor: entryColor }]} onPress={commitChangeExercise} activeOpacity={0.7}>
                <Text style={[styles.durationActionText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </BottomSheetModal>

      {/* Duration edit modal */}
      <BottomSheetModal visible={showDurationEdit} onDismiss={() => setShowDurationEdit(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.durationSheet, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.durationSheetTitle, { color: colors.primaryText }]}>Edit Duration</Text>
            <View style={styles.durationInputRow}>
              <View style={styles.durationInputGroup}>
                <TextInput
                  style={[styles.durationInput, { color: colors.primaryText, backgroundColor: colors.inputBg, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]}
                  value={durationH}
                  onChangeText={setDurationH}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.tertiaryText}
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={[styles.durationInputLabel, { color: colors.secondaryText }]}>hrs</Text>
              </View>
              <Text style={[styles.durationColon, { color: colors.tertiaryText }]}>:</Text>
              <View style={styles.durationInputGroup}>
                <TextInput
                  style={[styles.durationInput, { color: colors.primaryText, backgroundColor: colors.inputBg, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]}
                  value={durationM}
                  onChangeText={v => { const n = parseInt(v); setDurationM(isNaN(n) ? '' : String(Math.min(n, 59))); }}
                  keyboardType="number-pad"
                  placeholder="00"
                  placeholderTextColor={colors.tertiaryText}
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={[styles.durationInputLabel, { color: colors.secondaryText }]}>min</Text>
              </View>
            </View>
            <View style={styles.durationSheetActions}>
              <TouchableOpacity style={[styles.durationActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} onPress={() => setShowDurationEdit(false)}>
                <Text style={[styles.durationActionText, { color: colors.secondaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.durationActionBtn, { backgroundColor: entryColor }]} onPress={commitDuration}>
                <Text style={[styles.durationActionText, { color: '#fff' }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </BottomSheetModal>

      <ExerciseInfoModal exerciseName={infoExerciseName} onClose={() => setInfoExerciseName(null)} />
    </ScrollView>
  );
}


// ─── Calendar View ───────────────────────────────────────────────────────────

function JournalCalendar({
  entries,
  onSelect,
  onLogNew,
  colors,
  isDark,
  highlightDate,
}: {
  entries: WorkoutJournalEntry[];
  onSelect: (entry: WorkoutJournalEntry) => void;
  onLogNew: (date: Date) => void;
  colors: any;
  isDark: boolean;
  highlightDate?: string;
}) {
  const { programs } = useProgramStore();
  const { unit, toDisplay } = useUnits();
  const resolveEntryColor = (entry: WorkoutJournalEntry) =>
    programs.find(p => p.id === entry.programId)?.color ?? programs.find(p => p.name === entry.programName)?.color ?? entry.programColor;
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateKey(today.getTime()), [today]);
  const maxFutureStr = useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() + 7);
    return toDateKey(d.getTime());
  }, [today]);

  const entryByDate = useMemo(() => {
    const map = new Map<string, WorkoutJournalEntry>();
    for (const e of entries) {
      const k = toDateKey(e.date);
      if (!map.has(k)) map.set(k, e);
    }
    return map;
  }, [entries]);

  const months = useMemo(() => buildMonths(entries), [entries]);

  const [monthIdx, setMonthIdx] = useState(() => {
    if (highlightDate) {
      const d = new Date(highlightDate + 'T00:00:00');
      const idx = months.findIndex(m => m.year === d.getFullYear() && m.month === d.getMonth());
      if (idx >= 0) return idx;
    }
    const idx = months.findIndex(m => m.year === today.getFullYear() && m.month === today.getMonth());
    return idx >= 0 ? idx : Math.max(0, months.length - 2);
  });

  const { label, year, month, weeks } = months[monthIdx];
  const canGoPrev = monthIdx > 0;
  const canGoNext = monthIdx < months.length - 1;
  const isFutureMonth = year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());

  const monthEntries = useMemo(() =>
    entries
      .filter(e => { const d = new Date(e.date); return d.getFullYear() === year && d.getMonth() === month; })
      .sort((a, b) => b.date - a.date),
    [entries, year, month]);

  const displayedEntries = useMemo(() => {
    const now = today.getTime();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    return entries.filter(e => e.date >= sevenDaysAgo && e.date <= now).sort((a, b) => b.date - a.date);
  }, [entries, today]);

  const workoutCount = useMemo(() => weeks.flat().filter(day => {
    if (!day) return false;
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return entryByDate.has(ds) && ds <= todayStr;
  }).length, [weeks, year, month, entryByDate, todayStr]);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Journal</Text>
      <Text style={[styles.screenSubtitle, { color: 'rgba(255,255,255,0.9)' }]}>Workout calendar</Text>

      <View style={[styles.monthCalendar, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.82)', borderColor: isDark ? colors.cardBorder : 'rgba(0,0,0,0.12)' }]}>
        {/* Navigation header */}
        <View style={styles.monthCalendarHeader}>
          <TouchableOpacity
            onPress={() => { if (canGoPrev) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMonthIdx(i => i - 1); } }}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.primaryText} style={{ opacity: canGoPrev ? 1 : 0.25 }} />
          </TouchableOpacity>

          <View style={styles.monthNavCenter}>
            <Text style={[styles.monthCalendarLabel, { color: colors.primaryText }]}>{label}</Text>
            {workoutCount > 0 && (
              <View style={[styles.workoutCountChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                <Text style={[styles.workoutCountText, { color: colors.secondaryText }]}>
                  {workoutCount} {workoutCount === 1 ? 'workout' : 'workouts'}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={() => { if (canGoNext) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMonthIdx(i => i + 1); } }}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.primaryText} style={{ opacity: canGoNext ? 1 : 0.25 }} />
          </TouchableOpacity>
        </View>

        {/* Weekday headers */}
        <View style={[styles.calendarRow, styles.calendarHeaderRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
          {DAY_HEADERS.map((d, i) => (
            <Text key={i} style={[styles.calendarDayHeader, { color: colors.tertiaryText }]}>{d}</Text>
          ))}
        </View>

        {/* Day grid */}
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.calendarRow}>
            {week.map((day, di) => {
              if (day === null) return <View key={di} style={styles.calendarCell} />;
              const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const entry = entryByDate.get(ds);
              const hasWorkout = !!entry;
              const isToday = ds === todayStr;
              const isFuture = ds > maxFutureStr;
              const isPast = !isFuture;
              const isHighlighted = !!highlightDate && ds === highlightDate;
              const tappable = isPast;
              return (
                <TouchableOpacity
                  key={di}
                  style={styles.calendarCell}
                  onPress={() => {
                    if (!tappable) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (entry) { onSelect(entry); } else { onLogNew(new Date(year, month, day!)); }
                  }}
                  activeOpacity={tappable ? 0.7 : 1}
                >
                  <View style={[
                    styles.calendarCellInner,
                    isPast && !hasWorkout && !isToday && { borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.1)' },
                    isToday && !hasWorkout && { borderWidth: 2, borderColor: isDark ? 'rgba(255,255,255,0.55)' : '#2c3e50' },
                    hasWorkout && !isFuture && !isToday && { backgroundColor: `${resolveEntryColor(entry!)}28`, borderWidth: 1.5, borderColor: resolveEntryColor(entry!) },
                    isToday && hasWorkout && !isFuture && { backgroundColor: `${resolveEntryColor(entry!)}35`, borderWidth: 2, borderColor: resolveEntryColor(entry!) },
                    isHighlighted && !hasWorkout && { borderWidth: 2, borderColor: isDark ? '#FFFFFF' : '#2c3e50', backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(44,62,80,0.08)' },
                  ]}>
                    <Text style={[
                      styles.calendarDayNum,
                      { color: isFuture ? colors.tertiaryText : colors.secondaryText },
                      isFuture && { opacity: 0.35 },
                      isToday && { color: isDark ? '#FFFFFF' : '#1a2a3a', fontFamily: 'Arimo_700Bold' },
                      hasWorkout && !isFuture && { color: colors.primaryText, fontFamily: 'Arimo_700Bold' },
                      isHighlighted && { color: colors.primaryText, fontFamily: 'Arimo_700Bold' },
                    ]}>
                      {day}
                    </Text>
                    {hasWorkout && !isFuture && (
                      <View style={[styles.workoutDot, { backgroundColor: resolveEntryColor(entry!) }]} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Workout list */}
      {displayedEntries.length > 0 ? (
        <View style={styles.monthWorkoutList}>
          <Text style={[styles.monthLabel, { color: colors.secondaryText }]}>Last 7 Days</Text>
          {displayedEntries.map(entry => {
            const exCount = countExercises(entry);
            const eColor = resolveEntryColor(entry);
            return (
              <BounceButton
                key={entry.id}
                style={[styles.journalCard, { backgroundColor: colors.cardTranslucent, borderColor: eColor }]}
                onPress={() => onSelect(entry)}
              >
                <View style={styles.cardContent}>
                  <View style={styles.cardTop}>
                    <View style={[styles.cardColorDot, { backgroundColor: eColor }]} />
                    <Text style={[styles.cardDayLabel, { color: colors.primaryText }]} numberOfLines={1}>
                      {entry.dayLabel}
                    </Text>
                  </View>
                  <View style={styles.cardMeta}>
                    <View style={[styles.programBadge, { backgroundColor: `${eColor}25`, borderWidth: 1, borderColor: eColor }]}>
                      <Text style={[styles.programBadgeText, { color: eColor }]}>{entry.programName}</Text>
                    </View>
                    <Text style={[styles.cardDate, { color: colors.tertiaryText }]}>{formatDate(entry.date)}</Text>
                  </View>
                  <Text style={[styles.cardStat, { color: colors.secondaryText }]}>
                    {exCount} exercise{exCount !== 1 ? 's' : ''}
                    {entry.totalVolume > 0 ? `  ·  ${Math.round(toDisplay(entry.totalVolume)).toLocaleString()} ${unit}` : ''}
                    {entry.durationSecs > 0 ? `  ·  ${formatDuration(entry.durationSecs)}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.tertiaryText} style={{ alignSelf: 'center', marginRight: 10 }} />
              </BounceButton>
            );
          })}
        </View>
      ) : (
        <Text style={[styles.noWorkoutsText, { color: colors.tertiaryText }]}>
          {isFutureMonth ? '' : 'No workouts in the last 7 days'}
        </Text>
      )}
    </ScrollView>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

type LogState = { date: Date; step: 'program' | 'day'; programId: string | null };

export default function JournalScreen() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const { programs } = useProgramStore();
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });
  const params = useLocalSearchParams<{ entryId?: string; logDate?: string }>();
  const [detailHasChanges, setDetailHasChanges] = useState(false);
  const originalDetailEntry = useRef<WorkoutJournalEntry | null>(null);
  // True when the detail was opened directly from the home screen (via entryId param)
  const fromHome = useRef(!!params.entryId);

  const [selectedEntry, setSelectedEntry] = useState<WorkoutJournalEntry | null>(() => {
    if (params.entryId) {
      const e = workoutState.getJournalEntry(params.entryId) ?? null;
      if (e) originalDetailEntry.current = JSON.parse(JSON.stringify(e));
      return e;
    }
    return null;
  });

  const [entries, setEntries] = useState(() => workoutState.getJournalLog());
  const [logState, setLogState] = useState<LogState | null>(() => {
    if (params.logDate) {
      const ts = Number(params.logDate);
      if (!isNaN(ts)) return { date: new Date(ts), step: 'program', programId: null };
    }
    return null;
  });

  if (!fontsLoaded) return null;

  const handleSelectEntry = (entry: WorkoutJournalEntry) => {
    originalDetailEntry.current = JSON.parse(JSON.stringify(entry));
    setDetailHasChanges(false);
    fromHome.current = false; // opened from within journal, not home
    setSelectedEntry(entry);
  };

  const closeDetail = () => {
    if (fromHome.current) {
      router.back();
    } else {
      setSelectedEntry(null);
      setDetailHasChanges(false);
    }
  };

  const handleLogNew = (date: Date) => {
    setLogState({ date, step: 'program', programId: null });
  };

  const handleCreateManualEntry = (date: Date, program: Program, dayIndex: number) => {
    const splitDay = program.splitDays[dayIndex];
    if (!splitDay || splitDay.type === 'rest') return;
    const ts = new Date(date).setHours(12, 0, 0, 0);
    const sessions: LoggedSession[] = splitDay.sessions.map(s => ({
      label: s.label,
      exercises: s.exercises.map(e => ({
        name: e.name,
        mode: e.mode ?? 'reps',
        sets: Array.from({ length: e.sets }, (_, i) => ({
          reps: 0, weight: null, hold: 0,
          isWarmup: i < (e.warmupSets ?? 0),
        })),
      })),
    }));
    const entry: WorkoutJournalEntry = {
      id: `manual-${Date.now()}`,
      date: ts,
      programName: program.name,
      programId: program.id,
      programColor: program.color,
      dayLabel: getDayLabel(splitDay),
      durationSecs: 0,
      totalVolume: 0,
      sessions,
    };
    workoutState.logJournalEntry(entry);
    setEntries(workoutState.getJournalLog());
    setLogState(null);
    handleSelectEntry(entry);
  };

  const handleBack = () => {
    if (logState) { setLogState(null); return; }
    if (selectedEntry) {
      if (detailHasChanges) {
        Alert.alert(
          'Save Changes',
          'Would you like to save your edits to this workout?',
          [
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => {
                if (originalDetailEntry.current) {
                  workoutState.updateJournalEntry(originalDetailEntry.current);
                  setEntries(workoutState.getJournalLog());
                }
                closeDetail();
              },
            },
            {
              text: 'Save',
              onPress: () => closeDetail(),
            },
          ],
        );
      } else {
        closeDetail();
      }
    } else {
      router.back();
    }
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.container}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.gradientStart} />

      {selectedEntry ? (
        <JournalDetail
          entry={selectedEntry}
          colors={colors}
          isDark={isDark}
          onUpdateEntry={(updated) => {
            workoutState.updateJournalEntry(updated);
            setSelectedEntry(updated);
            setEntries(workoutState.getJournalLog());
            setDetailHasChanges(true);
          }}
        />
      ) : (
        <JournalCalendar
          entries={entries}
          onSelect={handleSelectEntry}
          onLogNew={handleLogNew}
          colors={colors}
          isDark={isDark}
          highlightDate={logState ? toDateKey(logState.date.getTime()) : undefined}
        />
      )}

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backButtonAbsolute, { backgroundColor: colors.backButtonBg }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleBack(); }}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
      </TouchableOpacity>

      {/* Delete button — shown only in detail view */}
      {selectedEntry && (
        <TouchableOpacity
          style={[styles.viewToggleBtn, { backgroundColor: colors.backButtonBg }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Alert.alert(
              'Delete Workout',
              'This will permanently remove this workout from your journal.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    workoutState.deleteJournalEntry(selectedEntry.id);
                    // If deleting today's workout, reset the finished flag and timer
                    const entryDate = new Date(selectedEntry.date);
                    const today = new Date();
                    const isToday = entryDate.toDateString() === today.toDateString();
                    if (isToday) {
                      workoutState.setFinished(false);
                      workoutState.resetTimer(0);
                    }
                    setEntries(workoutState.getJournalLog());
                    setSelectedEntry(null);
                  },
                },
              ],
            );
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={20} color="#FF3B30" />
        </TouchableOpacity>
      )}

      {/* Save Changes floating button — shown only when detail has unsaved changes */}
      {selectedEntry && detailHasChanges && (() => {
        const btnColor = programs.find(p => p.id === selectedEntry.programId)?.color
          ?? programs.find(p => p.name === selectedEntry.programName)?.color
          ?? selectedEntry.programColor;
        return (
          <TouchableOpacity
            style={[styles.saveChangesBtn, { backgroundColor: btnColor }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setSelectedEntry(null);
              setDetailHasChanges(false);
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={16} color="#1C1C1E" />
            <Text style={[styles.saveChangesBtnText, { color: '#1C1C1E' }]}>Save Changes</Text>
          </TouchableOpacity>
        );
      })()}

      {/* Log Workout Modal */}
      <BottomSheetModal visible={!!logState} onDismiss={() => setLogState(null)}>
        <View style={[styles.logSheet, { backgroundColor: colors.modalBg }]}>
          {logState !== null && (
            <>
              <Text style={[styles.logSheetDate, { color: colors.tertiaryText }]}>
                {logState.date.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>

              {logState.step === 'program' ? (
                <>
                  <Text style={[styles.logSheetHeading, { color: colors.primaryText }]}>Select program</Text>
                  {programs.filter(p => !p.archived).map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.logSheetRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.09)' }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLogState(prev => prev ? { ...prev, step: 'day', programId: p.id } : null); }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.logSheetDot, { backgroundColor: p.color }]} />
                      <Text style={[styles.logSheetRowText, { color: colors.primaryText }]}>{p.name}</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.tertiaryText} />
                    </TouchableOpacity>
                  ))}
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.logSheetBack}
                    onPress={() => setLogState(prev => prev ? { ...prev, step: 'program', programId: null } : null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="chevron-back" size={18} color={colors.secondaryText} />
                    <Text style={[styles.logSheetBackText, { color: colors.secondaryText }]}>
                      {programs.find(p => p.id === logState.programId)?.name}
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.logSheetHeading, { color: colors.primaryText }]}>Select day</Text>
                  {(() => {
                    const prog = programs.find(p => p.id === logState.programId);
                    if (!prog) return null;
                    return prog.splitDays.map((day, i) => {
                      if (day.type === 'rest') return null;
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[styles.logSheetRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.09)' }]}
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleCreateManualEntry(logState.date, prog, i); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.logSheetRowText, { color: colors.primaryText }]}>{getDayLabel(day)}</Text>
                          <Text style={[styles.logSheetRowSub, { color: colors.tertiaryText }]}>{getDayExerciseCount(day)} exercises</Text>
                        </TouchableOpacity>
                      );
                    });
                  })()}
                </>
              )}

              <TouchableOpacity style={[styles.logSheetCancel, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => setLogState(null)}>
                <Text style={[styles.logSheetCancelText, { color: colors.primaryText }]}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </BottomSheetModal>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
  },

  // List header
  screenTitle: {
    fontSize: 28,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
    lineHeight: 36,
    textAlign: 'center',
    textShadowColor: '#00000080',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    marginBottom: 24,
    textAlign: 'center',
  },

  // Detail header
  detailHeader: {
    paddingLeft: 60,
    marginBottom: 4,
  },

  // Back button (absolute overlay)
  backButtonAbsolute: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 34,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    textAlign: 'center',
  },

  // Month groups
  monthGroup: {
    marginBottom: 24,
  },
  monthLabel: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // Journal card
  journalCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 10,
    overflow: 'hidden',
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  cardContent: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 5,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardColorDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    flexShrink: 0,
  },
  cardDayLabel: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    flex: 1,
    marginRight: 8,
  },
  cardDuration: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  programBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  programBadgeText: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
  },
  cardDate: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
  },
  cardStat: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
  },

  // Detail
  detailTitle: {
    fontSize: 22,
    fontFamily: 'Arimo_700Bold',
  },
  detailSubtitle: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    marginTop: 2,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 16,
    marginBottom: 24,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  statPillText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },

  // Session blocks
  sessionBlock: {
    marginBottom: 20,
  },
  sessionLabel: {
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
    letterSpacing: 1,
    marginBottom: 8,
  },

  // Exercise card
  exerciseCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
    overflow: 'hidden',
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  exerciseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  exerciseThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  exerciseControls: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 0,
  },
  exerciseMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 6,
    borderRadius: 10,
  },
  exerciseMenuText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },
  changeExInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    marginBottom: 16,
  },
  exerciseName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
  },

  // Set rows
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 12,
  },
  setLabelBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setLabelText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },
  setValue: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
  },
  rowIconSlot: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  notesText: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    flex: 1,
    lineHeight: 18,
  },
  notesInput: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    flex: 1,
    lineHeight: 18,
    padding: 0,
    minHeight: 18,
  },
  editInput: {
    width: 54,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 4,
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    textAlign: 'center',
  },

  // Detail scroll (extra bottom padding for Save Changes button)
  detailScrollContent: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 220,
  },

  // Save Changes floating button
  saveChangesBtn: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
    left: 40,
    right: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 20,
  },
  saveChangesBtnText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
  },

  // View toggle button (top-right)
  viewToggleBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 34,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  // Calendar
  monthCalendar: {
    marginBottom: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    paddingBottom: 10,
  },
  monthCalendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  monthNavCenter: {
    alignItems: 'center',
    gap: 5,
  },
  monthCalendarLabel: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
  },
  workoutCountChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  workoutCountText: {
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
  },
  calendarHeaderRow: {
    borderBottomWidth: 1,
    paddingBottom: 4,
    marginBottom: 4,
  },
  calendarRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  calendarDayHeader: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
    paddingBottom: 6,
  },
  calendarCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellInner: {
    width: CELL_SIZE - 6,
    height: CELL_SIZE - 6,
    borderRadius: (CELL_SIZE - 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  calendarDayNum: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    lineHeight: 15,
  },
  workoutDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  monthWorkoutList: {
    marginTop: 4,
  },
  listFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
    marginBottom: 4,
  },
  listFilterPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  listFilterPillText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },
  noWorkoutsText: {
    textAlign: 'center',
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    marginTop: 24,
    opacity: 0.6,
  },

  // Duration edit modal
  durationSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  durationSheetTitle: {
    fontSize: 17,
    fontFamily: 'Arimo_700Bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  durationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  durationInputGroup: {
    alignItems: 'center',
    gap: 6,
  },
  durationInput: {
    width: 80,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    fontSize: 26,
    fontFamily: 'Arimo_700Bold',
    textAlign: 'center',
  },
  durationInputLabel: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
  },
  durationColon: {
    fontSize: 26,
    fontFamily: 'Arimo_700Bold',
    marginBottom: 18,
  },
  durationSheetActions: {
    flexDirection: 'row',
    gap: 12,
  },
  durationActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  durationActionText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
  },

  // Log workout modal
  logSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  logSheetDate: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  logSheetHeading: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
    marginBottom: 14,
  },
  logSheetBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  logSheetBackText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
  },
  logSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  logSheetDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  logSheetRowText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
  },
  logSheetRowSub: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
  },
  logSheetCancel: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 28,
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  logSheetCancelText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },
});
