import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MediaLibraryRecord, QuickReplyRecord } from '../types/chat';
import { palette } from '../theme/palette';

type AdminResourcePanelProps = {
  quickReplies: QuickReplyRecord[];
  mediaLibrary: MediaLibraryRecord[];
  onUseQuickReply: (reply: QuickReplyRecord) => void;
  onUseMedia: (item: MediaLibraryRecord) => void;
};

export function AdminResourcePanel({ quickReplies, mediaLibrary, onUseQuickReply, onUseMedia }: AdminResourcePanelProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Biblioteca rapida</Text>
      <Text style={styles.subtitle}>Inserta mensajes precargados e imagenes guardadas en la conversacion activa.</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tags y respuestas</Text>
          {quickReplies.length === 0 ? (
            <Text style={styles.emptyText}>Todavia no hay respuestas precargadas.</Text>
          ) : (
            quickReplies.map((reply) => (
              <Pressable key={reply.id} onPress={() => onUseQuickReply(reply)} style={styles.replyCard}>
                <Text style={styles.replyTag}>{reply.tag}</Text>
                <Text style={styles.replyLabel}>{reply.label}</Text>
                <Text style={styles.replyBody} numberOfLines={4}>{reply.body}</Text>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Imagenes precargadas</Text>
          {mediaLibrary.length === 0 ? (
            <Text style={styles.emptyText}>Todavia no hay imagenes guardadas.</Text>
          ) : (
            mediaLibrary.map((item) => (
              <Pressable key={item.id} onPress={() => onUseMedia(item)} style={styles.mediaCard}>
                <Image source={{ uri: item.image_url }} style={styles.mediaPreview} resizeMode="cover" />
                <View style={styles.mediaCopy}>
                  <Text style={styles.mediaTitle}>{item.title}</Text>
                  <Text style={styles.mediaTag}>{item.tag || '#imagen'}</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 320,
    backgroundColor: '#0b1220',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 10,
  },
  title: {
    color: palette.primaryText,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: palette.secondaryText,
    fontSize: 12,
    lineHeight: 18,
  },
  content: {
    gap: 16,
    paddingBottom: 6,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: palette.primaryText,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyText: {
    color: palette.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  replyCard: {
    backgroundColor: '#13213a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22304a',
    padding: 12,
    gap: 4,
  },
  replyTag: {
    color: '#facc15',
    fontSize: 11,
    fontWeight: '800',
  },
  replyLabel: {
    color: palette.primaryText,
    fontSize: 13,
    fontWeight: '800',
  },
  replyBody: {
    color: palette.secondaryText,
    fontSize: 12,
    lineHeight: 18,
  },
  mediaCard: {
    backgroundColor: '#13213a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22304a',
    overflow: 'hidden',
  },
  mediaPreview: {
    width: '100%',
    height: 120,
    backgroundColor: '#0f172a',
  },
  mediaCopy: {
    padding: 10,
    gap: 2,
  },
  mediaTitle: {
    color: palette.primaryText,
    fontSize: 13,
    fontWeight: '800',
  },
  mediaTag: {
    color: palette.secondaryText,
    fontSize: 12,
  },
});