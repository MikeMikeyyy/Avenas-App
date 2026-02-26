import React, { useRef, useState } from 'react';
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
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { useProgramStore, PROGRAM_COLORS, type Exercise, type SplitDay } from '../programStore';
import { useTheme } from '../themeStore';

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
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { programs, addProgram, updateProgram, setActive } = useProgramStore();
  const { isDark, colors } = useTheme();
  const editingProgram = editId ? programs.find(p => p.id === editId) : undefined;
  const [programName, setProgramName] = useState(editingProgram?.name || '');
  const [selectedColor, setSelectedColor] = useState(editingProgram?.color || PROGRAM_COLORS[0]);
  const [splitDays, setSplitDays] = useState<SplitDay[]>(editingProgram?.splitDays || []);

  if (!fontsLoaded) return null;

  const addTrainingDay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSplitDays(prev => [...prev, { type: 'training', sessions: [{ label: '', exercises: [{ name: '', sets: 3 }] }] }]);
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

  const addExerciseToSession = (dayIndex: number, sessionIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSplitDays(prev => {
      const next = [...prev];
      const day = next[dayIndex];
      if (day.type === 'training') {
        const sessions = [...day.sessions];
        sessions[sessionIndex] = { ...sessions[sessionIndex], exercises: [...sessions[sessionIndex].exercises, { name: '', sets: 3 }] };
        next[dayIndex] = { ...day, sessions };
      }
      return next;
    });
  };

  const updateExercise = (dayIndex: number, sessionIndex: number, exIndex: number, field: 'name' | 'sets' | 'warmupSets', value: string | number) => {
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
        next[dayIndex] = { ...day, sessions: [...day.sessions, { label: '', exercises: [{ name: '', sets: 3 }] }] };
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
        <Text style={styles.screenTitle}>{editId ? 'Edit Program' : 'Create Program'}</Text>

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
                <TouchableOpacity
                  onPress={() => removeSplitDay(i)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
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
                <TouchableOpacity
                  onPress={() => removeSplitDay(i)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
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
                  {session.exercises.map((ex, j) => (
                    <View key={j} style={styles.exerciseRow}>
                      {/* Name row */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={[styles.exerciseInputWrap, { flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255, 255, 255, 0.4)', borderColor: colors.cardBorder }]}>
                          <TextInput
                            style={[styles.exerciseInput, { color: colors.primaryText }]}
                            placeholder={`Exercise ${j + 1}`}
                            placeholderTextColor={colors.tertiaryText}
                            value={ex.name}
                            onChangeText={(v) => updateExercise(i, si, j, 'name', v)}
                            returnKeyType="done"
                            onSubmitEditing={Keyboard.dismiss}
                          />
                        </View>
                        {session.exercises.length > 1 && (
                          <TouchableOpacity
                            onPress={() => removeExercise(i, si, j)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="trash-outline" size={20} color="#e74c3c" />
                          </TouchableOpacity>
                        )}
                      </View>
                      {/* Sets controls row */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 8, paddingLeft: 4 }}>
                        <View style={styles.setsWrap}>
                          <TouchableOpacity
                            onPress={() => updateExercise(i, si, j, 'sets', Math.max(1, ex.sets - 1))}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="remove-circle-outline" size={22} color={colors.secondaryText} />
                          </TouchableOpacity>
                          <Text style={[styles.setsText, { color: colors.primaryText }]}>{ex.sets} sets</Text>
                          <TouchableOpacity
                            onPress={() => updateExercise(i, si, j, 'sets', ex.sets + 1)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="add-circle-outline" size={22} color={colors.secondaryText} />
                          </TouchableOpacity>
                        </View>
                        {ex.sets > 1 && (
                          <View style={styles.setsWrap}>
                            <TouchableOpacity
                              onPress={() => updateExercise(i, si, j, 'warmupSets', Math.max(0, (ex.warmupSets ?? 0) - 1))}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="remove-circle-outline" size={22} color={colors.secondaryText} />
                            </TouchableOpacity>
                            <Text style={[styles.setsText, { color: colors.tertiaryText }]}>{ex.warmupSets ?? 0} warmup</Text>
                            <TouchableOpacity
                              onPress={() => updateExercise(i, si, j, 'warmupSets', Math.min(ex.sets - 1, (ex.warmupSets ?? 0) + 1))}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
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
                    </View>
                  ))}
                  <BounceButton style={[styles.addExerciseBtn, { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(90, 108, 125, 0.35)' }]} onPress={() => addExerciseToSession(i, si)}>
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

        {/* Save Button */}
        <BounceButton
          style={[styles.saveButton, { backgroundColor: selectedColor }]}
          onPress={() => {
            const name = programName || 'Untitled Program';
            if (editId) {
              updateProgram(editId, name, selectedColor, splitDays);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } else {
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
            }
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.saveButtonText, { color: isLightColor(selectedColor) ? '#1C1C1E' : '#ffffff' }]}>Save Program</Text>
            <Ionicons name="checkmark" size={22} color={isLightColor(selectedColor) ? '#1C1C1E' : '#ffffff'} />
          </View>
        </BounceButton>
      </ScrollView>

      {/* Floating back button — rendered after ScrollView so it sits on top */}
      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.backButtonBg }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
      </TouchableOpacity>
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
  exercisesContainer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(90, 108, 125, 0.15)',
  },
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
  exerciseInputWrap: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  exerciseInput: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
    height: 44,
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
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#1C1C1E',
    letterSpacing: 0.4,
  },
});
