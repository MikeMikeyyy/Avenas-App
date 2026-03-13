import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StatusBar,
  Animated,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import GoogleLogo from '../components/GoogleLogo';
import { useRouter } from 'expo-router';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { Nunito_700Bold } from '@expo-google-fonts/nunito';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../authStore';

WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID = '509276082930-dllkb3jls25igd0v6r4igg27vonjpte3.apps.googleusercontent.com';
const WEB_CLIENT_ID = '509276082930-79361f34bo7b238od4kng8ui4nk9hvoi.apps.googleusercontent.com';

export default function AuthScreen() {
  const router = useRouter();
  const { signIn, signUp, continueAsGuest, signInWithGoogle, signInWithApple } = useAuth();
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold, Nunito_700Bold });

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const btnScale = useRef(new Animated.Value(1)).current;
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    iosClientId: IOS_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params?.id_token ?? (googleResponse as any).authentication?.idToken;
      if (idToken) {
        setLoading(true);
        signInWithGoogle(idToken)
          .then(() => router.replace('/home'))
          .catch(e => setError(getErrorMessage(e.code ?? '')))
          .finally(() => setLoading(false));
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    }
  }, [googleResponse]);

  if (!fontsLoaded) return null;

  const toggleMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(m => m === 'signin' ? 'signup' : 'signin');
    setError('');
    setName('');
    setPassword('');
    setConfirmPassword('');
  };

  const getErrorMessage = (code: string): string => {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection.';
      default:
        return 'Something went wrong. Please try again.';
    }
  };

  const handleSubmit = async () => {
    const trimEmail = email.trim();
    const trimPassword = password.trim();

    if (mode === 'signup' && !name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!trimEmail || !trimPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (mode === 'signup' && trimPassword !== confirmPassword.trim()) {
      setError('Passwords do not match.');
      return;
    }

    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(trimEmail, trimPassword);
      } else {
        await signUp(trimEmail, trimPassword, name.trim());
      }
      router.replace('/home');
    } catch (e: any) {
      setError(getErrorMessage(e.code ?? ''));
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await continueAsGuest();
    router.replace('/home');
  };

  const handleGoogleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError('');
    await promptGoogleAsync();
  };

  const handleAppleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError('');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token');
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean).join(' ') || null;
      setLoading(true);
      await signInWithApple(credential.identityToken, fullName);
      router.replace('/home');
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        setError('Apple sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#abbac4', '#FFFFFF']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#abbac4" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoArea}>
            <Image
              source={require('../assets/images/av-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Image
              source={require('../assets/images/app-title3.png')}
              style={styles.appTitle}
              resizeMode="contain"
            />
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {mode === 'signin' ? 'Welcome back' : 'Create account'}
            </Text>

            {/* Name (sign up only) */}
            {mode === 'signup' && (
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color="#8e8e93" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor="#8e8e93"
                  autoCapitalize="words"
                  autoCorrect={false}
                  value={name}
                  onChangeText={t => { setName(t); setError(''); }}
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                />
              </View>
            )}

            {/* Email */}
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color="#8e8e93" style={styles.inputIcon} />
              <TextInput
                ref={emailRef}
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#8e8e93"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={t => { setEmail(t); setError(''); }}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            {/* Password */}
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color="#8e8e93" style={styles.inputIcon} />
              <TextInput
                ref={passwordRef}
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor="#8e8e93"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={t => { setPassword(t); setError(''); }}
                returnKeyType={mode === 'signup' ? 'next' : 'done'}
                onSubmitEditing={() => mode === 'signup' ? confirmRef.current?.focus() : handleSubmit()}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color="#8e8e93" />
              </TouchableOpacity>
            </View>

            {/* Confirm password (sign up only) */}
            {mode === 'signup' && (
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color="#8e8e93" style={styles.inputIcon} />
                <TextInput
                  ref={confirmRef}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Confirm password"
                  placeholderTextColor="#8e8e93"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={confirmPassword}
                  onChangeText={t => { setConfirmPassword(t); setError(''); }}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color="#8e8e93" />
                </TouchableOpacity>
              </View>
            )}

            {/* Error */}
            {!!error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            {/* Submit button */}
            <TouchableOpacity
              activeOpacity={1}
              onPressIn={() => Animated.timing(btnScale, { toValue: 0.97, duration: 80, useNativeDriver: true }).start()}
              onPressOut={() => Animated.timing(btnScale, { toValue: 1, duration: 80, useNativeDriver: true }).start()}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleSubmit(); }}
              disabled={loading}
            >
              <Animated.View style={[styles.submitBtn, { transform: [{ scale: btnScale }] }]}>
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  </Text>
                )}
              </Animated.View>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Sign-In */}
            <TouchableOpacity style={styles.socialBtn} onPress={handleGoogleSignIn} disabled={loading}>
              <GoogleLogo size={20} />
              <Text style={styles.socialBtnText}>Continue with Google</Text>
            </TouchableOpacity>

            {/* Apple Sign-In (iOS only) */}
            {Platform.OS === 'ios' && (
              <TouchableOpacity style={[styles.socialBtn, styles.appleBtnCustom]} onPress={handleAppleSignIn} disabled={loading}>
                <Ionicons name="logo-apple" size={20} color="#ffffff" />
                <Text style={[styles.socialBtnText, { color: '#ffffff' }]}>Continue with Apple</Text>
              </TouchableOpacity>
            )}

            {/* Toggle mode */}
            <TouchableOpacity onPress={toggleMode} style={styles.toggleRow}>
              <Text style={styles.toggleText}>
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <Text style={styles.toggleLink}>
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* Guest */}
          <TouchableOpacity onPress={handleGuest} style={styles.guestBtn}>
            <Text style={styles.guestText}>Continue without an account</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 100,
    height: 100,
  },
  appTitle: {
    width: 200,
    height: 70,
    marginTop: 4,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    marginBottom: 20,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f6f8',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 50,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
    letterSpacing: 0,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#FF3B30',
    marginBottom: 10,
    marginLeft: 2,
  },
  submitBtn: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Nunito_700Bold',
    letterSpacing: 0.3,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#8e8e93',
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    marginBottom: 12,
    gap: 10,
  },
  socialIcon: {
    width: 20,
    height: 20,
  },
  socialBtnText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  appleBtnCustom: {
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  toggleRow: {
    alignItems: 'center',
    marginTop: 4,
  },
  toggleText: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  toggleLink: {
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  guestBtn: {
    marginTop: 24,
    paddingVertical: 12,
  },
  guestText: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    textDecorationLine: 'underline',
  },
});
