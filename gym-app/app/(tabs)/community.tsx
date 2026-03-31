import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  StatusBar,
  Animated,
  TextInput,
  Modal,
  Keyboard,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { useRouter, useFocusEffect } from 'expo-router';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { WorkoutJournalEntry } from '../../workoutState';
import { useCommunityStore, Community, Member } from '../../communityStore';
import { useProgramStore } from '../../programStore';
import { useTheme } from '../../themeStore';
import { useAuth } from '../../authStore';
import { BottomSheetModal } from '../../components/BottomSheetModal';
import { FadeBackdrop } from '../../components/FadeBackdrop';
import { ProgressView } from '../../components/ProgressView';
import { MemberJournalView } from '../../components/MemberJournalView';
import { useUnits } from '../../unitsStore';

// Each scheme: key stored in Firestore, colors is a 7-stop gradient
const COMMUNITY_COLOR_SCHEMES = [
  { key: 'electric',   colors: ['#5DB1F5','#60BEEB','#62CBE1','#65D8D8','#67E5CE','#6AF2C4','#6CFFBA'] }, // Blue → Aqua
  { key: 'cosmic',     colors: ['#9BAFD9','#849BCB','#6D87BC','#5673AE','#3E5FA0','#274B91','#103783'] }, // Periwinkle → Navy
  { key: 'amber',      colors: ['#CAD0FF','#CED3FA','#D2D6F6','#D7DAF1','#DBDDEC','#DFE0E8','#E3E3E3'] }, // Soft Lilac → White
  { key: 'neon',       colors: ['#F86CA7','#F77D97','#F78F86','#F6A076','#F5B165','#F5C355','#F4D444'] }, // Pink → Yellow
  { key: 'aurora',     colors: ['#1ED7B5','#41DDB3','#64E2B0','#87E8AE','#AAEEAC','#CDF3A9','#F0F9A7'] }, // Teal → Lime
  { key: 'periwinkle', colors: ['#F492F0','#E691EA','#D890E5','#CB90DF','#BD8FD9','#AF8ED4','#A18DCE'] }, // Pink → Periwinkle
  { key: 'galaxy',     colors: ['#ED0E6F','#DF0C6A','#D00965','#C20760','#B4055B','#A50256','#970051'] }, // Hot Pink → Deep Rose
];

function BounceButton({ style, children, onPress, disabled, ...rest }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <TouchableOpacity
      activeOpacity={1}
      disabled={disabled}
      onPressIn={() => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start()}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.(); }}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled && { opacity: 0.5 }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

type ViewMode = 'list' | 'detail' | 'chat' | 'share' | 'privateChat' | 'memberProgress';

// 50 avatar colors for members
const AVATAR_COLORS = [
  '#FF6B6B', // Coral Red
  '#4ECDC4', // Teal
  '#45B7D1', // Sky Blue
  '#96CEB4', // Sage Green
  '#FFEAA7', // Soft Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Golden
  '#BB8FCE', // Lavender
  '#85C1E9', // Light Blue
  '#F8B500', // Amber
  '#00CED1', // Dark Turquoise
  '#FF7F50', // Coral
  '#9B59B6', // Purple
  '#3498DB', // Blue
  '#1ABC9C', // Emerald
  '#E74C3C', // Red
  '#F39C12', // Orange
  '#2ECC71', // Green
  '#E91E63', // Pink
  '#6C5CE7', // Indigo
  '#FD79A8', // Rose
  '#00B894', // Seafoam
  '#FDCB6E', // Marigold
  '#A29BFE', // Periwinkle
  '#55EFC4', // Aquamarine
  '#FF9FF3', // Lilac
  '#54A0FF', // Cornflower Blue
  '#5F27CD', // Deep Purple
  '#01CBC6', // Cyan
  '#FF6348', // Orange Red
  '#7BED9F', // Light Green
  '#70A1FF', // Soft Blue
  '#EF5777', // Raspberry
  '#B8E994', // Pistachio
  '#F19066', // Peach
  '#778CA3', // Steel Blue
  '#FDA7DF', // Bubblegum
  '#D980FA', // Orchid
  '#9AECDB', // Pale Teal
  '#FFC312', // Sunflower
  '#C4E538', // Lime
  '#ED4C67', // Crimson
  '#12CBC4', // Turquoise
  '#A3CB38', // Olive Green
  '#1289A7', // Ocean Blue
  '#D980FA', // Violet
  '#B53471', // Berry
  '#EE5A24', // Burnt Orange
  '#009432', // Forest Green
];

// Get consistent color based on member ID
const getAvatarColor = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
};

const FALLBACK_COLORS = ['#1E90FF','#259DFF','#2CAAFF','#33B7FF','#39C3FF','#40D0FF','#47DDFF'];
const getColorScheme = (color: string) => {
  const scheme = COMMUNITY_COLOR_SCHEMES.find(s => s.key === color);
  const colors = scheme ? scheme.colors : FALLBACK_COLORS;
  return { colors, gradStart: colors[0] };
};

export default function CommunityScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });
  const {
    joinedCommunities,
    ownedCommunities,
    loading,
    createCommunity,
    joinCommunity,
    leaveCommunity,
    deleteCommunity,
    acceptWorkout,
    declineWorkout,
    shareWorkout,
    shareWithCoach,
    respondToMemberShare,
    returnWorkoutToMember,
    sendMessage,
    removeMember,
    updateCommunity,
    removeSharedWorkout,
    dismissSharedWorkout,
    sendPrivateMessage,
    shareWorkoutPrivately,
    getPrivateChat,
    deletedCommunityName,
    clearDeletedNotification,
    blockedUserIds,
    pendingReportedUserIds,
    reportContent,
    blockUser,
  } = useCommunityStore();
  const { programs, addProgram, addSharedProgram } = useProgramStore();
  const { isDark, colors } = useTheme();
  const { unit, toDisplay } = useUnits();
  const { user } = useAuth();
  const currentUserId = user?.uid ?? '';
  const currentUserName = user?.displayName ?? user?.email ?? 'You';

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [isOwnerView, setIsOwnerView] = useState(false);
  const [expandedSharedWorkoutId, setExpandedSharedWorkoutId] = useState<string | null>(null);
  const [confirmRemoveWorkoutId, setConfirmRemoveWorkoutId] = useState<string | null>(null);

  // Build a per-community color map so no two members share a color (up to 50 members)
  const memberColorMap = useMemo(() => {
    const members = selectedCommunity?.members ?? [];
    const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
    const map: Record<string, string> = {};
    sorted.forEach((m, i) => { map[m.id] = AVATAR_COLORS[i % AVATAR_COLORS.length]; });
    return map;
  }, [selectedCommunity?.members]);
  const getMemberColor = (id: string) => memberColorMap[id] ?? getAvatarColor(id);

  // Reset expanded/confirm state when leaving the tab
  useFocusEffect(React.useCallback(() => {
    return () => {
      setExpandedSharedWorkoutId(null);
      setConfirmRemoveWorkoutId(null);
    };
  }, []));

  // Navigate to chat when app is opened via a notification tap
  useFocusEffect(React.useCallback(() => {
    AsyncStorage.getItem('@pendingChatNav').then(raw => {
      if (!raw) return;
      AsyncStorage.removeItem('@pendingChatNav');
      try {
        const { communityId, chatType, memberId } = JSON.parse(raw);
        const allCommunities = [...ownedCommunities, ...joinedCommunities];
        const community = allCommunities.find(c => c.id === communityId);
        if (!community) return;
        const isOwner = ownedCommunities.some(c => c.id === communityId);
        setSelectedCommunity(community);
        setIsOwnerView(isOwner);
        if (chatType === 'group') {
          const allMsgs = community.chatMessages;
          const currentReadCount = readGroupChatCounts[communityId] || 0;
          const otherMsgsAll = allMsgs.filter(m => m.senderId !== currentUserId);
          const unreadCnt = Math.max(0, otherMsgsAll.length - currentReadCount);
          let firstIdx: number | null = null;
          if (unreadCnt > 0) {
            const firstUnreadMsg = otherMsgsAll[currentReadCount];
            const idx = allMsgs.indexOf(firstUnreadMsg);
            firstIdx = idx > 0 ? idx : null;
          }
          setGroupFirstUnreadIdx(firstIdx);
          chatMsgCountRef.current = -1;
          setReadGroupChatCounts(prev => ({ ...prev, [communityId]: otherMsgsAll.length }));
          setViewMode('chat');
        } else if (chatType === 'private') {
          // For the coach: privateChatMember = the non-owner member being chatted with
          // For the member: privateChatMember = the owner (display purposes; chat key uses currentUserId)
          const member = isOwner
            ? community.members.find(m => m.id === memberId)
            : community.members.find(m => m.role === 'owner');
          if (member) {
            const privateChatKey = isOwner ? memberId : currentUserId;
            const chat = community.privateChats.find(pc => pc.memberId === privateChatKey);
            const allMsgs = chat?.messages || [];
            const key = `${communityId}-${privateChatKey}`;
            const currentReadCount = readPrivateChatCounts[key] || 0;
            const otherMsgsAll = allMsgs.filter(m => m.senderId !== currentUserId);
            const unreadCnt = Math.max(0, otherMsgsAll.length - currentReadCount);
            let firstIdx: number | null = null;
            if (unreadCnt > 0) {
              const firstUnreadMsg = otherMsgsAll[currentReadCount];
              const idx = allMsgs.indexOf(firstUnreadMsg);
              firstIdx = idx > 0 ? idx : null;
            }
            setPrivateFirstUnreadIdx(firstIdx);
            privateMsgCountRef.current = -1;
            setReadPrivateChatCounts(prev => ({ ...prev, [key]: otherMsgsAll.length }));
            setPrivateChatMember(member);
            setViewMode('privateChat');
          }
        }
      } catch {}
    }).catch(() => {});
  }, [ownedCommunities, joinedCommunities]));

  // Keep selectedCommunity in sync with store updates
  useEffect(() => {
    if (!selectedCommunity) return;
    const source = isOwnerView ? ownedCommunities : joinedCommunities;
    const updated = source.find(c => c.id === selectedCommunity.id);
    if (updated && updated !== selectedCommunity) {
      setSelectedCommunity(updated);
    }
  }, [ownedCommunities, joinedCommunities]);

  // Notify member when a community they belong to is deleted by the owner
  useEffect(() => {
    if (!deletedCommunityName) return;
    // If they were viewing that community, send them back to the list
    setViewMode('list');
    setSelectedCommunity(null);
    Alert.alert(
      'Community Deleted',
      `"${deletedCommunityName}" has been deleted by the owner. You have been removed from the community.`,
      [{ text: 'OK', onPress: clearDeletedNotification }]
    );
  }, [deletedCommunityName]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState('');
  const [newCommunityDesc, setNewCommunityDesc] = useState('');
  const [newCommunityColor, setNewCommunityColor] = useState(COMMUNITY_COLOR_SCHEMES[0].key);
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Chat state
  const [chatMessage, setChatMessage] = useState('');

  // Share workout state
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [shareWith, setShareWith] = useState<'everyone' | string[]>('everyone');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Menu states
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showManageMembersModal, setShowManageMembersModal] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);
  const [showEditInSheet, setShowEditInSheet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState(COMMUNITY_COLOR_SCHEMES[0].key);
  const [showManageProgramsModal, setShowManageProgramsModal] = useState(false);
  const [programToRemove, setProgramToRemove] = useState<{ id: string; name: string } | null>(null);
  const [showRemoveProgramConfirmation, setShowRemoveProgramConfirmation] = useState(false);

  // Private chat state
  const [privateChatMember, setPrivateChatMember] = useState<Member | null>(null);
  const [privateMessage, setPrivateMessage] = useState('');
  const [showPrivateProgramPicker, setShowPrivateProgramPicker] = useState(false);

  // Member progress state (owner viewing a member's workout history)
  const [progressMember, setProgressMember] = useState<Member | null>(null);
  const [memberJournalData, setMemberJournalData] = useState<WorkoutJournalEntry[] | null>(null);
  const [memberActiveProgramName, setMemberActiveProgramName] = useState<string | null>(null);
  const [memberProgressLoading, setMemberProgressLoading] = useState(false);
  const [memberProgressTab, setMemberProgressTab] = useState<'stats' | 'journal'>('stats');

  // EULA / Community Terms acceptance
  const [communityTermsAccepted, setCommunityTermsAccepted] = useState<boolean | null>(null);
  const checkCommunityTerms = async () => {
    if (!currentUserId) return;
    const local = await AsyncStorage.getItem(`@communityTermsAccepted_${currentUserId}`);
    if (local === 'true') {
      setCommunityTermsAccepted(true);
      return;
    }
    // Fallback: check Firestore in case AsyncStorage was cleared (reinstall, new device, etc.)
    try {
      const snap = await getDoc(doc(db, 'users', currentUserId, 'data', 'preferences'));
      if (snap.exists() && snap.data()?.communityTermsAccepted === true) {
        // Re-cache locally so future checks are instant
        AsyncStorage.setItem(`@communityTermsAccepted_${currentUserId}`, 'true').catch(() => {});
        setCommunityTermsAccepted(true);
        return;
      }
    } catch {}
    setCommunityTermsAccepted(false);
  };
  useEffect(() => { checkCommunityTerms(); }, [currentUserId]);
  // Re-check whenever the screen comes back into focus (e.g. returning from terms page)
  useFocusEffect(React.useCallback(() => { checkCommunityTerms(); }, [currentUserId]));

  // Message action (report / block) state
  type PendingAction = { senderId: string; senderName: string; messagePreview: string; communityId: string; communityName: string; chatType: 'group' | 'private' };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [showMessageActions, setShowMessageActions] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportComment, setReportComment] = useState('');
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  // User tap action (tap on member name/avatar)
  type PendingUserAction = { userId: string; userName: string; communityId: string; communityName: string };
  const [pendingUserAction, setPendingUserAction] = useState<PendingUserAction | null>(null);
  const [showUserActions, setShowUserActions] = useState(false);
  const [userReportSent, setUserReportSent] = useState(false);
  const [showUserBlockConfirm, setShowUserBlockConfirm] = useState(false);
  const [reportedOwnerCommunities, setReportedOwnerCommunities] = useState<Community[]>([]);

  // Owner-block warning
  const [ownerBlockInfo, setOwnerBlockInfo] = useState<{ userId: string; userName: string; communities: Community[] } | null>(null);
  const [showOwnerBlockWarning, setShowOwnerBlockWarning] = useState(false);


  // Keyboard height for chat input positioning
  const [chatKeyboardHeight, setChatKeyboardHeight] = useState(0);
  const chatFlatListRef = useRef<FlatList>(null);
  const privateChatFlatListRef = useRef<FlatList>(null);
  const [groupFirstUnreadIdx, setGroupFirstUnreadIdx] = useState<number | null>(null);
  const [privateFirstUnreadIdx, setPrivateFirstUnreadIdx] = useState<number | null>(null);
  // -1 = not yet initialized; >=0 = message count at last scroll
  const chatMsgCountRef = useRef(-1);
  const privateMsgCountRef = useRef(-1);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', e => {
      setChatKeyboardHeight(e.endCoordinates.height);
      setTimeout(() => {
        chatFlatListRef.current?.scrollToEnd({ animated: true });
        privateChatFlatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      setChatKeyboardHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);


  // Unread message tracking: stores count of messages already seen
  const [readGroupChatCounts, setReadGroupChatCounts] = useState<Record<string, number>>({});
  const [readPrivateChatCounts, setReadPrivateChatCounts] = useState<Record<string, number>>({});
  const [countsLoaded, setCountsLoaded] = useState(false);

  // Load persisted read counts for the current user, clear on logout
  useEffect(() => {
    setCountsLoaded(false);
    if (!currentUserId) {
      setReadGroupChatCounts({});
      setReadPrivateChatCounts({});
      return;
    }
    (async () => {
      try {
        const [groupRaw, privateRaw] = await Promise.all([
          AsyncStorage.getItem(`@readGroupCounts_${currentUserId}`),
          AsyncStorage.getItem(`@readPrivateCounts_${currentUserId}`),
        ]);
        setReadGroupChatCounts(groupRaw ? JSON.parse(groupRaw) : {});
        setReadPrivateChatCounts(privateRaw ? JSON.parse(privateRaw) : {});
      } catch {}
      setCountsLoaded(true);
    })();
  }, [currentUserId]);

  // Once counts are loaded, set a baseline for any community not yet tracked so that
  // messages that already existed before this session don't show as new.
  useEffect(() => {
    if (!countsLoaded || !currentUserId) return;
    const allCommunities = [...ownedCommunities, ...joinedCommunities];
    setReadGroupChatCounts(prev => {
      const updated = { ...prev };
      let changed = false;
      for (const community of allCommunities) {
        // Only baseline once messages have loaded — chatMessages starts as [] until the
        // subcollection listener fires, so setting baseline on an empty array would
        // record 0 and then show all real messages as unread when they arrive.
        if (!(community.id in updated) && community.chatMessages.length > 0) {
          updated[community.id] = community.chatMessages.filter(m => m.senderId !== currentUserId).length;
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
    // Same baseline for private chats — prevent old messages showing as unread on first login
    setReadPrivateChatCounts(prev => {
      const updated = { ...prev };
      let changed = false;
      for (const community of ownedCommunities) {
        for (const chat of community.privateChats) {
          const key = `${community.id}-${chat.memberId}`;
          if (!(key in updated)) {
            updated[key] = chat.messages.filter(m => m.senderId !== currentUserId).length;
            changed = true;
          }
        }
      }
      for (const community of joinedCommunities) {
        const chat = community.privateChats.find(pc => pc.memberId === currentUserId);
        if (chat) {
          const key = `${community.id}-${currentUserId}`;
          if (!(key in updated)) {
            updated[key] = chat.messages.filter(m => m.senderId !== currentUserId).length;
            changed = true;
          }
        }
      }
      return changed ? updated : prev;
    });
  }, [countsLoaded, ownedCommunities, joinedCommunities, currentUserId]);

  // Persist read counts whenever they change (skip during initial load to avoid overwriting saved data)
  useEffect(() => {
    if (!currentUserId || !countsLoaded) return;
    AsyncStorage.setItem(`@readGroupCounts_${currentUserId}`, JSON.stringify(readGroupChatCounts)).catch(() => {});
  }, [readGroupChatCounts, currentUserId, countsLoaded]);

  useEffect(() => {
    if (!currentUserId || !countsLoaded) return;
    AsyncStorage.setItem(`@readPrivateCounts_${currentUserId}`, JSON.stringify(readPrivateChatCounts)).catch(() => {});
  }, [readPrivateChatCounts, currentUserId, countsLoaded]);

  // Helper to count unread group chat messages
  const getUnreadGroupCount = (community: Community): number => {
    // If not yet baselined (messages still loading), show nothing as unread
    if (!(community.id in readGroupChatCounts)) return 0;
    const otherMessages = community.chatMessages.filter(m => m.senderId !== currentUserId).length;
    const readCount = readGroupChatCounts[community.id];
    return Math.max(0, otherMessages - readCount);
  };

  // Helper to count unread private chat messages (owner checking a member's chat)
  const getUnreadPrivateCount = (communityId: string, memberId: string): number => {
    const key = `${communityId}-${memberId}`;
    if (!(key in readPrivateChatCounts)) return 0;
    const community = ownedCommunities.find(c => c.id === communityId);
    if (!community) return 0;
    const chat = community.privateChats.find(pc => pc.memberId === memberId);
    if (!chat) return 0;
    const otherMessages = chat.messages.filter(m => m.senderId !== currentUserId).length;
    return Math.max(0, otherMessages - readPrivateChatCounts[key]);
  };

  // Helper for member to count unread messages from coach (keyed by own uid)
  const getMemberUnreadPrivateCount = (communityId: string): number => {
    const key = `${communityId}-${currentUserId}`;
    if (!(key in readPrivateChatCounts)) return 0;
    const community = joinedCommunities.find(c => c.id === communityId);
    if (!community) return 0;
    const chat = community.privateChats.find(pc => pc.memberId === currentUserId);
    if (!chat) return 0;
    const otherMessages = chat.messages.filter(m => m.senderId !== currentUserId).length;
    return Math.max(0, otherMessages - readPrivateChatCounts[key]);
  };

  if (!fontsLoaded) return null;

  const handleOpenCommunity = (community: Community, isOwner: boolean) => {
    setSelectedCommunity(community);
    setIsOwnerView(isOwner);
    setViewMode('detail');
  };

  const handleBack = () => {
    if (viewMode === 'chat' || viewMode === 'share') {
      setViewMode('detail');
    } else if (viewMode === 'privateChat') {
      setViewMode('detail');
      setPrivateChatMember(null);
    } else if (viewMode === 'memberProgress') {
      setViewMode('detail');
      setProgressMember(null);
      setMemberJournalData(null);
    } else {
      setViewMode('list');
      setSelectedCommunity(null);
    }
  };

  const openPrivateChat = (member: Member) => {
    setPrivateChatMember(member);
    setViewMode('privateChat');
  };

  const handleCreateCommunity = async () => {
    if (newCommunityName.trim()) {
      await createCommunity(newCommunityName.trim(), newCommunityDesc.trim(), newCommunityColor);
      setNewCommunityName('');
      setNewCommunityDesc('');
      setNewCommunityColor(COMMUNITY_COLOR_SCHEMES[0].key);
      setShowCreateModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleJoinCommunity = async () => {
    const success = await joinCommunity(inviteCode.trim());
    if (success) {
      setInviteCode('');
      setShowJoinModal(false);
      setJoinError('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setJoinError('Invalid invite code or already joined');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleSendMessage = () => {
    if (chatMessage.trim() && selectedCommunity) {
      sendMessage(selectedCommunity.id, chatMessage.trim());
      setChatMessage('');
    }
  };

  const handleLongPressMessage = (senderId: string, senderName: string, messagePreview: string, chatType: 'group' | 'private') => {
    if (!selectedCommunity) return;
    setPendingAction({ senderId, senderName, messagePreview, communityId: selectedCommunity.id, communityName: selectedCommunity.name, chatType });
    setReportSent(false);
    setReportComment('');
    setShowMessageActions(true);
  };

  const handleReportMessage = async () => {
    if (!pendingAction) return;
    await reportContent({
      reportedUserId: pendingAction.senderId,
      reportedUserName: pendingAction.senderName,
      communityId: pendingAction.communityId,
      communityName: pendingAction.communityName,
      contentType: pendingAction.chatType === 'group' ? 'groupMessage' : 'privateMessage',
      contentPreview: pendingAction.messagePreview.slice(0, 300),
      ...(reportComment.trim() ? { reportComment: reportComment.trim() } : {}),
    });
    setReportSent(true);
  };

  const closeAllBlockModals = () => {
    setShowBlockConfirm(false);
    setShowMessageActions(false);
    setShowUserBlockConfirm(false);
    setShowUserActions(false);
  };

  const checkAndBlock = async (userId: string, userName: string, communityId: string, communityName: string) => {
    const ownedByTarget = joinedCommunities.filter(c => c.ownerId === userId);
    closeAllBlockModals();
    if (ownedByTarget.length > 0) {
      setOwnerBlockInfo({ userId, userName, communities: ownedByTarget });
      setShowOwnerBlockWarning(true);
      return;
    }
    await blockUser(userId, userName, communityId, communityName);
    // Automatically remove them from any communities the current user owns
    const ownedWithMember = ownedCommunities.filter(c => c.members.some(m => m.id === userId));
    for (const c of ownedWithMember) removeMember(c.id, userId);
  };

  const handleConfirmBlock = () => {
    if (!pendingAction) return;
    checkAndBlock(pendingAction.senderId, pendingAction.senderName, pendingAction.communityId, pendingAction.communityName);
  };

  const handleConfirmOwnerBlock = async () => {
    if (!ownerBlockInfo) return;
    const { userId, userName, communities } = ownerBlockInfo;
    await blockUser(userId, userName, communities[0].id, communities[0].name);
    for (const c of communities) {
      leaveCommunity(c.id);
    }
    setShowOwnerBlockWarning(false);
    setOwnerBlockInfo(null);
    setPendingAction(null);
    setPendingUserAction(null);
    setViewMode('list');
    setSelectedCommunity(null);
  };

  const handleTapMember = (userId: string, userName: string) => {
    if (!selectedCommunity || userId === currentUserId) return;
    setPendingUserAction({ userId, userName, communityId: selectedCommunity.id, communityName: selectedCommunity.name });
    setUserReportSent(false);
    setReportComment('');
    setShowUserActions(true);
  };

  const handleReportUser = async () => {
    if (!pendingUserAction) return;
    await reportContent({
      reportedUserId: pendingUserAction.userId,
      reportedUserName: pendingUserAction.userName,
      communityId: pendingUserAction.communityId,
      communityName: pendingUserAction.communityName,
      contentType: 'user',
      contentPreview: `User profile reported`,
      ...(reportComment.trim() ? { reportComment: reportComment.trim() } : {}),
    });
    const owned = joinedCommunities.filter(c => c.ownerId === pendingUserAction.userId);
    setReportedOwnerCommunities(owned);
    setUserReportSent(true);
  };

  const handleConfirmBlockUser = () => {
    if (!pendingUserAction) return;
    checkAndBlock(pendingUserAction.userId, pendingUserAction.userName, pendingUserAction.communityId, pendingUserAction.communityName);
  };

  const handleShareWorkout = () => {
    if (selectedProgramId && selectedCommunity) {
      const program = programs.find(p => p.id === selectedProgramId);
      if (program) {
        shareWorkout(selectedCommunity.id, {
          programId: program.id,
          programName: program.name,
          sharedBy: currentUserName,
          sharedWith: shareWith === 'everyone' ? 'everyone' : selectedMembers,
          color: program.color,
          splitDays: program.splitDays,
        });
        setSelectedProgramId(null);
        setShareWith('everyone');
        setSelectedMembers([]);
        setViewMode('detail');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // useEffect will sync selectedCommunity from the updated store
      }
    }
  };

  const handleShareWithCoach = () => {
    if (selectedProgramId && selectedCommunity) {
      const program = programs.find(p => p.id === selectedProgramId);
      if (program) {
        shareWithCoach(selectedCommunity.id, {
          programId: program.id,
          programName: program.name,
          sharedBy: currentUserName,
          color: program.color,
          splitDays: program.splitDays,
        });
        setSelectedProgramId(null);
        setViewMode('detail');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  };

  const openMemberProgress = async (member: Member) => {
    setProgressMember(member);
    setMemberJournalData(null);
    setMemberActiveProgramName(null);
    setMemberProgressLoading(true);
    setMemberProgressTab('stats');
    setViewMode('memberProgress');
    try {
      const [workoutSnap, programsSnap] = await Promise.all([
        getDoc(doc(db, 'users', member.id, 'data', 'workout')),
        getDoc(doc(db, 'users', member.id, 'data', 'programs')),
      ]);
      const journal: WorkoutJournalEntry[] = workoutSnap.exists() ? (workoutSnap.data().journal ?? []) : [];
      setMemberJournalData([...journal].sort((a, b) => b.date - a.date));
      if (programsSnap.exists()) {
        const { activeId, programs: memberPrograms } = programsSnap.data();
        const activeName = (memberPrograms ?? []).find((p: any) => p.id === activeId)?.name ?? null;
        setMemberActiveProgramName(activeName);
      }
    } catch (e) {
      console.error('[openMemberProgress] failed to read member workout data:', e);
      setMemberJournalData([]);
    }
    setMemberProgressLoading(false);
  };

  const handleEditAndReturn = async (communityId: string, workout: { id: string; programName: string; color: string; splitDays: any[]; sharedBy: string }) => {
    await AsyncStorage.setItem('@coachEditReturn', JSON.stringify({
      communityId,
      workoutId: workout.id,
      memberName: workout.sharedBy,
      programName: workout.programName,
      color: workout.color,
      splitDays: workout.splitDays,
    }));
    router.push('/create-program?mode=returnToMember');
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const getInitials = (name: string) =>
    name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').filter(Boolean).slice(0, 2).join('') || '?';

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const isSameDay = (a: Date, b: Date): boolean => {
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate();
  };

  const formatDateSeparator = (date: Date): string => {
    const d = new Date(date);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    const dayName = d.toLocaleDateString('en-AU', { weekday: 'long' });
    const month = d.toLocaleDateString('en-AU', { month: 'long' });
    const day = d.getDate();
    if (d.getFullYear() !== now.getFullYear()) return `${dayName}, ${day} ${month} ${d.getFullYear()}`;
    return `${dayName}, ${day} ${month}`;
  };

  // Render List View
  const renderListView = () => (
    <>
      <View style={styles.listHeaderActions}>
        <BounceButton style={[styles.headerBtn, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]} onPress={() => setShowJoinModal(true)}>
          <Ionicons name="enter-outline" size={22} color={colors.primaryText} />
        </BounceButton>
        <BounceButton style={[styles.headerBtn, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]} onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add" size={24} color={colors.primaryText} />
        </BounceButton>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : !user ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 }}>
          <Ionicons name="people-outline" size={52} color={colors.tertiaryText} />
          <Text style={{ color: colors.primaryText, fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>Sign in to access communities</Text>
          <Text style={{ color: colors.secondaryText, fontSize: 14, marginTop: 8, textAlign: 'center' }}>Create and join communities to share workouts and chat with others.</Text>
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.listScreenTitle}>Community</Text>
        {/* My Communities (Owner) */}
        {ownedCommunities.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>MY COMMUNITIES</Text>
            {ownedCommunities.map(community => {
              const scheme = getColorScheme(community.color);
              const pendingOwner = community.sharedWorkouts.filter(w => w.status === 'pending' && w.direction === 'toCoach').length;
              return (
                <BounceButton
                  key={community.id}
                  style={[styles.communityCard, { backgroundColor: 'transparent', overflow: 'hidden', borderColor: 'rgba(255,255,255,0.3)' }]}
                  onPress={() => handleOpenCommunity(community, true)}
                >
                  <LinearGradient
                    colors={scheme.colors as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {pendingOwner > 0 && (
                    <View style={[styles.pendingBadge, { position: 'absolute', top: 12, right: 12 }]}>
                      <Ionicons name="notifications" size={14} color="#fff" />
                    </View>
                  )}
                  <View style={styles.communityInfo}>
                    <Text style={[styles.communityName, { color: '#fff' }]}>{community.name}</Text>
                  </View>
                  {community.description && (
                    <Text style={[styles.communityDesc, { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={2}>{community.description}</Text>
                  )}
                </BounceButton>
              );
            })}
          </>
        )}

        {/* Joined Communities */}
        {joinedCommunities.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }, ownedCommunities.length > 0 && { marginTop: 24 }]}>
              JOINED COMMUNITIES
            </Text>
            {joinedCommunities.map(community => {
              const pendingWorkouts = community.sharedWorkouts.filter(w =>
                w.status === 'pending' &&
                w.direction !== 'toCoach' &&
                (w.direction !== 'returnedToMember' || w.recipientMemberId === currentUserId)
              ).length;
              const scheme = getColorScheme(community.color);
              return (
                <BounceButton
                  key={community.id}
                  style={[styles.communityCard, { backgroundColor: 'transparent', overflow: 'hidden', borderColor: 'rgba(255,255,255,0.3)' }]}
                  onPress={() => handleOpenCommunity(community, false)}
                >
                  <LinearGradient
                    colors={scheme.colors as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {pendingWorkouts > 0 && (
                    <View style={[styles.pendingBadge, { position: 'absolute', top: 12, right: 12 }]}>
                      <Ionicons name="notifications" size={14} color="#fff" />
                    </View>
                  )}
                  <View style={styles.communityInfo}>
                    <Text style={[styles.communityName, { color: '#fff' }]}>{community.name}</Text>
                    <Text style={[styles.communityMeta, { color: 'rgba(255,255,255,0.75)' }]}>
                      by {community.ownerName}
                    </Text>
                  </View>
                  {community.description && (
                    <Text style={[styles.communityDesc, { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={2}>{community.description}</Text>
                  )}
                </BounceButton>
              );
            })}
          </>
        )}

        {/* Empty State */}
        {ownedCommunities.length === 0 && joinedCommunities.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={colors.secondaryText} />
            <Text style={[styles.emptyStateTitle, { color: colors.primaryText }]}>No Communities Yet</Text>
            <Text style={[styles.emptyStateText, { color: colors.secondaryText }]}>
              Create a community to coach clients or join one with an invite code
            </Text>
            <View style={styles.emptyActions}>
              <BounceButton style={styles.emptyActionBtn} onPress={() => setShowCreateModal(true)}>
                <Text style={styles.emptyActionBtnText}>Create Community</Text>
              </BounceButton>
              <BounceButton style={[styles.emptyActionBtn, styles.emptyActionBtnSecondary, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]} onPress={() => setShowJoinModal(true)}>
                <Text style={[styles.emptyActionBtnText, { color: colors.primaryText }]}>Join Community</Text>
              </BounceButton>
            </View>
          </View>
        )}
      </ScrollView>
      )}
    </>
  );

  // Render Detail View
  const renderDetailView = () => {
    if (!selectedCommunity) return null;

    const pendingWorkouts = selectedCommunity.sharedWorkouts.filter(w =>
      w.status === 'pending' && w.direction !== 'toCoach' &&
      (w.direction !== 'returnedToMember' || w.recipientMemberId === currentUserId)
    );
    const acceptedWorkouts = selectedCommunity.sharedWorkouts.filter(w =>
      w.status === 'accepted' &&
      w.direction !== 'toCoach' &&
      !(w.removedByMemberIds?.includes(currentUserId))
    );
    const scheme = getColorScheme(selectedCommunity.color);
    const communityAccent = scheme.gradStart;

    return (
      <>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: Platform.OS === 'ios' ? 112 : 92 }]} showsVerticalScrollIndicator={false}>
          {/* Hero Banner */}
          <LinearGradient
            colors={scheme.colors as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroBanner}
          >
            <View style={[styles.heroBannerContent, { alignItems: 'flex-start', paddingTop: 16, paddingBottom: 16 }]}>
              <Text style={styles.heroBannerName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{selectedCommunity.name}</Text>
              {selectedCommunity.description ? (
                <Text style={[styles.heroBannerDesc, { textAlign: 'left', marginTop: 6 }]} numberOfLines={4}>{selectedCommunity.description}</Text>
              ) : null}
              {!isOwnerView && (
                <Text style={styles.heroBannerMeta}>by {selectedCommunity.ownerName ?? 'Coach'}</Text>
              )}
            </View>
          </LinearGradient>

          {/* Group Chat Button (Owner View) */}
          {isOwnerView && (() => {
            const unreadGroup = getUnreadGroupCount(selectedCommunity);
            return (
              <BounceButton
                style={[styles.groupChatBtn, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}
                onPress={() => {
                  const allMsgs = selectedCommunity.chatMessages;
                  const currentReadCount = readGroupChatCounts[selectedCommunity.id] || 0;
                  const otherMsgsAll = allMsgs.filter(m => m.senderId !== currentUserId);
                  const unreadCnt = Math.max(0, otherMsgsAll.length - currentReadCount);
                  let firstIdx: number | null = null;
                  if (unreadCnt > 0) {
                    const firstUnreadMsg = otherMsgsAll[currentReadCount];
                    const idx = allMsgs.indexOf(firstUnreadMsg);
                    firstIdx = idx > 0 ? idx : null;
                  }
                  setGroupFirstUnreadIdx(firstIdx);
                  chatMsgCountRef.current = -1;
                  setReadGroupChatCounts(prev => ({ ...prev, [selectedCommunity.id]: otherMsgsAll.length }));
                  setViewMode('chat');
                }}
              >
                <View style={styles.groupChatBtnIcon}>
                  <Ionicons name="chatbubbles" size={22} color="#47DDFF" />
                  {unreadGroup > 0 && (
                    <View style={styles.chatNotifBadge}>
                      <Text style={styles.chatNotifBadgeText}>{unreadGroup > 9 ? '9+' : unreadGroup}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.groupChatBtnTextContainer}>
                  <Text style={[styles.groupChatBtnTitle, { color: colors.primaryText }]}>Group Chat</Text>
                  <Text style={[styles.groupChatBtnSubtitle, { color: colors.secondaryText }]}>Message all members</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
              </BounceButton>
            );
          })()}

          {/* Chat with Coach (Member View) - Private chat with owner */}
          {!isOwnerView && (() => {
            const unreadCoach = getMemberUnreadPrivateCount(selectedCommunity.id);
            return (
              <BounceButton
                style={[styles.groupChatBtn, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}
                onPress={() => {
                  const owner = selectedCommunity.members.find(m => m.role === 'owner');
                  if (owner) {
                    const key = `${selectedCommunity.id}-${currentUserId}`;
                    const chat = selectedCommunity.privateChats.find(pc => pc.memberId === currentUserId);
                    const allMsgs = chat?.messages || [];
                    const currentReadCount = readPrivateChatCounts[key] || 0;
                    const otherMsgsAll = allMsgs.filter(m => m.senderId !== currentUserId);
                    const unreadCnt = Math.max(0, otherMsgsAll.length - currentReadCount);
                    let firstIdx: number | null = null;
                    if (unreadCnt > 0) {
                      const firstUnreadMsg = otherMsgsAll[currentReadCount];
                      const idx = allMsgs.indexOf(firstUnreadMsg);
                      firstIdx = idx > 0 ? idx : null;
                    }
                    setPrivateFirstUnreadIdx(firstIdx);
                    privateMsgCountRef.current = -1;
                    setReadPrivateChatCounts(prev => ({ ...prev, [key]: otherMsgsAll.length }));
                    setPrivateChatMember(owner);
                    setViewMode('privateChat');
                  }
                }}
              >
                <View style={styles.groupChatBtnIcon}>
                  <Ionicons name="chatbubble" size={22} color={communityAccent} />
                  {unreadCoach > 0 && (
                    <View style={styles.chatNotifBadge}>
                      <Text style={styles.chatNotifBadgeText}>{unreadCoach > 9 ? '9+' : unreadCoach}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.groupChatBtnTextContainer}>
                  <Text style={[styles.groupChatBtnTitle, { color: colors.primaryText }]}>Chat with Coach</Text>
                  <Text style={[styles.groupChatBtnSubtitle, { color: colors.secondaryText }]}>Private message</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
              </BounceButton>
            );
          })()}

          {/* Group Chat Button (Member View) */}
          {!isOwnerView && (() => {
            const unreadGroup = getUnreadGroupCount(selectedCommunity);
            return (
              <BounceButton
                style={[styles.groupChatBtn, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}
                onPress={() => {
                  const allMsgs = selectedCommunity.chatMessages;
                  const currentReadCount = readGroupChatCounts[selectedCommunity.id] || 0;
                  const otherMsgsAll = allMsgs.filter(m => m.senderId !== currentUserId);
                  const unreadCnt = Math.max(0, otherMsgsAll.length - currentReadCount);
                  let firstIdx: number | null = null;
                  if (unreadCnt > 0) {
                    const firstUnreadMsg = otherMsgsAll[currentReadCount];
                    const idx = allMsgs.indexOf(firstUnreadMsg);
                    firstIdx = idx > 0 ? idx : null;
                  }
                  setGroupFirstUnreadIdx(firstIdx);
                  chatMsgCountRef.current = -1;
                  setReadGroupChatCounts(prev => ({ ...prev, [selectedCommunity.id]: otherMsgsAll.length }));
                  setViewMode('chat');
                }}
              >
                <View style={styles.groupChatBtnIcon}>
                  <Ionicons name="chatbubbles" size={22} color="#47DDFF" />
                  {unreadGroup > 0 && (
                    <View style={styles.chatNotifBadge}>
                      <Text style={styles.chatNotifBadgeText}>{unreadGroup > 9 ? '9+' : unreadGroup}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.groupChatBtnTextContainer}>
                  <Text style={[styles.groupChatBtnTitle, { color: colors.primaryText }]}>Group Chat</Text>
                  <Text style={[styles.groupChatBtnSubtitle, { color: colors.secondaryText }]}>{selectedCommunity.name}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
              </BounceButton>
            );
          })()}

          {/* Pending Workouts (for members) */}
          {!isOwnerView && pendingWorkouts.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>PENDING PROGRAMS</Text>
              {pendingWorkouts.map(workout => (
                <View key={workout.id} style={[styles.workoutCard, { backgroundColor: `${workout.color}12`, borderColor: workout.color }]}>
                  <View style={[styles.workoutColorIcon, { backgroundColor: `${workout.color}40` }]}>
                    <Ionicons name="barbell" size={20} color={colors.primaryText} />
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={[styles.workoutName, { color: colors.primaryText }]}>{workout.programName}</Text>
                    <Text style={[styles.workoutMeta, { color: colors.secondaryText }]}>
                      {workout.direction === 'returnedToMember'
                        ? `Returned from ${workout.returnedBy ?? 'Coach'}`
                        : `from ${workout.sharedBy}`} · {workout.splitDays.length} day split
                    </Text>
                  </View>
                  <View style={styles.workoutActions}>
                    <BounceButton
                      style={styles.acceptBtn}
                      onPress={() => {
                        acceptWorkout(selectedCommunity.id, workout.id);
                        if (workout.direction === 'returnedToMember') {
                          addProgram(workout.programName, workout.color, workout.splitDays);
                        } else {
                          addSharedProgram({
                            id: workout.id,
                            name: workout.programName,
                            color: workout.color,
                            splitDays: workout.splitDays,
                            sharedBy: workout.sharedBy,
                          });
                        }
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }}
                    >
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    </BounceButton>
                    <BounceButton
                      style={styles.declineBtn}
                      onPress={() => {
                        declineWorkout(selectedCommunity.id, workout.id);
                      }}
                    >
                      <Ionicons name="close" size={20} color="#e74c3c" />
                    </BounceButton>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Share Program Button (Owner View) */}
          {isOwnerView && (
            <BounceButton
              style={[styles.groupChatBtn, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder, marginTop: 8 }]}
              onPress={() => setViewMode('share')}
            >
              <View style={styles.groupChatBtnIcon}>
                <Ionicons name="share" size={22} color="#34D399" />
              </View>
              <View style={styles.groupChatBtnTextContainer}>
                <Text style={[styles.groupChatBtnTitle, { color: colors.primaryText }]}>Share Program</Text>
                <Text style={[styles.groupChatBtnSubtitle, { color: colors.secondaryText }]}>Send a workout to your community</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </BounceButton>
          )}

          {/* Share with Coach Button (Member View) */}
          {!isOwnerView && (
            <BounceButton
              style={[styles.groupChatBtn, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}
              onPress={() => setViewMode('share')}
            >
              <View style={styles.groupChatBtnIcon}>
                <Ionicons name="share" size={22} color="#34D399" />
              </View>
              <View style={styles.groupChatBtnTextContainer}>
                <Text style={[styles.groupChatBtnTitle, { color: colors.primaryText }]}>Share with Coach</Text>
                <Text style={[styles.groupChatBtnSubtitle, { color: colors.secondaryText }]}>Show your coach a program</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </BounceButton>
          )}

          {/* Shared Programs (owner: programs they shared to members) */}
          {isOwnerView && selectedCommunity.sharedWorkouts.filter(w => w.direction === 'toMembers' || !w.direction).length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24, marginBottom: 0 }]}>SHARED PROGRAMS</Text>
                <TouchableOpacity
                  style={styles.sectionMenuBtn}
                  onPress={() => setShowManageProgramsModal(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={colors.secondaryText} />
                </TouchableOpacity>
              </View>
              {selectedCommunity.sharedWorkouts.filter(w => w.direction === 'toMembers' || !w.direction).map(workout => (
                <View key={workout.id} style={[styles.workoutCard, { backgroundColor: `${workout.color}12`, borderColor: workout.color }]}>
                  <View style={[styles.workoutColorIcon, { backgroundColor: `${workout.color}40` }]}>
                    <Ionicons name="barbell" size={20} color={colors.primaryText} />
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={[styles.workoutName, { color: colors.primaryText }]}>{workout.programName}</Text>
                    <Text style={[styles.workoutMeta, { color: colors.secondaryText }]}>
                      {workout.splitDays.length} day split · Shared {formatDate(workout.sharedAt)}
                    </Text>
                    <Text style={[styles.workoutSharedWith, { color: colors.secondaryText }]}>
                      {workout.sharedWith === 'everyone'
                        ? 'Shared with everyone'
                        : (() => {
                            const ids = workout.sharedWith as string[];
                            const names = ids.map(id => selectedCommunity.members.find(m => m.id === id)?.name ?? 'Unknown');
                            const shown = names.slice(0, 2);
                            const extra = names.length - 2;
                            return `Shared with ${shown.join(', ')}${extra > 0 ? ` +${extra} more` : ''}`;
                          })()}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* From Members (owner: programs members shared with coach) */}
          {isOwnerView && selectedCommunity.sharedWorkouts.filter(w => w.direction === 'toCoach').length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>FROM MEMBERS</Text>
              {selectedCommunity.sharedWorkouts.filter(w => w.direction === 'toCoach').map(workout => (
                <View key={workout.id} style={[styles.workoutCard, { backgroundColor: `${workout.color}12`, borderColor: workout.color }]}>
                  <View style={[styles.workoutColorIcon, { backgroundColor: `${workout.color}40` }]}>
                    <Ionicons name="barbell" size={20} color={colors.primaryText} />
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={[styles.workoutName, { color: colors.primaryText }]}>{workout.programName}</Text>
                    <Text style={[styles.workoutMeta, { color: colors.secondaryText }]}>
                      from {workout.sharedBy} · {workout.splitDays.length} day split
                    </Text>
                  </View>
                  <View style={styles.workoutActions}>
                    <BounceButton
                      style={[styles.declineBtn, { backgroundColor: `${workout.color}1A`, borderColor: workout.color }]}
                      onPress={() => handleEditAndReturn(selectedCommunity.id, workout)}
                    >
                      <Ionicons name="create-outline" size={18} color={workout.color} />
                    </BounceButton>
                    <BounceButton
                      style={styles.declineBtn}
                      onPress={() => {
                        respondToMemberShare(selectedCommunity.id, workout.id, false);
                      }}
                    >
                      <Ionicons name="close" size={20} color="#e74c3c" />
                    </BounceButton>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Your Programs (member: programs coach shared with them) */}
          {!isOwnerView && acceptedWorkouts.filter(w => w.direction !== 'toCoach').length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>YOUR PROGRAMS</Text>
              {acceptedWorkouts.filter(w => w.direction !== 'toCoach').map(workout => {
                const alreadySaved = programs.some(p => p.name === workout.programName && !p.archived);
                const isPrivateShare = Array.isArray(workout.sharedWith);
                const isExpanded = expandedSharedWorkoutId === workout.id;
                const isConfirming = confirmRemoveWorkoutId === workout.id;
                return (
                  <TouchableOpacity
                    key={workout.id}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (isExpanded) {
                        setExpandedSharedWorkoutId(null);
                        setConfirmRemoveWorkoutId(null);
                      } else {
                        setExpandedSharedWorkoutId(workout.id);
                        setConfirmRemoveWorkoutId(null);
                      }
                    }}
                    style={[styles.workoutCard, { backgroundColor: `${workout.color}12`, borderColor: workout.color }]}
                  >
                    <View style={[styles.workoutColorIcon, { backgroundColor: `${workout.color}40` }]}>
                      <Ionicons name="barbell" size={20} color={colors.primaryText} />
                    </View>
                    <View style={styles.workoutInfo}>
                      <Text style={[styles.workoutName, { color: colors.primaryText }]}>{workout.programName}</Text>
                      <Text style={[styles.workoutMeta, { color: colors.secondaryText }]}>
                        {workout.splitDays.length} day split · Shared {formatDate(workout.sharedAt)}
                      </Text>
                      {isExpanded && (
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, alignSelf: 'flex-start' }}>
                          {!alreadySaved && (
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#34D399' }}
                              onPress={() => {
                                addProgram(workout.programName, workout.color, workout.splitDays);
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                setExpandedSharedWorkoutId(null);
                              }}
                            >
                              <Ionicons name="add" size={13} color="#fff" />
                              <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Arimo_700Bold' }}>Add</Text>
                            </TouchableOpacity>
                          )}
                          {isConfirming ? (
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#e74c3c' }}
                              onPress={() => {
                                if (isPrivateShare) {
                                  removeSharedWorkout(selectedCommunity.id, workout.id);
                                } else {
                                  dismissSharedWorkout(selectedCommunity.id, workout.id);
                                }
                                setExpandedSharedWorkoutId(null);
                                setConfirmRemoveWorkoutId(null);
                              }}
                            >
                              <Ionicons name="checkmark" size={13} color="#fff" />
                              <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Arimo_700Bold' }}>Confirm</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(231,76,60,0.12)', borderWidth: 1, borderColor: 'rgba(231,76,60,0.3)' }}
                              onPress={() => setConfirmRemoveWorkoutId(workout.id)}
                            >
                              <Ionicons name="trash-outline" size={13} color="#e74c3c" />
                              <Text style={{ color: '#e74c3c', fontSize: 12, fontFamily: 'Arimo_700Bold' }}>Remove</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                    {alreadySaved ? (
                      <Ionicons name="checkmark-circle" size={22} color="#34D399" />
                    ) : (
                      <Ionicons name="add-circle-outline" size={22} color={workout.color} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {/* Shared with Coach (member: programs they sent to coach) */}
          {!isOwnerView && selectedCommunity.sharedWorkouts.filter(w => w.direction === 'toCoach' && w.recipientMemberId === currentUserId).length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>SHARED WITH COACH</Text>
              {selectedCommunity.sharedWorkouts.filter(w => w.direction === 'toCoach' && w.recipientMemberId === currentUserId).map(workout => {
                const isExpanded = expandedSharedWorkoutId === workout.id;
                const isConfirming = confirmRemoveWorkoutId === workout.id;
                return (
                  <TouchableOpacity
                    key={workout.id}
                    activeOpacity={0.85}
                    onPress={() => {
                      setExpandedSharedWorkoutId(isExpanded ? null : workout.id);
                      setConfirmRemoveWorkoutId(null);
                    }}
                    style={[styles.workoutCard, { backgroundColor: `${workout.color}12`, borderColor: workout.color }]}
                  >
                    <View style={[styles.workoutColorIcon, { backgroundColor: `${workout.color}40` }]}>
                      <Ionicons name="barbell" size={20} color={colors.primaryText} />
                    </View>
                    <View style={styles.workoutInfo}>
                      <Text style={[styles.workoutName, { color: colors.primaryText }]}>{workout.programName}</Text>
                      <Text style={[styles.workoutMeta, { color: colors.secondaryText }]}>
                        {workout.splitDays.length} day split · {workout.status === 'pending' ? 'Pending' : workout.status === 'accepted' ? 'Seen' : 'Declined'}
                      </Text>
                      {isExpanded && (
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, alignSelf: 'flex-start' }}>
                          {isConfirming ? (
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#e74c3c' }}
                              onPress={() => {
                                removeSharedWorkout(selectedCommunity.id, workout.id);
                                setExpandedSharedWorkoutId(null);
                                setConfirmRemoveWorkoutId(null);
                              }}
                            >
                              <Ionicons name="checkmark" size={13} color="#fff" />
                              <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Arimo_700Bold' }}>Confirm</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(231,76,60,0.12)', borderWidth: 1, borderColor: 'rgba(231,76,60,0.3)' }}
                              onPress={() => setConfirmRemoveWorkoutId(workout.id)}
                            >
                              <Ionicons name="trash-outline" size={13} color="#e74c3c" />
                              <Text style={{ color: '#e74c3c', fontSize: 12, fontFamily: 'Arimo_700Bold' }}>Remove</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                    <View style={styles.workoutActions}>
                      {workout.status === 'pending' && (
                        <Ionicons name="time-outline" size={20} color={colors.tertiaryText} />
                      )}
                      {workout.status === 'accepted' && (
                        <Ionicons name="checkmark-circle" size={22} color="#34D399" />
                      )}
                      {workout.status === 'declined' && (
                        <Ionicons name="close-circle" size={22} color="#e74c3c" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {/* Members List */}
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24, marginBottom: 0 }]}>MEMBERS · {selectedCommunity.members.filter(m => !blockedUserIds.includes(m.id)).length}</Text>
              {isOwnerView && selectedCommunity.members.filter(m => m.role !== 'owner').length > 0 && (
                <TouchableOpacity
                  style={styles.sectionMenuBtn}
                  onPress={() => setShowManageMembersModal(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={colors.secondaryText} />
                </TouchableOpacity>
              )}
            </View>
            {selectedCommunity.members.filter(m => !blockedUserIds.includes(m.id)).map(member => (
              <TouchableOpacity
                key={member.id}
                activeOpacity={member.id === currentUserId ? 1 : 0.7}
                onPress={() => handleTapMember(member.id, member.name)}
              >
                <View style={[styles.memberCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
                  <View style={[styles.memberAvatar, { backgroundColor: getMemberColor(member.id) }]}>
                    <Text style={styles.memberAvatarText}>
                      {getInitials(member.name)}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: colors.primaryText }]}>{member.name}</Text>
                    <Text style={[styles.memberJoined, { color: colors.secondaryText }]}>
                      {member.role === 'owner' ? 'Owner' : `Joined ${formatDate(member.joinedAt)}`}
                    </Text>
                  </View>
                  {isOwnerView && member.role !== 'owner' && (() => {
                    const unreadPM = getUnreadPrivateCount(selectedCommunity.id, member.id);
                    return (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <BounceButton
                          style={styles.memberProgressBtn}
                          onPress={() => openMemberProgress(member)}
                        >
                          <Ionicons name="stats-chart" size={16} color="#34D399" />
                        </BounceButton>
                        <BounceButton
                          style={styles.memberChatBtn}
                          onPress={() => {
                            const chat = selectedCommunity.privateChats.find(pc => pc.memberId === member.id);
                            const allMsgs = chat?.messages || [];
                            const key = `${selectedCommunity.id}-${member.id}`;
                            const currentReadCount = readPrivateChatCounts[key] || 0;
                            const otherMsgsAll = allMsgs.filter(m => m.senderId !== currentUserId);
                            const unreadCnt = Math.max(0, otherMsgsAll.length - currentReadCount);
                            let firstIdx: number | null = null;
                            if (unreadCnt > 0) {
                              const firstUnreadMsg = otherMsgsAll[currentReadCount];
                              const idx = allMsgs.indexOf(firstUnreadMsg);
                              firstIdx = idx > 0 ? idx : null;
                            }
                            setPrivateFirstUnreadIdx(firstIdx);
                            privateMsgCountRef.current = -1;
                            setReadPrivateChatCounts(prev => ({ ...prev, [key]: otherMsgsAll.length }));
                            openPrivateChat(member);
                          }}
                        >
                          <Ionicons name="chatbubble-outline" size={18} color="#47DDFF" />
                          {unreadPM > 0 && (
                            <View style={styles.chatNotifBadge}>
                              <Text style={styles.chatNotifBadgeText}>{unreadPM > 9 ? '9+' : unreadPM}</Text>
                            </View>
                          )}
                        </BounceButton>
                      </View>
                    );
                  })()}
                </View>
              </TouchableOpacity>
            ))}
          </>

          {/* Invite Section (Owner only) */}
          {isOwnerView && (
            <View style={styles.inviteSection}>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>INVITE MEMBERS</Text>
              <View style={[styles.inviteCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
                <View style={[styles.inviteIconContainer, { backgroundColor: colors.cardSolid }]}>
                  <Ionicons name="person-add-outline" size={24} color={communityAccent} />
                </View>
                <View style={styles.inviteTextContainer}>
                  <Text style={[styles.inviteTitle, { color: colors.primaryText }]}>Share your invite code</Text>
                  <Text style={[styles.inviteSubtitle, { color: colors.secondaryText }]}>Code: {selectedCommunity.inviteCode}</Text>
                </View>
                <BounceButton
                  style={[styles.copyButton, { backgroundColor: copiedCode ? '#34D399' : communityAccent }]}
                  onPress={async () => {
                    await Clipboard.setStringAsync(selectedCommunity.inviteCode);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                >
                  <Ionicons name={copiedCode ? 'checkmark' : 'copy-outline'} size={18} color="#fff" />
                </BounceButton>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Floating top nav — rendered after ScrollView so it sits on top */}
        <View style={styles.heroBannerTopRow} pointerEvents="box-none">
          <TouchableOpacity style={[styles.heroBannerBtn, { backgroundColor: colors.backButtonBg }]} onPress={handleBack}>
            <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.heroBannerBtn, { backgroundColor: colors.backButtonBg }]}
            onPress={() => setShowOptionsMenu(true)}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={colors.primaryText} />
          </TouchableOpacity>
        </View>

      </>
    );
  };

  // Render Chat View
  const renderChatView = () => {
    if (!selectedCommunity) return null;

    // Get fresh messages
    const currentCommunity = isOwnerView
      ? ownedCommunities.find(c => c.id === selectedCommunity.id)
      : joinedCommunities.find(c => c.id === selectedCommunity.id);
    const messages = (currentCommunity?.chatMessages || []).filter(m => !blockedUserIds.includes(m.senderId));

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.groupChatHeader}>
          <TouchableOpacity style={[styles.heroBannerBtn, { backgroundColor: colors.backButtonBg }]} onPress={handleBack}>
            <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
          </TouchableOpacity>
          <View style={styles.groupChatHeaderInfo}>
            <Text style={[styles.groupChatHeaderName, { color: colors.primaryText }]}>
              Group Chat
            </Text>
            <Text style={[styles.groupChatHeaderSubtitle, { color: colors.secondaryText }]}>{selectedCommunity.name}</Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <FlatList
          ref={chatFlatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatContent}
          inverted={false}
          onLayout={() => {
            if (chatMsgCountRef.current === -1) {
              chatMsgCountRef.current = messages.length;
              if (groupFirstUnreadIdx !== null) {
                chatFlatListRef.current?.scrollToIndex({ index: groupFirstUnreadIdx, animated: false, viewPosition: 0 });
              } else {
                chatFlatListRef.current?.scrollToEnd({ animated: false });
              }
            }
          }}
          onContentSizeChange={() => {
            if (chatMsgCountRef.current === -1) {
              // onContentSizeChange fired before onLayout — handle initial scroll here
              chatMsgCountRef.current = messages.length;
              if (groupFirstUnreadIdx !== null) {
                chatFlatListRef.current?.scrollToIndex({ index: groupFirstUnreadIdx, animated: false, viewPosition: 0 });
              } else {
                chatFlatListRef.current?.scrollToEnd({ animated: false });
              }
            } else if (messages.length > chatMsgCountRef.current) {
              // A new message arrived while chat is open
              chatMsgCountRef.current = messages.length;
              chatFlatListRef.current?.scrollToEnd({ animated: true });
            }
            // Otherwise FlatList batch render — do nothing
          }}
          onScrollToIndexFailed={({ averageItemLength }) => {
            chatFlatListRef.current?.scrollToOffset({ offset: (groupFirstUnreadIdx ?? 0) * averageItemLength, animated: false });
          }}
          onEndReached={() => setGroupFirstUnreadIdx(null)}
          onEndReachedThreshold={0.2}
          renderItem={({ item, index }) => {
            const isMe = item.senderId === currentUserId;
            const prevMsg = messages[index - 1];
            const showDateSep = !prevMsg || !isSameDay(prevMsg.timestamp, item.timestamp);
            const showNewMsgDivider = groupFirstUnreadIdx !== null && index === groupFirstUnreadIdx;
            return (
              <>
                {showNewMsgDivider && (
                  <View style={styles.newMessagesDivider}>
                    <View style={[styles.newMessagesDividerLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.newMessagesDividerText, { color: colors.secondaryText }]}>New Messages</Text>
                    <View style={[styles.newMessagesDividerLine, { backgroundColor: colors.border }]} />
                  </View>
                )}
                {showDateSep && (
                  <View style={styles.dateSeparator}>
                    <Text style={[styles.dateSeparatorText, { color: colors.border }]}>{formatDateSeparator(item.timestamp)}</Text>
                  </View>
                )}
                <TouchableOpacity
                  activeOpacity={1}
                  onLongPress={!isMe ? () => handleLongPressMessage(item.senderId, item.senderName, item.message, 'group') : undefined}
                  delayLongPress={400}
                >
                  <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
                    {!isMe && (
                      <TouchableOpacity onPress={() => handleTapMember(item.senderId, item.senderName)} activeOpacity={0.7}>
                        <View style={[styles.messageAvatar, { backgroundColor: getMemberColor(item.senderId) }]}>
                          <Text style={styles.messageAvatarText}>
                            {getInitials(item.senderName)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : [styles.messageBubbleOther, { backgroundColor: colors.cardSolid }]]}>
                      {!isMe && (
                        <TouchableOpacity onPress={() => handleTapMember(item.senderId, item.senderName)} activeOpacity={0.7}>
                          <Text style={[styles.messageSender, { color: colors.secondaryText }]}>{item.senderName}</Text>
                        </TouchableOpacity>
                      )}
                      <Text style={[styles.messageText, { color: colors.primaryText }, isMe && styles.messageTextMe]}>{item.message}</Text>
                      <Text style={[styles.messageTime, { color: colors.secondaryText }, isMe && styles.messageTimeMe]}>
                        {formatTime(item.timestamp)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </>
            );
          }}
        />

        <View style={[styles.chatInputContainer, { backgroundColor: colors.cardSolid, borderTopColor: colors.border, marginBottom: chatKeyboardHeight > 0 ? chatKeyboardHeight : (Platform.OS === 'ios' ? 100 : 85) }]}>
          <TextInput
            style={[styles.chatInput, { backgroundColor: colors.inputBg, color: colors.primaryText }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.tertiaryText}
            value={chatMessage}
            onChangeText={setChatMessage}
            returnKeyType="send"
            onSubmitEditing={handleSendMessage}
          />
        </View>
      </View>
    );
  };

  // Render Share Workout View
  const renderShareView = () => {
    if (!selectedCommunity) return null;

    const communityAccent = getColorScheme(selectedCommunity.color).gradStart;
    const otherMembers = selectedCommunity.members.filter(m => m.id !== currentUserId);
    const coach = selectedCommunity.members.find(m => m.role === 'owner');

    return (
      <>
        <View style={styles.header}>
          <TouchableOpacity style={[styles.heroBannerBtn, { backgroundColor: colors.backButtonBg }]} onPress={handleBack}>
            <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.primaryText }]}>
            {isOwnerView ? 'Share Program' : 'Share with Coach'}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Select Program */}
          <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>SELECT PROGRAM</Text>
          {programs.length === 0 ? (
            <View style={styles.emptyPrograms}>
              <Text style={[styles.emptyProgramsText, { color: colors.secondaryText }]}>No programs to share. Create one first!</Text>
            </View>
          ) : (
            programs.map(program => (
              <BounceButton
                key={program.id}
                style={[
                  styles.selectableCard,
                  { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
                  selectedProgramId === program.id && { borderColor: program.color, borderWidth: 2 }
                ]}
                onPress={() => setSelectedProgramId(program.id)}
              >
                <View style={[styles.programColorDot, { backgroundColor: program.color }]} />
                <View style={styles.selectableCardInfo}>
                  <Text style={[styles.selectableCardTitle, { color: colors.primaryText }]}>{program.name}</Text>
                  <Text style={[styles.selectableCardMeta, { color: colors.secondaryText }]}>
                    {program.splitDays.filter(d => d.type === 'training').length} training days
                  </Text>
                </View>
                {selectedProgramId === program.id && (
                  <Ionicons name="checkmark-circle" size={24} color={program.color} />
                )}
              </BounceButton>
            ))
          )}

          {/* Share With (Owner only) */}
          {isOwnerView && selectedProgramId && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>SHARE WITH</Text>
              <BounceButton
                style={[
                  styles.selectableCard,
                  { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
                  shareWith === 'everyone' && { borderColor: communityAccent, borderWidth: 2 }
                ]}
                onPress={() => {
                  setShareWith('everyone');
                  setSelectedMembers([]);
                }}
              >
                <View style={[styles.shareIcon, { backgroundColor: `${communityAccent}20` }]}>
                  <Ionicons name="people" size={20} color={communityAccent} />
                </View>
                <View style={styles.selectableCardInfo}>
                  <Text style={[styles.selectableCardTitle, { color: colors.primaryText }]}>Everyone</Text>
                  <Text style={[styles.selectableCardMeta, { color: colors.secondaryText }]}>All {otherMembers.length} members</Text>
                </View>
                {shareWith === 'everyone' && (
                  <Ionicons name="checkmark-circle" size={24} color={communityAccent} />
                )}
              </BounceButton>

              <BounceButton
                style={[
                  styles.selectableCard,
                  { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
                  shareWith !== 'everyone' && { borderColor: communityAccent, borderWidth: 2 }
                ]}
                onPress={() => setShareWith([])}
              >
                <View style={[styles.shareIcon, { backgroundColor: `${communityAccent}20` }]}>
                  <Ionicons name="person" size={20} color={communityAccent} />
                </View>
                <View style={styles.selectableCardInfo}>
                  <Text style={[styles.selectableCardTitle, { color: colors.primaryText }]}>Select Members</Text>
                  <Text style={[styles.selectableCardMeta, { color: colors.secondaryText }]}>
                    {selectedMembers.length > 0 ? `${selectedMembers.length} selected` : 'Choose specific members'}
                  </Text>
                </View>
                {shareWith !== 'everyone' && (
                  <Ionicons name="checkmark-circle" size={24} color={communityAccent} />
                )}
              </BounceButton>

              {/* Member Selection */}
              {shareWith !== 'everyone' && (
                <View style={styles.memberSelection}>
                  {otherMembers.map(member => (
                    <BounceButton
                      key={member.id}
                      style={[
                        styles.memberSelectCard,
                        { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff40' },
                        selectedMembers.includes(member.id) && { backgroundColor: `${communityAccent}15` }
                      ]}
                      onPress={() => toggleMemberSelection(member.id)}
                    >
                      <View style={[styles.memberSelectAvatar, { backgroundColor: getMemberColor(member.id) }]}>
                        <Text style={styles.memberSelectAvatarText}>
                          {getInitials(member.name)}
                        </Text>
                      </View>
                      <Text style={[styles.memberSelectName, { color: colors.primaryText }]}>{member.name}</Text>
                      {selectedMembers.includes(member.id) && (
                        <Ionicons name="checkmark-circle" size={20} color={communityAccent} />
                      )}
                    </BounceButton>
                  ))}
                </View>
              )}

              {/* Share Button (Owner) */}
              <BounceButton
                style={[styles.shareButton, { backgroundColor: communityAccent }]}
                onPress={handleShareWorkout}
                disabled={shareWith !== 'everyone' && selectedMembers.length === 0}
              >
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={styles.shareButtonText}>Share Program</Text>
              </BounceButton>
            </>
          )}

          {/* Share Button (Member - simplified, goes directly to coach) */}
          {!isOwnerView && selectedProgramId && (
            <>
              {coach && (
                <View style={[styles.shareCoachInfo, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
                  <View style={[styles.memberAvatar, { backgroundColor: getMemberColor(coach.id), width: 36, height: 36, borderRadius: 18 }]}>
                    <Text style={[styles.memberAvatarText, { fontSize: 14 }]}>{getInitials(coach.name)}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.selectableCardMeta, { color: colors.secondaryText, marginTop: 0 }]}>Sharing with</Text>
                    <Text style={[styles.selectableCardTitle, { color: colors.primaryText }]}>{coach.name}</Text>
                  </View>
                </View>
              )}
              <BounceButton
                style={[styles.shareButton, { backgroundColor: communityAccent }]}
                onPress={handleShareWithCoach}
              >
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={styles.shareButtonText}>Share with Coach</Text>
              </BounceButton>
            </>
          )}
        </ScrollView>
      </>
    );
  };

  // Render Private Chat View
  const renderPrivateChatView = () => {
    if (!selectedCommunity || !privateChatMember) return null;

    // Private chats are always keyed by the member's (non-owner) uid so both
    // sides read/write the same Firestore path.
    const privateChatKey = isOwnerView ? privateChatMember.id : currentUserId;
    const privateChat = getPrivateChat(selectedCommunity.id, privateChatKey);
    const messages = (privateChat?.messages || []).filter(m => !blockedUserIds.includes(m.senderId));

    const handleSendPrivate = () => {
      if (privateMessage.trim()) {
        sendPrivateMessage(
          selectedCommunity.id,
          privateChatKey,
          isOwnerView ? privateChatMember.name : currentUserName,
          privateMessage.trim()
        );
        setPrivateMessage('');
      }
    };

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.privateChatHeader}>
          <TouchableOpacity style={[styles.heroBannerBtn, { backgroundColor: colors.backButtonBg }]} onPress={handleBack}>
            <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.privateChatHeaderInfo} onPress={() => handleTapMember(privateChatMember.id, privateChatMember.name)}>
            <View style={[styles.privateChatHeaderAvatar, { backgroundColor: getMemberColor(privateChatMember.id) }]}>
              <Text style={styles.privateChatHeaderAvatarText}>
                {getInitials(privateChatMember.name)}
              </Text>
            </View>
            <View style={styles.privateChatHeaderText}>
              <Text style={[styles.privateChatHeaderName, { color: colors.primaryText }]}>{privateChatMember.name}</Text>
              <Text style={[styles.privateChatHeaderSubtitle, { color: colors.secondaryText }]}>Private Chat</Text>
            </View>
          </TouchableOpacity>
          <View style={{ width: 28 }} />
        </View>

        <FlatList
          ref={privateChatFlatListRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatContent}
          inverted={false}
          onLayout={() => {
            if (privateMsgCountRef.current === -1) {
              privateMsgCountRef.current = messages.length;
              if (privateFirstUnreadIdx !== null) {
                privateChatFlatListRef.current?.scrollToIndex({ index: privateFirstUnreadIdx, animated: false, viewPosition: 0 });
              } else {
                privateChatFlatListRef.current?.scrollToEnd({ animated: false });
              }
            }
          }}
          onContentSizeChange={() => {
            if (privateMsgCountRef.current === -1) {
              // onContentSizeChange fired before onLayout — handle initial scroll here
              privateMsgCountRef.current = messages.length;
              if (privateFirstUnreadIdx !== null) {
                privateChatFlatListRef.current?.scrollToIndex({ index: privateFirstUnreadIdx, animated: false, viewPosition: 0 });
              } else {
                privateChatFlatListRef.current?.scrollToEnd({ animated: false });
              }
            } else if (messages.length > privateMsgCountRef.current) {
              // A new message arrived while chat is open
              privateMsgCountRef.current = messages.length;
              privateChatFlatListRef.current?.scrollToEnd({ animated: true });
            }
            // Otherwise FlatList batch render — do nothing
          }}
          onScrollToIndexFailed={({ averageItemLength }) => {
            privateChatFlatListRef.current?.scrollToOffset({ offset: (privateFirstUnreadIdx ?? 0) * averageItemLength, animated: false });
          }}
          onEndReached={() => setPrivateFirstUnreadIdx(null)}
          onEndReachedThreshold={0.2}
          ListEmptyComponent={
            <View style={styles.emptyChatState}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.secondaryText} />
              <Text style={[styles.emptyChatText, { color: colors.primaryText }]}>No messages yet</Text>
              <Text style={[styles.emptyChatSubtext, { color: colors.secondaryText }]}>Start a conversation with {privateChatMember.name}</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isMe = item.senderId === currentUserId;
            const msgPreview = item.sharedWorkout ? `[Program: ${item.sharedWorkout.programName}]` : item.message;
            const prevMsg = messages[index - 1];
            const showDateSep = !prevMsg || !isSameDay(prevMsg.timestamp, item.timestamp);
            const showNewMsgDivider = privateFirstUnreadIdx !== null && index === privateFirstUnreadIdx;
            return (
              <>
                {showNewMsgDivider && (
                  <View style={styles.newMessagesDivider}>
                    <View style={[styles.newMessagesDividerLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.newMessagesDividerText, { color: colors.secondaryText }]}>New Messages</Text>
                    <View style={[styles.newMessagesDividerLine, { backgroundColor: colors.border }]} />
                  </View>
                )}
                {showDateSep && (
                  <View style={styles.dateSeparator}>
                    <Text style={[styles.dateSeparatorText, { color: colors.border }]}>{formatDateSeparator(item.timestamp)}</Text>
                  </View>
                )}
                <TouchableOpacity
                  activeOpacity={1}
                  onLongPress={!isMe ? () => handleLongPressMessage(item.senderId, item.senderName, msgPreview, 'private') : undefined}
                  delayLongPress={400}
                >
                  <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
                    {!isMe && (
                      <View style={[styles.messageAvatar, { backgroundColor: getMemberColor(item.senderId) }]}>
                        <Text style={styles.messageAvatarText}>
                          {getInitials(item.senderName)}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : [styles.messageBubbleOther, { backgroundColor: colors.cardSolid }]]}>
                      {item.sharedWorkout ? (
                        <View style={styles.sharedWorkoutMessage}>
                          <View style={[styles.sharedWorkoutIcon, { backgroundColor: item.sharedWorkout.color }, isMe && styles.sharedWorkoutIconMe]}>
                            <Ionicons name="barbell" size={18} color="#fff" />
                          </View>
                          <View style={styles.sharedWorkoutInfo}>
                            <Text style={[styles.sharedWorkoutLabel, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.secondaryText }]}>PROGRAM</Text>
                            <Text style={[styles.sharedWorkoutName, { color: isMe ? '#fff' : colors.primaryText }]}>{item.sharedWorkout.programName}</Text>
                            <Text style={[styles.sharedWorkoutMeta, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.secondaryText }]}>{item.sharedWorkout.splitDays} day split</Text>
                          </View>
                        </View>
                      ) : (
                        <Text style={[styles.messageText, { color: colors.primaryText }, isMe && styles.messageTextMe]}>{item.message}</Text>
                      )}
                      <Text style={[styles.messageTime, { color: colors.secondaryText }, isMe && styles.messageTimeMe]}>
                        {formatTime(item.timestamp)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </>
            );
          }}
        />

        <View style={[styles.privateChatInputContainer, { backgroundColor: colors.cardSolid, borderTopColor: colors.border, marginBottom: chatKeyboardHeight > 0 ? chatKeyboardHeight : (Platform.OS === 'ios' ? 100 : 85) }]}>
          <TextInput
            style={[styles.chatInput, { backgroundColor: colors.inputBg, color: colors.primaryText }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.tertiaryText}
            value={privateMessage}
            onChangeText={setPrivateMessage}
            returnKeyType="send"
            onSubmitEditing={handleSendPrivate}
          />
        </View>
      </View>
    );
  };

  // Render Member Progress View (owner sees a member's workout history)
  const renderMemberProgressView = () => {
    if (!progressMember || !selectedCommunity) return null;

    const communityAccent = getColorScheme(selectedCommunity.color).gradStart;

    return (
      <>
        <View style={[styles.groupChatHeader, { paddingBottom: 8 }]}>
          <TouchableOpacity style={[styles.heroBannerBtn, { backgroundColor: colors.backButtonBg }]} onPress={handleBack}>
            <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
          </TouchableOpacity>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 8 }}>
            <View style={[styles.memberAvatar, { backgroundColor: getMemberColor(progressMember.id) }]}>
              <Text style={styles.memberAvatarText}>{getInitials(progressMember.name)}</Text>
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={[styles.groupChatHeaderName, { color: colors.primaryText }]}>{progressMember.name}</Text>
              <Text style={[styles.groupChatHeaderSubtitle, { color: colors.secondaryText }]}>Progress Overview</Text>
            </View>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Stats / Journal tab switcher */}
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }}>
          {(['stats', 'journal'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
                borderRadius: 12,
                backgroundColor: memberProgressTab === tab ? communityAccent : 'transparent',
              }}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMemberProgressTab(tab); }}
              activeOpacity={0.7}
            >
              <Text style={{
                fontSize: 13,
                fontFamily: 'Arimo_700Bold',
                color: memberProgressTab === tab ? '#fff' : colors.secondaryText,
              }}>
                {tab === 'stats' ? 'Stats' : 'Journal'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {memberProgressLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={communityAccent} />
          </View>
        ) : memberProgressTab === 'stats' ? (
          <ProgressView
            journal={memberJournalData ?? []}
            unit={unit}
            toDisplay={toDisplay}
            initialProgramName={memberActiveProgramName}
            scrollTopPadding={8}
          />
        ) : (
          <MemberJournalView
            journal={memberJournalData ?? []}
            unit={unit}
            toDisplay={toDisplay}
          />
        )}
      </>
    );
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.gradientStart} />

      {viewMode === 'list' && renderListView()}
      {viewMode === 'detail' && renderDetailView()}
      {viewMode === 'chat' && renderChatView()}
      {viewMode === 'share' && renderShareView()}
      {viewMode === 'privateChat' && renderPrivateChatView()}
      {viewMode === 'memberProgress' && renderMemberProgressView()}

      {/* Create Community Modal */}
      <Modal visible={showCreateModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={[styles.joinModalOverlay, { backgroundColor: colors.overlayBg }]}>
          <View style={[styles.joinModalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Create Community</Text>
            <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]}>Start coaching your clients</Text>

            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.inputBg, color: colors.primaryText }]}
              placeholder="Community Name"
              placeholderTextColor={colors.tertiaryText}
              value={newCommunityName}
              onChangeText={setNewCommunityName}
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputMulti, { backgroundColor: colors.inputBg, color: colors.primaryText }]}
              placeholder="Description (optional)"
              placeholderTextColor={colors.tertiaryText}
              value={newCommunityDesc}
              onChangeText={setNewCommunityDesc}
              maxLength={150}
              multiline
              blurOnSubmit
            />

            <Text style={[styles.colorPickerLabel, { color: colors.secondaryText }]}>COLOUR THEME</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginBottom: 12, paddingVertical: 4 }}>
              {COMMUNITY_COLOR_SCHEMES.map(scheme => (
                <TouchableOpacity
                  key={scheme.key}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setNewCommunityColor(scheme.key); }}
                  style={newCommunityColor === scheme.key ? styles.colorSwatchSelected : undefined}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={scheme.colors as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.colorSwatch}
                  >
                    {newCommunityColor === scheme.key && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>

            <BounceButton
              style={[styles.joinSearchBtn, { backgroundColor: getColorScheme(newCommunityColor).gradStart }, !newCommunityName.trim() && { opacity: 0.5 }]}
              onPress={handleCreateCommunity}
              disabled={!newCommunityName.trim()}
            >
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Create Community</Text>
            </BounceButton>

            <BounceButton
              style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
              onPress={() => {
                setShowCreateModal(false);
                setNewCommunityName('');
                setNewCommunityDesc('');
                setNewCommunityColor(COMMUNITY_COLOR_SCHEMES[0].key);
              }}
            >
              <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
            </BounceButton>
          </View>
        </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Join Community Modal */}
      <Modal visible={showJoinModal} transparent animationType="fade">
        <View style={[styles.joinModalOverlay, { backgroundColor: colors.overlayBg }]}>
          <View style={[styles.joinModalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Join Community</Text>
            <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]}>Enter the invite code from your coach</Text>

            <TextInput
              style={[styles.modalInput, styles.inviteCodeInput, { backgroundColor: colors.inputBg, color: colors.primaryText }]}
              placeholder="INVITE CODE"
              placeholderTextColor={colors.tertiaryText}
              value={inviteCode}
              onChangeText={(text) => {
                setInviteCode(text.toUpperCase());
                setJoinError('');
              }}
              autoCapitalize="characters"
              returnKeyType="done"
            />
            {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}

            <BounceButton
              style={[styles.joinSearchBtn, !inviteCode.trim() && { opacity: 0.5 }]}
              onPress={handleJoinCommunity}
              disabled={!inviteCode.trim()}
            >
              <Ionicons name="search" size={20} color="#1C1C1E" />
              <Text style={styles.joinSearchBtnText}>Search & Join</Text>
            </BounceButton>

            <BounceButton
              style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
              onPress={() => {
                setShowJoinModal(false);
                setInviteCode('');
                setJoinError('');
              }}
            >
              <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
            </BounceButton>
          </View>
        </View>
      </Modal>

      {/* Options / Edit Community Sheet — single sheet, no second modal needed */}
      <BottomSheetModal
        visible={showOptionsMenu}
        onDismiss={() => { setShowOptionsMenu(false); setShowEditInSheet(false); setShowDeleteConfirm(false); }}
        overlayColor={colors.overlayBg}
        sheetBackground={colors.modalBg}
      >
        <View style={[styles.optionsMenuContent, { backgroundColor: colors.modalBg }]}>
          <View style={[styles.optionsMenuHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#e0e0e0' }]} />

          {showEditInSheet ? (
            /* ── Edit form (shown inline in the same sheet) ── */
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}>
                <TouchableOpacity onPress={() => setShowEditInSheet(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="chevron-back" size={22} color={colors.primaryText} />
                </TouchableOpacity>
                <Text style={[styles.modalTitle, { color: colors.primaryText, flex: 1, marginBottom: 0 }]}>Edit Community</Text>
              </View>

              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.inputBg, color: colors.primaryText }]}
                placeholder="Community Name"
                placeholderTextColor={colors.tertiaryText}
                value={editName}
                onChangeText={setEditName}
                maxLength={30}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              <TextInput
                style={[styles.modalInput, styles.modalInputMulti, { backgroundColor: colors.inputBg, color: colors.primaryText }]}
                placeholder="Description (optional)"
                placeholderTextColor={colors.tertiaryText}
                value={editDesc}
                onChangeText={setEditDesc}
                maxLength={150}
                multiline
                blurOnSubmit
              />

              <Text style={[styles.colorPickerLabel, { color: colors.secondaryText }]}>COLOUR THEME</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginBottom: 12, paddingVertical: 4 }}>
                {COMMUNITY_COLOR_SCHEMES.map(scheme => (
                  <TouchableOpacity
                    key={scheme.key}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEditColor(scheme.key); }}
                    style={editColor === scheme.key ? styles.colorSwatchSelected : undefined}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={scheme.colors as any}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.colorSwatch}
                    >
                      {editColor === scheme.key && <Ionicons name="checkmark" size={18} color="#fff" />}
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              <BounceButton
                style={[styles.joinSearchBtn, { backgroundColor: getColorScheme(editColor).gradStart }, !editName.trim() && { opacity: 0.5 }]}
                onPress={() => {
                  if (selectedCommunity && editName.trim()) {
                    updateCommunity(selectedCommunity.id, editName.trim(), editDesc.trim(), editColor);
                    setSelectedCommunity({ ...selectedCommunity, name: editName.trim(), description: editDesc.trim(), color: editColor });
                    setShowOptionsMenu(false);
                    setShowEditInSheet(false);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                }}
                disabled={!editName.trim()}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Save Changes</Text>
              </BounceButton>
            </>
            </TouchableWithoutFeedback>
          ) : showDeleteConfirm ? (
            /* ── Delete confirmation ── */
            <>
              <View style={{ alignItems: 'center', paddingVertical: 8, gap: 10 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(231,76,60,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="trash-outline" size={28} color="#e74c3c" />
                </View>
                <Text style={[styles.modalTitle, { color: colors.primaryText, marginBottom: 0 }]}>Delete Community?</Text>
                <Text style={[styles.modalSubtitle, { color: colors.secondaryText, textAlign: 'center', marginBottom: 0 }]}>
                  {`This will permanently delete "${selectedCommunity?.name}" and remove all members. This cannot be undone.`}
                </Text>
              </View>
              <BounceButton
                style={[styles.joinSearchBtn, { backgroundColor: '#e74c3c', marginTop: 16 }]}
                onPress={() => {
                  if (selectedCommunity) {
                    deleteCommunity(selectedCommunity.id);
                    setShowOptionsMenu(false);
                    setShowDeleteConfirm(false);
                    setViewMode('list');
                    setSelectedCommunity(null);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  }
                }}
              >
                <Ionicons name="trash-outline" size={20} color="#fff" />
                <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Yes, Delete Community</Text>
              </BounceButton>
              <BounceButton
                style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0', marginTop: 8 }]}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
              </BounceButton>
            </>
          ) : (
            /* ── Default menu ── */
            isOwnerView ? (
              <>
                <BounceButton
                  style={[styles.optionsMenuItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    if (selectedCommunity) {
                      setEditName(selectedCommunity.name);
                      setEditDesc(selectedCommunity.description);
                      setEditColor(selectedCommunity.color);
                      setShowEditInSheet(true);
                    }
                  }}
                >
                  <Ionicons name="create-outline" size={22} color={colors.primaryText} />
                  <Text style={[styles.optionsMenuItemText, { color: colors.primaryText }]}>Edit Community</Text>
                </BounceButton>
                <BounceButton
                  style={[styles.optionsMenuItem, styles.optionsMenuItemLast]}
                  onPress={() => setShowDeleteConfirm(true)}
                >
                  <Ionicons name="trash-outline" size={22} color="#e74c3c" />
                  <Text style={styles.optionsMenuItemTextDanger}>Delete Community</Text>
                </BounceButton>
              </>
            ) : (
              <BounceButton
                style={[styles.optionsMenuItem, styles.optionsMenuItemLast]}
                onPress={() => {
                  setShowOptionsMenu(false);
                  if (selectedCommunity) {
                    leaveCommunity(selectedCommunity.id);
                    setViewMode('list');
                    setSelectedCommunity(null);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                }}
              >
                <Ionicons name="exit-outline" size={22} color="#e74c3c" />
                <Text style={styles.optionsMenuItemTextDanger}>Leave Community</Text>
              </BounceButton>
            )
          )}
        </View>
      </BottomSheetModal>

      {/* Manage Members Modal */}
      <BottomSheetModal
        visible={showManageMembersModal}
        onDismiss={() => setShowManageMembersModal(false)}
        overlayColor={colors.overlayBg}
        sheetBackground={colors.modalBg}
        footer={
          <BounceButton
            style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
            onPress={() => setShowManageMembersModal(false)}
          >
            <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
          </BounceButton>
        }
      >
        <TouchableOpacity activeOpacity={1} style={[styles.manageMembersContent, { backgroundColor: colors.modalBg }]}>
          <View style={[styles.optionsMenuHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#e0e0e0' }]} />
          <Text style={[styles.manageMembersTitle, { color: colors.primaryText }]}>Remove Members</Text>
          <Text style={[styles.manageMembersSubtitle, { color: colors.secondaryText }]}>Select a member to remove from the community</Text>
          <ScrollView style={styles.manageMembersList} showsVerticalScrollIndicator={false}>
            {selectedCommunity?.members
              .filter(m => m.role !== 'owner')
              .map(member => (
                <BounceButton
                  key={member.id}
                  style={[styles.manageMemberItem, { backgroundColor: colors.inputBg }]}
                  onPress={() => {
                    setMemberToRemove(member);
                    setShowManageMembersModal(false);
                    setTimeout(() => setShowRemoveConfirmation(true), 230);
                  }}
                >
                  <View style={[styles.memberAvatar, { backgroundColor: getMemberColor(member.id) }]}>
                    <Text style={styles.memberAvatarText}>
                      {getInitials(member.name)}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: colors.primaryText }]}>{member.name}</Text>
                    <Text style={[styles.memberJoined, { color: colors.secondaryText }]}>Joined {formatDate(member.joinedAt)}</Text>
                  </View>
                  <Ionicons name="person-remove-outline" size={20} color="#e74c3c" />
                </BounceButton>
              ))}
          </ScrollView>
        </TouchableOpacity>
      </BottomSheetModal>

      {/* Remove Confirmation Modal */}
      <Modal visible={showRemoveConfirmation} transparent animationType="fade">
        <View style={[styles.joinModalOverlay, { backgroundColor: colors.overlayBg }]}>
          <View style={[styles.confirmModalContent, { backgroundColor: colors.modalBg }]}>
            <View style={styles.confirmIconContainer}>
              <Ionicons name="alert-circle" size={48} color="#e74c3c" />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.primaryText }]}>Remove Member?</Text>
            <Text style={[styles.confirmSubtitle, { color: colors.secondaryText }]}>
              Are you sure you want to remove{' '}
              <Text style={[styles.confirmMemberName, { color: colors.primaryText }]}>{memberToRemove?.name}</Text>
              {' '}from this community? They will need a new invite code to rejoin.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowRemoveConfirmation(false);
                  setMemberToRemove(null);
                }}
              >
                <Text style={[styles.confirmCancelText, { color: colors.secondaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmRemoveBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (selectedCommunity && memberToRemove) {
                    removeMember(selectedCommunity.id, memberToRemove.id);
                    setSelectedCommunity({
                      ...selectedCommunity,
                      members: selectedCommunity.members.filter(m => m.id !== memberToRemove.id),
                    });
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                  setShowRemoveConfirmation(false);
                  setMemberToRemove(null);
                }}
              >
                <Text style={styles.confirmRemoveText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


      {/* Manage Programs Modal */}
      <BottomSheetModal
        visible={showManageProgramsModal}
        onDismiss={() => setShowManageProgramsModal(false)}
        overlayColor={colors.overlayBg}
        sheetBackground={colors.modalBg}
        footer={
          <BounceButton
            style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
            onPress={() => setShowManageProgramsModal(false)}
          >
            <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
          </BounceButton>
        }
      >
        <TouchableOpacity activeOpacity={1} style={[styles.manageMembersContent, { backgroundColor: colors.modalBg }]}>
          <View style={[styles.optionsMenuHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#e0e0e0' }]} />
          <Text style={[styles.manageMembersTitle, { color: colors.primaryText }]}>Remove Programs</Text>
          <Text style={[styles.manageMembersSubtitle, { color: colors.secondaryText }]}>Select a program to remove from the community</Text>
          <ScrollView style={styles.manageMembersList} showsVerticalScrollIndicator={false}>
            {selectedCommunity?.sharedWorkouts.filter(w => w.direction === 'toMembers' || !w.direction).map(workout => (
              <BounceButton
                key={workout.id}
                style={[styles.manageMemberItem, { backgroundColor: colors.inputBg }]}
                onPress={() => {
                  setProgramToRemove({ id: workout.id, name: workout.programName });
                  setShowManageProgramsModal(false);
                  // Delay confirmation modal until BottomSheetModal fully closes (220ms)
                  // to avoid two transparent modals stacking, which blocks touches after dismiss
                  setTimeout(() => setShowRemoveProgramConfirmation(true), 230);
                }}
              >
                <View style={[styles.programColorDot, { backgroundColor: workout.color, marginRight: 12 }]} />
                <View style={styles.memberInfo}>
                  <Text style={[styles.memberName, { color: colors.primaryText }]}>{workout.programName}</Text>
                  <Text style={[styles.memberJoined, { color: colors.secondaryText }]}>{workout.splitDays.length} day split · Shared {formatDate(workout.sharedAt)}</Text>
                </View>
                <Ionicons name="trash-outline" size={20} color="#e74c3c" />
              </BounceButton>
            ))}
          </ScrollView>
        </TouchableOpacity>
      </BottomSheetModal>

      {/* Remove Program Confirmation — in-tree overlay instead of a native Modal so
          Firestore's instant onSnapshot re-render can't interfere with modal animations */}
      {showRemoveProgramConfirmation && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]}>
          <FadeBackdrop
            onPress={() => { setShowRemoveProgramConfirmation(false); setProgramToRemove(null); }}
            color={colors.overlayBg}
          />
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }]} pointerEvents="box-none">
            <View style={[styles.confirmModalContent, { backgroundColor: colors.modalBg }]}>
              <View style={[styles.confirmIconContainer, { backgroundColor: 'rgba(231, 76, 60, 0.1)' }]}>
                <Ionicons name="barbell" size={32} color="#e74c3c" />
              </View>
              <Text style={[styles.confirmTitle, { color: colors.primaryText }]}>Remove Program?</Text>
              <Text style={[styles.confirmSubtitle, { color: colors.secondaryText }]}>
                Are you sure you want to remove{' '}
                <Text style={[styles.confirmMemberName, { color: colors.primaryText }]}>{programToRemove?.name}</Text>
                {' '}from this community? Members will no longer have access to it.
              </Text>
              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={[styles.confirmCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowRemoveProgramConfirmation(false);
                    setProgramToRemove(null);
                  }}
                >
                  <Text style={[styles.confirmCancelText, { color: colors.secondaryText }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmRemoveBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (selectedCommunity && programToRemove) {
                      removeSharedWorkout(selectedCommunity.id, programToRemove.id);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                    setShowRemoveProgramConfirmation(false);
                    setProgramToRemove(null);
                  }}
                >
                  <Text style={styles.confirmRemoveText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Community Terms / EULA Gate */}
      <Modal visible={communityTermsAccepted === false} transparent animationType="fade">
        <View style={[styles.joinModalOverlay, { backgroundColor: colors.overlayBg }]}>
          <View style={[styles.joinModalContent, { backgroundColor: colors.modalBg }]}>
            <Ionicons name="shield-checkmark-outline" size={40} color={colors.accent ?? '#47DDFF'} style={{ alignSelf: 'center', marginBottom: 14 }} />
            <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Terms of Service</Text>
            <Text style={[styles.modalSubtitle, { color: colors.secondaryText, marginBottom: 20 }]}>
              To access the Community you must read and agree to our Terms of Service, including the Community Guidelines.
            </Text>
            <BounceButton
              style={[styles.joinSearchBtn, { backgroundColor: colors.accent ?? '#47DDFF' }]}
              onPress={() => {
                setCommunityTermsAccepted(null);
                router.push({ pathname: '/terms', params: { accept: '1' } } as any);
              }}
            >
              <Ionicons name="document-text-outline" size={20} color="#fff" />
              <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Read & Accept Terms</Text>
            </BounceButton>
          </View>
        </View>
      </Modal>

      {/* Message Actions Modal (Report / Block) */}
      <Modal visible={showMessageActions} transparent animationType="fade" onRequestClose={() => setShowMessageActions(false)}>
        <TouchableWithoutFeedback onPress={() => setShowMessageActions(false)}>
          <View style={[styles.joinModalOverlay, { backgroundColor: colors.overlayBg }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.joinModalContent, { backgroundColor: colors.modalBg }]}>
                {!reportSent ? (
                  <>
                    <Text style={[styles.modalTitle, { color: colors.primaryText }]}>
                      {pendingAction?.senderName ?? 'Message'}
                    </Text>
                    <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]} numberOfLines={2}>
                      "{pendingAction?.messagePreview}"
                    </Text>
                    {pendingReportedUserIds.includes(pendingAction?.senderId ?? '') ? (
                      <View style={[styles.eulaBox, { backgroundColor: colors.inputBg, borderColor: colors.border, marginBottom: 10 }]}>
                        <Text style={[styles.eulaText, { color: colors.secondaryText, textAlign: 'center' }]}>
                          A review of this user is already underway.
                        </Text>
                      </View>
                    ) : (
                      <>
                        <TextInput
                          style={[styles.reportCommentInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.primaryText }]}
                          placeholder="Leave a note for the reviewer (optional)"
                          placeholderTextColor={colors.tertiaryText}
                          value={reportComment}
                          onChangeText={setReportComment}
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                          maxLength={300}
                        />
                        <BounceButton
                          style={[styles.joinSearchBtn, { backgroundColor: '#FF9500', marginBottom: 10 }]}
                          onPress={() => { Keyboard.dismiss(); handleReportMessage(); }}
                        >
                          <Ionicons name="flag-outline" size={20} color="#fff" />
                          <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Report Message</Text>
                        </BounceButton>
                      </>
                    )}
                    <BounceButton
                      style={[styles.joinSearchBtn, { backgroundColor: '#FF3B30', marginBottom: 10 }]}
                      onPress={() => { setShowBlockConfirm(true); setShowMessageActions(false); }}
                    >
                      <Ionicons name="ban-outline" size={20} color="#fff" />
                      <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Block User</Text>
                    </BounceButton>
                    <BounceButton
                      style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
                      onPress={() => setShowMessageActions(false)}
                    >
                      <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
                    </BounceButton>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={40} color="#34C759" style={{ alignSelf: 'center', marginBottom: 10 }} />
                    <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Report Sent</Text>
                    <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]}>
                      Thank you. We will review this report within 24 hours.
                    </Text>
                    <BounceButton
                      style={[styles.joinSearchBtn, { backgroundColor: colors.accent ?? '#47DDFF' }]}
                      onPress={() => setShowMessageActions(false)}
                    >
                      <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Done</Text>
                    </BounceButton>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* User Tap Actions Modal (Report / Block user by name) */}
      <Modal visible={showUserActions} transparent animationType="fade" onRequestClose={() => setShowUserActions(false)}>
        <TouchableWithoutFeedback onPress={() => setShowUserActions(false)}>
          <View style={[styles.joinModalOverlay, { backgroundColor: colors.overlayBg }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.joinModalContent, { backgroundColor: colors.modalBg }]}>
                {!userReportSent ? (
                  <>
                    <View style={[styles.memberAvatar, { backgroundColor: pendingUserAction ? getMemberColor(pendingUserAction.userId) : '#ccc', alignSelf: 'center', marginBottom: 10, width: 52, height: 52, borderRadius: 26 }]}>
                      <Text style={[styles.memberAvatarText, { fontSize: 20 }]}>{pendingUserAction ? getInitials(pendingUserAction.userName) : '?'}</Text>
                    </View>
                    <Text style={[styles.modalTitle, { color: colors.primaryText }]}>{pendingUserAction?.userName}</Text>
                    <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]}>Community member</Text>
                    {pendingReportedUserIds.includes(pendingUserAction?.userId ?? '') ? (
                      <View style={[styles.eulaBox, { backgroundColor: colors.inputBg, borderColor: colors.border, marginBottom: 10 }]}>
                        <Text style={[styles.eulaText, { color: colors.secondaryText, textAlign: 'center' }]}>
                          A review of this user is already underway.
                        </Text>
                      </View>
                    ) : (
                      <>
                        <TextInput
                          style={[styles.reportCommentInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.primaryText }]}
                          placeholder="Leave a note for the reviewer (optional)"
                          placeholderTextColor={colors.tertiaryText}
                          value={reportComment}
                          onChangeText={setReportComment}
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                          maxLength={300}
                        />
                        <BounceButton
                          style={[styles.joinSearchBtn, { backgroundColor: '#FF9500', marginBottom: 10 }]}
                          onPress={() => { Keyboard.dismiss(); handleReportUser(); }}
                        >
                          <Ionicons name="flag-outline" size={20} color="#fff" />
                          <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Report User</Text>
                        </BounceButton>
                      </>
                    )}
                    <BounceButton
                      style={[styles.joinSearchBtn, { backgroundColor: '#FF3B30', marginBottom: 10 }]}
                      onPress={() => { setShowUserBlockConfirm(true); setShowUserActions(false); }}
                    >
                      <Ionicons name="ban-outline" size={20} color="#fff" />
                      <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Block User</Text>
                    </BounceButton>
                    <BounceButton
                      style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
                      onPress={() => setShowUserActions(false)}
                    >
                      <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
                    </BounceButton>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={40} color="#34C759" style={{ alignSelf: 'center', marginBottom: 10 }} />
                    <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Report Sent</Text>
                    <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]}>
                      Thank you. We will review this report within 24 hours.
                    </Text>
                    {reportedOwnerCommunities.length > 0 && (
                      <>
                        <View style={[styles.eulaBox, { backgroundColor: colors.inputBg, borderColor: colors.border, marginTop: 8 }]}>
                          <Text style={[styles.eulaText, { color: colors.secondaryText }]}>
                            {reportedOwnerCommunities.length === 1
                              ? `Would you also like to leave "${reportedOwnerCommunities[0].name}"?`
                              : `Would you also like to leave the ${reportedOwnerCommunities.length} communities owned by this user?`}
                          </Text>
                        </View>
                        <BounceButton
                          style={[styles.joinSearchBtn, { backgroundColor: '#FF3B30', marginBottom: 10 }]}
                          onPress={() => {
                            for (const c of reportedOwnerCommunities) leaveCommunity(c.id);
                            setReportedOwnerCommunities([]);
                            setViewMode('list');
                            setSelectedCommunity(null);
                            setShowUserActions(false);
                          }}
                        >
                          <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Yes, Leave</Text>
                        </BounceButton>
                        <BounceButton
                          style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
                          onPress={() => { setReportedOwnerCommunities([]); setShowUserActions(false); }}
                        >
                          <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>No, Stay</Text>
                        </BounceButton>
                      </>
                    )}
                    {reportedOwnerCommunities.length === 0 && (
                      <BounceButton
                        style={[styles.joinSearchBtn, { backgroundColor: colors.accent ?? '#47DDFF' }]}
                        onPress={() => setShowUserActions(false)}
                      >
                        <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Done</Text>
                      </BounceButton>
                    )}
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* User Block Confirm Modal */}
      <Modal visible={showUserBlockConfirm} transparent animationType="fade" onRequestClose={() => setShowUserBlockConfirm(false)}>
        <TouchableWithoutFeedback onPress={() => setShowUserBlockConfirm(false)}>
          <View style={[styles.joinModalOverlay, { backgroundColor: colors.overlayBg }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.joinModalContent, { backgroundColor: colors.modalBg }]}>
                <Ionicons name="ban" size={36} color="#FF3B30" style={{ alignSelf: 'center', marginBottom: 12 }} />
                <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Block {pendingUserAction?.userName}?</Text>
                <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]}>
                  They will be hidden from your community view and their messages will no longer appear. This will also notify our team.
                  {ownedCommunities.some(c => c.members.some(m => m.id === pendingUserAction?.userId)) &&
                    ' They will also be removed from your community.'}
                </Text>
                <BounceButton
                  style={[styles.joinSearchBtn, { backgroundColor: '#FF3B30', marginBottom: 10 }]}
                  onPress={handleConfirmBlockUser}
                >
                  <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Block User</Text>
                </BounceButton>
                <BounceButton
                  style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
                  onPress={() => { setShowUserBlockConfirm(false); setShowUserActions(true); }}
                >
                  <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
                </BounceButton>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Owner Block Warning Modal */}
      <Modal visible={showOwnerBlockWarning} transparent animationType="fade" onRequestClose={() => setShowOwnerBlockWarning(false)}>
        <TouchableWithoutFeedback onPress={() => setShowOwnerBlockWarning(false)}>
          <View style={[styles.joinModalOverlay, { backgroundColor: colors.overlayBg }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.joinModalContent, { backgroundColor: colors.modalBg }]}>
                <Ionicons name="warning" size={36} color="#FF9500" style={{ alignSelf: 'center', marginBottom: 12 }} />
                <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Leave Community?</Text>
                <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]}>
                  {ownerBlockInfo && ownerBlockInfo.communities.length === 1
                    ? `You are blocking the owner of "${ownerBlockInfo.communities[0].name}". You will be removed from this community.`
                    : `You are blocking the owner of ${ownerBlockInfo?.communities.length ?? 0} communities you are in. You will be removed from all of them.`}
                </Text>
                <BounceButton
                  style={[styles.joinSearchBtn, { backgroundColor: '#FF3B30', marginBottom: 10 }]}
                  onPress={handleConfirmOwnerBlock}
                >
                  <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Block & Leave</Text>
                </BounceButton>
                <BounceButton
                  style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
                  onPress={() => setShowOwnerBlockWarning(false)}
                >
                  <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
                </BounceButton>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Remove Member Prompt (shown after owner blocks a member) */}
      {/* Block Confirm Modal */}
      <Modal visible={showBlockConfirm} transparent animationType="fade" onRequestClose={() => setShowBlockConfirm(false)}>
        <TouchableWithoutFeedback onPress={() => setShowBlockConfirm(false)}>
          <View style={[styles.joinModalOverlay, { backgroundColor: colors.overlayBg }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.joinModalContent, { backgroundColor: colors.modalBg }]}>
                <Ionicons name="ban" size={36} color="#FF3B30" style={{ alignSelf: 'center', marginBottom: 12 }} />
                <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Block {pendingAction?.senderName}?</Text>
                <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]}>
                  Their messages will be removed from your view immediately. This will also notify our team for review.
                </Text>
                <BounceButton
                  style={[styles.joinSearchBtn, { backgroundColor: '#FF3B30', marginBottom: 10 }]}
                  onPress={handleConfirmBlock}
                >
                  <Text style={[styles.joinSearchBtnText, { color: '#fff' }]}>Block User</Text>
                </BounceButton>
                <BounceButton
                  style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
                  onPress={() => { setShowBlockConfirm(false); setShowMessageActions(true); }}
                >
                  <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
                </BounceButton>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 34,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    flex: 1,
    textAlign: 'center',
  },
  heroBanner: {
    borderRadius: 20,
    overflow: 'hidden',
    paddingBottom: 4,
    marginBottom: 16,
  },
  heroBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  heroBannerTopRow: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 34,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  heroBannerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBannerContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  heroBannerName: {
    fontSize: 30,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
    textAlign: 'left',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  heroBannerDesc: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
  },
  heroBannerMeta: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 10,
    textAlign: 'left',
  },
  memberCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 10,
  },
  memberCountPillText: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ffffff59',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffffffcc',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  listHeaderActions: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  listScreenTitle: {
    fontSize: 28,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
    lineHeight: 36,
    textAlign: 'left',
    textShadowColor: '#00000080',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginBottom: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  communityCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    padding: 16,
    marginBottom: 12,
  },
  communityCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  communityInfo: {
    flex: 1,
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  communityName: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  communityMeta: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 2,
  },
  communityDesc: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 8,
  },
  ownerBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBadge: {
    backgroundColor: '#FF6B6B',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBadgeText: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  emptyActionBtn: {
    backgroundColor: '#47DDFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyActionBtnSecondary: {
    backgroundColor: '#ffffff59',
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
  },
  emptyActionBtnText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#1C1C1E',
  },
  inviteCodeBox: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#5a6c7d20',
    alignItems: 'center',
  },
  inviteCodeLabel: {
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inviteCode: {
    fontSize: 24,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    letterSpacing: 3,
    marginTop: 4,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
  },
  actionButtonSecondary: {
    backgroundColor: '#ffffff59',
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
  },
  actionButtonText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  workoutCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  workoutColorIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  workoutInfo: {
    flex: 1,
  },
  workoutName: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  workoutMeta: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 2,
  },
  workoutSharedWith: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 4,
    fontStyle: 'italic',
  },
  workoutActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptedBadge: {
    marginLeft: 8,
  },
  memberCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  memberJoined: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  removeMemberBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.25)',
    marginTop: 24,
  },
  dangerButtonText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#e74c3c',
  },
  chatHeaderInfo: {
    alignItems: 'center',
    flex: 1,
  },
  chatSubtitle: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  groupChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 34,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  groupChatHeaderInfo: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  groupChatHeaderName: {
    fontSize: 17,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    textAlign: 'center',
  },
  groupChatHeaderSubtitle: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 2,
  },
  chatContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  messageAvatarText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  messageBubbleOther: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 4,
  },
  messageBubbleMe: {
    backgroundColor: '#47DDFF',
    borderTopRightRadius: 4,
  },
  messageSender: {
    fontSize: 12,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
  },
  messageTextMe: {
    color: '#1C1C1E',
  },
  messageTime: {
    fontSize: 11,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 4,
    textAlign: 'right',
  },
  messageTimeMe: {
    color: 'rgba(28, 28, 30, 0.6)',
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateSeparatorText: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    marginHorizontal: 12,
  },
  newMessagesDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    marginHorizontal: 16,
  },
  newMessagesDividerLine: {
    flex: 1,
    height: 1,
  },
  newMessagesDividerText: {
    fontSize: 12,
    fontFamily: 'Arimo_600SemiBold',
    marginHorizontal: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    borderRadius: 16,
    marginHorizontal: 10,
    gap: 10,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
    maxHeight: 100,
    letterSpacing: 0,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectableCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  programColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  selectableCardInfo: {
    flex: 1,
  },
  selectableCardTitle: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  selectableCardMeta: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 2,
  },
  shareIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberSelection: {
    marginTop: 12,
    marginBottom: 8,
  },
  memberSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#ffffff40',
    marginBottom: 8,
  },
  memberSelectAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberSelectAvatarText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  memberSelectName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    marginTop: 16,
  },
  shareButtonText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  shareCoachInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 24,
    marginBottom: 4,
  },
  emptyPrograms: {
    padding: 20,
    alignItems: 'center',
  },
  emptyProgramsText: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBackdrop: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Arimo_400Regular',
    letterSpacing: 0,
    color: '#2c3e50',
    marginBottom: 12,
  },
  modalInputMulti: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inviteCodeInput: {
    textAlign: 'center',
    fontSize: 20,
    letterSpacing: 4,
    fontFamily: 'Arimo_700Bold',
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
  },
  modalConfirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#47DDFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#1C1C1E',
  },
  memberChatBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(71, 221, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  inviteSection: {
    marginBottom: 20,
  },
  inviteCard: {
    backgroundColor: '#ffffff59',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteTextContainer: {
    flex: 1,
    marginLeft: 14,
  },
  inviteTitle: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  inviteSubtitle: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 2,
  },
  copyButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  optionsMenuContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 34,
    paddingHorizontal: 20,
  },
  optionsMenuHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  optionsMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionsMenuItemLast: {
    borderBottomWidth: 0,
  },
  optionsMenuItemText: {
    fontSize: 16,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
  },
  optionsMenuItemTextDanger: {
    fontSize: 16,
    fontFamily: 'Arimo_400Regular',
    color: '#e74c3c',
  },
  joinModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  joinModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  joinSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#47DDFF',
    marginTop: 8,
  },
  joinSearchBtnText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#1C1C1E',
  },
  colorPickerLabel: {
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
  },
  colorPickerRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    transform: [{ scale: 1.15 }],
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  joinCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#d0d0d0',
    backgroundColor: '#f5f5f5',
  },
  joinCancelBtnText: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
  },
  eulaBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  eulaText: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    lineHeight: 20,
  },
  eulaLink: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    textDecorationLine: 'underline',
  },
  reportCommentInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    marginBottom: 10,
  },
  emptyChatState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 20,
  },
  emptyChatText: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    marginTop: 16,
  },
  emptyChatSubtext: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 4,
    textAlign: 'center',
  },
  sharedWorkoutMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sharedWorkoutIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedWorkoutIconMe: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  sharedWorkoutInfo: {
    flex: 1,
  },
  sharedWorkoutLabel: {
    fontSize: 11,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
    textTransform: 'uppercase',
  },
  sharedWorkoutName: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    marginTop: 2,
  },
  sharedWorkoutMeta: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  sharedWorkoutProgramName: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  privateChatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    borderRadius: 16,
    marginHorizontal: 10,
    gap: 10,
  },
  chatAttachBtn: {
    padding: 4,
  },
  shareInChatBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(71, 221, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privateChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 34,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  privateChatHeaderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  privateChatHeaderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privateChatHeaderAvatarText: {
    fontSize: 14,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  privateChatHeaderText: {
    marginLeft: 10,
  },
  privateChatHeaderName: {
    fontSize: 17,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  privateChatHeaderSubtitle: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionMenuBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  manageMembersContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  manageMembersTitle: {
    fontSize: 20,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 4,
  },
  manageMembersSubtitle: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    textAlign: 'center',
    marginBottom: 16,
  },
  manageMembersList: {
    maxHeight: 300,
  },
  manageMemberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    marginBottom: 8,
  },
  confirmModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  confirmIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 20,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
    textAlign: 'center',
  },
  confirmSubtitle: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  confirmMemberName: {
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    width: '100%',
  },
  confirmCancelBtn: {
    width: 130,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#d0d0d0',
  },
  confirmCancelText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
  },
  confirmRemoveBtn: {
    width: 130,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#e74c3c',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  confirmRemoveText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  shareProgramBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 18,
    marginBottom: 8,
  },
  shareProgramIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareProgramTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  shareProgramTitle: {
    fontSize: 18,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  shareProgramSubtitle: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  chatWithCoachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 16,
  },
  chatWithCoachText: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  groupChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff59',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ffffffcc',
    padding: 14,
    marginTop: 20,
  },
  groupChatBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(71, 221, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupChatBtnTextContainer: {
    flex: 1,
    marginLeft: 14,
  },
  groupChatBtnTitle: {
    fontSize: 16,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  groupChatBtnSubtitle: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 2,
  },
  chatNotifBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FF6B6B',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#fff',
  },
  chatNotifBadgeText: {
    fontSize: 10,
    fontFamily: 'Arimo_700Bold',
    color: '#fff',
  },
  // Member progress button on member card
  memberProgressBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Member progress view
  progressStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  progressStatCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
  },
  progressStatNumber: {
    fontSize: 26,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  progressStatLabel: {
    fontSize: 11,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressEmptyCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 32,
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  progressEmptyText: {
    fontSize: 15,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
  },
  progressEntryCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressEntryColorBar: {
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  progressEntryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  progressEntryDate: {
    fontSize: 15,
    fontFamily: 'Arimo_700Bold',
    color: '#2c3e50',
  },
  progressEntryProgram: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    marginTop: 2,
  },
  progressEntryDuration: {
    fontSize: 13,
    fontFamily: 'Arimo_700Bold',
    color: '#5a6c7d',
  },
  progressEntryMeta: {
    fontSize: 12,
    fontFamily: 'Arimo_400Regular',
    color: '#8e8e93',
    marginTop: 2,
  },
  progressEntryExercises: {
    fontSize: 13,
    fontFamily: 'Arimo_400Regular',
    color: '#5a6c7d',
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 6,
    lineHeight: 18,
  },
});
