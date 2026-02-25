import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  Animated,
  TextInput,
  Modal,
  Keyboard,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useFonts, Arimo_400Regular, Arimo_700Bold } from '@expo-google-fonts/arimo';
import { useCommunityStore, Community, CURRENT_USER, Member } from '../../communityStore';
import { useProgramStore } from '../../programStore';
import { useTheme } from '../../themeStore';
import { BottomSheetModal } from '../../components/BottomSheetModal';

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

type ViewMode = 'list' | 'detail' | 'chat' | 'share' | 'privateChat';

// 20 avatar colors for members
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

// Community color schemes: [gradientStart, gradientEnd]
const COMMUNITY_GRADIENTS: Record<string, [string, string]> = {
  '#47DDFF': ['#667eea', '#00d2ff'],   // Indigo → cyan
  '#FF6B6B': ['#ee5a6f', '#f093fb'],   // Red → pink
  '#A78BFA': ['#7c3aed', '#f472b6'],   // Purple → pink
  '#34D399': ['#0ea5e9', '#34d399'],   // Blue → emerald
  '#FBBF24': ['#f59e0b', '#ef4444'],   // Amber → red
  '#F472B6': ['#ec4899', '#f97316'],   // Pink → orange
};
const getColorScheme = (color: string) => {
  const grad = COMMUNITY_GRADIENTS[color] || ['#667eea', '#764ba2'];
  return { gradStart: grad[0], gradEnd: grad[1] };
};

export default function CommunityScreen() {
  const [fontsLoaded] = useFonts({ Arimo_400Regular, Arimo_700Bold });
  const {
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
    getPrivateChat,
  } = useCommunityStore();
  const { programs, addSharedProgram } = useProgramStore();
  const { isDark, colors } = useTheme();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [isOwnerView, setIsOwnerView] = useState(false);

  // Keep selectedCommunity in sync with store updates
  useEffect(() => {
    if (!selectedCommunity) return;
    const source = isOwnerView ? ownedCommunities : joinedCommunities;
    const updated = source.find(c => c.id === selectedCommunity.id);
    if (updated && updated !== selectedCommunity) {
      setSelectedCommunity(updated);
    }
  }, [ownedCommunities, joinedCommunities]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState('');
  const [newCommunityDesc, setNewCommunityDesc] = useState('');
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [showManageProgramsModal, setShowManageProgramsModal] = useState(false);
  const [programToRemove, setProgramToRemove] = useState<{ id: string; name: string } | null>(null);
  const [showRemoveProgramConfirmation, setShowRemoveProgramConfirmation] = useState(false);

  // Private chat state
  const [privateChatMember, setPrivateChatMember] = useState<Member | null>(null);
  const [privateMessage, setPrivateMessage] = useState('');

  // Keyboard height for chat input positioning
  const [chatKeyboardHeight, setChatKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', e => {
      setChatKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      setChatKeyboardHeight(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);


  // Unread message tracking: stores count of messages already seen
  const [readGroupChatCounts, setReadGroupChatCounts] = useState<Record<string, number>>({});
  const [readPrivateChatCounts, setReadPrivateChatCounts] = useState<Record<string, number>>({});

  // Helper to count unread group chat messages
  const getUnreadGroupCount = (community: Community): number => {
    const otherMessages = community.chatMessages.filter(m => m.senderId !== CURRENT_USER.id).length;
    const readCount = readGroupChatCounts[community.id] || 0;
    return Math.max(0, otherMessages - readCount);
  };

  // Helper to count unread private chat messages
  const getUnreadPrivateCount = (communityId: string, memberId: string): number => {
    const community = ownedCommunities.find(c => c.id === communityId);
    if (!community) return 0;
    const chat = community.privateChats.find(pc => pc.memberId === memberId);
    if (!chat) return 0;
    const otherMessages = chat.messages.filter(m => m.senderId !== CURRENT_USER.id).length;
    const key = `${communityId}-${memberId}`;
    const readCount = readPrivateChatCounts[key] || 0;
    return Math.max(0, otherMessages - readCount);
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
    } else {
      setViewMode('list');
      setSelectedCommunity(null);
    }
  };

  const openPrivateChat = (member: Member) => {
    setPrivateChatMember(member);
    setViewMode('privateChat');
  };

  const handleCreateCommunity = () => {
    if (newCommunityName.trim()) {
      createCommunity(newCommunityName.trim(), newCommunityDesc.trim());
      setNewCommunityName('');
      setNewCommunityDesc('');
      setShowCreateModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleJoinCommunity = () => {
    const success = joinCommunity(inviteCode.trim());
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
      Keyboard.dismiss();
      // Refresh the selected community
      const updated = isOwnerView
        ? ownedCommunities.find(c => c.id === selectedCommunity.id)
        : joinedCommunities.find(c => c.id === selectedCommunity.id);
      if (updated) setSelectedCommunity(updated);
    }
  };

  const handleShareWorkout = () => {
    if (selectedProgramId && selectedCommunity) {
      const program = programs.find(p => p.id === selectedProgramId);
      if (program) {
        shareWorkout(selectedCommunity.id, {
          programId: program.id,
          programName: program.name,
          sharedBy: CURRENT_USER.name,
          sharedWith: shareWith === 'everyone' ? 'everyone' : selectedMembers,
          color: program.color,
          splitDays: program.splitDays,
        });
        setSelectedProgramId(null);
        setShareWith('everyone');
        setSelectedMembers([]);
        setViewMode('detail');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Refresh
        const updated = ownedCommunities.find(c => c.id === selectedCommunity.id);
        if (updated) setSelectedCommunity(updated);
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
          sharedBy: CURRENT_USER.name,
          color: program.color,
          splitDays: program.splitDays,
        });
        setSelectedProgramId(null);
        setViewMode('detail');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const updated = joinedCommunities.find(c => c.id === selectedCommunity.id);
        if (updated) setSelectedCommunity(updated);
      }
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.listScreenTitle}>Community</Text>
        {/* My Communities (Owner) */}
        {ownedCommunities.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>MY COMMUNITIES</Text>
            {ownedCommunities.map(community => {
              const scheme = getColorScheme(community.color);
              const pendingOwner = community.sharedWorkouts.filter(w => w.status === 'pending').length;
              return (
                <BounceButton
                  key={community.id}
                  style={[styles.communityCard, { backgroundColor: 'transparent', overflow: 'hidden', borderColor: 'rgba(255,255,255,0.3)' }]}
                  onPress={() => handleOpenCommunity(community, true)}
                >
                  <LinearGradient
                    colors={[scheme.gradStart, scheme.gradEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={styles.communityCardHeader}>
                    <View style={styles.communityInfo}>
                      <Text style={[styles.communityName, { color: '#fff' }]}>{community.name}</Text>
                      <Text style={[styles.communityMeta, { color: 'rgba(255,255,255,0.75)' }]}>
                        {community.members.length} members · Owner
                      </Text>
                    </View>
                    {pendingOwner > 0 && (
                      <View style={styles.pendingBadge}>
                        <Ionicons name="notifications" size={14} color="#fff" />
                      </View>
                    )}
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
              const pendingWorkouts = community.sharedWorkouts.filter(w => w.status === 'pending').length;
              const scheme = getColorScheme(community.color);
              return (
                <BounceButton
                  key={community.id}
                  style={[styles.communityCard, { backgroundColor: 'transparent', overflow: 'hidden', borderColor: 'rgba(255,255,255,0.3)' }]}
                  onPress={() => handleOpenCommunity(community, false)}
                >
                  <LinearGradient
                    colors={[scheme.gradStart, scheme.gradEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={styles.communityCardHeader}>
                    <View style={styles.communityInfo}>
                      <Text style={[styles.communityName, { color: '#fff' }]}>{community.name}</Text>
                      <Text style={[styles.communityMeta, { color: 'rgba(255,255,255,0.75)' }]}>
                        by {community.ownerName} · {community.members.length} members
                      </Text>
                    </View>
                    {pendingWorkouts > 0 && (
                      <View style={styles.pendingBadge}>
                        <Ionicons name="notifications" size={14} color="#fff" />
                      </View>
                    )}
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
    </>
  );

  // Render Detail View
  const renderDetailView = () => {
    if (!selectedCommunity) return null;

    const pendingWorkouts = selectedCommunity.sharedWorkouts.filter(w => w.status === 'pending' && w.direction !== 'toCoach');
    const acceptedWorkouts = selectedCommunity.sharedWorkouts.filter(w => w.status === 'accepted' && w.direction !== 'toCoach');
    const scheme = getColorScheme(selectedCommunity.color);

    return (
      <>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: Platform.OS === 'ios' ? 112 : 92 }]} showsVerticalScrollIndicator={false}>
          {/* Hero Banner */}
          <LinearGradient
            colors={[scheme.gradStart, scheme.gradEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroBanner}
          >
            <View style={styles.heroBannerContent}>
              <Text style={styles.heroBannerName} numberOfLines={1}>{selectedCommunity.name}</Text>
              {selectedCommunity.description ? (
                <Text style={styles.heroBannerDesc} numberOfLines={2}>{selectedCommunity.description}</Text>
              ) : null}
              <View style={styles.memberCountPill}>
                <Ionicons name="people-outline" size={14} color="#fff" />
                <Text style={styles.memberCountPillText}>{selectedCommunity.members.length} member{selectedCommunity.members.length !== 1 ? 's' : ''}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Group Chat Button (Owner View) */}
          {isOwnerView && (() => {
            const unreadGroup = getUnreadGroupCount(selectedCommunity);
            return (
              <BounceButton
                style={[styles.groupChatBtn, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}
                onPress={() => {
                  const otherMsgCount = selectedCommunity.chatMessages.filter(m => m.senderId !== CURRENT_USER.id).length;
                  setReadGroupChatCounts(prev => ({ ...prev, [selectedCommunity.id]: otherMsgCount }));
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
          {!isOwnerView && (
            <BounceButton
              style={[styles.groupChatBtn, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}
              onPress={() => {
                const owner = selectedCommunity.members.find(m => m.role === 'owner');
                if (owner) {
                  setPrivateChatMember(owner);
                  setViewMode('privateChat');
                }
              }}
            >
              <View style={styles.groupChatBtnIcon}>
                <Ionicons name="chatbubble" size={22} color={selectedCommunity.color} />
              </View>
              <View style={styles.groupChatBtnTextContainer}>
                <Text style={[styles.groupChatBtnTitle, { color: colors.primaryText }]}>Chat with Coach</Text>
                <Text style={[styles.groupChatBtnSubtitle, { color: colors.secondaryText }]}>Private message</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.secondaryText} />
            </BounceButton>
          )}

          {/* Group Chat Button (Member View) */}
          {!isOwnerView && (() => {
            const unreadGroup = getUnreadGroupCount(selectedCommunity);
            return (
              <BounceButton
                style={[styles.groupChatBtn, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}
                onPress={() => {
                  const otherMsgCount = selectedCommunity.chatMessages.filter(m => m.senderId !== CURRENT_USER.id).length;
                  setReadGroupChatCounts(prev => ({ ...prev, [selectedCommunity.id]: otherMsgCount }));
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
                <View key={workout.id} style={[styles.workoutCard, { backgroundColor: `${workout.color}12`, borderColor: `${workout.color}40` }]}>
                  <View style={[styles.workoutColorIcon, { backgroundColor: `${workout.color}25` }]}>
                    <Ionicons name="barbell-outline" size={20} color={workout.color} />
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={[styles.workoutName, { color: colors.primaryText }]}>{workout.programName}</Text>
                    <Text style={[styles.workoutMeta, { color: colors.secondaryText }]}>
                      from {workout.sharedBy} · {workout.splitDays.length} day split
                    </Text>
                  </View>
                  <View style={styles.workoutActions}>
                    <BounceButton
                      style={styles.acceptBtn}
                      onPress={() => {
                        acceptWorkout(selectedCommunity.id, workout.id);
                        addSharedProgram({
                          id: workout.id,
                          name: workout.programName,
                          color: workout.color,
                          splitDays: workout.splitDays,
                          sharedBy: workout.sharedBy,
                        });
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        const updated = joinedCommunities.find(c => c.id === selectedCommunity.id);
                        if (updated) setSelectedCommunity(updated);
                      }}
                    >
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    </BounceButton>
                    <BounceButton
                      style={styles.declineBtn}
                      onPress={() => {
                        declineWorkout(selectedCommunity.id, workout.id);
                        const updated = joinedCommunities.find(c => c.id === selectedCommunity.id);
                        if (updated) setSelectedCommunity(updated);
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
          {isOwnerView && selectedCommunity.sharedWorkouts.filter(w => w.direction !== 'toCoach').length > 0 && (
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
              {selectedCommunity.sharedWorkouts.filter(w => w.direction !== 'toCoach').map(workout => (
                <View key={workout.id} style={[styles.workoutCard, { backgroundColor: `${workout.color}12`, borderColor: `${workout.color}40` }]}>
                  <View style={[styles.workoutColorIcon, { backgroundColor: `${workout.color}25` }]}>
                    <Ionicons name="barbell-outline" size={20} color={workout.color} />
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={[styles.workoutName, { color: colors.primaryText }]}>{workout.programName}</Text>
                    <Text style={[styles.workoutMeta, { color: colors.secondaryText }]}>
                      {workout.splitDays.length} day split · Shared {formatDate(workout.sharedAt)}
                    </Text>
                    <Text style={[styles.workoutSharedWith, { color: colors.secondaryText }]}>
                      {workout.sharedWith === 'everyone'
                        ? 'Shared with everyone'
                        : `Shared with ${(workout.sharedWith as string[]).length} member(s)`}
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
                <View key={workout.id} style={[styles.workoutCard, { backgroundColor: `${workout.color}12`, borderColor: `${workout.color}40` }]}>
                  <View style={[styles.workoutColorIcon, { backgroundColor: `${workout.color}25` }]}>
                    <Ionicons name="barbell-outline" size={20} color={workout.color} />
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={[styles.workoutName, { color: colors.primaryText }]}>{workout.programName}</Text>
                    <Text style={[styles.workoutMeta, { color: colors.secondaryText }]}>
                      from {workout.sharedBy} · {workout.splitDays.length} day split
                    </Text>
                  </View>
                  {workout.status === 'pending' && (
                    <View style={styles.workoutActions}>
                      <BounceButton
                        style={styles.acceptBtn}
                        onPress={() => {
                          respondToMemberShare(selectedCommunity.id, workout.id, true);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          const updated = ownedCommunities.find(c => c.id === selectedCommunity.id);
                          if (updated) setSelectedCommunity(updated);
                        }}
                      >
                        <Ionicons name="checkmark" size={20} color="#fff" />
                      </BounceButton>
                      <BounceButton
                        style={styles.declineBtn}
                        onPress={() => {
                          respondToMemberShare(selectedCommunity.id, workout.id, false);
                          const updated = ownedCommunities.find(c => c.id === selectedCommunity.id);
                          if (updated) setSelectedCommunity(updated);
                        }}
                      >
                        <Ionicons name="close" size={20} color="#e74c3c" />
                      </BounceButton>
                    </View>
                  )}
                  {workout.status === 'accepted' && (
                    <View style={styles.acceptedBadge}>
                      <Ionicons name="checkmark-circle" size={20} color="#34D399" />
                    </View>
                  )}
                </View>
              ))}
            </>
          )}

          {/* Your Programs (member: programs coach shared with them) */}
          {!isOwnerView && acceptedWorkouts.filter(w => w.direction !== 'toCoach').length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>YOUR PROGRAMS</Text>
              {acceptedWorkouts.filter(w => w.direction !== 'toCoach').map(workout => (
                <View key={workout.id} style={[styles.workoutCard, { backgroundColor: `${workout.color}12`, borderColor: `${workout.color}40` }]}>
                  <View style={[styles.workoutColorIcon, { backgroundColor: `${workout.color}25` }]}>
                    <Ionicons name="barbell-outline" size={20} color={workout.color} />
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={[styles.workoutName, { color: colors.primaryText }]}>{workout.programName}</Text>
                    <Text style={[styles.workoutMeta, { color: colors.secondaryText }]}>
                      {workout.splitDays.length} day split · Shared {formatDate(workout.sharedAt)}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={22} color="#34D399" />
                </View>
              ))}
            </>
          )}

          {/* Shared with Coach (member: programs they sent to coach) */}
          {!isOwnerView && selectedCommunity.sharedWorkouts.filter(w => w.direction === 'toCoach').length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>SHARED WITH COACH</Text>
              {selectedCommunity.sharedWorkouts.filter(w => w.direction === 'toCoach').map(workout => (
                <View key={workout.id} style={[styles.workoutCard, { backgroundColor: `${workout.color}12`, borderColor: `${workout.color}40` }]}>
                  <View style={[styles.workoutColorIcon, { backgroundColor: `${workout.color}25` }]}>
                    <Ionicons name="barbell-outline" size={20} color={workout.color} />
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={[styles.workoutName, { color: colors.primaryText }]}>{workout.programName}</Text>
                    <Text style={[styles.workoutMeta, { color: colors.secondaryText }]}>
                      {workout.splitDays.length} day split · {workout.status === 'pending' ? 'Pending' : workout.status === 'accepted' ? 'Seen' : 'Declined'}
                    </Text>
                  </View>
                  {workout.status === 'pending' && (
                    <Ionicons name="time-outline" size={20} color={colors.tertiaryText} />
                  )}
                  {workout.status === 'accepted' && (
                    <Ionicons name="checkmark-circle" size={22} color="#34D399" />
                  )}
                </View>
              ))}
            </>
          )}

          {/* Members List */}
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24, marginBottom: 0 }]}>MEMBERS</Text>
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
            {selectedCommunity.members.map(member => (
              <View key={member.id} style={[styles.memberCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
                <View style={[styles.memberAvatar, { backgroundColor: getAvatarColor(member.id) }]}>
                  <Text style={styles.memberAvatarText}>
                    {member.name.charAt(0).toUpperCase()}
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
                    <BounceButton
                      style={styles.memberChatBtn}
                      onPress={() => {
                        const chat = selectedCommunity.privateChats.find(pc => pc.memberId === member.id);
                        const otherCount = chat ? chat.messages.filter(m => m.senderId !== CURRENT_USER.id).length : 0;
                        const key = `${selectedCommunity.id}-${member.id}`;
                        setReadPrivateChatCounts(prev => ({ ...prev, [key]: otherCount }));
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
                  );
                })()}
              </View>
            ))}
          </>

          {/* Invite Section (Owner only) */}
          {isOwnerView && (
            <View style={styles.inviteSection}>
              <Text style={[styles.sectionLabel, { color: colors.secondaryText, marginTop: 24 }]}>INVITE MEMBERS</Text>
              <View style={[styles.inviteCard, { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder }]}>
                <View style={[styles.inviteIconContainer, { backgroundColor: colors.cardSolid }]}>
                  <Ionicons name="person-add-outline" size={24} color={selectedCommunity.color} />
                </View>
                <View style={styles.inviteTextContainer}>
                  <Text style={[styles.inviteTitle, { color: colors.primaryText }]}>Share your invite code</Text>
                  <Text style={[styles.inviteSubtitle, { color: colors.secondaryText }]}>Code: {selectedCommunity.inviteCode}</Text>
                </View>
                <BounceButton
                  style={[styles.copyButton, { backgroundColor: copiedCode ? '#34D399' : selectedCommunity.color }]}
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
    const messages = currentCommunity?.chatMessages || [];

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
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatContent}
          inverted={false}
          renderItem={({ item }) => {
            const isMe = item.senderId === CURRENT_USER.id;
            return (
              <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
                {!isMe && (
                  <View style={[styles.messageAvatar, { backgroundColor: getAvatarColor(item.senderId) }]}>
                    <Text style={styles.messageAvatarText}>
                      {item.senderName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : [styles.messageBubbleOther, { backgroundColor: colors.cardSolid }]]}>
                  {!isMe && <Text style={[styles.messageSender, { color: colors.secondaryText }]}>{item.senderName}</Text>}
                  <Text style={[styles.messageText, { color: colors.primaryText }, isMe && styles.messageTextMe]}>{item.message}</Text>
                  <Text style={[styles.messageTime, { color: colors.secondaryText }, isMe && styles.messageTimeMe]}>
                    {formatTime(item.timestamp)}
                  </Text>
                </View>
              </View>
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

    const otherMembers = selectedCommunity.members.filter(m => m.id !== CURRENT_USER.id);
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
                  shareWith === 'everyone' && { borderColor: selectedCommunity.color, borderWidth: 2 }
                ]}
                onPress={() => {
                  setShareWith('everyone');
                  setSelectedMembers([]);
                }}
              >
                <View style={[styles.shareIcon, { backgroundColor: `${selectedCommunity.color}20` }]}>
                  <Ionicons name="people" size={20} color={selectedCommunity.color} />
                </View>
                <View style={styles.selectableCardInfo}>
                  <Text style={[styles.selectableCardTitle, { color: colors.primaryText }]}>Everyone</Text>
                  <Text style={[styles.selectableCardMeta, { color: colors.secondaryText }]}>All {otherMembers.length} members</Text>
                </View>
                {shareWith === 'everyone' && (
                  <Ionicons name="checkmark-circle" size={24} color={selectedCommunity.color} />
                )}
              </BounceButton>

              <BounceButton
                style={[
                  styles.selectableCard,
                  { backgroundColor: colors.cardTranslucent, borderColor: colors.cardBorder },
                  shareWith !== 'everyone' && { borderColor: selectedCommunity.color, borderWidth: 2 }
                ]}
                onPress={() => setShareWith([])}
              >
                <View style={[styles.shareIcon, { backgroundColor: `${selectedCommunity.color}20` }]}>
                  <Ionicons name="person" size={20} color={selectedCommunity.color} />
                </View>
                <View style={styles.selectableCardInfo}>
                  <Text style={[styles.selectableCardTitle, { color: colors.primaryText }]}>Select Members</Text>
                  <Text style={[styles.selectableCardMeta, { color: colors.secondaryText }]}>
                    {selectedMembers.length > 0 ? `${selectedMembers.length} selected` : 'Choose specific members'}
                  </Text>
                </View>
                {shareWith !== 'everyone' && (
                  <Ionicons name="checkmark-circle" size={24} color={selectedCommunity.color} />
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
                        selectedMembers.includes(member.id) && { backgroundColor: `${selectedCommunity.color}15` }
                      ]}
                      onPress={() => toggleMemberSelection(member.id)}
                    >
                      <View style={[styles.memberSelectAvatar, { backgroundColor: getAvatarColor(member.id) }]}>
                        <Text style={styles.memberSelectAvatarText}>
                          {member.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.memberSelectName, { color: colors.primaryText }]}>{member.name}</Text>
                      {selectedMembers.includes(member.id) && (
                        <Ionicons name="checkmark-circle" size={20} color={selectedCommunity.color} />
                      )}
                    </BounceButton>
                  ))}
                </View>
              )}

              {/* Share Button (Owner) */}
              <BounceButton
                style={[styles.shareButton, { backgroundColor: selectedCommunity.color }]}
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
                  <View style={[styles.memberAvatar, { backgroundColor: getAvatarColor(coach.id), width: 36, height: 36, borderRadius: 18 }]}>
                    <Text style={[styles.memberAvatarText, { fontSize: 14 }]}>{coach.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.selectableCardMeta, { color: colors.secondaryText, marginTop: 0 }]}>Sharing with</Text>
                    <Text style={[styles.selectableCardTitle, { color: colors.primaryText }]}>{coach.name}</Text>
                  </View>
                  <Ionicons name="shield-checkmark" size={20} color={selectedCommunity.color} />
                </View>
              )}
              <BounceButton
                style={[styles.shareButton, { backgroundColor: selectedCommunity.color }]}
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

    const privateChat = getPrivateChat(selectedCommunity.id, privateChatMember.id);
    const messages = privateChat?.messages || [];

    const handleSendPrivate = () => {
      if (privateMessage.trim()) {
        sendPrivateMessage(
          selectedCommunity.id,
          privateChatMember.id,
          privateChatMember.name,
          privateMessage.trim()
        );
        setPrivateMessage('');
        Keyboard.dismiss();
      }
    };

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.privateChatHeader}>
          <TouchableOpacity style={[styles.heroBannerBtn, { backgroundColor: colors.backButtonBg }]} onPress={handleBack}>
            <Ionicons name="chevron-back" size={28} color={colors.primaryText} />
          </TouchableOpacity>
          <View style={styles.privateChatHeaderInfo}>
            <View style={[styles.privateChatHeaderAvatar, { backgroundColor: getAvatarColor(privateChatMember.id) }]}>
              <Text style={styles.privateChatHeaderAvatarText}>
                {privateChatMember.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.privateChatHeaderText}>
              <Text style={[styles.privateChatHeaderName, { color: colors.primaryText }]}>{privateChatMember.name}</Text>
              <Text style={[styles.privateChatHeaderSubtitle, { color: colors.secondaryText }]}>Private Chat</Text>
            </View>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatContent}
          inverted={false}
          ListEmptyComponent={
            <View style={styles.emptyChatState}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.secondaryText} />
              <Text style={[styles.emptyChatText, { color: colors.primaryText }]}>No messages yet</Text>
              <Text style={[styles.emptyChatSubtext, { color: colors.secondaryText }]}>Start a conversation with {privateChatMember.name}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.senderId === CURRENT_USER.id;
            return (
              <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
                {!isMe && (
                  <View style={[styles.messageAvatar, { backgroundColor: getAvatarColor(item.senderId) }]}>
                    <Text style={styles.messageAvatarText}>
                      {item.senderName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : [styles.messageBubbleOther, { backgroundColor: colors.cardSolid }]]}>
                  <Text style={[styles.messageText, { color: colors.primaryText }, isMe && styles.messageTextMe]}>{item.message}</Text>
                  <Text style={[styles.messageTime, { color: colors.secondaryText }, isMe && styles.messageTimeMe]}>
                    {formatTime(item.timestamp)}
                  </Text>
                </View>
              </View>
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

      {/* Create Community Modal */}
      <Modal visible={showCreateModal} transparent animationType="fade">
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
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputMulti, { backgroundColor: colors.inputBg, color: colors.primaryText }]}
              placeholder="Description (optional)"
              placeholderTextColor={colors.tertiaryText}
              value={newCommunityDesc}
              onChangeText={setNewCommunityDesc}
              multiline
              numberOfLines={3}
            />

            <BounceButton
              style={[styles.joinSearchBtn, !newCommunityName.trim() && { opacity: 0.5 }]}
              onPress={handleCreateCommunity}
              disabled={!newCommunityName.trim()}
            >
              <Ionicons name="add-circle" size={20} color="#1C1C1E" />
              <Text style={styles.joinSearchBtnText}>Create Community</Text>
            </BounceButton>

            <BounceButton
              style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
              onPress={() => {
                setShowCreateModal(false);
                setNewCommunityName('');
                setNewCommunityDesc('');
              }}
            >
              <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
            </BounceButton>
          </View>
        </View>
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

      {/* Options Menu Modal */}
      <BottomSheetModal visible={showOptionsMenu} onDismiss={() => setShowOptionsMenu(false)} overlayColor={colors.overlayBg}>
        <View style={[styles.optionsMenuContent, { backgroundColor: colors.modalBg }]}>
          <View style={[styles.optionsMenuHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#e0e0e0' }]} />
          {isOwnerView ? (
            <>
              <BounceButton
                style={[styles.optionsMenuItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setShowOptionsMenu(false);
                  if (selectedCommunity) {
                    setEditName(selectedCommunity.name);
                    setEditDesc(selectedCommunity.description);
                    setShowEditModal(true);
                  }
                }}
              >
                <Ionicons name="create-outline" size={22} color={colors.primaryText} />
                <Text style={[styles.optionsMenuItemText, { color: colors.primaryText }]}>Edit Community</Text>
              </BounceButton>
              <BounceButton
                style={[styles.optionsMenuItem, styles.optionsMenuItemLast]}
                onPress={() => {
                  setShowOptionsMenu(false);
                  if (selectedCommunity) {
                    deleteCommunity(selectedCommunity.id);
                    setViewMode('list');
                    setSelectedCommunity(null);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                }}
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
          )}
        </View>
      </BottomSheetModal>

      {/* Manage Members Modal */}
      <BottomSheetModal visible={showManageMembersModal} onDismiss={() => setShowManageMembersModal(false)} overlayColor={colors.overlayBg}>
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
                    setShowRemoveConfirmation(true);
                  }}
                >
                  <View style={[styles.memberAvatar, { backgroundColor: getAvatarColor(member.id) }]}>
                    <Text style={styles.memberAvatarText}>
                      {member.name.charAt(0).toUpperCase()}
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
          <BounceButton
            style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
            onPress={() => setShowManageMembersModal(false)}
          >
            <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
          </BounceButton>
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
                    const updated = ownedCommunities.find(c => c.id === selectedCommunity.id);
                    if (updated) setSelectedCommunity(updated);
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

      {/* Edit Community Modal */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={[styles.joinModalOverlay, { backgroundColor: colors.overlayBg }]}>
          <View style={[styles.joinModalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.primaryText }]}>Edit Community</Text>
            <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]}>Update your community details</Text>

            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.inputBg, color: colors.primaryText }]}
              placeholder="Community Name"
              placeholderTextColor={colors.tertiaryText}
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputMulti, { backgroundColor: colors.inputBg, color: colors.primaryText }]}
              placeholder="Description (optional)"
              placeholderTextColor={colors.tertiaryText}
              value={editDesc}
              onChangeText={setEditDesc}
              multiline
              numberOfLines={3}
            />

            <BounceButton
              style={[styles.joinSearchBtn, !editName.trim() && { opacity: 0.5 }]}
              onPress={() => {
                if (selectedCommunity && editName.trim()) {
                  updateCommunity(selectedCommunity.id, editName.trim(), editDesc.trim());
                  const updated = ownedCommunities.find(c => c.id === selectedCommunity.id);
                  if (updated) {
                    setSelectedCommunity({ ...updated, name: editName.trim(), description: editDesc.trim() });
                  }
                  setShowEditModal(false);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
              }}
              disabled={!editName.trim()}
            >
              <Ionicons name="checkmark-circle" size={20} color="#1C1C1E" />
              <Text style={styles.joinSearchBtnText}>Save Changes</Text>
            </BounceButton>

            <BounceButton
              style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
              onPress={() => {
                setShowEditModal(false);
                setEditName('');
                setEditDesc('');
              }}
            >
              <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
            </BounceButton>
          </View>
        </View>
      </Modal>

      {/* Manage Programs Modal */}
      <BottomSheetModal visible={showManageProgramsModal} onDismiss={() => setShowManageProgramsModal(false)} overlayColor={colors.overlayBg}>
        <TouchableOpacity activeOpacity={1} style={[styles.manageMembersContent, { backgroundColor: colors.modalBg }]}>
          <View style={[styles.optionsMenuHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#e0e0e0' }]} />
          <Text style={[styles.manageMembersTitle, { color: colors.primaryText }]}>Remove Programs</Text>
          <Text style={[styles.manageMembersSubtitle, { color: colors.secondaryText }]}>Select a program to remove from the community</Text>
          <ScrollView style={styles.manageMembersList} showsVerticalScrollIndicator={false}>
            {selectedCommunity?.sharedWorkouts.map(workout => (
              <BounceButton
                key={workout.id}
                style={[styles.manageMemberItem, { backgroundColor: colors.inputBg }]}
                onPress={() => {
                  setProgramToRemove({ id: workout.id, name: workout.programName });
                  setShowManageProgramsModal(false);
                  setShowRemoveProgramConfirmation(true);
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
          <BounceButton
            style={[styles.joinCancelBtn, { backgroundColor: isDark ? '#252538' : '#f5f5f5', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#d0d0d0' }]}
            onPress={() => setShowManageProgramsModal(false)}
          >
            <Text style={[styles.joinCancelBtnText, { color: colors.secondaryText }]}>Cancel</Text>
          </BounceButton>
        </TouchableOpacity>
      </BottomSheetModal>

      {/* Remove Program Confirmation Modal */}
      <Modal visible={showRemoveProgramConfirmation} transparent animationType="fade">
        <View style={[styles.joinModalOverlay, { backgroundColor: colors.overlayBg }]}>
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
                    const updated = ownedCommunities.find(c => c.id === selectedCommunity.id);
                    if (updated) setSelectedCommunity(updated);
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
    paddingBottom: 20,
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
    fontSize: 26,
    fontFamily: 'Arimo_700Bold',
    color: '#FFFFFF',
  },
  heroBannerDesc: {
    fontSize: 14,
    fontFamily: 'Arimo_400Regular',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  memberCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
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
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Arimo_400Regular',
    color: '#2c3e50',
    marginBottom: 12,
  },
  modalInputMulti: {
    minHeight: 80,
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
    paddingBottom: 34,
    paddingHorizontal: 20,
    maxHeight: '70%',
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
});
