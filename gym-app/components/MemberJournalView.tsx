/**
 * MemberJournalView — read-only workout log for coaches viewing a member's journal.
 * Shows every logged workout with all exercises and sets (no editing).
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../themeStore';
import type { WorkoutJournalEntry } from '../workoutState';
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

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-AU', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type AgeFilter = '7d' | '30d' | '90d' | 'all';
const AGE_OPTIONS: { key: AgeFilter; label: string }[] = [
  { key: '7d',  label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'all', label: 'All time' },
];
const AGE_MS: Record<AgeFilter, number | null> = {
  '7d':  7  * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  'all': null,
};

interface Props {
  journal: WorkoutJournalEntry[];
  unit: string;
  toDisplay: (kg: number) => number;
}

export function MemberJournalView({ journal, unit, toDisplay }: Props) {
  const { colors, isDark } = useTheme();
  const [expandedIds, setExpandedIds]   = useState<Set<string>>(new Set());
  const [ageFilter,   setAgeFilter]     = useState<AgeFilter>('all');
  const [progFilter,  setProgFilter]    = useState<string | null>(null);
  const [dayFilter,   setDayFilter]     = useState<string | null>(null);

  // ── Derive unique program names and day labels from the full journal ──────
  const programs = useMemo(() => {
    const seen = new Map<string, string>(); // name → color
    for (const e of journal) {
      if (!seen.has(e.programName)) seen.set(e.programName, e.programColor);
    }
    return Array.from(seen.entries()).map(([name, color]) => ({ name, color }));
  }, [journal]);

  const dayLabels = useMemo(() => {
    const seen = new Set<string>();
    for (const e of journal) seen.add(e.dayLabel);
    return Array.from(seen);
  }, [journal]);

  // ── Apply filters ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const now = Date.now();
    const maxAge = AGE_MS[ageFilter];
    return journal.filter(e => {
      if (maxAge !== null && now - e.date > maxAge) return false;
      if (progFilter !== null && e.programName !== progFilter) return false;
      if (dayFilter  !== null && e.dayLabel    !== dayFilter)  return false;
      return true;
    });
  }, [journal, ageFilter, progFilter, dayFilter]);

  const fmtW = (kg: number) => {
    const v = toDisplay(kg);
    if (unit === 'lbs') return String(Math.round(v));
    const r = Math.round(v * 10) / 10;
    return `${r % 1 === 0 ? Math.round(r) : r.toFixed(1)}`;
  };

  const toggleExpand = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const chipBase = (active: boolean, accentColor?: string) => ({
    backgroundColor: active
      ? (accentColor ? `${accentColor}30` : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'))
      : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
    borderColor: active
      ? (accentColor ?? (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'))
      : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'),
  });

  const chipText = (active: boolean) => ({
    color: active ? colors.primaryText : colors.secondaryText,
    fontFamily: active ? 'Arimo_700Bold' : 'Arimo_400Regular',
  });

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Filters ────────────────────────────────────────────────────── */}

      {/* Age */}
      <View style={styles.filterSection}>
        <Text style={[styles.filterLabel, { color: colors.tertiaryText }]}>PERIOD</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {AGE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.chip, chipBase(ageFilter === opt.key)]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAgeFilter(opt.key); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, chipText(ageFilter === opt.key)]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Program */}
      {programs.length > 1 && (
        <View style={styles.filterSection}>
          <Text style={[styles.filterLabel, { color: colors.tertiaryText }]}>PROGRAM</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, chipBase(progFilter === null)]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setProgFilter(null); setDayFilter(null); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, chipText(progFilter === null)]}>All</Text>
            </TouchableOpacity>
            {programs.map(p => (
              <TouchableOpacity
                key={p.name}
                style={[styles.chip, chipBase(progFilter === p.name, p.color)]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setProgFilter(prev => prev === p.name ? null : p.name);
                  setDayFilter(null);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.chipDot, { backgroundColor: p.color }]} />
                <Text style={[styles.chipText, chipText(progFilter === p.name)]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Day label — only shown when a program is selected (or always if only 1 program) */}
      {dayLabels.length > 1 && (
        <View style={styles.filterSection}>
          <Text style={[styles.filterLabel, { color: colors.tertiaryText }]}>WORKOUT</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, chipBase(dayFilter === null)]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDayFilter(null); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, chipText(dayFilter === null)]}>All</Text>
            </TouchableOpacity>
            {dayLabels.map(label => (
              <TouchableOpacity
                key={label}
                style={[styles.chip, chipBase(dayFilter === label)]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setDayFilter(prev => prev === label ? null : label); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, chipText(dayFilter === label)]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Results ────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="journal-outline" size={48} color={colors.tertiaryText} />
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            {journal.length === 0 ? 'No workouts logged yet' : 'No workouts match these filters'}
          </Text>
        </View>
      ) : (
        filtered.map(entry => {
          const isExpanded = expandedIds.has(entry.id);
          const totalExercises = entry.sessions.reduce((sum, s) => sum + s.exercises.length, 0);
          const showSessionLabel = entry.sessions.length > 1;
          const repsVol = entry.sessions.reduce((sum, s) =>
            sum + s.exercises.reduce((eSum, ex) =>
              ex.mode === 'hold' ? eSum :
              eSum + ex.sets.reduce((sSum, set) => sSum + (set.reps * (set.weight ?? 0)), 0), 0), 0);

          return (
            <View
              key={entry.id}
              style={[
                styles.entryCard,
                {
                  backgroundColor: colors.cardTranslucent,
                  borderColor: isDark ? colors.cardBorder : 'rgba(0,0,0,0.1)',
                },
              ]}
            >
              {/* Entry header — tap to expand */}
              <TouchableOpacity
                style={styles.entryHeader}
                onPress={() => toggleExpand(entry.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.colorDot, { backgroundColor: entry.programColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.entryTitle, { color: colors.primaryText }]} numberOfLines={1}>
                    {entry.dayLabel}
                  </Text>
                  <Text style={[styles.entrySubtitle, { color: colors.secondaryText }]} numberOfLines={1}>
                    {entry.programName}  ·  {formatDate(entry.date)}
                  </Text>
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.tertiaryText}
                />
              </TouchableOpacity>

              {/* Stats pills */}
              <View style={styles.pillRow}>
                {(() => {
                  const pillTextColor = isDark ? '#fff' : colors.primaryText;
                  return (
                    <>
                      {entry.durationSecs > 0 && (
                        <View style={[styles.pill, { backgroundColor: `${entry.programColor}20`, borderColor: entry.programColor }]}>
                          <Ionicons name="time-outline" size={12} color={pillTextColor} />
                          <Text style={[styles.pillText, { color: pillTextColor }]}>
                            {formatDuration(entry.durationSecs)}
                          </Text>
                        </View>
                      )}
                      {repsVol > 0 && (
                        <View style={[styles.pill, { backgroundColor: `${entry.programColor}20`, borderColor: entry.programColor }]}>
                          <Ionicons name="barbell-outline" size={12} color={pillTextColor} />
                          <Text style={[styles.pillText, { color: pillTextColor }]}>
                            {Math.round(toDisplay(repsVol)).toLocaleString()} {unit}
                          </Text>
                        </View>
                      )}
                    </>
                  );
                })()}
                <View style={[styles.pill, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.pillText, { color: colors.secondaryText }]}>
                    {totalExercises} exercise{totalExercises !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>

              {/* Expanded exercise list */}
              {isExpanded && (
                <View style={[styles.exerciseList, { borderTopColor: isDark ? colors.border : 'rgba(0,0,0,0.08)' }]}>
                  {entry.sessions.map((session, si) => (
                    <View key={si}>
                      {showSessionLabel && (
                        <Text style={[styles.sessionLabel, { color: colors.secondaryText }]}>
                          {session.label.toUpperCase()}
                        </Text>
                      )}
                      {session.exercises.map((exercise, ei) => {
                        const imageUrl = getExerciseImageUrl(exercise.name);
                        return (
                          <View
                            key={ei}
                            style={[
                              styles.exerciseBlock,
                              ei < session.exercises.length - 1 && {
                                borderBottomWidth: 1,
                                borderBottomColor: isDark ? colors.border : 'rgba(0,0,0,0.07)',
                              },
                            ]}
                          >
                            <View style={styles.exerciseNameRow}>
                              {imageUrl && (
                                <Image source={{ uri: imageUrl }} style={styles.exerciseThumb} resizeMode="cover" />
                              )}
                              <Text style={[styles.exerciseName, { color: colors.primaryText }]} numberOfLines={1}>
                                {exercise.name}
                              </Text>
                            </View>

                            {exercise.sets.map((set, setI) => {
                              const isWarmup = set.isWarmup;
                              const workingIdx = exercise.sets.slice(0, setI).filter(s => !s.isWarmup).length + 1;
                              const hasData = exercise.mode === 'hold'
                                ? (set.hold > 0 || set.weight != null)
                                : set.reps > 0;

                              return (
                                <View key={setI} style={styles.setRow}>
                                  <View style={[
                                    styles.setLabel,
                                    { borderColor: isWarmup ? '#F5A623' : (isDark ? colors.border : 'rgba(0,0,0,0.2)') },
                                  ]}>
                                    <Text style={[styles.setLabelText, { color: isWarmup ? '#F5A623' : colors.secondaryText }]}>
                                      {isWarmup ? 'W' : workingIdx}
                                    </Text>
                                  </View>
                                  {hasData ? (
                                    <Text style={[styles.setValue, { color: colors.primaryText }]}>
                                      {exercise.mode === 'hold' ? (
                                        <>
                                          {set.weight != null ? `${fmtW(set.weight)} ${unit}  ` : ''}
                                          {`${set.hold}s`}
                                        </>
                                      ) : (
                                        <>
                                          {set.weight != null ? `${fmtW(set.weight)} ${unit}  ×  ` : ''}
                                          {`${set.reps} reps`}
                                        </>
                                      )}
                                    </Text>
                                  ) : (
                                    <Text style={[styles.setValue, { color: colors.tertiaryText }]}>—</Text>
                                  )}
                                </View>
                              );
                            })}

                            {exercise.notes ? (
                              <Text style={[styles.notes, { color: colors.secondaryText }]}>
                                {exercise.notes}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 10,
  },
  filterSection: {
    gap: 6,
  },
  filterLabel: {
    fontSize: 10,
    fontFamily: 'Arimo_700Bold',
    letterSpacing: 1,
    paddingLeft: 2,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    textAlign: 'center',
  },
  entryCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  entryTitle: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
  },
  entrySubtitle: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    marginTop: 1,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontFamily: 'Arimo_400Regular',
  },
  exerciseList: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
  },
  sessionLabel: {
    fontSize: 10,
    fontFamily: 'Arimo_700Bold',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 4,
  },
  exerciseBlock: {
    paddingVertical: 8,
  },
  exerciseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  exerciseThumb: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  exerciseName: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    flex: 1,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 3,
  },
  setLabel: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setLabelText: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
  },
  setValue: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
  },
  notes: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    fontStyle: 'italic',
    marginTop: 4,
    paddingLeft: 34,
  },
});
