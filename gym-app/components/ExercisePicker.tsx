import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  FlatList,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../themeStore';

import exerciseDbRaw from '../assets/data/exercises.json';

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const CUSTOM_KEY = '@custom_exercises';
const MUSCLE_ORDER = [
  'Chest',
  'Lats', 'Mid Back', 'Lower Back', 'Traps',
  'Shoulders',
  'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Calves',
  'Core',
  'Abductors', 'Adductors',
  'Neck', 'Full Body',
];

type BundledExercise = { id: string; name: string; muscle: string; image: string; instructions: string[] };
const exerciseDb = exerciseDbRaw as BundledExercise[];

type CustomExercise = { name: string; notes: string };

type HeaderItem = { type: 'header'; label: string };
type ExerciseItem = { type: 'exercise'; id: string; name: string; muscle: string; image: string; isCustom: boolean; instructions: string[]; customIndex?: number; notes?: string };
type ListItem = HeaderItem | ExerciseItem;

function getImageUrl(imagePath: string): string {
  return IMAGE_BASE + imagePath.split('/').map(encodeURIComponent).join('/');
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (name: string) => void;
}

export function ExercisePicker({ visible, onDismiss, onSelect }: Props) {
  const { isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [customExercises, setCustomExercises] = useState<CustomExercise[]>([]);
  const [newCustomName, setNewCustomName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [detailItem, setDetailItem] = useState<ExerciseItem | null>(null);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [editCustomItem, setEditCustomItem] = useState<{ index: number; name: string; notes: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onSelectRef = useRef(onSelect);
  const onDismissRef = useRef(onDismiss);
  onSelectRef.current = onSelect;
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(CUSTOM_KEY).then(raw => {
        if (!raw) { setCustomExercises([]); return; }
        const parsed = JSON.parse(raw);
        // Migrate old string[] format to CustomExercise[]
        if (parsed.length > 0 && typeof parsed[0] === 'string') {
          const migrated: CustomExercise[] = parsed.map((name: string) => ({ name, notes: '' }));
          AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(migrated));
          setCustomExercises(migrated);
        } else {
          setCustomExercises(parsed);
        }
      }).catch(() => { setCustomExercises([]); });
      setQuery('');
      setShowCustomInput(false);
      setNewCustomName('');
      setDetailItem(null);
      setSelectedMuscle(null);
      setEditCustomItem(null);
      setConfirmDelete(false);
    }
  }, [visible]);

  const handleSelect = useCallback((name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectRef.current(name);
    onDismissRef.current();
  }, []);

  const saveCustom = useCallback(async () => {
    const trimmed = newCustomName.trim();
    if (!trimmed) return;
    const updated: CustomExercise[] = [{ name: trimmed, notes: '' }, ...customExercises];
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(updated));
    setCustomExercises(updated);
    Keyboard.dismiss();
    handleSelect(trimmed);
  }, [newCustomName, customExercises, handleSelect]);

  const deleteCustomExercise = useCallback(async () => {
    if (!editCustomItem) return;
    const updated = customExercises.filter((_, i) => i !== editCustomItem.index);
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(updated));
    setCustomExercises(updated);
    setEditCustomItem(null);
    setConfirmDelete(false);
  }, [editCustomItem, customExercises]);

  const saveEditCustom = useCallback(async () => {
    if (!editCustomItem) return;
    const trimmedName = editCustomItem.name.trim();
    if (!trimmedName) return;
    const updated = [...customExercises];
    updated[editCustomItem.index] = { name: trimmedName, notes: editCustomItem.notes };
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(updated));
    setCustomExercises(updated);
    setEditCustomItem(null);
  }, [editCustomItem, customExercises]);

  const availableMuscles = useMemo(
    () => MUSCLE_ORDER.filter(m => exerciseDb.some(e => e.muscle === m)),
    [],
  );

  const listItems = useMemo((): ListItem[] => {
    const q = query.toLowerCase().trim();

    if (q || selectedMuscle) {
      // Show custom exercises only when searching (not when just filtering by muscle)
      // Map first (to preserve original index), then filter — so customIndex matches the position in customExercises
      const customMatches = (q && !selectedMuscle)
        ? customExercises
            .map((ex, origIndex): ExerciseItem => ({ type: 'exercise', id: `custom-${origIndex}`, name: ex.name, muscle: 'My Exercises', image: '', isCustom: true, instructions: [], customIndex: origIndex, notes: ex.notes }))
            .filter(item => item.name.toLowerCase().includes(q))
        : [];

      let dbPool = selectedMuscle ? exerciseDb.filter(e => e.muscle === selectedMuscle) : exerciseDb;
      if (q) dbPool = dbPool.filter(e => e.name.toLowerCase().includes(q));

      const dbMatches = dbPool.map((e): ExerciseItem => ({
        type: 'exercise', id: e.id, name: e.name, muscle: e.muscle, image: e.image, isCustom: false, instructions: e.instructions ?? [],
      }));
      return [...customMatches, ...dbMatches];
    }

    const items: ListItem[] = [];

    if (customExercises.length > 0) {
      items.push({ type: 'header', label: 'MY EXERCISES' });
      customExercises.forEach((ex, i) => {
        items.push({ type: 'exercise', id: `custom-${i}`, name: ex.name, muscle: 'My Exercises', image: '', isCustom: true, instructions: [], customIndex: i, notes: ex.notes });
      });
    }

    const grouped: Record<string, BundledExercise[]> = {};
    exerciseDb.forEach(e => {
      if (!grouped[e.muscle]) grouped[e.muscle] = [];
      grouped[e.muscle].push(e);
    });

    MUSCLE_ORDER.filter(m => grouped[m]).forEach(muscle => {
      items.push({ type: 'header', label: muscle.toUpperCase() });
      grouped[muscle].forEach(e => {
        items.push({ type: 'exercise', id: e.id, name: e.name, muscle: e.muscle, image: e.image, isCustom: false, instructions: e.instructions ?? [] });
      });
    });

    return items;
  }, [query, customExercises, selectedMuscle]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <View style={[styles.sectionHeader, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]}>
          <Text style={[styles.sectionHeaderText, { color: colors.secondaryText }]}>{item.label}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.exerciseRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
        {/* Main tap area — adds the exercise */}
        <TouchableOpacity
          style={styles.exerciseRowMain}
          onPress={() => handleSelect(item.name)}
          activeOpacity={0.55}
        >
          <View style={[styles.thumbWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
            {item.isCustom || !item.image ? (
              <Ionicons name="barbell-outline" size={22} color={colors.tertiaryText} />
            ) : (
              <Image
                source={{ uri: getImageUrl(item.image) }}
                style={styles.thumb}
                contentFit="cover"
                transition={200}
              />
            )}
          </View>
          <View style={styles.exerciseInfo}>
            <Text style={[styles.exerciseName, { color: colors.primaryText }]} numberOfLines={2}>{item.name}</Text>
            {(query.length > 0 || item.isCustom || !!selectedMuscle) && (
              <Text style={[styles.exerciseMuscle, { color: colors.tertiaryText }]}>{item.muscle}</Text>
            )}
          </View>
          <Ionicons name="add-circle-outline" size={22} color={colors.tertiaryText} />
        </TouchableOpacity>
        {/* Info / Edit button */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (item.isCustom) {
              setEditCustomItem({ index: item.customIndex ?? 0, name: item.name, notes: item.notes ?? '' });
            } else {
              setDetailItem(item);
            }
          }}
          hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
          style={styles.infoBtn}
        >
          <Ionicons name={item.isCustom ? 'create-outline' : 'information-circle-outline'} size={22} color={colors.tertiaryText} />
        </TouchableOpacity>
      </View>
    );
  }, [isDark, colors, query, selectedMuscle, handleSelect]);

  const getItemType = useCallback((item: ListItem) => item.type, []);
  const keyExtractor = useCallback((item: ListItem, i: number) =>
    item.type === 'header' ? `h-${item.label}` : `${item.id}-${i}`, []);

  const bgColor = isDark ? '#1C1C1E' : '#F2F2F7';
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const screenWidth = Dimensions.get('window').width;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onDismiss}
    >
      <View style={[styles.container, { backgroundColor: bgColor, paddingTop: Platform.OS === 'ios' ? 12 : insets.top }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Add Exercise</Text>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={28} color={colors.tertiaryText} />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={[styles.searchWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)' }]}>
          <Ionicons name="search" size={16} color={colors.tertiaryText} />
          <TextInput
            style={[styles.searchInput, { color: colors.primaryText }]}
            placeholder="Search exercises…"
            placeholderTextColor={colors.tertiaryText}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.tertiaryText} />
            </TouchableOpacity>
          )}
        </View>

        {/* Muscle filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
          keyboardShouldPersistTaps="handled"
        >
          {(['All', ...availableMuscles] as const).map(m => {
            const active = m === 'All' ? !selectedMuscle : selectedMuscle === m;
            return (
              <TouchableOpacity
                key={m}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? '#47DDFF' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                    borderColor: active ? '#47DDFF' : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'),
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedMuscle(m === 'All' ? null : (selectedMuscle === m ? null : m));
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, { color: active ? '#1C1C1E' : colors.secondaryText }]}>
                  {m}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Create custom exercise */}
        <View style={[styles.customSection, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            style={styles.customBtn}
            onPress={() => { setShowCustomInput(v => !v); setNewCustomName(''); }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showCustomInput ? 'chevron-down' : 'add-circle-outline'}
              size={20}
              color={colors.secondaryText}
            />
            <Text style={[styles.customBtnText, { color: colors.secondaryText }]}>Create Custom Exercise</Text>
          </TouchableOpacity>
          {showCustomInput && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={[styles.customInputRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                <TextInput
                  style={[styles.customInput, {
                    color: colors.primaryText,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
                  }]}
                  placeholder="Exercise name…"
                  placeholderTextColor={colors.tertiaryText}
                  value={newCustomName}
                  onChangeText={setNewCustomName}
                  returnKeyType="done"
                  onSubmitEditing={saveCustom}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.saveCustomBtn, { opacity: newCustomName.trim() ? 1 : 0.4 }]}
                  onPress={saveCustom}
                  activeOpacity={0.8}
                >
                  <Text style={styles.saveCustomBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}
        </View>

        {/* Exercise list */}
        <FlatList
          data={listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        />
      </View>

      {/* Exercise detail modal */}
      {detailItem && (
        <Modal
          visible={!!detailItem}
          animationType="slide"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
          onRequestClose={() => setDetailItem(null)}
        >
          <View style={[styles.detailContainer, { backgroundColor: bgColor, paddingTop: Platform.OS === 'ios' ? 12 : insets.top }]}>
            {/* Detail header */}
            <View style={[styles.header, { borderBottomColor: borderColor }]}>
              <TouchableOpacity onPress={() => setDetailItem(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
              </TouchableOpacity>
              <Text style={[styles.detailHeaderTitle, { color: colors.primaryText }]} numberOfLines={2}>
                {detailItem.name}
              </Text>
              <View style={{ width: 28 }} />
            </View>

            <ScrollView
              contentContainerStyle={[styles.detailScroll, { paddingBottom: insets.bottom + 100 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Image */}
              {!detailItem.isCustom && detailItem.image ? (
                <Image
                  source={{ uri: getImageUrl(detailItem.image) }}
                  style={[styles.detailImage, { width: screenWidth }]}
                  contentFit="cover"
                  transition={300}
                />
              ) : (
                <View style={[styles.detailImagePlaceholder, { width: screenWidth, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                  <Ionicons name="barbell-outline" size={64} color={colors.tertiaryText} />
                </View>
              )}

              <View style={styles.detailBody}>
                {/* Muscle badge */}
                <View style={[styles.muscleBadge, { backgroundColor: isDark ? 'rgba(71,221,255,0.15)' : 'rgba(71,221,255,0.2)', borderColor: 'rgba(71,221,255,0.4)' }]}>
                  <Ionicons name="body-outline" size={13} color="#47DDFF" />
                  <Text style={styles.muscleBadgeText}>{detailItem.muscle}</Text>
                </View>

                {/* Instructions */}
                {detailItem.instructions.length > 0 ? (
                  <>
                    <Text style={[styles.detailSectionLabel, { color: colors.secondaryText }]}>HOW TO PERFORM</Text>
                    {detailItem.instructions.map((step, idx) => (
                      <View key={idx} style={[styles.instructionRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                        <View style={[styles.instructionNum, { backgroundColor: isDark ? 'rgba(71,221,255,0.15)' : 'rgba(71,221,255,0.2)' }]}>
                          <Text style={styles.instructionNumText}>{idx + 1}</Text>
                        </View>
                        <Text style={[styles.instructionText, { color: colors.primaryText }]}>{step}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={[styles.noInstructions, { color: colors.tertiaryText }]}>No instructions available for this exercise.</Text>
                )}
              </View>
            </ScrollView>

            {/* Add button */}
            <View style={[styles.detailFooter, { borderTopColor: borderColor, paddingBottom: insets.bottom + 12, backgroundColor: bgColor }]}>
              <TouchableOpacity
                style={styles.detailAddBtn}
                onPress={() => { setDetailItem(null); handleSelect(detailItem.name); }}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={22} color="#1C1C1E" />
                <Text style={styles.detailAddBtnText}>Add to Program</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Edit custom exercise modal */}
      {editCustomItem && (
        <Modal
          visible={!!editCustomItem}
          animationType="slide"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
          onRequestClose={() => { setEditCustomItem(null); setConfirmDelete(false); }}
        >
          <KeyboardAvoidingView
            style={[styles.detailContainer, { backgroundColor: bgColor, paddingTop: Platform.OS === 'ios' ? 12 : insets.top }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: borderColor }]}>
              <TouchableOpacity onPress={() => setEditCustomItem(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={26} color={colors.primaryText} />
              </TouchableOpacity>
              <Text
                style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 16, fontFamily: 'Arimo_700Bold', color: colors.primaryText }}
                numberOfLines={1}
                pointerEvents="none"
              >Edit Exercise</Text>
              <TouchableOpacity
                onPress={saveEditCustom}
                style={[styles.editSaveBtn, { opacity: editCustomItem.name.trim() ? 1 : 0.4 }]}
                activeOpacity={0.8}
              >
                <Text style={styles.editSaveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={[styles.detailBody, { paddingBottom: insets.bottom + 40 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Name */}
              <Text style={[styles.detailSectionLabel, { color: colors.secondaryText, marginTop: 8 }]}>EXERCISE NAME</Text>
              <TextInput
                style={[styles.editInput, {
                  color: colors.primaryText,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                  borderColor: borderColor,
                }]}
                value={editCustomItem.name}
                onChangeText={v => setEditCustomItem(prev => prev ? { ...prev, name: v } : prev)}
                placeholder="Exercise name"
                placeholderTextColor={colors.tertiaryText}
                returnKeyType="next"
              />

              {/* Notes */}
              <Text style={[styles.detailSectionLabel, { color: colors.secondaryText, marginTop: 20 }]}>COMMENTARY / NOTES</Text>
              <TextInput
                style={[styles.editTextarea, {
                  color: colors.primaryText,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                  borderColor: borderColor,
                }]}
                value={editCustomItem.notes}
                onChangeText={v => setEditCustomItem(prev => prev ? { ...prev, notes: v } : prev)}
                placeholder="Add coaching cues, tips, or notes about this exercise…"
                placeholderTextColor={colors.tertiaryText}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />

              {/* Delete section */}
              <View style={[styles.deleteSection, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
                {!confirmDelete ? (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setConfirmDelete(true); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                    <Text style={styles.deleteBtnText}>Delete Exercise</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.confirmDeleteWrap}>
                    <Text style={[styles.confirmDeleteMsg, { color: colors.secondaryText }]}>
                      Permanently delete "{editCustomItem.name}"?
                    </Text>
                    <View style={styles.confirmDeleteRow}>
                      <TouchableOpacity
                        style={[styles.confirmBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                        onPress={() => setConfirmDelete(false)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.confirmBtnText, { color: colors.primaryText }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.confirmBtn, { backgroundColor: '#FF3B30' }]}
                        onPress={deleteCustomExercise}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.confirmBtnText, { color: '#fff' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    padding: 0,
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },
  customSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  customBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  customBtnText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  customInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
  },
  saveCustomBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#47DDFF',
  },
  saveCustomBtnText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#1C1C1E',
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
    letterSpacing: 1,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exerciseRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  infoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  thumbWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumb: {
    width: 48,
    height: 48,
  },
  exerciseInfo: {
    flex: 1,
    gap: 2,
  },
  exerciseName: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    lineHeight: 18,
  },
  exerciseMuscle: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
  },
  // Detail modal
  detailContainer: {
    flex: 1,
  },
  detailHeaderTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  detailImage: {
    height: 260,
  },
  detailImagePlaceholder: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  muscleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 20,
  },
  muscleBadgeText: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#47DDFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailSectionLabel: {
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
    letterSpacing: 1,
    marginBottom: 12,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  instructionNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  instructionNumText: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#47DDFF',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    lineHeight: 21,
  },
  noInstructions: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    fontStyle: 'italic',
    marginTop: 8,
  },
  detailScroll: {
    paddingBottom: 100,
  },
  detailFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#47DDFF',
    borderRadius: 16,
    height: 52,
  },
  detailAddBtnText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#1C1C1E',
  },
  editSaveBtn: {
    backgroundColor: '#47DDFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  editSaveBtnText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#1C1C1E',
  },
  editInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    marginTop: 8,
  },
  editTextarea: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    marginTop: 8,
    minHeight: 130,
  },
  deleteSection: {
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
  },
  deleteBtnText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  confirmDeleteWrap: {
    gap: 12,
  },
  confirmDeleteMsg: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    lineHeight: 18,
  },
  confirmDeleteRow: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
  },
});
