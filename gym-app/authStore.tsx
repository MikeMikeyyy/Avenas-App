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
  signInWithCredential,
  deleteUser,
  GoogleAuthProvider,
  OAuthProvider,
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
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithApple: (identityToken: string, fullName?: string | null) => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  updateUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateUserEmail: (currentPassword: string, newEmail: string) => Promise<void>;
  sendPasswordReset: () => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
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

  const signInWithGoogle = async (idToken: string) => {
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setIsGuest(false);
  };

  const signInWithApple = async (identityToken: string, fullName?: string | null) => {
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({ idToken: identityToken });
    const result = await signInWithCredential(auth, credential);
    if (fullName && result.user && !result.user.displayName) {
      await updateProfile(result.user, { displayName: fullName });
    }
    await AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setIsGuest(false);
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

  const deleteAccount = async (password?: string) => {
    const u = auth.currentUser;
    if (!u) throw new Error('Not logged in');
    const providerId = u.providerData[0]?.providerId;
    if (providerId === 'password') {
      if (!password || !u.email) throw new Error('Password required');
      const credential = EmailAuthProvider.credential(u.email, password);
      await reauthenticateWithCredential(u, credential);
    }
    await deleteUser(u);
    await AsyncStorage.clear().catch(() => {});
    setUser(null);
    setIsGuest(false);
  };

  return (
    <AuthContext.Provider value={{
      user, isGuest, loading,
      signIn, signUp, signOut, continueAsGuest, signInWithGoogle, signInWithApple,
      updateDisplayName, updateUserPassword, updateUserEmail, sendPasswordReset, deleteAccount,
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
