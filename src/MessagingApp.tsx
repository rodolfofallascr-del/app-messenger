import { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { createChat, fetchChatRowsForCurrentUser, sendTextMessage } from './lib/chatService';
import { getSupabaseClient } from './lib/supabase';
import { palette } from './theme/palette';
import { ChatMessage, ChatThread } from './types/chat';

type MessagingAppProps = {
  session: Session;
};

export function MessagingApp({ session }: MessagingAppProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [selectedChatId, setSelectedChatId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [liveChats, setLiveChats] = useState<ChatThread[]>([]);
  const [liveMessages, setLiveMessages] = useState<Record<string, ChatMessage[]>>({});
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [participantEmails, setParticipantEmails] = useState('');
  const [createMessage, setCreateMessage] = useState<string | null>(null);

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    setLoadingError(null);

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
      setLoadingChats(false);
    }
  }, []);

  useEffect(() => {
    void loadChats();
  }, [loadChats, session.user.id]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`messaging-realtime-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
        void loadChats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members' }, () => {
        void loadChats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        void loadChats();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadChats, session.user.id]);

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

  const handleSend = async () => {
    if (!selectedChat) {
      return;
    }

    const trimmed = currentDraft.trim();
    if (!trimmed) {
      return;
    }

    const optimisticMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      author: 'Tu',
      content: trimmed,
      timestamp: 'Ahora',
      direction: 'outgoing',
      status: 'sending',
    };

    setLiveMessages((previous) => ({
      ...previous,
      [selectedChat.id]: [...(previous[selectedChat.id] ?? []), optimisticMessage],
    }));
    setDrafts((previous) => ({
      ...previous,
      [selectedChat.id]: '',
    }));

    setSending(true);

    try {
      await sendTextMessage({
        chatId: selectedChat.id,
        senderId: session.user.id,
        body: trimmed,
      });
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : 'No fue posible enviar el mensaje.');
      await loadChats();
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
        currentUserEmail: session.user.email ?? null,
        name: groupName,
        participantEmails: participantEmails.split(',').map((item) => item.trim()),
      });

      setGroupName('');
      setParticipantEmails('');
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
    <View style={styles.root}>
      <View style={[styles.headerShell, isDesktop && styles.headerShellDesktop]}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Mensajeria privada</Text>
          <Text style={styles.title}>Comunicacion directa para tu equipo</Text>
          <Text style={styles.subtitle}>
            Usuarios reales, conversaciones persistentes y sincronizacion en vivo con Supabase.
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
        <View style={[styles.sidebar, isDesktop && styles.sidebarDesktop]}>
          <View style={styles.sidebarHeader}>
            <Text style={styles.sectionTitle}>Conversaciones</Text>
            <Text style={styles.counter}>{liveChats.length}</Text>
          </View>
          <CreateChatCard
            groupName={groupName}
            participantEmails={participantEmails}
            onChangeGroupName={setGroupName}
            onChangeParticipantEmails={setParticipantEmails}
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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.chatListContent}>
              <ChatList chats={visibleChats} selectedChatId={selectedChat?.id ?? ''} onSelect={setSelectedChatId} />
            </ScrollView>
          )}
        </View>

        <View style={[styles.chatPanel, isDesktop && styles.chatPanelDesktop]}>
          {selectedChat ? (
            <>
              <ConversationView chat={selectedChat} messages={currentMessages} />
              <MessageComposer
                value={currentDraft}
                onChangeText={(value) =>
                  setDrafts((previous) => ({
                    ...previous,
                    [selectedChat.id]: value,
                  }))
                }
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
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 16,
    width: '100%',
    alignSelf: 'center',
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
    color: palette.accent,
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
    flex: 1,
    gap: 14,
    minHeight: 0,
  },
  workspaceDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
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
    minHeight: 620,
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
    minHeight: 620,
  },
  emptyConversation: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 10,
    backgroundColor: '#0f172a',
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
