import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import { createChat, deleteOwnMessage, fetchChatReadMarkers, fetchChatRowsForCurrentUser, fetchSelectableUsers, notifyNewMessage, sendAttachmentMessage, sendTextMessage, upsertChatReadMarker, upsertPushToken } from './lib/chatService';
import { getSupabaseClient } from './lib/supabase';
import { palette } from './theme/palette';
import { ChatMessage, ChatThread, MediaLibraryRecord, PendingAttachment, QuickReplyRecord, SelectableUser } from './types/chat';

type MessagingAppProps = {
  session: Session;
  adminMode?: boolean;
  adminSoundEnabled?: boolean;
  clientMode?: boolean;
  quickReplyToInsert?: QuickReplyRecord | null;
  mediaToInsert?: MediaLibraryRecord | null;
  onResourceApplied?: () => void;
};

type MobileView = 'chats' | 'conversation';
type AdminInboxFilter = 'all' | 'unread';

const brandLogo = require('../assets/chat-santanita-logo.jpeg');

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
export function MessagingApp({ session, adminMode, adminSoundEnabled = true, clientMode, quickReplyToInsert, mediaToInsert, onResourceApplied }: MessagingAppProps) {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 960;
  const isCompactHeight = height < 860;
  const desktopViewportHeight = Math.max(640, height - 32);
  const [mobileView, setMobileView] = useState<MobileView>('chats');
  const [selectedChatId, setSelectedChatId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [adminInboxFilter, setAdminInboxFilter] = useState<AdminInboxFilter>('all');
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

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
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
          await Notifications.setNotificationChannelAsync('messages', {
            name: 'Mensajes',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: undefined,
            vibrationPattern: [0, 120],
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
        Notifications.removeNotificationSubscription(subscription);
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
      masterGain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);

      const firstOscillator = context.createOscillator();
      firstOscillator.type = 'sine';
      firstOscillator.frequency.setValueAtTime(720, now);
      firstOscillator.frequency.exponentialRampToValueAtTime(640, now + 0.2);
      firstOscillator.connect(masterGain);
      firstOscillator.start(now);
      firstOscillator.stop(now + 0.2);

      const secondOscillator = context.createOscillator();
      secondOscillator.type = 'sine';
      secondOscillator.frequency.setValueAtTime(820, now + 0.24);
      secondOscillator.frequency.exponentialRampToValueAtTime(700, now + 0.46);
      secondOscillator.connect(masterGain);
      secondOscillator.start(now + 0.24);
      secondOscillator.stop(now + 0.46);
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
      const [{ userId, rows }, serverReadMarkers] = await Promise.all([
        fetchChatRowsForCurrentUser(),
        fetchChatReadMarkers(),
      ]);
      const scopedRows = clientMode
        ? rows.filter((row) =>
            row.type === 'direct' &&
            row.members.length === 2 &&
            row.members.some((member) => member.user_id !== userId && member.profile?.role === 'admin') &&
            row.members.every((member) => member.user_id === userId || member.profile?.role === 'admin')
          )
        : rows;
      const effectiveReadMarkers = mergeReadMarkers(readMarkersRef.current, serverReadMarkers);
      if (JSON.stringify(effectiveReadMarkers) !== JSON.stringify(readMarkersRef.current)) {
        persistReadMarkers(effectiveReadMarkers);
      }
      const nextLatestIncomingByChat = Object.fromEntries(
        scopedRows.map((row) => {
          const latestIncoming = [...row.messages].reverse().find((message) => message.sender_id !== userId);
          return [row.id, latestIncoming?.created_at ?? ''];
        })
      ) as Record<string, string>;

      const activeChatId = selectedChatIdRef.current;
      if (activeChatId && conversationVisibleRef.current && nextLatestIncomingByChat[activeChatId]) {
        markChatAsRead(activeChatId, nextLatestIncomingByChat[activeChatId]);
      }

      const nextChats = scopedRows.map((row) => {
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
        scopedRows.map((row) => [row.id, buildChatMessages(row.messages, userId, Boolean(adminMode))])
      ) as Record<string, ChatMessage[]>;

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

    setAdminContactId(primaryAdmin?.id ?? '');
  }, [clientMode, primaryAdmin]);

  const currentMessages = selectedChat ? liveMessages[selectedChat.id] ?? [] : [];
  const currentDraft = selectedChat ? drafts[selectedChat.id] ?? '' : '';
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
    }
  }, [adminMode, adminSoundEnabled, incomingSnapshot, latestIncomingByChat, playIncomingMessageTone]);

  const clearPendingAttachment = useCallback(() => {
    replacePendingAttachment(null);
  }, [replacePendingAttachment]);

  useEffect(() => {
    return () => {
      if (Platform.OS === 'web' && pendingAttachment?.uri.startsWith('blob:')) {
        URL.revokeObjectURL(pendingAttachment.uri);
      }
    };
  }, [pendingAttachment]);

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    replacePendingAttachment({
      uri: asset.uri,
      name: asset.fileName || `imagen-${Date.now()}.jpg`,
      mimeType: asset.mimeType || 'image/jpeg',
      type: 'image',
    });
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

  const handleSend = async () => {
    if (!selectedChat) {
      return;
    }

    const trimmed = currentDraft.trim();
    if (!trimmed && !pendingAttachment) {
      return;
    }

    const optimisticMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      author: 'Tu',
      content: trimmed || (pendingAttachment?.type === 'image' ? 'Imagen adjunta' : 'Archivo adjunto'),
      timestamp: 'Ahora',
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

    const nextAttachment = pendingAttachment;
    clearPendingAttachment();
    setSending(true);

    try {
      if (nextAttachment) {
        await sendAttachmentMessage({
          chatId: selectedChat.id,
          senderId: session.user.id,
          attachment: nextAttachment,
          body: trimmed,
        });
      } else {
        await sendTextMessage({
          chatId: selectedChat.id,
          senderId: session.user.id,
          body: trimmed,
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

  const header = adminMode && isDesktop ? null : isDesktop ? (
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
        <Pressable style={styles.headerAction} onPress={handleSignOut}>
          <Text style={styles.headerActionText}>Salir</Text>
        </Pressable>
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
      <Pressable style={styles.mobileHeaderAction} onPress={handleSignOut}>
        <Text style={styles.mobileHeaderActionText}>Salir</Text>
      </Pressable>
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
          <ChatList chats={visibleChats} selectedChatId={selectedChat?.id ?? ''} onSelect={handleSelectChat} />
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
          <View style={[styles.root, styles.rootDesktop, adminMode && styles.rootAdminDesktop, { height: desktopViewportHeight }]}>

            {header}
            <View style={[styles.workspace, styles.workspaceDesktop, adminMode && styles.workspaceAdminDesktop]}>
              {chatsPanel}
              {conversationPanel}
            </View>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.mobileRoot}>
          {header}
          {mobileSwitcher}
          <View style={styles.mobileContentArea}>{mobileView === 'chats' ? chatsPanel : conversationPanel}</View>
        </View>
      )}
    </KeyboardAvoidingView>
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
    width: 380,
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










