import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { getAdminTagPresentation } from '../lib/adminTags';
import { palette } from '../theme/palette';
import { ChatMessage, ChatThread } from '../types/chat';

type ConversationViewProps = {
  chat: ChatThread;
  messages: ChatMessage[];
  compact?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  deletingMessageId?: string | null;
  onDeleteMessage?: (messageId: string) => void;
};

export function ConversationView({ chat, messages, compact, showBackButton, onBack, deletingMessageId, onDeleteMessage }: ConversationViewProps) {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && !compact;
  const imageWidth = isDesktopWeb ? Math.min(420, Math.max(320, width * 0.26)) : 260;
  const imageHeight = Math.round(imageWidth * 0.78);

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
      if (type === 'image') {
        setImageZoom(1);
        setImageOffset({ x: 0, y: 0 });
        setActiveImageUrl(url);
        return;
      }

      if (Platform.OS === 'web') {
        window.open(url, '_blank', 'noopener,noreferrer');
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

  const closeImageViewer = useCallback(() => {
    setActiveImageUrl(null);
    setImageZoom(1);
    setImageOffset({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = useCallback(() => {
    setImageZoom((current) => Math.min(4, Number((current + 0.25).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setImageZoom((current) => Math.max(0.5, Number((current - 0.25).toFixed(2))));
  }, []);

  const handleResetZoom = useCallback(() => {
    setImageZoom(1);
    setImageOffset({ x: 0, y: 0 });
  }, []);

  const handleImageWheel = useCallback((event: any) => {
    const deltaY = event?.deltaY ?? event?.nativeEvent?.deltaY;
    if (typeof deltaY !== 'number') {
      return;
    }

    if (typeof event?.preventDefault === 'function') {
      event.preventDefault();
    }

    setImageZoom((current) => {
      const next = deltaY < 0 ? current + 0.12 : current - 0.12;
      return Math.min(4, Math.max(0.5, Number(next.toFixed(2))));
    });
  }, []);

  const handleDragStart = useCallback((event: any) => {
    if (Platform.OS !== 'web' || imageZoom <= 1) {
      return;
    }

    dragStateRef.current = {
      active: true,
      startX: event?.clientX ?? 0,
      startY: event?.clientY ?? 0,
      originX: imageOffset.x,
      originY: imageOffset.y,
    };
  }, [imageOffset.x, imageOffset.y, imageZoom]);

  const handleDragMove = useCallback((event: any) => {
    if (Platform.OS !== 'web' || !dragStateRef.current.active || imageZoom <= 1) {
      return;
    }

    const currentX = event?.clientX ?? 0;
    const currentY = event?.clientY ?? 0;
    const deltaX = currentX - dragStateRef.current.startX;
    const deltaY = currentY - dragStateRef.current.startY;

    setImageOffset({
      x: dragStateRef.current.originX + deltaX,
      y: dragStateRef.current.originY + deltaY,
    });
  }, [imageZoom]);

  const handleDragEnd = useCallback(() => {
    dragStateRef.current.active = false;
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
            {chat.adminTags?.length ? (
              <View style={styles.headerTagsRow}>
                {chat.adminTags.slice(0, 4).map((tag) => {
                  const visual = getAdminTagPresentation(tag);
                  return (
                    <View key={`${chat.id}-${tag}`} style={[styles.headerTagChip, { borderColor: visual.color, backgroundColor: `${visual.color}20` }]}>
                      <Text style={[styles.headerTagSymbol, { color: visual.color }]}>{visual.symbol}</Text>
                      <Text style={styles.headerTagText}>{tag}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
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
          const allowLongPressDelete = Boolean(Platform.OS !== 'web' && isOutgoing && message.canDelete && onDeleteMessage);
          const allowMobileDelete = Boolean(Platform.OS !== 'web' && isOutgoing && message.canDelete && onDeleteMessage);

          return (
            <Pressable
              key={message.id}
              style={[styles.bubble, compact && styles.bubbleCompact, isOutgoing ? styles.outgoing : styles.incoming]}
              onLongPress={() => {
                if (!allowLongPressDelete) {
                  return;
                }

                Alert.alert('Eliminar mensaje', 'Quieres eliminar este mensaje para todos?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Eliminar', style: 'destructive', onPress: () => onDeleteMessage?.(message.id) },
                ]);
              }}
              delayLongPress={250}
            >
              {!isOutgoing ? <Text style={styles.author}>{message.author}</Text> : null}
              {hasVisibleText ? <Text style={styles.content}>{message.content}</Text> : null}
              {isImageAttachment ? (
                <Pressable onPress={() => void handleOpenAttachment(message.attachmentUrl as string, 'image')} style={styles.imageOnlyWrap}>
                  <Image
                    source={{ uri: message.attachmentUrl as string }}
                    style={[styles.attachmentImage, { width: imageWidth, height: imageHeight }]}
                    resizeMode="contain"
                  />
                </Pressable>
              ) : null}
              {canOpenAttachment && !isImageAttachment ? (
                <Pressable onPress={() => void handleOpenAttachment(message.attachmentUrl as string, 'file')} style={styles.attachmentCard}>
                  <Text style={styles.attachmentType}>{message.attachmentType === 'image' ? 'Imagen' : 'Archivo'}</Text>
                  <Text style={styles.attachment}>{message.attachmentLabel}</Text>
                  <Text style={styles.attachmentHint}>{message.attachmentType === 'image' ? 'Abrir imagen' : 'Abrir archivo'}</Text>
                </Pressable>
              ) : null}
              {Platform.OS === 'web' && message.canDelete && onDeleteMessage ? (
                <Pressable
                  onPress={() => onDeleteMessage(message.id)}
                  style={styles.deleteMessageButton}
                  disabled={deletingMessageId === message.id}
                >
                  <Text style={styles.deleteMessageText}>
                    {deletingMessageId === message.id ? 'Eliminando...' : 'Eliminar'}
                  </Text>
                </Pressable>
              ) : null}
              {Platform.OS !== 'web' && allowMobileDelete ? (
                <Pressable
                  onPress={() => {
                    Alert.alert('Eliminar mensaje', 'Quieres eliminar este mensaje para todos?', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Eliminar', style: 'destructive', onPress: () => onDeleteMessage?.(message.id) },
                    ]);
                  }}
                  style={styles.deleteMessageButton}
                  disabled={deletingMessageId === message.id}
                >
                  <Text style={styles.deleteMessageText}>
                    {deletingMessageId === message.id ? 'Eliminando...' : 'Eliminar'}
                  </Text>
                </Pressable>
              ) : null}
              <Text style={styles.timestamp}>
                {message.timestamp}
                {isOutgoing && message.status ? ' - ' + message.status : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={Boolean(activeImageUrl)} transparent animationType="fade" onRequestClose={closeImageViewer}>
        <View style={styles.imageModalBackdrop}>
          <View style={styles.imageModalTopBar}>
            <View style={styles.imageModalToolbar}>
              <Pressable style={styles.imageModalAction} onPress={handleZoomOut}>
                <Text style={styles.imageModalActionText}>-</Text>
              </Pressable>
              <Pressable style={styles.imageModalAction} onPress={handleResetZoom}>
                <Text style={styles.imageModalActionText}>{Math.round(imageZoom * 100)}%</Text>
              </Pressable>
              <Pressable style={styles.imageModalAction} onPress={handleZoomIn}>
                <Text style={styles.imageModalActionText}>+</Text>
              </Pressable>
            </View>
            <Pressable style={styles.imageModalClose} onPress={closeImageViewer}>
              <Text style={styles.imageModalCloseText}>Cerrar</Text>
            </Pressable>
          </View>
          <View
            style={styles.imageModalViewport}
            {...(Platform.OS === 'web'
              ? ({
                  onWheel: handleImageWheel,
                  onMouseMove: handleDragMove,
                  onMouseUp: handleDragEnd,
                  onMouseLeave: handleDragEnd,
                } as any)
              : {})}
          >
            {activeImageUrl ? (
              <Image
                source={{ uri: activeImageUrl }}
                style={[
                  styles.imageModalPreview,
                  Platform.OS === 'web' && imageZoom > 1 ? styles.imageModalPreviewDraggable : null,
                  { transform: [{ translateX: imageOffset.x }, { translateY: imageOffset.y }, { scale: imageZoom }] },
                ]}
                resizeMode="contain"
                {...(Platform.OS === 'web' ? ({ onMouseDown: handleDragStart } as any) : {})}
              />
            ) : null}
          </View>
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
  headerTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 7,
  },
  headerTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  headerTagSymbol: {
    fontSize: 10,
  },
  headerTagText: {
    color: '#dbeafe',
    fontSize: 10,
    fontWeight: '700',
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
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderRadius: 22,
    gap: 7,
    borderWidth: 1,
    overflow: 'visible',
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
    flexShrink: 1,
    flexWrap: 'wrap',
    minWidth: 0,
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
    padding: 18,
    gap: 14,
  },
  imageModalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  imageModalToolbar: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  imageModalAction: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 54,
    alignItems: 'center',
  },
  imageModalActionText: {
    color: palette.primaryText,
    fontSize: 13,
    fontWeight: '800',
  },
  imageModalClose: {
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
  imageModalViewport: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imageModalPreview: {
    width: '88%',
    height: '82%',
    borderRadius: 18,
    backgroundColor: '#0b1220',
  },
  imageModalPreviewDraggable: {
    cursor: 'grab' as any,
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
  deleteMessageButton: {
    alignSelf: 'flex-end',
    marginTop: 2,
    backgroundColor: 'rgba(15,23,42,0.22)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteMessageText: {
    color: '#fecaca',
    fontSize: 11,
    fontWeight: '800',
  },
});
