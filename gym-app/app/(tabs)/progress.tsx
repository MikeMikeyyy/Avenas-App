import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, ScrollView, StatusBar, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { useTheme } from '../../themeStore';
import { useUnits } from '../../unitsStore';
import { workoutState } from '../../workoutState';
import type { WorkoutJournalEntry } from '../../workoutState';
import { ProgressView } from '../../components/ProgressView';

export default function ProgressScreen() {
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });
  const { isDark, colors } = useTheme();
  const { unit, toDisplay } = useUnits();
  const scrollRef = useRef<ScrollView>(null);
  const [journal, setJournal] = useState<WorkoutJournalEntry[]>([]);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setJournal(workoutState.getJournalLog());
  }, []));

  useEffect(() => {
    return workoutState.subscribePrev(() => setJournal(workoutState.getJournalLog()));
  }, []);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: isDark ? colors.gradientStart : '#c3ced6' }} />;

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={{ flex: 1 }}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.gradientStart} />
      <ProgressView
        journal={journal}
        unit={unit}
        toDisplay={toDisplay}
        showTitle
        scrollTopPadding={Platform.OS === 'ios' ? 60 : 40}
        scrollRef={scrollRef}
      />
    </LinearGradient>
  );
}
