import { useRouter } from 'expo-router';
import OnboardingScreen from '../components/OnboardingScreen';

export default function Index() {
  const router = useRouter();

  return <OnboardingScreen onContinue={() => router.replace('/home')} />;
}