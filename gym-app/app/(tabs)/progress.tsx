import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  Animated,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import Svg, { Line as SvgLine, Circle as SvgCircle, Defs as SvgDefs, LinearGradient as SvgLinearGradient, Stop as SvgStop } from 'react-native-svg';
import { useProgramStore } from '../../programStore';
import { useTheme } from '../../themeStore';
import { useUnits } from '../../unitsStore';
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

/** Format a timestamp into a short date label */
function formatHistoryDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

/** Generate nicely-spaced tick values for a chart axis */
function getNiceTicks(min: number, max: number, targetCount = 5): number[] {
  if (min === max) {
    const pad = min >= 10 ? 5 : 1;
    return [min - pad, min, min + pad];
  }
  const range = max - min;
  const rawStep = range / Math.max(targetCount - 1, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let niceStep: number;
  if (norm <= 1) niceStep = mag;
  else if (norm <= 2) niceStep = 2 * mag;
  else if (norm <= 2.5) niceStep = 2.5 * mag;
  else if (norm <= 5) niceStep = 5 * mag;
  else niceStep = 10 * mag;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  let t = niceMin;
  while (t <= niceMax + niceStep * 0.001) {
    ticks.push(Math.round(t * 1000) / 1000);
    t += niceStep;
  }
  return ticks;
}

// --- Components ---

/** Blend a hex colour towards white by `amount` (0–1) */
function lightenColor(hex: string, amount = 0.55): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr},${lg},${lb})`;
}

function VolumeChart({ accentColor, data }: { accentColor: string; data: { day: string; volume: number }[] }) {
  const { isDark, colors } = useTheme();
  const maxVolume = Math.max(...data.map(d => d.volume), 1);
  const CHART_HEIGHT = 160;
  const Y_AXIS_W = 42;

  // Auto-scale: pick nice tick steps based on the data range, targeting 3-5 labels
  const ticks = getNiceTicks(0, maxVolume, 4);
  const chartTop = ticks[ticks.length - 1];
  const yLabels = [...ticks].reverse(); // top → bottom for display

  const axisColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';

  return (
    <View style={styles.chartContainer}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Y-axis labels */}
        <View style={{ width: Y_AXIS_W, height: CHART_HEIGHT, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6 }}>
          {yLabels.map((v, i) => (
            <Text key={i} style={[styles.yAxisText, { color: colors.tertiaryText }]}>
              {formatVolume(Math.round(v))}
            </Text>
          ))}
        </View>
        {/* Bars + labels */}
        <View style={{ flex: 1 }}>
          {/* Chart area with axis lines */}
          <View style={{
            height: CHART_HEIGHT,
            borderLeftWidth: 1,
            borderBottomWidth: 1,
            borderColor: axisColor,
            flexDirection: 'row',
            justifyContent: 'space-around',
            alignItems: 'flex-end',
            paddingHorizontal: 4,
          }}>
            {data.map((d, i) => {
              const barHeight = d.volume > 0 ? (d.volume / chartTop) * (CHART_HEIGHT - 8) : 4;
              const isRest = d.volume === 0;
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center', paddingBottom: 4 }}>
                  {isRest ? (
                    <View style={{ width: 28, height: barHeight, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} />
                  ) : (
                    <LinearGradient
                      colors={[accentColor, lightenColor(accentColor, 0.55)]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={{ width: 28, height: barHeight, borderRadius: 8 }}
                    />
                  )}
                </View>
              );
            })}
          </View>
          {/* X-axis labels below the axis line */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 4, marginTop: 4 }}>
            {data.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <Text style={[styles.barLabel, { color: colors.secondaryText }]}>{d.day}</Text>
                {d.volume > 0 ? (
                  <Text style={[styles.barValue, { color: colors.tertiaryText }]}>{formatVolume(d.volume)}</Text>
                ) : (
                  <Text style={[styles.barValue, { color: colors.tertiaryText, opacity: 0.35 }]}>—</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function LineChart({ data, accentColor, yUnit = 'kg', onPanActive }: { data: { date: string; weight: number; color?: string }[]; accentColor: string; yUnit?: string; onPanActive?: (active: boolean) => void }) {
  const { isDark, colors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const xLabelScrollRef = useRef<ScrollView>(null);

  // Free-form 2D pan state
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const baseX = useRef(0);
  const baseY = useRef(0);

  const weights = data.map(d => d.weight);
  const minW = data.length > 0 ? Math.min(...weights) : 0;
  const maxW = data.length > 0 ? Math.max(...weights) : 10;

  const CHART_HEIGHT = 150;
  const PAD_Y = 16;
  const PAD_X = 20;
  const Y_AXIS_W = 52;
  const DOT_SPACING = 60;
  const MIN_TICK_PX = 35;
  const axisColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)';

  const ticks = data.length > 0 ? getNiceTicks(minW, maxW, 10) : [0, 5, 10];
  const niceMin = ticks[0];
  const niceMax = ticks[ticks.length - 1];
  const niceRange = niceMax - niceMin || 1;

  const fullH = Math.min(500, Math.max(CHART_HEIGHT, (ticks.length - 1) * MIN_TICK_PX + PAD_Y * 2));
  const tickY = (v: number) => PAD_Y + (1 - (v - niceMin) / niceRange) * (fullH - PAD_Y * 2);
  const formatTick = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(1);

  const count = data.length;
  const svgWidth = containerWidth > 0
    ? Math.max(containerWidth, count * DOT_SPACING + PAD_X * 2)
    : 0;

  const points = data.map((d, i) => ({
    x: count === 1 ? svgWidth / 2 : PAD_X + (i / (count - 1)) * (svgWidth - PAD_X * 2),
    y: tickY(d.weight),
    color: d.color || accentColor,
  }));

  // Refs so panResponder callbacks always see the latest computed values
  const svgWidthRef = useRef(0);
  const containerWidthRef = useRef(0);
  const fullHRef = useRef(CHART_HEIGHT);
  svgWidthRef.current = svgWidth;
  containerWidthRef.current = containerWidth;
  fullHRef.current = fullH;

  // Centre the most recent point in the viewport once dimensions are known
  useEffect(() => {
    if (containerWidth <= 0 || points.length === 0) return;
    const lastPoint = points[points.length - 1];
    const maxScrollX = Math.max(0, svgWidth - containerWidth);
    const maxScrollY = Math.max(0, fullH - CHART_HEIGHT);
    const targetX = Math.max(-maxScrollX, Math.min(0, containerWidth / 2 - lastPoint.x));
    const targetY = Math.max(-maxScrollY, Math.min(0, CHART_HEIGHT / 2 - lastPoint.y));
    baseX.current = targetX;
    baseY.current = targetY;
    translateX.setValue(targetX);
    translateY.setValue(targetY);
    xLabelScrollRef.current?.scrollTo({ x: -targetX, animated: false });
  }, [svgWidth, containerWidth, fullH]);

  // Keep x-axis date labels in sync with horizontal pan
  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      xLabelScrollRef.current?.scrollTo({ x: -value, animated: false });
    });
    return () => translateX.removeListener(id);
  }, [translateX]);

  const onPanActiveRef = useRef(onPanActive);
  onPanActiveRef.current = onPanActive;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        onPanActiveRef.current?.(true);
      },
      onPanResponderMove: (_, { dx, dy }) => {
        const maxX = Math.max(0, svgWidthRef.current - containerWidthRef.current);
        const maxY = Math.max(0, fullHRef.current - CHART_HEIGHT);
        translateX.setValue(Math.max(-maxX, Math.min(0, baseX.current + dx)));
        translateY.setValue(Math.max(-maxY, Math.min(0, baseY.current + dy)));
      },
      onPanResponderRelease: (_, { dx, dy }) => {
        const maxX = Math.max(0, svgWidthRef.current - containerWidthRef.current);
        const maxY = Math.max(0, fullHRef.current - CHART_HEIGHT);
        baseX.current = Math.max(-maxX, Math.min(0, baseX.current + dx));
        baseY.current = Math.max(-maxY, Math.min(0, baseY.current + dy));
        translateX.setValue(baseX.current);
        translateY.setValue(baseY.current);
        onPanActiveRef.current?.(false);
      },
      onPanResponderTerminate: () => {
        onPanActiveRef.current?.(false);
      },
    })
  ).current;

  return (
    <View style={styles.lineChartContainer}>
      {/* Viewport */}
      <View style={{ height: CHART_HEIGHT, overflow: 'hidden' }} {...panResponder.panHandlers}>
        {/* Fixed axis lines */}
        <View style={{ position: 'absolute', left: Y_AXIS_W, top: 0, width: 1, height: CHART_HEIGHT, backgroundColor: axisColor, zIndex: 2 }} />
        <View style={{ position: 'absolute', left: Y_AXIS_W, bottom: 0, right: 0, height: 1, backgroundColor: axisColor, zIndex: 2 }} />

        {/* Y-axis labels — pan vertically only */}
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: Y_AXIS_W, height: fullH, transform: [{ translateY }] }}>
          {ticks.map((t, i) => (
            <Text
              key={i}
              style={[styles.yAxisText, {
                color: colors.tertiaryText,
                textAlign: 'right',
                position: 'absolute',
                top: tickY(t) - 5,
                right: 6,
                width: Y_AXIS_W - 6,
              }]}
            >
              {formatTick(t)}{yUnit}
            </Text>
          ))}
        </Animated.View>

        {/* Chart data — pan freely in X and Y */}
        <View
          style={{ position: 'absolute', left: Y_AXIS_W, top: 0, right: 0, bottom: 0, overflow: 'hidden' }}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View style={{ transform: [{ translateX }, { translateY }] }}>
            {svgWidth > 0 && (
              <Svg width={svgWidth} height={fullH}>
                {/* Gradient definitions for lines that cross between two program colors */}
                <SvgDefs>
                  {points.map((p, i) => {
                    if (i === points.length - 1) return null;
                    const next = points[i + 1];
                    if (p.color === next.color) return null;
                    return (
                      <SvgLinearGradient
                        key={`grad-${i}`}
                        id={`grad-${i}`}
                        x1={p.x} y1={p.y} x2={next.x} y2={next.y}
                        gradientUnits="userSpaceOnUse"
                      >
                        <SvgStop offset="0" stopColor={p.color} stopOpacity={0.6} />
                        <SvgStop offset="1" stopColor={next.color} stopOpacity={0.6} />
                      </SvgLinearGradient>
                    );
                  })}
                </SvgDefs>
                {ticks.map((t, gi) => (
                  <SvgLine
                    key={gi}
                    x1={0} y1={tickY(t)} x2={svgWidth} y2={tickY(t)}
                    stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
                    strokeWidth={1}
                  />
                ))}
                {points.map((p, i) => {
                  if (i === points.length - 1) return null;
                  const next = points[i + 1];
                  const sameColor = p.color === next.color;
                  return (
                    <SvgLine
                      key={`line-${i}`}
                      x1={p.x} y1={p.y} x2={next.x} y2={next.y}
                      stroke={sameColor ? `${p.color}99` : `url(#grad-${i})`}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                  );
                })}
                {points.map((p, i) => (
                  <SvgCircle
                    key={`dot-${i}`}
                    cx={p.x} cy={p.y} r={5}
                    fill={p.color}
                    stroke={isDark ? colors.cardSolid : '#fff'}
                    strokeWidth={2}
                  />
                ))}
              </Svg>
            )}
          </Animated.View>
        </View>
      </View>

      {/* X-axis date labels — pinned below viewport, synced to horizontal pan */}
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        <View style={{ width: Y_AXIS_W }} />
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <ScrollView
            ref={xLabelScrollRef}
            horizontal
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
          >
            {svgWidth > 0 && (
              <View style={{ width: svgWidth, height: 20 }}>
                {data.map((d, i) => {
                  const labelX = count === 1 ? svgWidth / 2 : PAD_X + (i / (count - 1)) * (svgWidth - PAD_X * 2);
                  return (
                    <Text
                      key={i}
                      style={[styles.lineChartLabel, {
                        color: colors.secondaryText,
                        position: 'absolute',
                        left: labelX - 20,
                        width: 40,
                        textAlign: 'center',
                      }]}
                    >
                      {d.date}
                    </Text>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

// --- Main Screen ---

export default function ProgressScreen() {
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });
  const { programs, activeId } = useProgramStore();
  const { isDark, colors } = useTheme();
  const { unit, toDisplay } = useUnits();
  const [refreshKey, setRefreshKey] = useState(0);
  const [chartPanning, setChartPanning] = useState(false);

  const ALL_ACCENT = '#94A3B8';
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(activeId ?? null);
  const selectedProgram = programs.find(p => p.id === selectedProgramId);
  const accentColor = selectedProgramId === null ? ALL_ACCENT : (selectedProgram?.color || '#47DDFF');

  // Build unique training days with merged exercises for selected program (or all programs)
  // Also builds exercisePrograms: exercise name -> all program colors it appears in
  const { trainingDays, exercisePrograms } = useMemo(() => {
    const programsToUse = selectedProgramId === null ? programs : (selectedProgram ? [selectedProgram] : []);
    if (programsToUse.length === 0) return { trainingDays: [], exercisePrograms: new Map<string, string[]>() };
    const dayMap = new Map<string, { exercises: string[]; color: string }>();
    const exPrograms = new Map<string, string[]>();
    for (const prog of programsToUse) {
      for (const sd of prog.splitDays) {
        if (sd.type === 'training') {
          for (const session of sd.sessions) {
            const existing = dayMap.get(session.label);
            const exercises = existing?.exercises || [];
            for (const e of session.exercises) {
              if (!exercises.includes(e.name)) exercises.push(e.name);
              const cols = exPrograms.get(e.name) || [];
              if (!cols.includes(prog.color)) cols.push(prog.color);
              exPrograms.set(e.name, cols);
            }
            dayMap.set(session.label, { exercises, color: prog.color });
          }
        }
      }
    }
    return {
      trainingDays: Array.from(dayMap.entries()).map(([label, { exercises, color }]) => ({ label, exercises, color })),
      exercisePrograms: exPrograms,
    };
  }, [selectedProgramId, programs]);

  const firstExercise = trainingDays[0]?.exercises[0] || 'Bench Press';
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('week');
  const [selectedExercise, setSelectedExercise] = useState(firstExercise);
  const [exerciseMetric, setExerciseMetric] = useState<'heaviest' | 'setVolume'>('heaviest');
  const chartFade = useRef(new Animated.Value(1)).current;
  const handleMetricChange = (metric: 'heaviest' | 'setVolume') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(chartFade, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setExerciseMetric(metric);
      Animated.timing(chartFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (trainingDays[0]) initial[trainingDays[0].label] = true;
    return initial;
  });
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setRefreshKey(k => k + 1);
  }, []));

  // Re-render whenever journal data changes (including after initStorage completes)
  useEffect(() => {
    return workoutState.subscribePrev(() => setRefreshKey(k => k + 1));
  }, []);

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

  // Build dynamic volume chart data & summary stats from workout log (filtered by selected program)
  const filterProgram = selectedProgramId !== null ? selectedProgram?.name : undefined;
  const workoutLog = workoutState.getWorkoutLog(filterProgram);
  const periodData = useMemo(() => buildPeriodData(workoutLog), [refreshKey, selectedProgramId]);
  const summaryStats = useMemo(() => {
    const total = workoutLog.length;
    const totalVol = workoutLog.reduce((s, e) => s + e.volume, 0);
    const avgDur = total > 0 ? workoutLog.reduce((s, e) => s + e.durationSecs, 0) / total : 0;
    return {
      workouts: String(total),
      volume: formatVolume(totalVol),
      avgDuration: formatDuration(avgDur),
    };
  }, [refreshKey, selectedProgramId]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: isDark ? colors.gradientStart : '#c3ced6' }} />;

  const THREE_MONTHS_AGO = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const rawHistory = workoutState.getHistory(selectedExercise, filterProgram).filter(e => e.date >= THREE_MONTHS_AGO);
  const repsHistory = rawHistory.filter(e => (e.repsWeight ?? 0) > 0);
  const exerciseData = repsHistory.map((entry) => ({
    date: formatHistoryDate(entry.date),
    weight: toDisplay(exerciseMetric === 'heaviest' ? (entry.repsWeight ?? entry.weight) : entry.bestSetVolume),
    color: programs.find(p => p.id === entry.programId)?.color ?? programs.find(p => p.name === entry.programName)?.color ?? entry.programColor,
  }));

  const heaviestPR = repsHistory.length > 0 ? toDisplay(Math.max(...repsHistory.map(e => e.repsWeight ?? e.weight))) : undefined;
  const repsEntries = rawHistory.filter(e => (e.bestSetReps ?? 0) > 0 && e.bestSetVolume > 0);
  const bestVolumeEntry = repsEntries.length > 0 ? repsEntries.reduce((best, e) => e.bestSetVolume > best.bestSetVolume ? e : best) : undefined;
  const multiRepEntries = rawHistory.filter(e => (e.bestMultiRepWeight ?? 0) > 0);
  const bestMultiRepPR = multiRepEntries.length > 0 ? toDisplay(Math.max(...multiRepEntries.map(e => e.bestMultiRepWeight!))) : undefined;
  const isoEntries = rawHistory.filter(e => (e.bestIsometricHold ?? 0) > 0);
  const bestIsometricEntry = isoEntries.length > 0 ? isoEntries.reduce((best, e) => ((e.bestIsometricWeight ?? 0) * (e.bestIsometricHold ?? 0)) > ((best.bestIsometricWeight ?? 0) * (best.bestIsometricHold ?? 0)) ? e : best) : undefined;
  const exerciseColor = trainingDays.find(d => d.exercises.includes(selectedExercise))?.color || accentColor;

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
        scrollEnabled={!chartPanning}
      >
        <Text style={styles.screenTitle}>Progress</Text>
        <Text style={styles.subtitle}>{selectedProgramId === null ? 'All Programs' : (selectedProgram?.name || 'No Program')} Overview</Text>

        {/* Program Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedProgramId(null);
            }}
            style={[
              styles.periodPill,
              { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
              selectedProgramId === null && { backgroundColor: `${accentColor}25`, borderColor: accentColor },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodPillText, { color: colors.secondaryText }, selectedProgramId === null && { color: colors.primaryText }]}>All</Text>
          </TouchableOpacity>
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

        {/* Summary Stats */}
        <View style={styles.statsRow}>
          {[
            { value: summaryStats.workouts, label: 'Total Workouts', icon: 'barbell-outline' as const },
            { value: summaryStats.volume, label: `Volume (${unit})`, icon: 'trending-up-outline' as const },
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
                  <View style={[styles.dayDot, { backgroundColor: day.color }]} />
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
                      isSelected && { backgroundColor: `${day.color}20`, borderColor: `${day.color}80` },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.exerciseRowText, { color: colors.primaryText }, isSelected && { fontFamily: 'Arimo_700Bold' }]}>{name}</Text>
                    {isSelected
                      ? <Ionicons name="chevron-forward" size={16} color={day.color} />
                      : (() => {
                          const cols = exercisePrograms.get(name) ?? [];
                          if (cols.length <= 1) return null;
                          return (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              {cols.slice(0, 4).map((c, ci) => (
                                <View key={ci} style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: c, marginLeft: ci > 0 ? -3 : 0, borderWidth: 1.5, borderColor: colors.cardTranslucent }} />
                              ))}
                            </View>
                          );
                        })()
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        {/* Line Chart + PR */}
        <View style={[styles.glassCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder, marginTop: 16 }]}>
          <Text style={[styles.cardLabel, { color: colors.secondaryText, marginBottom: 12 }]}>WEIGHT PROGRESSION</Text>
          <Animated.View style={{ opacity: chartFade }}>
            {exerciseData.length > 0 ? (
              <LineChart
                data={exerciseData}
                accentColor={exerciseColor}
                yUnit={unit}
                onPanActive={setChartPanning}
              />
            ) : (
              <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No data for this exercise yet</Text>
            )}
          </Animated.View>
          {/* Metric toggle */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {([
              { key: 'heaviest', label: 'Heaviest Weight' },
              { key: 'setVolume', label: 'Best Set Volume' },
            ] as const).map(opt => {
              const isActive = exerciseMetric === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => handleMetricChange(opt.key)}
                  style={[
                    styles.periodPill,
                    { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
                    isActive && { backgroundColor: `${exerciseColor}25`, borderColor: exerciseColor },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.periodPillText, { color: colors.secondaryText }, isActive && { color: colors.primaryText }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

        </View>

        {/* PR Summary Table */}
        {rawHistory.length > 0 && (
          <View style={[styles.glassCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
            <Text style={[styles.cardLabel, { color: colors.secondaryText, marginBottom: 12 }]}>PERSONAL RECORDS</Text>
            <View style={{ flexDirection: 'column', gap: 10 }}>
              {/* Heaviest Weight */}
              <View style={[styles.prStatCell, { backgroundColor: `${exerciseColor}25`, borderColor: exerciseColor }]}>
                <Ionicons name="barbell-outline" size={16} color={exerciseColor} />
                <Text style={[styles.prStatValue, { color: colors.primaryText }]}>
                  {heaviestPR !== undefined ? `${(() => { const r = Math.round(heaviestPR * 10) / 10; return r % 1 === 0 ? Math.round(r) : r.toFixed(1); })()}${unit}` : '—'}
                </Text>
                <Text style={[styles.prStatLabel, { color: colors.secondaryText }]}>Heaviest Weight</Text>
              </View>
              {/* Best Set Volume — only shown if there are reps-based entries */}
              {bestVolumeEntry && (
                <View style={[styles.prStatCell, { backgroundColor: `${exerciseColor}25`, borderColor: exerciseColor }]}>
                  <Ionicons name="layers-outline" size={16} color={exerciseColor} />
                  <Text style={[styles.prStatValue, { color: colors.primaryText }]}>
                    {(() => { const w = toDisplay(bestVolumeEntry.bestSetWeight!); const r = Math.round(w * 10) / 10; return `${r % 1 === 0 ? Math.round(r) : r.toFixed(1)}${unit} × ${bestVolumeEntry.bestSetReps ?? 0}`; })()}
                  </Text>
                  <Text style={[styles.prStatLabel, { color: colors.secondaryText }]}>Best Set Volume</Text>
                </View>
              )}
              {/* Heaviest 2+ Rep Weight — only shown if there are multi-rep entries */}
              {bestMultiRepPR !== undefined && (
                <View style={[styles.prStatCell, { backgroundColor: `${exerciseColor}25`, borderColor: exerciseColor }]}>
                  <Ionicons name="trophy-outline" size={16} color={exerciseColor} />
                  <Text style={[styles.prStatValue, { color: colors.primaryText }]}>
                    {`${(() => { const r = Math.round(bestMultiRepPR * 10) / 10; return r % 1 === 0 ? Math.round(r) : r.toFixed(1); })()}${unit}`}
                  </Text>
                  <Text style={[styles.prStatLabel, { color: colors.secondaryText }]}>Heaviest 2+ Reps</Text>
                </View>
              )}
              {/* Best Isometric Hold — only shown if there are hold-based entries */}
              {bestIsometricEntry && (
                <View style={[styles.prStatCell, { backgroundColor: `${exerciseColor}25`, borderColor: exerciseColor }]}>
                  <Ionicons name="timer-outline" size={16} color={exerciseColor} />
                  <Text style={[styles.prStatValue, { color: colors.primaryText }]}>
                    {(() => { const w = toDisplay(bestIsometricEntry.bestIsometricWeight!); const r = Math.round(w * 10) / 10; return `${r % 1 === 0 ? Math.round(r) : r.toFixed(1)}${unit} × ${bestIsometricEntry.bestIsometricHold ?? 0}s`; })()}
                  </Text>
                  <Text style={[styles.prStatLabel, { color: colors.secondaryText }]}>Best Isometric Hold</Text>
                </View>
              )}
            </View>
          </View>
        )}

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
  prStatCell: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  prStatValue: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
  },
  prStatLabel: {
    fontSize: 11,
    fontFamily: 'Arimo_400Regular',
    textAlign: 'center',
  },
});
