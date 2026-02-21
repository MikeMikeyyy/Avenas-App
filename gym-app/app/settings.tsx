import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  Animated,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
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

type SettingsItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  type: 'navigate' | 'toggle' | 'action';
  color?: string;
};

const ACCOUNT_ITEMS: SettingsItem[] = [
  { icon: 'person-outline', label: 'Edit Profile', subtitle: 'Name, photo, bio', type: 'navigate' },
  { icon: 'lock-closed-outline', label: 'Change Password', type: 'navigate' },
  { icon: 'mail-outline', label: 'Email', subtitle: 'michael@example.com', type: 'navigate' },
];

const PREFERENCES_ITEMS: SettingsItem[] = [
  { icon: 'notifications-outline', label: 'Notifications', subtitle: 'Push, reminders', type: 'navigate' },
  { icon: 'barbell-outline', label: 'Units', subtitle: 'kg / lbs', type: 'navigate' },
  { icon: 'moon-outline', label: 'Dark Mode', type: 'toggle' },
];

const SUPPORT_ITEMS: SettingsItem[] = [
  { icon: 'help-circle-outline', label: 'Help & Support', type: 'navigate' },
  { icon: 'document-text-outline', label: 'Terms of Service', type: 'navigate' },
  { icon: 'shield-checkmark-outline', label: 'Privacy Policy', type: 'navigate' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { isDark, colors, toggleTheme } = useTheme();
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });

  if (!fontsLoaded) return null;

  const renderSettingsItem = (item: SettingsItem, index: number, isLast: boolean) => (
    <TouchableOpacity
      key={index}
      style={[styles.settingsItem, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
      activeOpacity={0.6}
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
    >
      <View style={[styles.settingsItemIcon, { backgroundColor: item.color || (isDark ? 'rgba(71, 221, 255, 0.15)' : 'rgba(71, 221, 255, 0.12)') }]}>
        <Ionicons name={item.icon} size={20} color={item.color ? '#fff' : '#47DDFF'} />
      </View>
      <View style={styles.settingsItemContent}>
        <Text style={[styles.settingsItemLabel, { color: colors.primaryText }]}>{item.label}</Text>
        {item.subtitle && <Text style={[styles.settingsItemSubtitle, { color: colors.tertiaryText }]}>{item.subtitle}</Text>}
      </View>
      {item.type === 'navigate' && (
        <Ionicons name="chevron-forward" size={18} color={colors.tertiaryText} />
      )}
      {item.type === 'toggle' && (
        <Switch
          value={isDark}
          onValueChange={toggleTheme}
          trackColor={{ false: '#8e8e93', true: '#47DDFF' }}
          thumbColor="#fff"
          ios_backgroundColor="#8e8e93"
        />
      )}
    </TouchableOpacity>
  );

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 0.35 }}
      style={styles.container}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.gradientStart} />

      <View style={styles.header}>
        <BounceButton onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.backButtonBg }]}>
          <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
        </BounceButton>
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.cardSolid }]}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>MB</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.primaryText }]}>Michael B.</Text>
            <Text style={[styles.profileEmail, { color: colors.secondaryText }]}>michael@example.com</Text>
          </View>
        </View>

        {/* Account Section */}
        <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>ACCOUNT</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.cardSolid }]}>
          {ACCOUNT_ITEMS.map((item, i) => renderSettingsItem(item, i, i === ACCOUNT_ITEMS.length - 1))}
        </View>

        {/* Preferences Section */}
        <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>PREFERENCES</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.cardSolid }]}>
          {PREFERENCES_ITEMS.map((item, i) => renderSettingsItem(item, i, i === PREFERENCES_ITEMS.length - 1))}
        </View>

        {/* Support Section */}
        <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>SUPPORT</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.cardSolid }]}>
          {SUPPORT_ITEMS.map((item, i) => renderSettingsItem(item, i, i === SUPPORT_ITEMS.length - 1))}
        </View>

        {/* Log Out */}
        <BounceButton style={[styles.logoutButton, { backgroundColor: colors.cardSolid }]} onPress={() => {}}>
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutText}>Log Out</Text>
        </BounceButton>

        <Text style={[styles.versionText, { color: colors.tertiaryText }]}>Version 1.0.0</Text>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 58 : 38,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Arimo_700Bold',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#47DDFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 24,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontFamily: 'Arimo_700Bold',
  },
  profileEmail: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  sectionCard: {
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingsItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  settingsItemLabel: {
    fontSize: 16,
    fontFamily: 'Arimo_400Regular',
  },
  settingsItemSubtitle: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    marginTop: 1,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#FF3B30',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    marginBottom: 20,
  },
});
