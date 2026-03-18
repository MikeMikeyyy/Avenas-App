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

const SECTIONS = [
  {
    title: '1. Information We Collect',
    body: 'We collect information you enter when using the app, including workout data, exercise logs, personal records, and journal entries. We also store your account details such as your name and email address when you register.',
  },
  {
    title: '2. How We Use Your Information',
    body: 'We use your information to run the app, personalise your experience, and track your fitness progress. We do not use your data for advertising and we do not sell it to third parties.',
  },
  {
    title: '3. Data Storage',
    body: 'Your workout data is securely stored in the cloud and linked to your account. This means your data is available across devices when you log in and is not lost if you delete or reinstall the app. We use Firebase, a Google service, to store and sync your data.',
  },
  {
    title: '4. Data Sharing',
    body: 'We do not sell or trade your personal information. If you are part of a community in the app, your name and workout data you choose to share will be visible to other members of that community. This sharing is controlled by you.',
  },
  {
    title: '5. Push Notifications',
    body: 'If you grant permission, we may send push notifications for things like new messages, shared programs, and community activity. You can turn notifications off at any time in Settings or through your device settings.',
  },
  {
    title: '6. Data Deletion',
    body: 'You can clear your local app data at any time through the Settings screen using the Clear All Data option. To request full deletion of your account and cloud data, please contact us at avenasfitness@gmail.com.',
  },
  {
    title: '7. Children\'s Privacy',
    body: 'This app is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child has created an account, please contact us and we will remove it.',
  },
  {
    title: '8. Security',
    body: 'We use reasonable security measures to protect your data from unauthorised access. Your account is protected by password authentication and we recommend using a strong, unique password.',
  },
  {
    title: '9. Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. When we do, we will update the date at the top of this page. Continued use of the app after changes means you accept the updated policy.',
  },
  {
    title: '10. Contact',
    body: 'If you have any questions about this Privacy Policy or how we handle your data, please get in touch at avenasfitness@gmail.com.',
  },
];

export default function PrivacyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });

  if (!fontsLoaded) return null;

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
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Privacy Policy</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.lastUpdated, { color: colors.tertiaryText }]}>Last updated: March 2026</Text>

        <View style={[styles.card, { backgroundColor: colors.cardSolid }]}>
          {SECTIONS.map((section, i) => (
            <View key={i} style={[styles.section, i < SECTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>{section.title}</Text>
              <Text style={[styles.sectionBody, { color: colors.secondaryText }]}>{section.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 58 : 38,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  headerTitle: { fontSize: 20, fontFamily: 'Arimo_700Bold' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },
  lastUpdated: { fontSize: 12, fontFamily: 'Arimo_400Regular', marginBottom: 16, marginLeft: 4 },
  card: {
    borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    overflow: 'hidden',
  },
  section: { paddingHorizontal: 20, paddingVertical: 18 },
  sectionTitle: { fontSize: 15, fontFamily: 'Arimo_700Bold', marginBottom: 8 },
  sectionBody: { fontSize: 14, fontFamily: 'Arimo_400Regular', lineHeight: 21 },
});
