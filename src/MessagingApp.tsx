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
import { QuickStats } from './components/QuickStats';
import { mockChats, mockMessages } from './data/mockData';
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
      setSelectedChatId((current) => current || nextChats[0]?.id || '');
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : 'No fue posible cargar los chats.');
    } finally {
      setLoadingChats(false);
    }
  }, []);

  useEffect(() => {
    void loadChats();
  }, [loadChats, session.user.id]);

  const sourceChats = liveChats.length > 0 ? liveChats : mockChats;
  const sourceMessages = liveChats.length > 0 ? liveMessages : mockMessages;

  useEffect(() => {
    if (!selectedChatId && sourceChats.length > 0) {
      setSelectedChatId(sourceChats[0].id);
    }
  }, [selectedChatId, sourceChats]);

  const selectedChat = useMemo(
    () => sourceChats.find((chat) => chat.id === selectedChatId) ?? sourceChats[0],
    [selectedChatId, sourceChats]
  );

  const visibleChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return sourceChats;
    }

    return sourceChats.filter((chat) => {
      const haystack = `${chat.name} ${chat.lastMessage} ${chat.members.join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [search, sourceChats]);

  const currentMessages = selectedChat ? sourceMessages[selectedChat.id] ?? [] : [];
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
      [selectedChat.id]: [...(previous[selectedChat.id] ?? currentMessages), optimisticMessage],
    }));
    setDrafts((previous) => ({
      ...previous,
      [selectedChat.id]: '',
    }));

    if (liveChats.length === 0) {
      return;
    }

    setSending(true);

    try {
      await sendTextMessage({
        chatId: selectedChat.id,
        senderId: session.user.id,
        body: trimmed,
      });
      await loadChats();
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : 'No fue posible enviar el mensaje.');
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
      await loadChats();
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

  const showEmptyState = !loadingChats && liveChats.length === 0;

  return (
    <View style={styles.root}>
      <View style={[styles.heroCard, isDesktop && styles.heroCardDesktop]}>
        <Text style={styles.eyebrow}>MVP de mensajeria</Text>
        <Text style={styles.title}>Base inicial para tu app tipo WhatsApp</Text>
        <Text style={styles.subtitle}>
          Ahora ya puede conectarse a Supabase para usuarios reales. El siguiente paso es crear el
          primer chat y activar realtime.
        </Text>
        <Text style={styles.sessionText}>Sesion activa: {session.user.email ?? 'usuario@local'}</Text>
        <QuickStats />
      </View>

      <View style={[styles.workspace, isDesktop && styles.workspaceDesktop]}>
        <View style={[styles.sidebar, isDesktop && styles.sidebarDesktop]}>
          <Text style={styles.sectionTitle}>Conversaciones</Text>
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
              <Text style={styles.sidebarStateText}>Cargando chats reales...</Text>
            </View>
          ) : showEmptyState ? (
            <View style={styles.sidebarState}>
              <Text style={styles.sidebarStateTitle}>Todavia no hay chats creados</Text>
              <Text style={styles.sidebarStateText}>
                Usa el formulario de arriba para crear la primera conversacion con usuarios ya
                registrados.
              </Text>
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
              <Text style={styles.emptyConversationTitle}>Sin conversacion seleccionada</Text>
              <Text style={styles.emptyConversationText}>
                Crea el primer chat para empezar a probar mensajes reales con Supabase.
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.bottomBar, isDesktop && styles.bottomBarDesktop]}>
        <Text style={styles.bottomBarText}>
          {loadingError
            ? `Estado: ${loadingError}`
            : sending
              ? 'Enviando mensaje...'
              : liveChats.length > 0
                ? 'Chats reales cargados desde Supabase.'
                : 'Backend conectado. Falta crear las primeras conversaciones.'}
        </Text>
        <Pressable style={styles.bottomBarAction} onPress={handleSignOut}>
          <Text style={styles.bottomBarActionText}>Salir</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 16,
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: palette.card,
    borderRadius: 24,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroCardDesktop: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
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
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: palette.secondaryText,
    fontSize: 14,
    lineHeight: 21,
  },
  sessionText: {
    color: palette.accentSoft,
    fontSize: 13,
    fontWeight: '600',
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
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    maxHeight: 280,
  },
  sidebarDesktop: {
    width: 360,
    maxHeight: '100%',
    minHeight: 560,
  },
  sectionTitle: {
    color: palette.primaryText,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: palette.input,
    color: palette.primaryText,
    borderRadius: 14,
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
    paddingVertical: 24,
  },
  sidebarStateTitle: {
    color: palette.primaryText,
    fontSize: 16,
    fontWeight: '700',
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  chatPanelDesktop: {
    minHeight: 560,
  },
  emptyConversation: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyConversationTitle: {
    color: palette.primaryText,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyConversationText: {
    color: palette.secondaryText,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
  },
  bottomBarDesktop: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  bottomBarText: {
    flex: 1,
    color: palette.secondaryText,
    fontSize: 13,
  },
  bottomBarAction: {
    backgroundColor: palette.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  bottomBarActionText: {
    color: palette.buttonText,
    fontWeight: '700',
  },
});
