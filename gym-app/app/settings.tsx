import React, { useEffect, useRef, useState } from 'react';
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
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { doc, updateDoc, deleteField, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { useTheme } from '../themeStore';
import { useUnits } from '../unitsStore';
import { useAuth } from '../authStore';
import { useCommunityStore } from '../communityStore';
import { registerForPushNotificationsAsync } from '../notificationService';
import { BottomSheetModal } from '../components/BottomSheetModal';
import { GlassBackButton } from '../components/GlassBackButton';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  route?: string;
  onPress?: () => void;
};

const PREFERENCES_ITEMS: SettingsItem[] = [
  { icon: 'moon-outline', label: 'Dark Mode', type: 'toggle' },
];

const SUPPORT_ITEMS: SettingsItem[] = [
  { icon: 'help-circle-outline', label: 'Help & Support', type: 'navigate', route: 'help-support' },
  { icon: 'document-text-outline', label: 'Terms of Service', type: 'navigate', route: 'terms' },
  { icon: 'shield-checkmark-outline', label: 'Privacy Policy', type: 'navigate', route: 'privacy' },
];

function getAuthErrorMessage(code: string): string {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect current password.';
    case 'auth/email-already-in-use': return 'That email is already in use.';
    case 'auth/invalid-email': return 'Invalid email address.';
    case 'auth/weak-password': return 'Password must be at least 6 characters.';
    case 'auth/requires-recent-login': return 'Please log out and sign in again.';
    case 'auth/network-request-failed': return 'Network error. Check your connection.';
    default: return 'Something went wrong. Please try again.';
  }
}

export default function SettingsScreen() {
  const router = useRouter();
  const { isDark, colors, toggleTheme } = useTheme();
  const { unit, setUnit } = useUnits();
  const { user, isGuest, signOut, updateDisplayName, updateUserPassword, updateUserEmail, sendPasswordReset, deleteAccount } = useAuth();
  const { syncUserName, blockedUsersMap, unblockUser } = useCommunityStore();
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });

  const displayName = user?.displayName || (isGuest ? 'Guest' : '');
  const displayEmail = user?.email || '';
  const initials = displayName ? getInitials(displayName) : '?';

  // Notifications toggle
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('@notifications_enabled');
      if (stored === 'false') {
        setNotificationsEnabled(false);
      } else {
        const { status } = await Notifications.getPermissionsAsync();
        setNotificationsEnabled(status === 'granted');
      }
    })();
  }, []);

  const handleNotificationsToggle = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setNotificationsEnabled(true);
        await AsyncStorage.setItem('@notifications_enabled', 'true');
        if (user) registerForPushNotificationsAsync(user.uid).catch(() => {});
      } else {
        Alert.alert(
          'Notifications Disabled',
          'Please enable notifications in your device Settings to receive alerts.',
          [{ text: 'OK' }]
        );
      }
    } else {
      setNotificationsEnabled(false);
      await AsyncStorage.setItem('@notifications_enabled', 'false');
      if (user) {
        updateDoc(doc(db, 'users', user.uid), { expoPushToken: deleteField() }).catch(() => {});
      }
    }
  };

  // Edit Profile modal
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [newName, setNewName] = useState('');

  // Change Password modal
  const [changePwVisible, setChangePwVisible] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [showPw, setShowPw] = useState(false);

  // Change Email modal
  const [changeEmailVisible, setChangeEmailVisible] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailCurrentPw, setEmailCurrentPw] = useState('');

  // Clear data modal
  const [clearDataVisible, setClearDataVisible] = useState(false);
  const [keepCommunities, setKeepCommunities] = useState(true);

  // Delete account modal
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
  const [deleteAccountPw, setDeleteAccountPw] = useState('');
  const isEmailProvider = user?.providerData[0]?.providerId === 'password';

  // Blocked users sheet
  const [blockedUsersVisible, setBlockedUsersVisible] = useState(false);
  const blockedEntries = Object.entries(blockedUsersMap); // [[uid, name], ...]

  // Shared modal state
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  const closeModals = () => {
    setEditProfileVisible(false);
    setChangePwVisible(false);
    setChangeEmailVisible(false);
    setModalError('');
    setModalLoading(false);
    setCurrentPw('');
    setNewPw('');
    setConfirmNewPw('');
    setEmailCurrentPw('');
    setShowPw(false);
  };

  const handleSaveName = async () => {
    if (!newName.trim()) { setModalError('Please enter a name.'); return; }
    setModalLoading(true);
    setModalError('');
    try {
      await updateDisplayName(newName.trim());
      syncUserName(newName.trim()).catch(() => {});
      closeModals();
    } catch (e: any) {
      setModalError(getAuthErrorMessage(e.code ?? ''));
    } finally {
      setModalLoading(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPw || !newPw) { setModalError('Please fill in all fields.'); return; }
    if (newPw !== confirmNewPw) { setModalError('New passwords do not match.'); return; }
    if (newPw.length < 6) { setModalError('Password must be at least 6 characters.'); return; }
    setModalLoading(true);
    setModalError('');
    try {
      await updateUserPassword(currentPw, newPw);
      closeModals();
      Alert.alert('Success', 'Your password has been updated.');
    } catch (e: any) {
      setModalError(getAuthErrorMessage(e.code ?? ''));
    } finally {
      setModalLoading(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !emailCurrentPw) { setModalError('Please fill in all fields.'); return; }
    setModalLoading(true);
    setModalError('');
    try {
      await updateUserEmail(emailCurrentPw, newEmail.trim());
      closeModals();
      Alert.alert('Success', 'Your email has been updated.');
    } catch (e: any) {
      setModalError(getAuthErrorMessage(e.code ?? ''));
    } finally {
      setModalLoading(false);
    }
  };

  if (!fontsLoaded) return null;

  const ACCOUNT_ITEMS: SettingsItem[] = [
    {
      icon: 'person-outline', label: 'Edit Username',
      type: 'action',
      onPress: () => { setNewName(displayName); setModalError(''); setEditProfileVisible(true); },
    },
    {
      icon: 'lock-closed-outline', label: 'Change Password',
      type: 'action',
      onPress: () => { setModalError(''); setChangePwVisible(true); },
    },
    {
      icon: 'mail-outline', label: 'Email',
      subtitle: displayEmail || undefined,
      type: 'action',
      onPress: () => { setNewEmail(''); setModalError(''); setChangeEmailVisible(true); },
    },
    {
      icon: 'trash-outline', label: 'Delete Account',
      type: 'action',
      color: '#FF3B30',
      onPress: () => { setDeleteAccountPw(''); setModalError(''); setDeleteAccountVisible(true); },
    },
  ];

  const renderSettingsItem = (item: SettingsItem, index: number, isLast: boolean) => (
    <TouchableOpacity
      key={index}
      style={[styles.settingsItem, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
      activeOpacity={0.6}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (item.onPress) item.onPress();
        else if (item.route) router.push(item.route as any);
      }}
    >
      <View style={[styles.settingsItemIcon, { backgroundColor: item.color || (isDark ? 'rgba(71, 221, 255, 0.15)' : 'rgba(71, 221, 255, 0.12)') }]}>
        <Ionicons name={item.icon} size={20} color={item.color ? '#fff' : '#47DDFF'} />
      </View>
      <View style={styles.settingsItemContent}>
        <Text style={[styles.settingsItemLabel, { color: colors.primaryText }]}>{item.label}</Text>
        {item.subtitle && <Text style={[styles.settingsItemSubtitle, { color: colors.tertiaryText }]} numberOfLines={1}>{item.subtitle}</Text>}
      </View>
      {(item.type === 'navigate' || item.type === 'action') && (
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
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.container}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.gradientStart} />

      <View style={styles.header}>
        <GlassBackButton onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.cardSolid }]}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.primaryText }]}>{displayName || 'Account'}</Text>
            {!!displayEmail && (
              <Text style={[styles.profileEmail, { color: colors.secondaryText }]}>{displayEmail}</Text>
            )}
          </View>
        </View>

        {/* Account Section — hidden for guests */}
        {!isGuest && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>ACCOUNT</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.cardSolid }]}>
              {ACCOUNT_ITEMS.map((item, i) => renderSettingsItem(item, i, i === ACCOUNT_ITEMS.length - 1))}
            </View>
          </>
        )}

        {/* Preferences Section */}
        <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>PREFERENCES</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.cardSolid }]}>
          {/* Notifications toggle */}
          <View style={[styles.settingsItem, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={[styles.settingsItemIcon, { backgroundColor: isDark ? 'rgba(71, 221, 255, 0.15)' : 'rgba(71, 221, 255, 0.12)' }]}>
              <Ionicons name="notifications-outline" size={20} color="#47DDFF" />
            </View>
            <View style={styles.settingsItemContent}>
              <Text style={[styles.settingsItemLabel, { color: colors.primaryText }]}>Notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: '#8e8e93', true: '#47DDFF' }}
              thumbColor="#fff"
              ios_backgroundColor="#8e8e93"
            />
          </View>
          {/* Units picker */}
          <View style={[styles.settingsItem, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={[styles.settingsItemIcon, { backgroundColor: isDark ? 'rgba(71, 221, 255, 0.15)' : 'rgba(71, 221, 255, 0.12)' }]}>
              <Ionicons name="barbell-outline" size={20} color="#47DDFF" />
            </View>
            <View style={styles.settingsItemContent}>
              <Text style={[styles.settingsItemLabel, { color: colors.primaryText }]}>Units</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['kg', 'lbs'] as const).map(u => (
                <TouchableOpacity
                  key={u}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setUnit(u); }}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                    borderColor: unit === u ? '#47DDFF' : colors.border,
                    backgroundColor: unit === u ? 'rgba(71,221,255,0.12)' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: 'Arimo_700Bold', color: unit === u ? '#47DDFF' : colors.secondaryText }}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {PREFERENCES_ITEMS.map((item, i) => renderSettingsItem(item, i, i === PREFERENCES_ITEMS.length - 1))}
        </View>

        {/* Community Section */}
        {!isGuest && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>COMMUNITY</Text>
            <View style={[styles.sectionCard, { backgroundColor: colors.cardSolid }]}>
              <TouchableOpacity
                style={styles.settingsItem}
                activeOpacity={0.6}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setBlockedUsersVisible(true); }}
              >
                <View style={[styles.settingsItemIcon, { backgroundColor: isDark ? 'rgba(255,59,48,0.15)' : 'rgba(255,59,48,0.1)' }]}>
                  <Ionicons name="ban-outline" size={20} color="#FF3B30" />
                </View>
                <View style={styles.settingsItemContent}>
                  <Text style={[styles.settingsItemLabel, { color: colors.primaryText }]}>Blocked Users</Text>
                  {blockedEntries.length > 0 && (
                    <Text style={[styles.settingsItemSubtitle, { color: colors.tertiaryText }]}>
                      {blockedEntries.length} {blockedEntries.length === 1 ? 'user' : 'users'} blocked
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.tertiaryText} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Support Section */}
        <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>SUPPORT</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.cardSolid }]}>
          {SUPPORT_ITEMS.map((item, i) => renderSettingsItem(item, i, i === SUPPORT_ITEMS.length - 1))}
        </View>

        {/* Clear All Data */}
        <BounceButton
          style={[styles.logoutButton, { backgroundColor: colors.cardSolid }]}
          onPress={() => { setKeepCommunities(true); setClearDataVisible(true); }}
        >
          <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutText}>Clear All Data</Text>
        </BounceButton>

        {/* Log Out */}
        <BounceButton
          style={[styles.logoutButton, { backgroundColor: colors.cardSolid }]}
          onPress={() => {
            Alert.alert('Log Out', 'Are you sure you want to log out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log Out', style: 'destructive', onPress: async () => {
                await signOut();
                router.replace('/');
              }},
            ]);
          }}
        >
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutText}>Log Out</Text>
        </BounceButton>

        <Text style={[styles.versionText, { color: colors.tertiaryText }]}>Version 1.0.5</Text>
      </ScrollView>

      {/* ── Blocked Users Sheet ── */}
      <BottomSheetModal visible={blockedUsersVisible} onDismiss={() => setBlockedUsersVisible(false)} sheetBackground={colors.modalBg}>
        <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
          <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Blocked Users</Text>
          {blockedEntries.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="checkmark-circle-outline" size={40} color={colors.tertiaryText} />
              <Text style={[styles.modalSubtitle, { color: colors.secondaryText, marginTop: 8 }]}>No blocked users</Text>
            </View>
          ) : (
            blockedEntries.map(([uid, name]) => (
              <View key={uid} style={[styles.blockedUserRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.blockedUserAvatar, { backgroundColor: '#8e8e93' }]}>
                  <Text style={styles.blockedUserAvatarText}>{getInitials(name)}</Text>
                </View>
                <Text style={[styles.blockedUserName, { color: colors.primaryText }]}>{name}</Text>
                <TouchableOpacity
                  style={[styles.unblockBtn, { borderColor: colors.accent ?? '#47DDFF' }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); unblockUser(uid); }}
                >
                  <Text style={[styles.unblockBtnText, { color: colors.accent ?? '#47DDFF' }]}>Unblock</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </BottomSheetModal>

      {/* ── Edit Profile Modal ── */}
      <BottomSheetModal visible={editProfileVisible} onDismiss={closeModals} sheetBackground={colors.modalBg}>
        <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
          <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Edit Username</Text>
          <View style={[styles.modalInputWrap, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="person-outline" size={18} color={colors.tertiaryText} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.modalInput, { color: colors.primaryText }]}
              value={newName}
              onChangeText={t => { setNewName(t); setModalError(''); }}
              placeholder="Your name"
              placeholderTextColor={colors.tertiaryText}
              autoCapitalize="words"
              autoFocus
            />
          </View>
          {!!modalError && <Text style={styles.modalError}>{modalError}</Text>}
          <TouchableOpacity
            style={[styles.modalBtn, { backgroundColor: '#47DDFF' }, modalLoading && { opacity: 0.6 }]}
            onPress={handleSaveName}
            disabled={modalLoading}
          >
            {modalLoading ? <ActivityIndicator color="#000" /> : <Text style={[styles.modalBtnText, { color: '#000' }]}>Save</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheetModal>

      {/* ── Change Password Modal ── */}
      <BottomSheetModal visible={changePwVisible} onDismiss={closeModals} sheetBackground={colors.modalBg}>
        <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
          <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Change Password</Text>

          <View style={[styles.modalInputWrap, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.tertiaryText} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.modalInput, { flex: 1, color: colors.primaryText }]}
              value={currentPw}
              onChangeText={t => { setCurrentPw(t); setModalError(''); }}
              placeholder="Current password"
              placeholderTextColor={colors.tertiaryText}
              secureTextEntry={!showPw}
              autoFocus
            />
            <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.tertiaryText} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={async () => {
              try {
                await sendPasswordReset();
                closeModals();
                Alert.alert('Email sent', `A password reset link has been sent to ${displayEmail}.`);
              } catch {
                setModalError('Could not send reset email. Try again.');
              }
            }}
            style={{ alignSelf: 'flex-end', marginTop: -4 }}
          >
            <Text style={{ fontSize: 13, fontFamily: 'Arimo_400Regular', color: '#47DDFF' }}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={[styles.modalInputWrap, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.tertiaryText} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.modalInput, { flex: 1, color: colors.primaryText }]}
              value={newPw}
              onChangeText={t => { setNewPw(t); setModalError(''); }}
              placeholder="New password"
              placeholderTextColor={colors.tertiaryText}
              secureTextEntry={!showPw}
            />
          </View>

          <View style={[styles.modalInputWrap, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.tertiaryText} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.modalInput, { flex: 1, color: colors.primaryText }]}
              value={confirmNewPw}
              onChangeText={t => { setConfirmNewPw(t); setModalError(''); }}
              placeholder="Confirm new password"
              placeholderTextColor={colors.tertiaryText}
              secureTextEntry={!showPw}
            />
          </View>

          {!!modalError && <Text style={styles.modalError}>{modalError}</Text>}
          <TouchableOpacity
            style={[styles.modalBtn, { backgroundColor: '#47DDFF' }, modalLoading && { opacity: 0.6 }]}
            onPress={handleSavePassword}
            disabled={modalLoading}
          >
            {modalLoading ? <ActivityIndicator color="#000" /> : <Text style={[styles.modalBtnText, { color: '#000' }]}>Update Password</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheetModal>

      {/* ── Change Email Modal ── */}
      <BottomSheetModal visible={changeEmailVisible} onDismiss={closeModals} sheetBackground={colors.modalBg}>
        <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
          <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Change Email</Text>
          <Text style={[styles.modalSubtitle, { color: colors.tertiaryText }]}>Current: {displayEmail}</Text>

          <View style={[styles.modalInputWrap, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="mail-outline" size={18} color={colors.tertiaryText} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.modalInput, { color: colors.primaryText }]}
              value={newEmail}
              onChangeText={t => { setNewEmail(t); setModalError(''); }}
              placeholder="New email address"
              placeholderTextColor={colors.tertiaryText}
              keyboardType="email-address"
              autoCapitalize="none"
              autoFocus
            />
          </View>

          <View style={[styles.modalInputWrap, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.tertiaryText} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.modalInput, { flex: 1, color: colors.primaryText }]}
              value={emailCurrentPw}
              onChangeText={t => { setEmailCurrentPw(t); setModalError(''); }}
              placeholder="Current password"
              placeholderTextColor={colors.tertiaryText}
              secureTextEntry={!showPw}
            />
            <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.tertiaryText} />
            </TouchableOpacity>
          </View>

          {!!modalError && <Text style={styles.modalError}>{modalError}</Text>}
          <TouchableOpacity
            style={[styles.modalBtn, { backgroundColor: '#47DDFF' }, modalLoading && { opacity: 0.6 }]}
            onPress={handleSaveEmail}
            disabled={modalLoading}
          >
            {modalLoading ? <ActivityIndicator color="#000" /> : <Text style={[styles.modalBtnText, { color: '#000' }]}>Update Email</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheetModal>

      {/* ── Delete Account Modal ── */}
      <BottomSheetModal visible={deleteAccountVisible} onDismiss={() => { setDeleteAccountVisible(false); setDeleteAccountPw(''); setModalError(''); setModalLoading(false); }} sheetBackground={colors.modalBg}>
        <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
          <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Delete Account</Text>
          <Text style={[styles.modalSubtitle, { color: colors.tertiaryText }]}>
            This will permanently delete your account and all associated data. This cannot be undone.
          </Text>
          {isEmailProvider && (
            <View style={[styles.modalInputWrap, { backgroundColor: colors.inputBg, marginTop: 12 }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.tertiaryText} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.modalInput, { flex: 1, color: colors.primaryText }]}
                value={deleteAccountPw}
                onChangeText={t => { setDeleteAccountPw(t); setModalError(''); }}
                placeholder="Enter your password to confirm"
                placeholderTextColor={colors.tertiaryText}
                secureTextEntry
                autoFocus
              />
            </View>
          )}
          {!!modalError && <Text style={styles.modalError}>{modalError}</Text>}
          <TouchableOpacity
            style={[styles.modalBtn, { backgroundColor: '#FF3B30' }, modalLoading && { opacity: 0.6 }]}
            activeOpacity={0.8}
            disabled={modalLoading}
            onPress={async () => {
              if (isEmailProvider && !deleteAccountPw) { setModalError('Please enter your password.'); return; }
              Alert.alert(
                'Delete Account?',
                'This will permanently delete your account and all data. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      setModalLoading(true);
                      setModalError('');
                      try {
                        if (user) {
                          await deleteDoc(doc(db, 'users', user.uid, 'data', 'workout')).catch(() => {});
                          await deleteDoc(doc(db, 'users', user.uid, 'data', 'programs')).catch(() => {});
                          await deleteDoc(doc(db, 'users', user.uid, 'data', 'communityMemberships')).catch(() => {});
                          await deleteDoc(doc(db, 'users', user.uid, 'data', 'preferences')).catch(() => {});
                          await deleteDoc(doc(db, 'users', user.uid, 'data', 'blockedUsers')).catch(() => {});
                          await deleteDoc(doc(db, 'users', user.uid)).catch(() => {});
                        }
                        await deleteAccount(isEmailProvider ? deleteAccountPw : undefined);
                        setDeleteAccountVisible(false);
                        router.replace('/');
                      } catch (e: any) {
                        setModalLoading(false);
                        if (e.code === 'auth/requires-recent-login') {
                          setModalError('Please sign out and sign back in before deleting your account.');
                        } else {
                          setModalError(getAuthErrorMessage(e.code ?? ''));
                        }
                      }
                    },
                  },
                ]
              );
            }}
          >
            {modalLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Delete My Account</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalBtn, { backgroundColor: colors.cardTranslucent, borderWidth: 1, borderColor: colors.cardBorder }]}
            activeOpacity={0.8}
            onPress={() => { setDeleteAccountVisible(false); setDeleteAccountPw(''); setModalError(''); }}
          >
            <Text style={[styles.modalBtnText, { color: colors.primaryText }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal>

      {/* ── Clear Data Modal ── */}
      <BottomSheetModal visible={clearDataVisible} onDismiss={() => setClearDataVisible(false)} sheetBackground={colors.modalBg}>
        <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
          <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Clear All Data</Text>
          <Text style={[styles.modalSubtitle, { color: colors.tertiaryText }]}>
            This will permanently delete your workouts, journal, programs and exercise history. This cannot be undone.
          </Text>

          {/* Keep communities toggle */}
          <TouchableOpacity
            style={styles.clearDataToggleRow}
            onPress={() => setKeepCommunities(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[styles.clearDataCheckbox, { borderColor: colors.border, backgroundColor: keepCommunities ? '#47DDFF' : 'transparent' }]}>
              {keepCommunities && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.clearDataToggleLabel, { color: colors.primaryText }]}>Keep my communities</Text>
              <Text style={[styles.clearDataToggleSub, { color: colors.tertiaryText }]}>Stay in all communities you own or are a member of</Text>
            </View>
          </TouchableOpacity>

          {/* Buttons */}
          <TouchableOpacity
            style={[styles.modalBtn, { backgroundColor: '#FF3B30' }]}
            activeOpacity={0.8}
            onPress={() => {
              Alert.alert(
                'Erase Your Data?',
                'This will permanently delete your workout history, programs, journal, and progress data. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Erase',
                    style: 'destructive',
                    onPress: async () => {
                      setClearDataVisible(false);
                      if (user) {
                        // Delete Firestore workout & program data
                        await deleteDoc(doc(db, 'users', user.uid, 'data', 'workout')).catch(() => {});
                        await deleteDoc(doc(db, 'users', user.uid, 'data', 'programs')).catch(() => {});
                        if (!keepCommunities) {
                          await deleteDoc(doc(db, 'users', user.uid, 'data', 'communityMemberships')).catch(() => {});
                        }
                        // Preserve community read-count keys if keeping communities
                        if (keepCommunities) {
                          const allKeys = await AsyncStorage.getAllKeys().catch(() => [] as string[]);
                          const keep = allKeys.filter(k =>
                            k.startsWith(`@readGroupCounts_${user.uid}`) ||
                            k.startsWith(`@readPrivateCounts_${user.uid}`)
                          );
                          const remove = allKeys.filter(k => !keep.includes(k));
                          if (remove.length > 0) await AsyncStorage.multiRemove(remove).catch(() => {});
                        } else {
                          await AsyncStorage.clear().catch(() => {});
                        }
                      } else {
                        await AsyncStorage.clear().catch(() => {});
                      }
                      await signOut();
                      router.replace('/');
                    },
                  },
                ]
              );
            }}
          >
            <Text style={styles.modalBtnText}>Clear Everything</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modalBtn, { backgroundColor: colors.cardTranslucent, borderWidth: 1, borderColor: colors.cardBorder }]}
            activeOpacity={0.8}
            onPress={() => setClearDataVisible(false)}
          >
            <Text style={[styles.modalBtnText, { color: colors.primaryText }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetModal>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 58 : 38,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  headerTitle: { fontSize: 20, fontFamily: 'Arimo_700Bold' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 20, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  profileAvatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#47DDFF', alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { fontSize: 24, fontFamily: 'Arimo_700Bold', color: '#fff' },
  profileInfo: { marginLeft: 16, flex: 1 },
  profileName: { fontSize: 20, fontFamily: 'Arimo_700Bold' },
  profileEmail: { fontSize: 14, fontFamily: 'Arimo_400Regular', marginTop: 2 },
  sectionLabel: {
    fontSize: 13, fontFamily: 'Arimo_700Bold',
    marginBottom: 8, marginLeft: 4, letterSpacing: 0.5,
  },
  sectionCard: {
    borderRadius: 16, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, overflow: 'hidden',
  },
  settingsItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16,
  },
  settingsItemIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  settingsItemContent: { flex: 1, marginLeft: 12 },
  settingsItemLabel: { fontSize: 16, fontFamily: 'Arimo_400Regular' },
  settingsItemSubtitle: { fontSize: 13, fontFamily: 'Arimo_400Regular', marginTop: 1 },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, paddingVertical: 16, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, marginBottom: 16,
  },
  logoutText: { fontSize: 16, fontFamily: 'Arimo_700Bold', color: '#FF3B30' },
  versionText: {
    textAlign: 'center', fontSize: 13,
    fontFamily: 'Arimo_400Regular', marginBottom: 20,
  },
  // Modal styles
  modalContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, gap: 12 },
  modalTitle: { fontSize: 20, fontFamily: 'Arimo_700Bold', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, fontFamily: 'Arimo_400Regular', marginTop: -8, marginBottom: 4 },
  modalInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: 12, height: 50,
  },
  modalInput: { flex: 1, fontSize: 15, fontFamily: 'Arimo_400Regular' },
  modalError: { fontSize: 13, fontFamily: 'Arimo_400Regular', color: '#FF3B30', marginLeft: 2 },
  modalBtn: {
    backgroundColor: '#1C1C1E', borderRadius: 14,
    height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  modalBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Arimo_700Bold', textAlign: 'center' },
  clearDataToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
  },
  clearDataCheckbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  clearDataToggleLabel: { fontSize: 15, fontFamily: 'Arimo_700Bold' },
  clearDataToggleSub: { fontSize: 12, fontFamily: 'Arimo_400Regular', marginTop: 2 },
  blockedUserRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, gap: 12,
  },
  blockedUserAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  blockedUserAvatarText: { fontSize: 14, fontFamily: 'Arimo_700Bold', color: '#fff' },
  blockedUserName: { flex: 1, fontSize: 15, fontFamily: 'Arimo_400Regular' },
  unblockBtn: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5,
  },
  unblockBtnText: { fontSize: 13, fontFamily: 'Arimo_700Bold' },
});
