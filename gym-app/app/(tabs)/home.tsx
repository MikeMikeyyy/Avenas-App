import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  Image,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { workoutState } from '../../workoutState';
import { useProgramStore, getDayLabel, getDayExerciseCount, isMultiSession } from '../../programStore';
import { useTheme } from '../../themeStore';
import { useUnits } from '../../unitsStore';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { useAuth } from '../../authStore';
import { Nunito_700Bold } from '@expo-google-fonts/nunito';

const STREAK_KEY = 'appStreak';
let _streakAnimPlayed = false;

type StreakData = {
  streak: number;
  lastWorkoutDayOpenDate: string;
  lastWorkoutDayOpenTimestamp: number;
};

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadAndUpdateStreak(isTodayWorkout: boolean): Promise<number> {
  const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
  const today = getTodayStr();
  const now = Date.now();
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    if (!raw) {
      const data: StreakData = {
        streak: 1,
        lastWorkoutDayOpenDate: isTodayWorkout ? today : '',
        lastWorkoutDayOpenTimestamp: isTodayWorkout ? now : 0,
      };
      await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data));
      return 1;
    }

    const stored: any = JSON.parse(raw);
    let streak: number = stored.streak ?? 1;
    const lastWorkoutDayOpenDate: string = stored.lastWorkoutDayOpenDate ?? '';
    const lastWorkoutDayOpenTimestamp: number = stored.lastWorkoutDayOpenTimestamp ?? 0;

    // Rest day — don't touch anything
    if (!isTodayWorkout) return streak;

    // Same workout day — already counted
    if (lastWorkoutDayOpenDate === today) return streak;

    // New workout day — check if within 48 hours of last workout day open
    if (lastWorkoutDayOpenTimestamp > 0 && now - lastWorkoutDayOpenTimestamp < FORTY_EIGHT_HOURS) {
      streak += 1;
    } else {
      streak = 1;
    }

    const data: StreakData = { streak, lastWorkoutDayOpenDate: today, lastWorkoutDayOpenTimestamp: now };
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(data));
    return streak;
  } catch {
    return 1;
  }
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};

const getFormattedDate = () => {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
};

function BookOpenIcon({ size = 24, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </Svg>
  );
}

function BounceButton({ style, children, onPress, ...rest }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
  };
  // Extract layout/position props for the outer wrapper, keep visual props for inner
  const {
    flex, flexGrow, flexShrink, flexBasis, alignSelf,
    position, top, bottom, left, right, zIndex,
    ...innerStyle
  } = StyleSheet.flatten(style) || {} as any;
  const outerStyle: any = {};
  if (flex !== undefined) outerStyle.flex = flex;
  if (flexGrow !== undefined) outerStyle.flexGrow = flexGrow;
  if (flexShrink !== undefined) outerStyle.flexShrink = flexShrink;
  if (flexBasis !== undefined) outerStyle.flexBasis = flexBasis;
  if (alignSelf !== undefined) outerStyle.alignSelf = alignSelf;
  if (position !== undefined) outerStyle.position = position;
  if (top !== undefined) outerStyle.top = top;
  if (bottom !== undefined) outerStyle.bottom = bottom;
  if (left !== undefined) outerStyle.left = left;
  if (right !== undefined) outerStyle.right = right;
  if (zIndex !== undefined) outerStyle.zIndex = zIndex;
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={outerStyle}
      {...rest}
    >
      <Animated.View style={[innerStyle, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

function getWeekStart(): number {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

function computeWeeklyStats() {
  const weekStart = getWeekStart();
  const now = Date.now();
  const entries = workoutState.getJournalLog().filter(e => e.date >= weekStart && e.date <= now);
  const workouts = entries.length;
  const volume = entries.reduce((sum, e) => sum + e.totalVolume, 0);
  const timedEntries = entries.filter(e => e.durationSecs > 0);
  const totalDuration = timedEntries.reduce((sum, e) => sum + e.durationSecs, 0);
  const avgDuration = timedEntries.length > 0 ? Math.round(totalDuration / timedEntries.length) : 0;
  return { workouts, volume, avgDuration };
}

function fmtVolume(kg: number): string {
  if (kg <= 0) return '—';
  return Math.round(kg).toLocaleString();
}

function fmtAvgDuration(secs: number): string {
  if (secs <= 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { programs, activeId } = useProgramStore();
  const { isDark, colors } = useTheme();
  const { unit } = useUnits();
  const { user } = useAuth();
  const profileInitials = user?.displayName
    ? user.displayName.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('')
    : '?';
  const activeProgram = programs.find(p => p.id === activeId && !p.archived);
  const accentColor = activeProgram?.color || '#47DDFF';
  const todayDayIndex = 0; // today is always index 0 in the calendar
  const [streak, setStreak] = useState(1);
  const [workoutDone, setWorkoutDone] = useState(workoutState.finished);
  const getLast7DaysEntries = () => { const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; return workoutState.getJournalLog().filter(e => e.date >= cutoff); };
  const [recentEntries, setRecentEntries] = useState(() => getLast7DaysEntries());
  const [weeklyStats, setWeeklyStats] = useState(() => computeWeeklyStats());
  const [weeklyPlanCount, setWeeklyPlanCount] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(!!workoutState.getTimerStartedAt(todayDayIndex) || workoutState.getTimerPausedElapsed(todayDayIndex) > 0);
  const [elapsed, setElapsed] = useState(workoutState.getElapsed(todayDayIndex));

  useEffect(() => {
    const splitPattern = activeProgram?.splitDays.map(sd => sd.type === 'training') ?? [];
    if (!activeProgram || splitPattern.length === 0) {
      loadAndUpdateStreak(true).then(setStreak);
      return;
    }
    workoutState.getCycleOffset(activeProgram.id, splitPattern.length).then(cycleOffset => {
      const n = splitPattern.length;
      const todayPos = ((cycleOffset % n) + n) % n;
      const isTodayWorkout = splitPattern[todayPos];
      loadAndUpdateStreak(isTodayWorkout).then(setStreak);
    });
  }, [activeId]);

  useEffect(() => {
    return workoutState.subscribe((done) => {
      setWorkoutDone(done);
      setWeeklyStats(computeWeeklyStats());
    });
  }, []);

  // Compute planned training days this week for the current active program
  useEffect(() => {
    if (!activeProgram) { setWeeklyPlanCount(null); return; }
    const cycleLength = activeProgram.splitDays.length;
    if (cycleLength === 0) { setWeeklyPlanCount(null); return; }
    workoutState.getCycleOffset(activeProgram.id, cycleLength).then(offset => {
      const now = new Date();
      const mondayOffset = (now.getDay() + 6) % 7; // days since Monday (0 = Mon, 6 = Sun)
      let count = 0;
      for (let i = 0; i < 7; i++) {
        const daysFromToday = i - mondayOffset;
        const ci = ((offset + daysFromToday) % cycleLength + cycleLength) % cycleLength;
        if (activeProgram.splitDays[ci]?.type === 'training') count++;
      }
      setWeeklyPlanCount(count);
    });
  }, [activeProgram?.id]);

  useEffect(() => {
    const sync = () => {
      const running = !!workoutState.getTimerStartedAt(todayDayIndex);
      setTimerActive(running || workoutState.getTimerPausedElapsed(todayDayIndex) > 0);
      setElapsed(workoutState.getElapsed(todayDayIndex));
    };
    return workoutState.subscribeTimer(sync);
  }, []);

  useEffect(() => {
    const running = !!workoutState.getTimerStartedAt(todayDayIndex);
    if (!running) return;
    const tick = () => setElapsed(workoutState.getElapsed(todayDayIndex));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerActive]);

  const [fontsLoaded] = useFonts({
    Arimo_400Regular,
    Arimo_700Bold,
    Nunito_700Bold,
  });

  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setRecentEntries(getLast7DaysEntries());
    setWeeklyStats(computeWeeklyStats());
  }, []));

  const flameScale = useRef(new Animated.Value(1)).current;
  const flameOpacity = useRef(new Animated.Value(1)).current;
  const streakExpanded = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(flameScale, { toValue: 1.15, duration: 300, useNativeDriver: true }),
          Animated.timing(flameOpacity, { toValue: 0.7, duration: 300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(flameScale, { toValue: 0.95, duration: 200, useNativeDriver: true }),
          Animated.timing(flameOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(flameScale, { toValue: 1.1, duration: 250, useNativeDriver: true }),
          Animated.timing(flameOpacity, { toValue: 0.8, duration: 250, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(flameScale, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(flameOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  // Expand badge and collapse after 2 s — only once per app session
  useFocusEffect(useCallback(() => {
    if (_streakAnimPlayed) {
      // Component may have remounted (tab switch) — jump straight to collapsed state
      streakExpanded.setValue(0);
      return;
    }
    const t = setTimeout(() => {
      _streakAnimPlayed = true;
      Animated.timing(streakExpanded, {
        toValue: 0,
        duration: 550,
        useNativeDriver: false,
      }).start();
    }, 2000);
    return () => clearTimeout(t);
  }, []));

  if (!fontsLoaded) return null;

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.gradientStart} />

      {/* Fixed Profile - Top Right */}
      <BounceButton style={[styles.fixedProfile, { backgroundColor: '#FFFFFF' }]} onPress={() => router.push('/settings')}>
        <Text style={[styles.profileInitials, { color: '#2c3e50' }]}>{profileInitials}</Text>
      </BounceButton>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* AV Logo */}
        <Image
          source={require('../../assets/images/av-logo.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />

        {/* Greeting */}
        <View style={styles.greetingContainer}>
          <View style={styles.greetingRow}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <View style={[styles.streakBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#ffffff80', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#ffffffcc' }]}>
              <Animated.View style={{ transform: [{ scale: flameScale }], opacity: flameOpacity }}>
                <Ionicons name="flame" size={18} color="#FF9500" />
              </Animated.View>
              <Text style={styles.streakText}>{streak}</Text>
              <Animated.View style={{
                overflow: 'hidden',
                maxWidth: streakExpanded.interpolate({ inputRange: [0, 1], outputRange: [0, 110] }),
                opacity: streakExpanded.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] }),
              }}>
                <Text style={[styles.streakText, { marginLeft: 2 }]} numberOfLines={1}>
                  {`Day${streak !== 1 ? 's' : ''} Streak`}
                </Text>
              </Animated.View>
            </View>
          </View>
          <Text style={styles.date}>{getFormattedDate()}</Text>
        </View>

        {/* Today's Workout Card */}
        {(() => {
          const hasPrograms = programs.filter(p => !p.archived).length > 0;
          const todaySplit = activeProgram?.splitDays[0];
          const isRestDay = !todaySplit || todaySplit.type === 'rest';
          const dayLabel = isRestDay ? 'Rest Day' : getDayLabel(todaySplit);
          const exerciseCount = isRestDay ? 0 : getDayExerciseCount(todaySplit);
          const multiSession = !isRestDay && todaySplit.type === 'training' && isMultiSession(todaySplit);

          return (
            <View style={[styles.glassCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.cardLabel, { color: colors.secondaryText }]}>TODAY'S WORKOUT</Text>
                  <Text style={[styles.cardTitle, { color: colors.primaryText }]}>{dayLabel}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={[styles.programLabel, { color: colors.secondaryText, textAlign: 'right' }]}>Active Program</Text>
                  <View style={[styles.programBadge, { backgroundColor: `${accentColor}30`, borderColor: accentColor }]}>
                    <Text style={[styles.programBadgeText, { color: colors.primaryText, textAlign: 'left' }]}>{activeProgram?.name || 'None'}</Text>
                  </View>
                </View>
              </View>
              {isRestDay ? (
                <Text style={[styles.cardSubtitle, { color: colors.secondaryText }]}>Recovery is part of the process</Text>
              ) : (
                <View style={styles.workoutMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="barbell-outline" size={16} color={colors.secondaryText} />
                    <Text style={[styles.metaText, { color: colors.secondaryText }]}>{exerciseCount} exercises</Text>
                  </View>
                  {multiSession && (
                    <View style={styles.metaItem}>
                      <Ionicons name="layers-outline" size={16} color={colors.secondaryText} />
                      <Text style={[styles.metaText, { color: colors.secondaryText }]}>{todaySplit.sessions.length} sessions</Text>
                    </View>
                  )}
                </View>
              )}
              <BounceButton
                style={[styles.startButton, { backgroundColor: hasPrograms ? accentColor : '#47DDFF' }, workoutDone && hasPrograms && { backgroundColor: `${accentColor}25`, borderWidth: 2, borderColor: accentColor }]}
                onPress={() => {
                  if (!hasPrograms) { router.navigate('/create-program'); return; }
                  if (workoutDone) {
                    const todayEntry = workoutState.getJournalLog().find(e => new Date(e.date).toDateString() === new Date().toDateString());
                    router.navigate(todayEntry ? `/journal?entryId=${todayEntry.id}` : '/journal');
                    return;
                  }
                  if (!isRestDay) workoutState.startTimer(todayDayIndex);
                  router.navigate('/(tabs)/workout');
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.startButtonText, workoutDone && hasPrograms && { color: isDark ? '#FFFFFF' : '#1C1C1E' }]}>
                    {!hasPrograms ? 'Create a Program' : workoutDone ? "Edit Today's Workout" : isRestDay ? 'View Schedule' : timerActive ? 'Continue Workout' : 'Start Workout'}
                  </Text>
                  {timerActive && !workoutDone && hasPrograms ? (
                    <>
                      <View style={{ width: 1, height: 16, backgroundColor: '#1C1C1E30' }} />
                      <Ionicons name="time-outline" size={16} color="#1C1C1E" />
                      <Text style={[styles.startButtonText, { fontVariant: ['tabular-nums'] as any }]}>
                        {elapsed >= 3600
                          ? `${Math.floor(elapsed / 3600)}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
                          : `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`}
                      </Text>
                    </>
                  ) : (
                    <Ionicons name="arrow-forward" size={20} color={workoutDone && hasPrograms ? (isDark ? '#FFFFFF' : '#1C1C1E') : '#1C1C1E'} />
                  )}
                </View>
              </BounceButton>
            </View>
          );
        })()}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          {[
            { icon: 'add' as const, label: 'Create New\nProgram', route: '/create-program' as const },
            { icon: 'list-outline' as const, label: 'View/Change\nPrograms', route: '/programs' as const },
            { icon: 'book-outline' as const, label: 'View\nJournal', route: '/journal' as const },
          ].map((action, i) => (
            <BounceButton key={i} style={styles.quickActionButton} onPress={() => router.push(action.route)}>
              <View style={[styles.quickActionIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#ffffff80', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#ffffffcc' }]}>
                <Ionicons name={action.icon} size={30} color={colors.primaryText} />
              </View>
              <Text style={[styles.quickActionLabel, { color: colors.secondaryText }]}>{action.label}</Text>
            </BounceButton>
          ))}
        </View>

        {/* Progress Snapshot */}
        <Text style={styles.sectionTitle}>This Week</Text>
        <View style={styles.statsRow}>
          {[
            { value: weeklyPlanCount !== null ? `${weeklyStats.workouts}/${weeklyPlanCount}` : weeklyStats.workouts > 0 ? String(weeklyStats.workouts) : '—', label: 'Workouts', icon: 'barbell-outline' as const },
            { value: fmtVolume(weeklyStats.volume), label: `Volume (${unit})`, icon: 'trending-up-outline' as const },
            { value: fmtAvgDuration(weeklyStats.avgDuration), label: 'Avg Duration', icon: 'timer-outline' as const },
          ].map((stat, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
              <Ionicons name={stat.icon} size={20} color={accentColor} />
              <Text style={[styles.statValue, { color: colors.primaryText }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.secondaryText }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Recent Activity */}
        {(() => {
          const formatDur = (secs: number) => {
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = secs % 60;
            if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          };
          const formatRelDay = (ts: number) => {
            const now = new Date(); const d = new Date(ts);
            const diff = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
            if (diff === 0) return 'Today';
            if (diff === 1) return 'Yesterday';
            return d.toLocaleDateString('en-AU', { weekday: 'long' });
          };
          return (
            <>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              {recentEntries.length === 0 ? (
                <View style={[styles.activityCard, styles.emptyActivity, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
                  <BookOpenIcon size={22} color={colors.tertiaryText} />
                  <Text style={[styles.activityDay, { color: colors.tertiaryText, marginTop: 6 }]}>No workouts logged yet</Text>
                </View>
              ) : (
                recentEntries.map((entry) => {
                  const exCount = entry.sessions.reduce((sum, s) => sum + s.exercises.length, 0);
                  const entryColor = programs.find(p => p.id === entry.programId)?.color ?? programs.find(p => p.name === entry.programName)?.color ?? entry.programColor;
                  return (
                    <BounceButton
                      key={entry.id}
                      style={[styles.activityCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}
                      onPress={() => router.push({ pathname: '/journal', params: { entryId: entry.id } })}
                    >
                      <View style={[styles.activityAccentBar, { backgroundColor: entryColor }]} />
                      <View style={styles.activityLeft}>
                        <Text style={[styles.activityDay, { color: colors.secondaryText }]}>{formatRelDay(entry.date)}</Text>
                        <Text style={[styles.activityName, { color: colors.primaryText }]} numberOfLines={2}>
                          {entry.dayLabel} — {entry.programName}
                        </Text>
                      </View>
                      <View style={styles.activityRight}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="barbell-outline" size={13} color={colors.secondaryText} />
                          <Text style={[styles.activityStat, { color: colors.secondaryText }]}>{exCount} exercises</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="time-outline" size={13} color={colors.secondaryText} />
                          <Text style={[styles.activityStat, { color: colors.secondaryText }]}>{formatDur(entry.durationSecs)}</Text>
                        </View>
                      </View>
                    </BounceButton>
                  );
                })
              )}
            </>
          );
        })()}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fixedProfile: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 38,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  headerLogo: {
    width: 44,
    height: 44,
    marginTop: 4,
    marginBottom: 16,
  },
  greetingContainer: {
    marginBottom: 20,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff80',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
  },
  streakText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#FF9500',
  },
  greeting: {
    fontSize: 28,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
    lineHeight: 36,
    textShadowColor: '#00000080',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  date: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#FFFFFF',
    marginTop: 4,
    lineHeight: 20,
    textShadowColor: '#00000040',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  profileInitials: {
    fontSize: 18,
    fontFamily: 'Arimo_400Regular',
    color: '#1C1C1E',
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: 20,
  },
  glassCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#ffffffcc',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 20,
  },
  programLabel: {
    fontSize: 10,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  programBadge: {
    backgroundColor: 'rgba(0, 235, 172, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 235, 172, 0.5)',
  },
  programBadgeText: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    letterSpacing: 1,
  },
  cardLabel: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 24,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    letterSpacing: 0.3,
  },
  cardSubtitle: {
    fontSize: 16,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 2,
    marginBottom: 12,
  },
  workoutMeta: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  startButton: {
    backgroundColor: '#47DDFF',
    borderRadius: 16,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    color: '#1C1C1E',
    fontSize: 16,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 0.4,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 48,
    marginTop: 8,
    marginBottom: 28,
  },
  quickActionButton: {
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#ffffff80',
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textAlign: 'center',
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
    marginBottom: 12,
    lineHeight: 28,
    textShadowColor: '#00000080',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
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
  activityCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  activityLeft: {
    flex: 1,
  },
  activityDay: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  activityName: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  activityRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  activityStat: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  viewAllText: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
  },
  emptyActivity: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  activityAccentBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 10,
  },
});
