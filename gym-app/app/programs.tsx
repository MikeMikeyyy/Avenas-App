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
import { BottomSheetModal } from '../components/BottomSheetModal';
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

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

export default function ProgramsScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });
  const { programs, activeId, setActive, deleteProgram: removeProgram, archiveProgram, restoreProgram, sharedPrograms, saveSharedProgram, removeSharedProgram } = useProgramStore();
  const { isDark, colors } = useTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [pendingOffset, setPendingOffset] = useState(0);

  if (!fontsLoaded) return null;

  const activeProgram = programs.find(p => p.id === activeId && !p.archived);
  const otherPrograms = programs.filter(p => p.id !== activeId && !p.archived);
  const archivedPrograms = programs.filter(p => p.archived);

  const handleMakeActive = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setActive(id);
    setExpandedId(null);
  };

  const handleOpenDayPicker = async () => {
    if (!activeProgram) return;
    const offset = await workoutState.getCycleOffset(activeId, activeProgram.splitDays.length);
    setPendingOffset(offset);
    setShowDayPicker(true);
  };

  const handleSaveDayPicker = () => {
    workoutState.setCycleOffset(activeId, pendingOffset);
    setShowDayPicker(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleArchive = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    archiveProgram(id);
    setExpandedId(null);
  };

  const handleRestore = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    restoreProgram(id);
    setExpandedId(null);
  };

  const handleDelete = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete Program',
      'This will permanently remove the program structure. Your workout history will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { removeProgram(id); setExpandedId(null); } },
      ]
    );
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
              <View style={[styles.actionsRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(90, 108, 125, 0.15)' }]}>
                <BounceButton
                  style={[styles.actionBtnActive, { backgroundColor: 'rgba(0, 235, 172, 0.2)', borderColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)' }]}
                  onPress={handleOpenDayPicker}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="today-outline" size={18} color={colors.primaryText} />
                    <Text style={[styles.actionBtnActiveText, { color: colors.primaryText }]}>Set Workout</Text>
                  </View>
                </BounceButton>
                <BounceButton
                  style={[styles.actionBtnEdit, { backgroundColor: 'rgba(71, 221, 255, 0.12)', borderColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)' }]}
                  onPress={() => handleEdit(activeProgram.id)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="create-outline" size={18} color={colors.primaryText} />
                    <Text style={[styles.actionBtnEditText, { color: colors.primaryText }]}>Edit</Text>
                  </View>
                </BounceButton>
                <BounceButton
                  style={[styles.actionBtnArchive, { borderColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)' }]}
                  onPress={() => handleArchive(activeProgram.id)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="archive-outline" size={18} color={colors.primaryText} />
                    <Text style={[styles.actionBtnArchiveText, { color: colors.primaryText }]}>Archive</Text>
                  </View>
                </BounceButton>
              </View>
            </View>
          </>
        )}

        {/* Create New Program Button */}
        <BounceButton
          style={[styles.createButton, { borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)', backgroundColor: colors.cardTranslucent }]}
          onPress={() => router.push('/create-program')}
        >
          <View style={styles.createButtonInner}>
            <View style={[styles.createIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}>
              <Ionicons name="add" size={20} color={colors.primaryText} />
            </View>
            <Text style={[styles.createButtonText, { color: colors.primaryText }]}>New Program</Text>
            <View style={{ flex: 1 }} />
            <Ionicons name="chevron-forward" size={18} color={colors.tertiaryText} />
          </View>
        </BounceButton>

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
                        <BounceButton style={styles.actionBtnArchive} onPress={() => handleArchive(program.id)}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="archive-outline" size={18} color={colors.primaryText} />
                            <Text style={[styles.actionBtnArchiveText, { color: colors.primaryText }]}>Archive</Text>
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
                  <BounceButton style={[styles.programCard, { backgroundColor: `${program.color}12`, borderColor: `${program.color}40` }]} onPress={() => toggleExpand(program.id)}>
                    <View style={styles.programCardHeader}>
                      <View style={[styles.sharedProgramIcon, { backgroundColor: `${program.color}25` }]}>
                        <Ionicons name="barbell-outline" size={20} color={program.color} />
                      </View>
                      <View style={{ flex: 1 }}>
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
                            <Ionicons name="trash-outline" size={18} color={colors.primaryText} />
                            <Text style={[styles.actionBtnDeleteText, { color: colors.primaryText }]}>Remove</Text>
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

        {/* Archived Programs */}
        {archivedPrograms.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>ARCHIVED</Text>
            {archivedPrograms.map(program => {
              const isExpanded = expandedId === program.id;
              return (
                <View key={program.id}>
                  <BounceButton style={[styles.programCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]} onPress={() => toggleExpand(program.id)}>
                    <View style={[styles.programCardHeader, { opacity: 0.6 }]}>
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
                    <View style={[styles.daysRow, { opacity: 0.6 }]}>
                      {program.splitDays.map((day, i) => {
                        const label = getDayLabel(day);
                        return (
                          <View key={i} style={[styles.dayChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(90, 108, 125, 0.1)' }]}>
                            <Text style={[styles.dayChipText, { color: colors.secondaryText }]}>{label}</Text>
                          </View>
                        );
                      })}
                    </View>
                    {isExpanded && (
                      <View style={[styles.actionsRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(90, 108, 125, 0.15)' }]}>
                        <BounceButton style={styles.actionBtnActive} onPress={() => handleRestore(program.id)}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="arrow-undo-outline" size={18} color={colors.primaryText} />
                            <Text style={[styles.actionBtnActiveText, { color: colors.primaryText }]}>Restore</Text>
                          </View>
                        </BounceButton>
                        <BounceButton style={styles.actionBtnDelete} onPress={() => handleDelete(program.id)}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="trash-outline" size={18} color={colors.primaryText} />
                            <Text style={[styles.actionBtnDeleteText, { color: colors.primaryText }]}>Delete</Text>
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

      </ScrollView>

      {/* Floating back button — rendered after ScrollView so it sits on top */}
      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.backButtonBg }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
      </TouchableOpacity>

      {/* Day picker bottom sheet */}
      <BottomSheetModal
        visible={showDayPicker}
        onDismiss={() => setShowDayPicker(false)}
        sheetBackground={colors.modalBg}
        footer={
          <TouchableOpacity
            style={[styles.saveChangesBtn, { backgroundColor: activeProgram?.color ?? '#47DDFF' }]}
            onPress={handleSaveDayPicker}
            activeOpacity={0.85}
          >
            <Text style={[styles.saveChangesBtnText, { color: isLightColor(activeProgram?.color ?? '#47DDFF') ? '#1C1C1E' : '#fff' }]}>Save Changes</Text>
          </TouchableOpacity>
        }
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
          <Text style={[styles.sheetTitle, { color: colors.primaryText }]}>Which day is today?</Text>
          <Text style={[styles.sheetSubtitle, { color: colors.secondaryText }]}>Pick where you are in your {activeProgram?.name} cycle</Text>
          <View style={[styles.sheetDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(90,108,125,0.15)' }]} />
          {activeProgram?.splitDays.map((day, i) => {
            const isSelected = pendingOffset === i;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.dayPickerRow, isSelected && { backgroundColor: `${activeProgram.color}18` }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPendingOffset(i); }}
                activeOpacity={0.7}
              >
                <View style={[styles.dayPickerBadge, { backgroundColor: isSelected ? `${activeProgram.color}30` : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') }]}>
                  <Text style={[styles.dayPickerBadgeText, { color: isSelected ? activeProgram.color : colors.secondaryText }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dayPickerLabel, { color: colors.primaryText }]}>{getDayLabel(day)}</Text>
                  <Text style={[styles.dayPickerSub, { color: colors.tertiaryText }]}>{day.type === 'rest' ? 'Rest day' : 'Training'}</Text>
                </View>
                {isSelected && <Ionicons name="checkmark-circle" size={22} color={activeProgram.color} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheetModal>
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
    gap: 12,
  },
  sharedProgramIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  actionBtnArchive: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 160, 50, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 160, 50, 0.4)',
  },
  actionBtnArchiveText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },
  createButton: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 12,
    marginBottom: 4,
    overflow: 'hidden',
  },
  createButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  createIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    letterSpacing: 0.2,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    marginBottom: 16,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: 'rgba(90, 108, 125, 0.15)',
    marginBottom: 8,
  },
  dayPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    marginBottom: 4,
  },
  dayPickerBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPickerBadgeText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
  },
  dayPickerLabel: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
  },
  dayPickerSub: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    marginTop: 1,
  },
  saveChangesBtn: {
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveChangesBtnText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    letterSpacing: 0.3,
  },
});
