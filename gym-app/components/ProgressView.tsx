/**
 * ProgressView — reusable progress content driven by a WorkoutJournalEntry array.
 * Used by both the Progress tab (own data) and the community member progress overlay.
 */
import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  PanResponder,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, {
  Line as SvgLine,
  Circle as SvgCircle,
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  Stop as SvgStop,
} from 'react-native-svg';
import { useTheme } from '../themeStore';
import { useProgramStore } from '../programStore';
import type { WorkoutJournalEntry, ExerciseHistoryEntry } from '../workoutState';
import { ExerciseInfoModal } from './ExerciseInfoModal';
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

// ─── Period types ─────────────────────────────────────────────────────────────

type PeriodKey = 'week' | 'lastWeek' | 'month' | 'allTime';

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'This Week' },
  { key: 'lastWeek', label: 'Last Week' },
  { key: 'month', label: 'This Month' },
  { key: 'allTime', label: 'All Time' },
];

const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStartOfWeek(date: Date, offsetWeeks = 0): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildPeriodData(
  log: { date: number; volume: number; durationSecs: number }[],
): Record<PeriodKey, { volume: { day: string; volume: number }[] }> {
  const now = new Date();
  const weekStart = getStartOfWeek(now);
  const weekBuckets = DAY_NAMES_SHORT.map(() => 0);
  const lastWeekStart = getStartOfWeek(now, -1);
  const lastWeekEnd = weekStart.getTime();
  const lastWeekBuckets = DAY_NAMES_SHORT.map(() => 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthBuckets: number[] = [0, 0, 0, 0, 0];
  const monthMap = new Map<string, number>();

  for (const entry of log) {
    const d = new Date(entry.date);
    if (entry.date >= weekStart.getTime()) {
      const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      weekBuckets[dayIdx] += entry.volume;
    }
    if (entry.date >= lastWeekStart.getTime() && entry.date < lastWeekEnd) {
      const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      lastWeekBuckets[dayIdx] += entry.volume;
    }
    if (entry.date >= monthStart.getTime()) {
      const weekIdx = Math.min(Math.floor((d.getDate() - 1) / 7), 4);
      monthBuckets[weekIdx] += entry.volume;
    }
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    monthMap.set(key, (monthMap.get(key) || 0) + entry.volume);
  }

  const allTimeSorted = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const allTimeBars = allTimeSorted.map(([key, vol]) => {
    const monthIdx = parseInt(key.split('-')[1], 10);
    return { day: MONTH_NAMES[monthIdx], volume: Math.round(vol) };
  });

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

function formatHistoryDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

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

function formatWeight(v: number): string {
  const r = Math.round(v * 10) / 10;
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1);
}

// ─── VolumeChart ──────────────────────────────────────────────────────────────

function VolumeChart({
  accentColor,
  data,
}: {
  accentColor: string;
  data: { day: string; volume: number }[];
}) {
  const { isDark, colors } = useTheme();
  const CHART_HEIGHT = 160;
  const Y_AXIS_W = 42;
  const ticks = getNiceTicks(0, Math.max(...data.map(d => d.volume), 1), 4);
  const chartTop = ticks[ticks.length - 1];
  const yLabels = [...ticks].reverse();
  const axisColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';

  return (
    <View style={pvStyles.chartContainer}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ width: Y_AXIS_W, height: CHART_HEIGHT, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6 }}>
          {yLabels.map((v, i) => (
            <Text key={i} style={[pvStyles.yAxisText, { color: colors.tertiaryText }]}>
              {formatVolume(Math.round(v))}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1 }}>
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 4, marginTop: 4 }}>
            {data.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <Text style={[pvStyles.barLabel, { color: colors.secondaryText }]}>{d.day}</Text>
                {d.volume > 0 ? (
                  <Text style={[pvStyles.barValue, { color: colors.tertiaryText }]}>{formatVolume(d.volume)}</Text>
                ) : (
                  <Text style={[pvStyles.barValue, { color: colors.tertiaryText, opacity: 0.35 }]}>—</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── LineChart ────────────────────────────────────────────────────────────────

function LineChart({
  data,
  accentColor,
  yUnit = 'kg',
  onPanActive,
}: {
  data: { date: string; weight: number; color?: string }[];
  accentColor: string;
  yUnit?: string;
  onPanActive?: (active: boolean) => void;
}) {
  const { isDark, colors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const xLabelScrollRef = useRef<ScrollView>(null);

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
  const MAX_DOT_SPACING = 80;
  const MIN_TICK_PX = 35;
  const axisColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)';

  // Pad the visible range so closely-clustered data doesn't produce micro-increments.
  // Minimum span = larger of: actual range, 15% of the max value, or 5 units.
  const range = maxW - minW;
  const minSpan = Math.max(range, maxW * 0.15, 5);
  const center = (minW + maxW) / 2;
  const paddedMin = Math.max(0, center - minSpan / 2);
  const paddedMax = center + minSpan / 2;
  // Max ticks that physically fit in the fixed chart height — prevents vertical scrolling
  const maxTickCount = Math.floor((CHART_HEIGHT - PAD_Y * 2) / MIN_TICK_PX) + 1;
  const ticks = data.length > 0 ? getNiceTicks(paddedMin, paddedMax, maxTickCount) : [0, 5, 10];
  const niceMin = ticks[0];
  const niceMax = ticks[ticks.length - 1];
  const niceRange = niceMax - niceMin || 1;

  const fullH = CHART_HEIGHT; // Always fixed — maxY is always 0, no vertical panning
  const tickY = (v: number) => PAD_Y + (1 - (v - niceMin) / niceRange) * (fullH - PAD_Y * 2);
  const formatTick = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(1);

  const count = data.length;
  const svgWidth = containerWidth > 0
    ? Math.max(containerWidth, count * DOT_SPACING + PAD_X * 2)
    : 0;

  // Cap spacing so points are never more than MAX_DOT_SPACING apart.
  // When fewer points than needed to fill the container, centre them in the SVG.
  const rawUsedWidth = count <= 1 ? 0 : (count - 1) * MAX_DOT_SPACING + PAD_X * 2;
  const pointsWidth = Math.min(rawUsedWidth, svgWidth);
  const pointsOffset = rawUsedWidth <= svgWidth ? (svgWidth - rawUsedWidth) / 2 : 0;

  const points = data.map((d, i) => ({
    x: count === 1
      ? svgWidth / 2
      : pointsOffset + PAD_X + (i / (count - 1)) * (pointsWidth - PAD_X * 2),
    y: tickY(d.weight),
    color: d.color || accentColor,
  }));

  const svgWidthRef = useRef(0);
  const containerWidthRef = useRef(0);
  const fullHRef = useRef(CHART_HEIGHT);
  svgWidthRef.current = svgWidth;
  containerWidthRef.current = containerWidth;
  fullHRef.current = fullH;

  React.useEffect(() => {
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

  React.useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      xLabelScrollRef.current?.scrollTo({ x: -value, animated: false });
    });
    return () => translateX.removeListener(id);
  }, [translateX]);

  const onPanActiveRef = useRef(onPanActive);
  onPanActiveRef.current = onPanActive;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        const maxX = Math.max(0, svgWidthRef.current - containerWidthRef.current);
        const maxY = Math.max(0, fullHRef.current - CHART_HEIGHT);
        return maxX > 0 || maxY > 0;
      },
      onMoveShouldSetPanResponder: () => {
        const maxX = Math.max(0, svgWidthRef.current - containerWidthRef.current);
        const maxY = Math.max(0, fullHRef.current - CHART_HEIGHT);
        return maxX > 0 || maxY > 0;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => { onPanActiveRef.current?.(true); },
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
      onPanResponderTerminate: () => { onPanActiveRef.current?.(false); },
    })
  ).current;

  return (
    <View style={pvStyles.lineChartContainer}>
      <View style={{ height: CHART_HEIGHT, overflow: 'hidden' }} {...panResponder.panHandlers}>
        <View style={{ position: 'absolute', left: Y_AXIS_W, top: 0, width: 1, height: CHART_HEIGHT, backgroundColor: axisColor, zIndex: 2 }} />
        <View style={{ position: 'absolute', left: Y_AXIS_W, bottom: 0, right: 0, height: 1, backgroundColor: axisColor, zIndex: 2 }} />
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: Y_AXIS_W, height: fullH, transform: [{ translateY }] }}>
          {ticks.map((t, i) => (
            <Text
              key={i}
              style={[pvStyles.yAxisText, {
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
        <View
          style={{ position: 'absolute', left: Y_AXIS_W, top: 0, right: 0, bottom: 0, overflow: 'hidden' }}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View style={{ transform: [{ translateX }, { translateY }] }}>
            {svgWidth > 0 && (
              <Svg width={svgWidth} height={fullH}>
                <SvgDefs>
                  {points.map((p, i) => {
                    if (i === points.length - 1) return null;
                    const next = points[i + 1];
                    if (p.color === next.color) return null;
                    return (
                      <SvgLinearGradient key={`grad-${i}`} id={`grad-${i}`} x1={p.x} y1={p.y} x2={next.x} y2={next.y} gradientUnits="userSpaceOnUse">
                        <SvgStop offset="0" stopColor={p.color} stopOpacity={0.6} />
                        <SvgStop offset="1" stopColor={next.color} stopOpacity={0.6} />
                      </SvgLinearGradient>
                    );
                  })}
                </SvgDefs>
                {ticks.map((t, gi) => (
                  <SvgLine key={gi} x1={0} y1={tickY(t)} x2={svgWidth} y2={tickY(t)} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'} strokeWidth={1} />
                ))}
                {points.map((p, i) => {
                  if (i === points.length - 1) return null;
                  const next = points[i + 1];
                  const sameColor = p.color === next.color;
                  return (
                    <SvgLine key={`line-${i}`} x1={p.x} y1={p.y} x2={next.x} y2={next.y} stroke={sameColor ? `${p.color}99` : `url(#grad-${i})`} strokeWidth={2.5} strokeLinecap="round" />
                  );
                })}
                {points.map((p, i) => (
                  <SvgCircle key={`dot-${i}`} cx={p.x} cy={p.y} r={5} fill={p.color} stroke={isDark ? colors.cardSolid : '#fff'} strokeWidth={2} />
                ))}
              </Svg>
            )}
          </Animated.View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        <View style={{ width: Y_AXIS_W }} />
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <ScrollView ref={xLabelScrollRef} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
            {svgWidth > 0 && (
              <View style={{ width: svgWidth, height: 20 }}>
                {data.map((d, i) => {
                  const labelX = count === 1
                    ? svgWidth / 2
                    : pointsOffset + PAD_X + (i / (count - 1)) * (pointsWidth - PAD_X * 2);
                  return (
                    <Text key={i} style={[pvStyles.lineChartLabel, { color: colors.secondaryText, position: 'absolute', left: labelX - 20, width: 40, textAlign: 'center' }]}>
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

// ─── ProgressView ─────────────────────────────────────────────────────────────

type Props = {
  journal: WorkoutJournalEntry[];
  unit: 'kg' | 'lbs';
  toDisplay: (v: number) => number;
  /** Show "Progress" title + subtitle at top of scroll (for standalone progress page). */
  showTitle?: boolean;
  /** Top padding inside the ScrollView. Default 8. For the progress tab pass Platform.OS==='ios' ? 60 : 40. */
  scrollTopPadding?: number;
  /** Forward ref to the internal ScrollView so callers can scroll to top on focus. */
  scrollRef?: React.RefObject<ScrollView | null>;
  /** Override the initial selected program name (e.g. for community member view). */
  initialProgramName?: string | null;
};

export function ProgressView({
  journal,
  unit,
  toDisplay,
  showTitle = false,
  scrollTopPadding = 8,
  scrollRef,
  initialProgramName,
}: Props) {
  const { colors, isDark } = useTheme();
  const { programs, activeId } = useProgramStore();
  const [chartPanning, setChartPanning] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('week');
  const [exerciseMetric, setExerciseMetric] = useState<'heaviest' | 'setVolume'>('heaviest');
  const chartFade = useRef(new Animated.Value(1)).current;
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const ALL_ACCENT = '#94A3B8';
  const activeProgramName = initialProgramName !== undefined
    ? initialProgramName
    : (programs.find(p => p.id === activeId)?.name ?? null);
  const [selectedProgramName, setSelectedProgramName] = useState<string | null>(activeProgramName);
  const [infoExerciseName, setInfoExerciseName] = useState<string | null>(null);

  // ── Derive unique programs from journal (active program first) ───────────────
  const derivedPrograms = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const entry of journal) {
      if (!map.has(entry.programName)) {
        map.set(entry.programName, { name: entry.programName, color: entry.programColor });
      }
    }
    const arr = Array.from(map.values());
    const activeName = programs.find(p => p.id === activeId)?.name;
    if (activeName) {
      const idx = arr.findIndex(p => p.name === activeName);
      if (idx > 0) arr.unshift(...arr.splice(idx, 1));
    }
    return arr;
  }, [journal, programs, activeId]);

  const selectedProgram = derivedPrograms.find(p => p.name === selectedProgramName);
  const accentColor = selectedProgramName === null ? ALL_ACCENT : (selectedProgram?.color ?? ALL_ACCENT);

  // ── Filter journal by selected program ───────────────────────────────────────
  const filteredJournal = useMemo(
    () => selectedProgramName === null ? journal : journal.filter(e => e.programName === selectedProgramName),
    [journal, selectedProgramName],
  );

  // ── Workout log ──────────────────────────────────────────────────────────────
  const workoutLog = useMemo(
    () => [...filteredJournal].sort((a, b) => a.date - b.date).map(e => ({ date: e.date, volume: e.totalVolume, durationSecs: e.durationSecs })),
    [filteredJournal],
  );

  // ── Training days + exercise list from journal ────────────────────────────────
  const { trainingDays, exercisePrograms } = useMemo(() => {
    const dayMap = new Map<string, { exercises: string[]; color: string }>();
    const exPrograms = new Map<string, string[]>();
    for (const entry of filteredJournal) {
      for (const session of entry.sessions) {
        const existing = dayMap.get(session.label);
        const exercises = existing ? [...existing.exercises] : [];
        for (const ex of session.exercises) {
          if (!exercises.includes(ex.name)) exercises.push(ex.name);
          const cols = exPrograms.get(ex.name) ?? [];
          if (!cols.includes(entry.programColor)) cols.push(entry.programColor);
          exPrograms.set(ex.name, cols);
        }
        dayMap.set(session.label, { exercises, color: entry.programColor });
      }
    }

    // Order days by the program's splitDays order
    const refProgram = selectedProgramName !== null
      ? programs.find(p => p.name === selectedProgramName)
      : programs.find(p => p.id === activeId);
    const orderedLabels = refProgram
      ? refProgram.splitDays.flatMap(sd => 'sessions' in sd ? sd.sessions.map(s => s.label) : []).filter((l, i, a) => a.indexOf(l) === i)
      : [];

    const days = Array.from(dayMap.entries()).map(([label, { exercises, color }]) => ({ label, exercises, color }));
    if (orderedLabels.length > 0) {
      days.sort((a, b) => {
        const ia = orderedLabels.indexOf(a.label);
        const ib = orderedLabels.indexOf(b.label);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    }

    return { trainingDays: days, exercisePrograms: exPrograms };
  }, [filteredJournal, programs, activeId, selectedProgramName]);

  const firstExercise = trainingDays[0]?.exercises[0] ?? '';
  const [selectedExercise, setSelectedExercise] = useState(firstExercise);

  // Reset selected exercise when program filter changes
  const prevProgramName = useRef(selectedProgramName);
  if (prevProgramName.current !== selectedProgramName) {
    prevProgramName.current = selectedProgramName;
    const first = trainingDays[0];
    if (first) {
      setSelectedExercise(first.exercises[0] ?? '');
      setExpandedDays({ [first.label]: true });
    }
  }

  // ── Period data ───────────────────────────────────────────────────────────────
  const periodData = useMemo(() => buildPeriodData(workoutLog), [workoutLog]);

  // ── Summary stats ─────────────────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const total = workoutLog.length;
    const totalVol = workoutLog.reduce((s, e) => s + e.volume, 0);
    const avgDur = total > 0 ? workoutLog.reduce((s, e) => s + e.durationSecs, 0) / total : 0;
    return { workouts: String(total), volume: formatVolume(totalVol), avgDuration: formatDuration(avgDur) };
  }, [workoutLog]);

  // ── Exercise history (equivalent to workoutState.getHistory) ─────────────────
  const historyForExercise = useMemo(() => {
    if (!selectedExercise) return [];
    const byDay = new Map<string, ExerciseHistoryEntry>();
    for (const entry of filteredJournal) {
      for (const session of entry.sessions) {
        const ex = session.exercises.find(e => e.name === selectedExercise);
        if (!ex) continue;
        const validSets = ex.sets.filter(s => (s.weight ?? 0) > 0);
        if (validSets.length === 0) continue;
        const maxWeight = Math.max(...validSets.map(s => s.weight ?? 0));
        const maxRepsWeight = ex.mode !== 'hold' ? maxWeight : 0;
        let bestSetVol = 0, bestSetWeight = 0, bestSetReps = 0, bestMultiRepWeight = 0;
        let bestIsoVol = 0, bestIsoWeight = 0, bestIsoHold = 0;
        for (const s of validSets) {
          if (ex.mode === 'hold') {
            const vol = (s.hold ?? 0) * (s.weight ?? 0);
            if (vol > bestIsoVol) { bestIsoVol = vol; bestIsoWeight = s.weight ?? 0; bestIsoHold = s.hold ?? 0; }
          } else {
            const vol = (s.reps ?? 0) * (s.weight ?? 0);
            if (vol > bestSetVol) { bestSetVol = vol; bestSetWeight = s.weight ?? 0; bestSetReps = s.reps ?? 0; }
            if ((s.reps ?? 0) >= 2 && (s.weight ?? 0) > bestMultiRepWeight) bestMultiRepWeight = s.weight ?? 0;
          }
        }
        const dayStr = new Date(entry.date).toDateString();
        const existing = byDay.get(dayStr);
        if (!existing) {
          byDay.set(dayStr, {
            date: entry.date, weight: maxWeight,
            repsWeight: maxRepsWeight || undefined, bestMultiRepWeight: bestMultiRepWeight || undefined,
            bestSetVolume: bestSetVol, bestSetWeight: bestSetWeight || undefined, bestSetReps: bestSetReps || undefined,
            bestIsometricWeight: bestIsoWeight || undefined, bestIsometricHold: bestIsoHold || undefined,
            programColor: entry.programColor, programId: entry.programId, programName: entry.programName,
          });
        } else {
          const useNew = maxWeight > existing.weight;
          const useBestVol = bestSetVol > existing.bestSetVolume;
          const existingIsoVol = (existing.bestIsometricWeight ?? 0) * (existing.bestIsometricHold ?? 0);
          const useBestIso = bestIsoVol > existingIsoVol;
          byDay.set(dayStr, {
            date: entry.date,
            weight: Math.max(existing.weight, maxWeight),
            repsWeight: Math.max(existing.repsWeight ?? 0, maxRepsWeight) || undefined,
            bestMultiRepWeight: Math.max(existing.bestMultiRepWeight ?? 0, bestMultiRepWeight) || undefined,
            bestSetVolume: Math.max(existing.bestSetVolume, bestSetVol),
            bestSetWeight: useBestVol ? (bestSetWeight || undefined) : existing.bestSetWeight,
            bestSetReps: useBestVol ? (bestSetReps || undefined) : existing.bestSetReps,
            bestIsometricWeight: useBestIso ? (bestIsoWeight || undefined) : existing.bestIsometricWeight,
            bestIsometricHold: useBestIso ? (bestIsoHold || undefined) : existing.bestIsometricHold,
            programColor: useNew ? entry.programColor : existing.programColor,
            programId: useNew ? entry.programId : existing.programId,
            programName: useNew ? entry.programName : existing.programName,
          });
        }
      }
    }
    return Array.from(byDay.values()).sort((a, b) => a.date - b.date);
  }, [filteredJournal, selectedExercise]);

  // ── Body-weight reps history (0 kg sets, reps-only) ──────────────────────────
  const bodyweightHistory = useMemo(() => {
    if (!selectedExercise) return [];
    const byDay = new Map<string, { date: number; maxReps: number; color: string; programName?: string }>();
    for (const entry of filteredJournal) {
      for (const session of entry.sessions) {
        const ex = session.exercises.find(e => e.name === selectedExercise);
        if (!ex || ex.mode === 'hold') continue;
        const bwSets = ex.sets.filter(s => (s.weight ?? 0) === 0 && (s.reps ?? 0) > 0);
        if (bwSets.length === 0) continue;
        const maxReps = Math.max(...bwSets.map(s => s.reps));
        const dayStr = new Date(entry.date).toDateString();
        const existing = byDay.get(dayStr);
        if (!existing || maxReps > existing.maxReps) {
          byDay.set(dayStr, { date: entry.date, maxReps, color: entry.programColor, programName: entry.programName });
        }
      }
    }
    return Array.from(byDay.values()).sort((a, b) => a.date - b.date);
  }, [filteredJournal, selectedExercise]);

  // ── Chart data ────────────────────────────────────────────────────────────────
  const THREE_MONTHS_AGO = Date.now() - 90 * 24 * 60 * 60 * 1000;
  // Fall back to all available data if nothing in the last 90 days (exercise not done recently)
  const rawHistory90 = historyForExercise.filter(e => e.date >= THREE_MONTHS_AGO);
  const rawHistory = rawHistory90.length > 0 ? rawHistory90 : historyForExercise;
  const repsHistory = rawHistory.filter(e => (e.repsWeight ?? 0) > 0);
  const exerciseData = repsHistory.map(entry => ({
    date: formatHistoryDate(entry.date),
    weight: toDisplay(exerciseMetric === 'heaviest' ? (entry.repsWeight ?? entry.weight) : entry.bestSetVolume),
    color: derivedPrograms.find(p => p.name === entry.programName)?.color ?? entry.programColor,
  }));

  // Body-weight chart data (max reps per day, 0 kg)
  const rawBw90 = bodyweightHistory.filter(e => e.date >= THREE_MONTHS_AGO);
  const rawBw = rawBw90.length > 0 ? rawBw90 : bodyweightHistory;
  const bodyweightData = rawBw.map(e => ({
    date: formatHistoryDate(e.date),
    weight: e.maxReps,
    color: derivedPrograms.find(p => p.name === e.programName)?.color ?? e.color,
  }));
  const maxBwReps = bodyweightHistory.length > 0 ? Math.max(...bodyweightHistory.map(e => e.maxReps)) : undefined;
  // Only use bodyweight display when the exercise has zero weighted history
  const isBodyweightChart = repsHistory.length === 0 && bodyweightData.length > 0;

  const exerciseColor = trainingDays.find(d => d.exercises.includes(selectedExercise))?.color ?? accentColor;

  // ── PR calculations ───────────────────────────────────────────────────────────
  const heaviestPR = repsHistory.length > 0 ? toDisplay(Math.max(...repsHistory.map(e => e.repsWeight ?? e.weight))) : undefined;
  const repsEntries = rawHistory.filter(e => (e.bestSetReps ?? 0) > 0 && e.bestSetVolume > 0);
  const bestVolumeEntry = repsEntries.length > 0 ? repsEntries.reduce((best, e) => e.bestSetVolume > best.bestSetVolume ? e : best) : undefined;
  const multiRepEntries = rawHistory.filter(e => (e.bestMultiRepWeight ?? 0) > 0);
  const bestMultiRepPR = multiRepEntries.length > 0 ? toDisplay(Math.max(...multiRepEntries.map(e => e.bestMultiRepWeight!))) : undefined;
  const isoEntries = rawHistory.filter(e => (e.bestIsometricHold ?? 0) > 0);
  const bestIsometricEntry = isoEntries.length > 0 ? isoEntries.reduce((best, e) =>
    ((e.bestIsometricWeight ?? 0) * (e.bestIsometricHold ?? 0)) > ((best.bestIsometricWeight ?? 0) * (best.bestIsometricHold ?? 0)) ? e : best,
  ) : undefined;

  const handleMetricChange = (metric: 'heaviest' | 'setVolume') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(chartFade, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setExerciseMetric(metric);
      Animated.timing(chartFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[pvStyles.scrollContent, { paddingTop: scrollTopPadding }]}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!chartPanning}
    >
      {showTitle && (
        <>
          <Text style={pvStyles.screenTitle}>Progress</Text>
          <Text style={pvStyles.subtitle}>
            {selectedProgramName === null ? 'All Programs' : selectedProgramName} Overview
          </Text>
        </>
      )}

      {/* Program selector — shown whenever at least one program exists */}
      {derivedPrograms.length >= 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 16, marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedProgramName(null); }}
            style={[pvStyles.periodPill, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }, selectedProgramName === null && { backgroundColor: `${accentColor}25`, borderColor: accentColor }]}
            activeOpacity={0.7}
          >
            <Text style={[pvStyles.periodPillText, { color: colors.secondaryText }, selectedProgramName === null && { color: colors.primaryText }]}>All</Text>
          </TouchableOpacity>
          {derivedPrograms.map(p => {
            const isActive = p.name === selectedProgramName;
            return (
              <TouchableOpacity
                key={p.name}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedProgramName(p.name); }}
                style={[pvStyles.periodPill, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }, isActive && { backgroundColor: `${p.color}25`, borderColor: p.color }]}
                activeOpacity={0.7}
              >
                <Text style={[pvStyles.periodPillText, { color: colors.secondaryText }, isActive && { color: colors.primaryText }]}>{p.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Summary stats */}
      <View style={pvStyles.statsRow}>
        {([
          { value: summaryStats.workouts, label: 'Total Workouts', icon: 'barbell-outline' as const },
          { value: summaryStats.volume, label: `Volume (${unit})`, icon: 'trending-up-outline' as const },
          { value: summaryStats.avgDuration, label: 'Avg Duration', icon: 'timer-outline' as const },
        ] as const).map((stat, i) => (
          <View key={i} style={[pvStyles.statCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
            <Ionicons name={stat.icon} size={20} color={accentColor} />
            <Text style={[pvStyles.statValue, { color: colors.primaryText }]}>{stat.value}</Text>
            <Text style={[pvStyles.statLabel, { color: colors.secondaryText }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Volume chart */}
      <Text style={pvStyles.sectionTitle}>Volume</Text>
      <View style={[pvStyles.glassCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
        <View style={pvStyles.periodRow}>
          {PERIOD_OPTIONS.map(opt => {
            const isActive = opt.key === selectedPeriod;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedPeriod(opt.key); }}
                style={[pvStyles.periodPill, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }, isActive && { backgroundColor: `${accentColor}25`, borderColor: accentColor }]}
                activeOpacity={0.7}
              >
                <Text style={[pvStyles.periodPillText, { color: colors.secondaryText }, isActive && { color: colors.primaryText }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <VolumeChart accentColor={accentColor} data={periodData[selectedPeriod].volume} />
      </View>

      {/* Exercise progress — always shown; placeholder when no data yet */}
      <>
        <Text style={pvStyles.sectionTitle}>Exercise Progress</Text>

        {trainingDays.length === 0 ? (
          <View style={[pvStyles.glassCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder, alignItems: 'center', gap: 10 }]}>
            <Ionicons name="bar-chart-outline" size={32} color={colors.tertiaryText} />
            <Text style={[pvStyles.emptyText, { color: colors.secondaryText, paddingVertical: 0 }]}>
              Log workouts to see exercise progress and weight charts here.
            </Text>
          </View>
        ) : (
          <>
          {trainingDays.map(day => {
            const isExpanded = expandedDays[day.label] ?? false;
            return (
              <View key={day.label} style={{ marginBottom: 8 }}>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setExpandedDays(prev => ({ ...prev, [day.label]: !prev[day.label] })); }}
                  style={[pvStyles.dayHeader, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[pvStyles.dayDot, { backgroundColor: day.color }]} />
                    <Text style={[pvStyles.dayHeaderText, { color: colors.primaryText }]}>{day.label}</Text>
                    <Text style={[pvStyles.dayExerciseCount, { color: colors.secondaryText }]}>{day.exercises.length} exercise{day.exercises.length !== 1 ? 's' : ''}</Text>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.secondaryText} />
                </TouchableOpacity>
                {isExpanded && day.exercises.map(name => {
                  const isSelected = name === selectedExercise;
                  const imgUrl = getExerciseImageUrl(name);
                  return (
                    <TouchableOpacity
                      key={name}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (isSelected) { setInfoExerciseName(name); } else { setSelectedExercise(name); }
                      }}
                      style={[pvStyles.exerciseRow, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }, isSelected && { backgroundColor: `${day.color}20`, borderColor: `${day.color}80` }]}
                      activeOpacity={0.7}
                    >
                      {imgUrl && (
                        <Image source={{ uri: imgUrl }} style={pvStyles.exerciseThumb} resizeMode="cover" />
                      )}
                      <Text style={[pvStyles.exerciseRowText, { color: colors.primaryText, flex: 1 }, isSelected && { fontFamily: 'Arimo_700Bold' }]}>{name}</Text>
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

          {/* Selected exercise label */}
          {selectedExercise ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 4, paddingHorizontal: 2 }}>
              <View style={{ flex: 1, height: 2, backgroundColor: exerciseColor, opacity: 0.6, borderRadius: 1 }} />
              <View style={{ maxWidth: '70%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: `${exerciseColor}18`, borderWidth: 1.5, borderColor: exerciseColor }}>
                <Ionicons name="barbell-outline" size={13} color={isDark ? '#fff' : colors.primaryText} style={{ flexShrink: 0 }} />
                <Text style={{ fontSize: 13, fontFamily: 'Arimo_700Bold', color: isDark ? '#fff' : colors.primaryText, flexShrink: 1, textAlign: 'center' }}>{selectedExercise}</Text>
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: exerciseColor, opacity: 0.6, borderRadius: 1 }} />
            </View>
          ) : null}

          {/* Weight / Reps progression chart */}
          <View style={[pvStyles.glassCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder, marginTop: 16 }]}>
            <Text style={[pvStyles.cardLabel, { color: colors.secondaryText, marginBottom: 12 }]}>
              {isBodyweightChart ? 'REPS PROGRESSION (BODY WEIGHT)' : 'WEIGHT PROGRESSION'}
            </Text>
            <Animated.View style={{ opacity: chartFade }}>
              {exerciseData.length > 0 ? (
                <LineChart data={exerciseData} accentColor={exerciseColor} yUnit={unit} onPanActive={setChartPanning} />
              ) : isBodyweightChart ? (
                <LineChart data={bodyweightData} accentColor={exerciseColor} yUnit=" reps" onPanActive={setChartPanning} />
              ) : (() => {
                const inJournalNoWeight = filteredJournal.some(entry =>
                  entry.sessions.some(session =>
                    session.exercises.some(ex => ex.name === selectedExercise && ex.sets.some(s => s.reps > 0))
                  )
                );
                return (
                  <Text style={[pvStyles.emptyText, { color: colors.secondaryText }]}>
                    {inJournalNoWeight
                      ? 'No weight recorded for this exercise. Enter weight in the journal to track progress.'
                      : 'No data for this exercise yet'}
                  </Text>
                );
              })()}
            </Animated.View>
            {!isBodyweightChart && (
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
                      style={[pvStyles.periodPill, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }, isActive && { backgroundColor: `${exerciseColor}25`, borderColor: exerciseColor }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[pvStyles.periodPillText, { color: colors.secondaryText }, isActive && { color: colors.primaryText }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Personal records */}
          {(rawHistory.length > 0 || (repsHistory.length === 0 && maxBwReps !== undefined)) && (
            <View style={[pvStyles.glassCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
              <Text style={[pvStyles.cardLabel, { color: colors.secondaryText, marginBottom: 12 }]}>PERSONAL RECORDS</Text>
              <View style={{ flexDirection: 'column', gap: 10 }}>
                {repsHistory.length === 0 && maxBwReps !== undefined && (
                  <View style={[pvStyles.prStatCell, { backgroundColor: `${exerciseColor}25`, borderColor: exerciseColor }]}>
                    <Ionicons name="trophy-outline" size={16} color={exerciseColor} />
                    <Text style={[pvStyles.prStatValue, { color: colors.primaryText }]}>
                      {`${maxBwReps} reps`}
                    </Text>
                    <Text style={[pvStyles.prStatLabel, { color: colors.secondaryText }]}>Max Reps (Body Weight)</Text>
                  </View>
                )}
                {rawHistory.length > 0 && (<>
                  <View style={[pvStyles.prStatCell, { backgroundColor: `${exerciseColor}25`, borderColor: exerciseColor }]}>
                    <Ionicons name="barbell-outline" size={16} color={exerciseColor} />
                    <Text style={[pvStyles.prStatValue, { color: colors.primaryText }]}>
                      {heaviestPR !== undefined ? `${formatWeight(heaviestPR)}${unit}` : '—'}
                    </Text>
                    <Text style={[pvStyles.prStatLabel, { color: colors.secondaryText }]}>Heaviest Weight</Text>
                  </View>
                  {bestVolumeEntry && (
                    <View style={[pvStyles.prStatCell, { backgroundColor: `${exerciseColor}25`, borderColor: exerciseColor }]}>
                      <Ionicons name="layers-outline" size={16} color={exerciseColor} />
                      <Text style={[pvStyles.prStatValue, { color: colors.primaryText }]}>
                        {`${formatWeight(toDisplay(bestVolumeEntry.bestSetWeight!))}${unit} × ${bestVolumeEntry.bestSetReps ?? 0}`}
                      </Text>
                      <Text style={[pvStyles.prStatLabel, { color: colors.secondaryText }]}>Best Set Volume</Text>
                    </View>
                  )}
                  {bestMultiRepPR !== undefined && (
                    <View style={[pvStyles.prStatCell, { backgroundColor: `${exerciseColor}25`, borderColor: exerciseColor }]}>
                      <Ionicons name="trophy-outline" size={16} color={exerciseColor} />
                      <Text style={[pvStyles.prStatValue, { color: colors.primaryText }]}>
                        {`${formatWeight(bestMultiRepPR)}${unit}`}
                      </Text>
                      <Text style={[pvStyles.prStatLabel, { color: colors.secondaryText }]}>Heaviest 2+ Reps</Text>
                    </View>
                  )}
                  {bestIsometricEntry && (
                    <View style={[pvStyles.prStatCell, { backgroundColor: `${exerciseColor}25`, borderColor: exerciseColor }]}>
                      <Ionicons name="timer-outline" size={16} color={exerciseColor} />
                      <Text style={[pvStyles.prStatValue, { color: colors.primaryText }]}>
                        {`${formatWeight(toDisplay(bestIsometricEntry.bestIsometricWeight!))}${unit} × ${bestIsometricEntry.bestIsometricHold ?? 0}s`}
                      </Text>
                      <Text style={[pvStyles.prStatLabel, { color: colors.secondaryText }]}>Best Isometric Hold</Text>
                    </View>
                  )}
                </>)}
              </View>
            </View>
          )}
          </>
        )}
      </>

      {journal.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
          <Ionicons name="barbell-outline" size={40} color={colors.tertiaryText} />
          <Text style={[pvStyles.emptyText, { color: colors.secondaryText }]}>No workouts logged yet</Text>
        </View>
      )}
      <ExerciseInfoModal exerciseName={infoExerciseName} onClose={() => setInfoExerciseName(null)} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pvStyles = StyleSheet.create({
  scrollContent: {
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
  chartContainer: {
    paddingTop: 4,
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
  exerciseThumb: {
    width: 32,
    height: 32,
    borderRadius: 7,
    marginRight: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  exerciseRowText: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
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
  emptyText: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
