import React, { createContext, useContext, useState, ReactNode } from 'react';
import { SplitDay } from './programStore';

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
  sharedWith: 'everyone' | string[]; // 'everyone' or array of member IDs
  status: 'pending' | 'accepted' | 'declined';
  color: string;
  splitDays: SplitDay[];
  direction?: 'toMembers' | 'toCoach'; // default toMembers
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
  // For shared workout messages
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
  memberCount: number;
  createdAt: Date;
  members: Member[];
  sharedWorkouts: SharedWorkout[];
  chatMessages: ChatMessage[];
  privateChats: PrivateChat[];
  inviteCode: string;
};

// Current user mock (in real app, this would come from auth)
export const CURRENT_USER = {
  id: 'user-1',
  name: 'You',
};

// Default communities for demo
const defaultCommunities: Community[] = [
  {
    id: 'comm-1',
    name: 'Elite Fitness Coaching',
    description: 'Personal training community focused on strength and hypertrophy',
    ownerName: 'Coach Mike',
    ownerId: 'coach-mike',
    color: '#47DDFF',
    memberCount: 24,
    createdAt: new Date('2024-01-15'),
    inviteCode: 'ELITE2024',
    members: [
      { id: 'coach-mike', name: 'Coach Mike', role: 'owner', joinedAt: new Date('2024-01-15') },
      { id: 'user-1', name: 'You', role: 'member', joinedAt: new Date('2024-02-01') },
      { id: 'user-2', name: 'Sarah J.', role: 'member', joinedAt: new Date('2024-02-10') },
      { id: 'user-3', name: 'Tom K.', role: 'member', joinedAt: new Date('2024-02-15') },
    ],
    sharedWorkouts: [
      {
        id: 'sw-1',
        programId: 'prog-1',
        programName: '12-Week Strength Program',
        sharedBy: 'Coach Mike',
        sharedAt: new Date('2024-02-20'),
        sharedWith: 'everyone',
        status: 'pending',
        color: '#47DDFF',
        splitDays: [
          { type: 'training', sessions: [{ label: 'Squat', exercises: [{ name: 'Squats', sets: 5 }, { name: 'Romanian Deadlift', sets: 3 }, { name: 'Leg Press', sets: 3 }] }] },
          { type: 'training', sessions: [{ label: 'Bench', exercises: [{ name: 'Bench Press', sets: 5 }, { name: 'Incline Press', sets: 3 }, { name: 'Tricep Pushdown', sets: 3 }] }] },
          { type: 'rest' },
          { type: 'training', sessions: [{ label: 'Deadlift', exercises: [{ name: 'Deadlift', sets: 5 }, { name: 'Overhead Press', sets: 4 }, { name: 'Pull Ups', sets: 3 }] }] },
        ],
      },
      {
        id: 'sw-2',
        programId: 'prog-2',
        programName: 'Hypertrophy Block',
        sharedBy: 'Coach Mike',
        sharedAt: new Date('2024-02-18'),
        sharedWith: ['user-1'],
        status: 'accepted',
        color: '#A78BFA',
        splitDays: [
          { type: 'training', sessions: [{ label: 'Chest/Triceps', exercises: [{ name: 'Bench Press', sets: 4 }, { name: 'Incline Flyes', sets: 3 }, { name: 'Skull Crushers', sets: 3 }] }] },
          { type: 'training', sessions: [{ label: 'Back/Biceps', exercises: [{ name: 'Pull Ups', sets: 4 }, { name: 'Barbell Row', sets: 4 }, { name: 'Bicep Curls', sets: 3 }] }] },
          { type: 'training', sessions: [{ label: 'Legs', exercises: [{ name: 'Squats', sets: 4 }, { name: 'Leg Press', sets: 3 }, { name: 'Leg Curls', sets: 3 }] }] },
          { type: 'training', sessions: [{ label: 'Shoulders', exercises: [{ name: 'Overhead Press', sets: 4 }, { name: 'Lateral Raises', sets: 4 }, { name: 'Face Pulls', sets: 3 }] }] },
          { type: 'rest' },
        ],
      },
    ],
    chatMessages: [
      {
        id: 'msg-1',
        senderId: 'coach-mike',
        senderName: 'Coach Mike',
        message: 'Welcome to Elite Fitness! Let me know if you have any questions about your program.',
        timestamp: new Date('2024-02-01T10:00:00'),
        isOwner: true,
      },
      {
        id: 'msg-2',
        senderId: 'user-1',
        senderName: 'You',
        message: 'Thanks Coach! Quick question - should I increase weight each week on the compound lifts?',
        timestamp: new Date('2024-02-01T10:30:00'),
        isOwner: false,
      },
      {
        id: 'msg-3',
        senderId: 'coach-mike',
        senderName: 'Coach Mike',
        message: 'Great question! Yes, aim for progressive overload. Add 2.5-5lbs when you hit all your reps with good form.',
        timestamp: new Date('2024-02-01T11:00:00'),
        isOwner: true,
      },
    ],
    privateChats: [],
  },
];

const defaultOwnedCommunities: Community[] = [
  {
    id: 'comm-owned-1',
    name: 'My Training Group',
    description: 'A community for my personal training clients',
    ownerName: 'You',
    ownerId: 'user-1',
    color: '#34D399',
    memberCount: 8,
    createdAt: new Date('2024-03-01'),
    inviteCode: 'MYTRAIN4X',
    members: [
      { id: 'user-1', name: 'You', role: 'owner', joinedAt: new Date('2024-03-01') },
      { id: 'client-1', name: 'Alex M.', role: 'member', joinedAt: new Date('2024-03-05') },
      { id: 'client-2', name: 'Jordan P.', role: 'member', joinedAt: new Date('2024-03-08') },
      { id: 'client-3', name: 'Riley S.', role: 'member', joinedAt: new Date('2024-03-10') },
    ],
    sharedWorkouts: [
      {
        id: 'sw-3',
        programId: 'prog-3',
        programName: 'Beginner Full Body',
        sharedBy: 'You',
        sharedAt: new Date('2024-03-12'),
        sharedWith: 'everyone',
        status: 'accepted',
        color: '#34D399',
        splitDays: [
          { type: 'training', sessions: [{ label: 'Full Body', exercises: [{ name: 'Squats', sets: 3 }, { name: 'Bench Press', sets: 3 }, { name: 'Barbell Row', sets: 3 }] }] },
          { type: 'rest' },
          { type: 'training', sessions: [{ label: 'Full Body', exercises: [{ name: 'Deadlift', sets: 3 }, { name: 'Overhead Press', sets: 3 }, { name: 'Pull Ups', sets: 3 }] }] },
        ],
      },
    ],
    chatMessages: [
      {
        id: 'msg-4',
        senderId: 'client-1',
        senderName: 'Alex M.',
        message: 'Hey! Just finished week 1 of the program. Feeling great!',
        timestamp: new Date('2024-03-15T14:00:00'),
        isOwner: false,
      },
      {
        id: 'msg-5',
        senderId: 'user-1',
        senderName: 'You',
        message: 'Awesome work Alex! Keep pushing and let me know if you need any modifications.',
        timestamp: new Date('2024-03-15T14:30:00'),
        isOwner: true,
      },
    ],
    privateChats: [
      {
        memberId: 'client-1',
        memberName: 'Alex M.',
        messages: [
          {
            id: 'pm-1',
            senderId: 'user-1',
            senderName: 'You',
            message: 'Hey Alex, how are you finding the program so far?',
            timestamp: new Date('2024-03-10T09:00:00'),
          },
          {
            id: 'pm-2',
            senderId: 'client-1',
            senderName: 'Alex M.',
            message: 'It\'s great! The exercises are challenging but manageable.',
            timestamp: new Date('2024-03-10T09:30:00'),
          },
        ],
      },
    ],
  },
];

// Context types
type CommunityStoreState = {
  joinedCommunities: Community[];
  ownedCommunities: Community[];
  createCommunity: (name: string, description: string) => void;
  joinCommunity: (inviteCode: string) => boolean;
  leaveCommunity: (communityId: string) => void;
  deleteCommunity: (communityId: string) => void;
  acceptWorkout: (communityId: string, workoutId: string) => void;
  declineWorkout: (communityId: string, workoutId: string) => void;
  shareWorkout: (communityId: string, workout: Omit<SharedWorkout, 'id' | 'sharedAt' | 'status'>) => void;
  shareWithCoach: (communityId: string, workout: Omit<SharedWorkout, 'id' | 'sharedAt' | 'status' | 'sharedWith' | 'direction'>) => void;
  respondToMemberShare: (communityId: string, workoutId: string, accept: boolean) => void;
  sendMessage: (communityId: string, message: string) => void;
  removeMember: (communityId: string, memberId: string) => void;
  updateCommunity: (communityId: string, name: string, description: string) => void;
  removeSharedWorkout: (communityId: string, workoutId: string) => void;
  sendPrivateMessage: (communityId: string, memberId: string, memberName: string, message: string) => void;
  shareWorkoutPrivately: (communityId: string, memberId: string, memberName: string, workout: { programId: string; programName: string; color: string; splitDays: number }) => void;
  getPrivateChat: (communityId: string, memberId: string) => PrivateChat | undefined;
};

const CommunityStoreContext = createContext<CommunityStoreState | null>(null);

// Generate random color from palette
const COLORS = ['#47DDFF', '#FF6B6B', '#A78BFA', '#34D399', '#FBBF24', '#F472B6'];
const getRandomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

// Generate random invite code including community name prefix
const generateInviteCode = (name: string) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  // Take up to 6 uppercase letters from the name (letters only)
  const prefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  const suffixLen = Math.max(2, 8 - prefix.length);
  let suffix = '';
  for (let i = 0; i < suffixLen; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix + suffix;
};

export function CommunityProvider({ children }: { children: ReactNode }) {
  const [joinedCommunities, setJoinedCommunities] = useState<Community[]>(defaultCommunities);
  const [ownedCommunities, setOwnedCommunities] = useState<Community[]>(defaultOwnedCommunities);

  const createCommunity = (name: string, description: string) => {
    const newCommunity: Community = {
      id: `comm-${Date.now()}`,
      name,
      description,
      ownerName: CURRENT_USER.name,
      ownerId: CURRENT_USER.id,
      color: getRandomColor(),
      memberCount: 1,
      createdAt: new Date(),
      inviteCode: generateInviteCode(name),
      members: [
        { id: CURRENT_USER.id, name: CURRENT_USER.name, role: 'owner', joinedAt: new Date() },
      ],
      sharedWorkouts: [],
      chatMessages: [],
      privateChats: [],
    };
    setOwnedCommunities(prev => [...prev, newCommunity]);
  };

  const joinCommunity = (inviteCode: string): boolean => {
    // Check owned communities
    const ownedMatch = ownedCommunities.find(c => c.inviteCode.toUpperCase() === inviteCode.toUpperCase());
    if (ownedMatch) return false; // Can't join your own community

    // Check if already joined
    const alreadyJoined = joinedCommunities.find(c => c.inviteCode.toUpperCase() === inviteCode.toUpperCase());
    if (alreadyJoined) return false;

    // Mock: In real app, this would validate against a backend
    // For demo, we'll create a mock community if code matches pattern
    if (inviteCode.length >= 4) {
      const mockCommunity: Community = {
        id: `comm-${Date.now()}`,
        name: `Community ${inviteCode}`,
        description: 'A training community',
        ownerName: 'Coach',
        ownerId: 'coach-new',
        color: getRandomColor(),
        memberCount: 5,
        createdAt: new Date(),
        inviteCode: inviteCode.toUpperCase(),
        members: [
          { id: 'coach-new', name: 'Coach', role: 'owner', joinedAt: new Date() },
          { id: CURRENT_USER.id, name: CURRENT_USER.name, role: 'member', joinedAt: new Date() },
        ],
        sharedWorkouts: [],
        chatMessages: [
          {
            id: `msg-${Date.now()}`,
            senderId: 'coach-new',
            senderName: 'Coach',
            message: 'Welcome to the community!',
            timestamp: new Date(),
            isOwner: true,
          },
        ],
        privateChats: [],
      };
      setJoinedCommunities(prev => [...prev, mockCommunity]);
      return true;
    }
    return false;
  };

  const leaveCommunity = (communityId: string) => {
    setJoinedCommunities(prev => prev.filter(c => c.id !== communityId));
  };

  const deleteCommunity = (communityId: string) => {
    setOwnedCommunities(prev => prev.filter(c => c.id !== communityId));
  };

  const acceptWorkout = (communityId: string, workoutId: string) => {
    setJoinedCommunities(prev => prev.map(c => {
      if (c.id !== communityId) return c;
      return {
        ...c,
        sharedWorkouts: c.sharedWorkouts.map(w =>
          w.id === workoutId ? { ...w, status: 'accepted' as const } : w
        ),
      };
    }));
  };

  const declineWorkout = (communityId: string, workoutId: string) => {
    setJoinedCommunities(prev => prev.map(c => {
      if (c.id !== communityId) return c;
      return {
        ...c,
        sharedWorkouts: c.sharedWorkouts.map(w =>
          w.id === workoutId ? { ...w, status: 'declined' as const } : w
        ),
      };
    }));
  };

  const shareWorkout = (communityId: string, workout: Omit<SharedWorkout, 'id' | 'sharedAt' | 'status'>) => {
    const newWorkout: SharedWorkout = {
      ...workout,
      id: `sw-${Date.now()}`,
      sharedAt: new Date(),
      status: 'pending',
    };
    setOwnedCommunities(prev => prev.map(c => {
      if (c.id !== communityId) return c;
      return {
        ...c,
        sharedWorkouts: [...c.sharedWorkouts, newWorkout],
      };
    }));
  };

  const shareWithCoach = (communityId: string, workout: Omit<SharedWorkout, 'id' | 'sharedAt' | 'status' | 'sharedWith' | 'direction'>) => {
    const newWorkout: SharedWorkout = {
      ...workout,
      id: `sw-${Date.now()}`,
      sharedAt: new Date(),
      status: 'pending',
      sharedWith: 'everyone',
      direction: 'toCoach',
    };
    // Add to joinedCommunities so member can see their share
    setJoinedCommunities(prev => prev.map(c => {
      if (c.id !== communityId) return c;
      return { ...c, sharedWorkouts: [...c.sharedWorkouts, newWorkout] };
    }));
    // Also add to ownedCommunities so coach can see it
    // Find matching owned community by invite code (same community, different perspective)
    const joinedComm = joinedCommunities.find(c => c.id === communityId);
    if (joinedComm) {
      setOwnedCommunities(prev => prev.map(c => {
        // Match by invite code since IDs may differ between joined/owned views
        if (c.inviteCode !== joinedComm.inviteCode) return c;
        return { ...c, sharedWorkouts: [...c.sharedWorkouts, newWorkout] };
      }));
    }
  };

  const respondToMemberShare = (communityId: string, workoutId: string, accept: boolean) => {
    const newStatus = accept ? 'accepted' as const : 'declined' as const;
    setOwnedCommunities(prev => prev.map(c => {
      if (c.id !== communityId) return c;
      return {
        ...c,
        sharedWorkouts: c.sharedWorkouts.map(w =>
          w.id === workoutId ? { ...w, status: newStatus } : w
        ),
      };
    }));
  };

  const sendMessage = (communityId: string, message: string) => {
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: CURRENT_USER.id,
      senderName: CURRENT_USER.name,
      message,
      timestamp: new Date(),
      isOwner: ownedCommunities.some(c => c.id === communityId),
    };

    // Check if it's owned or joined
    if (ownedCommunities.some(c => c.id === communityId)) {
      setOwnedCommunities(prev => prev.map(c => {
        if (c.id !== communityId) return c;
        return {
          ...c,
          chatMessages: [...c.chatMessages, newMessage],
        };
      }));
    } else {
      setJoinedCommunities(prev => prev.map(c => {
        if (c.id !== communityId) return c;
        return {
          ...c,
          chatMessages: [...c.chatMessages, newMessage],
        };
      }));
    }
  };

  const removeMember = (communityId: string, memberId: string) => {
    setOwnedCommunities(prev => prev.map(c => {
      if (c.id !== communityId) return c;
      return {
        ...c,
        members: c.members.filter(m => m.id !== memberId),
        memberCount: c.memberCount - 1,
      };
    }));
  };

  const updateCommunity = (communityId: string, name: string, description: string) => {
    setOwnedCommunities(prev => prev.map(c => {
      if (c.id !== communityId) return c;
      return {
        ...c,
        name,
        description,
      };
    }));
  };

  const removeSharedWorkout = (communityId: string, workoutId: string) => {
    setOwnedCommunities(prev => prev.map(c => {
      if (c.id !== communityId) return c;
      return {
        ...c,
        sharedWorkouts: c.sharedWorkouts.filter(w => w.id !== workoutId),
      };
    }));
  };

  const getPrivateChat = (communityId: string, memberId: string): PrivateChat | undefined => {
    const owned = ownedCommunities.find(c => c.id === communityId);
    if (owned) return owned.privateChats.find(pc => pc.memberId === memberId);
    const joined = joinedCommunities.find(c => c.id === communityId);
    if (joined) return joined.privateChats.find(pc => pc.memberId === memberId);
    return undefined;
  };

  const sendPrivateMessage = (communityId: string, memberId: string, memberName: string, message: string) => {
    const newMessage: PrivateMessage = {
      id: `pm-${Date.now()}`,
      senderId: CURRENT_USER.id,
      senderName: CURRENT_USER.name,
      message,
      timestamp: new Date(),
    };

    const addMessageToCommunity = (c: Community): Community => {
      if (c.id !== communityId) return c;
      const existingChatIndex = c.privateChats.findIndex(pc => pc.memberId === memberId);
      if (existingChatIndex >= 0) {
        const updatedChats = [...c.privateChats];
        updatedChats[existingChatIndex] = {
          ...updatedChats[existingChatIndex],
          messages: [...updatedChats[existingChatIndex].messages, newMessage],
        };
        return { ...c, privateChats: updatedChats };
      } else {
        const newChat: PrivateChat = {
          memberId,
          memberName,
          messages: [newMessage],
        };
        return { ...c, privateChats: [...c.privateChats, newChat] };
      }
    };

    if (ownedCommunities.some(c => c.id === communityId)) {
      setOwnedCommunities(prev => prev.map(addMessageToCommunity));
    } else {
      setJoinedCommunities(prev => prev.map(addMessageToCommunity));
    }
  };

  const shareWorkoutPrivately = (
    communityId: string,
    memberId: string,
    memberName: string,
    workout: { programId: string; programName: string; color: string; splitDays: number }
  ) => {
    const newMessage: PrivateMessage = {
      id: `pm-${Date.now()}`,
      senderId: CURRENT_USER.id,
      senderName: CURRENT_USER.name,
      message: `Shared a program: ${workout.programName}`,
      timestamp: new Date(),
      sharedWorkout: workout,
    };

    setOwnedCommunities(prev => prev.map(c => {
      if (c.id !== communityId) return c;

      const existingChatIndex = c.privateChats.findIndex(pc => pc.memberId === memberId);

      if (existingChatIndex >= 0) {
        const updatedChats = [...c.privateChats];
        updatedChats[existingChatIndex] = {
          ...updatedChats[existingChatIndex],
          messages: [...updatedChats[existingChatIndex].messages, newMessage],
        };
        return { ...c, privateChats: updatedChats };
      } else {
        const newChat: PrivateChat = {
          memberId,
          memberName,
          messages: [newMessage],
        };
        return { ...c, privateChats: [...c.privateChats, newChat] };
      }
    }));
  };

  return (
    <CommunityStoreContext.Provider
      value={{
        joinedCommunities,
        ownedCommunities,
        createCommunity,
        joinCommunity,
        leaveCommunity,
        deleteCommunity,
        acceptWorkout,
        declineWorkout,
        shareWorkout,
        shareWithCoach,
        respondToMemberShare,
        sendMessage,
        removeMember,
        updateCommunity,
        removeSharedWorkout,
        sendPrivateMessage,
        shareWorkoutPrivately,
        getPrivateChat,
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
