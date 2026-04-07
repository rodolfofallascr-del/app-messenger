import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
    <>
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
              {message.attachmentLabel ? <Text style={styles.attachment}>{message.attachmentLabel}</Text> : null}
              <Text style={styles.timestamp}>
                {message.timestamp}
                {isOutgoing && message.status ? ` · ${message.status}` : ''}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
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
  attachment: {
    color: '#fdba74',
    fontSize: 12,
    fontWeight: '700',
  },
  timestamp: {
    color: palette.mutedText,
    fontSize: 11,
  },
});
