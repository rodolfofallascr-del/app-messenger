import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { createChat, fetchChatRowsForCurrentUser, fetchSelectableUsers, sendAttachmentMessage, sendTextMessage } from './lib/chatService';
import { getSupabaseClient } from './lib/supabase';
import { palette } from './theme/palette';
import { ChatMessage, ChatThread, PendingAttachment, SelectableUser } from './types/chat';

type MessagingAppProps = {
  session: Session;
};

const brandLogo = require('../assets/chat-santanita-logo.jpeg');

export function MessagingApp({ session }: MessagingAppProps) {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 960;
  const isCompactHeight = height < 860;
  const desktopViewportHeight = Math.max(640, height - 32);
  const [selectedChatId, setSelectedChatId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [liveChats, setLiveChats] = useState<ChatThread[]>([]);
  const [liveMessages, setLiveMessages] = useState<Record<string, ChatMessage[]>>({});
  const [availableUsers, setAvailableUsers] = useState<SelectableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

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
      const users = await fetchSelectableUsers(session.user.id);
      setAvailableUsers(users);
    } catch (error) {
      setCreateMessage(error instanceof Error ? error.message : 'No fue posible cargar los usuarios.');
    } finally {
      setLoadingUsers(false);
    }
  }, [session.user.id]);

  const loadChats = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoadingChats(true);
      setLoadingError(null);
    }

    try {
      const { userId, rows } = await fetchChatRowsForCurrentUser();
      const nextChats = rows.map((row) =>
        buildChatThread({
          chat: row,
          members: row.members,
          lastMessage: row.messages[row.messages.length - 1] ?? null,
          currentUserId: userId,
        })
      );

      const nextMessages = Object.fromEntries(
        rows.map((row) => [row.id, buildChatMessages(row.messages, userId)])
      ) as Record<string, ChatMessage[]>;

      setLiveChats(nextChats);
      setLiveMessages(nextMessages);
      setSelectedChatId((current) => {
        if (nextChats.some((chat) => chat.id === current)) {
          return current;
        }

        return nextChats[0]?.id ?? '';
      });
    } catch (error) {
      setLiveChats([]);
      setLiveMessages({});
      setSelectedChatId('');
      setLoadingError(error instanceof Error ? error.message : 'No fue posible cargar los chats.');
    } finally {
      if (!options?.silent) {
        setLoadingChats(false);
      }
    }
  }, []);

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

  const selectedChat = useMemo(
    () => liveChats.find((chat) => chat.id === selectedChatId) ?? null,
    [selectedChatId, liveChats]
  );

  const visibleChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return liveChats;
    }

    return liveChats.filter((chat) => {
      const haystack = `${chat.name} ${chat.lastMessage} ${chat.members.join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [search, liveChats]);

  const currentMessages = selectedChat ? liveMessages[selectedChat.id] ?? [] : [];
  const currentDraft = selectedChat ? drafts[selectedChat.id] ?? '' : '';

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
      await loadChats({ silent: true });
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : 'No fue posible enviar el mensaje.');
      await loadChats({ silent: true });
    } finally {
      setSending(false);
    }
  };

  const handleCreateChat = async () => {
    setCreateMessage(null);
    setCreatingChat(true);

    try {
      const chatId = await createChat({
        currentUserId: session.user.id,
        name: groupName,
        participantIds: selectedUserIds,
      });

      setGroupName('');
      setSelectedUserIds([]);
      await loadChats();
      setSelectedChatId(chatId);
      setCreateMessage('Conversacion creada correctamente.');
    } catch (error) {
      setCreateMessage(error instanceof Error ? error.message : 'No fue posible crear la conversacion.');
    } finally {
      setCreatingChat(false);
    }
  };

  const handleSignOut = () => {
    getSupabaseClient()
      .auth.signOut()
      .catch(() => undefined);
  };

  const statusText = loadingError
    ? `Estado: ${loadingError}`
    : sending
      ? 'Enviando mensaje...'
      : creatingChat
        ? 'Creando conversacion...'
        : liveChats.length > 0
          ? `${liveChats.length} conversaciones sincronizadas.`
          : 'Listo para crear tu primera conversacion.';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.screenContent,
        isDesktop && styles.screenContentDesktop,
        isDesktop && { minHeight: desktopViewportHeight },
      ]}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!isDesktop}
    >
      <View style={[styles.root, isDesktop && styles.rootDesktop, isDesktop && { height: desktopViewportHeight }]}>
        <View style={[styles.headerShell, isDesktop && styles.headerShellDesktop]}>
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

        <View style={[styles.workspace, isDesktop && styles.workspaceDesktop]}>
          <View style={[styles.sidebar, isDesktop && styles.sidebarDesktop, isCompactHeight && styles.compactPanel]}>
            <View style={styles.sidebarHeader}>
              <Text style={styles.sectionTitle}>Conversaciones</Text>
              <Text style={styles.counter}>{liveChats.length}</Text>
            </View>
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
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar chat o usuario"
              placeholderTextColor={palette.mutedText}
              style={styles.searchInput}
            />
            {loadingChats ? (
              <View style={styles.sidebarState}>
                <ActivityIndicator color={palette.accent} />
                <Text style={styles.sidebarStateText}>Cargando conversaciones...</Text>
              </View>
            ) : liveChats.length === 0 ? (
              <View style={styles.sidebarState}>
                <Text style={styles.sidebarStateTitle}>Aun no tienes conversaciones</Text>
                <Text style={styles.sidebarStateText}>
                  Crea un chat con usuarios registrados y aqui aparecera en tiempo real.
                </Text>
              </View>
            ) : visibleChats.length === 0 ? (
              <View style={styles.sidebarState}>
                <Text style={styles.sidebarStateTitle}>Sin resultados</Text>
                <Text style={styles.sidebarStateText}>Prueba otro termino de busqueda.</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.chatListScroller}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.chatListContent}
              >
                <ChatList chats={visibleChats} selectedChatId={selectedChat?.id ?? ''} onSelect={setSelectedChatId} />
              </ScrollView>
            )}
          </View>

          <View style={[styles.chatPanel, isDesktop && styles.chatPanelDesktop, isCompactHeight && styles.compactPanel]}>
            {selectedChat ? (
              <>
                <ConversationView chat={selectedChat} messages={currentMessages} />
                <MessageComposer
                  value={currentDraft}
                  attachment={pendingAttachment}
                  busy={sending}
                  isDragActive={isDragActive}
                  onChangeText={(value) =>
                    setDrafts((previous) => ({
                      ...previous,
                      [selectedChat.id]: value,
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
                <Text style={styles.emptyConversationTitle}>Tu bandeja esta lista</Text>
                <Text style={styles.emptyConversationText}>
                  Crea una conversacion desde la columna izquierda para empezar a enviar mensajes reales.
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  sidebar: {
    backgroundColor: palette.panel,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    minHeight: 420,
  },
  sidebarDesktop: {
    width: 380,
    minHeight: 0,
  },
  chatPanel: {
    flex: 1,
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
    minHeight: 420,
  },
  chatPanelDesktop: {
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
  chatListScroller: {
    flex: 1,
    minHeight: 0,
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
  emptyConversation: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
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
    fontSize: 28,
    fontWeight: '800',
  },
  emptyConversationText: {
    color: palette.secondaryText,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 420,
  },
});
