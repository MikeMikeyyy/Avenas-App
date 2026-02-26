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
    body: 'We collect information you provide directly to us when you use the app, including workout data, exercise logs, personal records, and any notes or journal entries you create. We may also collect usage information such as the features you use and the frequency and duration of your activities.',
  },
  {
    title: '2. How We Use Your Information',
    body: 'We use the information we collect to provide, maintain, and improve the app; to personalise your experience; to track your fitness progress over time; and to respond to your comments and questions. We do not use your data for advertising purposes.',
  },
  {
    title: '3. Data Storage',
    body: 'Your workout data is stored locally on your device. We do not transmit your personal fitness data to external servers unless you explicitly opt in to cloud sync features (if available). You are responsible for maintaining the security of your device.',
  },
  {
    title: '4. Data Sharing',
    body: 'We do not sell, trade, or otherwise transfer your personal information to third parties. We may share aggregated, anonymised data that does not identify any individual for analytics or research purposes.',
  },
  {
    title: '5. Data Retention',
    body: 'We retain your data for as long as you use the app. You may delete your data at any time through the Settings screen using the "Clear All Data" option. Note that this action is irreversible.',
  },
  {
    title: '6. Children\'s Privacy',
    body: 'This app is not intended for use by children under the age of 13. We do not knowingly collect personal information from children under 13. If you become aware that a child has provided us with personal information, please contact us so we can take appropriate action.',
  },
  {
    title: '7. Security',
    body: 'We take reasonable measures to help protect your information from loss, theft, misuse, and unauthorised access. However, no security system is impenetrable and we cannot guarantee the security of your information.',
  },
  {
    title: '8. Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last updated" date at the top of this page. Your continued use of the app after any changes indicates your acceptance of the updated policy.',
  },
  {
    title: '9. Contact',
    body: 'If you have any questions about this Privacy Policy or our data practices, please contact us at support@gymapp.com.',
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
        <Text style={[styles.lastUpdated, { color: colors.tertiaryText }]}>Last updated: January 2025</Text>

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
