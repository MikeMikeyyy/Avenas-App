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

// In-memory pending chat navigation — set when a notification is tapped so the
// community tab can open the right chat even if it's already focused (useFocusEffect
// won't re-fire in that case) or if communities haven't loaded yet (cold start).
type ChatNavPayload = { communityId: string; chatType: string; memberId: string | null };
let _pendingChatNav: ChatNavPayload | null = null;
const _chatNavListeners: Array<() => void> = [];

export function setPendingChatNav(nav: ChatNavPayload): void {
  _pendingChatNav = nav;
  _chatNavListeners.slice().forEach(fn => fn());
}
export function consumePendingChatNav(): ChatNavPayload | null {
  const v = _pendingChatNav; _pendingChatNav = null; return v;
}
export function subscribePendingChatNav(fn: () => void): () => void {
  _chatNavListeners.push(fn);
  return () => { const i = _chatNavListeners.indexOf(fn); if (i >= 0) _chatNavListeners.splice(i, 1); };
}

// In-memory cooldown: the first message in a conversation vibrates normally.
// Follow-up messages within the cooldown window are sent silently (sound: null)
// so the phone doesn't vibrate for every single message in a chat.
// Key = conversationId:recipientUserId, value = last notified timestamp.
const _notifCooldown = new Map<string, number>();
const NOTIF_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function _shouldVibrate(conversationId: string, recipientId: string): boolean {
  const key = `${conversationId}:${recipientId}`;
  const last = _notifCooldown.get(key);
  return !last || Date.now() - last > NOTIF_COOLDOWN_MS;
}

function _markNotified(conversationId: string, recipientId: string): void {
  _notifCooldown.set(`${conversationId}:${recipientId}`, Date.now());
}

// Derive a stable conversation ID from the push data payload so we can
// apply the cooldown and collapseId without changing every call site.
function _getConversationId(data?: Record<string, any>): string | null {
  if (!data?.communityId || !data?.chatType) return null;
  if (data.chatType === 'private' && data.memberId) {
    return `private:${data.communityId}:${data.memberId}`;
  }
  if (data.chatType === 'group') {
    return `group:${data.communityId}`;
  }
  return null;
}

function _getSubtitle(data?: Record<string, any>): string | undefined {
  if (data?.chatType === 'group') return 'Group Chat';
  if (data?.chatType === 'private') return 'Private Message';
  return undefined;
}

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
  data?: Record<string, any>,
  sound?: boolean,
  collapseId?: string,
  subtitle?: string,
): Promise<void> {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data: data ?? {},
        sound: sound === false ? null : 'default',
        ...(subtitle ? { subtitle } : {}),
        ...(collapseId ? { collapseId } : {}),
      }),
    });
  } catch {}
}

// Convenience: look up a user's token then send.
// Automatically applies cooldown + collapseId for chat messages (data.chatType present).
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  const token = await getUserPushToken(userId);
  if (!token) return;
  const convId = _getConversationId(data);
  const shouldVibrate = convId ? _shouldVibrate(convId, userId) : true;
  // collapseId is per-recipient so each person's notification slot is independent
  const collapseId = convId ? `${convId}:${userId}` : undefined;
  const subtitle = _getSubtitle(data);
  await sendPushNotification(token, title, body, data, shouldVibrate, collapseId, subtitle);
  if (convId) _markNotified(convId, userId);
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
