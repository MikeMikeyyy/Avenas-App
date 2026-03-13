import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#47DDFF',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: '3a72654b-708a-44ac-ba1c-c6987c2e8905',
  });

  const token = tokenData.data;
  await setDoc(doc(db, 'users', userId), { expoPushToken: token }, { merge: true }).catch(() => {});
  return token;
}

export async function getUserPushToken(userId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    return snap.exists() ? (snap.data().expoPushToken ?? null) : null;
  } catch {
    return null;
  }
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: token, title, body, data: data ?? {}, sound: 'default' }),
    });
  } catch {}
}

// Convenience: look up a user's token then send
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  const token = await getUserPushToken(userId);
  if (token) await sendPushNotification(token, title, body, data);
}

// Send to multiple users (e.g. group chat members), excluding the sender
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  await Promise.all(userIds.map(uid => sendPushToUser(uid, title, body, data)));
}
