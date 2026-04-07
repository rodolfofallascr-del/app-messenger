import { useEffect, useRef } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme/palette';
import { ChatMessage, ChatThread } from '../types/chat';

type ConversationViewProps = {
  chat: ChatThread;
  messages: ChatMessage[];
};

export function ConversationView({ chat, messages }: ConversationViewProps) {
  const scrollViewRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 80);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [chat.id, messages.length]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.chatName}>{chat.name}</Text>
          <Text style={styles.chatMeta}>
            {chat.members.join(', ')} · {chat.type === 'group' ? 'Grupo' : 'Directo'}
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{chat.encryptionLabel}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((message) => {
          const isOutgoing = message.direction === 'outgoing';
          return (
            <View key={message.id} style={[styles.bubble, isOutgoing ? styles.outgoing : styles.incoming]}>
              {!isOutgoing ? <Text style={styles.author}>{message.author}</Text> : null}
              <Text style={styles.content}>{message.content}</Text>
              {message.attachmentLabel && message.attachmentUrl ? (
                <Pressable onPress={() => Linking.openURL(message.attachmentUrl ?? '')} style={styles.attachmentCard}>
                  <Text style={styles.attachmentType}>{message.attachmentType === 'image' ? 'Imagen' : 'Archivo'}</Text>
                  <Text style={styles.attachment}>{message.attachmentLabel}</Text>
                  <Text style={styles.attachmentHint}>Abrir</Text>
                </Pressable>
              ) : null}
              <Text style={styles.timestamp}>
                {message.timestamp}
                {isOutgoing && message.status ? ` · ${message.status}` : ''}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  chatName: {
    color: palette.primaryText,
    fontSize: 19,
    fontWeight: '800',
  },
  chatMeta: {
    color: palette.secondaryText,
    fontSize: 13,
    marginTop: 4,
  },
  headerBadge: {
    backgroundColor: palette.input,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerBadgeText: {
    color: palette.accentSoft,
    fontWeight: '700',
    fontSize: 12,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    padding: 18,
    gap: 12,
  },
  bubble: {
    maxWidth: '84%',
    padding: 14,
    borderRadius: 18,
    gap: 6,
  },
  incoming: {
    alignSelf: 'flex-start',
    backgroundColor: '#172554',
    borderTopLeftRadius: 6,
  },
  outgoing: {
    alignSelf: 'flex-end',
    backgroundColor: '#14532d',
    borderTopRightRadius: 6,
  },
  author: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    color: palette.primaryText,
    fontSize: 15,
    lineHeight: 22,
  },
  attachmentCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 10,
    gap: 2,
  },
  attachmentType: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  attachment: {
    color: '#fdba74',
    fontSize: 12,
    fontWeight: '700',
  },
  attachmentHint: {
    color: palette.secondaryText,
    fontSize: 11,
  },
  timestamp: {
    color: palette.mutedText,
    fontSize: 11,
  },
});
