import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme/palette';
import { ChatThread } from '../types/chat';

type ChatListProps = {
  chats: ChatThread[];
  selectedChatId: string;
  onSelect: (chatId: string) => void;
};

export function ChatList({ chats, selectedChatId, onSelect }: ChatListProps) {
  return (
    <View style={styles.list}>
      {chats.map((chat) => {
        const isActive = chat.id === selectedChatId;

        return (
          <Pressable
            key={chat.id}
            onPress={() => onSelect(chat.id)}
            style={[styles.item, isActive && styles.itemActive]}
          >
            <View style={[styles.avatar, { backgroundColor: chat.avatarColor }]}>
              <Text style={styles.avatarText}>{chat.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.content}>
              <View style={styles.row}>
                <Text style={styles.name}>{chat.name}</Text>
                <Text style={styles.time}>{chat.lastActivity}</Text>
              </View>
              <Text style={styles.message} numberOfLines={1}>
                {chat.lastMessage}
              </Text>
            </View>
            {chat.unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{chat.unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
  },
  itemActive: {
    borderColor: palette.accent,
    backgroundColor: palette.cardActive,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: palette.buttonText,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: {
    color: palette.primaryText,
    fontWeight: '700',
    fontSize: 15,
  },
  time: {
    color: palette.mutedText,
    fontSize: 12,
  },
  message: {
    color: palette.secondaryText,
    fontSize: 13,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent,
    paddingHorizontal: 8,
  },
  badgeText: {
    color: palette.buttonText,
    fontWeight: '800',
    fontSize: 12,
  },
});
