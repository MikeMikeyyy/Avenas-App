import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import OnboardingScreen from '../components/OnboardingScreen';
import { useAuth } from '../authStore';

export default function Index() {
  const router = useRouter();
  const { user, isGuest, loading } = useAuth();

  useEffect(() => {
    if (!loading && (user || isGuest)) {
      router.replace('/home');
    }
  }, [user, isGuest, loading]);

  // Still checking Firebase auth state
  if (loading) return null;

  // Already authenticated or guest — will redirect via useEffect
  if (user || isGuest) return null;

  // New user — show onboarding, then go to auth screen
  return <OnboardingScreen onContinue={() => router.replace('/auth')} />;
}
