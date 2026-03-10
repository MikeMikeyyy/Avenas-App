import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Platform,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { useTheme } from '../themeStore';
import exerciseDbRaw from '../assets/data/exercises.json';

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const screenWidth = Dimensions.get('window').width;

type DbExercise = { id: string; name: string; muscle: string; image: string; instructions: string[] };
const exerciseDb = exerciseDbRaw as DbExercise[];
const exerciseByName: Record<string, DbExercise> = {};
exerciseDb.forEach(e => { if (e.name) exerciseByName[e.name] = e; });

function getImageUrl(imagePath: string): string {
  return IMAGE_BASE + imagePath.split('/').map(encodeURIComponent).join('/');
}

interface Props {
  exerciseName: string | null;
  onClose: () => void;
}

export function ExerciseInfoModal({ exerciseName, onClose }: Props) {
  const { isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });

  const exercise = exerciseName ? exerciseByName[exerciseName] : null;
  const bgColor = isDark ? '#1C1C1E' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  if (!fontsLoaded) return null;

  return (
    <Modal
      visible={!!exerciseName}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: bgColor, paddingTop: Platform.OS === 'ios' ? 12 : insets.top }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.primaryText }]} numberOfLines={2}>
            {exerciseName}
          </Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Image */}
          {exercise?.image ? (
            <Image
              source={{ uri: getImageUrl(exercise.image) }}
              style={[styles.image, { width: screenWidth }]}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <View style={[styles.imagePlaceholder, { width: screenWidth, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
              <Ionicons name="barbell-outline" size={64} color={colors.tertiaryText} />
            </View>
          )}

          <View style={styles.body}>
            {/* Muscle badge */}
            {exercise?.muscle ? (
              <View style={[styles.muscleBadge, { backgroundColor: isDark ? 'rgba(71,221,255,0.15)' : 'rgba(71,221,255,0.2)', borderColor: 'rgba(71,221,255,0.4)' }]}>
                <Ionicons name="body-outline" size={13} color="#47DDFF" />
                <Text style={styles.muscleBadgeText}>{exercise.muscle}</Text>
              </View>
            ) : (
              <View style={[styles.muscleBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderColor: borderColor }]}>
                <Ionicons name="create-outline" size={13} color={colors.tertiaryText} />
                <Text style={[styles.muscleBadgeText, { color: colors.tertiaryText }]}>CUSTOM EXERCISE</Text>
              </View>
            )}

            {/* Instructions */}
            {exercise?.instructions && exercise.instructions.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>HOW TO PERFORM</Text>
                {exercise.instructions.map((step, idx) => (
                  <View key={idx} style={[styles.instructionRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                    <View style={[styles.instructionNum, { backgroundColor: isDark ? 'rgba(71,221,255,0.15)' : 'rgba(71,221,255,0.2)' }]}>
                      <Text style={styles.instructionNumText}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.instructionText, { color: colors.primaryText }]}>{step}</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={[styles.noInstructions, { color: colors.tertiaryText }]}>
                {exercise ? 'No instructions available for this exercise.' : 'This is a custom exercise with no instructions.'}
              </Text>
            )}
          </View>
        </ScrollView>
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
    flex: 1,
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  scroll: {
    paddingBottom: 40,
  },
  image: {
    height: 260,
  },
  imagePlaceholder: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
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
  sectionLabel: {
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
});
