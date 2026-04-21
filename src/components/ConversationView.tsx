import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import { getAdminTagPresentation } from '../lib/adminTags';
import { palette } from '../theme/palette';
import { ChatMessage, ChatThread } from '../types/chat';

function comingSoon(label: string) {
  Alert.alert(label, 'Disponible proximamente.');
}

type ConversationViewProps = {
  chat: ChatThread;
  messages: ChatMessage[];
  compact?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  deletingMessageId?: string | null;
  onDeleteMessage?: (messageId: string) => void;
  onReplyMessage?: (message: ChatMessage) => void;
  starredMessageIds?: Set<string>;
  pinnedMessageIds?: Set<string>;
  onToggleStarMessage?: (message: ChatMessage) => void;
  onTogglePinMessage?: (message: ChatMessage, durationMs?: number | null) => void;
  onDownloadAttachment?: (message: ChatMessage) => void;
  onForwardMessage?: (message: ChatMessage) => void;
};

export function ConversationView({
  chat,
  messages,
  compact,
  showBackButton,
  onBack,
  deletingMessageId,
  onDeleteMessage,
  onReplyMessage,
  starredMessageIds,
  pinnedMessageIds,
  onToggleStarMessage,
  onTogglePinMessage,
  onDownloadAttachment,
  onForwardMessage,
}: ConversationViewProps) {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const messageOffsetByIdRef = useRef<Record<string, number>>({});
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; outgoing: boolean } | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const hoverHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const [mobileExpandedMessageId, setMobileExpandedMessageId] = useState<string | null>(null);
  const [starredDrawerVisible, setStarredDrawerVisible] = useState(false);
  const [pinDurationMessage, setPinDurationMessage] = useState<ChatMessage | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  const pinnedMessage = useMemo(() => {
    if (!pinnedMessageIds?.size) {
      return null;
    }

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const candidate = messages[i];
      if (candidate && pinnedMessageIds.has(candidate.id)) {
        return candidate;
      }
    }

    return null;
  }, [messages, pinnedMessageIds]);

  const starredMessages = useMemo(() => {
    if (!starredMessageIds?.size) {
      return [];
    }

    return messages.filter((message) => starredMessageIds.has(message.id));
  }, [messages, starredMessageIds]);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && !compact;
  const imageWidth = isDesktopWeb ? Math.min(420, Math.max(320, width * 0.26)) : 260;
  const imageHeight = Math.round(imageWidth * 0.78);

  const audioSoundRef = useRef<Audio.Sound | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      void (async () => {
        try {
          if (audioSoundRef.current) {
            await audioSoundRef.current.unloadAsync();
          }
        } catch {
          // ignore
        } finally {
          audioSoundRef.current = null;
        }
      })();
    };
  }, []);

  const togglePlayAudio = useCallback(async (message: ChatMessage) => {
    const url = message.attachmentUrl;
    if (!url) return;

    try {
      // If tapping the same audio, toggle stop.
      if (playingAudioId === message.id) {
        if (audioSoundRef.current) {
          await audioSoundRef.current.stopAsync();
          await audioSoundRef.current.unloadAsync();
          audioSoundRef.current = null;
        }
        setPlayingAudioId(null);
        return;
      }

      // Stop any current audio first.
      if (audioSoundRef.current) {
        await audioSoundRef.current.stopAsync();
        await audioSoundRef.current.unloadAsync();
        audioSoundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
      audioSoundRef.current = sound;
      setPlayingAudioId(message.id);

      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        if ((status as any).didJustFinish) {
          setPlayingAudioId(null);
          void (async () => {
            try {
              await sound.unloadAsync();
            } catch {
              // ignore
            } finally {
              if (audioSoundRef.current === sound) {
                audioSoundRef.current = null;
              }
            }
          })();
        }
      });
    } catch (error) {
      Alert.alert('Audio', error instanceof Error ? error.message : 'No fue posible reproducir el audio.');
      setPlayingAudioId(null);
    }
  }, [playingAudioId]);

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

  const cancelHoverHide = useCallback(() => {
    if (hoverHideTimerRef.current) {
      clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
  }, []);

  const closeMenu = useCallback(() => {
    setActiveMenuMessageId(null);
    setMobileMenuVisible(false);
    setMobileExpandedMessageId(null);
  }, []);

  const openMenuAtEvent = useCallback((messageId: string, outgoing: boolean, event: any) => {
    if (Platform.OS !== 'web') {
      return;
    }

    const nativeEvent = event?.nativeEvent ?? event ?? {};
    const x = Number(nativeEvent.pageX ?? nativeEvent.clientX ?? 0);
    const y = Number(nativeEvent.pageY ?? nativeEvent.clientY ?? 0);
    setMenuPosition({ x, y, outgoing });
    setActiveMenuMessageId((current) => (current === messageId ? null : messageId));
  }, []);

  const handleCopy = useCallback(async (value: string) => {
    const text = (value ?? '').trim();
    if (!text) return;

    try {
      if (Platform.OS === 'web' && globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(text);
        return;
      }

      await Clipboard.setStringAsync(text);
    } catch {
      // Best effort.
    }
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
        <View style={styles.headerRight}>
          {Platform.OS === 'web' && !compact ? (
            <Pressable
              style={[styles.headerActionPill, starredMessages.length > 0 && styles.headerActionPillActive]}
              onPress={() => setStarredDrawerVisible(true)}
              accessibilityLabel="Ver mensajes destacados"
            >
              <Text style={[styles.headerActionPillText, starredMessages.length > 0 && styles.headerActionPillTextActive]}>
                {'\u2B50'} Destacados{starredMessages.length ? ` (${starredMessages.length})` : ''}
              </Text>
            </Pressable>
          ) : null}
          <View style={[styles.headerBadge, compact && styles.headerBadgeCompact]}>
            <Text style={styles.headerBadgeText}>{chat.encryptionLabel}</Text>
          </View>
        </View>
      </View>

      {pinnedMessage ? (
        <View style={[styles.pinnedBanner, compact && styles.pinnedBannerCompact]}>
          <View style={styles.pinnedBannerLeft}>
            <Text style={styles.pinnedBannerIcon}>{'\uD83D\uDCCC'}</Text>
            <View style={styles.pinnedBannerBody}>
              <Text style={styles.pinnedBannerTitle}>Mensaje fijado</Text>
              <Text style={styles.pinnedBannerSnippet} numberOfLines={1}>
                {(pinnedMessage.content ?? '').trim() || pinnedMessage.attachmentLabel || 'Adjunto'}
              </Text>
            </View>
          </View>
          <View style={styles.pinnedBannerRight}>
            <Pressable
              style={styles.pinnedBannerAction}
              onPress={() => {
                // Quick jump: expand on mobile to make it easy to see the menu.
                if (Platform.OS !== 'web') {
                  setMobileExpandedMessageId(pinnedMessage.id);
                }
              }}
            >
              <Text style={styles.pinnedBannerActionText}>Ver</Text>
            </Pressable>
            {onTogglePinMessage ? (
              <Pressable
                style={[styles.pinnedBannerAction, styles.pinnedBannerUnpin]}
                onPress={() => onTogglePinMessage(pinnedMessage, null)}
              >
                <Text style={styles.pinnedBannerActionText}>No fijar</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollArea}
        contentContainerStyle={[styles.body, compact && styles.bodyCompact]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        onScrollBeginDrag={closeMenu}
      >
          {messages.map((message) => {
            const isOutgoing = message.direction === 'outgoing';
            const canOpenAttachment = Boolean(message.attachmentLabel && message.attachmentUrl);
            const isImageAttachment = message.attachmentType === 'image' && Boolean(message.attachmentUrl);
            const isVideoAttachment = message.attachmentType === 'video' && Boolean(message.attachmentUrl);
            const isAudioAttachment = message.attachmentType === 'audio' && Boolean(message.attachmentUrl);
            const hasVisibleText = !isImageAttachment && Boolean(message.content?.trim());
          const allowLongPressDelete = Boolean(Platform.OS !== 'web' && isOutgoing && message.canDelete && onDeleteMessage);
          const allowMobileDelete = Boolean(Platform.OS !== 'web' && isOutgoing && message.canDelete && onDeleteMessage);
          const allowWebMenu = Platform.OS === 'web' && !compact;
          const isMenuOpen = activeMenuMessageId === message.id;
          const isStarred = Boolean(starredMessageIds?.has(message.id));
          const isPinned = Boolean(pinnedMessageIds?.has(message.id));
          const showMenuTrigger = Boolean(allowWebMenu && (isMenuOpen || hoveredMessageId === message.id));
          const isMobile = Platform.OS !== 'web';
          const isExpandedOnMobile = Boolean(isMobile && mobileExpandedMessageId === message.id);

          return (
            <Pressable
              key={message.id}
              style={[
                styles.bubble,
                compact && styles.bubbleCompact,
                isOutgoing ? styles.outgoing : styles.incoming,
                isExpandedOnMobile ? styles.bubbleExpanded : null,
              ]}
              onLayout={(event) => {
                if (Platform.OS !== 'web') {
                  return;
                }

                const y = (event as any)?.nativeEvent?.layout?.y;
                if (typeof y === 'number') {
                  messageOffsetByIdRef.current[message.id] = y;
                }
              }}
              onPress={() => {
                if (!isMobile) return;
                setMobileExpandedMessageId((current) => (current === message.id ? null : message.id));
              }}
              onHoverIn={() => {
                if (!allowWebMenu) return;
                cancelHoverHide();
                setHoveredMessageId(message.id);
              }}
              onHoverOut={() => {
                if (!allowWebMenu) return;
                cancelHoverHide();
                // Small delay so the user can move the mouse from the bubble to the trigger without it disappearing.
                hoverHideTimerRef.current = setTimeout(() => {
                  setHoveredMessageId((current) => (current === message.id ? null : current));
                }, 200);
              }}
              onLongPress={() => {
                if (Platform.OS === 'web') {
                  return;
                }

                setActiveMenuMessageId(message.id);
                setMobileMenuVisible(true);
              }}
              delayLongPress={250}
            >
              {isMobile && isExpandedOnMobile ? (
                <Pressable
                  style={styles.mobileMenuTrigger}
                  onPress={(event) => {
                    (event as any)?.stopPropagation?.();
                    setActiveMenuMessageId(message.id);
                    setMobileMenuVisible(true);
                  }}
                  hitSlop={10}
                >
                  <Text style={styles.mobileMenuTriggerText}>{'\u22EE'}</Text>
                </Pressable>
              ) : null}
              {showMenuTrigger ? (
                <Pressable
                  style={styles.menuTrigger}
                  onPress={(event) => openMenuAtEvent(message.id, isOutgoing, event)}
                  onHoverIn={() => {
                    if (!allowWebMenu) return;
                    cancelHoverHide();
                    setHoveredMessageId(message.id);
                  }}
                  onHoverOut={() => {
                    if (!allowWebMenu) return;
                    cancelHoverHide();
                    hoverHideTimerRef.current = setTimeout(() => {
                      // Keep visible if menu is open.
                      setHoveredMessageId((current) => (activeMenuMessageId === message.id ? message.id : current === message.id ? null : current));
                    }, 200);
                  }}
                  hitSlop={10}
                >
                  <Text style={styles.menuTriggerText}>{'\u25BE'}</Text>
                </Pressable>
              ) : null}
              {isStarred && (!compact || isExpandedOnMobile) ? (
                <View style={[styles.flagBadge, isOutgoing ? styles.flagBadgeOutgoing : styles.flagBadgeIncoming]}>
                  <Text style={[styles.flagBadgeText, styles.flagBadgeStarText]}>{'\u2B50'}</Text>
                </View>
              ) : null}
              {isPinned && (!compact || isExpandedOnMobile) ? (
                <View style={[styles.flagBadge, styles.flagBadgePinned, isOutgoing ? styles.flagBadgeOutgoing : styles.flagBadgeIncoming]}>
                  <Text style={[styles.flagBadgeText, styles.flagBadgePinText]}>{'\uD83D\uDCCC'}</Text>
                </View>
              ) : null}
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
              {isVideoAttachment ? (
                Platform.OS === 'web' ? (
                  <View style={[styles.videoOnlyWrap, { width: imageWidth, height: imageHeight }]}>
                    <video
                      src={message.attachmentUrl as string}
                      controls
                      style={{ width: '100%', height: '100%', borderRadius: 16, background: '#0b1220' }}
                    />
                  </View>
                ) : (
                  <Pressable onPress={() => void handleOpenAttachment(message.attachmentUrl as string, 'file')} style={styles.attachmentCard}>
                    <Text style={styles.attachmentType}>Video</Text>
                    <Text style={styles.attachment}>{message.attachmentLabel}</Text>
                    <Text style={styles.attachmentHint}>Abrir video</Text>
                  </Pressable>
                )
              ) : null}
              {isAudioAttachment ? (
                Platform.OS === 'web' ? (
                  <View style={[styles.audioOnlyWrap, { width: imageWidth }]}>
                    <audio
                      src={message.attachmentUrl as string}
                      controls
                      style={{ width: '100%' }}
                    />
                  </View>
                ) : (
                  <Pressable onPress={() => void togglePlayAudio(message)} style={styles.audioCard}>
                    <Text style={styles.attachmentType}>Audio</Text>
                    <Text style={styles.attachment} numberOfLines={1}>
                      {message.attachmentLabel || 'audio'}
                    </Text>
                    <Text style={styles.attachmentHint}>{playingAudioId === message.id ? 'Detener audio' : 'Reproducir audio'}</Text>
                  </Pressable>
                )
              ) : null}
              {canOpenAttachment && !isImageAttachment && !isVideoAttachment && !isAudioAttachment ? (
                <Pressable onPress={() => void handleOpenAttachment(message.attachmentUrl as string, 'file')} style={styles.attachmentCard}>
                  <Text style={styles.attachmentType}>{message.attachmentType === 'image' ? 'Imagen' : 'Archivo'}</Text>
                  <Text style={styles.attachment}>{message.attachmentLabel}</Text>
                  <Text style={styles.attachmentHint}>{message.attachmentType === 'image' ? 'Abrir imagen' : 'Abrir archivo'}</Text>
                </Pressable>
              ) : null}
              <Text style={styles.timestamp}>
                {message.timestamp}
                {isOutgoing && message.status ? (
                  <Text style={message.status === 'leido' ? styles.readReceiptRead : styles.readReceiptDelivered}>
                    {' '}
                    {'\u2713\u2713'}
                  </Text>
                ) : null}
                {isPinned ? '  📌' : ''}
                {isStarred ? '  ★' : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {Platform.OS !== 'web' && mobileMenuVisible && activeMenuMessageId ? (
        <Modal transparent animationType="fade" visible onRequestClose={closeMenu}>
          <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
            {(() => {
              const message = messages.find((value) => value.id === activeMenuMessageId) ?? null;
              if (!message) return null;
              const isOutgoing = message.direction === 'outgoing';
              const canDelete = Boolean(isOutgoing && message.canDelete && onDeleteMessage);

              return (
                <View style={styles.mobileMenuSheet}>
                  <Pressable
                    style={styles.menuCardFloating}
                    onPress={(event) => {
                      // Prevent backdrop press.
                      (event as any)?.stopPropagation?.();
                    }}
                  >
                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        onReplyMessage?.(message);
                        closeMenu();
                      }}
                    >
                      <Text style={styles.menuItemText}>Responder</Text>
                    </Pressable>
                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        void handleCopy((message.content ?? '').trim() || message.attachmentUrl || '');
                        closeMenu();
                      }}
                    >
                      <Text style={styles.menuItemText}>Copiar</Text>
                    </Pressable>
                    {onToggleStarMessage ? (
                      <Pressable
                        style={styles.menuItem}
                        onPress={() => {
                          onToggleStarMessage(message);
                          closeMenu();
                        }}
                      >
                        <Text style={styles.menuItemText}>
                          {starredMessageIds?.has(message.id) ? 'Quitar destacado' : 'Destacar'}
                        </Text>
                      </Pressable>
                    ) : null}
                    {message.attachmentUrl ? (
                      <Pressable
                        style={styles.menuItem}
                        onPress={() => {
                          onDownloadAttachment?.(message);
                          closeMenu();
                        }}
                      >
                        <Text style={styles.menuItemText}>Descargar</Text>
                      </Pressable>
                    ) : null}
                    {onForwardMessage ? (
                      <Pressable
                        style={styles.menuItem}
                        onPress={() => {
                          onForwardMessage(message);
                          closeMenu();
                        }}
                      >
                        <Text style={styles.menuItemText}>Reenviar</Text>
                      </Pressable>
                    ) : null}
                    {onTogglePinMessage ? (
                      <Pressable
                        style={styles.menuItem}
                        onPress={() => {
                          const isPinned = Boolean(pinnedMessageIds?.has(message.id));
                          if (isPinned) {
                            onTogglePinMessage(message, null);
                            closeMenu();
                            return;
                          }

                          setPinDurationMessage(message);
                          closeMenu();
                        }}
                      >
                        <Text style={styles.menuItemText}>
                          {pinnedMessageIds?.has(message.id) ? 'No fijar' : 'Fijar'}
                        </Text>
                      </Pressable>
                    ) : null}
                    {canDelete ? (
                      <Pressable
                        style={styles.menuItem}
                        onPress={() => {
                          Alert.alert('Eliminar mensaje', 'Quieres eliminar este mensaje para todos?', [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Eliminar', style: 'destructive', onPress: () => onDeleteMessage?.(message.id) },
                          ]);
                          closeMenu();
                        }}
                      >
                        <Text style={[styles.menuItemText, styles.menuItemDanger]}>Eliminar</Text>
                      </Pressable>
                    ) : null}
                  </Pressable>
                </View>
              );
            })()}
          </Pressable>
        </Modal>
      ) : null}

      {Platform.OS === 'web' && !compact && activeMenuMessageId ? (
        <Modal transparent animationType="fade" visible onRequestClose={closeMenu}>
          <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
            <View
              style={[
                styles.menuFloating,
                {
                  left: Math.max(12, Math.min((menuPosition?.x ?? 12) - 10, (globalThis as any)?.innerWidth ? (globalThis as any).innerWidth - 220 : (menuPosition?.x ?? 12))),
                  top: Math.max(12, Math.min((menuPosition?.y ?? 12) + 8, (globalThis as any)?.innerHeight ? (globalThis as any).innerHeight - 260 : (menuPosition?.y ?? 12))),
                },
              ]}
            >
              {(() => {
                const message = messages.find((value) => value.id === activeMenuMessageId) ?? null;
                if (!message) return null;
                const isOutgoing = message.direction === 'outgoing';
                const isStarred = Boolean(starredMessageIds?.has(message.id));
                const isPinned = Boolean(pinnedMessageIds?.has(message.id));

                return (
                  <View style={styles.menuCardFloating}>
                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        onReplyMessage?.(message);
                        closeMenu();
                      }}
                    >
                      <Text style={styles.menuItemText}>Responder</Text>
                    </Pressable>
                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        void handleCopy((message.content ?? '').trim() || message.attachmentUrl || '');
                        closeMenu();
                      }}
                    >
                      <Text style={styles.menuItemText}>Copiar</Text>
                    </Pressable>
                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        onToggleStarMessage?.(message);
                        closeMenu();
                      }}
                    >
                      <Text style={styles.menuItemText}>{isStarred ? 'Quitar destacado' : 'Destacar'}</Text>
                    </Pressable>
                    {message.attachmentUrl ? (
                      <Pressable
                        style={styles.menuItem}
                        onPress={() => {
                          onDownloadAttachment?.(message);
                          closeMenu();
                        }}
                      >
                        <Text style={styles.menuItemText}>Descargar</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        onForwardMessage?.(message);
                        closeMenu();
                      }}
                    >
                      <Text style={styles.menuItemText}>Reenviar</Text>
                    </Pressable>
                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        const isPinned = Boolean(pinnedMessageIds?.has(message.id));
                        if (isPinned) {
                          onTogglePinMessage?.(message, null);
                          closeMenu();
                          return;
                        }

                        setPinDurationMessage(message);
                        closeMenu();
                      }}
                    >
                      <Text style={styles.menuItemText}>{isPinned ? 'No fijar' : 'Fijar'}</Text>
                    </Pressable>
                    {isOutgoing && message.canDelete && onDeleteMessage ? (
                      <Pressable
                        style={styles.menuItem}
                        onPress={() => {
                          onDeleteMessage(message.id);
                          closeMenu();
                        }}
                      >
                        <Text style={[styles.menuItemText, styles.menuItemDanger]}>Eliminar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })()}
            </View>
          </Pressable>
        </Modal>
      ) : null}

      {Platform.OS === 'web' && !compact && starredDrawerVisible ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setStarredDrawerVisible(false)}>
          <Pressable style={styles.menuBackdrop} onPress={() => setStarredDrawerVisible(false)}>
            <Pressable
              style={styles.starredDrawer}
              onPress={(event) => {
                (event as any)?.stopPropagation?.();
              }}
            >
              <View style={styles.starredDrawerHeader}>
                <Text style={styles.starredDrawerTitle}>{'\u2B50'} Mensajes destacados</Text>
                <Pressable style={styles.starredDrawerClose} onPress={() => setStarredDrawerVisible(false)}>
                  <Text style={styles.starredDrawerCloseText}>Cerrar</Text>
                </Pressable>
              </View>
              {starredMessages.length === 0 ? (
                <Text style={styles.starredDrawerEmpty}>No hay mensajes destacados en este chat.</Text>
              ) : (
                <ScrollView style={styles.starredDrawerList} showsVerticalScrollIndicator={false}>
                  {starredMessages
                    .slice()
                    .reverse()
                    .map((m) => {
                      const snippet = ((m.content ?? '').trim() || m.attachmentLabel || 'Adjunto').slice(0, 140);
                      return (
                        <Pressable
                          key={'starred-' + m.id}
                          style={styles.starredDrawerItem}
                          onPress={() => {
                            const y = messageOffsetByIdRef.current[m.id];
                            if (typeof y === 'number') {
                              scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 60), animated: true });
                            }
                            setStarredDrawerVisible(false);
                          }}
                        >
                          <Text style={styles.starredDrawerItemAuthor}>{m.author}</Text>
                          <Text style={styles.starredDrawerItemSnippet} numberOfLines={2}>
                            {snippet}
                          </Text>
                          <Text style={styles.starredDrawerItemMeta}>{m.timestamp}</Text>
                        </Pressable>
                      );
                    })}
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {pinDurationMessage && onTogglePinMessage ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setPinDurationMessage(null)}>
          <Pressable style={styles.menuBackdrop} onPress={() => setPinDurationMessage(null)}>
            <View style={styles.pinDurationSheet}>
              <View style={styles.pinDurationCard}>
                <Text style={styles.pinDurationTitle}>Fijar mensaje</Text>
                <Text style={styles.pinDurationSubtitle}>Elige cuanto tiempo quieres fijarlo.</Text>
                <Pressable
                  style={styles.pinDurationOption}
                  onPress={() => {
                    onTogglePinMessage(pinDurationMessage, 24 * 60 * 60 * 1000);
                    setPinDurationMessage(null);
                  }}
                >
                  <Text style={styles.pinDurationOptionText}>24 horas</Text>
                </Pressable>
                <Pressable
                  style={styles.pinDurationOption}
                  onPress={() => {
                    onTogglePinMessage(pinDurationMessage, 7 * 24 * 60 * 60 * 1000);
                    setPinDurationMessage(null);
                  }}
                >
                  <Text style={styles.pinDurationOptionText}>7 dias</Text>
                </Pressable>
                <Pressable
                  style={styles.pinDurationOption}
                  onPress={() => {
                    onTogglePinMessage(pinDurationMessage, 30 * 24 * 60 * 60 * 1000);
                    setPinDurationMessage(null);
                  }}
                >
                  <Text style={styles.pinDurationOptionText}>30 dias</Text>
                </Pressable>
                <Pressable style={styles.pinDurationCancel} onPress={() => setPinDurationMessage(null)}>
                  <Text style={styles.pinDurationCancelText}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>
      ) : null}

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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerActionPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  headerActionPillActive: {
    borderColor: 'rgba(250,204,21,0.35)',
    backgroundColor: 'rgba(250,204,21,0.10)',
  },
  headerActionPillText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '900',
  },
  headerActionPillTextActive: {
    color: '#fde68a',
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
  starredDrawer: {
    width: 380,
    maxWidth: '92%',
    maxHeight: '80%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    backgroundColor: 'rgba(15,23,42,0.96)',
    padding: 16,
    alignSelf: 'center',
    marginTop: 72,
  },
  starredDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  starredDrawerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
  },
  starredDrawerClose: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  starredDrawerCloseText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '900',
  },
  starredDrawerEmpty: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
  },
  starredDrawerList: {
    flexGrow: 0,
  },
  starredDrawerItem: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.14)',
    backgroundColor: 'rgba(2,6,23,0.55)',
    padding: 12,
    marginBottom: 10,
  },
  starredDrawerItemAuthor: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },
  starredDrawerItemSnippet: {
    color: '#f8fafc',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  starredDrawerItemMeta: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 8,
  },
  pinnedBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.22)',
    backgroundColor: 'rgba(248,113,113,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pinnedBannerCompact: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pinnedBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  pinnedBannerIcon: {
    fontSize: 16,
  },
  pinnedBannerBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  pinnedBannerTitle: {
    color: '#fecaca',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pinnedBannerSnippet: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
  },
  pinnedBannerRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  pinnedBannerAction: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  pinnedBannerUnpin: {
    borderColor: 'rgba(248,113,113,0.28)',
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  pinnedBannerActionText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '900',
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
  bubbleExpanded: {
    borderColor: 'rgba(148,163,184,0.55)',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
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
  mobileMenuTrigger: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    zIndex: 20,
  },
  mobileMenuTriggerText: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 18,
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
  videoOnlyWrap: {
    marginTop: 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0b1220',
  },
  audioOnlyWrap: {
    marginTop: 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    padding: 10,
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
  audioCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 11,
    gap: 3,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
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
  readReceiptDelivered: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
  },
  readReceiptRead: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '800',
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
  menuTrigger: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(2,6,23,0.18)',
    zIndex: 10,
  },
  menuTriggerText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '900',
  },
  menuCard: {
    position: 'absolute',
    top: 40,
    minWidth: 190,
    backgroundColor: '#0b1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    paddingVertical: 6,
    zIndex: 20,
  },
  menuCardIncoming: {
    right: 8,
  },
  menuCardOutgoing: {
    left: 8,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
  },
  menuFloating: {
    position: 'absolute',
    minWidth: 210,
    zIndex: 9999,
  },
  menuCardFloating: {
    backgroundColor: '#0b1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    paddingVertical: 6,
    width: '100%',
    maxWidth: 320,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  mobileMenuSheet: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
    paddingBottom: 84,
  },
  pinDurationSheet: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 14,
    paddingBottom: 38,
  },
  pinDurationCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0b1220',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  pinDurationTitle: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '900',
  },
  pinDurationSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  pinDurationOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    backgroundColor: 'rgba(148,163,184,0.06)',
  },
  pinDurationOptionText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '800',
  },
  pinDurationCancel: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  pinDurationCancelText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '800',
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  menuItemText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
  },
  menuItemDanger: {
    color: '#f87171',
  },
  flagBadge: {
    position: 'absolute',
    top: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(2,6,23,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    zIndex: 9,
  },
  flagBadgePinned: {
    top: 44,
  },
  flagBadgeIncoming: {
    left: 8,
  },
  flagBadgeOutgoing: {
    right: 8,
  },
  flagBadgeText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '900',
  },
  flagBadgeStarText: {
    color: '#facc15',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
  flagBadgePinText: {
    color: '#ef4444',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
});
