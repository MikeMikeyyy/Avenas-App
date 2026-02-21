import React, { useRef, useState } from 'react';
import { getDayLabel } from '../programStore';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  Animated,
  Alert,
} from 'react-native';
import { workoutState } from '../workoutState';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { useProgramStore } from '../programStore';
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

export default function ProgramsScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });
  const { programs, activeId, setActive, deleteProgram: removeProgram, sharedPrograms, saveSharedProgram, removeSharedProgram } = useProgramStore();
  const { isDark, colors } = useTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!fontsLoaded) return null;

  const activeProgram = programs.find(p => p.id === activeId);
  const otherPrograms = programs.filter(p => p.id !== activeId);

  const handleMakeActive = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setActive(id);
    setExpandedId(null);
  };

  const handleRestartCycle = () => {
    if (!activeProgram) return;
    const firstDayLabel = getDayLabel(activeProgram.splitDays[0]);
    Alert.alert(
      'Restart Program Cycle',
      `Today will reset to Day 1 (${firstDayLabel}). The cycle will advance each day from here.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restart', style: 'default', onPress: () => {
          workoutState.resetCycleOffset(activeId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }},
      ]
    );
  };

  const handleDelete = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removeProgram(id);
    setExpandedId(null);
  };

  const handleEdit = (id: string) => {
    setExpandedId(null);
    router.push(`/create-program?editId=${id}`);
  };

  const toggleExpand = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedId(prev => prev === id ? null : id);
  };

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
      >
        <Text style={styles.screenTitle}>My Programs</Text>

        {/* Active Program */}
        {activeProgram && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>ACTIVE PROGRAM</Text>
            <View style={[styles.programCard, styles.activeCard, { borderColor: activeProgram.color, backgroundColor: `${activeProgram.color}14` }]}>
              <View style={styles.programCardHeader}>
                <View>
                  <Text style={[styles.programName, { color: colors.primaryText }]}>{activeProgram.name}</Text>
                  <Text style={[styles.programFullName, { color: colors.secondaryText }]}>{activeProgram.splitDays.filter(d => d.type === 'training').length} training days · {activeProgram.splitDays.length} day cycle</Text>
                </View>
                <View style={[styles.activeBadge, { backgroundColor: `${activeProgram.color}40`, borderColor: `${activeProgram.color}80` }]}>
                  <Text style={[styles.activeBadgeText, { color: colors.primaryText }]}>Active</Text>
                </View>
              </View>
              <View style={styles.daysRow}>
                {activeProgram.splitDays.map((day, i) => {
                  const label = getDayLabel(day);
                  return (
                    <View key={i} style={[styles.dayChip, day.type !== 'rest' && { backgroundColor: `${activeProgram.color}1F` }, day.type === 'rest' && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(90, 108, 125, 0.1)' }]}>
                      <Text style={[styles.dayChipText, { color: colors.primaryText }, day.type === 'rest' && { color: colors.secondaryText }]}>{label}</Text>
                    </View>
                  );
                })}
              </View>
              <TouchableOpacity
                style={[styles.restartRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(90, 108, 125, 0.15)' }]}
                onPress={handleRestartCycle}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={15} color={colors.secondaryText} />
                <Text style={[styles.restartRowText, { color: colors.secondaryText }]}>Restart from Day 1</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Other Programs */}
        {otherPrograms.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>OTHER PROGRAMS</Text>
            {otherPrograms.map(program => {
              const isExpanded = expandedId === program.id;
              return (
                <View key={program.id}>
                  <BounceButton style={[styles.programCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]} onPress={() => toggleExpand(program.id)}>
                    <View style={styles.programCardHeader}>
                      <View>
                        <Text style={[styles.programName, { color: colors.primaryText }]}>{program.name}</Text>
                        <Text style={[styles.programFullName, { color: colors.secondaryText }]}>{program.splitDays.filter(d => d.type === 'training').length} training days · {program.splitDays.length} day cycle</Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                        size={22}
                        color={colors.secondaryText}
                      />
                    </View>
                    <View style={styles.daysRow}>
                      {program.splitDays.map((day, i) => {
                        const label = getDayLabel(day);
                        return (
                          <View key={i} style={[styles.dayChip, day.type !== 'rest' && { backgroundColor: `${program.color}1F` }, day.type === 'rest' && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(90, 108, 125, 0.1)' }]}>
                            <Text style={[styles.dayChipText, { color: colors.primaryText }, day.type === 'rest' && { color: colors.secondaryText }]}>{label}</Text>
                          </View>
                        );
                      })}
                    </View>
                    {isExpanded && (
                      <View style={[styles.actionsRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(90, 108, 125, 0.15)' }]}>
                        <BounceButton style={styles.actionBtnActive} onPress={() => handleMakeActive(program.id)}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="checkmark-circle-outline" size={18} color={colors.primaryText} />
                            <Text style={[styles.actionBtnActiveText, { color: colors.primaryText }]}>Make Active</Text>
                          </View>
                        </BounceButton>
                        <BounceButton style={styles.actionBtnEdit} onPress={() => handleEdit(program.id)}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="create-outline" size={18} color={colors.primaryText} />
                            <Text style={[styles.actionBtnEditText, { color: colors.primaryText }]}>Edit</Text>
                          </View>
                        </BounceButton>
                        <BounceButton style={styles.actionBtnDelete} onPress={() => handleDelete(program.id)}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="trash-outline" size={18} color="#e74c3c" />
                            <Text style={styles.actionBtnDeleteText}>Delete</Text>
                          </View>
                        </BounceButton>
                      </View>
                    )}
                  </BounceButton>
                </View>
              );
            })}
          </>
        )}

        {/* Shared With Me */}
        {sharedPrograms.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>SHARED WITH ME</Text>
            {sharedPrograms.map(program => {
              const isExpanded = expandedId === program.id;
              return (
                <View key={program.id}>
                  <BounceButton style={[styles.programCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder, borderLeftColor: program.color, borderLeftWidth: 4 }]} onPress={() => toggleExpand(program.id)}>
                    <View style={styles.programCardHeader}>
                      <View>
                        <Text style={[styles.programName, { color: colors.primaryText }]}>{program.name}</Text>
                        <Text style={[styles.programFullName, { color: colors.secondaryText }]}>From {program.sharedBy} · {program.splitDays.filter(d => d.type === 'training').length} training days</Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                        size={22}
                        color={colors.secondaryText}
                      />
                    </View>
                    <View style={styles.daysRow}>
                      {program.splitDays.map((day, i) => {
                        const label = getDayLabel(day);
                        return (
                          <View key={i} style={[styles.dayChip, day.type !== 'rest' && { backgroundColor: `${program.color}1F` }, day.type === 'rest' && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(90, 108, 125, 0.1)' }]}>
                            <Text style={[styles.dayChipText, { color: colors.primaryText }, day.type === 'rest' && { color: colors.secondaryText }]}>{label}</Text>
                          </View>
                        );
                      })}
                    </View>
                    {isExpanded && (
                      <View style={[styles.actionsRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(90, 108, 125, 0.15)' }]}>
                        <BounceButton style={styles.actionBtnActive} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); saveSharedProgram(program.id); setExpandedId(null); }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="download-outline" size={18} color={colors.primaryText} />
                            <Text style={[styles.actionBtnActiveText, { color: colors.primaryText }]}>Save</Text>
                          </View>
                        </BounceButton>
                        <BounceButton style={styles.actionBtnDelete} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); removeSharedProgram(program.id); setExpandedId(null); }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="trash-outline" size={18} color="#e74c3c" />
                            <Text style={styles.actionBtnDeleteText}>Remove</Text>
                          </View>
                        </BounceButton>
                      </View>
                    )}
                  </BounceButton>
                </View>
              );
            })}
          </>
        )}

        {/* Create New Program Button */}
        <BounceButton
          style={styles.createButton}
          onPress={() => router.push('/create-program')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="add-circle-outline" size={22} color="#1C1C1E" />
            <Text style={styles.createButtonText}>Create New Program</Text>
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
  programCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    padding: 18,
    marginBottom: 12,
  },
  activeCard: {
    borderColor: '#47DDFF',
    borderWidth: 2,
    backgroundColor: 'rgba(71, 221, 255, 0.08)',
  },
  programCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  programName: {
    fontSize: 20,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  programFullName: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 2,
  },
  activeBadge: {
    backgroundColor: 'rgba(0, 235, 172, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 235, 172, 0.5)',
  },
  activeBadgeText: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    letterSpacing: 0.5,
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayChip: {
    backgroundColor: 'rgba(71, 221, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  dayChipRest: {
    backgroundColor: 'rgba(90, 108, 125, 0.1)',
  },
  dayChipText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  dayChipTextRest: {
    color: '#5a6c7d',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(90, 108, 125, 0.15)',
  },
  actionBtnActive: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 235, 172, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0, 235, 172, 0.4)',
  },
  actionBtnActiveText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  actionBtnEdit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(71, 221, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(71, 221, 255, 0.3)',
  },
  actionBtnEditText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  actionBtnDelete: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.25)',
  },
  actionBtnDeleteText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    color: '#e74c3c',
  },
  restartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  restartRowText: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
  },
  createButton: {
    backgroundColor: '#47DDFF',
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  createButtonText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#1C1C1E',
    letterSpacing: 0.4,
  },
});
