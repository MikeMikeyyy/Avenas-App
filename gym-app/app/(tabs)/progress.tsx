import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import Svg, { Line as SvgLine, Circle as SvgCircle } from 'react-native-svg';
import { useProgramStore } from '../../programStore';
import { useTheme } from '../../themeStore';
import { workoutState } from '../../workoutState';

type PeriodKey = 'week' | 'lastWeek' | 'month' | 'allTime';

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'This Week' },
  { key: 'lastWeek', label: 'Last Week' },
  { key: 'month', label: 'This Month' },
  { key: 'allTime', label: 'All Time' },
];

const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getStartOfWeek(date: Date, offsetWeeks = 0): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // shift so Mon=0
  d.setDate(d.getDate() - diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildPeriodData(log: { date: number; volume: number; durationSecs: number }[]): Record<PeriodKey, { volume: { day: string; volume: number }[] }> {
  const now = new Date();

  // This Week: Mon-Sun
  const weekStart = getStartOfWeek(now);
  const weekBuckets = DAY_NAMES_SHORT.map(() => 0);
  // Last Week: Mon-Sun
  const lastWeekStart = getStartOfWeek(now, -1);
  const lastWeekEnd = weekStart.getTime();
  const lastWeekBuckets = DAY_NAMES_SHORT.map(() => 0);

  // This Month: group by week of month (Wk 1..5)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthBuckets: number[] = [0, 0, 0, 0, 0]; // up to 5 weeks

  // All Time: group by month
  const monthMap = new Map<string, number>(); // "YYYY-MM" -> volume

  for (const entry of log) {
    const d = new Date(entry.date);

    // This week
    if (entry.date >= weekStart.getTime()) {
      const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon=0
      weekBuckets[dayIdx] += entry.volume;
    }

    // Last week
    if (entry.date >= lastWeekStart.getTime() && entry.date < lastWeekEnd) {
      const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      lastWeekBuckets[dayIdx] += entry.volume;
    }

    // This month
    if (entry.date >= monthStart.getTime()) {
      const weekIdx = Math.min(Math.floor((d.getDate() - 1) / 7), 4);
      monthBuckets[weekIdx] += entry.volume;
    }

    // All time
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    monthMap.set(key, (monthMap.get(key) || 0) + entry.volume);
  }

  // Build allTime bars sorted chronologically
  const allTimeSorted = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const allTimeBars = allTimeSorted.map(([key, vol]) => {
    const monthIdx = parseInt(key.split('-')[1], 10);
    return { day: MONTH_NAMES[monthIdx], volume: Math.round(vol) };
  });

  // Trim trailing empty weeks from month view
  let monthWeekCount = 5;
  while (monthWeekCount > 1 && monthBuckets[monthWeekCount - 1] === 0) monthWeekCount--;

  return {
    week: { volume: DAY_NAMES_SHORT.map((d, i) => ({ day: d, volume: Math.round(weekBuckets[i]) })) },
    lastWeek: { volume: DAY_NAMES_SHORT.map((d, i) => ({ day: d, volume: Math.round(lastWeekBuckets[i]) })) },
    month: { volume: Array.from({ length: monthWeekCount }, (_, i) => ({ day: `Wk ${i + 1}`, volume: Math.round(monthBuckets[i]) })) },
    allTime: { volume: allTimeBars.length > 0 ? allTimeBars : [{ day: MONTH_NAMES[now.getMonth()], volume: 0 }] },
  };
}

function formatVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

function formatDuration(secs: number): string {
  const mins = Math.round(secs / 60);
  return `${mins} min`;
}

/** Format a timestamp into a short date label relative to now */
function formatHistoryDate(timestamp: number, index: number, total: number): string {
  if (total === 1) return 'Latest';
  if (index === total - 1) return 'Latest';
  const daysAgo = Math.round((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return '1d ago';
  if (daysAgo < 7) return `${daysAgo}d ago`;
  const weeks = Math.round(daysAgo / 7);
  if (weeks <= 8) return `${weeks}w ago`;
  const months = Math.round(daysAgo / 30);
  return `${months}mo ago`;
}

// --- Components ---

function VolumeChart({ accentColor, data }: { accentColor: string; data: { day: string; volume: number }[] }) {
  const { isDark, colors } = useTheme();
  const maxVolume = Math.max(...data.map(d => d.volume), 1);
  const CHART_HEIGHT = 120;

  return (
    <View style={styles.chartContainer}>
      <View style={styles.barRow}>
        {data.map((d, i) => {
          const barHeight = d.volume > 0 ? (d.volume / maxVolume) * CHART_HEIGHT : 4;
          const isRest = d.volume === 0;
          return (
            <View key={i} style={styles.barCol}>
              <View style={{ height: CHART_HEIGHT, justifyContent: 'flex-end', alignItems: 'center' }}>
                <View
                  style={{
                    width: 28,
                    height: barHeight,
                    borderRadius: 8,
                    backgroundColor: isRest ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : accentColor,
                    opacity: isRest ? 1 : 0.85,
                  }}
                />
              </View>
              <Text style={[styles.barLabel, { color: colors.secondaryText }]}>{d.day}</Text>
              {d.volume > 0 && (
                <Text style={[styles.barValue, { color: colors.secondaryText }]}>{(d.volume / 1000).toFixed(1)}k</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function LineChart({ data, accentColor }: { data: { date: string; weight: number }[]; accentColor: string }) {
  const { isDark, colors } = useTheme();
  const [chartWidth, setChartWidth] = useState(0);
  const weights = data.map(d => d.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;
  const CHART_HEIGHT = 100;
  const PAD_Y = 12; // top/bottom padding so dots aren't clipped

  // Calculate point positions based on actual measured width
  const points = data.map((d, i) => {
    const count = data.length;
    const x = count === 1 ? chartWidth / 2 : (i / (count - 1)) * chartWidth;
    const y = PAD_Y + (1 - (d.weight - minW) / range) * (CHART_HEIGHT - PAD_Y * 2);
    return { x, y };
  });

  return (
    <View style={styles.lineChartContainer}>
      <View
        style={{ height: CHART_HEIGHT }}
        onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
      >
        {chartWidth > 0 && (
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
              const gy = PAD_Y + frac * (CHART_HEIGHT - PAD_Y * 2);
              return (
                <SvgLine
                  key={i}
                  x1={0} y1={gy} x2={chartWidth} y2={gy}
                  stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
                  strokeWidth={1}
                />
              );
            })}
            {/* Connecting lines */}
            {points.map((p, i) => {
              if (i === points.length - 1) return null;
              const next = points[i + 1];
              return (
                <SvgLine
                  key={`line-${i}`}
                  x1={p.x} y1={p.y} x2={next.x} y2={next.y}
                  stroke={`${accentColor}60`}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              );
            })}
            {/* Dots */}
            {points.map((p, i) => (
              <SvgCircle
                key={`dot-${i}`}
                cx={p.x} cy={p.y} r={5}
                fill={accentColor}
                stroke={isDark ? colors.cardSolid : '#fff'}
                strokeWidth={2}
              />
            ))}
          </Svg>
        )}
      </View>
      {/* X-axis labels */}
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[styles.lineChartLabel, { color: colors.secondaryText }]}>{d.date}</Text>
          </View>
        ))}
      </View>
      {/* Y-axis range */}
      <View style={styles.yAxisRange}>
        <Text style={[styles.yAxisText, { color: colors.tertiaryText }]}>{minW}kg</Text>
        <Text style={[styles.yAxisText, { color: colors.tertiaryText }]}>{maxW}kg</Text>
      </View>
    </View>
  );
}

// --- Main Screen ---

export default function ProgressScreen() {
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });
  const { programs, activeId } = useProgramStore();
  const { isDark, colors } = useTheme();

  const [selectedProgramId, setSelectedProgramId] = useState(activeId);
  const selectedProgram = programs.find(p => p.id === selectedProgramId);
  const accentColor = selectedProgram?.color || '#47DDFF';

  // Build unique training days with merged exercises for selected program
  const trainingDays = useMemo(() => {
    if (!selectedProgram) return [];
    const dayMap = new Map<string, string[]>();
    for (const sd of selectedProgram.splitDays) {
      if (sd.type === 'training') {
        for (const session of sd.sessions) {
          const existing = dayMap.get(session.label) || [];
          for (const e of session.exercises) {
            if (!existing.includes(e.name)) existing.push(e.name);
          }
          dayMap.set(session.label, existing);
        }
      }
    }
    return Array.from(dayMap.entries()).map(([label, exercises]) => ({ label, exercises }));
  }, [selectedProgramId]);

  const firstExercise = trainingDays[0]?.exercises[0] || 'Bench Press';
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('week');
  const [selectedExercise, setSelectedExercise] = useState(firstExercise);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (trainingDays[0]) initial[trainingDays[0].label] = true;
    return initial;
  });
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  // When switching programs, reset selected exercise and expand first day
  const prevProgramId = useRef(selectedProgramId);
  if (prevProgramId.current !== selectedProgramId) {
    prevProgramId.current = selectedProgramId;
    const first = trainingDays[0];
    if (first) {
      setSelectedExercise(first.exercises[0] || 'Bench Press');
      setExpandedDays({ [first.label]: true });
    }
  }

  // Build dynamic volume chart data & summary stats from workout log
  const workoutLog = workoutState.getWorkoutLog();
  const periodData = useMemo(() => buildPeriodData(workoutLog), [workoutLog.length]);
  const summaryStats = useMemo(() => {
    const total = workoutLog.length;
    const totalVol = workoutLog.reduce((s, e) => s + e.volume, 0);
    const avgDur = total > 0 ? workoutLog.reduce((s, e) => s + e.durationSecs, 0) / total : 0;
    return {
      workouts: String(total),
      volume: formatVolume(totalVol),
      avgDuration: formatDuration(avgDur),
    };
  }, [workoutLog.length]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: isDark ? colors.gradientStart : '#c3ced6' }} />;

  const rawHistory = workoutState.getHistory(selectedExercise);
  const exerciseData = rawHistory.map((entry, i) => ({
    date: formatHistoryDate(entry.date, i, rawHistory.length),
    weight: entry.weight,
  }));
  const exercisePR = rawHistory.length > 0 ? Math.max(...rawHistory.map(e => e.weight)) : undefined;

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.gradientStart} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Progress</Text>
        <Text style={styles.subtitle}>{selectedProgram?.name || 'No Program'} Overview</Text>

        {/* Summary Stats */}
        <View style={styles.statsRow}>
          {[
            { value: summaryStats.workouts, label: 'Total Workouts', icon: 'barbell-outline' as const },
            { value: summaryStats.volume, label: 'Volume (kg)', icon: 'trending-up-outline' as const },
            { value: summaryStats.avgDuration, label: 'Avg Duration', icon: 'timer-outline' as const },
          ].map((stat, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
              <Ionicons name={stat.icon} size={20} color={accentColor} />
              <Text style={[styles.statValue, { color: colors.primaryText }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.secondaryText }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Volume Chart */}
        <Text style={styles.sectionTitle}>Volume</Text>
        <View style={[styles.glassCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
          <View style={styles.periodRow}>
            {PERIOD_OPTIONS.map((opt) => {
              const isActive = opt.key === selectedPeriod;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedPeriod(opt.key);
                  }}
                  style={[
                    styles.periodPill,
                    { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
                    isActive && { backgroundColor: `${accentColor}25`, borderColor: accentColor },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.periodPillText, { color: colors.secondaryText }, isActive && { color: colors.primaryText }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <VolumeChart accentColor={accentColor} data={periodData[selectedPeriod].volume} />
        </View>

        {/* Program Selector */}
        <Text style={styles.sectionTitle}>Programs</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {programs.map((p) => {
            const isActive = p.id === selectedProgramId;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedProgramId(p.id);
                }}
                style={[
                  styles.periodPill,
                  { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
                  isActive && { backgroundColor: `${p.color}25`, borderColor: p.color },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.periodPillText, { color: colors.secondaryText }, isActive && { color: colors.primaryText }]}>{p.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Exercise Progress */}
        <Text style={styles.sectionTitle}>Exercise Progress</Text>

        {/* Day-Grouped Exercises */}
        {trainingDays.map((day) => {
          const isExpanded = expandedDays[day.label] ?? false;
          return (
            <View key={day.label} style={{ marginBottom: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedDays(prev => ({ ...prev, [day.label]: !prev[day.label] }));
                }}
                style={[styles.dayHeader, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.dayDot, { backgroundColor: accentColor }]} />
                  <Text style={[styles.dayHeaderText, { color: colors.primaryText }]}>{day.label}</Text>
                  <Text style={[styles.dayExerciseCount, { color: colors.secondaryText }]}>{day.exercises.length} exercises</Text>
                </View>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.secondaryText} />
              </TouchableOpacity>
              {isExpanded && day.exercises.map((name) => {
                const isSelected = name === selectedExercise;
                return (
                  <TouchableOpacity
                    key={name}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedExercise(name);
                    }}
                    style={[
                      styles.exerciseRow,
                      { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
                      isSelected && { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}80` },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.exerciseRowText, { color: colors.primaryText }, isSelected && { fontFamily: 'Arimo_700Bold' }]}>{name}</Text>
                    {isSelected && <Ionicons name="chevron-forward" size={16} color={accentColor} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        {/* Line Chart + PR */}
        <View style={[styles.glassCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.cardLabel, { color: colors.secondaryText }]}>WEIGHT PROGRESSION</Text>
            {exercisePR !== undefined && (
              <View style={[styles.prBadge, { backgroundColor: `${accentColor}25`, borderColor: `${accentColor}4D` }]}>
                <Ionicons name="trophy" size={12} color={accentColor} />
                <Text style={[styles.prBadgeText, { color: colors.primaryText }]}>PR: {exercisePR}kg</Text>
              </View>
            )}
          </View>
          {exerciseData.length > 0 ? (
            <LineChart data={exerciseData} accentColor={accentColor} />
          ) : (
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No data for this exercise yet</Text>
          )}
        </View>

      </ScrollView>
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
    paddingBottom: 140,
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
  subtitle: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#FFFFFF',
    marginTop: 4,
    marginBottom: 12,
    textShadowColor: '#00000040',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
    marginBottom: 12,
    marginTop: 8,
    lineHeight: 28,
    textShadowColor: '#00000080',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Period selector
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  periodPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#ffffff59',
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
  },
  periodPillText: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff59',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 22,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    textAlign: 'center',
  },

  // Glass card
  glassCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ffffffcc',
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardLabel: {
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },

  // Bar chart
  chartContainer: {
    paddingTop: 4,
  },
  barRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barLabel: {
    fontSize: 10,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
  },
  barValue: {
    fontSize: 9,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },

  // Line chart
  lineChartContainer: {
    position: 'relative',
  },
  lineChartLabel: {
    fontSize: 9,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  yAxisRange: {
    position: 'absolute',
    top: 0,
    bottom: 20,
    left: -4,
    justifyContent: 'space-between',
  },
  yAxisText: {
    fontSize: 9,
    fontFamily: 'Arimo_400Regular',
    color: '#8a9bab',
  },

  // Day-grouped exercises
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: '#ffffff59',
    borderColor: '#ffffffcc',
  },
  dayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dayHeaderText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  dayExerciseCount: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginLeft: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    marginTop: 4,
    backgroundColor: '#ffffff30',
  },
  exerciseRowText: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
  },

  // PR badge
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  prBadgeText: {
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },

  emptyText: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
