import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { ChatList } from './components/ChatList';
import { ConversationView } from './components/ConversationView';
import { MessageComposer } from './components/MessageComposer';
import { QuickStats } from './components/QuickStats';
import { mockChats, mockMessages } from './data/mockData';
import { getSupabaseClient } from './lib/supabase';
import { palette } from './theme/palette';
import { ChatMessage } from './types/chat';

type MessagingAppProps = {
  currentUserEmail?: string;
};

export function MessagingApp({ currentUserEmail }: MessagingAppProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [selectedChatId, setSelectedChatId] = useState(mockChats[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [messagesByChat, setMessagesByChat] = useState(mockMessages);
  const [search, setSearch] = useState('');

  const selectedChat = useMemo(
    () => mockChats.find((chat) => chat.id === selectedChatId) ?? mockChats[0],
    [selectedChatId]
  );

  const visibleChats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return mockChats;
    }

    return mockChats.filter((chat) => {
      const haystack = `${chat.name} ${chat.lastMessage} ${chat.members.join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [search]);

  const currentMessages = messagesByChat[selectedChat.id] ?? [];
  const currentDraft = drafts[selectedChat.id] ?? '';

  const handleSend = () => {
    const trimmed = currentDraft.trim();
    if (!trimmed) {
      return;
    }

    const nextMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      author: 'Tu',
      content: trimmed,
      timestamp: 'Ahora',
      direction: 'outgoing',
      status: 'sending',
    };

    setMessagesByChat((previous) => ({
      ...previous,
      [selectedChat.id]: [...(previous[selectedChat.id] ?? []), nextMessage],
    }));
    setDrafts((previous) => ({
      ...previous,
      [selectedChat.id]: '',
    }));
  };

  const handleSignOut = () => {
    getSupabaseClient()
      .auth.signOut()
      .catch(() => undefined);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.heroCard, isDesktop && styles.heroCardDesktop]}>
        <Text style={styles.eyebrow}>MVP de mensajeria</Text>
        <Text style={styles.title}>Base inicial para tu app tipo WhatsApp</Text>
        <Text style={styles.subtitle}>
          Lista de chats, conversacion, busqueda, adjuntos y estructura preparada para conectar
          Supabase en el siguiente paso.
        </Text>
        {currentUserEmail ? <Text style={styles.sessionText}>Sesion activa: {currentUserEmail}</Text> : null}
        <QuickStats />
      </View>

      <View style={[styles.workspace, isDesktop && styles.workspaceDesktop]}>
        <View style={[styles.sidebar, isDesktop && styles.sidebarDesktop]}>
          <Text style={styles.sectionTitle}>Conversaciones</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar chat o usuario"
            placeholderTextColor={palette.mutedText}
            style={styles.searchInput}
          />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.chatListContent}>
            <ChatList chats={visibleChats} selectedChatId={selectedChat.id} onSelect={setSelectedChatId} />
          </ScrollView>
        </View>

        <View style={[styles.chatPanel, isDesktop && styles.chatPanelDesktop]}>
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
        </View>
      </View>

      <View style={[styles.bottomBar, isDesktop && styles.bottomBarDesktop]}>
        <Text style={styles.bottomBarText}>Siguiente integracion recomendada: chats reales, realtime y storage.</Text>
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
    width: 340,
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
