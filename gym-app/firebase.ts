import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAc4XXp2_fRo-r5Pun6S-zUxChUylwcoxg',
  authDomain: 'gym-app-79b61.firebaseapp.com',
  projectId: 'gym-app-79b61',
  storageBucket: 'gym-app-79b61.firebasestorage.app',
  messagingSenderId: '509276082930',
  appId: '1:509276082930:web:c461634cae009ceda7f66b',
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
