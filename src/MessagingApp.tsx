import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import * as SecureStore from 'expo-secure-store';
import { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { ChatList } from './components/ChatList';
import { ConversationView } from './components/ConversationView';
import { CreateChatCard } from './components/CreateChatCard';
import { MessageComposer } from './components/MessageComposer';
import { buildChatMessages, buildChatThread } from './lib/chatMappers';
import { adminClearChatMessages, createChat, deleteOwnMessage, fetchAdminChatClears, fetchChatReadMarkers, fetchChatRowsForCurrentUser, fetchSelectableUsers, notifyNewMessage, sendAttachmentMessage, sendTextMessage, upsertChatReadMarker, upsertPushToken } from './lib/chatService';
import { getSupabaseClient } from './lib/supabase';
import { palette } from './theme/palette';
import { AnnouncementRecord, ChatMessage, ChatThread, MediaLibraryRecord, PendingAttachment, QuickReplyRecord, SelectableUser } from './types/chat';
import { isAnnouncementActiveNow } from './lib/announcementScheduling';

type MessagingAppProps = {
  session: Session;
  adminMode?: boolean;
  adminSoundEnabled?: boolean;
  clientMode?: boolean;
  quickReplyToInsert?: QuickReplyRecord | null;
  mediaToInsert?: MediaLibraryRecord | null;
  onResourceApplied?: () => void;
  incomingSharedAttachment?: PendingAttachment | null;
  incomingSharedText?: string | null;
  onSharedApplied?: () => void;
};

type MobileView = 'chats' | 'conversation';
type AdminInboxFilter = 'all' | 'unread';
type MessageFlagsStorage = {
  starred: string[];
  pinned: string[];
  pinnedExpirations?: Record<string, number>;
};
type ReplyPreview = { author: string; snippet: string; messageId: string } | null;

const brandLogo = require('../assets/chat-santanita-logo.jpeg');

function pickWebRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];

  for (const candidate of candidates) {
    try {
      if ((MediaRecorder as any).isTypeSupported?.(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }

  return '';
}

function extensionForMimeType(mimeType: string) {
  const normalized = (mimeType || '').toLowerCase();
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('m4a') || normalized.includes('mp4')) return 'm4a';
  return 'webm';
}

function getReadableErrorMessage(error: unknown, fallback: string) {
  if (!error) {
    return fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === 'string') {
    return error || fallback;
  }

  if (typeof error === 'object') {
    const maybe = error as any;
    const message = typeof maybe.message === 'string' ? maybe.message : '';
    const details = typeof maybe.details === 'string' ? maybe.details : '';
    const hint = typeof maybe.hint === 'string' ? maybe.hint : '';
    const code = typeof maybe.code === 'string' ? maybe.code : '';

    const parts = [message, details, hint].map((value) => value.trim()).filter(Boolean);
    const combined = parts.join(' | ');
    if (combined) {
      return code ? `${combined} (code ${code})` : combined;
    }
  }

  return fallback;
}

function readMarkersStorageKey(userId: string) {
  return 'messaging-read-markers:' + userId;
}

function messageFlagsStorageKey(userId: string) {
  return 'messaging-message-flags:' + userId;
}

function dismissedAnnouncementsStorageKey(userId: string) {
  return 'messaging-dismissed-announcements:' + userId;
}

function loadMessageFlags(userId: string): MessageFlagsStorage {
  if (Platform.OS !== 'web') {
    return { starred: [], pinned: [] };
  }

  try {
    const stored = window.localStorage.getItem(messageFlagsStorageKey(userId));
    const parsed = stored ? (JSON.parse(stored) as Partial<MessageFlagsStorage>) : {};
    const expirationsRaw = parsed.pinnedExpirations;
    const pinnedExpirations: Record<string, number> = {};
    if (expirationsRaw && typeof expirationsRaw === 'object') {
      for (const [key, value] of Object.entries(expirationsRaw as Record<string, unknown>)) {
        if (typeof key === 'string' && (typeof value === 'number' || typeof value === 'string')) {
          const numberValue = typeof value === 'number' ? value : Number(value);
          if (Number.isFinite(numberValue)) {
            pinnedExpirations[key] = numberValue;
          }
        }
      }
    }
    return {
      starred: Array.isArray(parsed.starred) ? parsed.starred.filter((id) => typeof id === 'string') : [],
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter((id) => typeof id === 'string') : [],
      pinnedExpirations,
    };
  } catch {
    window.localStorage.removeItem(messageFlagsStorageKey(userId));
    return { starred: [], pinned: [] };
  }
}

function persistMessageFlagsWeb(userId: string, next: MessageFlagsStorage) {
  try {
    window.localStorage.setItem(messageFlagsStorageKey(userId), JSON.stringify(next));
  } catch {
    // ignore
  }
}

async function loadMessageFlagsMobile(userId: string): Promise<MessageFlagsStorage> {
  try {
    const stored = await SecureStore.getItemAsync(messageFlagsStorageKey(userId));
    const parsed = stored ? (JSON.parse(stored) as Partial<MessageFlagsStorage>) : {};
    const expirationsRaw = parsed.pinnedExpirations;
    const pinnedExpirations: Record<string, number> = {};
    if (expirationsRaw && typeof expirationsRaw === 'object') {
      for (const [key, value] of Object.entries(expirationsRaw as Record<string, unknown>)) {
        if (typeof key === 'string' && (typeof value === 'number' || typeof value === 'string')) {
          const numberValue = typeof value === 'number' ? value : Number(value);
          if (Number.isFinite(numberValue)) {
            pinnedExpirations[key] = numberValue;
          }
        }
      }
    }
    return {
      starred: Array.isArray(parsed.starred) ? parsed.starred.filter((id) => typeof id === 'string') : [],
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter((id) => typeof id === 'string') : [],
      pinnedExpirations,
    };
  } catch {
    return { starred: [], pinned: [] };
  }
}

async function persistMessageFlagsMobile(userId: string, next: MessageFlagsStorage) {
  try {
    await SecureStore.setItemAsync(messageFlagsStorageKey(userId), JSON.stringify(next));
  } catch {
    // ignore
  }
}

async function loadDismissedAnnouncements(userId: string): Promise<string[]> {
  try {
    if (Platform.OS === 'web') {
      const stored = window.localStorage.getItem(dismissedAnnouncementsStorageKey(userId));
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    }

    const stored = await SecureStore.getItemAsync(dismissedAnnouncementsStorageKey(userId));
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function persistDismissedAnnouncements(userId: string, dismissed: string[]) {
  try {
    const payload = JSON.stringify(Array.from(new Set(dismissed)));
    if (Platform.OS === 'web') {
      window.localStorage.setItem(dismissedAnnouncementsStorageKey(userId), payload);
      return;
    }
    await SecureStore.setItemAsync(dismissedAnnouncementsStorageKey(userId), payload);
  } catch {
    // ignore
  }
}

function loadStoredReadMarkers(userId: string) {
  if (Platform.OS !== 'web') {
    return {} as Record<string, string>;
  }

  try {
    const stored = window.localStorage.getItem(readMarkersStorageKey(userId));
    return stored ? (JSON.parse(stored) as Record<string, string>) : {};
  } catch {
    window.localStorage.removeItem(readMarkersStorageKey(userId));
    return {} as Record<string, string>;
  }
}

function mergeReadMarkers(current: Record<string, string>, incoming: Record<string, string>) {
  const merged = { ...current };

  for (const [chatId, timestamp] of Object.entries(incoming)) {
    if (!timestamp) {
      continue;
    }

    if (!merged[chatId] || merged[chatId] < timestamp) {
      merged[chatId] = timestamp;
    }
  }

  return merged;
}

function isTransientSupabaseLockError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');

  return message.includes('was released because another request stole it') || message.includes('Lock "lock:');
}

function formatStatusError(message: string | null) {
  if (!message) {
    return null;
  }

  if (message.includes('was released because another request stole it') || message.includes('Lock "lock:')) {
    return 'Sincronizando conversaciones...';
  }

  return message;
}

function buildQuickReplyInsertText(reply: QuickReplyRecord) {
  const badge = [reply.tag_emoji?.trim(), reply.tag?.trim()].filter(Boolean).join(' ');
  const body = reply.body.trim();

  if (badge && body) {
    return `${badge}\n${body}`;
  }

  return badge || body;
}

function getBrowserAudioContext() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  const browserWindow = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };

  return browserWindow.AudioContext || browserWindow.webkitAudioContext || null;
}
export function MessagingApp({
  session,
  adminMode,
  adminSoundEnabled = true,
  clientMode,
  quickReplyToInsert,
  mediaToInsert,
  onResourceApplied,
  incomingSharedAttachment,
  incomingSharedText,
  onSharedApplied,
}: MessagingAppProps) {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 960;
  const isCompactHeight = height < 860;
  const desktopViewportHeight = Math.max(640, height - 32);
  const [mobileView, setMobileView] = useState<MobileView>('chats');
  const [selectedChatId, setSelectedChatId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyPreviewByChat, setReplyPreviewByChat] = useState<Record<string, ReplyPreview>>({});
  const [messageFlags, setMessageFlags] = useState<MessageFlagsStorage>(() => loadMessageFlags(session.user.id));
  const [search, setSearch] = useState('');
  const [adminInboxFilter, setAdminInboxFilter] = useState<AdminInboxFilter>('all');
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<string[]>([]);
  const [activeAnnouncements, setActiveAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [activeAnnouncementIndex, setActiveAnnouncementIndex] = useState(0);
  const [liveChats, setLiveChats] = useState<ChatThread[]>([]);
  const [liveMessages, setLiveMessages] = useState<Record<string, ChatMessage[]>>({});
  const [availableUsers, setAvailableUsers] = useState<SelectableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [adminContactId, setAdminContactId] = useState<string>('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [creatingChat, setCreatingChat] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [audioRecording, setAudioRecording] = useState<Audio.Recording | null>(null);
  const [audioRecordingBusy, setAudioRecordingBusy] = useState(false);
  const webMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webAudioStreamRef = useRef<MediaStream | null>(null);
  const webAudioChunksRef = useRef<BlobPart[]>([]);
  const [webAudioRecording, setWebAudioRecording] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [readMarkers, setReadMarkers] = useState<Record<string, string>>(() => loadStoredReadMarkers(session.user.id));
  const [latestIncomingByChat, setLatestIncomingByChat] = useState<Record<string, string>>({});
  const selectedChatIdRef = useRef(selectedChatId);
  const readMarkersRef = useRef(readMarkers);
  const latestIncomingByChatRef = useRef(latestIncomingByChat);
  const conversationVisibleRef = useRef(isDesktop || mobileView === 'conversation');
  const audioContextRef = useRef<AudioContext | null>(null);
  const notificationAudioArmedRef = useRef(false);
  const lastIncomingSnapshotRef = useRef('');
  const unreadCountsRef = useRef<Record<string, number>>({});
  const lastNotifiedAtRef = useRef<Record<string, number>>({});
  const [mobileUnreadTotal, setMobileUnreadTotal] = useState(0);
  const [pushStatus, setPushStatus] = useState<string>('');
  const webFaviconOriginalHrefRef = useRef<string | null>(null);
  const webTitleOriginalRef = useRef<string | null>(null);

  useEffect(() => {
    // Message flags (star/pin) are an admin-only convenience. On mobile we persist them in SecureStore.
    if (Platform.OS === 'web') {
      return;
    }

    let cancelled = false;
    void loadMessageFlagsMobile(session.user.id).then((loaded) => {
      if (cancelled) return;
      setMessageFlags(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, [adminMode, session.user.id]);

  useEffect(() => {
    // Admin web: show unread count on the tab/favicon (WhatsApp-style).
    if (Platform.OS !== 'web') return;
    if (!adminMode) return;
    if (typeof document === 'undefined') return;

    const totalUnread = liveChats.reduce((sum, chat) => sum + (chat.unreadCount ?? 0), 0);

    // Badging API (installed PWA on Chrome/Edge).
    try {
      const nav: any = globalThis.navigator as any;
      if (totalUnread > 0) {
        void nav?.setAppBadge?.(totalUnread)?.catch?.(() => undefined);
      } else {
        void nav?.clearAppBadge?.()?.catch?.(() => undefined);
      }
    } catch {
      // ignore
    }

    // Title prefix fallback (works everywhere).
    if (!webTitleOriginalRef.current) {
      webTitleOriginalRef.current = document.title || 'Chat Santanita CRM';
    }
    const baseTitle = webTitleOriginalRef.current;
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? '99+' : totalUnread}) ${baseTitle}` : baseTitle;

    // Favicon badge (tab icon).
    const iconLink =
      (document.querySelector('link[rel=\"icon\"]') as HTMLLinkElement | null) ??
      (document.querySelector('link[rel=\"shortcut icon\"]') as HTMLLinkElement | null);
    if (!iconLink) return;

    if (!webFaviconOriginalHrefRef.current) {
      webFaviconOriginalHrefRef.current = iconLink.href;
    }

    if (totalUnread <= 0) {
      iconLink.href = webFaviconOriginalHrefRef.current;
      return;
    }

    const faviconSrc = webFaviconOriginalHrefRef.current;
    const ImgCtor: any = (globalThis as any).Image;
    const img: any = ImgCtor ? new ImgCtor() : null;
    if (!img) return;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);

      // Red badge circle on top-right.
      const r = 18;
      const cx = size - r;
      const cy = r;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      // Count text.
      const text = totalUnread > 99 ? '99+' : String(totalUnread);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy + 1);

      iconLink.href = canvas.toDataURL('image/png');
    };
    img.onerror = () => undefined;
    img.src = faviconSrc;
  }, [adminMode, liveChats]);

  useEffect(() => { 
    if (Platform.OS === 'web') { 
      return; 
    } 
 
    // Important: Android notification channels are immutable once created (sound/importance changes
    // may not apply). We use a versioned channel id so upgrades can reliably enable sound.
    const PUSH_CHANNEL_ID = 'messages_v2'; 

    Notifications.setNotificationHandler({ 
      handleNotification: async () => ({ 
        shouldShowAlert: true, 
        shouldShowBanner: true, 
        shouldShowList: true, 
        // Allow sound when a notification is shown while the app is in foreground.
        // Background sound is controlled by the Expo push payload + Android channel config.
        shouldPlaySound: true, 
        shouldSetBadge: false, 
      }), 
    }); 

    void (async () => {
      try {
        const permissions = await Notifications.getPermissionsAsync();
        if (permissions.status !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }

        if (Platform.OS === 'android') { 
          await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, { 
            name: 'Mensajes', 
            // Use a high-importance channel so Android is allowed to play sound/vibrate even after long inactivity.
            importance: Notifications.AndroidImportance.HIGH, 
            sound: 'default', 
            vibrationPattern: [0, 180, 100, 180], 
            lightColor: '#4ade80', 
          }); 
        } 
      } catch { 
        // Best effort; app still works without local notifications. 
      } 
    })(); 
  }, []); 

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let subscription: Notifications.Subscription | null = null;

    const handleOpenFromNotification = (data: unknown) => {
      const payload = data as { chatId?: string } | null | undefined;
      const chatId = typeof payload?.chatId === 'string' ? payload.chatId : '';
      if (!chatId) return;

      setSelectedChatId(chatId);
      setMobileView('conversation');
    };

    void (async () => {
      try {
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last?.notification?.request?.content?.data) {
          handleOpenFromNotification(last.notification.request.content.data);
        }
      } catch {
        // Ignore
      }
    })();

    subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleOpenFromNotification(response.notification.request.content.data);
    });

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    // Register Expo push token for background notifications.
    void (async () => {
      try {
        setPushStatus('Push: preparando...');
        const existing = await Notifications.getPermissionsAsync();
        if (existing.status !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          if (requested.status !== 'granted') {
            setPushStatus('Push: permisos denegados');
            return;
          }
        }

        const projectId =
          (Constants as any)?.expoConfig?.extra?.eas?.projectId ??
          (Constants as any)?.easConfig?.projectId ??
          undefined;

        if (!projectId) {
          setPushStatus('Push: falta projectId');
          return;
        }

        setPushStatus('Push: obteniendo token...');
        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        const expoPushToken = tokenResponse.data;

        if (!expoPushToken) {
          setPushStatus('Push: token vacio');
          return;
        }

        setPushStatus('Push: guardando token...');
        await upsertPushToken({
          userId: session.user.id,
          expoPushToken,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          deviceId: (Constants as any)?.deviceId ?? null,
        });

        setPushStatus('Push: listo');
      } catch (error) {
        // Best effort, but keep a hint visible in development builds.
        const msg =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'error desconocido';
        setPushStatus(`Push error: ${msg}`);
        // eslint-disable-next-line no-console
        console.warn('push token registration failed', error);
      }
    })();
  }, [session.user.id]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    readMarkersRef.current = readMarkers;
  }, [readMarkers]);

  useEffect(() => {
    latestIncomingByChatRef.current = latestIncomingByChat;
  }, [latestIncomingByChat]);

  useEffect(() => {
    conversationVisibleRef.current = isDesktop || mobileView === 'conversation';
  }, [isDesktop, mobileView]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !adminMode || !adminSoundEnabled) {
      return;
    }

    const armAudio = () => {
      notificationAudioArmedRef.current = true;

      // Also request web notification permission on a user gesture (helps Franz/desktop wrappers).
      try {
        const WebNotification: any = (globalThis as any).Notification;
        if (WebNotification && WebNotification.permission === 'default') {
          void WebNotification.requestPermission?.().catch?.(() => undefined);
        }
      } catch {
        // ignore
      }

      const AudioContextCtor = getBrowserAudioContext();
      if (!AudioContextCtor || audioContextRef.current) {
        return;
      }

      try {
        audioContextRef.current = new AudioContextCtor();
      } catch {
        audioContextRef.current = null;
      }
    };

    window.addEventListener('pointerdown', armAudio, { passive: true });
    window.addEventListener('keydown', armAudio);

    return () => {
      window.removeEventListener('pointerdown', armAudio);
      window.removeEventListener('keydown', armAudio);
    };
  }, [adminMode, adminSoundEnabled]);

  const playIncomingMessageTone = useCallback(async () => {
    if (Platform.OS !== 'web' || !adminMode || !adminSoundEnabled || !notificationAudioArmedRef.current) {
      return;
    }

    const AudioContextCtor = getBrowserAudioContext();
    if (!AudioContextCtor) {
      return;
    }

    try {
      const context = audioContextRef.current ?? new AudioContextCtor();
      audioContextRef.current = context;

      if (context.state === 'suspended') {
        await context.resume();
      }

      const now = context.currentTime; 
      const masterGain = context.createGain(); 
      masterGain.connect(context.destination); 
      masterGain.gain.setValueAtTime(0.0001, now); 
      // Siren-like sweep: loud and hard to miss.
      masterGain.gain.exponentialRampToValueAtTime(0.28, now + 0.02); 
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15); 
 
      const siren = context.createOscillator(); 
      siren.type = 'sawtooth'; 
      siren.connect(masterGain); 
 
      // Sweep up/down a few times (roughly 1.1s total).
      const low = 520; 
      const high = 1180; 
      siren.frequency.setValueAtTime(low, now); 
      siren.frequency.linearRampToValueAtTime(high, now + 0.22); 
      siren.frequency.linearRampToValueAtTime(low, now + 0.44); 
      siren.frequency.linearRampToValueAtTime(high, now + 0.66); 
      siren.frequency.linearRampToValueAtTime(low, now + 0.88); 
      siren.frequency.linearRampToValueAtTime(high, now + 1.1); 
 
      siren.start(now); 
      siren.stop(now + 1.12); 
    } catch { 
      return; 
    } 
  }, [adminMode, adminSoundEnabled]); 

  const persistReadMarkers = useCallback(
    (nextMarkers: Record<string, string>) => {
      setReadMarkers(nextMarkers);
      readMarkersRef.current = nextMarkers;

      if (Platform.OS === 'web') {
        window.localStorage.setItem(readMarkersStorageKey(session.user.id), JSON.stringify(nextMarkers));
      }
    },
    [session.user.id]
  );

  const markChatAsRead = useCallback(
    (chatId: string, explicitTimestamp?: string) => {
      const latestIncoming = explicitTimestamp ?? latestIncomingByChatRef.current[chatId];
      if (!latestIncoming) {
        return;
      }

      const currentMarker = readMarkersRef.current[chatId];
      if (currentMarker && currentMarker >= latestIncoming) {
        return;
      }

      const nextMarkers = {
        ...readMarkersRef.current,
        [chatId]: latestIncoming,
      };

      persistReadMarkers(nextMarkers);

      // Optimistic UI: unread counters (and favicon/title badges) should clear immediately when opening a chat.
      unreadCountsRef.current = { ...unreadCountsRef.current, [chatId]: 0 };
      setLiveChats((current) => current.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat)));
      void upsertChatReadMarker(chatId, latestIncoming).catch(() => undefined);
    },
    [persistReadMarkers]
  );

  const replacePendingAttachment = useCallback((nextAttachment: PendingAttachment | null) => {
    setPendingAttachment((current) => {
      if (Platform.OS === 'web' && current?.uri.startsWith('blob:') && current.uri !== nextAttachment?.uri) {
        URL.revokeObjectURL(current.uri);
      }

      return nextAttachment;
    });
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);

    try {
      const users = await fetchSelectableUsers(session.user.id, { onlyAdmins: Boolean(clientMode) });
      setAvailableUsers(users);
    } catch (error) {
      setCreateMessage(error instanceof Error ? error.message : 'No fue posible cargar los usuarios.');
    } finally {
      setLoadingUsers(false);
    }
  }, [clientMode, session.user.id]);

  const loadChats = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoadingChats(true);
      setLoadingError(null);
    }

    try {
      const [{ userId, rows }, serverReadMarkers, adminClears] = await Promise.all([
        fetchChatRowsForCurrentUser(),
        fetchChatReadMarkers(),
        Platform.OS === 'web' && adminMode ? fetchAdminChatClears() : Promise.resolve({}),
      ]);
      const scopedRows = clientMode
        ? rows.filter((row) =>
            row.type === 'direct' &&
            row.members.length === 2 &&
            row.members.some((member) => member.user_id !== userId && member.profile?.role === 'admin') &&
            row.members.every((member) => member.user_id === userId || member.profile?.role === 'admin')
          )
        : rows;

      // Admin-only "clear chat" should not delete messages for the client.
      // We implement it as a per-admin cleared_at marker and filter messages on the admin web UI.
      const clearedAtByChat = (Platform.OS === 'web' && adminMode ? (adminClears as Record<string, string>) : {}) ?? {};
      const filteredRows =
        Platform.OS === 'web' && adminMode
          ? scopedRows.map((row) => {
              const clearedAt = clearedAtByChat[row.id] ?? '';
              if (!clearedAt) return row;
              return { ...row, messages: row.messages.filter((message) => message.created_at > clearedAt) };
            })
          : scopedRows;
      const effectiveReadMarkers = mergeReadMarkers(readMarkersRef.current, serverReadMarkers);
      if (JSON.stringify(effectiveReadMarkers) !== JSON.stringify(readMarkersRef.current)) {
        persistReadMarkers(effectiveReadMarkers);
      }
      const nextLatestIncomingByChat = Object.fromEntries(
        filteredRows.map((row) => {
          const latestIncoming = [...row.messages].reverse().find((message) => message.sender_id !== userId);
          return [row.id, latestIncoming?.created_at ?? ''];
        })
      ) as Record<string, string>;

      const activeChatId = selectedChatIdRef.current;
      if (activeChatId && conversationVisibleRef.current && nextLatestIncomingByChat[activeChatId]) {
        markChatAsRead(activeChatId, nextLatestIncomingByChat[activeChatId]);
      }

      const nextChats = filteredRows.map((row) => {
        const lastMessage = row.messages[row.messages.length - 1] ?? null;
        const unreadCount = row.messages.filter(
          (message) => message.sender_id !== userId && (!effectiveReadMarkers[row.id] || message.created_at > effectiveReadMarkers[row.id])
        ).length;

        return buildChatThread({
          chat: row,
          members: row.members,
          lastMessage,
          currentUserId: userId,
          unreadCount,
          useAdminAlias: Boolean(adminMode),
        });
      });

      const nextMessages = Object.fromEntries(
        filteredRows.map((row) => [row.id, buildChatMessages(row.messages, userId, Boolean(adminMode))])
      ) as Record<string, ChatMessage[]>;

      // Compute read-receipts for outgoing messages using the other member's chat_read_markers.
      // Best-effort: if policies block reading other markers, we keep the existing behavior.
      // Applied for admin web and also mobile (clients can see when the admin read their messages).
      if (adminMode || Platform.OS !== 'web') {
        try {
          const supabase = getSupabaseClient();
          const chatIds = scopedRows.map((row) => row.id);

          if (chatIds.length > 0) {
            const { data: otherMarkers, error: markersError } = await supabase
              .from('chat_read_markers')
              .select('chat_id,user_id,last_read_message_at')
              .in('chat_id', chatIds)
              .neq('user_id', userId);

            if (markersError) {
              console.warn('read-receipts: unable to load client read markers', markersError);
            }

            if (!markersError && otherMarkers) {
              const otherReadAtByChat = (otherMarkers as Array<{ chat_id: string; last_read_message_at: string | null }>).reduce(
                (acc, row) => {
                  if (!row.chat_id || !row.last_read_message_at) return acc;
                  if (!acc[row.chat_id] || acc[row.chat_id] < row.last_read_message_at) {
                    acc[row.chat_id] = row.last_read_message_at;
                  }
                  return acc;
                },
                {} as Record<string, string>
              );

              for (const [chatId, messages] of Object.entries(nextMessages)) {
                const readAt = otherReadAtByChat[chatId] ?? '';

                nextMessages[chatId] = messages.map((message) => {
                  if (message.direction !== 'outgoing') return message;
                  if (message.id.startsWith('local-')) return message;

                  // If we can compare against the other member marker, mark read; otherwise show delivered.
                  if (readAt && message.createdAt && message.createdAt <= readAt) {
                    return { ...message, status: 'leido' };
                  }

                  return { ...message, status: message.status ?? 'entregado' };
                });
              }
            }
          }
        } catch {
          // Best-effort only: if RLS/policies prevent reading other markers, keep current behavior.
        }
      }

      const nextUnreadCounts = Object.fromEntries(nextChats.map((chat) => [chat.id, chat.unreadCount ?? 0])) as Record<
        string,
        number
      >;
      const totalUnread = nextChats.reduce((sum, chat) => sum + (chat.unreadCount ?? 0), 0);

      if (Platform.OS !== 'web') {
        setMobileUnreadTotal(totalUnread);
        void Notifications.setBadgeCountAsync(totalUnread).catch(() => undefined);

        // Best-effort local notification when a new message arrives and the conversation is not visible.
        const activeChatId = selectedChatIdRef.current;
        for (const row of scopedRows) {
          const unreadCount = nextUnreadCounts[row.id] ?? 0;
          const prevUnread = unreadCountsRef.current[row.id] ?? 0;
          if (unreadCount <= prevUnread) {
            continue;
          }

          if (activeChatId === row.id && conversationVisibleRef.current) {
            continue;
          }

          const lastMessage = row.messages[row.messages.length - 1];
          if (!lastMessage || lastMessage.sender_id === userId) {
            continue;
          }

          const now = Date.now();
          const lastNotifiedAt = lastNotifiedAtRef.current[row.id] ?? 0;
          if (now - lastNotifiedAt < 1200) {
            continue;
          }
          lastNotifiedAtRef.current[row.id] = now;

          const preview =
            lastMessage.message_type === 'text'
              ? (lastMessage.body ?? 'Mensaje nuevo')
              : lastMessage.message_type === 'image'
                ? 'Imagen'
                : 'Archivo';

          void Notifications.scheduleNotificationAsync({
            content: {
              title: 'Mensaje nuevo',
              body: `${row.name ?? 'Chat'}: ${preview}`,
              sound: undefined,
            },
            trigger: null,
          }).catch(() => undefined);
        }
      }

      unreadCountsRef.current = nextUnreadCounts;
      setLatestIncomingByChat(nextLatestIncomingByChat);
      setLiveChats(nextChats);
      setLiveMessages(nextMessages);
      setSelectedChatId((current) => {
        if (nextChats.some((chat) => chat.id === current)) {
          return current;
        }

        return nextChats[0]?.id ?? '';
      });
    } catch (error) {
      if (isTransientSupabaseLockError(error)) {
        setLoadingError(null);
        return;
      }
      setLiveChats([]);
      setLiveMessages({});
      setSelectedChatId('');
      setLoadingError(error instanceof Error ? error.message : 'No fue posible cargar los chats.');
    } finally {
      if (!options?.silent) {
        setLoadingChats(false);
      }
    }
  }, [adminMode, clientMode, markChatAsRead, persistReadMarkers]);

  useEffect(() => {
    void Promise.all([loadUsers(), loadChats()]);
  }, [loadChats, loadUsers, session.user.id]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`messaging-realtime-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
        void loadChats({ silent: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members' }, () => {
        void loadChats({ silent: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        void loadChats({ silent: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        void loadUsers();
        void loadChats({ silent: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_read_markers' }, () => {
        void loadChats({ silent: true });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadChats, loadUsers, session.user.id]);

  useEffect(() => {
    if (!selectedChatId) {
      return;
    }

    const intervalId = setInterval(() => {
      void loadChats({ silent: true });
    }, 2500);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadChats, selectedChatId]);

  useEffect(() => {
    if (!selectedChatId && !isDesktop) {
      setMobileView('chats');
    }
  }, [isDesktop, selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) {
      return;
    }

    if (!(isDesktop || mobileView === 'conversation')) {
      return;
    }

    markChatAsRead(selectedChatId);
    void loadChats({ silent: true });
  }, [isDesktop, loadChats, markChatAsRead, mobileView, selectedChatId]);

  useEffect(() => {
    if (!quickReplyToInsert) {
      return;
    }

    if (!selectedChatId) {
      setLoadingError('Selecciona una conversacion antes de insertar un mensaje rapido.');
      onResourceApplied?.();
      return;
    }

    setDrafts((current) => {
      const previous = current[selectedChatId] ?? '';
      const quickReplyText = buildQuickReplyInsertText(quickReplyToInsert);
      const nextText = previous.trim().length > 0 ? `${previous.trim()}\n\n${quickReplyText}` : quickReplyText;

      return {
        ...current,
        [selectedChatId]: nextText,
      };
    });
    setLoadingError(null);
    setComposerFocusSignal((current) => current + 1);
    onResourceApplied?.();
  }, [onResourceApplied, quickReplyToInsert, selectedChatId]);

  useEffect(() => {
    if (!mediaToInsert) {
      return;
    }

    if (!selectedChatId) {
      setLoadingError('Selecciona una conversacion antes de insertar una imagen.');
      onResourceApplied?.();
      return;
    }

    const safeTag = mediaToInsert.tag?.trim();
    const extension = mediaToInsert.image_url.split('.').pop()?.split('?')[0]?.trim() || 'jpg';
    replacePendingAttachment({
      uri: mediaToInsert.image_url,
      name: `${mediaToInsert.title}.${extension}`,
      mimeType: 'image/jpeg',
      type: 'image',
    });
    setDrafts((current) => {
      if (!safeTag) {
        return current;
      }

      const previous = current[selectedChatId] ?? '';
      const nextText = previous.trim().length > 0 ? `${previous.trim()}\n${safeTag}` : safeTag;

      return {
        ...current,
        [selectedChatId]: nextText,
      };
    });
    setLoadingError(null);
    setComposerFocusSignal((current) => current + 1);
    onResourceApplied?.();
  }, [mediaToInsert, onResourceApplied, replacePendingAttachment, selectedChatId]);

  useEffect(() => {
    // Android/iOS share intent: prefill composer with shared content.
    if (Platform.OS === 'web') return;
    if (!incomingSharedAttachment && !incomingSharedText) return;
    if (!selectedChatId) return; // wait for chats to load / user to select a chat.

    if (incomingSharedAttachment) {
      replacePendingAttachment(incomingSharedAttachment);
    }

    const text = incomingSharedText?.trim() || '';
    if (text) {
      setDrafts((current) => {
        const previous = current[selectedChatId] ?? '';
        const nextText = previous.trim().length > 0 ? `${previous.trim()}\n\n${text}` : text;
        return { ...current, [selectedChatId]: nextText };
      });
    }

    setComposerFocusSignal((current) => current + 1);
    onSharedApplied?.();
  }, [incomingSharedAttachment, incomingSharedText, onSharedApplied, replacePendingAttachment, selectedChatId]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    let dragDepth = 0;

    const handleDragEnter = (event: DragEvent) => {
      if (!selectedChatId) {
        return;
      }

      event.preventDefault();
      dragDepth += 1;
      if (event.dataTransfer?.types?.includes('Files')) {
        setIsDragActive(true);
      }
    };

    const handleDragOver = (event: DragEvent) => {
      if (!selectedChatId) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!selectedChatId) {
        return;
      }

      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        setIsDragActive(false);
      }
    };

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      dragDepth = 0;
      setIsDragActive(false);

      if (!selectedChatId) {
        return;
      }

      const file = event.dataTransfer?.files?.[0];
      if (!file) {
        return;
      }

      replacePendingAttachment({
        uri: URL.createObjectURL(file),
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        type: file.type.startsWith('image/') ? 'image' : 'file',
      });
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [replacePendingAttachment, selectedChatId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !adminMode || !adminSoundEnabled) {
      return;
    }

    const handlePaste = (event: ClipboardEvent) => {
      if (!selectedChatIdRef.current) {
        return;
      }

      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (!imageItem) {
        return;
      }

      const blob = imageItem.getAsFile();
      if (!blob) {
        return;
      }

      event.preventDefault();
      const extension = blob.type.split('/')[1] || 'png';
      replacePendingAttachment({
        uri: URL.createObjectURL(blob),
        name: `captura-${Date.now()}.${extension}`,
        mimeType: blob.type || 'image/png',
        type: 'image',
      });
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [adminMode, replacePendingAttachment]);

  const selectedChat = useMemo(
    () => liveChats.find((chat) => chat.id === selectedChatId) ?? null,
    [selectedChatId, liveChats]
  );

  const loadActiveAnnouncements = useCallback(async () => {
    if (!clientMode) {
      setActiveAnnouncements([]);
      return;
    }

    const supabase = getSupabaseClient();
    const now = new Date();
    // Prefer server-side evaluation for scheduled announcements to avoid device timezone/Intl inconsistencies.
    // If RPC isn't available yet, fall back to client-side evaluation.
    const rpc = await supabase.rpc('get_active_announcements', { _default_timezone: 'America/Costa_Rica' });
    if (!rpc.error && Array.isArray(rpc.data)) {
      const announcements = rpc.data as AnnouncementRecord[];
      const visible = announcements.filter((item) => !dismissedAnnouncementIds.includes(item.id));
      setActiveAnnouncements(visible.slice(0, 10));
      return;
    }

    const { data, error } = await supabase
      .from('announcements')
      .select('id,title,body,active,starts_at,ends_at,is_recurring,days_of_week,start_time,end_time,timezone,created_by,created_at,updated_at')
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      setActiveAnnouncements([]);
      return;
    }

    const announcements = (data ?? []) as AnnouncementRecord[];
    const activeNow = announcements.filter((item) => {
      try {
        return isAnnouncementActiveNow(item, now);
      } catch {
        return false;
      }
    });
    const visible = activeNow.filter((item) => !dismissedAnnouncementIds.includes(item.id));
    setActiveAnnouncements(visible.slice(0, 10));
  }, [clientMode, dismissedAnnouncementIds]);

  const visibleChats = useMemo(() => {
    const orderedChats = [...liveChats].sort((left, right) => {
      if (adminMode && left.unreadCount !== right.unreadCount) {
        return right.unreadCount - left.unreadCount;
      }

      const leftTime = new Date(left.lastActivityAt).getTime();
      const rightTime = new Date(right.lastActivityAt).getTime();

      return rightTime - leftTime;
    });

    const inboxScopedChats =
      adminMode && adminInboxFilter === 'unread'
        ? orderedChats.filter((chat) => chat.unreadCount > 0)
        : orderedChats;

    const query = search.trim().toLowerCase();
    if (!query) {
      return inboxScopedChats;
    }

    return inboxScopedChats.filter((chat) => {
      const haystack = `${chat.name} ${chat.lastMessage} ${chat.members.join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [adminInboxFilter, adminMode, search, liveChats]);

  const primaryAdmin = useMemo(() => availableUsers[0] ?? null, [availableUsers]);
  const clientHasAdminChat = useMemo(() => {
    if (!clientMode || !primaryAdmin) {
      return true;
    }

    return liveChats.some((chat) =>
      chat.members.some(
        (member) =>
          member.toLowerCase().includes(primaryAdmin.fullName.toLowerCase()) ||
          member.toLowerCase().includes(primaryAdmin.email.toLowerCase())
      )
    );
  }, [clientMode, liveChats, primaryAdmin]);

  useEffect(() => {
    if (!clientMode) {
      return;
    }

    void loadDismissedAnnouncements(session.user.id).then((dismissed) => setDismissedAnnouncementIds(dismissed));
  }, [clientMode, session.user.id]);



  useEffect(() => {
    if (!clientMode) {
      return;
    }

    void loadActiveAnnouncements();

    // Scheduled announcements need polling because time windows can change without DB updates.
    // Use a short cadence so 3-minute windows reliably appear without manual refresh.
    const intervalId = setInterval(() => {
      void loadActiveAnnouncements();
    }, 5_000);

    const supabase = getSupabaseClient();
    const channel = supabase
      .channel('announcements-client:' + session.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => void loadActiveAnnouncements())
      .subscribe();

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [clientMode, loadActiveAnnouncements, session.user.id]);

  useEffect(() => {
    if (!clientMode) {
      return;
    }

    // Keep index valid whenever the list changes.
    setActiveAnnouncementIndex((current) => {
      if (activeAnnouncements.length === 0) return 0;
      return Math.min(current, activeAnnouncements.length - 1);
    });
  }, [activeAnnouncements.length, clientMode]);

  useEffect(() => {
    if (!clientMode) {
      return;
    }

    setAdminContactId(primaryAdmin?.id ?? '');
  }, [clientMode, primaryAdmin]);

  const currentMessages = selectedChat ? liveMessages[selectedChat.id] ?? [] : [];
  const currentDraft = selectedChat ? drafts[selectedChat.id] ?? '' : '';
  const currentReplyPreview = selectedChat ? replyPreviewByChat[selectedChat.id] ?? null : null;
  const starredMessageIds = useMemo(() => new Set(messageFlags.starred), [messageFlags.starred]);
  const pinnedMessageIds = useMemo(() => {
    const now = Date.now();
    const expirations = messageFlags.pinnedExpirations ?? {};
    return new Set(messageFlags.pinned.filter((id) => {
      const expiresAt = expirations[id];
      return !expiresAt || expiresAt > now;
    }));
  }, [messageFlags.pinned, messageFlags.pinnedExpirations]);

  useEffect(() => {
    const expirations = messageFlags.pinnedExpirations ?? {};
    if (!messageFlags.pinned.length) {
      return;
    }

    const now = Date.now();
    const nextPinned = messageFlags.pinned.filter((id) => {
      const expiresAt = expirations[id];
      return !expiresAt || expiresAt > now;
    });

    if (nextPinned.length === messageFlags.pinned.length) {
      return;
    }

    setMessageFlags((current) => {
      const next = {
        ...current,
        pinned: nextPinned,
        pinnedExpirations: { ...(current.pinnedExpirations ?? {}) },
      };
      for (const id of current.pinned) {
        if (!nextPinned.includes(id)) {
          delete next.pinnedExpirations?.[id];
        }
      }

      if (Platform.OS === 'web') {
        persistMessageFlagsWeb(session.user.id, next);
      } else {
        void persistMessageFlagsMobile(session.user.id, next);
      }

      return next;
    });
  }, [messageFlags.pinned, messageFlags.pinnedExpirations, session.user.id]);
  const latestUnreadChat = useMemo(() => visibleChats.find((chat) => chat.unreadCount > 0) ?? null, [visibleChats]);
  const unreadChatsCount = useMemo(() => liveChats.filter((chat) => chat.unreadCount > 0).length, [liveChats]);
  const incomingSnapshot = useMemo(() => {
    return Object.entries(latestIncomingByChat)
      .filter(([, timestamp]) => Boolean(timestamp))
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([chatId, timestamp]) => `${chatId}=${timestamp}`)
      .join('|');
  }, [latestIncomingByChat]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !adminMode) {
      return;
    }

    if (!lastIncomingSnapshotRef.current) {
      lastIncomingSnapshotRef.current = incomingSnapshot;
      return;
    }

    if (incomingSnapshot === lastIncomingSnapshotRef.current) {
      return;
    }

    const previousMap = new Map(
      lastIncomingSnapshotRef.current
        .split('|')
        .filter(Boolean)
        .map((entry) => {
          const separatorIndex = entry.indexOf('=');
          if (separatorIndex === -1) {
            return [entry, ''];
          }

          return [entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1)];
        })
    );

    const hasIncomingMessage = Object.entries(latestIncomingByChat).some(([chatId, timestamp]) => {
      if (!timestamp) {
        return false;
      }

      const previousTimestamp = previousMap.get(chatId) ?? '';
      return !previousTimestamp || timestamp > previousTimestamp;
    });

    lastIncomingSnapshotRef.current = incomingSnapshot;

    if (hasIncomingMessage) {
      void playIncomingMessageTone();

      // Desktop notification (best effort). This is useful when the admin uses wrappers like Franz.
      try {
        const WebNotification: any = (globalThis as any).Notification;
        if (!WebNotification || WebNotification.permission !== 'granted') {
          return;
        }

        const previousEntries = new Set(previousMap.keys());
        const changedChatIds = Object.entries(latestIncomingByChat)
          .filter(([chatId, timestamp]) => {
            if (!timestamp) return false;
            const previousTimestamp = previousMap.get(chatId) ?? '';
            return !previousTimestamp || timestamp > previousTimestamp;
          })
          .map(([chatId]) => chatId);

        const activeChatId = selectedChatIdRef.current;
        const candidateId = changedChatIds.find((id) => !(id === activeChatId && conversationVisibleRef.current)) ?? '';
        if (!candidateId) return;

        const chat = liveChats.find((value) => value.id === candidateId);
        const chatLabel = chat?.name || 'una conversacion';
        const unread = chat?.unreadCount ?? 0;

        const notification = new WebNotification('Chat Santanita', {
          body: unread > 1 ? `${unread} mensajes nuevos de ${chatLabel}` : `Mensaje nuevo de ${chatLabel}`,
          silent: true,
        });

        notification.onclick = () => {
          try {
            (globalThis as any).window?.focus?.();
          } catch {
            // ignore
          }
          if (candidateId) {
            setSelectedChatId(candidateId);
          }
          try {
            notification.close?.();
          } catch {
            // ignore
          }
        };

        // Auto-close after a short delay to avoid piling up.
        setTimeout(() => {
          try {
            notification.close?.();
          } catch {
            // ignore
          }
        }, 5000);
      } catch {
        // ignore
      }
    }
  }, [adminMode, adminSoundEnabled, incomingSnapshot, latestIncomingByChat, playIncomingMessageTone]);

  const clearPendingAttachment = useCallback(() => {
    replacePendingAttachment(null);
  }, [replacePendingAttachment]);

  const handleToggleAudioRecording = useCallback(async () => {
    if (Platform.OS === 'web') {
      // Admin web: WhatsApp-like voice notes recording via MediaRecorder.
      if (!adminMode) {
        return;
      }

      if (audioRecordingBusy) return;

      setAudioRecordingBusy(true);
      setLoadingError(null);

      try {
        if (!webAudioRecording) {
          if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            Alert.alert('Audio', 'Tu navegador no soporta grabar audio.');
            return;
          }

          if (typeof MediaRecorder === 'undefined') {
            Alert.alert('Audio', 'Tu navegador no soporta MediaRecorder.');
            return;
          }

          // Avoid mixing actions with any prior attachment.
          replacePendingAttachment(null);

          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          webAudioStreamRef.current = stream;

          const mimeType = pickWebRecorderMimeType();
          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          webMediaRecorderRef.current = recorder;
          webAudioChunksRef.current = [];

          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              webAudioChunksRef.current.push(event.data);
            }
          };

          recorder.onstop = () => {
            const chunks = webAudioChunksRef.current;
            webAudioChunksRef.current = [];

            const finalMime = recorder.mimeType || mimeType || 'audio/webm';
            const blob = new Blob(chunks, { type: finalMime });
            const uri = URL.createObjectURL(blob);
            const ext = extensionForMimeType(finalMime);

            replacePendingAttachment({
              uri,
              name: `audio-${Date.now()}.${ext}`,
              mimeType: finalMime,
              type: 'file',
            });

            try {
              webAudioStreamRef.current?.getTracks()?.forEach((t) => t.stop());
            } catch {
              // ignore
            } finally {
              webAudioStreamRef.current = null;
            }
          };

          recorder.start();
          setWebAudioRecording(true);
          return;
        }

        try {
          webMediaRecorderRef.current?.stop();
        } finally {
          webMediaRecorderRef.current = null;
          setWebAudioRecording(false);
        }
      } catch (error) {
        setLoadingError(getReadableErrorMessage(error, 'No fue posible grabar el audio.'));
        try {
          webMediaRecorderRef.current?.stop();
        } catch {
          // ignore
        } finally {
          webMediaRecorderRef.current = null;
          setWebAudioRecording(false);
          try {
            webAudioStreamRef.current?.getTracks()?.forEach((t) => t.stop());
          } catch {
            // ignore
          } finally {
            webAudioStreamRef.current = null;
          }
        }
      } finally {
        setAudioRecordingBusy(false);
      }

      return;
    }

    if (audioRecordingBusy) return;

    setAudioRecordingBusy(true);
    setLoadingError(null);

    try {
      if (!audioRecording) {
        replacePendingAttachment(null);
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Audio', 'Necesitas permitir el microfono para grabar un audio.');
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        setAudioRecording(recording);
        return;
      }

      await audioRecording.stopAndUnloadAsync();
      const uri = audioRecording.getURI();
      setAudioRecording(null);

      if (!uri) {
        throw new Error('No se encontro el archivo de audio grabado.');
      }

      setPendingAttachment({
        uri,
        name: `audio-${Date.now()}.m4a`,
        mimeType: 'audio/m4a',
        type: 'file',
      });
    } catch (error) {
      setLoadingError(getReadableErrorMessage(error, 'No fue posible grabar el audio.'));
      try {
        if (audioRecording) {
          await audioRecording.stopAndUnloadAsync();
        }
      } catch {
        // ignore
      } finally {
        setAudioRecording(null);
      }
    } finally {
      setAudioRecordingBusy(false);
    }
  }, [adminMode, audioRecording, audioRecordingBusy, replacePendingAttachment, webAudioRecording]);

  useEffect(() => {
    return () => {
      if (Platform.OS === 'web' && pendingAttachment?.uri.startsWith('blob:')) {
        URL.revokeObjectURL(pendingAttachment.uri);
      }
    };
  }, [pendingAttachment]);

  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web') {
        return;
      }

      try {
        webMediaRecorderRef.current?.stop();
      } catch {
        // ignore
      } finally {
        webMediaRecorderRef.current = null;
        setWebAudioRecording(false);
      }

      try {
        webAudioStreamRef.current?.getTracks()?.forEach((t) => t.stop());
      } catch {
        // ignore
      } finally {
        webAudioStreamRef.current = null;
      }
    };
  }, []);

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  };

  const handlePickImage = async () => {
    const attachFromAsset = (asset: ImagePicker.ImagePickerAsset) => {
      const mimeType = asset.mimeType || 'application/octet-stream';
      const isImage = mimeType.startsWith('image/');
      const isVideo = mimeType.startsWith('video/');

      replacePendingAttachment({
        uri: asset.uri,
        name:
          asset.fileName ||
          (isImage ? `imagen-${Date.now()}.jpg` : isVideo ? `video-${Date.now()}.mp4` : `archivo-${Date.now()}`),
        mimeType,
        type: isImage ? 'image' : 'file',
      });
    };

    const pickFromLibrary = async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos permiso para acceder a tu galeria.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      attachFromAsset(result.assets[0]);
    };

    const capturePhoto = async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos permiso para usar la camara.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      attachFromAsset(result.assets[0]);
    };

    const captureVideo = async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos permiso para usar la camara.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 60,
        quality: 1,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      attachFromAsset(result.assets[0]);
    };

    // Web: keep it simple (library images/videos).
    if (Platform.OS === 'web') {
      await pickFromLibrary();
      return;
    }

    // Mobile: WhatsApp-like choices.
    Alert.alert('Adjuntar', 'Elige una opcion', [
      { text: 'Camara (Foto)', onPress: () => void capturePhoto() },
      { text: 'Camara (Video)', onPress: () => void captureVideo() },
      { text: 'Galeria', onPress: () => void pickFromLibrary() },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    replacePendingAttachment({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType || 'application/octet-stream',
      type: asset.mimeType?.startsWith('image/') ? 'image' : 'file',
    });
  };

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    markChatAsRead(chatId);
    if (adminMode) {
      setAdminInboxFilter('all');
    }
    setEmojiPickerOpen(false);
    if (!isDesktop) {
      setMobileView('conversation');
    }
  };

  const handleClearChat = useCallback(
    async (chatId: string) => {
      if (Platform.OS !== 'web' || !adminMode) {
        return;
      }

      const chat = liveChats.find((value) => value.id === chatId);
      const label = chat?.name || 'esta conversacion';

      // Confirm destructive action (web: use native confirm so it always shows).
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm(
              `Vaciar conversacion\n\nQuieres eliminar todos los mensajes de ${label}?\n\nEl usuario se mantiene, solo se borra el historial en el panel.`
            )
          : false;

      if (!confirmed) {
        return;
      }

      setLoadingError(null);
      try {
        await adminClearChatMessages(chatId);
        setLiveMessages((previous) => ({ ...previous, [chatId]: [] }));
        await loadChats({ silent: true });
      } catch (error) {
        setLoadingError(
          error instanceof Error
            ? error.message
            : 'No fue posible vaciar la conversacion. Asegurate de correr el SQL admin_clear_chat_messages en Supabase.'
        );
      }
    },
    [adminMode, liveChats, loadChats]
  );

  const handleSend = async () => {
    if (!selectedChat) {
      return;
    }

    const trimmed = currentDraft.trim();
    if (!trimmed && !pendingAttachment) {
      return;
    }

    const reply = replyPreviewByChat[selectedChat.id] ?? null;
    const replyPrefix = reply
      ? `↩ ${reply.author}${reply.snippet ? `: ${reply.snippet}` : ''}\n`
      : '';
    const outgoingBody = `${replyPrefix}${trimmed}`.trim();

    const optimisticMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      author: 'Tu',
      content: outgoingBody || (pendingAttachment?.type === 'image' ? 'Imagen adjunta' : 'Archivo adjunto'),
      timestamp: 'Ahora',
      createdAt: new Date().toISOString(),
      direction: 'outgoing',
      status: 'sending',
      attachmentLabel: pendingAttachment?.name,
      attachmentType: pendingAttachment?.type,
    };

    setLiveMessages((previous) => ({
      ...previous,
      [selectedChat.id]: [...(previous[selectedChat.id] ?? []), optimisticMessage],
    }));
    setDrafts((previous) => ({
      ...previous,
      [selectedChat.id]: '',
    }));
    setReplyPreviewByChat((previous) => ({ ...previous, [selectedChat.id]: null }));

    const nextAttachment = pendingAttachment;
    clearPendingAttachment();
    setSending(true);

    try {
      if (nextAttachment) {
        await sendAttachmentMessage({
          chatId: selectedChat.id,
          senderId: session.user.id,
          attachment: nextAttachment,
          body: outgoingBody,
        });
      } else {
        await sendTextMessage({
          chatId: selectedChat.id,
          senderId: session.user.id,
          body: outgoingBody,
        });
      }

      // Push notifications to clients are sent by an Edge Function. Only fire when the admin sends messages.
      if (adminMode && Platform.OS === 'web') {
        const preview = trimmed || (nextAttachment?.type === 'image' ? 'Imagen' : nextAttachment ? 'Archivo' : 'Mensaje nuevo');
        void notifyNewMessage({ chatId: selectedChat.id, senderId: session.user.id, preview });
      }

      await loadChats({ silent: true });
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : 'No fue posible enviar el mensaje.');
      await loadChats({ silent: true });
    } finally {
      setSending(false);
    }
  };

  const handleToggleStarMessage = useCallback(
    (message: ChatMessage) => {
      setMessageFlags((current) => {
        const exists = current.starred.includes(message.id);
        const next = {
          ...current,
          starred: exists ? current.starred.filter((id) => id !== message.id) : [message.id, ...current.starred],
        };
        if (Platform.OS === 'web') {
          persistMessageFlagsWeb(session.user.id, next);
        } else {
          void persistMessageFlagsMobile(session.user.id, next);
        }
        return next;
      });
    },
    [session.user.id]
  );

  const handleTogglePinMessage = useCallback(
    (message: ChatMessage, durationMs?: number | null) => {
      setMessageFlags((current) => {
        const exists = current.pinned.includes(message.id);
        const currentExpirations = current.pinnedExpirations ?? {};
        const nextExpirations = { ...currentExpirations };

        const next = {
          ...current,
          pinned: exists ? current.pinned.filter((id) => id !== message.id) : [message.id, ...current.pinned],
          pinnedExpirations: nextExpirations,
        };

        if (exists) {
          delete nextExpirations[message.id];
        } else {
          const ttl = typeof durationMs === 'number' && Number.isFinite(durationMs) ? durationMs : 24 * 60 * 60 * 1000;
          nextExpirations[message.id] = Date.now() + ttl;
        }

        if (Platform.OS === 'web') {
          persistMessageFlagsWeb(session.user.id, next);
        } else {
          void persistMessageFlagsMobile(session.user.id, next);
        }
        return next;
      });
    },
    [session.user.id]
  );

  const handleDownloadAttachment = useCallback(async (message: ChatMessage) => {
    if (Platform.OS !== 'web') {
      const url = message.attachmentUrl;
      if (!url) return;

      const filename = (message.attachmentLabel || 'adjunto').replace(/[\\/:*?"<>|]+/g, '_');
      const target = `${FileSystem.documentDirectory ?? ''}${Date.now()}-${filename}`;

      try {
        const result = await FileSystem.downloadAsync(url, target);
        Alert.alert('Descargado', 'Archivo guardado en el telefono.', [
          { text: 'Abrir', onPress: () => void Linking.openURL(result.uri) },
          { text: 'OK' },
        ]);
      } catch (error) {
        Alert.alert('No fue posible descargar', error instanceof Error ? error.message : 'Intenta de nuevo.');
      }
      return;
    }

    const url = message.attachmentUrl;
    if (!url) return;

    const filename = (message.attachmentLabel || 'adjunto').replace(/[\\/:*?"<>|]+/g, '_');

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('No fue posible descargar el adjunto.');
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : 'No fue posible descargar el adjunto.');
    }
  }, []);

  const handleForwardMessage = useCallback(
    async (message: ChatMessage) => {
      // Forwarding without changing business logic: copy to clipboard so the admin can paste it in another chat.
      const payload = (message.content ?? '').trim();
      if (!payload) {
        setLoadingError('Este mensaje no se puede reenviar todavía.');
        return;
      }

      if (Platform.OS !== 'web') {
        const chatId = selectedChatIdRef.current;
        if (!chatId) {
          setLoadingError('Selecciona una conversacion antes de reenviar.');
          return;
        }

        setDrafts((current) => ({
          ...current,
          [chatId]: payload,
        }));
        setComposerFocusSignal((current) => current + 1);
        setCreateMessage('Mensaje listo para reenviar. Presiona Enviar.');
        return;
      }

      try {
        if (globalThis.navigator?.clipboard?.writeText) {
          await globalThis.navigator.clipboard.writeText(payload);
        }
        setCreateMessage('Mensaje copiado. Abre otra conversacion y pega (Ctrl+V) para reenviar.');
      } catch {
        setCreateMessage('Copia manualmente el mensaje para reenviarlo.');
      }
    },
    []
  );

  const handleDeleteMessage = async (messageId: string) => {
    setDeletingMessageId(messageId);
    setLoadingError(null);

    try {
      await deleteOwnMessage(messageId, session.user.id);
      await loadChats({ silent: true });
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : 'No fue posible eliminar el mensaje.');
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleCreateChat = async () => {
    setCreateMessage(null);
    setCreatingChat(true);

    try {
      const participantIds = clientMode ? [adminContactId].filter(Boolean) : selectedUserIds;
      const chatId = await createChat({
        currentUserId: session.user.id,
        name: clientMode ? 'Administrador' : groupName,
        participantIds,
      });

      setGroupName('');
      setSelectedUserIds([]);
      await loadChats();
      setSelectedChatId(chatId);
      setCreateMessage(clientMode ? 'Chat con administracion listo.' : 'Conversacion creada correctamente.');
      if (!isDesktop) {
        setMobileView('conversation');
      }
    } catch (error) {
      setCreateMessage(getReadableErrorMessage(error, 'No fue posible crear la conversacion.'));
    } finally {
      setCreatingChat(false);
    }
  };

  const clientActionTitle = primaryAdmin ? (clientHasAdminChat ? `Abrir chat con ${primaryAdmin.fullName}` : `Iniciar chat con ${primaryAdmin.fullName}`) : 'Hablar con administracion';

  const handleSignOut = () => {
    getSupabaseClient()
      .auth.signOut()
      .catch(() => undefined);
  };

  const handleOpenResults = () => {
    void Linking.openURL('https://www.santanitacr.com');
  };

  const statusText = formatStatusError(loadingError)
    ? `Estado: ${formatStatusError(loadingError)}`
    : sending
      ? 'Enviando mensaje...'
      : creatingChat
        ? 'Creando conversacion...'
        : liveChats.length > 0
          ? `${liveChats.length} conversaciones sincronizadas.`
          : 'Listo para crear tu primera conversacion.';

  const mobileStatusText = Platform.OS !== 'web' && pushStatus ? `${statusText} ${pushStatus}` : statusText;

  const header = adminMode && isDesktop ? null : clientMode && Platform.OS === 'web' ? (
    <View style={[styles.mobileTopBar, styles.clientWebTopBar]}>
      <View style={styles.mobileBrandRow}>
        <Image source={brandLogo} style={styles.mobileLogo} resizeMode="contain" />
        <View style={styles.mobileBrandCopy}>
          <Text style={styles.mobileBrandTitle}>Chat Santanita</Text>
          <Text style={styles.mobileBrandStatus}>{statusText}</Text>
        </View>
      </View>
      <View style={styles.mobileHeaderActionsRow}>
        <Pressable style={styles.mobileHeaderSecondaryAction} onPress={handleOpenResults}>
          <Text style={styles.mobileHeaderSecondaryText}>Resultados</Text>
        </Pressable>
        <Pressable style={styles.mobileHeaderAction} onPress={handleSignOut}>
          <Text style={styles.mobileHeaderActionText}>Salir</Text>
        </Pressable>
      </View>
    </View>
  ) : isDesktop ? (
    <View style={[styles.headerShell, styles.headerShellDesktop]}>
      <View style={styles.heroCard}>
        <Image source={brandLogo} style={styles.heroLogo} resizeMode="contain" />
        <Text style={styles.eyebrow}>Chat Santanita</Text>
        <Text style={styles.title}>Comunicacion directa para tu equipo</Text>
        <Text style={styles.subtitle}>
          Usuarios reales, conversaciones persistentes, adjuntos y sincronizacion en vivo con la identidad de tu marca.
        </Text>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Sesion actual</Text>
        <Text style={styles.statusEmail}>{session.user.email ?? 'usuario@local'}</Text>
        <Text style={styles.statusCopy}>{statusText}</Text>
        <View style={styles.desktopHeaderActionsRow}>
          <Pressable style={styles.headerSecondaryAction} onPress={handleOpenResults}>
            <Text style={styles.headerSecondaryText}>Resultados</Text>
          </Pressable>
          <Pressable style={styles.headerAction} onPress={handleSignOut}>
            <Text style={styles.headerActionText}>Salir</Text>
          </Pressable>
        </View>
      </View>
    </View>
  ) : (
    <View style={styles.mobileTopBar}>
      <View style={styles.mobileBrandRow}>
        <Image source={brandLogo} style={styles.mobileLogo} resizeMode="contain" />
        <View style={styles.mobileBrandCopy}>
          <Text style={styles.mobileBrandTitle}>Chat Santanita</Text>
          <Text style={styles.mobileBrandStatus}>{mobileStatusText}</Text>
        </View>
      </View>
      <View style={styles.mobileHeaderActionsRow}>
        <Pressable style={styles.mobileHeaderSecondaryAction} onPress={handleOpenResults}>
          <Text style={styles.mobileHeaderSecondaryText}>Resultados</Text>
        </Pressable>
        <Pressable style={styles.mobileHeaderAction} onPress={handleSignOut}>
          <Text style={styles.mobileHeaderActionText}>Salir</Text>
        </Pressable>
      </View>
    </View>
  );

  const mobileSwitcher = !isDesktop ? (
    <View style={styles.mobileSwitcher}>
      <MobileSwitchButton
        active={mobileView === 'chats'}
        label={mobileUnreadTotal > 0 ? `Chats (${mobileUnreadTotal})` : 'Chats'}
        onPress={() => setMobileView('chats')}
      />
      <MobileSwitchButton
        active={mobileView === 'conversation'}
        label={selectedChat ? 'Chat' : 'Sin chat'}
        onPress={() => selectedChat && setMobileView('conversation')}
        disabled={!selectedChat}
      />
    </View>
  ) : null;

  const chatsPanel = (
    <View style={[styles.sidebar, isDesktop ? styles.sidebarDesktop : styles.mobileSidebar, adminMode && isDesktop && styles.sidebarAdminDesktop]}>
      <View style={styles.sidebarHeader}>
        <Text style={styles.sectionTitle}>{clientMode ? 'Tu chat' : 'Conversaciones'}</Text>
        <Text style={styles.counter}>{liveChats.length}</Text>
      </View>
      {clientMode ? (
        <View style={styles.clientSupportCard}>
          <Text style={styles.clientSupportTitle}>{primaryAdmin ? primaryAdmin.fullName : 'Administrador'}</Text>
          <Text style={styles.clientSupportText}>
            {primaryAdmin
              ? 'Tu unico contacto disponible dentro de la app es el administrador.'
              : 'En cuanto haya un administrador aprobado disponible, podras iniciar tu conversacion aqui.'}
          </Text>
          {createMessage ? <Text style={styles.message}>{createMessage}</Text> : null}
          <Pressable
            style={[styles.button, (!primaryAdmin || creatingChat) && styles.buttonDisabled]}
            onPress={handleCreateChat}
            disabled={!primaryAdmin || creatingChat}
          >
            <Text style={styles.buttonText}>{creatingChat ? 'Abriendo...' : clientActionTitle}</Text>
          </Pressable>
        </View>
      ) : !adminMode ? (
        <CreateChatCard
          groupName={groupName}
          selectedUserIds={selectedUserIds}
          users={availableUsers}
          loadingUsers={loadingUsers}
          onChangeGroupName={setGroupName}
          onToggleUser={handleToggleUser}
          onCreate={handleCreateChat}
          busy={creatingChat}
          message={createMessage}
        />
      ) : null}
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={clientMode ? 'Buscar en tu chat' : 'Buscar chat o usuario'}
        placeholderTextColor={palette.mutedText}
        style={styles.searchInput}
      />
      {adminMode ? (
        <View style={styles.inboxFilterRow}>
          <Pressable
            onPress={() => setAdminInboxFilter('all')}
            style={[styles.inboxFilterChip, adminInboxFilter === 'all' && styles.inboxFilterChipActive]}
          >
            <Text style={[styles.inboxFilterText, adminInboxFilter === 'all' && styles.inboxFilterTextActive]}>Todos</Text>
          </Pressable>
          <Pressable
            onPress={() => setAdminInboxFilter('unread')}
            style={[styles.inboxFilterChip, adminInboxFilter === 'unread' && styles.inboxFilterChipActive]}
          >
            <Text style={[styles.inboxFilterText, adminInboxFilter === 'unread' && styles.inboxFilterTextActive]}>
              No leidos {unreadChatsCount}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {loadingChats ? (
        <View style={styles.sidebarState}>
          <ActivityIndicator color={palette.accent} />
          <Text style={styles.sidebarStateText}>Cargando conversaciones...</Text>
        </View>
      ) : liveChats.length === 0 ? (
        <View style={styles.sidebarState}>
          <Text style={styles.sidebarStateTitle}>{clientMode ? 'Aun no has iniciado tu chat' : 'Aun no tienes conversaciones'}</Text>
          <Text style={styles.sidebarStateText}>
            {adminMode
              ? 'Cuando los clientes tengan conversaciones, apareceran aqui para atenderlas desde la web.'
              : clientMode
                ? 'Pulsa el boton superior para abrir tu conversacion directa con el administrador.'
                : 'Crea un chat con usuarios registrados y aqui aparecera en tiempo real.'}
          </Text>
        </View>
      ) : visibleChats.length === 0 ? (
        <View style={styles.sidebarState}>
          <Text style={styles.sidebarStateTitle}>Sin resultados</Text>
          <Text style={styles.sidebarStateText}>Prueba otro termino de busqueda.</Text>
        </View>
      ) : (
        <ScrollView style={styles.chatListScroller} showsVerticalScrollIndicator={false} contentContainerStyle={styles.chatListContent}>
          <ChatList
            chats={visibleChats}
            selectedChatId={selectedChat?.id ?? ''}
            onSelect={handleSelectChat}
            showClearButton={Boolean(adminMode && Platform.OS === 'web')}
            onClearChat={handleClearChat}
          />
        </ScrollView>
      )}
    </View>
  );

  const conversationPanel = (
    <View style={[styles.chatPanel, isDesktop ? styles.chatPanelDesktop : styles.mobileChatPanel, adminMode && isDesktop && styles.chatPanelAdminDesktop, isCompactHeight && isDesktop && styles.compactPanel]}>
      {selectedChat ? (
        <>
            <ConversationView
              chat={selectedChat}
              messages={currentMessages}
              showBackButton={!isDesktop}
              onBack={!isDesktop ? () => setMobileView('chats') : undefined}
              compact={!isDesktop}
              deletingMessageId={deletingMessageId}
              onDeleteMessage={handleDeleteMessage}
              starredMessageIds={starredMessageIds}
              pinnedMessageIds={pinnedMessageIds}
              onToggleStarMessage={handleToggleStarMessage}
              onTogglePinMessage={handleTogglePinMessage}
              onDownloadAttachment={handleDownloadAttachment}
              onForwardMessage={handleForwardMessage}
              onReplyMessage={(message) => {
                if (!selectedChat) return;
                const snippet = (message.content ?? '').trim().slice(0, 180);
                setReplyPreviewByChat((previous) => ({
                  ...previous,
                  [selectedChat.id]: { author: message.author, snippet, messageId: message.id },
                }));
                setComposerFocusSignal((value) => value + 1);
                if (!isDesktop) {
                  setMobileView('conversation');
                }
              }}
            />
            <MessageComposer
              value={currentDraft}
              attachment={pendingAttachment}
              busy={sending}
              isDragActive={isDragActive}
              clipboardPasteEnabled={Boolean(adminMode && Platform.OS === 'web')}
              sendOnEnter={Boolean(adminMode && Platform.OS === 'web')}
              focusSignal={composerFocusSignal}
              showEmojiPicker={Boolean(adminMode)}
              emojiPickerOpen={emojiPickerOpen}
              showAudioRecorder={Platform.OS !== 'web' ? true : Boolean(adminMode)}
              audioRecording={Platform.OS !== 'web' ? Boolean(audioRecording) : webAudioRecording}
              replyPreview={currentReplyPreview ? { author: currentReplyPreview.author, snippet: currentReplyPreview.snippet } : null}
              onClearReplyPreview={() => {
                if (!selectedChat) return;
                setReplyPreviewByChat((previous) => ({ ...previous, [selectedChat.id]: null }));
              }}
              onChangeText={(value) =>
                setDrafts((previous) => ({
                  ...previous,
                  [selectedChat.id]: value,
                }))
              }
            onToggleEmojiPicker={() => setEmojiPickerOpen((current) => !current)}
            onInsertEmoji={(emoji) =>
              setDrafts((previous) => ({
                ...previous,
                [selectedChat.id]: `${previous[selectedChat.id] ?? ''}${emoji}`,
              }))
            }
            onPickImage={handlePickImage}
            onPickFile={handlePickFile}
            onPickAudio={() => void handleToggleAudioRecording()}
            onClearAttachment={clearPendingAttachment}
            onSend={handleSend}
          />
        </>
      ) : (
        <View style={styles.emptyConversation}>
          <Text style={styles.emptyConversationEyebrow}>Sin chat abierto</Text>
          <Text style={styles.emptyConversationTitle}>Selecciona una conversacion</Text>
          <Text style={styles.emptyConversationText}>Entra a la pestana de chats y abre una conversacion para escribir.</Text>
        </View>
      )}
    </View>
  );

  const clientAnnouncementBanner =
    !isDesktop && clientMode && activeAnnouncements.length > 0 ? (
      <AnimatedAnnouncementBanner
        announcements={activeAnnouncements}
        index={activeAnnouncementIndex}
        onChangeIndex={setActiveAnnouncementIndex}
        onOpen={(announcement) => {
          const title = announcement.title?.trim() || 'Anuncio';
          Alert.alert(title, announcement.body, [
            { text: 'Cerrar' },
          ]);
        }}
      />
    ) : null;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardShell}
      behavior={!isDesktop ? (Platform.OS === 'ios' ? 'padding' : 'height') : undefined}
      keyboardVerticalOffset={!isDesktop ? (Platform.OS === 'ios' ? 12 : 0) : 0}
    >
      {isDesktop ? (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.screenContent, styles.screenContentDesktop, { minHeight: desktopViewportHeight }]}
          showsVerticalScrollIndicator={false}
        >
           <View
             style={[
               styles.root,
               styles.rootDesktop,
               adminMode && styles.rootAdminDesktop,
               clientMode && Platform.OS === 'web' && isDesktop && styles.rootClientDesktop,
               { height: desktopViewportHeight },
             ]}
           >

            {header}
            <View
              style={[
                styles.workspace,
                styles.workspaceDesktop,
                adminMode && styles.workspaceAdminDesktop,
                clientMode && Platform.OS === 'web' && isDesktop && styles.workspaceClientDesktop,
              ]}
            >
              {chatsPanel}
              {conversationPanel}
            </View>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.mobileRoot}>
          {mobileView === 'chats' ? (
            <>
              {header}
              {clientAnnouncementBanner}
              <View style={styles.mobileContentArea}>{chatsPanel}</View>
            </>
          ) : (
            <>
              {clientAnnouncementBanner}
              <View style={styles.mobileContentArea}>{conversationPanel}</View>
            </>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function AnimatedAnnouncementBanner({
  announcements,
  index,
  onChangeIndex,
  onOpen,
}: {
  announcements: AnnouncementRecord[];
  index: number;
  onChangeIndex: (next: number | ((previous: number) => number)) => void;
  onOpen: (announcement: AnnouncementRecord) => void;
}) {
  const animation = useRef(new Animated.Value(0)).current;
  const marquee = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [marqueeFrameWidth, setMarqueeFrameWidth] = useState(0);
  const [marqueeTextWidth, setMarqueeTextWidth] = useState(0);

  useEffect(() => {
    // Animate in whenever the active item changes.
    animation.setValue(0);
    Animated.timing(animation, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [animation, index]);

  useEffect(() => {
    // Horizontal marquee (right-to-left) like an announcement LED screen.
    marquee.stopAnimation();
    marquee.setValue(0);

    const gap = 40;
    const distance = Math.max(0, marqueeTextWidth + gap);
    if (!distance || !marqueeFrameWidth) {
      return;
    }

    const pxPerSecond = 60; // readable speed
    const duration = Math.max(3500, Math.round((distance / pxPerSecond) * 1000));
    Animated.loop(
      Animated.timing(marquee, {
        toValue: 1,
        duration,
        useNativeDriver: true,
      })
    ).start();

    return () => marquee.stopAnimation();
  }, [marquee, index, marqueeFrameWidth, marqueeTextWidth]);

  useEffect(() => {
    // Subtle pulse for the whole banner (keeps attention without being too aggressive).
    pulse.stopAnimation();
    pulse.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
    return () => pulse.stopAnimation();
  }, [pulse]);

  useEffect(() => {
    if (announcements.length <= 1) {
      return;
    }

    const intervalId = setInterval(() => {
      onChangeIndex((previous) => (previous + 1) % announcements.length);
    }, 5500);

    return () => clearInterval(intervalId);
  }, [announcements.length, onChangeIndex]);

  const safeIndex = announcements.length > 0 ? Math.min(Math.max(index, 0), announcements.length - 1) : 0;
  const active = announcements[safeIndex];
  if (!active) return null;

  const translateY = animation.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const opacity = animation;
  const bannerScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.01] });
  const gap = 40;
  const distance = Math.max(0, marqueeTextWidth + gap);
  const marqueeX = marquee.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] });

  return (
    <Pressable style={styles.announcementBanner} onPress={() => onOpen(active)}>
      <Animated.View style={{ transform: [{ translateY }, { scale: bannerScale }], opacity }}>
        <View style={styles.announcementHeaderRow}>
          <Text style={styles.announcementEyebrow}>📣 ANUNCIO</Text>
          {announcements.length > 1 ? (
            <Text style={styles.announcementPager}>
              {safeIndex + 1}/{announcements.length}
            </Text>
          ) : null}
          {announcements.length > 1 ? (
            null
          ) : null}
        </View>
        <Text style={styles.announcementTitle} numberOfLines={1}>
          {active.title?.trim() || 'Informacion importante'}
        </Text>
        <View
          style={styles.announcementMarqueeFrame}
          onLayout={(event) => setMarqueeFrameWidth(event.nativeEvent.layout.width)}
        >
          <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: marqueeX }] }}>
            <Text
              style={styles.announcementBody}
              numberOfLines={1}
              onLayout={(event) => setMarqueeTextWidth(event.nativeEvent.layout.width)}
            >
              {active.body}
            </Text>
            <Text style={styles.announcementBodySpacer}>{' '.repeat(10)}</Text>
            <Text style={styles.announcementBody} numberOfLines={1}>
              {active.body}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function MobileSwitchButton({ active, disabled, label, onPress }: { active: boolean; disabled?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.mobileSwitchButton, active && styles.mobileSwitchButtonActive, disabled && styles.mobileSwitchButtonDisabled]}>
      <Text style={[styles.mobileSwitchText, active && styles.mobileSwitchTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  keyboardShell: {
    flex: 1,
    backgroundColor: palette.background,
  },
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  screenContent: {
    flexGrow: 1,
    paddingVertical: 16,
  },
  screenContentDesktop: {
    minHeight: '100%',
  },
  root: {
    backgroundColor: palette.background,
    paddingHorizontal: 16,
    gap: 16,
    width: '100%',
    alignSelf: 'center',
  },
  rootDesktop: {
    overflow: 'hidden',
  },
  rootAdminDesktop: {
    paddingHorizontal: 0,
    gap: 0,
  },
  rootClientDesktop: {
    // Client web should use the full monitor width (no centered "mobile" margins).
    paddingHorizontal: 0,
  },
  mobileRoot: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  mobileContentArea: {
    flex: 1,
    minHeight: 0,
  },
  announcementBanner: {
    backgroundColor: '#f59e0b',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 3,
  },
  announcementEyebrow: {
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 11,
    fontWeight: '800',
  },
  announcementHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  announcementPager: {
    color: '#111827',
    fontSize: 11,
    fontWeight: '800',
  },
  announcementTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  announcementBody: {
    color: '#111827',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  announcementBodySpacer: {
    width: 40,
  },
  announcementMarqueeFrame: {
    height: 22,
    overflow: 'hidden',
  },
  headerShell: {
    gap: 14,
  },
  headerShellDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    flexShrink: 0,
  },
  heroCard: {
    flex: 1,
    backgroundColor: palette.card,
    borderRadius: 28,
    padding: 24,
    gap: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroLogo: {
    width: '100%',
    height: 118,
    alignSelf: 'center',
    marginBottom: 4,
  },
  statusCard: {
    backgroundColor: '#101a2d',
    borderRadius: 28,
    padding: 24,
    gap: 10,
    borderWidth: 1,
    borderColor: palette.border,
    minWidth: 300,
  },
  mobileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  clientWebTopBar: {
    // Keep it compact so the chat composer is always visible on laptop screens.
    paddingVertical: 8,
    borderRadius: 22,
  },
  mobileBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  mobileLogo: {
    width: 54,
    height: 34,
  },
  mobileBrandCopy: {
    flex: 1,
    gap: 1,
  },
  mobileBrandTitle: {
    color: palette.primaryText,
    fontSize: 15,
    fontWeight: '800',
  },
  mobileBrandStatus: {
    color: palette.secondaryText,
    fontSize: 10,
    lineHeight: 14,
  },
  mobileHeaderAction: {
    backgroundColor: palette.accent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  mobileHeaderActionText: {
    color: palette.buttonText,
    fontWeight: '800',
    fontSize: 12,
  },
  mobileHeaderActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mobileHeaderSecondaryAction: {
    backgroundColor: palette.panel,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: palette.border,
  },
  mobileHeaderSecondaryText: {
    color: palette.primaryText,
    fontWeight: '800',
    fontSize: 12,
  },
  mobileSwitcher: {
    flexDirection: 'row',
    gap: 8,
  },
  mobileSwitchButton: {
    flex: 1,
    backgroundColor: palette.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  mobileSwitchButtonActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  mobileSwitchButtonDisabled: {
    opacity: 0.55,
  },
  mobileSwitchText: {
    color: palette.secondaryText,
    fontWeight: '800',
  },
  mobileSwitchTextActive: {
    color: palette.buttonText,
  },
  eyebrow: {
    color: '#facc15',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: palette.primaryText,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
  },
  subtitle: {
    color: palette.secondaryText,
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 720,
  },
  statusLabel: {
    color: palette.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  statusEmail: {
    color: palette.primaryText,
    fontSize: 18,
    fontWeight: '800',
  },
  statusCopy: {
    color: palette.secondaryText,
    fontSize: 13,
    lineHeight: 20,
  },
  headerAction: {
    alignSelf: 'flex-start',
    backgroundColor: palette.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 6,
  },
  headerActionText: {
    color: palette.buttonText,
    fontWeight: '800',
  },
  desktopHeaderActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  headerSecondaryAction: {
    alignSelf: 'flex-start',
    backgroundColor: palette.panel,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
  },
  headerSecondaryText: {
    color: palette.primaryText,
    fontWeight: '800',
  },
  workspace: {
    gap: 14,
  },
  workspaceDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    flex: 1,
    minHeight: 0,
  },
  workspaceClientDesktop: {
    maxWidth: '100%',
    alignSelf: 'stretch',
    // Keep a small gutter; avoid the "big centered card" look on desktop monitors.
    paddingHorizontal: 12,
  },
  workspaceAdminDesktop: {
    maxWidth: '100%',
    gap: 18,
  },
  sidebar: {
    backgroundColor: palette.panel,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    minHeight: 0,
  },
  sidebarDesktop: {
    width: 360,
  },
  sidebarAdminDesktop: {
    width: 292,
    flexShrink: 0,
    maxHeight: '100%',
    overflow: 'hidden',
  },
  mobileSidebar: {
    flex: 1,
    padding: 14,
  },
  chatPanel: {
    flex: 1,
    backgroundColor: palette.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
    minHeight: 0,
  },
  chatPanelDesktop: {
    minHeight: 0,
  },
  chatPanelAdminDesktop: {
    flex: 1,
    minWidth: 0,
    marginLeft: 18,
  },
  mobileChatPanel: {
    flex: 1,
    minHeight: 0,
  },
  compactPanel: {
    minHeight: 480,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: palette.primaryText,
    fontSize: 20,
    fontWeight: '800',
  },
  counter: {
    minWidth: 32,
    textAlign: 'center',
    color: palette.accentSoft,
    backgroundColor: palette.input,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: '800',
  },
  searchInput: {
    backgroundColor: palette.input,
    color: palette.primaryText,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  inboxFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  inboxFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#41516d',
    backgroundColor: '#13213a',
  },
  inboxFilterChipActive: {
    backgroundColor: '#bbf7d0',
    borderColor: '#86efac',
  },
  inboxFilterText: {
    color: '#dbeafe',
    fontSize: 12,
    fontWeight: '800',
  },
  inboxFilterTextActive: {
    color: '#14532d',
  },
  chatListScroller: {
    flex: 1,
    minHeight: 0,
    maxHeight: '100%',
  },
  chatListContent: {
    paddingBottom: 4,
  },
  sidebarState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 32,
    paddingHorizontal: 12,
    minHeight: 0,
  },
  sidebarStateTitle: {
    color: palette.primaryText,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  sidebarStateText: {
    color: palette.secondaryText,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  clientSupportCard: {
    backgroundColor: palette.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
    marginBottom: 12,
  },
  clientSupportTitle: {
    color: palette.primaryText,
    fontSize: 16,
    fontWeight: '800',
  },
  clientSupportText: {
    color: palette.secondaryText,
    fontSize: 12,
    lineHeight: 18,
  },
  message: {
    color: '#fde68a',
    fontSize: 12,
    lineHeight: 18,
  },
  button: {
    backgroundColor: palette.accent,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: palette.buttonText,
    fontWeight: '800',
  },  emptyConversation: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
    backgroundColor: '#0f172a',
    minHeight: 0,
  },
  emptyConversationEyebrow: {
    color: palette.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyConversationTitle: {
    color: palette.primaryText,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyConversationText: {
    color: palette.secondaryText,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 420,
  },
});










