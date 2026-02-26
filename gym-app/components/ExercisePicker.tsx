import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../themeStore';

import exerciseDbRaw from '../assets/data/exercises.json';

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const CUSTOM_KEY = '@custom_exercises';
const MUSCLE_ORDER = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Core & Hips', 'Full Body'];

type BundledExercise = { id: string; name: string; muscle: string; image: string };
const exerciseDb = exerciseDbRaw as BundledExercise[];

type HeaderItem = { type: 'header'; label: string };
type ExerciseItem = { type: 'exercise'; id: string; name: string; muscle: string; image: string; isCustom: boolean };
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
  const [customExercises, setCustomExercises] = useState<string[]>([]);
  const [newCustomName, setNewCustomName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const onSelectRef = useRef(onSelect);
  const onDismissRef = useRef(onDismiss);
  onSelectRef.current = onSelect;
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(CUSTOM_KEY).then(raw => {
        setCustomExercises(raw ? JSON.parse(raw) : []);
      });
      setQuery('');
      setShowCustomInput(false);
      setNewCustomName('');
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
    const updated = [trimmed, ...customExercises];
    await AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(updated));
    setCustomExercises(updated);
    Keyboard.dismiss();
    handleSelect(trimmed);
  }, [newCustomName, customExercises, handleSelect]);

  const listItems = useMemo((): ListItem[] => {
    const q = query.toLowerCase().trim();

    if (q) {
      const customMatches = customExercises
        .filter(name => name.toLowerCase().includes(q))
        .map((name, i): ExerciseItem => ({ type: 'exercise', id: `custom-${i}`, name, muscle: 'My Exercises', image: '', isCustom: true }));
      const dbMatches = exerciseDb
        .filter(e => e.name.toLowerCase().includes(q))
        .map((e): ExerciseItem => ({ type: 'exercise', ...e, isCustom: false }));
      return [...customMatches, ...dbMatches];
    }

    const items: ListItem[] = [];

    if (customExercises.length > 0) {
      items.push({ type: 'header', label: 'MY EXERCISES' });
      customExercises.forEach((name, i) => {
        items.push({ type: 'exercise', id: `custom-${i}`, name, muscle: 'My Exercises', image: '', isCustom: true });
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
        items.push({ type: 'exercise', id: e.id, name: e.name, muscle: e.muscle, image: e.image, isCustom: false });
      });
    });

    return items;
  }, [query, customExercises]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <View style={[styles.sectionHeader, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]}>
          <Text style={[styles.sectionHeaderText, { color: colors.secondaryText }]}>{item.label}</Text>
        </View>
      );
    }
    return (
      <TouchableOpacity
        style={[styles.exerciseRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}
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
          {(query.length > 0 || item.isCustom) && (
            <Text style={[styles.exerciseMuscle, { color: colors.tertiaryText }]}>{item.muscle}</Text>
          )}
        </View>
        <Ionicons name="add-circle-outline" size={22} color={colors.tertiaryText} />
      </TouchableOpacity>
    );
  }, [isDark, colors, query, handleSelect]);

  const getItemType = useCallback((item: ListItem) => item.type, []);
  const keyExtractor = useCallback((item: ListItem, i: number) =>
    item.type === 'header' ? `h-${item.label}` : `${item.id}-${i}`, []);

  const bgColor = isDark ? '#1C1C1E' : '#F2F2F7';
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

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
        <FlashList
          data={listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          estimatedItemSize={62}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        />
      </View>
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
});
