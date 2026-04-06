import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync, setPendingChatNav } from '../notificationService';

import { ProgramProvider } from '../programStore';
import { CommunityProvider } from '../communityStore';
import { ThemeProvider, useTheme } from '../themeStore';
import { UnitsProvider, useUnits } from '../unitsStore';
import { AuthProvider, useAuth } from '../authStore';
import { workoutState } from '../workoutState';
import { db } from '../firebase';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Image } from 'react-native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';

function ForceUpdateGate({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');

  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'app'));
        if (!snap.exists()) return;
        const data = snap.data();
        const minBuild: number = data.minBuildNumber ?? 0;
        const currentBuild = Number(Constants.expoConfig?.ios?.buildNumber ?? '0');
        if (minBuild > 0 && currentBuild < minBuild) {
          setStoreUrl(data.iosStoreUrl ?? '');
          setBlocked(true);
        }
      } catch {}
    })();
  }, []);

  if (!blocked) return <>{children}</>;

  return (
    <LinearGradient colors={['#abbac4', '#FFFFFF']} style={forceUpdateStyles.container}>
      <Image
        source={require('../assets/images/icon.png')}
        style={forceUpdateStyles.icon}
      />
      <Text style={forceUpdateStyles.title}>Update Available</Text>
      <Text style={forceUpdateStyles.subtitle}>
        A new version of Avenas is available.{'\n'}Please update to continue.
      </Text>
      <TouchableOpacity
        style={forceUpdateStyles.button}
        onPress={() => storeUrl && Linking.openURL(storeUrl)}
        activeOpacity={0.85}
      >
        <Text style={forceUpdateStyles.buttonText}>Update Now</Text>
      </TouchableOpacity>
      <Text style={forceUpdateStyles.versionText}>
        Current version: {Constants.expoConfig?.version}
      </Text>
    </LinearGradient>
  );
}

export const unstable_settings = {
  anchor: '(tabs)',
};

function InnerLayout() {
  const { isDark, setDark } = useTheme();
  const { unit, setUnit } = useUnits();
  const { user } = useAuth();
  const router = useRouter();
  const handledNotifIds = useRef<Set<string>>(new Set());

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

  // Handle notification taps → navigate to the relevant chat
  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handledNotifIds.current.has(id)) return;
      handledNotifIds.current.add(id);
      const data = response.notification.request.content.data as Record<string, any> | null;
      if (data?.communityId && data?.chatType) {
        const nav = { communityId: data.communityId, chatType: data.chatType, memberId: data.memberId ?? null };
        // In-memory signal — fires even if community tab is already focused
        setPendingChatNav(nav);
        // AsyncStorage fallback for cold start (in-memory is cleared on app kill)
        AsyncStorage.setItem('@pendingChatNav', JSON.stringify(nav)).catch(() => {});
        router.push('/(tabs)/community');
      }
    };

    // Foreground / background tap
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);

    // Cold start: app was killed when notification was tapped
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) handleResponse(response);
    }).catch(() => {});

    return () => sub.remove();
  }, []);

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
              <ForceUpdateGate>
                <InnerLayout />
              </ForceUpdateGate>
            </ProgramProvider>
          </CommunityProvider>
        </AuthProvider>
      </UnitsProvider>
    </ThemeProvider>
  );
}

const forceUpdateStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  icon: {
    width: 100,
    height: 100,
    borderRadius: 22,
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#5a6c7d',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#47DDFF',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 100,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
  },
  versionText: {
    marginTop: 24,
    fontSize: 12,
    color: '#8e8e93',
  },
});
