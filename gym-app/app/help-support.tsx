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
  Linking,
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

const FAQ = [
  {
    q: 'How do I start tracking a workout?',
    a: 'Go to the Workout tab and your current program day will be shown. Tap the timer to start the session, then log your sets, reps, and weights as you go.',
  },
  {
    q: 'How do I edit a completed workout?',
    a: 'Open the Journal tab and tap any past workout entry to edit it. You can adjust sets, reps, and weights, then save your changes.',
  },
  {
    q: 'How do I switch between kg and lbs?',
    a: 'Go to Settings, then Preferences, and tap your preferred unit. All weights across the app update straight away.',
  },
  {
    q: 'Can I create my own training program?',
    a: 'Yes, go to Programs and tap the plus button. You can set up training days, rest days, and add as many exercises as you need.',
  },
  {
    q: 'How do I join a community?',
    a: 'Go to the Community tab and tap Join Community. Enter the invite code from your coach or group to get added.',
  },
  {
    q: 'Why is my previous data not showing on workout days?',
    a: 'Previous performance only shows after you have completed at least one session for that same day in the current program. It is specific to your active program.',
  },
  {
    q: 'How does dark mode work?',
    a: 'You can toggle dark mode in Settings under Preferences. Your preference is saved to your account so it carries across devices.',
  },
  {
    q: 'Will my data be lost if I delete the app?',
    a: 'Your workout data is linked to your account and stored in the cloud. If you reinstall and log back in, your history will be restored.',
  },
];

export default function HelpSupportScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
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
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Help & Support</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Contact Card */}
        <View style={[styles.card, { backgroundColor: colors.cardSolid }]}>
          <View style={styles.cardIconRow}>
            <View style={[styles.iconBadge, { backgroundColor: isDark ? 'rgba(71,221,255,0.15)' : 'rgba(71,221,255,0.12)' }]}>
              <Ionicons name="mail-outline" size={22} color="#47DDFF" />
            </View>
            <Text style={[styles.cardTitle, { color: colors.primaryText }]}>Contact Us</Text>
          </View>
          <Text style={[styles.cardBody, { color: colors.secondaryText }]}>
            Having trouble or want to share feedback? Reach out and we will get back to you as soon as we can.
          </Text>
          <TouchableOpacity
            style={[styles.emailBtn, { backgroundColor: isDark ? 'rgba(71,221,255,0.12)' : 'rgba(71,221,255,0.1)', borderColor: '#47DDFF' }]}
            onPress={() => Linking.openURL('mailto:support@gymapp.com')}
            activeOpacity={0.7}
          >
            <Ionicons name="mail" size={16} color="#47DDFF" />
            <Text style={[styles.emailBtnText, { color: '#47DDFF' }]}>support@gymapp.com</Text>
          </TouchableOpacity>
        </View>

        {/* FAQ */}
        <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>FREQUENTLY ASKED QUESTIONS</Text>
        <View style={[styles.card, { backgroundColor: colors.cardSolid }]}>
          {FAQ.map((item, i) => (
            <View key={i} style={[styles.faqItem, i < FAQ.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <Text style={[styles.faqQuestion, { color: colors.primaryText }]}>{item.q}</Text>
              <Text style={[styles.faqAnswer, { color: colors.secondaryText }]}>{item.a}</Text>
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
  sectionLabel: {
    fontSize: 13, fontFamily: 'Arimo_700Bold',
    marginBottom: 8, marginTop: 24, marginLeft: 4, letterSpacing: 0.5,
  },
  card: {
    borderRadius: 16, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    overflow: 'hidden',
  },
  cardIconRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, paddingBottom: 12 },
  iconBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 17, fontFamily: 'Arimo_700Bold' },
  cardBody: { fontSize: 14, fontFamily: 'Arimo_400Regular', lineHeight: 20, paddingHorizontal: 20, paddingBottom: 16 },
  emailBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 20,
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1,
  },
  emailBtnText: { fontSize: 14, fontFamily: 'Arimo_700Bold' },
  faqItem: { paddingHorizontal: 20, paddingVertical: 16 },
  faqQuestion: { fontSize: 15, fontFamily: 'Arimo_700Bold', marginBottom: 6 },
  faqAnswer: { fontSize: 14, fontFamily: 'Arimo_400Regular', lineHeight: 20 },
});
