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
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { workoutState, WorkoutJournalEntry, LoggedSession } from '../workoutState';
import { useTheme } from '../themeStore';
import { useProgramStore, getDayLabel, getDayExerciseCount } from '../programStore';
import type { Program } from '../programStore';

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
  const totalExercises = countExercises(entry);
  const showSessionLabel = entry.sessions.length > 1;

  const [editTarget, setEditTarget] = useState<{ si: number; ei: number; setI: number; mode: 'reps' | 'hold' } | null>(null);
  const [editVal1, setEditVal1] = useState(''); // reps or hold secs
  const [editVal2, setEditVal2] = useState(''); // weight

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

  const startEdit = (si: number, ei: number, setI: number, set: any, mode: 'reps' | 'hold') => {
    setEditTarget({ si, ei, setI, mode });
    setEditVal1(mode === 'hold' ? (set.hold > 0 ? String(set.hold) : '') : (set.reps > 0 ? String(set.reps) : ''));
    setEditVal2(set.weight != null ? String(set.weight) : '');
  };

  const commitEdit = () => {
    if (!editTarget) return;
    const { si, ei, setI, mode } = editTarget;
    const newEntry: WorkoutJournalEntry = JSON.parse(JSON.stringify(entry));
    const s = newEntry.sessions[si].exercises[ei].sets[setI];
    if (mode === 'hold') {
      s.hold = parseFloat(editVal1) || 0;
    } else {
      s.reps = parseInt(editVal1) || 0;
    }
    const w = editVal2 === '' ? null : parseFloat(editVal2);
    s.weight = (w === null || isNaN(w)) ? null : w;
    onUpdateEntry(newEntry);
    setEditTarget(null);
    Keyboard.dismiss();
  };

  return (
    <ScrollView contentContainerStyle={styles.detailScrollContent} showsVerticalScrollIndicator={false}>
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
          style={[styles.statPill, { backgroundColor: `${entry.programColor}20`, borderColor: entry.programColor }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDurationEdit(); }}
          activeOpacity={0.7}
        >
          <Ionicons name="time-outline" size={14} color={isDark ? entry.programColor : colors.primaryText} />
          <Text style={[styles.statPillText, { color: isDark ? entry.programColor : colors.primaryText }]}>
            {entry.durationSecs > 0 ? formatDuration(entry.durationSecs) : 'Add time'}
          </Text>
          <Ionicons name="pencil-outline" size={11} color={isDark ? entry.programColor : colors.primaryText} style={{ opacity: 0.6 }} />
        </TouchableOpacity>
        {entry.totalVolume > 0 && (
          <View style={[styles.statPill, { backgroundColor: `${entry.programColor}20`, borderColor: entry.programColor }]}>
            <Ionicons name="barbell-outline" size={14} color={isDark ? entry.programColor : colors.primaryText} />
            <Text style={[styles.statPillText, { color: isDark ? entry.programColor : colors.primaryText }]}>
              {Math.round(entry.totalVolume).toLocaleString()} kg
            </Text>
          </View>
        )}
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
                <Text style={[styles.exerciseName, { color: colors.primaryText }]}>{exercise.name}</Text>
                {/* Set rows */}
                {exercise.sets.map((set, si2) => {
                  const isWarmup = set.isWarmup;
                  const workingIdx = exercise.sets.slice(0, si2).filter(s => !s.isWarmup).length + 1;
                  const hasData = exercise.mode === 'hold'
                    ? (set.hold > 0 || set.weight != null)
                    : set.reps > 0;
                  const rowDividerColor = isDark ? colors.border : 'rgba(0,0,0,0.07)';
                  const isEditing = editTarget !== null && editTarget.si === si && editTarget.ei === ei && editTarget.setI === si2;
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
                      {/* Set label */}
                      <View style={[styles.setLabelBox, { borderColor: isWarmup ? entry.programColor : (isDark ? colors.border : 'rgba(0,0,0,0.25)') }]}>
                        <Text style={[styles.setLabelText, { color: isWarmup ? entry.programColor : colors.primaryText }]}>
                          {isWarmup ? 'W' : workingIdx}
                        </Text>
                      </View>
                      {isEditing ? (
                        <>
                          <View style={{ flexDirection: 'row', flex: 1, alignItems: 'center', gap: 6, marginLeft: 6 }}>
                            <TextInput
                              style={[styles.editInput, { color: colors.primaryText, borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', backgroundColor: colors.inputBg }]}
                              value={editVal1}
                              onChangeText={setEditVal1}
                              keyboardType="decimal-pad"
                              returnKeyType="done"
                              onSubmitEditing={commitEdit}
                              placeholder={exercise.mode === 'hold' ? '0' : '0'}
                              placeholderTextColor={colors.tertiaryText}
                              selectTextOnFocus
                              autoFocus
                            />
                            <Text style={{ color: colors.tertiaryText, fontSize: 12, fontFamily: 'Arimo_400Regular' }}>
                              {exercise.mode === 'hold' ? 's' : 'reps'}
                            </Text>
                            <TextInput
                              style={[styles.editInput, { color: colors.primaryText, borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', backgroundColor: colors.inputBg }]}
                              value={editVal2}
                              onChangeText={setEditVal2}
                              keyboardType="decimal-pad"
                              returnKeyType="done"
                              onSubmitEditing={commitEdit}
                              placeholder="0"
                              placeholderTextColor={colors.tertiaryText}
                              selectTextOnFocus
                            />
                            <Text style={{ color: colors.tertiaryText, fontSize: 12, fontFamily: 'Arimo_400Regular' }}>kg</Text>
                          </View>
                          <TouchableOpacity
                            onPress={commitEdit}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={styles.rowIconSlot}
                          >
                            <Ionicons name="checkmark-circle" size={22} color={entry.programColor} />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          {hasData ? (
                            exercise.mode === 'hold' ? (
                              <Text style={[styles.setValue, { color: colors.primaryText, flex: 1, marginLeft: 6 }]}>
                                {set.hold}s{set.weight != null ? `  ·  ${set.weight} kg` : ''}
                              </Text>
                            ) : (
                              <Text style={[styles.setValue, { color: colors.primaryText, flex: 1, marginLeft: 6 }]}>
                                {set.reps} reps{set.weight != null ? `  ·  ${set.weight} kg` : ''}
                              </Text>
                            )
                          ) : (
                            <Text style={[styles.setValue, { color: colors.tertiaryText, flex: 1, marginLeft: 6 }]}>—</Text>
                          )}
                          <View style={styles.rowIconSlot}>
                            <Ionicons name="pencil-outline" size={13} color={colors.tertiaryText} style={{ opacity: 0.5 }} />
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>
      ))}
      {/* Duration edit modal */}
      <Modal visible={showDurationEdit} transparent animationType="slide" onRequestClose={() => setShowDurationEdit(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowDurationEdit(false)} />
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
            <TouchableOpacity style={[styles.durationActionBtn, { backgroundColor: entry.programColor }]} onPress={commitDuration}>
              <Text style={[styles.durationActionText, { color: '#fff' }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
}: {
  entries: WorkoutJournalEntry[];
  onSelect: (entry: WorkoutJournalEntry) => void;
  onLogNew: (date: Date) => void;
  colors: any;
  isDark: boolean;
}) {
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
      .sort((a, b) => a.date - b.date),
    [entries, year, month]);

  const [listFilter, setListFilter] = useState<'week' | 'month'>('month');

  const weekEntries = useMemo(() => {
    const now = today.getTime();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    return entries.filter(e => e.date >= sevenDaysAgo && e.date <= now).sort((a, b) => a.date - b.date);
  }, [entries, today]);

  const displayedEntries = listFilter === 'week' ? weekEntries : monthEntries;

  const workoutCount = useMemo(() => weeks.flat().filter(day => {
    if (!day) return false;
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return entryByDate.has(ds) && ds <= todayStr;
  }).length, [weeks, year, month, entryByDate, todayStr]);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Journal</Text>
      <Text style={[styles.screenSubtitle, { color: 'rgba(255,255,255,0.7)' }]}>Workout calendar</Text>

      <View style={[styles.monthCalendar, { backgroundColor: colors.cardTranslucent, borderColor: isDark ? colors.cardBorder : 'rgba(0,0,0,0.12)' }]}>
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
                    hasWorkout && !isFuture && !isToday && { backgroundColor: `${entry!.programColor}28`, borderWidth: 1.5, borderColor: entry!.programColor },
                    isToday && hasWorkout && !isFuture && { backgroundColor: `${entry!.programColor}35`, borderWidth: 2, borderColor: entry!.programColor },
                  ]}>
                    <Text style={[
                      styles.calendarDayNum,
                      { color: isFuture ? colors.tertiaryText : colors.secondaryText },
                      isFuture && { opacity: 0.35 },
                      isToday && { color: isDark ? '#FFFFFF' : '#1a2a3a', fontFamily: 'Arimo_700Bold' },
                      hasWorkout && !isFuture && { color: colors.primaryText, fontFamily: 'Arimo_700Bold' },
                    ]}>
                      {day}
                    </Text>
                    {hasWorkout && !isFuture && (
                      <View style={[styles.workoutDot, { backgroundColor: entry!.programColor }]} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Filter toggle */}
      <View style={styles.listFilterRow}>
        {(['week', 'month'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[
              styles.listFilterPill,
              listFilter === f
                ? { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)', borderWidth: 1.5, borderStyle: 'solid', borderColor: 'transparent' }
                : { borderWidth: 1.5, borderStyle: 'dotted', borderColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)' },
            ]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setListFilter(f); }}
          >
            <Text style={[styles.listFilterPillText, { color: listFilter === f ? colors.primaryText : colors.tertiaryText }]}>
              {f === 'week' ? 'Week' : 'Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Workout list */}
      {displayedEntries.length > 0 ? (
        <View style={styles.monthWorkoutList}>
          <Text style={[styles.monthLabel, { color: colors.secondaryText }]}>
            {listFilter === 'week' ? 'Last 7 Days' : label.split(' ')[0]}
          </Text>
          {displayedEntries.map(entry => {
            const exCount = countExercises(entry);
            return (
              <BounceButton
                key={entry.id}
                style={[styles.journalCard, { backgroundColor: colors.cardTranslucent, borderColor: entry.programColor }]}
                onPress={() => onSelect(entry)}
              >
                <View style={styles.cardContent}>
                  <View style={styles.cardTop}>
                    <View style={[styles.cardColorDot, { backgroundColor: entry.programColor }]} />
                    <Text style={[styles.cardDayLabel, { color: colors.primaryText }]} numberOfLines={1}>
                      {entry.dayLabel}
                    </Text>
                  </View>
                  <View style={styles.cardMeta}>
                    <View style={[styles.programBadge, { backgroundColor: `${entry.programColor}25` }]}>
                      <Text style={[styles.programBadgeText, { color: entry.programColor }]}>{entry.programName}</Text>
                    </View>
                    <Text style={[styles.cardDate, { color: colors.tertiaryText }]}>{formatDate(entry.date)}</Text>
                  </View>
                  <Text style={[styles.cardStat, { color: colors.secondaryText }]}>
                    {exCount} exercise{exCount !== 1 ? 's' : ''}
                    {entry.totalVolume > 0 ? `  ·  ${Math.round(entry.totalVolume).toLocaleString()} kg` : ''}
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
          {listFilter === 'week' ? 'No workouts in the last 7 days' : isFutureMonth ? '' : `No workouts in ${label.split(' ')[0]}`}
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
  const params = useLocalSearchParams<{ entryId?: string }>();
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
  const [logState, setLogState] = useState<LogState | null>(null);

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
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 0.35 }}
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
        <JournalCalendar entries={entries} onSelect={handleSelectEntry} onLogNew={handleLogNew} colors={colors} isDark={isDark} />
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
      {selectedEntry && detailHasChanges && (
        <TouchableOpacity
          style={[styles.saveChangesBtn, { backgroundColor: selectedEntry.programColor }]}
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
      )}

      {/* Log Workout Modal */}
      {logState && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 100 }]}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setLogState(null)} activeOpacity={1} />
          <View style={[styles.logSheet, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.logSheetDate, { color: colors.tertiaryText }]}>
              {logState.date.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>

            {logState.step === 'program' ? (
              <>
                <Text style={[styles.logSheetHeading, { color: colors.primaryText }]}>Select program</Text>
                {programs.map(p => (
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

            <TouchableOpacity style={styles.logSheetCancel} onPress={() => setLogState(null)}>
              <Text style={[styles.logSheetCancelText, { color: colors.tertiaryText }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
  exerciseName: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
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
    paddingBottom: 120,
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
    alignItems: 'center',
    paddingTop: 16,
  },
  logSheetCancelText: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
  },
});
