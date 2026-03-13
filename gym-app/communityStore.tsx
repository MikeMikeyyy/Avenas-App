import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc,
  addDoc, getDocs, onSnapshot, query, where, orderBy,
  arrayUnion, arrayRemove, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './authStore';
import { SplitDay } from './programStore';
import { sendPushToUser, sendPushToUsers } from './notificationService';

// Types
export type MemberRole = 'owner' | 'member';

export type Member = {
  id: string;
  name: string;
  avatar?: string;
  role: MemberRole;
  joinedAt: Date;
};

export type SharedWorkout = {
  id: string;
  programId: string;
  programName: string;
  sharedBy: string;
  sharedAt: Date;
  sharedWith: 'everyone' | string[];
  status: 'pending' | 'accepted' | 'declined';
  color: string;
  splitDays: SplitDay[];
  direction?: 'toMembers' | 'toCoach' | 'returnedToMember';
  recipientMemberId?: string; // uid of the non-owner member involved
  returnedBy?: string;        // coach name when direction === 'returnedToMember'
  removedByMemberIds?: string[]; // members who dismissed this 'everyone' share
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: Date;
  isOwner: boolean;
};

export type PrivateMessage = {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: Date;
  sharedWorkout?: {
    programId: string;
    programName: string;
    color: string;
    splitDays: number;
  };
};

export type PrivateChat = {
  memberId: string;
  memberName: string;
  messages: PrivateMessage[];
};

export type Community = {
  id: string;
  name: string;
  description: string;
  ownerName: string;
  ownerId: string;
  color: string;
  createdAt: Date;
  members: Member[];
  sharedWorkouts: SharedWorkout[];
  chatMessages: ChatMessage[];
  privateChats: PrivateChat[];
  inviteCode: string;
};

// Context types
type CommunityStoreState = {
  joinedCommunities: Community[];
  ownedCommunities: Community[];
  loading: boolean;
  createCommunity: (name: string, description: string, color?: string) => Promise<void>;
  joinCommunity: (inviteCode: string) => Promise<boolean>;
  leaveCommunity: (communityId: string) => void;
  deleteCommunity: (communityId: string) => void;
  acceptWorkout: (communityId: string, workoutId: string) => void;
  declineWorkout: (communityId: string, workoutId: string) => void;
  shareWorkout: (communityId: string, workout: Omit<SharedWorkout, 'id' | 'sharedAt' | 'status'>) => void;
  shareWithCoach: (communityId: string, workout: Omit<SharedWorkout, 'id' | 'sharedAt' | 'status' | 'sharedWith' | 'direction' | 'recipientMemberId'>) => void;
  respondToMemberShare: (communityId: string, workoutId: string, accept: boolean) => void;
  returnWorkoutToMember: (communityId: string, originalWorkoutId: string, updatedWorkout: { programName: string; color: string; splitDays: SplitDay[] }) => Promise<void>;
  sendMessage: (communityId: string, message: string) => void;
  removeMember: (communityId: string, memberId: string) => void;
  updateCommunity: (communityId: string, name: string, description: string, color?: string) => void;
  removeSharedWorkout: (communityId: string, workoutId: string) => void;
  dismissSharedWorkout: (communityId: string, workoutId: string) => void;
  sendPrivateMessage: (communityId: string, memberId: string, memberName: string, message: string) => void;
  shareWorkoutPrivately: (communityId: string, memberId: string, memberName: string, workout: { programId: string; programName: string; color: string; splitDays: number }) => void;
  getPrivateChat: (communityId: string, memberId: string) => PrivateChat | undefined;
  syncUserName: (newName: string) => Promise<void>;
  deletedCommunityName: string | null;
  clearDeletedNotification: () => void;
};

const CommunityStoreContext = createContext<CommunityStoreState | null>(null);

const COLORS = ['#47DDFF', '#FF6B6B', '#A78BFA', '#34D399', '#FBBF24', '#F472B6'];
const getRandomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

const generateInviteCode = (name: string) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const prefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  const suffixLen = Math.max(2, 8 - prefix.length);
  let suffix = '';
  for (let i = 0; i < suffixLen; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix + suffix;
};

// Convert Firestore Timestamp or date-like value to JS Date
function tsToDate(ts: any): Date {
  if (!ts) return new Date();
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts?.seconds !== undefined) return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

// Convert Firestore document snapshot data to Community shape
function firestoreToCommunity(id: string, data: any): Community {
  return {
    id,
    name: data.name ?? '',
    description: data.description ?? '',
    ownerName: data.ownerName ?? '',
    ownerId: data.ownerId ?? '',
    color: data.color ?? '#47DDFF',
    createdAt: tsToDate(data.createdAt),
    inviteCode: data.inviteCode ?? '',
    chatMessages: [], // populated separately by messages subcollection listener
    members: (data.members ?? []).map((m: any) => ({
      id: m.id ?? '',
      name: m.name ?? '',
      avatar: m.avatar,
      role: m.role ?? 'member',
      joinedAt: tsToDate(m.joinedAt),
    })),
    sharedWorkouts: (data.sharedWorkouts ?? []).map((w: any) => ({
      id: w.id ?? '',
      programId: w.programId ?? '',
      programName: w.programName ?? '',
      sharedBy: w.sharedBy ?? '',
      sharedAt: tsToDate(w.sharedAt),
      sharedWith: w.sharedWith ?? 'everyone',
      status: w.status ?? 'pending',
      color: w.color ?? '#47DDFF',
      splitDays: w.splitDays ?? [],
      direction: w.direction,
      recipientMemberId: w.recipientMemberId,
      returnedBy: w.returnedBy,
      removedByMemberIds: w.removedByMemberIds ?? [],
    })),
    privateChats: (data.privateChats ?? []).map((pc: any) => ({
      memberId: pc.memberId ?? '',
      memberName: pc.memberName ?? '',
      messages: (pc.messages ?? []).map((msg: any) => ({
        id: msg.id ?? '',
        senderId: msg.senderId ?? '',
        senderName: msg.senderName ?? '',
        message: msg.message ?? '',
        timestamp: tsToDate(msg.timestamp),
        sharedWorkout: msg.sharedWorkout,
      })),
    })),
  };
}

export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [joinedCommunities, setJoinedCommunities] = useState<Community[]>([]);
  const [ownedCommunities, setOwnedCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletedCommunityName, setDeletedCommunityName] = useState<string | null>(null);
  const docUnsubs = useRef<Record<string, () => void>>({});
  const msgUnsubs = useRef<Record<string, () => void>>({});
  // Keep a current-user ref so onSnapshot closures can access uid without stale closure issues
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Set up real-time listeners for a community (doc + messages subcollection)
  const subscribeToCommunity = useCallback((id: string, side: 'owned' | 'joined') => {
    docUnsubs.current[id]?.();
    msgUnsubs.current[id]?.();

    const setter = side === 'owned' ? setOwnedCommunities : setJoinedCommunities;

    // Listener 1: community document (members, sharedWorkouts, privateChats)
    docUnsubs.current[id] = onSnapshot(doc(db, 'communities', id), snap => {
      if (!snap.exists()) {
        // Community was deleted by owner — clean up local state
        setter(prev => {
          if (side === 'joined') {
            const comm = prev.find(c => c.id === id);
            if (comm) {
              // Notify member that their community was deleted
              setDeletedCommunityName(comm.name);
              // Clean up this user's own membership record
              const uid = userRef.current?.uid;
              if (uid) {
                setDoc(
                  doc(db, 'users', uid, 'data', 'communityMemberships'),
                  { joinedIds: arrayRemove(id) },
                  { merge: true }
                ).catch(() => {});
              }
            }
          }
          return prev.filter(c => c.id !== id);
        });
        // Unsubscribe listeners — community is gone
        docUnsubs.current[id]?.();
        msgUnsubs.current[id]?.();
        delete docUnsubs.current[id];
        delete msgUnsubs.current[id];
        return;
      }
      const community = firestoreToCommunity(snap.id, snap.data());
      setter(prev => {
        const idx = prev.findIndex(c => c.id === id);
        if (idx >= 0) {
          const next = [...prev];
          // Preserve chatMessages — managed by the messages subcollection listener
          next[idx] = { ...community, chatMessages: next[idx].chatMessages };
          return next;
        }
        return [...prev, community];
      });
    });

    // Listener 2: messages subcollection (real-time chat)
    msgUnsubs.current[id] = onSnapshot(
      query(collection(db, 'communities', id, 'messages'), orderBy('timestamp', 'asc')),
      snap => {
        const msgs: ChatMessage[] = snap.docs.map(d => ({
          id: d.id,
          senderId: d.data().senderId ?? '',
          senderName: d.data().senderName ?? '',
          message: d.data().message ?? '',
          timestamp: tsToDate(d.data().timestamp),
          isOwner: d.data().isOwner ?? false,
        }));
        setter(prev => prev.map(c => c.id === id ? { ...c, chatMessages: msgs } : c));
      }
    );
  }, []);

  // Load communities when user auth state changes
  useEffect(() => {
    if (!user) {
      Object.values(docUnsubs.current).forEach(u => u());
      Object.values(msgUnsubs.current).forEach(u => u());
      docUnsubs.current = {};
      msgUnsubs.current = {};
      setOwnedCommunities([]);
      setJoinedCommunities([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid, 'data', 'communityMemberships'));
        const data = snap.exists() ? snap.data() : {};
        const ownedIds: string[] = data.ownedIds ?? [];
        const joinedIds: string[] = data.joinedIds ?? [];
        for (const id of ownedIds) subscribeToCommunity(id, 'owned');
        const currentOwnerIds: string[] = data.ownerIds ?? [];
        for (const id of joinedIds) {
          subscribeToCommunity(id, 'joined');
          // Backfill memberIds (community doc) and ownerIds (membership doc) for communities that predate these fields.
          // memberIds ensures security rules pass for member writes (shareWithCoach etc).
          // ownerIds grants the coach read access to the member's workout/progress data.
          getDoc(doc(db, 'communities', id)).then(commSnap => {
            if (!commSnap.exists()) return;
            const commData = commSnap.data();
            const memberIds: string[] = commData.memberIds ?? [];
            if (!memberIds.includes(user.uid)) {
              updateDoc(commSnap.ref, { memberIds: arrayUnion(user.uid) }).catch(() => {});
            }
            const ownerId: string = commData.ownerId ?? '';
            if (ownerId && !currentOwnerIds.includes(ownerId)) {
              setDoc(
                doc(db, 'users', user.uid, 'data', 'communityMemberships'),
                { ownerIds: arrayUnion(ownerId) },
                { merge: true }
              ).catch(() => {});
            }
          }).catch(() => {});
        }
      } catch {}
      setLoading(false);
    })();
  }, [user?.uid, subscribeToCommunity]);

  const createCommunity = useCallback(async (name: string, description: string, color?: string): Promise<void> => {
    if (!user) return;
    const id = `comm-${Date.now()}`;
    const userName = user.displayName ?? user.email ?? 'You';
    const community = {
      id, name, description,
      ownerName: userName,
      ownerId: user.uid,
      color: color ?? getRandomColor(),
      createdAt: new Date(),
      inviteCode: generateInviteCode(name),
      memberIds: [user.uid],
      members: [{ id: user.uid, name: userName, role: 'owner', joinedAt: new Date() }],
      sharedWorkouts: [],
      privateChats: [],
    };
    try {
      await setDoc(doc(db, 'communities', id), community);
      await setDoc(
        doc(db, 'users', user.uid, 'data', 'communityMemberships'),
        { ownedIds: arrayUnion(id) },
        { merge: true }
      );
      subscribeToCommunity(id, 'owned');
    } catch (e) { console.error('[createCommunity]', e); }
  }, [user, subscribeToCommunity]);

  const joinCommunity = useCallback(async (inviteCode: string): Promise<boolean> => {
    if (!user) { console.log('[joinCommunity] no user'); return false; }
    const code = inviteCode.toUpperCase();
    console.log('[joinCommunity] searching for code:', code);
    try {
      const q = query(
        collection(db, 'communities'),
        where('inviteCode', '==', code)
      );
      const snap = await getDocs(q);
      console.log('[joinCommunity] query results:', snap.size);
      if (snap.empty) { console.log('[joinCommunity] no community found'); return false; }
      const commDoc = snap.docs[0];
      const data = commDoc.data();
      console.log('[joinCommunity] found community:', data.name, 'ownerId:', data.ownerId, 'members:', data.members?.length);
      if (data.ownerId === user.uid) { console.log('[joinCommunity] user is owner'); return false; }
      const alreadyMember = (data.members ?? []).some((m: any) => m.id === user.uid);
      if (alreadyMember) { console.log('[joinCommunity] already a member'); return false; }
      const newMember = {
        id: user.uid,
        name: user.displayName ?? user.email ?? 'You',
        role: 'member',
        joinedAt: new Date(),
      };
      console.log('[joinCommunity] adding member:', newMember.name);
      await updateDoc(commDoc.ref, { members: arrayUnion(newMember), memberIds: arrayUnion(user.uid) });
      await setDoc(
        doc(db, 'users', user.uid, 'data', 'communityMemberships'),
        { joinedIds: arrayUnion(commDoc.id), ownerIds: arrayUnion(data.ownerId) },
        { merge: true }
      );
      subscribeToCommunity(commDoc.id, 'joined');
      sendPushToUser(data.ownerId, 'New Member', `${newMember.name} joined ${data.name}`).catch(() => {});
      console.log('[joinCommunity] success');
      return true;
    } catch (e) {
      console.error('[joinCommunity] error:', e);
      return false;
    }
  }, [user, subscribeToCommunity]);

  const leaveCommunity = useCallback(async (communityId: string) => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const ownerId: string = snap.data().ownerId;
      const members = (snap.data().members ?? []).filter((m: any) => m.id !== user.uid);
      await updateDoc(doc(db, 'communities', communityId), { members, memberIds: arrayRemove(user.uid) });
      await setDoc(
        doc(db, 'users', user.uid, 'data', 'communityMemberships'),
        { joinedIds: arrayRemove(communityId), ownerIds: arrayRemove(ownerId) },
        { merge: true }
      );
      docUnsubs.current[communityId]?.();
      msgUnsubs.current[communityId]?.();
      delete docUnsubs.current[communityId];
      delete msgUnsubs.current[communityId];
      setJoinedCommunities(prev => prev.filter(c => c.id !== communityId));
    } catch {}
  }, [user]);

  const deleteCommunity = useCallback(async (communityId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'communities', communityId));
      await setDoc(
        doc(db, 'users', user.uid, 'data', 'communityMemberships'),
        { ownedIds: arrayRemove(communityId) },
        { merge: true }
      );
      docUnsubs.current[communityId]?.();
      msgUnsubs.current[communityId]?.();
      delete docUnsubs.current[communityId];
      delete msgUnsubs.current[communityId];
      setOwnedCommunities(prev => prev.filter(c => c.id !== communityId));
    } catch {}
  }, [user]);

  const acceptWorkout = useCallback(async (communityId: string, workoutId: string) => {
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const sharedWorkouts = (snap.data().sharedWorkouts ?? []).map((w: any) =>
        w.id === workoutId ? { ...w, status: 'accepted' } : w
      );
      await updateDoc(doc(db, 'communities', communityId), { sharedWorkouts });
    } catch {}
  }, []);

  const declineWorkout = useCallback(async (communityId: string, workoutId: string) => {
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const sharedWorkouts = (snap.data().sharedWorkouts ?? []).map((w: any) =>
        w.id === workoutId ? { ...w, status: 'declined' } : w
      );
      await updateDoc(doc(db, 'communities', communityId), { sharedWorkouts });
    } catch {}
  }, []);

  const shareWorkout = useCallback(async (communityId: string, workout: Omit<SharedWorkout, 'id' | 'sharedAt' | 'status'>) => {
    const newWorkout = {
      ...workout,
      id: `sw-${Date.now()}`,
      sharedAt: new Date(),
      status: 'pending',
    };
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const existing = snap.data().sharedWorkouts ?? [];
      await updateDoc(doc(db, 'communities', communityId), {
        sharedWorkouts: [...existing, newWorkout],
      });
    } catch {}
  }, []);

  const shareWithCoach = useCallback(async (communityId: string, workout: Omit<SharedWorkout, 'id' | 'sharedAt' | 'status' | 'sharedWith' | 'direction' | 'recipientMemberId'>) => {
    if (!user) return;
    const newWorkout = {
      ...workout,
      recipientMemberId: user.uid,
      id: `sw-${Date.now()}`,
      sharedAt: new Date(),
      status: 'pending',
      sharedWith: 'everyone',
      direction: 'toCoach',
    };
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const data = snap.data();
      const existing = data.sharedWorkouts ?? [];
      await updateDoc(doc(db, 'communities', communityId), {
        sharedWorkouts: [...existing, newWorkout],
      });
      const senderName = user.displayName ?? user.email ?? 'Member';
      sendPushToUser(data.ownerId, 'Program Shared', `${senderName} shared ${workout.programName} with you`).catch(() => {});
    } catch (e) { console.error('[shareWithCoach]', e); }
  }, [user]);

  const respondToMemberShare = useCallback(async (communityId: string, workoutId: string, accept: boolean) => {
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const sharedWorkouts = (snap.data().sharedWorkouts ?? []).map((w: any) =>
        w.id === workoutId ? { ...w, status: accept ? 'accepted' : 'declined' } : w
      );
      await updateDoc(doc(db, 'communities', communityId), { sharedWorkouts });
    } catch {}
  }, []);

  const returnWorkoutToMember = useCallback(async (
    communityId: string,
    originalWorkoutId: string,
    updatedWorkout: { programName: string; color: string; splitDays: SplitDay[] }
  ) => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const existing: any[] = snap.data().sharedWorkouts ?? [];
      const original = existing.find(w => w.id === originalWorkoutId);
      if (!original) return;
      const withoutOriginal = existing.filter(w => w.id !== originalWorkoutId);
      const returnedWorkout = {
        ...original,
        ...updatedWorkout,
        id: `sw-${Date.now()}`,
        sharedAt: new Date(),
        status: 'pending',
        direction: 'returnedToMember',
        returnedBy: user.displayName ?? user.email ?? 'Coach',
      };
      await updateDoc(doc(db, 'communities', communityId), {
        sharedWorkouts: [...withoutOriginal, returnedWorkout],
      });
      if (original.recipientMemberId) {
        const coachName = user.displayName ?? user.email ?? 'Your coach';
        sendPushToUser(original.recipientMemberId, 'Program Returned', `${coachName} updated and returned ${updatedWorkout.programName}`).catch(() => {});
      }
    } catch {}
  }, [user]);

  const sendMessage = useCallback(async (communityId: string, message: string) => {
    if (!user) return;
    const community = [...ownedCommunities, ...joinedCommunities].find(c => c.id === communityId);
    const isOwner = ownedCommunities.some(c => c.id === communityId);
    const senderName = user.displayName ?? user.email ?? 'You';
    try {
      await addDoc(collection(db, 'communities', communityId, 'messages'), {
        senderId: user.uid,
        senderName,
        message,
        isOwner,
        timestamp: serverTimestamp(),
      });
      if (community) {
        const recipientIds = community.members
          .filter(m => m.id !== user.uid)
          .map(m => m.id);
        const preview = message.length > 60 ? message.slice(0, 60) + '…' : message;
        sendPushToUsers(recipientIds, community.name, `${senderName}: ${preview}`).catch(() => {});
      }
    } catch {}
  }, [user, ownedCommunities, joinedCommunities]);

  const removeMember = useCallback(async (communityId: string, memberId: string) => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const members = (snap.data().members ?? []).filter((m: any) => m.id !== memberId);
      await updateDoc(doc(db, 'communities', communityId), { members, memberIds: arrayRemove(memberId) });
      // Revoke owner's read access to the removed member's data
      await setDoc(
        doc(db, 'users', memberId, 'data', 'communityMemberships'),
        { joinedIds: arrayRemove(communityId), ownerIds: arrayRemove(user.uid) },
        { merge: true }
      );
    } catch {}
  }, [user]);

  const updateCommunity = useCallback(async (communityId: string, name: string, description: string, color?: string) => {
    try {
      const fields: Record<string, any> = { name, description };
      if (color) fields.color = color;
      await updateDoc(doc(db, 'communities', communityId), fields);
    } catch {}
  }, []);

  const removeSharedWorkout = useCallback(async (communityId: string, workoutId: string) => {
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const sharedWorkouts = (snap.data().sharedWorkouts ?? []).filter((w: any) => w.id !== workoutId);
      await updateDoc(doc(db, 'communities', communityId), { sharedWorkouts });
    } catch {}
  }, []);

  // For 'everyone' shared workouts: marks the current member as having dismissed it
  // without removing the workout from the community (coach still sees it).
  const dismissSharedWorkout = useCallback(async (communityId: string, workoutId: string) => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const sharedWorkouts = (snap.data().sharedWorkouts ?? []).map((w: any) =>
        w.id === workoutId
          ? { ...w, removedByMemberIds: [...new Set([...(w.removedByMemberIds ?? []), user.uid])] }
          : w
      );
      await updateDoc(doc(db, 'communities', communityId), { sharedWorkouts });
    } catch {}
  }, [user]);

  const sendPrivateMessage = useCallback(async (communityId: string, memberId: string, memberName: string, message: string) => {
    if (!user) return;
    const senderName = user.displayName ?? user.email ?? 'You';
    const newMsg = {
      id: `pm-${Date.now()}`,
      senderId: user.uid,
      senderName,
      message,
      timestamp: new Date(),
    };
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const data = snap.data();
      const privateChats: any[] = data.privateChats ?? [];
      const chatIdx = privateChats.findIndex(pc => pc.memberId === memberId);
      if (chatIdx >= 0) {
        privateChats[chatIdx] = {
          ...privateChats[chatIdx],
          messages: [...(privateChats[chatIdx].messages ?? []), newMsg],
        };
      } else {
        privateChats.push({ memberId, memberName, messages: [newMsg] });
      }
      await updateDoc(doc(db, 'communities', communityId), { privateChats });
      // Notify the other party
      const recipientId = user.uid === memberId ? data.ownerId : memberId;
      const preview = message.length > 60 ? message.slice(0, 60) + '…' : message;
      sendPushToUser(recipientId, senderName, preview).catch(() => {});
    } catch {}
  }, [user]);

  const shareWorkoutPrivately = useCallback(async (
    communityId: string,
    memberId: string,
    memberName: string,
    workout: { programId: string; programName: string; color: string; splitDays: number }
  ) => {
    if (!user) return;
    const senderName = user.displayName ?? user.email ?? 'You';
    const newMsg = {
      id: `pm-${Date.now()}`,
      senderId: user.uid,
      senderName,
      message: `Shared a program: ${workout.programName}`,
      timestamp: new Date(),
      sharedWorkout: workout,
    };
    try {
      const snap = await getDoc(doc(db, 'communities', communityId));
      if (!snap.exists()) return;
      const data = snap.data();
      const privateChats: any[] = data.privateChats ?? [];
      const chatIdx = privateChats.findIndex(pc => pc.memberId === memberId);
      if (chatIdx >= 0) {
        privateChats[chatIdx] = {
          ...privateChats[chatIdx],
          messages: [...(privateChats[chatIdx].messages ?? []), newMsg],
        };
      } else {
        privateChats.push({ memberId, memberName, messages: [newMsg] });
      }
      await updateDoc(doc(db, 'communities', communityId), { privateChats });
      const recipientId = user.uid === memberId ? data.ownerId : memberId;
      sendPushToUser(recipientId, 'Program Shared', `${senderName} shared ${workout.programName} with you`).catch(() => {});
    } catch {}
  }, [user]);

  const getPrivateChat = useCallback((communityId: string, memberId: string): PrivateChat | undefined => {
    const owned = ownedCommunities.find(c => c.id === communityId);
    if (owned) return owned.privateChats.find(pc => pc.memberId === memberId);
    const joined = joinedCommunities.find(c => c.id === communityId);
    if (joined) return joined.privateChats.find(pc => pc.memberId === memberId);
    return undefined;
  }, [ownedCommunities, joinedCommunities]);

  const syncUserName = useCallback(async (newName: string) => {
    if (!user) return;
    const allCommunities = [
      ...ownedCommunities.map(c => ({ id: c.id, isOwner: true })),
      ...joinedCommunities.map(c => ({ id: c.id, isOwner: false })),
    ];
    for (const { id, isOwner } of allCommunities) {
      try {
        const commRef = doc(db, 'communities', id);
        const snap = await getDoc(commRef);
        if (!snap.exists()) continue;
        const data = snap.data();
        const updates: Record<string, any> = {};
        if (isOwner) updates.ownerName = newName;
        const members = (data.members ?? []).map((m: any) =>
          m.id === user.uid ? { ...m, name: newName } : m
        );
        updates.members = members;
        await updateDoc(commRef, updates);
      } catch {}
    }
  }, [user, ownedCommunities, joinedCommunities]);

  return (
    <CommunityStoreContext.Provider
      value={{
        joinedCommunities, ownedCommunities, loading,
        createCommunity, joinCommunity, leaveCommunity, deleteCommunity,
        acceptWorkout, declineWorkout, shareWorkout, shareWithCoach,
        respondToMemberShare, returnWorkoutToMember, sendMessage, removeMember, updateCommunity,
        removeSharedWorkout, dismissSharedWorkout, sendPrivateMessage, shareWorkoutPrivately, getPrivateChat, syncUserName,
        deletedCommunityName, clearDeletedNotification: () => setDeletedCommunityName(null),
      }}
    >
      {children}
    </CommunityStoreContext.Provider>
  );
}

export function useCommunityStore() {
  const ctx = useContext(CommunityStoreContext);
  if (!ctx) throw new Error('useCommunityStore must be used within CommunityProvider');
  return ctx;
}
