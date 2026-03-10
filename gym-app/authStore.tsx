import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  updateEmail,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  EmailAuthProvider,
  User,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

const GUEST_KEY = '@guest_mode';

type AuthContextType = {
  user: User | null;
  isGuest: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  updateUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateUserEmail: (currentPassword: string, newEmail: string) => Promise<void>;
  sendPasswordReset: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(GUEST_KEY).then(val => {
      if (val === 'true') setIsGuest(true);
    }).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setIsGuest(false);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: displayName.trim() });
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setIsGuest(false);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setIsGuest(false);
  };

  const continueAsGuest = async () => {
    await AsyncStorage.setItem(GUEST_KEY, 'true').catch(() => {});
    setIsGuest(true);
  };

  const updateDisplayName = async (name: string) => {
    if (!auth.currentUser) throw new Error('Not logged in');
    await updateProfile(auth.currentUser, { displayName: name.trim() });
    // Refresh user state so UI updates immediately (explicitly set displayName in case it wasn't own-enumerable)
    setUser(Object.assign(Object.create(Object.getPrototypeOf(auth.currentUser)), auth.currentUser, { displayName: name.trim() }));
  };

  const updateUserPassword = async (currentPassword: string, newPassword: string) => {
    const u = auth.currentUser;
    if (!u || !u.email) throw new Error('Not logged in');
    const credential = EmailAuthProvider.credential(u.email, currentPassword);
    await reauthenticateWithCredential(u, credential);
    await updatePassword(u, newPassword);
  };

  const sendPasswordReset = async () => {
    const u = auth.currentUser;
    if (!u || !u.email) throw new Error('Not logged in');
    await sendPasswordResetEmail(auth, u.email);
  };

  const updateUserEmail = async (currentPassword: string, newEmail: string) => {
    const u = auth.currentUser;
    if (!u || !u.email) throw new Error('Not logged in');
    const credential = EmailAuthProvider.credential(u.email, currentPassword);
    await reauthenticateWithCredential(u, credential);
    await updateEmail(u, newEmail.trim());
    setUser(Object.assign(Object.create(Object.getPrototypeOf(auth.currentUser!)), auth.currentUser));
  };

  return (
    <AuthContext.Provider value={{
      user, isGuest, loading,
      signIn, signUp, signOut, continueAsGuest,
      updateDisplayName, updateUserPassword, updateUserEmail, sendPasswordReset,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
