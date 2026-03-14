import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Keyboard,
  Platform,
  StatusBar,
  Animated,
  TextInput,
  LayoutAnimation,
  UIManager,
  Alert,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import exerciseDbRaw from '../../assets/data/exercises.json';

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
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { workoutState } from '../../workoutState';
import { useProgramStore, getDayLabel, getDayExerciseCount } from '../../programStore';
import { useTheme } from '../../themeStore';
import { useUnits } from '../../unitsStore';
import { useCommunityStore } from '../../communityStore';
import { useAuth } from '../../authStore';
import { BottomSheetModal } from '../../components/BottomSheetModal';
import { FadeBackdrop } from '../../components/FadeBackdrop';
import { ExercisePicker } from '../../components/ExercisePicker';
import { ExerciseInfoModal } from '../../components/ExerciseInfoModal';

type SetData = { set: number; reps: number; weight: number | null; hold?: number; prevReps?: number; prevWeight?: number; prevHold?: number; isWarmup?: boolean; fillKey?: number };
type Exercise = { name: string; sets: SetData[]; mode?: 'reps' | 'hold'; targetReps?: string };
type SessionWorkout = { label: string; exercises: Exercise[] };
type DayWorkout = {
  program: string;
  dayLabel: string;
  subtitle: string;
  sessions: SessionWorkout[];
} | null;
type CalendarDay = { date: Date; key: string; offset: number; label: string };

function BookOpenIcon({ size = 24, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </Svg>
  );
}

// --- Constants ---

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];


// --- Components ---


function BounceButton({ style, children, onPress, ...rest }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start()}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.(); }}
      style={style}
      {...rest}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

function CheckboxCell({ completed, hasPrev, accentColor, onFillPrev, readOnly }: {
  completed: boolean; hasPrev: boolean; accentColor: string; onFillPrev: () => void; readOnly?: boolean;
}) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const wasCompleted = useRef(completed);

  // Pop animation when a set transitions from incomplete → complete
  useEffect(() => {
    if (completed && !wasCompleted.current) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 0.70, useNativeDriver: true, speed: 60, bounciness: 0 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 16 }),
      ]).start();
    }
    wasCompleted.current = completed;
  }, [completed]);

  if (completed) {
    return (
      <Animated.View style={[styles.checkbox, styles.checkboxChecked, { transform: [{ scale }] }]}>
        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
      </Animated.View>
    );
  }

  if (hasPrev) {
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => Animated.spring(scale, { toValue: 0.78, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start()}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onFillPrev(); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        disabled={readOnly}
      >
        <Animated.View style={[styles.checkbox, { borderWidth: 1.5, borderColor: accentColor, backgroundColor: `${accentColor}25`, transform: [{ scale }] }]}>
          <Ionicons name="checkmark" size={14} color={accentColor} />
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return <View style={[styles.checkbox, { backgroundColor: colors.checkboxBg }]} />;
}

function CalendarStrip({ selectedIndex, onSelect, accentColor, days, todayIndex, lockedTodayColor, loggedDateColors, onJournalPress }: { selectedIndex: number; onSelect: (i: number) => void; accentColor: string; days: CalendarDay[]; todayIndex: number; lockedTodayColor?: string; loggedDateColors: Record<string, string>; onJournalPress: () => void }) {
  const { isDark, colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const hasScrolled = useRef(false);

  useEffect(() => {
    if (!hasScrolled.current && days.length > 0) {
      hasScrolled.current = true;
      const cellWidth = 64 + 8; // width + gap
      // Account for journal card (same width) before the days array
      const offset = Math.max(0, cellWidth + todayIndex * cellWidth - 120);
      setTimeout(() => scrollRef.current?.scrollTo({ x: offset, animated: false }), 50);
    }
  }, [days.length]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.calendarRow}
    >
      {/* Journal card — always at the far left */}
      <TouchableOpacity
        style={[styles.dayCell, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}
        onPress={onJournalPress}
        activeOpacity={0.7}
      >
        <BookOpenIcon size={15} color={colors.tertiaryText} />
        <Text style={[styles.dayName, { color: colors.tertiaryText, fontSize: 9, marginTop: 1 }]}>Journal</Text>
      </TouchableOpacity>

      {days.map((item, index) => {
        const isToday = index === todayIndex;
        const isSelected = index === selectedIndex;
        const isPast = index < todayIndex;
        const dayName = DAY_NAMES[item.date.getDay()];
        const dateNum = item.date.getDate();
        const isRest = item.label === 'Rest';
        // Today locked to a different program — use its color for the indicator and dot
        const cellColor = (isToday && lockedTodayColor) ? lockedTodayColor : accentColor;
        // Grey out past days (or rest days) unless a workout was actually logged
        const journalColor = loggedDateColors[item.date.toDateString()];
        const hasLog = !!journalColor;
        // Past days: grey if no log (missed workout or rest); today/future: use scheduled color
        const effectiveIsRest = !hasLog && (isRest || isPast);
        const effectiveColor = hasLog ? journalColor : cellColor;

        return (
          <TouchableOpacity
            key={item.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(index);
            }}
            style={[
              styles.dayCell,
              { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
              isPast && !isSelected && { opacity: 0.55 },
              isSelected && { backgroundColor: `${cellColor}15`, borderColor: cellColor, borderWidth: 2.5, shadowColor: cellColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6 },
              isSelected && isPast && { opacity: 1 },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.dayName, { color: colors.secondaryText }, isSelected && { color: isDark ? '#fff' : '#1C1C1E' }]}>
              {dayName}
            </Text>
            <Text style={[styles.dayNumber, { color: colors.primaryText }, isSelected && { color: isDark ? '#fff' : '#1C1C1E' }]}>
              {dateNum}
            </Text>
            <View style={[
              styles.dayIndicator,
              { backgroundColor: effectiveIsRest ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)') : `${effectiveColor}60` },
              isSelected && !effectiveIsRest && { backgroundColor: isDark ? '#fff' : '#1C1C1E' },
              isSelected && effectiveIsRest && { backgroundColor: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)' },
            ]} />
            {isToday && <View style={[styles.todayDot, { backgroundColor: cellColor }, isSelected && { backgroundColor: isDark ? '#fff' : '#1C1C1E' }]} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function ExerciseCard({ exercise, index, onAddSet, onRemoveSet, onUpdateSet, onToggleWarmup, onMoveUp, onMoveDown, isFirst, isLast: isLastExercise, accentColor = '#47DDFF', note, onNoteChange, mode, onToggleMode, onShowExerciseList, onRemoveExercise, readOnly, onFillPrev, onShowInfo, targetReps }: { exercise: Exercise; index: number; onAddSet: () => void; onRemoveSet: () => void; onUpdateSet: (setIndex: number, field: 'reps' | 'weight' | 'hold', value: string) => void; onToggleWarmup: (setIndex: number) => void; onMoveUp?: () => void; onMoveDown?: () => void; isFirst?: boolean; isLast?: boolean; accentColor?: string; note?: string; onNoteChange?: (text: string) => void; mode: 'reps' | 'hold'; onToggleMode: () => void; onShowExerciseList: () => void; onRemoveExercise: () => void; readOnly?: boolean; onFillPrev: (setIndex: number) => void; onShowInfo?: () => void; targetReps?: string }) {
  const [editing, setEditing] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { isDark, colors } = useTheme();
  const { unit, toDisplay, toKg } = useUnits();
  const weightRefs = useRef<(TextInput | null)[]>([]);
  const repsRefs = useRef<(TextInput | null)[]>([]);
  const isHold = mode === 'hold';
  const fmtW = (kg: number) => {
    const v = toDisplay(kg);
    const r = Math.round(v * 10) / 10;
    return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1);
  };
  return (
    <View style={[styles.exerciseCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
      <View style={styles.exerciseHeader}>
        <View style={[styles.exerciseNumberBadge, { backgroundColor: `${accentColor}25`, borderColor: accentColor }]}>
          <Text style={[styles.exerciseNumberText, { color: colors.primaryText }]}>{index + 1}</Text>
        </View>
        <TouchableOpacity
          style={styles.exerciseNameRow}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onShowInfo?.(); }}
          activeOpacity={0.7}
        >
          {(() => {
            const imgUrl = getExerciseImageUrl(exercise.name);
            return imgUrl ? (
              <View style={[styles.exerciseThumb, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                <Image source={{ uri: imgUrl }} style={styles.exerciseThumbImg} contentFit="cover" />
              </View>
            ) : null;
          })()}
          <Text style={[styles.exerciseName, { color: colors.primaryText, flex: 1 }]}>{exercise.name}</Text>
        </TouchableOpacity>
        {!readOnly && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setEditing(!editing);
              if (editing) setConfirmRemove(false);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={editing ? "checkmark-circle" : "ellipsis-horizontal"} size={editing ? 28 : 24} color={editing ? accentColor : colors.secondaryText} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.setRow}>
        <Text style={[styles.setHeaderText, styles.setCol, { color: colors.secondaryText }]}>SET</Text>
        <View style={styles.prevCol}><Text style={[styles.prevColHeader, { color: colors.tertiaryText }]}>PREV</Text></View>
        <View style={styles.inputHeaderCol}><Text style={[styles.setHeaderText, { color: colors.secondaryText, letterSpacing: 0.5 }]} numberOfLines={1} adjustsFontSizeToFit>WEIGHT ({unit.toUpperCase()})</Text></View>
        <View style={styles.inputHeaderCol}>
          {!isHold && targetReps ? (
            <Text style={{ fontSize: 10, color: colors.secondaryText, fontWeight: '600', textAlign: 'center' }}>{targetReps}</Text>
          ) : null}
          <Text style={[styles.setHeaderText, { color: colors.secondaryText }]}>{isHold ? 'HOLD' : 'REPS'}</Text>
        </View>
        <View style={styles.checkCol} />
      </View>

      <View style={[styles.headerDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} />

      {exercise.sets.map((s, si) => {
        const isWarmup = !!s.isWarmup;
        const workingIndex = exercise.sets.slice(0, si).filter(x => !x.isWarmup).length + 1;
        const completed = isHold ? ((s.hold ?? 0) > 0 && s.weight !== null) : (s.reps > 0 && s.weight !== null);
        const hasPrev = isHold ? (s.prevHold != null && s.prevHold > 0) : (s.prevReps != null && s.prevReps > 0);
        const isLast = si === exercise.sets.length - 1;
        return (
          <View key={s.set} style={styles.dataRow}>
            {editing ? (
              <TouchableOpacity
                style={{ width: 36, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggleWarmup(si); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View style={{ borderWidth: 1.5, borderColor: isWarmup ? '#F5A623' : colors.border, borderRadius: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[styles.setText, { color: isWarmup ? '#F5A623' : colors.primaryText }]}>{isWarmup ? 'W' : workingIndex}</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.setText, styles.setCol, { color: isWarmup ? '#F5A623' : colors.primaryText }]}>{isWarmup ? 'W' : workingIndex}</Text>
            )}
            <View style={styles.prevCol}>
              <Text style={[styles.prevValue, { color: colors.tertiaryText }]} numberOfLines={1}>
                {isHold
                  ? (s.prevHold != null && s.prevHold > 0 ? `${s.prevWeight != null ? fmtW(s.prevWeight) : '0'}${unit} × ${s.prevHold}s` : '—')
                  : (s.prevReps != null && s.prevReps > 0 ? `${s.prevWeight != null ? fmtW(s.prevWeight) : '0'}${unit} × ${s.prevReps}` : '—')}
              </Text>
            </View>
            <View style={styles.inputCell}>
              <View style={[styles.inputBox, { backgroundColor: isDark ? colors.inputBg : '#FFFFFF', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)' }]}>
                <TextInput
                  key={`w-${s.set}-${s.fillKey ?? 0}`}
                  ref={r => { weightRefs.current[si] = r; }}
                  style={[styles.inputBoxText, { color: colors.primaryText }]}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => setTimeout(() => repsRefs.current[si]?.focus(), 50)}
                  defaultValue={s.weight != null ? fmtW(s.weight) : ''}
                  placeholder="—"
                  placeholderTextColor={colors.tertiaryText}
                  onChangeText={(v) => {
                    if (unit === 'lbs' && v !== '') {
                      const n = parseFloat(v);
                      if (!isNaN(n)) { onUpdateSet(si, 'weight', String(toKg(n))); return; }
                    }
                    onUpdateSet(si, 'weight', v);
                  }}
                  caretHidden={false}
                  selectTextOnFocus
                  editable={!readOnly}
                />
              </View>
            </View>
            <View style={styles.inputCell}>
              <View style={[styles.inputBox, { backgroundColor: isDark ? colors.inputBg : '#FFFFFF', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)' }]}>
                <TextInput
                  key={`r-${s.set}-${s.fillKey ?? 0}`}
                  ref={r => { repsRefs.current[si] = r; }}
                  style={[styles.inputBoxText, { color: colors.primaryText }]}
                  keyboardType="decimal-pad"
                  returnKeyType={si < exercise.sets.length - 1 ? 'next' : 'done'}
                  onSubmitEditing={() => {
                    if (si < exercise.sets.length - 1) {
                      setTimeout(() => weightRefs.current[si + 1]?.focus(), 50);
                    } else {
                      Keyboard.dismiss();
                    }
                  }}
                  defaultValue={isHold ? ((s.hold ?? 0) > 0 ? String(s.hold) : '') : (s.reps > 0 ? String(s.reps) : '')}
                  placeholder={isHold ? '0s' : '—'}
                  placeholderTextColor={colors.tertiaryText}
                  onChangeText={(v) => onUpdateSet(si, isHold ? 'hold' : 'reps', v)}
                  caretHidden={false}
                  selectTextOnFocus
                  editable={!readOnly}
                />
              </View>
            </View>
            {editing && isLast && exercise.sets.length > 1 ? (
              <TouchableOpacity
                style={styles.checkCol}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onRemoveSet();
                }}
              >
                <View style={styles.removeSetBtn}>
                  <Ionicons name="remove" size={14} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.checkCol}>
                <CheckboxCell
                  completed={completed}
                  hasPrev={hasPrev}
                  accentColor={accentColor}
                  onFillPrev={() => onFillPrev(si)}
                  readOnly={readOnly}
                />
              </View>
            )}
          </View>
        );
      })}

      {editing && (
        <>
          <TouchableOpacity
            style={[styles.addSetBtn, { borderColor: '#00EBAC' }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onAddSet();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={16} color="#00EBAC" />
            <Text style={[styles.addSetText, { color: '#00EBAC' }]}>Add Set</Text>
          </TouchableOpacity>

          {(!isFirst || !isLastExercise) && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              {!isFirst && (
                <TouchableOpacity
                  style={[styles.editOptionBtn, { backgroundColor: colors.inputBg, flex: 1, marginTop: 0 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    onMoveUp?.();
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-up" size={16} color={colors.primaryText} />
                  <Text style={[styles.editOptionText, { color: colors.primaryText }]}>Move Up</Text>
                </TouchableOpacity>
              )}
              {!isLastExercise && (
                <TouchableOpacity
                  style={[styles.editOptionBtn, { backgroundColor: colors.inputBg, flex: 1, marginTop: 0 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    onMoveDown?.();
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-down" size={16} color={colors.primaryText} />
                  <Text style={[styles.editOptionText, { color: colors.primaryText }]}>Move Down</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.editOptionBtn, { backgroundColor: colors.inputBg }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onShowExerciseList();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="swap-horizontal" size={16} color={colors.primaryText} />
            <Text style={[styles.editOptionText, { color: colors.primaryText }]}>Change Exercise</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.editOptionBtn, { backgroundColor: colors.inputBg }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleMode();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name={isHold ? 'timer-outline' : 'barbell-outline'} size={16} color={colors.primaryText} />
            <Text style={[styles.editOptionText, { color: colors.primaryText }]}>{isHold ? 'Isometric Hold' : 'Standard Reps'}</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name="repeat" size={16} color={colors.secondaryText} />
          </TouchableOpacity>

          {confirmRemove ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TouchableOpacity
                style={[styles.editOptionBtn, { backgroundColor: colors.inputBg, flex: 1, marginTop: 0 }]}
                onPress={() => setConfirmRemove(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.editOptionText, { color: colors.primaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editOptionBtn, { backgroundColor: '#FF3B30', flex: 1, marginTop: 0 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onRemoveExercise();
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                <Text style={[styles.editOptionText, { color: '#FFFFFF' }]}>Confirm</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.editOptionBtn, { backgroundColor: 'rgba(255,59,48,0.1)' }]}
              onPress={() => setConfirmRemove(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color="#FF3B30" />
              <Text style={[styles.editOptionText, { color: '#FF3B30' }]}>Remove Exercise</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <TouchableOpacity
        style={[styles.notesToggleBtn, { backgroundColor: colors.inputBg }, showNotes && styles.notesToggleBtnActive]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowNotes(!showNotes);
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="document-text-outline" size={16} color={showNotes ? colors.primaryText : colors.secondaryText} />
        <Text style={[styles.notesToggleText, { color: colors.secondaryText }, showNotes && { color: colors.primaryText, fontFamily: 'Arimo_700Bold' }]}>
          {note ? 'View Note' : 'Add Note'}
        </Text>
      </TouchableOpacity>

      {showNotes && (
        <TextInput
          style={[styles.noteInput, { backgroundColor: colors.inputBg, color: colors.primaryText }]}
          placeholder="Write a note for this exercise..."
          placeholderTextColor={colors.tertiaryText}
          value={note || ''}
          onChangeText={onNoteChange}
          returnKeyType="done"
          onSubmitEditing={() => {
            Keyboard.dismiss();
            setShowNotes(false);
          }}
          editable={!readOnly}
        />
      )}

    </View>
  );
}

// --- Main Screen ---

export default function WorkoutScreen() {
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });
  const router = useRouter();
  const { programs, activeId, updateProgram } = useProgramStore();
  const { isDark, colors } = useTheme();
  const { user } = useAuth();
  const { ownedCommunities, joinedCommunities, removeSharedWorkout } = useCommunityStore();
  const activeProgram = programs.find(p => p.id === activeId);
  const PAST_DAYS = 7;
  const PICK_ITEM_H = 50;
  const todayIndex = PAST_DAYS;

  // calendarIndex: 0..PAST_DAYS-1 = past days, PAST_DAYS = today, PAST_DAYS+1.. = future days
  const [calendarIndex, setCalendarIndex] = useState(PAST_DAYS);
  const selectedDayIndex = Math.max(0, calendarIndex - PAST_DAYS);
  const isViewingPast = calendarIndex < PAST_DAYS;
  const [pastSessionIndex, setPastSessionIndex] = useState(0);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  const [showComplete, setShowComplete] = useState(false);
  const [isSaveChangesToast, setIsSaveChangesToast] = useState(false);
  const [workoutFinished, setWorkoutFinished] = useState(workoutState.finished);
  const [changeExerciseIndex, setChangeExerciseIndex] = useState<number | null>(null);
  const [addingExercise, setAddingExercise] = useState(false);
  const [selectedSessionByDay, setSelectedSessionByDay] = useState<Record<number, number>>({});
  const selectedSessionIndex = selectedSessionByDay[selectedDayIndex] ?? 0;
  const setSelectedSessionIndex = (idx: number) =>
    setSelectedSessionByDay(prev => ({ ...prev, [selectedDayIndex]: idx }));
  const [sessionFinished, setSessionFinished] = useState<Record<string, boolean>>({});
  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);
  // Day override: maps dayIndex -> 'rest' (discard) or splitDay index (swap)
  const [dayOverrides, setDayOverrides] = useState<Record<number, 'rest' | number>>({});
  const [showSwapOverlay, setShowSwapOverlay] = useState(false);
  const [showMakeTodayPrompt, setShowMakeTodayPrompt] = useState(false);
  const [infoExerciseName, setInfoExerciseName] = useState<string | null>(null);
  const promptedDays = useRef<Set<number>>(new Set());
  const pendingFillAction = useRef<(() => void) | null>(null);
  // Stores final workout duration per day after finishing
  const [finishedDurations, setFinishedDurations] = useState<Record<number, number>>({});
  // When today's workout was completed under a now-inactive program, lock day 0 to that program's data
  type LockedToday = { programId: string; programColor: string; programName: string; dayLabel: string; splitDayIndex: number };
  const [lockedToday, setLockedToday] = useState<LockedToday | null>(null);
  // Accent color: locked program's color for day 0 when locked, otherwise active program's color
  const isViewingLockedToday = !!(lockedToday && lockedToday.programId !== activeId && selectedDayIndex === 0 && !isViewingPast);
  const accentColor = isViewingLockedToday
    ? (programs.find(p => p.id === lockedToday!.programId)?.color ?? lockedToday!.programColor)
    : (activeProgram?.color ?? '#47DDFF');
  // Helper: resolve current program color for a journal entry (handles color changes after logging)
  const resolveEntryColor = (entry: { programId?: string; programName?: string; programColor: string }) =>
    programs.find(p => p.id === entry.programId)?.color ?? programs.find(p => p.name === entry.programName)?.color ?? entry.programColor;

  // Cycle offset: which day of the program cycle is "today" (0 = first day, 1 = second, etc.)
  const [cycleOffset, setCycleOffset] = useState(0);

  // Incremented when prev data changes (journal saved) so exercise load useEffect re-runs
  const [prevVersion, setPrevVersion] = useState(0);

  const getEffectiveSplitIndex = (dayIdx: number): number => {
    const override = dayOverrides[dayIdx];
    if (typeof override === 'number') return override;
    const n = activeProgram?.splitDays.length ?? 1;
    return ((cycleOffset + dayIdx) % n + n) % n;
  };

  const handleSwapToToday = () => {
    const todaySplit = getEffectiveSplitIndex(0);
    const selectedSplit = getEffectiveSplitIndex(selectedDayIndex);
    setDayOverrides(prev => {
      const next = { ...prev };
      const n = activeProgram?.splitDays.length ?? 1;
      const naturalToday = ((cycleOffset + 0) % n + n) % n;
      const naturalSelected = ((cycleOffset + selectedDayIndex) % n + n) % n;
      if (selectedSplit === naturalToday) delete next[0]; else next[0] = selectedSplit;
      if (todaySplit === naturalSelected) delete next[selectedDayIndex]; else next[selectedDayIndex] = todaySplit;
      return next;
    });
    // Swap cache entries between today (0) and selectedDayIndex so entered data is preserved
    const prefixSel = `${selectedDayIndex}-`;
    const keysForSel = Object.keys(exerciseCache).filter(k => k.startsWith(prefixSel));
    const keysForToday = Object.keys(exerciseCache).filter(k => k.startsWith('0-'));
    const selBackup: Record<string, Exercise[]> = {};
    keysForSel.forEach(k => { selBackup[k] = exerciseCache[k]; delete exerciseCache[k]; });
    keysForToday.forEach(k => { exerciseCache[`${selectedDayIndex}-${k.slice(2)}`] = exerciseCache[k]; delete exerciseCache[k]; });
    keysForSel.forEach(k => { exerciseCache[`0-${k.slice(prefixSel.length)}`] = selBackup[k]; });
    promptedDays.current.add(0);
    setCalendarIndex(PAST_DAYS);
    workoutState.startTimer(0);
    setWorkoutStartTime(prev => prev ?? new Date());
  };

  const handleStartCurrentDay = () => {
    promptedDays.current.add(selectedDayIndex);
    workoutState.startTimer(selectedDayIndex);
    setWorkoutStartTime(prev => prev ?? new Date());
  };

  const maybePromptMakeToday = (timerAction: () => void, fillAction?: () => void) => {
    // If today is locked to a completed workout under a different program, don't offer
    // to reassign a future day as today — today is already taken.
    if (!isLocked && !isViewingPast && calendarIndex !== todayIndex && !promptedDays.current.has(selectedDayIndex)) {
      pendingFillAction.current = fillAction ?? null;
      setShowMakeTodayPrompt(true);
    } else {
      fillAction?.();
      timerAction();
    }
  };

  const isLocked = !!(lockedToday && lockedToday.programId !== activeId);
  // When today's workout is done (finished or locked to a completed workout), future days are read-only
  const futureReadOnly = (workoutFinished || isLocked) && selectedDayIndex !== 0;
  const calendarDays = useMemo<CalendarDay[]>(() => {
    if (!activeProgram) return [];
    const today = new Date();
    const n = activeProgram.splitDays.length;
    const days: CalendarDay[] = [];

    // Past 7 days (oldest first → index 0 = 7 days ago, index 6 = yesterday)
    for (let daysAgo = PAST_DAYS; daysAgo >= 1; daysAgo--) {
      const d = new Date(today);
      d.setDate(today.getDate() - daysAgo);
      const splitIdx = (((cycleOffset - daysAgo) % n) + n) % n;
      const splitDay = activeProgram.splitDays[splitIdx];
      const label = splitDay ? getDayLabel(splitDay) : 'Rest';
      days.push({ date: d, key: `past-${daysAgo}`, offset: -daysAgo, label });
    }

    // Today + future days (index PAST_DAYS = today)
    activeProgram.splitDays.forEach((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      // Day 0 locked: show old program's workout label
      if (i === 0 && isLocked) {
        days.push({ date: d, key: 'day-0', offset: 0, label: lockedToday!.dayLabel });
        return;
      }
      const override = dayOverrides[i];
      let label: string;
      if (override === 'rest') {
        label = 'Rest';
      } else if (typeof override === 'number') {
        const swapped = activeProgram.splitDays[override];
        label = swapped ? getDayLabel(swapped) : 'Rest';
      } else {
        // Natural day: apply cycle offset. When locked, new program starts at day 1.
        const naturalIdx = isLocked ? i - 1 : i;
        const splitIdx = ((cycleOffset + naturalIdx) % n + n) % n;
        const splitDay = activeProgram.splitDays[splitIdx];
        label = splitDay ? getDayLabel(splitDay) : 'Rest';
      }
      days.push({ date: d, key: `day-${i}`, offset: i, label });
    });

    return days;
  }, [activeProgram?.id, dayOverrides, isLocked, lockedToday?.dayLabel, cycleOffset]);

  // Map of date string → program color for days that have been logged in the journal
  const loggedDateColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of workoutState.getJournalLog()) {
      const ds = new Date(entry.date).toDateString();
      if (!map[ds]) map[ds] = programs.find(p => p.id === entry.programId)?.color ?? programs.find(p => p.name === entry.programName)?.color ?? entry.programColor;
    }
    return map;
  }, [prevVersion, programs]);

  // Timer state (per-day)
  const [elapsed, setElapsed] = useState(0);
  const [timerRunning, setTimerRunning] = useState(!!workoutState.getTimerStartedAt(selectedDayIndex));
  const [timerPaused, setTimerPaused] = useState(workoutState.getTimerPausedElapsed(selectedDayIndex) > 0);

  // Wall-clock start/end times for editable duration
  const [workoutStartTime, setWorkoutStartTime] = useState<Date | null>(null);
  const [workoutEndTime, setWorkoutEndTime] = useState<Date | null>(null);
  const [editingTime, setEditingTime] = useState<'start' | 'end' | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [lastEntryId, setLastEntryId] = useState<string | null>(null);

  // Scroll-wheel picker state
  const [pickerHour, setPickerHour] = useState(12);
  const [pickerMinute, setPickerMinute] = useState(0);
  const [pickerAmPm, setPickerAmPm] = useState<'AM' | 'PM'>('AM');
  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);
  const ampmScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    return workoutState.subscribe(setWorkoutFinished);
  }, []);

  // Re-sync timer state when switching days or when timer fires
  useEffect(() => {
    const sync = () => {
      const running = !!workoutState.getTimerStartedAt(selectedDayIndex);
      setTimerRunning(running);
      setTimerPaused(!running && workoutState.getTimerPausedElapsed(selectedDayIndex) > 0);
      setElapsed(workoutState.getElapsed(selectedDayIndex));
    };
    sync();
    const unsub = workoutState.subscribeTimer(sync);
    return unsub;
  }, [selectedDayIndex]);

  // Restore wall-clock start time from AsyncStorage on day change (survives app restarts)
  useEffect(() => {
    const inMemory = workoutState.getWallStartTime(selectedDayIndex);
    if (inMemory) {
      setWorkoutStartTime(new Date(inMemory));
    } else {
      workoutState.loadWallStartTime(selectedDayIndex).then(ts => {
        if (ts) setWorkoutStartTime(new Date(ts));
        else setWorkoutStartTime(null);
      });
    }
    setWorkoutEndTime(null);
  }, [selectedDayIndex]);

  // Initialise scroll-wheel picker columns when the modal opens
  useEffect(() => {
    if (!showTimePicker) return;
    const time = editingTime === 'start' ? (workoutStartTime ?? new Date()) : (workoutEndTime ?? new Date());
    const h24 = time.getHours();
    const ampm: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    const min = time.getMinutes();
    setPickerHour(h12);
    setPickerMinute(min);
    setPickerAmPm(ampm);
    setTimeout(() => {
      hourScrollRef.current?.scrollTo({ y: (h12 - 1) * PICK_ITEM_H, animated: false });
      minuteScrollRef.current?.scrollTo({ y: min * PICK_ITEM_H, animated: false });
      ampmScrollRef.current?.scrollTo({ y: (ampm === 'PM' ? 1 : 0) * PICK_ITEM_H, animated: false });
    }, 120);
  }, [showTimePicker, editingTime, workoutStartTime, workoutEndTime]);

  // Apply the chosen time when "Done" is pressed
  const applyTimePick = useCallback(() => {
    const h24 = pickerAmPm === 'PM'
      ? (pickerHour === 12 ? 12 : pickerHour + 12)
      : (pickerHour === 12 ? 0 : pickerHour);
    const base = editingTime === 'start' ? (workoutStartTime ?? new Date()) : (workoutEndTime ?? new Date());
    const date = new Date(base);
    date.setHours(h24, pickerMinute, 0, 0);
    const currentStart = workoutStartTime ?? new Date();
    const currentEnd = workoutEndTime ?? new Date();
    const newStart = editingTime === 'start' ? date : currentStart;
    const newEnd = editingTime === 'end' ? date : currentEnd;
    if (editingTime === 'start') setWorkoutStartTime(date);
    else setWorkoutEndTime(date);
    if (newEnd.getTime() > newStart.getTime()) {
      const secs = Math.floor((newEnd.getTime() - newStart.getTime()) / 1000);
      setFinishedDurations(prev => ({ ...prev, [selectedDayIndex]: secs }));
      if (lastEntryId) {
        const entry = workoutState.getJournalEntry(lastEntryId);
        if (entry) workoutState.updateJournalEntry({ ...entry, durationSecs: secs });
      }
    }
    setShowTimePicker(false);
  }, [pickerHour, pickerMinute, pickerAmPm, editingTime, workoutStartTime, workoutEndTime, selectedDayIndex, lastEntryId]);

  useEffect(() => {
    if (!timerRunning) return;
    const tick = () => setElapsed(workoutState.getElapsed(selectedDayIndex));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerRunning, selectedDayIndex]);

  // Rest timer / stopwatch state
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restMode, setRestMode] = useState<'timer' | 'stopwatch'>('timer');
  // Countdown timer
  const [countdownDuration, setCountdownDuration] = useState(60);
  const [countdownRemaining, setCountdownRemaining] = useState(60);
  const [countdownActive, setCountdownActive] = useState(false);
  const [editingDuration, setEditingDuration] = useState(false);
  const [editMins, setEditMins] = useState('01');
  const [editSecs, setEditSecs] = useState('00');
  // Stopwatch
  const [swElapsed, setSwElapsed] = useState(0);
  const [swRunning, setSwRunning] = useState(false);
  const swStartRef = useRef<number | null>(null);
  const swOffsetRef = useRef(0);

  useEffect(() => {
    if (!countdownActive) return;
    const id = setInterval(() => {
      setCountdownRemaining(prev => {
        if (prev <= 1) {
          setCountdownActive(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return countdownDuration;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [countdownActive, countdownDuration]);

  useEffect(() => {
    if (!swRunning) return;
    swStartRef.current = Date.now();
    const id = setInterval(() => {
      if (swStartRef.current) {
        setSwElapsed(swOffsetRef.current + Math.floor((Date.now() - swStartRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [swRunning]);

  const scrollRef = useRef<ScrollView>(null);
  const completeScale = useRef(new Animated.Value(0)).current;
  const completeOpacity = useRef(new Animated.Value(0)).current;
  const exerciseCache = useRef<Record<string, Exercise[]>>({}).current;

  // When prev data changes (e.g. journal entry saved), clear cache entries that have
  // no user-entered data so they reload with updated prev values. Entries where the
  // user has already typed reps/weight are preserved. Cache is never evicted while
  // a workout is active or has been completed this session.
  useEffect(() => {
    return workoutState.subscribePrev(() => {
      const isActive = workoutState.getActiveDay() !== null;
      const isCompleted = workoutState.finished;
      if (!isActive && !isCompleted) {
        Object.keys(exerciseCache).forEach(k => {
          const exercises = exerciseCache[k];
          const hasUserData = exercises?.some(ex =>
            ex.sets.some(s => s.reps > 0 || s.weight !== null || (s.hold ?? 0) > 0)
          );
          if (!hasUserData) {
            delete exerciseCache[k];
          }
        });
      }
      setPrevVersion(v => v + 1);
    });
  }, []);

  // When a journal entry is updated (e.g. edited in the journal screen), patch today's
  // exercise cache so the workout tab reflects the corrected values immediately.
  useEffect(() => {
    return workoutState.subscribeJournalUpdate((entry) => {
      const todayStr = new Date().toDateString();
      if (new Date(entry.date).toDateString() !== todayStr) return;
      for (let si = 0; si < entry.sessions.length; si++) {
        const cacheKey = `0-${si}`;
        const cached = exerciseCache[cacheKey];
        if (!cached) continue;
        const sessionData = entry.sessions[si];
        exerciseCache[cacheKey] = cached.map(ex => {
          const jEx = sessionData.exercises.find(e => e.name === ex.name);
          if (!jEx) return ex;
          return {
            ...ex,
            sets: ex.sets.map((s, si2) => {
              const js = jEx.sets[si2];
              if (!js) return s;
              return { ...s, reps: js.reps, weight: js.weight, hold: js.hold ?? 0 };
            }),
          };
        });
      }
      setPrevVersion(v => v + 1);
    });
  }, []);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (activeProgram) {
      workoutState.getCycleOffset(activeId, activeProgram.splitDays.length).then(setCycleOffset);
    }
  }, [activeId, activeProgram?.splitDays.length]));

  const workout = useMemo<DayWorkout>(() => {
    if (!activeProgram) return null;
    // Day 0 locked: build workout from the old (locked) program
    if (selectedDayIndex === 0 && isLocked) {
      const lockedProgram = programs.find(p => p.id === lockedToday!.programId);
      const splitDay = lockedProgram?.splitDays[lockedToday!.splitDayIndex];
      if (!splitDay || splitDay.type === 'rest') return null;
      return {
        program: lockedToday!.programName,
        dayLabel: lockedToday!.dayLabel,
        subtitle: `${getDayExerciseCount(splitDay)} exercises`,
        sessions: splitDay.sessions.map(s => ({
          label: s.label,
          exercises: s.exercises.map(e => ({
            name: e.name,
            mode: e.mode,
            targetReps: e.targetReps,
            sets: Array.from({ length: e.sets }, (_, i) => ({
              set: i + 1, reps: 0, weight: null, hold: 0,
              isWarmup: i < (e.warmupSets ?? 0),
            })),
          })),
        })),
      };
    }
    const override = dayOverrides[selectedDayIndex];
    if (override === 'rest') return null;
    // When locked, new program is offset by 1 (day 1 = tomorrow's slot)
    const n = activeProgram.splitDays.length;
    const naturalIdx = isLocked ? selectedDayIndex - 1 : selectedDayIndex;
    const splitIndex = typeof override === 'number' ? override : ((cycleOffset + naturalIdx) % n + n) % n;
    const splitDay = activeProgram.splitDays[splitIndex];
    if (!splitDay || splitDay.type === 'rest') return null;
    return {
      program: activeProgram.name,
      dayLabel: getDayLabel(splitDay),
      subtitle: `${getDayExerciseCount(splitDay)} exercises`,
      sessions: splitDay.sessions.map(s => ({
        label: s.label,
        exercises: s.exercises.map(e => ({
          name: e.name,
          mode: e.mode,
          targetReps: e.targetReps,
          sets: Array.from({ length: e.sets }, (_, i) => ({
            set: i + 1, reps: 0, weight: null, hold: 0,
            isWarmup: i < (e.warmupSets ?? 0),
          })),
        })),
      })),
    };
  }, [activeProgram?.id, selectedDayIndex, dayOverrides[selectedDayIndex], isLocked, lockedToday?.programId, cycleOffset]);

  const prevActiveId = useRef(activeId);
  const prevWorkoutLabelRef = useRef<string | null>(null);
  useEffect(() => {
    // If program changed, load new program's cycle offset and clear cache
    if (prevActiveId.current !== activeId) {
      prevActiveId.current = activeId;
      prevWorkoutLabelRef.current = null;
      if (activeProgram) {
        workoutState.getCycleOffset(activeId, activeProgram.splitDays.length).then(setCycleOffset);
      }
      // If switching to a different program while today's workout is locked, preserve
      // the day-0 cache (completed workout data with entered values). Wipe everything else.
      Object.keys(exerciseCache).forEach(k => {
        if (isLocked && k.startsWith('0-')) return;
        delete exerciseCache[k];
      });
      // If switching back to the program that completed today, drop the lock
      if (lockedToday && lockedToday.programId === activeId) {
        setLockedToday(null);
      }
      setCalendarIndex(PAST_DAYS);
      setSelectedSessionByDay({});
      // Fall through to the exercise-loading section below. The label-change check
      // (prevWorkoutLabelRef.current === null after a program switch) ensures any stale
      // cache is cleared and exercises are loaded from the fresh workout.
      // Do NOT return early: if the new program's cycleOffset is the same value already
      // in state, getCycleOffset resolves as a no-op and the effect would never re-run.
    }

    const cacheKey = `${selectedDayIndex}-${selectedSessionIndex}`;
    const currentSession = workout?.sessions[selectedSessionIndex];

    // If the workout label changed (cycleOffset loaded async after initial render),
    // the cached exercises belong to a different day — clear them so we reload correctly.
    // Also handles the null→label transition after a program switch.
    const currentLabel = workout?.dayLabel ?? null;
    if (currentLabel !== prevWorkoutLabelRef.current) {
      Object.keys(exerciseCache)
        .filter(k => k.startsWith(`${selectedDayIndex}-`))
        .forEach(k => delete exerciseCache[k]);
    }
    prevWorkoutLabelRef.current = currentLabel;

    if (exerciseCache[cacheKey]) {
      // Sync targetReps from the current program definition into cached exercises
      // so edits made in Edit Program are reflected without resetting entered weights/reps
      const cached = exerciseCache[cacheKey];
      const synced = cached.map((ex, i) => ({
        ...ex,
        targetReps: currentSession?.exercises[i]?.targetReps,
      }));
      exerciseCache[cacheKey] = synced;
      setExercises(synced);
    } else {
      // If today's workout is already finished, restore actual logged values from today's journal entry
      // and use the PREVIOUS journal entry (before today) for the "prev" column
      let todaySessionData: ReturnType<typeof workoutState.getJournalLog>[number]['sessions'][number] | undefined;
      let prevExercises = currentSession ? workoutState.getPrev(currentSession.label) : undefined;
      if (workoutState.finished && selectedDayIndex === 0 && currentSession) {
        const todayStr = new Date().toDateString();
        const journal = workoutState.getJournalLog(); // newest first
        const todayEntry = journal.find(e => new Date(e.date).toDateString() === todayStr);
        todaySessionData = todayEntry?.sessions.find(s => s.label === currentSession.label);
        // Find the most recent journal entry BEFORE today for this session label, so "prev"
        // shows last week's data rather than today's just-completed workout
        const prevEntry = journal.find(e => new Date(e.date).toDateString() !== todayStr && e.sessions.some(s => s.label === currentSession.label));
        if (prevEntry) {
          const prevSession = prevEntry.sessions.find(s => s.label === currentSession.label);
          if (prevSession) prevExercises = prevSession.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ reps: s.reps, weight: s.weight ?? 0, hold: s.hold ?? 0 })), mode: ex.mode }));
        } else if (todaySessionData) {
          // Only entry is today's — clear prev so it doesn't show today's data
          prevExercises = undefined;
        }
      }

      const initial = currentSession?.exercises.map(e => {
        const prevEx = prevExercises?.find(p => p.name === e.name);
        const todayEx = todaySessionData?.exercises.find(je => je.name === e.name);
        return {
          ...e,
          sets: e.sets.map((s, si) => {
            const todaySet = todayEx?.sets[si];
            return {
              ...s,
              reps: todaySet?.reps ?? s.reps,
              weight: todaySet?.weight ?? s.weight,
              hold: todaySet?.hold ?? s.hold,
              prevReps: prevEx?.sets[si]?.reps ?? undefined,
              prevWeight: prevEx?.sets[si]?.weight ?? undefined,
              prevHold: prevEx?.sets[si]?.hold ?? undefined,
              fillKey: todaySet ? 1 : 0,
            };
          }),
        };
      }) ?? [];
      exerciseCache[cacheKey] = initial;
      setExercises(initial);
    }
  }, [selectedDayIndex, selectedSessionIndex, workout, activeId, prevVersion, activeProgram?.splitDays]);

  const updateExercises = (updater: Exercise[] | ((prev: Exercise[]) => Exercise[])) => {
    setExercises(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      exerciseCache[`${selectedDayIndex}-${selectedSessionIndex}`] = next;
      return next;
    });
  };

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: isDark ? colors.gradientStart : '#c3ced6' }} />;

  if (!activeProgram) {
    const hasPrograms = programs.filter(p => !p.archived).length > 0;
    return (
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.container} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.gradientStart} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
          <Ionicons name="barbell-outline" size={48} color={colors.secondaryText} />
          <Text style={{ fontSize: 18, fontFamily: 'Arimo_700Bold', color: colors.primaryText, marginTop: 16, textAlign: 'center' }}>
            {hasPrograms ? 'No Active Program' : 'No Programs Yet'}
          </Text>
          <Text style={{ fontSize: 14, fontFamily: 'Arimo_400Regular', color: colors.secondaryText, marginTop: 8, textAlign: 'center' }}>
            {hasPrograms ? 'Select a program to get started' : 'Create a program to start logging workouts'}
          </Text>
          <BounceButton style={{ backgroundColor: '#47DDFF', borderRadius: 16, height: 48, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', marginTop: 20 }} onPress={() => router.push(hasPrograms ? '/programs' : '/create-program')}>
            <Text style={{ fontSize: 16, fontFamily: 'Arimo_700Bold', color: '#1C1C1E' }}>{hasPrograms ? 'Go to Programs' : 'Create a Program'}</Text>
          </BounceButton>
        </View>
      </LinearGradient>
    );
  }

  const selectedDate = calendarDays[calendarIndex]?.date ?? new Date();
  const isToday = calendarIndex === todayIndex;
  const pastEntryForDate = isViewingPast
    ? workoutState.getJournalLog().find(e => new Date(e.date).toDateString() === selectedDate.toDateString())
    : undefined;

  const dateLabel = isViewingPast
    ? (selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + (pastEntryForDate ? `, ${pastEntryForDate.dayLabel}` : ''))
    : isToday
      ? workout ? `Today, ${workout.dayLabel}` : 'Today'
      : workout
        ? `${selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}, ${workout.dayLabel}`
        : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const displayElapsed = workoutFinished ? (finishedDurations[selectedDayIndex] ?? elapsed) : elapsed;
  const hrs = Math.floor(displayElapsed / 3600);
  const mins = Math.floor((displayElapsed % 3600) / 60);
  const secs = displayElapsed % 60;
  const timerText = hrs > 0
    ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.gradientStart} />

      {/* Journal Button - Top Right (left of rest timer) */}
      <TouchableOpacity
        style={[styles.journalHeaderBtn, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/journal'); }}
        activeOpacity={0.7}
      >
        <BookOpenIcon size={22} color={colors.primaryText} />
      </TouchableOpacity>

      {/* Rest Timer Button - Top Right */}
      <TouchableOpacity
        style={[styles.restTimerBtn, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowRestTimer(true); }}
        activeOpacity={0.7}
      >
        <Ionicons name="timer-outline" size={28} color={colors.primaryText} />
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Workout</Text>
        <Text style={styles.dateLabel}>{dateLabel}</Text>

        <View style={styles.calendarContainer}>
          <CalendarStrip
            selectedIndex={calendarIndex}
            onSelect={(i) => { setCalendarIndex(i); if (i < PAST_DAYS) setPastSessionIndex(0); }}
            accentColor={activeProgram?.color ?? '#47DDFF'}
            days={calendarDays}
            todayIndex={todayIndex}
            lockedTodayColor={isLocked ? lockedToday!.programColor : undefined}
            loggedDateColors={loggedDateColors}
            onJournalPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/journal'); }}
          />
        </View>

        {/* Past Day View */}
        {isViewingPast && (
          pastEntryForDate ? (
            <>
              {/* View in Journal button — top */}
              <BounceButton
                style={[styles.pastDayBtn, { backgroundColor: `${resolveEntryColor(pastEntryForDate)}18`, borderColor: resolveEntryColor(pastEntryForDate), marginBottom: 10 }]}
                onPress={() => router.push(`/journal?entryId=${pastEntryForDate.id}`)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <BookOpenIcon size={14} color={colors.primaryText} />
                  <Text style={[styles.pastDayBtnText, { color: colors.primaryText }]}>View / Edit in Journal</Text>
                </View>
              </BounceButton>

              {/* Duration / volume row */}
              <View style={[styles.timerRow, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
                <Ionicons name="checkmark-circle" size={18} color={resolveEntryColor(pastEntryForDate)} />
                <Text style={[styles.timerStartText, { color: resolveEntryColor(pastEntryForDate) }]}>Workout Complete</Text>
                {pastEntryForDate.durationSecs > 0 && (
                  <Text style={[styles.timerText, { color: colors.primaryText }]}>
                    {(() => { const s = pastEntryForDate.durationSecs; const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60; return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; })()}
                  </Text>
                )}
              </View>

              {/* Program badge */}
              <View style={styles.programRow}>
                <View style={[styles.programBadge, { backgroundColor: `${resolveEntryColor(pastEntryForDate)}25`, borderColor: resolveEntryColor(pastEntryForDate) }]}>
                  <Text style={[styles.programBadgeText, { color: colors.primaryText }]}>{pastEntryForDate.programName}</Text>
                </View>
              </View>

              {/* Session tabs */}
              {pastEntryForDate.sessions.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
                  {pastEntryForDate.sessions.map((session, si) => {
                    const isActive = si === pastSessionIndex;
                    return (
                      <TouchableOpacity
                        key={si}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPastSessionIndex(si); }}
                        style={[
                          styles.sessionTab,
                          { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
                          isActive && { backgroundColor: `${resolveEntryColor(pastEntryForDate)}15`, borderColor: resolveEntryColor(pastEntryForDate) },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.sessionTabText, { color: isActive ? colors.primaryText : colors.secondaryText }, isActive && { fontFamily: 'Arimo_700Bold' }]}>
                          {session.label || `Session ${si + 1}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Exercises (read-only) */}
              {(() => {
                const session = pastEntryForDate.sessions[Math.min(pastSessionIndex, pastEntryForDate.sessions.length - 1)];
                if (!session) return null;
                return session.exercises.map((ex, i) => {
                  const exData: Exercise = {
                    name: ex.name,
                    mode: ex.mode,
                    sets: ex.sets.map((s, si) => ({ set: si + 1, reps: s.reps, weight: s.weight, hold: s.hold, isWarmup: s.isWarmup })),
                  };
                  return (
                    <ExerciseCard
                      key={`${ex.name}-${i}`}
                      exercise={exData}
                      index={i}
                      mode={ex.mode}
                      accentColor={resolveEntryColor(pastEntryForDate)}
                      readOnly={true}
                      isFirst={i === 0}
                      isLast={i === session.exercises.length - 1}
                      onAddSet={() => {}} onRemoveSet={() => {}} onUpdateSet={() => {}}
                      onToggleWarmup={() => {}} onToggleMode={() => {}}
                      onShowExerciseList={() => {}} onRemoveExercise={() => {}}
                      onFillPrev={() => {}}
                    />
                  );
                });
              })()}

            </>
          ) : (
            <View style={[styles.pastDayCard, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={36} color={colors.tertiaryText} />
              <Text style={[styles.pastDayEmptyText, { color: colors.secondaryText }]}>No workout logged</Text>
              <BounceButton
                style={[styles.pastDayBtn, { backgroundColor: `${accentColor}18`, borderColor: accentColor, marginTop: 14 }]}
                onPress={() => {
                  const dateTs = calendarDays[calendarIndex]?.date?.getTime();
                  router.push(dateTs ? `/journal?logDate=${dateTs}` : '/journal');
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <BookOpenIcon size={14} color={accentColor} />
                  <Text style={[styles.pastDayBtnText, { color: accentColor }]}>Log in Journal</Text>
                </View>
              </BounceButton>
            </View>
          )
        )}

        {/* Timer */}
        {!isViewingPast && workout && (() => {
          const otherActiveDay = workoutState.getActiveDay();
          const anotherDayActive = otherActiveDay !== null && otherActiveDay !== selectedDayIndex;
          return (
            timerRunning ? (
              <TouchableOpacity
                style={[styles.timerRow, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  workoutState.pauseTimer(selectedDayIndex);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="time-outline" size={18} color={accentColor} />
                <Text style={[styles.timerText, { color: colors.primaryText }]}>{timerText}</Text>
                {workoutStartTime && (
                  <Text style={{ fontSize: 11, fontFamily: 'Arimo_400Regular', color: colors.tertiaryText, marginLeft: 'auto' }}>
                    Started {workoutStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
                <Ionicons name="pause" size={16} color={colors.secondaryText} style={{ marginLeft: workoutStartTime ? 6 : 4 }} />
              </TouchableOpacity>
            ) : timerPaused && !workoutFinished ? (
              <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'flex-start', marginBottom: 12 }}>
                <View style={[styles.timerRow, { marginBottom: 0, alignSelf: 'stretch' }, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
                  <Ionicons name="pause-circle-outline" size={18} color={colors.secondaryText} />
                  <Text style={[styles.timerText, { color: colors.primaryText }]}>{timerText}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.timerRow, { marginBottom: 0, alignSelf: 'stretch', paddingHorizontal: 10, gap: 5, backgroundColor: `${accentColor}25`, borderColor: accentColor }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    workoutState.startTimer(selectedDayIndex);
                    setWorkoutStartTime(prev => prev ?? new Date());
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="play" size={14} color={colors.primaryText} />
                  <Text style={[styles.timerStartText, { color: colors.primaryText }]}>Continue</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.timerRow, { marginBottom: 0, alignSelf: 'stretch', paddingHorizontal: 10, gap: 5, backgroundColor: colors.cardSolid, borderColor: colors.border }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Alert.alert(
                      'Reset Workout',
                      'This will restore all exercises to their original state and clear all entered data.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Reset workout',
                          style: 'destructive',
                          onPress: () => {
                            // If a journal entry was already logged (e.g. all sessions done but
                            // user re-opened the day), delete it along with the workout log & history
                            const dayDate = calendarDays[calendarIndex]?.date ?? new Date();
                            let deletedEntryId: string | null = lastEntryId;
                            if (lastEntryId) {
                              workoutState.deleteJournalEntry(lastEntryId);
                            } else {
                              const existing = workoutState.getJournalLog().find(e => new Date(e.date).toDateString() === dayDate.toDateString());
                              if (existing) { workoutState.deleteJournalEntry(existing.id); deletedEntryId = existing.id; }
                            }
                            workoutState.deleteWorkoutLog(dayDate);
                            workoutState.deleteHistoryForDate(dayDate);
                            // Remove any workouts shared to communities today
                            if (deletedEntryId && user) {
                              const todayStr = dayDate.toDateString();
                              const allCommunities = [...ownedCommunities, ...joinedCommunities];
                              allCommunities.forEach(c => {
                                c.sharedWorkouts.filter(w => w.sharedBy === user.uid && new Date(w.sharedAt).toDateString() === todayStr).forEach(w => removeSharedWorkout(c.id, w.id));
                              });
                            }
                            // Restore prev stats for any sessions already saved mid-workout
                            workout?.sessions.forEach(s => workoutState.restorePrev(s.label));
                            workoutState.resetTimer(selectedDayIndex);
                            setWorkoutStartTime(null);
                            setWorkoutEndTime(null);
                            setLastEntryId(null);
                            Object.keys(exerciseCache)
                              .filter(k => k.startsWith(`${selectedDayIndex}-`))
                              .forEach(k => delete exerciseCache[k]);
                            setFinishedDurations(prev => { const n = { ...prev }; delete n[selectedDayIndex]; return n; });
                            setSessionFinished(prev => {
                              const n = { ...prev };
                              Object.keys(n).filter(k => k.startsWith(`${selectedDayIndex}-`)).forEach(k => delete n[k]);
                              return n;
                            });
                            setExerciseNotes(prev => {
                              const n = { ...prev };
                              Object.keys(n).filter(k => k.startsWith(`${selectedDayIndex}-`)).forEach(k => delete n[k]);
                              return n;
                            });
                            const currentSession = workout?.sessions[selectedSessionIndex];
                            const prevExercises = currentSession ? workoutState.getPrev(currentSession.label) : undefined;
                            const resetExercises = currentSession?.exercises.map(e => {
                              const prevEx = prevExercises?.find(p => p.name === e.name);
                              return {
                                ...e,
                                sets: e.sets.map((s, si) => ({
                                  ...s,
                                  prevReps: prevEx?.sets[si]?.reps ?? undefined,
                                  prevWeight: prevEx?.sets[si]?.weight ?? undefined,
                                  prevHold: prevEx?.sets[si]?.hold ?? undefined,
                                })),
                              };
                            }) ?? [];
                            exerciseCache[`${selectedDayIndex}-${selectedSessionIndex}`] = resetExercises;
                            setExercises(resetExercises);
                          },
                        },
                      ],
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh" size={14} color={colors.secondaryText} />
                  <Text style={[styles.timerStartText, { color: colors.secondaryText }]}>Reset workout</Text>
                </TouchableOpacity>
              </View>
            ) : !workoutFinished ? (
              anotherDayActive ? (
                <View style={[styles.timerRow, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed" size={14} color={colors.tertiaryText} />
                  <Text style={[styles.timerStartText, { color: colors.tertiaryText }]}>Another workout is in progress</Text>
                </View>
              ) : futureReadOnly ? (
                <View style={[styles.timerRow, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed" size={14} color={colors.tertiaryText} />
                  <Text style={[styles.timerStartText, { color: colors.tertiaryText }]}>Reset today's workout to train this day</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.timerRow, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    maybePromptMakeToday(() => { workoutState.startTimer(selectedDayIndex); setWorkoutStartTime(prev => prev ?? new Date()); });
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="play" size={16} color={accentColor} />
                  <Text style={[styles.timerStartText, { color: colors.primaryText }]}>Start Workout</Text>
                </TouchableOpacity>
              )
            ) : (
              <>
                {/* View / Edit in Journal button */}
                <BounceButton
                  style={[styles.pastDayBtn, { backgroundColor: `${accentColor}18`, borderColor: accentColor, marginBottom: 10 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const todayEntry = lastEntryId
                      ? { id: lastEntryId }
                      : workoutState.getJournalLog().find(e => new Date(e.date).toDateString() === new Date().toDateString());
                    router.push(todayEntry ? `/journal?entryId=${todayEntry.id}` : '/journal');
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                    <BookOpenIcon size={14} color={colors.primaryText} />
                    <Text style={[styles.pastDayBtnText, { color: colors.primaryText }]}>View / Edit in Journal</Text>
                  </View>
                </BounceButton>

                {/* Workout Complete + duration */}
                <View style={[styles.timerRow, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}>
                  <Ionicons name="checkmark-circle" size={18} color={accentColor} />
                  <Text style={[styles.timerStartText, { color: accentColor }]}>Workout Complete</Text>
                  <Text style={[styles.timerText, { color: colors.primaryText }]}>{timerText}</Text>
                </View>

                {/* Reset workout */}
                <TouchableOpacity
                  style={[styles.timerRow, { backgroundColor: colors.cardSolid, borderColor: colors.border }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const doFullReset = (clearLock: boolean) => {
                      const dayDate = calendarDays[calendarIndex]?.date ?? new Date();
                      let deletedEntryId: string | null = lastEntryId;
                      if (lastEntryId) {
                        workoutState.deleteJournalEntry(lastEntryId);
                      } else {
                        const existing = workoutState.getJournalLog().find(e => new Date(e.date).toDateString() === dayDate.toDateString());
                        if (existing) { workoutState.deleteJournalEntry(existing.id); deletedEntryId = existing.id; }
                      }
                      workoutState.deleteWorkoutLog(dayDate);
                      workoutState.deleteHistoryForDate(dayDate);
                      // Remove any workouts shared to communities today
                      if (user) {
                        const todayStr = dayDate.toDateString();
                        const allCommunities = [...ownedCommunities, ...joinedCommunities];
                        allCommunities.forEach(c => {
                          c.sharedWorkouts.filter(w => w.sharedBy === user.uid && new Date(w.sharedAt).toDateString() === todayStr).forEach(w => removeSharedWorkout(c.id, w.id));
                        });
                      }
                      workout?.sessions.forEach(s => workoutState.restorePrev(s.label));
                      workoutState.setFinished(false);
                      workoutState.resetTimer(selectedDayIndex);
                      setWorkoutStartTime(null);
                      setWorkoutEndTime(null);
                      setLastEntryId(null);
                      Object.keys(exerciseCache)
                        .filter(k => k.startsWith(`${selectedDayIndex}-`))
                        .forEach(k => delete exerciseCache[k]);
                      setFinishedDurations(prev => { const n = { ...prev }; delete n[selectedDayIndex]; return n; });
                      setSessionFinished(prev => {
                        const n = { ...prev };
                        Object.keys(n).filter(k => k.startsWith(`${selectedDayIndex}-`)).forEach(k => delete n[k]);
                        return n;
                      });
                      setExerciseNotes(prev => {
                        const n = { ...prev };
                        Object.keys(n).filter(k => k.startsWith(`${selectedDayIndex}-`)).forEach(k => delete n[k]);
                        return n;
                      });
                      setShowComplete(false);
                      completeScale.setValue(0);
                      completeOpacity.setValue(0);
                      if (clearLock) {
                        // Clearing the lock: let the effect rebuild from the new (active) program's
                        // workout after setLockedToday(null) triggers a re-render. Don't populate
                        // cache here or the stale locked workout would load instead.
                        setLockedToday(null);
                      } else {
                        // Rebuild exercises from the current (locked) workout with prev hints
                        const currentSession = workout?.sessions[selectedSessionIndex];
                        const prevExercises = currentSession ? workoutState.getPrev(currentSession.label) : undefined;
                        const resetExercises = currentSession?.exercises.map(e => {
                          const prevEx = prevExercises?.find(p => p.name === e.name);
                          return {
                            ...e,
                            sets: e.sets.map((s, si) => ({
                              ...s,
                              prevReps: prevEx?.sets[si]?.reps ?? undefined,
                              prevWeight: prevEx?.sets[si]?.weight ?? undefined,
                              prevHold: prevEx?.sets[si]?.hold ?? undefined,
                            })),
                          };
                        }) ?? [];
                        exerciseCache[`${selectedDayIndex}-${selectedSessionIndex}`] = resetExercises;
                        setExercises(resetExercises);
                      }
                    };

                    if (isViewingLockedToday) {
                      // Completed under old program — offer to keep it or switch to active program
                      const newProgramName = activeProgram?.name ?? 'new program';
                      const oldProgramName = lockedToday!.programName;
                      Alert.alert(
                        'Reset Workout',
                        `This workout was completed under "${oldProgramName}". What would you like to do?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: `Redo "${oldProgramName}" workout`,
                            onPress: () => doFullReset(false), // keep the lock, redo old program
                          },
                          {
                            text: `Switch to "${newProgramName}"`,
                            style: 'destructive',
                            onPress: () => doFullReset(true), // clear lock, new program takes over today
                          },
                        ],
                      );
                    } else {
                      Alert.alert(
                        'Reset Workout',
                        'This will restore all exercises to their original state and clear all entered data.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Reset workout', style: 'destructive', onPress: () => doFullReset(false) },
                        ],
                      );
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh" size={18} color={colors.secondaryText} />
                  <Text style={[styles.timerText, { color: colors.secondaryText }]}>Reset workout</Text>
                </TouchableOpacity>
              </>
            )
          );
        })()}

        {!isViewingPast && workout ? (
          <>
            <View style={styles.programRow}>
              <View style={[styles.programBadge, { backgroundColor: `${accentColor}25`, borderColor: accentColor }]}>
                <Text style={[styles.programBadgeText, { color: colors.primaryText }]}>{workout.program}</Text>
              </View>
              <View style={[styles.exerciseCountBadge, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder, marginLeft: 10 }]}>
                <Ionicons name="barbell-outline" size={14} color={colors.secondaryText} />
                <Text style={[styles.exerciseCountText, { color: colors.secondaryText }]}>{exercises.length}</Text>
              </View>
            </View>

            {/* Session Tabs */}
            {workout.sessions.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
                {workout.sessions.map((session, si) => {
                  const sKey = `${selectedDayIndex}-${si}`;
                  const isActive = si === selectedSessionIndex;
                  const isDone = !!sessionFinished[sKey];
                  return (
                    <TouchableOpacity
                      key={si}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedSessionIndex(si); }}
                      style={[
                        styles.sessionTab,
                        { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
                        isActive && { backgroundColor: `${accentColor}15`, borderColor: accentColor },
                      ]}
                      activeOpacity={0.7}
                    >
                      {isDone && <Ionicons name="checkmark-circle" size={16} color={accentColor} style={{ marginRight: 4 }} />}
                      <Text style={[styles.sessionTabText, { color: isActive ? colors.primaryText : colors.secondaryText }, isActive && { fontFamily: 'Arimo_700Bold' }]}>
                        {session.label || `Session ${si + 1}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {exercises.map((exercise, i) => (
              <ExerciseCard
                key={`${exercise.name}-${i}`}
                exercise={exercise}
                index={i}
                mode={exercise.mode ?? 'reps'}
                onToggleMode={() => {
                  const newMode = (exercise.mode ?? 'reps') === 'reps' ? 'hold' : 'reps';
                  updateExercises(prev => prev.map((ex, ei) => ei !== i ? ex : { ...ex, mode: newMode }));
                  if (activeProgram) {
                    const splitDays = [...activeProgram.splitDays];
                    const splitIdx = getEffectiveSplitIndex(selectedDayIndex);
                    const day = splitDays[splitIdx];
                    if (day?.type === 'training') {
                      const sessions = [...day.sessions];
                      const exs = [...sessions[selectedSessionIndex].exercises];
                      exs[i] = { ...exs[i], mode: newMode };
                      sessions[selectedSessionIndex] = { ...sessions[selectedSessionIndex], exercises: exs };
                      splitDays[splitIdx] = { ...day, sessions };
                      updateProgram(activeProgram.id, activeProgram.name, activeProgram.color, splitDays);
                    }
                  }
                }}
                onShowExerciseList={() => { setChangeExerciseIndex(i); }}
                onRemoveExercise={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  updateExercises(prev => prev.filter((_, ei) => ei !== i));
                  if (activeProgram) {
                    const splitDays = [...activeProgram.splitDays];
                    const splitIdx = getEffectiveSplitIndex(selectedDayIndex);
                    const day = splitDays[splitIdx];
                    if (day?.type === 'training') {
                      const sessions = [...day.sessions];
                      const exs = sessions[selectedSessionIndex].exercises.filter((_, ei) => ei !== i);
                      sessions[selectedSessionIndex] = { ...sessions[selectedSessionIndex], exercises: exs };
                      splitDays[splitIdx] = { ...day, sessions };
                      updateProgram(activeProgram.id, activeProgram.name, activeProgram.color, splitDays);
                    }
                  }
                }}
                onToggleWarmup={(setIndex) => {
                  updateExercises(prev => prev.map((ex, ei) => {
                    if (ei !== i) return ex;
                    return { ...ex, sets: ex.sets.map((s, si) => si === setIndex ? { ...s, isWarmup: !s.isWarmup } : s) };
                  }));
                }}
                onAddSet={() => {
                  updateExercises(prev => prev.map((ex, ei) => {
                    if (ei !== i) return ex;
                    const lastSet = ex.sets[ex.sets.length - 1];
                    return { ...ex, sets: [...ex.sets, { set: ex.sets.length + 1, reps: 0, weight: null, hold: 0, prevReps: lastSet?.prevReps, prevWeight: lastSet?.prevWeight, prevHold: lastSet?.prevHold }] };
                  }));
                }}
                onRemoveSet={() => {
                  updateExercises(prev => prev.map((ex, ei) => {
                    if (ei !== i || ex.sets.length <= 1) return ex;
                    return { ...ex, sets: ex.sets.slice(0, -1) };
                  }));
                }}
                onUpdateSet={(setIndex, field, value) => {
                  if (field === 'weight') {
                    const weightNum = value === '' ? null : parseFloat(value);
                    if (weightNum !== null && isNaN(weightNum)) return;
                    updateExercises(prev => prev.map((ex, ei) => {
                      if (ei !== i) return ex;
                      return { ...ex, sets: ex.sets.map((s, si) => si === setIndex ? { ...s, weight: weightNum } : s) };
                    }));
                    return;
                  }
                  const num = value === '' ? 0 : parseFloat(value);
                  if (isNaN(num)) return;
                  updateExercises(prev => {
                    const next = prev.map((ex, ei) => {
                      if (ei !== i) return ex;
                      return { ...ex, sets: ex.sets.map((s, si) => si === setIndex ? { ...s, [field]: num } : s) };
                    });
                    // Auto-start workout timer when first set is completed (only if no other day active)
                    if (!workoutState.getTimerStartedAt(selectedDayIndex) && workoutState.getTimerPausedElapsed(selectedDayIndex) === 0) {
                      const otherDay = workoutState.getActiveDay();
                      if (otherDay === null || otherDay === selectedDayIndex) {
                        const updatedSet = next[i].sets[setIndex];
                        const isHoldMode = next[i].mode === 'hold';
                        const setComplete = isHoldMode
                          ? (updatedSet.hold ?? 0) > 0
                          : updatedSet.reps > 0;
                        if (setComplete) maybePromptMakeToday(() => { workoutState.startTimer(selectedDayIndex); setWorkoutStartTime(prev => prev ?? new Date()); });
                      }
                    }
                    return next;
                  });
                }}
                isFirst={i === 0}
                isLast={i === exercises.length - 1}
                accentColor={accentColor}
                targetReps={exercise.targetReps}
                readOnly={futureReadOnly || (workoutFinished && isToday && !isViewingPast)}
                note={exerciseNotes[`${selectedDayIndex}-${selectedSessionIndex}-${i}`] || ''}
                onNoteChange={(text) => setExerciseNotes(prev => ({ ...prev, [`${selectedDayIndex}-${selectedSessionIndex}-${i}`]: text }))}
                onMoveUp={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  updateExercises(prev => {
                    const next = [...prev];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    return next;
                  });
                }}
                onMoveDown={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  updateExercises(prev => {
                    const next = [...prev];
                    [next[i], next[i + 1]] = [next[i + 1], next[i]];
                    return next;
                  });
                }}
                onFillPrev={(setIndex) => {
                  const doFill = () => updateExercises(prev => prev.map((ex, ei) => {
                    if (ei !== i) return ex;
                    return {
                      ...ex,
                      sets: ex.sets.map((s, si) => {
                        if (si !== setIndex) return s;
                        const isHoldMode = ex.mode === 'hold';
                        return {
                          ...s,
                          reps: isHoldMode ? s.reps : (s.prevReps ?? s.reps),
                          hold: isHoldMode ? (s.prevHold ?? s.hold) : s.hold,
                          weight: s.prevWeight != null ? s.prevWeight : s.weight,
                          fillKey: (s.fillKey ?? 0) + 1,
                        };
                      }),
                    };
                  }));
                  // Auto-start workout timer on first fill if not already running
                  if (!workoutState.getTimerStartedAt(selectedDayIndex) && workoutState.getTimerPausedElapsed(selectedDayIndex) === 0) {
                    const otherDay = workoutState.getActiveDay();
                    if (otherDay === null || otherDay === selectedDayIndex) {
                      maybePromptMakeToday(() => { workoutState.startTimer(selectedDayIndex); setWorkoutStartTime(prev => prev ?? new Date()); }, doFill);
                      return;
                    }
                  }
                  doFill();
                }}
                onShowInfo={() => setInfoExerciseName(exercise.name)}
              />
            ))}

            {!futureReadOnly && (
              <TouchableOpacity
                style={[styles.addExerciseBtn, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAddingExercise(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={18} color={colors.primaryText} />
                <Text style={[styles.addExerciseBtnText, { color: colors.primaryText }]}>Add Exercise</Text>
              </TouchableOpacity>
            )}

            {!futureReadOnly && <BounceButton style={[styles.finishButton, { backgroundColor: accentColor }, !timerRunning && !timerPaused && !workoutFinished && finishedDurations[selectedDayIndex] === undefined && { opacity: 0.4 }]} onPress={() => {
              if (!workout) return;
              const currentSession = workout.sessions[selectedSessionIndex];

              // Block finishing if workout hasn't started yet
              if (!timerRunning && !timerPaused && !workoutFinished && finishedDurations[selectedDayIndex] === undefined) return;

              if (workoutFinished) {
                // Just saving changes after already finished
                if (currentSession) {
                  const exerciseData = exercises.map(e => ({ name: e.name, mode: e.mode, sets: e.sets.map(s => ({ reps: s.reps, weight: s.weight ?? 0, hold: s.hold ?? 0 })) }));
                  workoutState.savePrev(currentSession.label, exerciseData);
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                return;
              }

              // Check for incomplete sets
              const hasIncomplete = exercises.some(ex =>
                ex.sets.some(s => {
                  const isHold = (ex.mode ?? 'reps') === 'hold';
                  return isHold ? ((s.hold ?? 0) === 0) : (s.reps === 0);
                })
              );
              if (hasIncomplete && !showIncompleteWarning) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                setShowIncompleteWarning(true);
                return;
              }
              setShowIncompleteWarning(false);

              // Save prev data for current session
              if (currentSession) {
                const exerciseData = exercises.map(e => ({ name: e.name, mode: e.mode, sets: e.sets.map(s => ({ reps: s.reps, weight: s.weight ?? 0, hold: s.hold ?? 0 })) }));
                workoutState.savePrev(currentSession.label, exerciseData);
              }

              // Mark this session as finished
              const sessionKey = `${selectedDayIndex}-${selectedSessionIndex}`;
              const newSessionFinished = { ...sessionFinished, [sessionKey]: true };
              setSessionFinished(newSessionFinished);

              // Check if ALL sessions are done
              const allDone = workout.sessions.every((_, si) =>
                si === selectedSessionIndex || newSessionFinished[`${selectedDayIndex}-${si}`]
              );

              if (allDone) {
                // Clear cache for other days so they pick up new prev data
                Object.keys(exerciseCache).forEach(key => {
                  if (!key.startsWith(`${selectedDayIndex}-`)) {
                    delete exerciseCache[key];
                  }
                });

                // Log workout volume & duration
                const allCachedExercises: Exercise[] = [];
                for (let si = 0; si < workout.sessions.length; si++) {
                  const cached = exerciseCache[`${selectedDayIndex}-${si}`];
                  if (cached) allCachedExercises.push(...cached);
                }
                const totalVolume = allCachedExercises.reduce((sum, ex) => {
                  if (ex.mode === 'hold') return sum;
                  for (const s of ex.sets) sum += s.reps * (s.weight ?? 0);
                  return sum;
                }, 0);
                const endTime = new Date();
                setWorkoutEndTime(endTime);
                const startTime = workoutStartTime ?? new Date(Date.now() - workoutState.getElapsed(selectedDayIndex) * 1000);
                if (!workoutStartTime) setWorkoutStartTime(startTime);
                const durationSecs = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));
                const entryId = String(Date.now());
                setLastEntryId(entryId);
                workoutState.logJournalEntry({
                  id: entryId,
                  date: Date.now(),
                  programName: workout.program,
                  programId: isViewingLockedToday ? lockedToday!.programId : activeId,
                  programColor: accentColor,
                  dayLabel: workout.dayLabel,
                  durationSecs,
                  totalVolume,
                  sessions: workout.sessions.map((s, si) => {
                    const cached = exerciseCache[`${selectedDayIndex}-${si}`];
                    return {
                      label: s.label,
                      exercises: (cached ?? s.exercises).map(e => ({
                        name: e.name,
                        mode: e.mode ?? 'reps',
                        sets: e.sets.map(set => ({
                          reps: set.reps,
                          weight: set.weight,
                          hold: set.hold ?? 0,
                          isWarmup: set.isWarmup ?? false,
                        })),
                      })),
                    };
                  }),
                });
                setFinishedDurations(prev => ({ ...prev, [selectedDayIndex]: durationSecs }));
                workoutState.stopTimer(selectedDayIndex);
                workoutState.setFinished(true);
                // Lock today so switching programs doesn't overwrite this completed workout
                if (selectedDayIndex === 0) {
                  // When viewing a locked workout (completed under a different program), preserve
                  // the original program id so isLocked stays true after re-completing it.
                  setLockedToday({ programId: isViewingLockedToday ? lockedToday!.programId : activeId, programColor: accentColor, programName: workout.program, dayLabel: workout.dayLabel, splitDayIndex: 0 });
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                const isResave = workoutFinished;
                setIsSaveChangesToast(isResave);
                setShowComplete(true);
                Animated.parallel([
                  Animated.spring(completeScale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 8 }),
                  Animated.timing(completeOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
                ]).start(isResave ? () => {
                  setTimeout(() => {
                    Animated.timing(completeOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
                      setShowComplete(false);
                      completeScale.setValue(0);
                      completeOpacity.setValue(0);
                      setIsSaveChangesToast(false);
                    });
                  }, 1500);
                } : undefined);
              } else {
                // Switch to next unfinished session
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                const nextUnfinished = workout.sessions.findIndex((_, si) =>
                  si !== selectedSessionIndex && !newSessionFinished[`${selectedDayIndex}-${si}`]
                );
                if (nextUnfinished >= 0) setSelectedSessionIndex(nextUnfinished);
              }
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.finishButtonText}>
                  {workoutFinished ? 'Save Changes' : (workout.sessions.length > 1 && !workout.sessions.every((_, si) => si === selectedSessionIndex || sessionFinished[`${selectedDayIndex}-${si}`]) ? 'Finish Session' : 'Finish Workout')}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#1C1C1E" />
              </View>
            </BounceButton>}

            {!futureReadOnly && showIncompleteWarning && (
              <View style={[styles.incompleteWarning, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
                <Ionicons name="warning-outline" size={20} color="#FF9500" />
                <Text style={[styles.incompleteWarningText, { color: colors.primaryText }]}>You have incomplete sets. Finish anyway?</Text>
                <View style={styles.incompleteWarningButtons}>
                  <TouchableOpacity
                    style={[styles.incompleteWarningBtn, { backgroundColor: colors.cardSolid, borderWidth: 1.5, borderColor: colors.cardBorder }]}
                    onPress={() => setShowIncompleteWarning(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.incompleteWarningBtnText, { color: colors.primaryText }]}>Go Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.incompleteWarningBtn, { backgroundColor: accentColor }]}
                    onPress={() => {
                      // Re-trigger the finish with warning already shown (it will pass the check)
                      if (!workout) return;
                      const currentSession = workout.sessions[selectedSessionIndex];
                      setShowIncompleteWarning(false);

                      if (currentSession) {
                        const exerciseData = exercises.map(e => ({ name: e.name, mode: e.mode, sets: e.sets.map(s => ({ reps: s.reps, weight: s.weight ?? 0, hold: s.hold ?? 0 })) }));
                        workoutState.savePrev(currentSession.label, exerciseData);
                      }

                      const sessionKey = `${selectedDayIndex}-${selectedSessionIndex}`;
                      const newSessionFinished = { ...sessionFinished, [sessionKey]: true };
                      setSessionFinished(newSessionFinished);

                      const allDone = workout.sessions.every((_, si) =>
                        si === selectedSessionIndex || newSessionFinished[`${selectedDayIndex}-${si}`]
                      );

                      if (allDone) {
                        Object.keys(exerciseCache).forEach(key => { if (!key.startsWith(`${selectedDayIndex}-`)) delete exerciseCache[key]; });
                        const allCached: Exercise[] = [];
                        for (let si = 0; si < workout.sessions.length; si++) {
                          const cached = exerciseCache[`${selectedDayIndex}-${si}`];
                          if (cached) allCached.push(...cached);
                        }
                        const totalVolume = allCached.reduce((sum, ex) => { if (ex.mode === 'hold') return sum; for (const s of ex.sets) sum += s.reps * (s.weight ?? 0); return sum; }, 0);
                        const endTime2 = new Date();
                        setWorkoutEndTime(endTime2);
                        const startTime2 = workoutStartTime ?? new Date(Date.now() - workoutState.getElapsed(selectedDayIndex) * 1000);
                        const durationSecs = Math.max(0, Math.floor((endTime2.getTime() - startTime2.getTime()) / 1000));
                        const entryId2 = String(Date.now());
                        setLastEntryId(entryId2);
                        workoutState.logJournalEntry({
                          id: entryId2,
                          date: Date.now(),
                          programName: workout.program,
                          programId: isViewingLockedToday ? lockedToday!.programId : activeId,
                          programColor: accentColor,
                          dayLabel: workout.dayLabel,
                          durationSecs,
                          totalVolume,
                          sessions: workout.sessions.map((s, si) => {
                            const cached = exerciseCache[`${selectedDayIndex}-${si}`];
                            return {
                              label: s.label,
                              exercises: (cached ?? s.exercises).map(e => ({
                                name: e.name,
                                mode: e.mode ?? 'reps',
                                sets: e.sets.map(set => ({
                                  reps: set.reps,
                                  weight: set.weight,
                                  hold: set.hold ?? 0,
                                  isWarmup: set.isWarmup ?? false,
                                })),
                              })),
                            };
                          }),
                        });
                        setFinishedDurations(prev => ({ ...prev, [selectedDayIndex]: durationSecs }));
                        workoutState.stopTimer(selectedDayIndex);
                        workoutState.setFinished(true);
                        if (selectedDayIndex === 0) {
                          setLockedToday({ programId: isViewingLockedToday ? lockedToday!.programId : activeId, programColor: accentColor, programName: workout.program, dayLabel: workout.dayLabel, splitDayIndex: 0 });
                        }
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        setShowComplete(true);
                        Animated.parallel([
                          Animated.spring(completeScale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 8 }),
                          Animated.timing(completeOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
                        ]).start();
                      } else {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        const nextUnfinished = workout.sessions.findIndex((_, si) =>
                          si !== selectedSessionIndex && !newSessionFinished[`${selectedDayIndex}-${si}`]
                        );
                        if (nextUnfinished >= 0) setSelectedSessionIndex(nextUnfinished);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.incompleteWarningBtnText, { color: '#1C1C1E' }]}>Finish Anyway</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!workoutFinished && (
              <TouchableOpacity
                style={[styles.changeWorkoutBtn, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}60` }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowSwapOverlay(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="swap-horizontal" size={16} color={colors.primaryText} />
                <Text style={[styles.changeWorkoutBtnText, { color: colors.primaryText }]}>Change Workout</Text>
              </TouchableOpacity>
            )}
          </>
        ) : !isViewingPast ? (
          <View style={[styles.restDayCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
            <Ionicons name="bed-outline" size={40} color={colors.secondaryText} />
            <Text style={[styles.restDayTitle, { color: colors.primaryText }]}>Rest Day</Text>
            <Text style={[styles.restDaySubtitle, { color: colors.secondaryText }]}>Recovery is part of the process</Text>
            <TouchableOpacity
              style={[styles.changeWorkoutBtn, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}60`, marginTop: 16, alignSelf: 'center' }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSwapOverlay(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal" size={16} color={colors.primaryText} />
              <Text style={[styles.changeWorkoutBtnText, { color: colors.primaryText }]}>Change Workout</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      {/* Exercise Info Modal */}
      <ExerciseInfoModal exerciseName={infoExerciseName} onClose={() => setInfoExerciseName(null)} />

      {/* Change / Add Exercise Picker */}
      <ExercisePicker
        visible={changeExerciseIndex !== null || addingExercise}
        onDismiss={() => { setChangeExerciseIndex(null); setAddingExercise(false); }}
        onSelect={(name: string) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (addingExercise) {
            const newExercise: Exercise = {
              name,
              sets: [1, 2, 3].map(n => ({ set: n, reps: 0, weight: null, hold: 0 })),
            };
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            updateExercises(prev => [...prev, newExercise]);
            if (activeProgram) {
              const splitDays = [...activeProgram.splitDays];
              const splitIdx = getEffectiveSplitIndex(selectedDayIndex);
              const day = splitDays[splitIdx];
              if (day?.type === 'training') {
                const sessions = [...day.sessions];
                const exs = [...sessions[selectedSessionIndex].exercises, { name, sets: 3 }];
                sessions[selectedSessionIndex] = { ...sessions[selectedSessionIndex], exercises: exs };
                splitDays[splitIdx] = { ...day, sessions };
                updateProgram(activeProgram.id, activeProgram.name, activeProgram.color, splitDays);
              }
            }
          } else if (changeExerciseIndex !== null) {
            const idx = changeExerciseIndex;
            updateExercises(prev => prev.map((ex, ei) => ei !== idx ? ex : { ...ex, name }));
            if (activeProgram) {
              const splitDays = [...activeProgram.splitDays];
              const splitIdx = getEffectiveSplitIndex(selectedDayIndex);
              const day = splitDays[splitIdx];
              if (day?.type === 'training') {
                const sessions = [...day.sessions];
                const exs = [...sessions[selectedSessionIndex].exercises];
                exs[idx] = { ...exs[idx], name };
                sessions[selectedSessionIndex] = { ...sessions[selectedSessionIndex], exercises: exs };
                splitDays[splitIdx] = { ...day, sessions };
                updateProgram(activeProgram.id, activeProgram.name, activeProgram.color, splitDays);
              }
            }
          }
          setChangeExerciseIndex(null);
          setAddingExercise(false);
        }}
      />

      {/* Rest Timer / Stopwatch Overlay */}
      {showRestTimer && (
        <View style={styles.completeOverlay}>
          <FadeBackdrop onPress={() => setShowRestTimer(false)} color="rgba(0,0,0,0.5)" />
          <View style={[styles.restTimerCard, { backgroundColor: colors.modalBg }]}>
            {/* Close */}
            <View style={styles.restTimerCloseRow}>
              <TouchableOpacity onPress={() => setShowRestTimer(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>

            {/* Mode Tabs */}
            <View style={[styles.restTimerTabs, { backgroundColor: colors.inputBg }]}>
              {(['timer', 'stopwatch'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRestMode(mode); }}
                  style={[styles.restTimerTab, restMode === mode && { backgroundColor: accentColor }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.restTimerTabText, { color: colors.secondaryText }, restMode === mode && { color: '#1C1C1E' }]}>
                    {mode === 'timer' ? 'Timer' : 'Stopwatch'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Shared body for both modes */}
            <View style={styles.restTimerBody}>
              {/* Time display — identical container, time always dead-centre */}
              <View style={styles.restTimerDisplay}>
                {/* -15s / +15s — absolutely positioned so they never shift the time */}
                {restMode === 'timer' && !(editingDuration && !countdownActive) && (
                  <>
                    <TouchableOpacity
                      onPress={() => {
                        if (!countdownActive) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          const newVal = Math.max(5, countdownDuration - 15);
                          setCountdownDuration(newVal);
                          setCountdownRemaining(newVal);
                          setEditMins(String(Math.floor(newVal / 60)).padStart(2, '0'));
                          setEditSecs(String(newVal % 60).padStart(2, '0'));
                        }
                      }}
                      style={[styles.restTimerAdjust, styles.restTimerAdjustLeft, { backgroundColor: colors.inputBg }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.restTimerAdjustText, { color: colors.primaryText }]}>-15s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (!countdownActive) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          const newVal = countdownDuration + 15;
                          setCountdownDuration(newVal);
                          setCountdownRemaining(newVal);
                          setEditMins(String(Math.floor(newVal / 60)).padStart(2, '0'));
                          setEditSecs(String(newVal % 60).padStart(2, '0'));
                        }
                      }}
                      style={[styles.restTimerAdjust, styles.restTimerAdjustRight, { backgroundColor: colors.inputBg }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.restTimerAdjustText, { color: colors.primaryText }]}>+15s</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Time text — centred identically for both modes */}
                {restMode === 'timer' && editingDuration && !countdownActive ? (
                  <View style={styles.restTimerEditRow}>
                    <TextInput
                      style={[styles.restTimerEditInput, { color: colors.primaryText, backgroundColor: colors.inputBg }]}
                      value={editMins}
                      onChangeText={(t) => setEditMins(t.replace(/[^0-9]/g, '').slice(0, 2))}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <Text style={[styles.restTimerTime, { color: colors.primaryText, fontSize: 36 }]}>:</Text>
                    <TextInput
                      style={[styles.restTimerEditInput, { color: colors.primaryText, backgroundColor: colors.inputBg }]}
                      value={editSecs}
                      onChangeText={(t) => setEditSecs(t.replace(/[^0-9]/g, '').slice(0, 2))}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        const m = Math.min(99, Math.max(0, parseInt(editMins) || 0));
                        const s = Math.min(59, Math.max(0, parseInt(editSecs) || 0));
                        const total = Math.max(5, m * 60 + s);
                        setCountdownDuration(total);
                        setCountdownRemaining(total);
                        setEditMins(String(Math.floor(total / 60)).padStart(2, '0'));
                        setEditSecs(String(total % 60).padStart(2, '0'));
                        setEditingDuration(false);
                        Keyboard.dismiss();
                      }}
                      style={[styles.restTimerEditConfirm, { backgroundColor: accentColor }]}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="checkmark" size={18} color="#1C1C1E" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      if (restMode === 'timer' && !countdownActive) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setEditMins(String(Math.floor(countdownRemaining / 60)).padStart(2, '0'));
                        setEditSecs(String(countdownRemaining % 60).padStart(2, '0'));
                        setEditingDuration(true);
                      }
                    }}
                    activeOpacity={restMode === 'timer' ? 0.7 : 1}
                  >
                    <Text style={[styles.restTimerTime, { color: colors.primaryText, textAlign: 'center' }]}>
                      {restMode === 'timer'
                        ? `${String(Math.floor(countdownRemaining / 60)).padStart(2, '0')}:${String(countdownRemaining % 60).padStart(2, '0')}`
                        : swElapsed >= 3600
                          ? `${Math.floor(swElapsed / 3600)}:${String(Math.floor((swElapsed % 3600) / 60)).padStart(2, '0')}:${String(swElapsed % 60).padStart(2, '0')}`
                          : `${String(Math.floor(swElapsed / 60)).padStart(2, '0')}:${String(swElapsed % 60).padStart(2, '0')}`}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Tap to edit hint — absolutely positioned so it doesn't shift the time */}
                {restMode === 'timer' && !countdownActive && !editingDuration && (
                  <View style={[styles.restTimerEditHint, { position: 'absolute', bottom: 2 }]}>
                    <Ionicons name="create-outline" size={12} color={colors.secondaryText} />
                    <Text style={[styles.restTimerEditHintText, { color: colors.secondaryText }]}>tap to edit</Text>
                  </View>
                )}
              </View>

              {/* Action buttons */}
              {restMode === 'timer' ? (
                <>
                  <TouchableOpacity
                    style={[styles.restTimerAction, { backgroundColor: countdownActive ? colors.inputBg : accentColor }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setCountdownActive(!countdownActive);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={countdownActive ? 'pause' : 'play'} size={20} color={countdownActive ? colors.primaryText : '#1C1C1E'} />
                    <Text style={[styles.restTimerActionText, { color: countdownActive ? colors.primaryText : '#1C1C1E' }]}>
                      {countdownActive ? 'Pause' : 'Start'}
                    </Text>
                  </TouchableOpacity>
                  {!countdownActive && countdownRemaining !== countdownDuration && (
                    <TouchableOpacity
                      style={styles.restTimerSecondary}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setCountdownRemaining(countdownDuration);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.restTimerSecondaryText, { color: colors.secondaryText }]}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <>
                  {swRunning ? (
                    <TouchableOpacity
                      style={[styles.restTimerAction, { backgroundColor: colors.inputBg }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        swOffsetRef.current = swElapsed;
                        setSwRunning(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="stop" size={20} color={colors.primaryText} />
                      <Text style={[styles.restTimerActionText, { color: colors.primaryText }]}>Stop</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.restTimerButtonRow}>
                      {swElapsed > 0 && (
                        <TouchableOpacity
                          style={[styles.restTimerAction, { backgroundColor: colors.inputBg, flex: 1 }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSwElapsed(0);
                            swOffsetRef.current = 0;
                            swStartRef.current = null;
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="refresh" size={20} color={colors.primaryText} />
                          <Text style={[styles.restTimerActionText, { color: colors.primaryText }]}>Reset</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.restTimerAction, { backgroundColor: accentColor, flex: 1 }]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          setSwRunning(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="play" size={20} color="#1C1C1E" />
                        <Text style={[styles.restTimerActionText, { color: '#1C1C1E' }]}>{swElapsed > 0 ? 'Continue' : 'Start'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
        </View>
        </View>
      )}

      {showComplete && (
        <Animated.View style={[styles.completeOverlay, { opacity: completeOpacity, backgroundColor: colors.overlayBg }]}>
          <Animated.View style={[styles.completeCard, { transform: [{ scale: completeScale }], backgroundColor: colors.modalBg }]}>
            <View style={[styles.completeIconCircle, isSaveChangesToast && { backgroundColor: '#34D399' }]}>
              <Ionicons name="checkmark" size={48} color="#fff" />
            </View>
            {isSaveChangesToast ? (
              <>
                <Text style={[styles.completeTitle, { color: colors.primaryText }]}>Changes Saved!</Text>
                <Text style={[styles.completeSubtitle, { color: colors.secondaryText }]}>Your workout has been updated</Text>
              </>
            ) : (
              <>
                <Text style={[styles.completeTitle, { color: colors.primaryText }]}>Workout Complete!</Text>
                <Text style={[styles.completeSubtitle, { color: colors.secondaryText }]}>Great work finishing today's session</Text>

                {/* Editable start / end times */}
                <View style={[styles.completeTimeCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={styles.completeTimeRow}
                    onPress={() => { setEditingTime('start'); setShowTimePicker(true); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="play-circle-outline" size={16} color={colors.secondaryText} />
                    <Text style={[styles.completeTimeLabel, { color: colors.secondaryText }]}>Started</Text>
                    <Text style={[styles.completeTimeValue, { color: colors.primaryText }]}>
                      {(workoutStartTime ?? new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Ionicons name="pencil-outline" size={13} color={colors.tertiaryText} />
                  </TouchableOpacity>
                  <View style={[styles.completeTimeDivider, { backgroundColor: colors.border }]} />
                  <TouchableOpacity
                    style={styles.completeTimeRow}
                    onPress={() => { setEditingTime('end'); setShowTimePicker(true); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="stop-circle-outline" size={16} color={colors.secondaryText} />
                    <Text style={[styles.completeTimeLabel, { color: colors.secondaryText }]}>Ended</Text>
                    <Text style={[styles.completeTimeValue, { color: colors.primaryText }]}>
                      {(workoutEndTime ?? new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Ionicons name="pencil-outline" size={13} color={colors.tertiaryText} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.completeDuration, { color: colors.tertiaryText }]}>{timerText}</Text>
              </>
            )}

            {!isSaveChangesToast && <BounceButton style={[styles.completeDoneBtn, { backgroundColor: accentColor }]} onPress={() => {
              if (workoutStartTime && workoutEndTime && workoutEndTime.getTime() <= workoutStartTime.getTime()) {
                Alert.alert('Invalid Time', 'Your end time cannot be before or the same as your start time.');
                return;
              }
              setShowComplete(false);
              completeScale.setValue(0);
              completeOpacity.setValue(0);
              router.navigate('/(tabs)/home');
            }}>
              <Text style={styles.completeDoneBtnText}>Done</Text>
            </BounceButton>}
          </Animated.View>
        </Animated.View>
      )}

      {/* Time picker — custom scroll wheel bottom sheet */}
      <BottomSheetModal visible={showTimePicker} onDismiss={() => setShowTimePicker(false)}>
        <View style={[styles.timePickerSheet, { backgroundColor: colors.modalBg }]}>
          <View style={[styles.timePickerHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowTimePicker(false)}>
              <Text style={{ fontSize: 16, fontFamily: 'Arimo_400Regular', color: colors.secondaryText }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.timePickerTitle, { color: colors.primaryText }]}>
              {editingTime === 'start' ? 'Start Time' : 'End Time'}
            </Text>
            <TouchableOpacity onPress={applyTimePick}>
              <Text style={[styles.timePickerDone, { color: accentColor }]}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Scroll-wheel columns */}
          <View style={{ flexDirection: 'row', height: PICK_ITEM_H * 5, position: 'relative', marginVertical: 12 }}>
            {/* Selection highlight bar */}
            <View style={{ position: 'absolute', top: PICK_ITEM_H * 2, left: 16, right: 16, height: PICK_ITEM_H, backgroundColor: colors.inputBg, borderRadius: 12 }} />

            {/* Hours 1–12 */}
            <ScrollView
              ref={hourScrollRef}
              style={{ flex: 2 }}
              snapToInterval={PICK_ITEM_H}
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: PICK_ITEM_H * 2 }}
              onMomentumScrollEnd={e => setPickerHour(Math.max(1, Math.min(Math.round(e.nativeEvent.contentOffset.y / PICK_ITEM_H) + 1, 12)))}
              onScrollEndDrag={e => setPickerHour(Math.max(1, Math.min(Math.round(e.nativeEvent.contentOffset.y / PICK_ITEM_H) + 1, 12)))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <View key={i} style={{ height: PICK_ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 26, fontFamily: 'Arimo_700Bold', color: (i + 1) === pickerHour ? colors.primaryText : colors.tertiaryText, opacity: (i + 1) === pickerHour ? 1 : 0.45 }}>{i + 1}</Text>
                </View>
              ))}
            </ScrollView>

            {/* Colon */}
            <View style={{ width: 18, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 26, fontFamily: 'Arimo_700Bold', color: colors.primaryText }}>:</Text>
            </View>

            {/* Minutes 00–59 */}
            <ScrollView
              ref={minuteScrollRef}
              style={{ flex: 2 }}
              snapToInterval={PICK_ITEM_H}
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: PICK_ITEM_H * 2 }}
              onMomentumScrollEnd={e => setPickerMinute(Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.y / PICK_ITEM_H), 59)))}
              onScrollEndDrag={e => setPickerMinute(Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.y / PICK_ITEM_H), 59)))}
            >
              {Array.from({ length: 60 }, (_, i) => (
                <View key={i} style={{ height: PICK_ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 26, fontFamily: 'Arimo_700Bold', color: i === pickerMinute ? colors.primaryText : colors.tertiaryText, opacity: i === pickerMinute ? 1 : 0.45 }}>{String(i).padStart(2, '0')}</Text>
                </View>
              ))}
            </ScrollView>

            {/* AM / PM */}
            <ScrollView
              ref={ampmScrollRef}
              style={{ flex: 1.5 }}
              snapToInterval={PICK_ITEM_H}
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: PICK_ITEM_H * 2 }}
              onMomentumScrollEnd={e => setPickerAmPm(Math.round(e.nativeEvent.contentOffset.y / PICK_ITEM_H) === 0 ? 'AM' : 'PM')}
              onScrollEndDrag={e => setPickerAmPm(Math.round(e.nativeEvent.contentOffset.y / PICK_ITEM_H) === 0 ? 'AM' : 'PM')}
            >
              {(['AM', 'PM'] as const).map(v => (
                <View key={v} style={{ height: PICK_ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 26, fontFamily: 'Arimo_700Bold', color: v === pickerAmPm ? colors.primaryText : colors.tertiaryText, opacity: v === pickerAmPm ? 1 : 0.45 }}>{v}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </BottomSheetModal>

      {/* Make Today's Workout Prompt */}
      {showMakeTodayPrompt && (
        <View style={styles.overlayContainer}>
          <FadeBackdrop onPress={() => { pendingFillAction.current = null; setShowMakeTodayPrompt(false); }} color="rgba(0,0,0,0.5)" />
          <View style={[styles.swapOverlayCard, { backgroundColor: colors.modalBg, marginBottom: 120 }]}>
            <Text style={[styles.swapOverlayTitle, { color: colors.primaryText }]}>Make this today's workout?</Text>
            <Text style={[styles.swapOverlaySubtitle, { color: colors.secondaryText }]}>
              Swap "{workout?.dayLabel}" with "{calendarDays[todayIndex]?.label}" so your schedule stays on track.
            </Text>

            <TouchableOpacity
              style={[styles.makeTodayPrimaryBtn, { backgroundColor: accentColor }]}
              onPress={() => { setShowMakeTodayPrompt(false); pendingFillAction.current?.(); pendingFillAction.current = null; handleSwapToToday(); }}
              activeOpacity={0.8}
            >
              <Ionicons name="swap-vertical-outline" size={18} color="#fff" />
              <Text style={styles.makeTodayPrimaryText}>Yes, make it today's workout</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.makeTodaySecondaryBtn, { borderColor: colors.border }]}
              onPress={() => { setShowMakeTodayPrompt(false); pendingFillAction.current?.(); pendingFillAction.current = null; handleStartCurrentDay(); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.makeTodaySecondaryText, { color: colors.primaryText }]}>No, just log it here</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.swapCancelBtn, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => { pendingFillAction.current = null; setShowMakeTodayPrompt(false); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.swapCancelText, { color: colors.primaryText }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Swap / Discard Workout Overlay */}
      {showSwapOverlay && (() => {
        // Use the program that owns the currently viewed day
        const swapProgram = (selectedDayIndex === 0 && isLocked)
          ? programs.find(p => p.id === lockedToday!.programId)
          : activeProgram;
        const trainingOptions: { index: number; label: string }[] = [];
        const seenLabels = new Set<string>();
        if (swapProgram) {
          for (let i = 0; i < swapProgram.splitDays.length; i++) {
            const sd = swapProgram.splitDays[i];
            if (sd.type === 'training') {
              const dayLabel = getDayLabel(sd);
              if (!seenLabels.has(dayLabel)) {
                seenLabels.add(dayLabel);
                const currentLabel = workout?.dayLabel;
                if (dayLabel !== currentLabel) {
                  trainingOptions.push({ index: i, label: dayLabel });
                }
              }
            }
          }
        }
        return (
          <View style={styles.overlayContainer}>
            <FadeBackdrop onPress={() => setShowSwapOverlay(false)} color="rgba(0,0,0,0.5)" />
            <View style={[styles.swapOverlayCard, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.swapOverlayTitle, { color: colors.primaryText }]}>Change Workout</Text>
              <Text style={[styles.swapOverlaySubtitle, { color: colors.secondaryText }]}>Swap today's session or skip it entirely</Text>

              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false} bounces={false}>
                {/* Swap options */}
                {trainingOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.index}
                    style={[styles.swapOption, { backgroundColor: colors.inputBg }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      delete exerciseCache[selectedDayIndex];
                      setDayOverrides(prev => ({ ...prev, [selectedDayIndex]: opt.index }));
                      setShowSwapOverlay(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.swapOptionDot, { backgroundColor: swapProgram?.color ?? accentColor }]} />
                    <Text style={[styles.swapOptionText, { color: colors.primaryText }]}>Switch to {opt.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.tertiaryText} />
                  </TouchableOpacity>
                ))}

                {/* Discard / rest day option — only when there's a workout to discard */}
                {workout && (
                  <TouchableOpacity
                    style={[styles.swapOption, { backgroundColor: colors.inputBg }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      workoutState.stopTimer(selectedDayIndex);
                      delete exerciseCache[selectedDayIndex];
                      setDayOverrides(prev => ({ ...prev, [selectedDayIndex]: 'rest' }));
                      setShowSwapOverlay(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.swapOptionDot, { backgroundColor: '#FF6B6B' }]} />
                    <Text style={[styles.swapOptionText, { color: '#FF6B6B' }]}>Skip — Make it a Rest Day</Text>
                    <Ionicons name="bed-outline" size={16} color="#FF6B6B" />
                  </TouchableOpacity>
                )}

                {/* Undo override — only show if currently overridden */}
                {dayOverrides[selectedDayIndex] !== undefined && (
                  <TouchableOpacity
                    style={[styles.swapOption, { backgroundColor: colors.inputBg }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      delete exerciseCache[selectedDayIndex];
                      setDayOverrides(prev => {
                        const next = { ...prev };
                        delete next[selectedDayIndex];
                        return next;
                      });
                      setShowSwapOverlay(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.swapOptionDot, { backgroundColor: colors.tertiaryText }]} />
                    <Text style={[styles.swapOptionText, { color: colors.primaryText }]}>Restore Original Workout</Text>
                    <Ionicons name="refresh" size={16} color={colors.tertiaryText} />
                  </TouchableOpacity>
                )}
              </ScrollView>

              {/* Cancel */}
              <TouchableOpacity
                style={[styles.swapCancelBtn, { backgroundColor: colors.inputBg }]}
                onPress={() => setShowSwapOverlay(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.swapCancelText, { color: colors.primaryText }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

    </LinearGradient>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 350,
  },
  screenTitle: {
    fontSize: 28,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
    lineHeight: 36,
    textShadowColor: '#00000080',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  dateLabel: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#FFFFFF',
    lineHeight: 22,
    marginTop: 4,
    marginBottom: 16,
    textShadowColor: '#00000040',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },

  // Timer
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#ffffff59',
    borderColor: '#ffffffcc',
    marginBottom: 12,
  },
  timerText: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    fontVariant: ['tabular-nums'] as any,
  },
  timerStartText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },

  // Calendar
  calendarContainer: {
    marginBottom: 20,
  },
  calendarRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
    flexGrow: 1,
    justifyContent: 'center',
  },
  dayCell: {
    width: 64,
    height: 78,
    borderRadius: 18,
    backgroundColor: '#ffffff40',
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dayName: {
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  dayIndicator: {
    width: 20,
    height: 4,
    borderRadius: 2,
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#47DDFF',
    marginTop: 1,
  },

  // Past Day Card
  pastDayCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  pastDayLabel: {
    fontSize: 22,
    fontFamily: 'Arimo_700Bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  pastDayMeta: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    marginBottom: 16,
    textAlign: 'center',
  },
  pastDayEmptyText: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    marginTop: 10,
    textAlign: 'center',
  },
  pastDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 11,
    paddingHorizontal: 18,
    marginTop: 8,
  },
  pastDayBtnText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
  },

  // Session Tabs
  sessionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  sessionTabText: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
  },

  // Program
  programRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  programBadge: {
    backgroundColor: 'rgba(71, 221, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(71, 221, 255, 0.3)',
  },
  programBadgeText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    letterSpacing: 1,
  },
  dayTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
    textShadowColor: '#00000080',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  daySubtitle: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#FFFFFF',
    opacity: 0.8,
    marginTop: 1,
    textShadowColor: '#00000040',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  exerciseCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff59',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
  },
  exerciseCountText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
  },

  // Exercise Card
  exerciseCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ffffffcc',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  exerciseNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(71, 221, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(71, 221, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  exerciseThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 10,
  },
  exerciseThumbImg: {
    width: 44,
    height: 44,
  },
  exerciseNumberText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  exerciseName: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    flex: 1,
  },
  exerciseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  setRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: 'flex-end',
  },
  dataRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  setHeaderText: {
    fontSize: 10,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    letterSpacing: 1,
  },
  setText: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
  },
  setWeight: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  setCol: {
    width: 36,
    textAlign: 'center',
  },
  inputCol: {
    flex: 1,
    textAlign: 'center',
  },
  inputHeaderCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 4,
  },
  inputCell: {
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  inputBox: {
    width: '100%',
    height: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  prevCol: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prevColHeader: {
    fontSize: 9,
    fontFamily: 'Arimo_700Bold',
    color: '#8a9bab',
    letterSpacing: 0.5,
  },
  prevValue: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#8a9bab',
  },
  inputBoxText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    textAlign: 'center',
    flex: 1,
    width: '100%',
    paddingVertical: 0,
  },
  checkCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#00EBAC',
    borderColor: '#00EBAC',
  },
  removeSetBtn: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: '#FF4D4F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.15)',
    borderStyle: 'dashed',
  },
  addSetText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  notesToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: '#f5f6f8',
  },
  notesToggleBtnActive: {
    backgroundColor: 'rgba(71, 221, 255, 0.1)',
  },
  notesToggleText: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  noteInput: {
    marginTop: 8,
    backgroundColor: '#f5f6f8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginHorizontal: 4,
    marginBottom: 2,
  },

  // Rest Day
  restDayCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#ffffffcc',
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 10,
  },
  restDayTitle: {
    fontSize: 22,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  restDaySubtitle: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addExerciseBtnText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
  },
  finishButton: {
    backgroundColor: '#47DDFF',
    borderRadius: 16,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  finishButtonText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    letterSpacing: 0.4,
  },
  incompleteWarning: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 10,
    alignItems: 'center',
    gap: 8,
  },
  incompleteWarningText: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    textAlign: 'center',
  },
  incompleteWarningButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    width: '100%',
  },
  incompleteWarningBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  incompleteWarningBtnText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
  },
  completeOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  completeCard: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 36,
    alignItems: 'center',
    width: '82%',
    gap: 12,
  },
  completeIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#00EBAC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  completeTitle: {
    fontSize: 24,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  completeSubtitle: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    textAlign: 'center',
  },
  completeDoneBtn: {
    backgroundColor: '#47DDFF',
    borderRadius: 16,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 8,
  },
  completeDoneBtnText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    letterSpacing: 0.4,
  },
  completeTimeCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    marginBottom: 4,
    overflow: 'hidden',
  },
  completeTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  completeTimeLabel: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    flex: 1,
  },
  completeTimeValue: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    marginRight: 4,
  },
  completeTimeDivider: {
    height: 1,
    marginHorizontal: 14,
  },
  completeDuration: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    marginBottom: 4,
  },
  timePickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  timePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  timePickerTitle: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
  },
  timePickerDone: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
  },

  // Rest Timer
  journalHeaderBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 38,
    right: 74,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  restTimerBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 38,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff59',
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  restTimerCard: {
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    width: '85%',
    alignItems: 'center',
    gap: 16,
  },
  restTimerBody: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  restTimerCloseRow: {
    width: '100%',
    alignItems: 'flex-end',
    marginBottom: -12,
    marginRight: -8,
  },
  restTimerTabs: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    width: '100%',
  },
  restTimerTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  restTimerTabText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
  },
  restTimerDisplay: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    height: 80,
    width: '100%',
  },
  restTimerTime: {
    fontSize: 48,
    fontFamily: 'Arimo_700Bold',
    fontVariant: ['tabular-nums'] as any,
  },
  restTimerAdjust: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    position: 'absolute' as const,
    top: '50%',
    marginTop: -16,
  },
  restTimerAdjustLeft: {
    left: 16,
  },
  restTimerAdjustRight: {
    right: 16,
  },
  restTimerAdjustText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },
  restTimerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    height: 48,
    width: '100%',
  },
  restTimerActionText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    letterSpacing: 0.4,
  },
  restTimerSecondary: {
    paddingVertical: 8,
  },
  restTimerSecondaryText: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
  },
  restTimerButtonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  restTimerEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  restTimerEditInput: {
    fontSize: 36,
    fontFamily: 'Arimo_700Bold',
    fontVariant: ['tabular-nums'] as any,
    textAlign: 'center',
    width: 64,
    paddingVertical: 6,
    borderRadius: 12,
  },
  restTimerEditConfirm: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  restTimerEditHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 2,
  },
  restTimerEditHintText: {
    fontSize: 11,
    fontFamily: 'Arimo_400Regular',
  },

  // Edit mode options
  editOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 6,
    borderRadius: 10,
  },
  editOptionText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },

  // Change Exercise overlay
  exerciseListOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  exerciseListCard: {
    borderRadius: 20,
    padding: 20,
    width: '85%',
    maxHeight: '70%',
  },
  customExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 44,
  },
  customExerciseInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    paddingVertical: 0,
  },
  customExerciseConfirm: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  exerciseListCategory: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 4,
  },
  exerciseListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  exerciseListItemText: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
  },

  // Change Workout button
  changeWorkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1.5,
    marginTop: 10,
  },
  changeWorkoutBtnText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
  },

  // Swap / Discard overlay
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  swapOverlayCard: {
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    width: '100%',
  },
  swapOverlayTitle: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
    marginBottom: 4,
  },
  swapOverlaySubtitle: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    marginBottom: 20,
  },
  swapOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 8,
    gap: 10,
  },
  swapOptionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  swapOptionText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
  },
  swapCancelBtn: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 28,
    marginTop: 4,
    borderRadius: 20,
  },
  swapCancelText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },
  makeTodayPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginBottom: 10,
  },
  makeTodayPrimaryText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  makeTodaySecondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 6,
  },
  makeTodaySecondaryText: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
  },
});
