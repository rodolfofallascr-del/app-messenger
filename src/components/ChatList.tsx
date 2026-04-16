import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getAdminTagPresentation } from '../lib/adminTags';
import { palette } from '../theme/palette';
import { ChatThread } from '../types/chat';

type ChatListProps = {
  chats: ChatThread[];
  selectedChatId: string;
  onSelect: (chatId: string) => void;
  showClearButton?: boolean;
  onClearChat?: (chatId: string) => void;
};

export function ChatList({ chats, selectedChatId, onSelect, showClearButton, onClearChat }: ChatListProps) {
  return (
    <View style={styles.list}>
      {chats.map((chat) => {
        const isActive = chat.id === selectedChatId;
        const hasUnread = chat.unreadCount > 0;

        return (
          <Pressable
            key={chat.id}
            onPress={() => onSelect(chat.id)}
            style={[styles.item, isActive && styles.itemActive, hasUnread && !isActive && styles.itemUnread]}
          >
            <View style={[styles.avatar, { backgroundColor: chat.avatarColor }]}> 
              <Text style={styles.avatarText}>{chat.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.content}>
              <View style={styles.row}>
                <Text style={[styles.name, hasUnread && styles.nameUnread]} numberOfLines={1}>{chat.name}</Text>
                <Text style={[styles.time, hasUnread && styles.timeUnread]}>{chat.lastActivity}</Text>
              </View>
              {chat.adminTags?.length ? (
                <View style={styles.tagsRow}>
                  {chat.adminTags.slice(0, 3).map((tag) => {
                    const visual = getAdminTagPresentation(tag);
                    return (
                    <View key={`${chat.id}-${tag}`} style={[styles.tagChip, { borderColor: visual.color, backgroundColor: `${visual.color}22` }]}>
                      <Text style={[styles.tagSymbol, { color: visual.color }]}>{visual.symbol}</Text>
                      <Text style={styles.tagText} numberOfLines={1}>{tag}</Text>
                    </View>
                  )})}
                </View>
              ) : null}
              <Text style={[styles.message, hasUnread && styles.messageUnread]} numberOfLines={1}>
                {chat.lastMessage}
              </Text>
            </View>
            {showClearButton ? (
              <Pressable
                onPress={(event) => {
                  event?.stopPropagation?.();
                  onClearChat?.(chat.id);
                }}
                hitSlop={10}
                style={styles.clearButton}
              >
                <Text style={styles.clearButtonText}>🧹</Text>
              </Pressable>
            ) : null}
            {hasUnread ? (
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
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#111c30',
  },
  itemActive: {
    borderColor: palette.accent,
    backgroundColor: '#16253e',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  itemUnread: {
    borderColor: '#27563b',
    backgroundColor: '#102118',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  avatarText: {
    color: palette.buttonText,
    fontWeight: '800',
    fontSize: 16,
  },
  content: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagSymbol: {
    fontSize: 10,
  },
  tagText: {
    color: '#c7d7f5',
    fontSize: 10,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  name: {
    color: palette.primaryText,
    fontWeight: '800',
    fontSize: 15,
    flex: 1,
  },
  nameUnread: {
    color: '#dcfce7',
  },
  time: {
    color: palette.mutedText,
    fontSize: 11,
    fontWeight: '600',
  },
  timeUnread: {
    color: palette.accentSoft,
    fontWeight: '700',
  },
  message: {
    color: palette.secondaryText,
    fontSize: 13,
    lineHeight: 18,
  },
  messageUnread: {
    color: palette.primaryText,
    fontWeight: '700',
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent,
    paddingHorizontal: 8,
    marginTop: 10,
  },
  badgeText: {
    color: palette.buttonText,
    fontWeight: '800',
    fontSize: 12,
  },
  clearButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    marginTop: 8,
  },
  clearButtonText: {
    fontSize: 14,
  },
});
