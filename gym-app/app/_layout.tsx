import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { registerForPushNotificationsAsync } from '../notificationService';

import { ProgramProvider } from '../programStore';
import { CommunityProvider } from '../communityStore';
import { ThemeProvider, useTheme } from '../themeStore';
import { UnitsProvider, useUnits } from '../unitsStore';
import { AuthProvider, useAuth } from '../authStore';
import { workoutState } from '../workoutState';
import { db } from '../firebase';

export const unstable_settings = {
  anchor: '(tabs)',
};

function InnerLayout() {
  const { isDark, setDark } = useTheme();
  const { unit, setUnit } = useUnits();
  const { user } = useAuth();

  // Track whether we've finished loading this user's prefs from Firestore.
  // Prevents saving stale values back to Firestore during the initial load.
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    workoutState.initStorage();
  }, []);

  useEffect(() => {
    if (user) {
      workoutState.loadForUser(user.uid);
      registerForPushNotificationsAsync(user.uid).catch(() => {});
    } else {
      workoutState.setUser(null);
    }
  }, [user?.uid]);

  // Load this user's saved preferences from Firestore when they sign in
  useEffect(() => {
    if (!user) {
      setPrefsLoaded(false);
      return;
    }
    setPrefsLoaded(false);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'data', 'preferences'));
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.isDark === 'boolean') setDark(data.isDark);
          if (data.unit === 'kg' || data.unit === 'lbs') setUnit(data.unit);
        }
      } catch {}
      setPrefsLoaded(true);
    })();
  }, [user?.uid]);

  // Save preferences back to Firestore whenever they change.
  // Only runs after prefs have been loaded (avoids overwriting on initial login).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user || !prefsLoaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setDoc(
        doc(db, 'users', user.uid, 'data', 'preferences'),
        { isDark, unit },
        { merge: true }
      ).catch(() => {});
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [isDark, unit, prefsLoaded, user?.uid]);

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false, gestureEnabled: false }} />
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
        <AuthProvider>
          <CommunityProvider>
            <ProgramProvider>
              <InnerLayout />
            </ProgramProvider>
          </CommunityProvider>
        </AuthProvider>
      </UnitsProvider>
    </ThemeProvider>
  );
}
