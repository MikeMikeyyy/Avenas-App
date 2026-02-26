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
    a: 'Go to the Workout tab, select today\'s session, and tap the timer to begin. Enter your sets, reps, and weights as you go.',
  },
  {
    q: 'Can I change the order of exercises?',
    a: 'Yes — tap the pencil icon on any exercise card to enter edit mode, then use the up/down arrows to reorder.',
  },
  {
    q: 'How do I switch between kg and lbs?',
    a: 'Go to Settings → Preferences → Units and tap your preferred unit. All weights across the app will update instantly.',
  },
  {
    q: 'How do I edit a completed workout?',
    a: 'Open the Journal tab, tap the entry you want to change, then tap any set to edit its values. Tap Save Changes when done.',
  },
  {
    q: 'Can I create my own training program?',
    a: 'Yes — go to Programs and tap the + button. You can add as many training days and exercises as you like.',
  },
  {
    q: 'Why isn\'t the timer saving when I close the app?',
    a: 'The wall-clock start time is saved automatically. If you reopen the app mid-workout, the elapsed time will be based on your original start time.',
  },
  {
    q: 'How does the streak work?',
    a: 'Your streak increases each day you open the app. It resets if you miss a full day, so make sure to check in daily to keep it going.',
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
            Having trouble or want to share feedback? Reach out and we'll get back to you as soon as possible.
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
