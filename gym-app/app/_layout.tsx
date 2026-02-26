import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { ProgramProvider } from '../programStore';
import { CommunityProvider } from '../communityStore';
import { ThemeProvider, useTheme } from '../themeStore';
import { UnitsProvider } from '../unitsStore';
import { workoutState } from '../workoutState';

export const unstable_settings = {
  anchor: '(tabs)',
};

function InnerLayout() {
  const { isDark } = useTheme();

  useEffect(() => {
    workoutState.initStorage();
  }, []);

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="programs" options={{ headerShown: false }} />
        <Stack.Screen name="create-program" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="journal" options={{ headerShown: false }} />
        <Stack.Screen name="help-support" options={{ headerShown: false }} />
        <Stack.Screen name="terms" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <UnitsProvider>
        <CommunityProvider>
          <ProgramProvider>
            <InnerLayout />
          </ProgramProvider>
        </CommunityProvider>
      </UnitsProvider>
    </ThemeProvider>
  );
}