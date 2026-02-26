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
    title: '1. Acceptance of Terms',
    body: 'By downloading or using this app, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the app. We reserve the right to update these terms at any time, and continued use of the app following any changes constitutes your acceptance of the revised terms.',
  },
  {
    title: '2. Use of the App',
    body: 'This app is intended for personal fitness tracking purposes only. You agree to use it only for lawful purposes and in a manner that does not infringe the rights of others. You are responsible for maintaining the confidentiality of your account information and for all activities that occur under your account.',
  },
  {
    title: '3. Health Disclaimer',
    body: 'The app provides fitness tracking tools and information for general informational purposes only. Nothing in this app constitutes professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider before beginning any exercise programme, particularly if you have a pre-existing medical condition or injury.',
  },
  {
    title: '4. User Content',
    body: 'You retain ownership of all workout data, notes, and other content you create within the app. By using the app, you grant us a limited licence to store and process your data solely for the purpose of providing the service to you. We will not sell your personal data to third parties.',
  },
  {
    title: '5. Intellectual Property',
    body: 'All content, features, and functionality of this app — including but not limited to text, graphics, logos, and software — are the exclusive property of the app developer and are protected by applicable intellectual property laws. You may not copy, modify, or distribute any part of the app without prior written consent.',
  },
  {
    title: '6. Limitation of Liability',
    body: 'To the fullest extent permitted by law, the app developer shall not be liable for any indirect, incidental, special, or consequential damages arising out of your use of, or inability to use, the app. This includes any injury resulting from exercise activities tracked or suggested by the app.',
  },
  {
    title: '7. Termination',
    body: 'We reserve the right to suspend or terminate your access to the app at any time, without notice, for conduct that we believe violates these Terms of Service or is harmful to other users, us, or third parties, or for any other reason at our sole discretion.',
  },
  {
    title: '8. Governing Law',
    body: 'These Terms of Service shall be governed by and construed in accordance with applicable law. Any disputes arising under these terms shall be subject to the exclusive jurisdiction of the courts in the relevant jurisdiction.',
  },
  {
    title: '9. Contact',
    body: 'If you have any questions about these Terms of Service, please contact us at support@gymapp.com.',
  },
];

export default function TermsScreen() {
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
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Terms of Service</Text>
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
