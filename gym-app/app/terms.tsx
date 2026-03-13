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
    body: 'By downloading or using this app, you agree to these Terms of Service. If you do not agree, please do not use the app. We may update these terms from time to time. Continuing to use the app after any changes means you accept the updated terms.',
  },
  {
    title: '2. Use of the App',
    body: 'This app is for personal fitness tracking only. You agree to use it lawfully and in a way that does not infringe on the rights of others. You are responsible for keeping your account details secure and for any activity that happens under your account.',
  },
  {
    title: '3. Health Disclaimer',
    body: 'This app provides fitness tracking tools for general use only. Nothing in this app is medical advice, diagnosis, or treatment. Please consult a qualified health professional before starting any exercise program, especially if you have an existing medical condition or injury.',
  },
  {
    title: '4. User Content',
    body: 'You own all the workout data and content you create in the app. By using the app, you give us a limited licence to store and process your data for the purpose of running the service. We will not sell your personal data to third parties.',
  },
  {
    title: '5. Intellectual Property',
    body: 'All content, features, and functionality of this app, including text, graphics, logos, and software, are the property of the app developer and are protected under applicable intellectual property laws. You may not copy, modify, or distribute any part of the app without written permission.',
  },
  {
    title: '6. Limitation of Liability',
    body: 'To the extent permitted by law, the app developer is not liable for any indirect or consequential damages arising from your use of the app. This includes any injury resulting from exercise activities you log or undertake while using the app.',
  },
  {
    title: '7. Termination',
    body: 'We may suspend or terminate your access to the app at any time if we believe you have violated these Terms of Service or acted in a way that is harmful to other users or to the app.',
  },
  {
    title: '8. Governing Law',
    body: 'These Terms of Service are governed by the laws of New South Wales, Australia. Any disputes arising from these terms will be subject to the jurisdiction of the courts of New South Wales.',
  },
  {
    title: '9. Contact',
    body: 'If you have any questions about these Terms of Service, please get in touch at support@gymapp.com.',
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
