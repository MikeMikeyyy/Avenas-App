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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { useTheme } from '../themeStore';
import { GlassBackButton } from '../components/GlassBackButton';
import { useAuth } from '../authStore';

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
    title: '5. Community Guidelines and User-Generated Content',
    body: 'The Community feature allows users to share content and interact with others. By participating in Community features, you agree to the following:\n\n• Zero Tolerance Policy: We have a strict zero-tolerance policy for objectionable content, hate speech, harassment, bullying, threats, explicit material, or abusive behaviour of any kind. Such content will be removed and the responsible account may be permanently banned.\n\n• Reporting: You may report any message or user you believe violates these guidelines using the in-app Report and Block tools. We will review all reports and take action within 24 hours.\n\n• Blocking: You may block any user at any time. Blocking a user will immediately remove their content from your view and notify us of the issue.\n\n• Moderation: We reserve the right to remove any content and to suspend or permanently eject any user who posts objectionable content or engages in abusive behaviour, without prior notice.\n\n• Responsibility: You are solely responsible for the content you post. Do not share personal information, offensive material, or anything that could harm or distress others.',
  },
  {
    title: '6. Intellectual Property',
    body: 'All content, features, and functionality of this app, including text, graphics, logos, and software, are the property of the app developer and are protected under applicable intellectual property laws. You may not copy, modify, or distribute any part of the app without written permission.',
  },
  {
    title: '7. Limitation of Liability',
    body: 'To the extent permitted by law, the app developer is not liable for any indirect or consequential damages arising from your use of the app. This includes any injury resulting from exercise activities you log or undertake while using the app.',
  },
  {
    title: '8. Termination',
    body: 'We may suspend or terminate your access to the app at any time if we believe you have violated these Terms of Service or acted in a way that is harmful to other users or to the app.',
  },
  {
    title: '9. Governing Law',
    body: 'These Terms of Service are governed by the laws of New South Wales, Australia. Any disputes arising from these terms will be subject to the jurisdiction of the courts of New South Wales.',
  },
  {
    title: '10. Contact',
    body: 'If you have any questions about these Terms of Service, or to report content that has not been addressed within 24 hours, please contact us at support@gymapp.com.',
  },
];

export default function TermsScreen() {
  const router = useRouter();
  const { accept } = useLocalSearchParams<{ accept?: string }>();
  const needsAccept = accept === '1';
  const { colors } = useTheme();
  const { user } = useAuth();
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });

  const handleAgree = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (user?.uid) {
      await AsyncStorage.setItem(`@communityTermsAccepted_${user.uid}`, 'true');
      // Also persist to Firestore so it survives reinstalls and new devices
      setDoc(doc(db, 'users', user.uid, 'data', 'preferences'), { communityTermsAccepted: true }, { merge: true }).catch(() => {});
    }
    router.back();
  };

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
        <GlassBackButton onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.primaryText }]}>Terms of Service</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, needsAccept && { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
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

      {needsAccept && (
        <View style={[styles.agreeBar, { backgroundColor: colors.cardSolid, borderTopColor: colors.border }]}>
          <BounceButton style={[styles.agreeBtn, { backgroundColor: colors.accent ?? '#47DDFF' }]} onPress={handleAgree}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.agreeBtnText}>I Agree</Text>
          </BounceButton>
        </View>
      )}
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
  agreeBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    borderTopWidth: 1,
  },
  agreeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, height: 52,
  },
  agreeBtnText: { fontSize: 16, fontFamily: 'Arimo_700Bold', color: '#fff' },
});
