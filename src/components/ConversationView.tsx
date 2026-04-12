import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme/palette';
import { ChatMessage, ChatThread } from '../types/chat';

type ConversationViewProps = {
  chat: ChatThread;
  messages: ChatMessage[];
  compact?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
};

export function ConversationView({ chat, messages, compact, showBackButton, onBack }: ConversationViewProps) {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 80);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [chat.id, messages.length]);

  const handleOpenAttachment = useCallback(async (url: string, type?: 'image' | 'file') => {
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      if (type === 'image') {
        setActiveImageUrl(url);
        return;
      }

      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert('Adjunto no disponible', 'No fue posible abrir este adjunto en el dispositivo.');
        return;
      }

      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        'No fue posible abrir el adjunto',
        error instanceof Error ? error.message : 'Revisa la configuracion del archivo en Supabase.'
      );
    }
  }, []);

  return (
    <View style={styles.container}>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.headerInfo}>
          {showBackButton ? (
            <Pressable onPress={onBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>Volver</Text>
            </Pressable>
          ) : null}
          <View>
            <Text style={[styles.chatName, compact && styles.chatNameCompact]}>{chat.name}</Text>
            <Text style={styles.chatMeta}>
              {chat.members.join(', ')} - {chat.type === 'group' ? 'Grupo' : 'Directo'}
            </Text>
          </View>
        </View>
        <View style={[styles.headerBadge, compact && styles.headerBadgeCompact]}>
          <Text style={styles.headerBadgeText}>{chat.encryptionLabel}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollArea}
        contentContainerStyle={[styles.body, compact && styles.bodyCompact]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((message) => {
          const isOutgoing = message.direction === 'outgoing';
          const canOpenAttachment = Boolean(message.attachmentLabel && message.attachmentUrl);
          const isImageAttachment = message.attachmentType === 'image' && Boolean(message.attachmentUrl);
          const hasVisibleText = !isImageAttachment && Boolean(message.content?.trim());

          return (
            <View key={message.id} style={[styles.bubble, compact && styles.bubbleCompact, isOutgoing ? styles.outgoing : styles.incoming]}>
              {!isOutgoing ? <Text style={styles.author}>{message.author}</Text> : null}
              {hasVisibleText ? <Text style={styles.content}>{message.content}</Text> : null}
              {isImageAttachment ? (
                <Pressable onPress={() => void handleOpenAttachment(message.attachmentUrl as string, 'image')} style={styles.imageOnlyWrap}>
                  <Image source={{ uri: message.attachmentUrl as string }} style={styles.attachmentImage} resizeMode="cover" />
                </Pressable>
              ) : null}
              {canOpenAttachment && !isImageAttachment ? (
                <Pressable onPress={() => void handleOpenAttachment(message.attachmentUrl as string, 'file')} style={styles.attachmentCard}>
                  <Text style={styles.attachmentType}>{message.attachmentType === 'image' ? 'Imagen' : 'Archivo'}</Text>
                  <Text style={styles.attachment}>{message.attachmentLabel}</Text>
                  <Text style={styles.attachmentHint}>{message.attachmentType === 'image' ? 'Abrir imagen' : 'Abrir archivo'}</Text>
                </Pressable>
              ) : null}
              <Text style={styles.timestamp}>
                {message.timestamp}
                {isOutgoing && message.status ? ' - ' + message.status : ''}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={Boolean(activeImageUrl)} transparent animationType="fade" onRequestClose={() => setActiveImageUrl(null)}>
        <View style={styles.imageModalBackdrop}>
          <Pressable style={styles.imageModalClose} onPress={() => setActiveImageUrl(null)}>
            <Text style={styles.imageModalCloseText}>Cerrar</Text>
          </Pressable>
          {activeImageUrl ? <Image source={{ uri: activeImageUrl }} style={styles.imageModalPreview} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#0e1628',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#101a2d',
  },
  headerCompact: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    backgroundColor: palette.input,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  backButtonText: {
    color: palette.secondaryText,
    fontWeight: '800',
    fontSize: 11,
  },
  chatName: {
    color: palette.primaryText,
    fontSize: 20,
    fontWeight: '800',
  },
  chatNameCompact: {
    fontSize: 16,
  },
  chatMeta: {
    color: palette.secondaryText,
    fontSize: 12,
    marginTop: 3,
  },
  headerBadge: {
    backgroundColor: '#16253e',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerBadgeCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
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
    paddingHorizontal: 22,
    paddingVertical: 18,
    gap: 14,
    backgroundColor: '#0e1628',
  },
  bodyCompact: {
    padding: 14,
    gap: 10,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderRadius: 22,
    gap: 7,
    borderWidth: 1,
  },
  bubbleCompact: {
    padding: 12,
  },
  incoming: {
    alignSelf: 'flex-start',
    backgroundColor: '#152544',
    borderColor: '#22395f',
    borderTopLeftRadius: 8,
  },
  outgoing: {
    alignSelf: 'flex-end',
    backgroundColor: '#14532d',
    borderColor: '#1c7a45',
    borderTopRightRadius: 8,
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
  attachmentImage: {
    width: 260,
    height: 190,
    borderRadius: 16,
    marginTop: 4,
    backgroundColor: '#0b1220',
  },
  imageOnlyWrap: {
    marginTop: 4,
  },
  imageModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 14,
  },
  imageModalClose: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  imageModalCloseText: {
    color: palette.primaryText,
    fontSize: 13,
    fontWeight: '800',
  },
  imageModalPreview: {
    width: '100%',
    height: '88%',
    borderRadius: 18,
    backgroundColor: '#0b1220',
  },
  attachmentCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 11,
    gap: 3,
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
    marginTop: 2,
  },
});
