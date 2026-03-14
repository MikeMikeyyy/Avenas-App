import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  StatusBar,
  Animated,
  Keyboard,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { useProgramStore, PROGRAM_COLORS, type SplitDay } from '../programStore';
import { useCommunityStore } from '../communityStore';
import { useTheme } from '../themeStore';
import { ExercisePicker } from '../components/ExercisePicker';
import { Image } from 'expo-image';
import exerciseDbRaw from '../assets/data/exercises.json';

type BundledExercise = { id: string; name: string; muscle: string; image: string };
const exerciseDb = exerciseDbRaw as BundledExercise[];
const EXERCISE_IMAGE_MAP = new Map(exerciseDb.map(e => [e.name, e.image]));
const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

function getExerciseImageUri(name: string): string | null {
  const img = EXERCISE_IMAGE_MAP.get(name);
  if (!img) return null;
  return IMAGE_BASE + img.split('/').map(encodeURIComponent).join('/');
}

function BounceButton({ style, children, onPress, ...rest }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}
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

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function CreateProgramScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });
  const { editId, mode } = useLocalSearchParams<{ editId?: string; mode?: string }>();
  const isReturnMode = mode === 'returnToMember';
  const { programs, addProgram, updateProgram, setActive } = useProgramStore();
  const { returnWorkoutToMember } = useCommunityStore();
  const { isDark, colors } = useTheme();
  const editingProgram = editId ? programs.find(p => p.id === editId) : undefined;
  const [programName, setProgramName] = useState(editingProgram?.name || '');
  const [selectedColor, setSelectedColor] = useState(editingProgram?.color || PROGRAM_COLORS[0]);
  const [splitDays, setSplitDays] = useState<SplitDay[]>(editingProgram?.splitDays || []);
  const initialSnapshot = useRef({
    name: editingProgram?.name ?? '',
    color: editingProgram?.color ?? PROGRAM_COLORS[0],
    splitDays: JSON.stringify(editingProgram?.splitDays ?? []),
  });
  const hasChanges = !!editId && (
    programName !== initialSnapshot.current.name ||
    selectedColor !== initialSnapshot.current.color ||
    JSON.stringify(splitDays) !== initialSnapshot.current.splitDays
  );
  const hasCreateChanges = !editId && !isReturnMode && (
    programName !== '' ||
    selectedColor !== PROGRAM_COLORS[0] ||
    splitDays.length > 0
  );
  const [pickerTarget, setPickerTarget] = useState<{ dayIndex: number; sessionIndex: number; exerciseIndex?: number } | null>(null);
  const [returnData, setReturnData] = useState<{
    communityId: string; workoutId: string; memberName: string;
    originalProgramName: string; originalColor: string; originalSplitDays: SplitDay[];
  } | null>(null);

  useEffect(() => {
    if (!isReturnMode) return;
    AsyncStorage.getItem('@coachEditReturn').then(raw => {
      if (!raw) return;
      const data = JSON.parse(raw);
      const name = data.programName || '';
      const color = data.color || PROGRAM_COLORS[0];
      const days = data.splitDays || [];
      setProgramName(name);
      setSelectedColor(color);
      setSplitDays(days);
      setReturnData({
        communityId: data.communityId, workoutId: data.workoutId, memberName: data.memberName,
        originalProgramName: name, originalColor: color, originalSplitDays: days,
      });
      AsyncStorage.removeItem('@coachEditReturn');
    });
  }, [isReturnMode]);

  if (!fontsLoaded) return null;

  const handleExerciseSelected = (name: string) => {
    if (!pickerTarget) return;
    const { dayIndex, sessionIndex, exerciseIndex } = pickerTarget;
    setSplitDays(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as SplitDay[];
      const day = next[dayIndex];
      if (day.type === 'training') {
        if (exerciseIndex !== undefined) {
          // Replace existing exercise name, preserve sets/warmup
          day.sessions[sessionIndex].exercises[exerciseIndex].name = name;
        } else {
          day.sessions[sessionIndex].exercises.push({ name, sets: 3 });
        }
      }
      return next;
    });
    setPickerTarget(null);
  };

  const addTrainingDay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSplitDays(prev => [...prev, { type: 'training', sessions: [{ label: '', exercises: [] }] }]);
  };

  const addRestDay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSplitDays(prev => [...prev, { type: 'rest' }]);
  };

  const removeSplitDay = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSplitDays(prev => prev.filter((_, i) => i !== index));
  };

  const updateSessionLabel = (dayIndex: number, sessionIndex: number, label: string) => {
    setSplitDays(prev => {
      const next = [...prev];
      const day = next[dayIndex];
      if (day.type === 'training') {
        const sessions = [...day.sessions];
        sessions[sessionIndex] = { ...sessions[sessionIndex], label };
        next[dayIndex] = { ...day, sessions };
      }
      return next;
    });
  };

  const updateExercise = (dayIndex: number, sessionIndex: number, exIndex: number, field: 'name' | 'sets' | 'warmupSets' | 'targetReps', value: string | number) => {
    setSplitDays(prev => {
      const next = [...prev];
      const day = next[dayIndex];
      if (day.type === 'training') {
        const sessions = [...day.sessions];
        const exercises = [...sessions[sessionIndex].exercises];
        const updated = { ...exercises[exIndex], [field]: value };
        if (field === 'sets') {
          const newSets = value as number;
          const ws = updated.warmupSets ?? 0;
          if (ws >= newSets) updated.warmupSets = Math.max(0, newSets - 1);
        }
        exercises[exIndex] = updated;
        sessions[sessionIndex] = { ...sessions[sessionIndex], exercises };
        next[dayIndex] = { ...day, sessions };
      }
      return next;
    });
  };

  const removeExercise = (dayIndex: number, sessionIndex: number, exIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSplitDays(prev => {
      const next = [...prev];
      const day = next[dayIndex];
      if (day.type === 'training') {
        const sessions = [...day.sessions];
        sessions[sessionIndex] = { ...sessions[sessionIndex], exercises: sessions[sessionIndex].exercises.filter((_, i) => i !== exIndex) };
        next[dayIndex] = { ...day, sessions };
      }
      return next;
    });
  };

  const addSessionToDay = (dayIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSplitDays(prev => {
      const next = [...prev];
      const day = next[dayIndex];
      if (day.type === 'training') {
        next[dayIndex] = { ...day, sessions: [...day.sessions, { label: '', exercises: [] }] };
      }
      return next;
    });
  };

  const removeSession = (dayIndex: number, sessionIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSplitDays(prev => {
      const next = [...prev];
      const day = next[dayIndex];
      if (day.type === 'training' && day.sessions.length > 1) {
        next[dayIndex] = { ...day, sessions: day.sessions.filter((_, i) => i !== sessionIndex) };
      }
      return next;
    });
  };

  const moveExercise = (dayIndex: number, sessionIndex: number, exIndex: number, direction: 'up' | 'down') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSplitDays(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as SplitDay[];
      const day = next[dayIndex];
      if (day.type === 'training') {
        const exercises = day.sessions[sessionIndex].exercises;
        const target = direction === 'up' ? exIndex - 1 : exIndex + 1;
        if (target < 0 || target >= exercises.length) return prev;
        [exercises[exIndex], exercises[target]] = [exercises[target], exercises[exIndex]];
      }
      return next;
    });
  };

  const moveSplitDay = (index: number, direction: 'up' | 'down') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSplitDays(prev => {
      const next = [...prev];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  let trainingDayCount = 0;

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.gradientStart} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.screenTitle}>{isReturnMode ? 'Edit & Return' : editId ? 'Edit Program' : 'Create Program'}</Text>

        {/* Program Name */}
        <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>PROGRAM NAME</Text>
        <View style={[styles.inputCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
          <TextInput
            style={[styles.textInput, { color: colors.primaryText }]}
            placeholder="e.g. Push Pull Legs"
            placeholderTextColor={colors.tertiaryText}
            value={programName}
            onChangeText={setProgramName}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        </View>

        {/* Program Colour */}
        <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>PROGRAM COLOUR</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.colorPickerRow}
          keyboardShouldPersistTaps="handled"
        >
          {PROGRAM_COLORS.map((color) => {
            const selected = color === selectedColor;
            return (
              <TouchableOpacity
                key={color}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedColor(color); }}
                style={[styles.colorSwatch, selected && styles.colorSwatchSelected]}
                activeOpacity={0.75}
              >
                <View style={[styles.colorSwatchInner, { backgroundColor: color }]}>
                  {selected && <Ionicons name="checkmark" size={16} color={isLightColor(color) ? '#1C1C1E' : '#ffffff'} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Split Schedule */}
        <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>SPLIT SCHEDULE</Text>
        <Text style={[styles.splitHint, { color: colors.secondaryText }]}>Define your repeating cycle. When activated, Day 1 starts today.</Text>

        {splitDays.map((day, i) => {
          if (day.type === 'rest') {
            return (
              <View key={i} style={styles.splitDayRow}>
                <Text style={[styles.splitDayIndex, { color: colors.secondaryText }]}>{i + 1}</Text>
                <View style={[styles.splitRestChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(90, 108, 125, 0.1)' }]}>
                  <Text style={[styles.splitRestText, { color: colors.secondaryText }]}>Rest</Text>
                </View>
                <TouchableOpacity onPress={() => moveSplitDay(i, 'up')} disabled={i === 0} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="chevron-up" size={22} color={i === 0 ? colors.tertiaryText : colors.secondaryText} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveSplitDay(i, 'down')} disabled={i === splitDays.length - 1} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="chevron-down" size={22} color={i === splitDays.length - 1 ? colors.tertiaryText : colors.secondaryText} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeSplitDay(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={26} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            );
          }

          trainingDayCount++;
          const dayNum = trainingDayCount;

          return (
            <View key={i} style={[styles.trainingDayCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
              {/* Day header row */}
              <View style={styles.trainingDayHeader}>
                <Text style={[styles.splitDayIndex, { color: colors.secondaryText }]}>{i + 1}</Text>
                <Text style={[styles.trainingDayTitle, { color: colors.primaryText }]}>Training Day {dayNum}</Text>
                <TouchableOpacity onPress={() => moveSplitDay(i, 'up')} disabled={i === 0} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="chevron-up" size={22} color={i === 0 ? colors.tertiaryText : colors.secondaryText} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveSplitDay(i, 'down')} disabled={i === splitDays.length - 1} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="chevron-down" size={22} color={i === splitDays.length - 1 ? colors.tertiaryText : colors.secondaryText} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeSplitDay(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={26} color="#FF3B30" />
                </TouchableOpacity>
              </View>

              {/* Sessions */}
              {day.sessions.map((session, si) => (
                <View key={si} style={[styles.sessionBlock, { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(90, 108, 125, 0.15)' }]}>
                  {/* Session label row */}
                  <View style={styles.sessionHeader}>
                    <Text style={[styles.exercisesLabel, { color: colors.secondaryText, marginBottom: 0 }]}>
                      {day.sessions.length > 1 ? `SESSION NAME ${si + 1}` : 'SESSION NAME'}
                    </Text>
                    {day.sessions.length > 1 && (
                      <TouchableOpacity
                        onPress={() => removeSession(i, si)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle-outline" size={20} color="#e74c3c" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={[styles.splitDayInputWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255, 255, 255, 0.4)', borderColor: colors.cardBorder, marginTop: 8 }]}>
                    <TextInput
                      style={[styles.splitDayInput, { color: colors.primaryText }]}
                      placeholder={day.sessions.length > 1 ? `Session ${si + 1} - e.g. Push AM` : `Day ${dayNum} - e.g. Push`}
                      placeholderTextColor={colors.tertiaryText}
                      value={session.label}
                      onChangeText={(v) => updateSessionLabel(i, si, v)}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </View>

                  {/* Exercises for this session */}
                  <Text style={[styles.exercisesLabel, { color: colors.secondaryText, marginTop: 12 }]}>EXERCISES</Text>
                  {session.exercises.map((ex, j) => {
                    const exImageUri = getExerciseImageUri(ex.name);
                    return (
                      <View key={`${i}-${si}-${j}`} style={styles.exerciseRow}>
                        {/* Name display row */}
                        <View style={[styles.exerciseDisplayRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)', borderColor: colors.cardBorder }]}>
                          {/* Up/Down arrows */}
                          <View style={{ alignItems: 'center', justifyContent: 'center', gap: 0, width: 22 }}>
                            {j > 0 ? (
                              <TouchableOpacity onPress={() => moveExercise(i, si, j, 'up')} hitSlop={{ top: 6, bottom: 4, left: 8, right: 8 }}>
                                <Ionicons name="chevron-up" size={18} color={colors.secondaryText} />
                              </TouchableOpacity>
                            ) : (
                              <View style={{ height: 18 }} />
                            )}
                            {j < session.exercises.length - 1 ? (
                              <TouchableOpacity onPress={() => moveExercise(i, si, j, 'down')} hitSlop={{ top: 4, bottom: 6, left: 8, right: 8 }}>
                                <Ionicons name="chevron-down" size={18} color={colors.secondaryText} />
                              </TouchableOpacity>
                            ) : (
                              <View style={{ height: 18 }} />
                            )}
                          </View>
                          {/* Thumbnail + name — tap to change */}
                          <TouchableOpacity
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                            activeOpacity={0.7}
                            onPress={() => setPickerTarget({ dayIndex: i, sessionIndex: si, exerciseIndex: j })}
                          >
                            <View style={[styles.exThumbWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}>
                              {exImageUri ? (
                                <Image source={{ uri: exImageUri }} style={styles.exThumb} contentFit="cover" transition={200} />
                              ) : (
                                <Ionicons name="barbell-outline" size={20} color={colors.tertiaryText} />
                              )}
                            </View>
                            <Text style={[styles.exName, { color: colors.primaryText }]} numberOfLines={2}>
                              {ex.name || `Exercise ${j + 1}`}
                            </Text>
                          </TouchableOpacity>
                          {/* Trash */}
                          <TouchableOpacity onPress={() => removeExercise(i, si, j)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={20} color="#e74c3c" />
                          </TouchableOpacity>
                        </View>
                        {/* Sets controls row */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 8, paddingLeft: 4 }}>
                          <View style={styles.setsWrap}>
                            <TouchableOpacity onPress={() => updateExercise(i, si, j, 'sets', Math.max(1, ex.sets - 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="remove-circle-outline" size={22} color={colors.secondaryText} />
                            </TouchableOpacity>
                            <Text style={[styles.setsText, { color: colors.primaryText }]}>{ex.sets} sets</Text>
                            <TouchableOpacity onPress={() => updateExercise(i, si, j, 'sets', ex.sets + 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="add-circle-outline" size={22} color={colors.secondaryText} />
                            </TouchableOpacity>
                          </View>
                          {ex.sets > 1 && (
                            <View style={styles.setsWrap}>
                              <TouchableOpacity onPress={() => updateExercise(i, si, j, 'warmupSets', Math.max(0, (ex.warmupSets ?? 0) - 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Ionicons name="remove-circle-outline" size={22} color={colors.secondaryText} />
                              </TouchableOpacity>
                              <Text style={[styles.setsText, { color: colors.tertiaryText }]}>{ex.warmupSets ?? 0} warmup</Text>
                              <TouchableOpacity onPress={() => updateExercise(i, si, j, 'warmupSets', Math.min(ex.sets - 1, (ex.warmupSets ?? 0) + 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Ionicons name="add-circle-outline" size={22} color={colors.secondaryText} />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                        {(ex.warmupSets ?? 0) > 0 && (
                          <Text style={[styles.setsBreakdown, { color: colors.tertiaryText }]}>
                            {ex.warmupSets} warmup sets + {ex.sets - (ex.warmupSets ?? 0)} working sets
                          </Text>
                        )}
                        {ex.mode !== 'hold' && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, paddingLeft: 4 }}>
                            <Text style={[styles.setsText, { color: colors.tertiaryText, minWidth: 60 }]}>Target reps</Text>
                            <TextInput
                              style={[styles.targetRepsInput, { color: colors.primaryText, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }]}
                              value={ex.targetReps ?? ''}
                              onChangeText={v => updateExercise(i, si, j, 'targetReps', v)}
                              placeholder="e.g. 8 or 8-12"
                              placeholderTextColor={colors.tertiaryText}
                              keyboardType="default"
                              returnKeyType="done"
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
                  <BounceButton style={[styles.addExerciseBtn, { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(90, 108, 125, 0.35)' }]} onPress={() => setPickerTarget({ dayIndex: i, sessionIndex: si })}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="add" size={20} color={colors.secondaryText} />
                      <Text style={[styles.addExerciseText, { color: colors.secondaryText }]}>Add Exercise</Text>
                    </View>
                  </BounceButton>
                </View>
              ))}

              {/* Add Session button */}
              <BounceButton style={[styles.addSessionBtn, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(90, 108, 125, 0.25)' }]} onPress={() => addSessionToDay(i)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="layers-outline" size={18} color={colors.secondaryText} />
                  <Text style={[styles.addExerciseText, { color: colors.secondaryText }]}>Add Session</Text>
                </View>
              </BounceButton>
            </View>
          );
        })}

        <View style={styles.splitAddRow}>
          <BounceButton style={[styles.splitAddBtn, { backgroundColor: hexAlpha(selectedColor, 0.15), borderColor: hexAlpha(selectedColor, 0.4) }]} onPress={addTrainingDay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="add" size={18} color={colors.primaryText} />
              <Text style={[styles.splitAddText, { color: colors.primaryText }]}>Training Day</Text>
            </View>
          </BounceButton>
          <BounceButton style={[styles.splitAddBtn, styles.splitAddRestBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(90, 108, 125, 0.08)', borderColor: colors.cardBorder }]} onPress={addRestDay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="add" size={18} color={colors.secondaryText} />
              <Text style={[styles.splitAddText, { color: colors.secondaryText }]}>Rest Day</Text>
            </View>
          </BounceButton>
        </View>

        {/* Save Button(s) */}
        {isReturnMode ? (
          <View style={{ gap: 12, marginTop: 32 }}>
            {returnData && (
              <BounceButton
                style={[styles.saveButton, { backgroundColor: 'rgba(90, 108, 125, 0.12)', borderWidth: 1.5, borderColor: 'rgba(90, 108, 125, 0.4)', marginTop: 0 }]}
                onPress={() => {
                  setProgramName(returnData.originalProgramName);
                  setSelectedColor(returnData.originalColor);
                  setSplitDays(returnData.originalSplitDays);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="refresh-outline" size={20} color={colors.secondaryText} />
                  <Text style={[styles.saveButtonText, { color: colors.secondaryText }]}>Revert to Original</Text>
                </View>
              </BounceButton>
            )}
            <BounceButton
              style={[styles.saveButton, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: selectedColor, marginTop: 0 }]}
              onPress={() => {
                const name = programName || 'Untitled Program';
                addProgram(name, selectedColor, splitDays);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.back();
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.saveButtonText, { color: selectedColor }]}>Save to My Programs</Text>
                <Ionicons name="bookmark-outline" size={20} color={selectedColor} />
              </View>
            </BounceButton>
            <BounceButton
              style={[styles.saveButton, { backgroundColor: selectedColor, marginTop: 0 }]}
              onPress={async () => {
                if (!returnData) return;
                const name = programName || 'Untitled Program';
                await returnWorkoutToMember(returnData.communityId, returnData.workoutId, {
                  programName: name, color: selectedColor, splitDays,
                });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.back();
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.saveButtonText, { color: isLightColor(selectedColor) ? '#1C1C1E' : '#ffffff' }]}>
                  Send Back to {returnData?.memberName ?? 'Member'}
                </Text>
                <Ionicons name="paper-plane" size={20} color={isLightColor(selectedColor) ? '#1C1C1E' : '#ffffff'} />
              </View>
            </BounceButton>
          </View>
        ) : !editId ? (
          <BounceButton
            style={[styles.saveButton, { backgroundColor: selectedColor }]}
            onPress={() => {
              const name = programName || 'Untitled Program';
              const newId = addProgram(name, selectedColor, splitDays);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                'Make Active Program?',
                `Would you like to make "${name}" your active program?`,
                [
                  { text: 'No', onPress: () => router.back() },
                  { text: 'Yes', style: 'default', onPress: () => { setActive(newId); router.back(); } },
                ]
              );
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[styles.saveButtonText, { color: isLightColor(selectedColor) ? '#1C1C1E' : '#ffffff' }]}>Save Program</Text>
              <Ionicons name="checkmark" size={22} color={isLightColor(selectedColor) ? '#1C1C1E' : '#ffffff'} />
            </View>
          </BounceButton>
        ) : null}
      </ScrollView>

      <ExercisePicker
        visible={!!pickerTarget}
        onDismiss={() => setPickerTarget(null)}
        onSelect={handleExerciseSelected}
      />

      {/* Floating back button — rendered after ScrollView so it sits on top */}
      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.backButtonBg }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (hasChanges) {
            Alert.alert(
              'Unsaved Changes',
              'You have unsaved changes. What would you like to do?',
              [
                { text: 'Discard', style: 'destructive', onPress: () => router.back() },
                {
                  text: 'Save', style: 'default', onPress: () => {
                    updateProgram(editId!, programName || 'Untitled Program', selectedColor, splitDays);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    router.back();
                  }
                },
                { text: 'Cancel', style: 'cancel' },
              ]
            );
          } else if (hasCreateChanges) {
            Alert.alert(
              'Save Program?',
              'You have an unsaved program. What would you like to do?',
              [
                { text: 'Discard', style: 'destructive', onPress: () => router.back() },
                {
                  text: 'Save', style: 'default', onPress: () => {
                    const name = programName || 'Untitled Program';
                    addProgram(name, selectedColor, splitDays);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    router.back();
                  }
                },
                { text: 'Cancel', style: 'cancel' },
              ]
            );
          } else {
            router.back();
          }
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
      </TouchableOpacity>

      {/* Floating save button — appears when editing and changes have been made */}
      {hasChanges && (
        <TouchableOpacity
          style={[styles.floatingSaveButton, { backgroundColor: selectedColor }]}
          activeOpacity={0.85}
          onPress={() => {
            const name = programName || 'Untitled Program';
            updateProgram(editId!, name, selectedColor, splitDays);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          }}
        >
          <Ionicons name="checkmark" size={20} color={isLightColor(selectedColor) ? '#1C1C1E' : '#ffffff'} />
          <Text style={[styles.saveButtonText, { color: isLightColor(selectedColor) ? '#1C1C1E' : '#ffffff' }]}>Save Changes</Text>
        </TouchableOpacity>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 28,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
    lineHeight: 36,
    textAlign: 'center',
    textShadowColor: '#00000080',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginBottom: 20,
    paddingHorizontal: 60,
  },
  backButton: {
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
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  inputCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  textInput: {
    fontSize: 17,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
    height: 48,
  },
  splitHint: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginBottom: 14,
    marginTop: -4,
  },
  colorPickerRow: {
    paddingVertical: 6,
    paddingHorizontal: 2,
    gap: 10,
    flexDirection: 'row',
    marginBottom: 4,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: '#ffffff',
  },
  colorSwatchInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Rest day row (inline)
  splitDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  splitDayIndex: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    width: 20,
    textAlign: 'center',
  },
  splitRestChip: {
    flex: 1,
    backgroundColor: 'rgba(90, 108, 125, 0.1)',
    borderRadius: 14,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitRestText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
  },
  // Training day card
  trainingDayCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    padding: 16,
    marginBottom: 12,
  },
  trainingDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  splitDayInputWrap: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  splitDayInput: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
    height: 44,
  },
  // Exercises inside training day
  exercisesLabel: {
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  exerciseRow: {
    flexDirection: 'column',
    marginBottom: 10,
  },
  exerciseDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  exThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  exThumb: {
    width: 44,
    height: 44,
  },
  exName: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    lineHeight: 18,
  },
  setsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setsText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    minWidth: 72,
    textAlign: 'center',
  },
  setsBreakdown: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    marginTop: 5,
    paddingLeft: 4,
  },
  targetRepsInput: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 90,
  },
  addExerciseBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(90, 108, 125, 0.35)',
    borderStyle: 'dashed',
    marginTop: 2,
  },
  addExerciseText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
  },
  trainingDayTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
  },
  sessionBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addSessionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 14,
  },
  // Add day buttons
  splitAddRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 8,
    marginBottom: 8,
  },
  splitAddBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  splitAddRestBtn: {
    backgroundColor: 'rgba(90, 108, 125, 0.08)',
    borderColor: '#ffffffcc',
  },
  splitAddText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  // Save
  saveButton: {
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  floatingSaveButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 24,
    left: 24,
    right: 24,
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 20,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#1C1C1E',
    letterSpacing: 0.4,
  },
});
