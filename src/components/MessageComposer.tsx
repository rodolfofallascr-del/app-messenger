import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PendingAttachment } from '../types/chat';
import { palette } from '../theme/palette';
import { ADMIN_EMOJI_LIBRARY } from '../constants/adminEmojiLibrary';

type MessageComposerProps = {
  value: string;
  attachment: PendingAttachment | null;
  busy?: boolean;
  isDragActive?: boolean;
  clipboardPasteEnabled?: boolean;
  showEmojiPicker?: boolean;
  emojiPickerOpen?: boolean;
  showAudioRecorder?: boolean;
  audioRecording?: boolean;
  replyPreview?: { author: string; snippet: string } | null;
  onClearReplyPreview?: () => void;
  onChangeText: (value: string) => void;
  onPickImage: () => void;
  onPickFile: () => void;
  onPickAudio?: () => void;
  onClearAttachment: () => void;
  onSend: () => void;
  onToggleEmojiPicker?: () => void;
  onInsertEmoji?: (emoji: string) => void;
  sendOnEnter?: boolean;
  focusSignal?: number;
};

export function MessageComposer({
  value,
  attachment,
  busy,
  isDragActive,
  clipboardPasteEnabled,
  showEmojiPicker,
  emojiPickerOpen,
  showAudioRecorder,
  audioRecording,
  replyPreview,
  onClearReplyPreview,
  onChangeText,
  onPickImage,
  onPickFile,
  onPickAudio,
  onClearAttachment,
  onSend,
  onToggleEmojiPicker,
  onInsertEmoji,
  sendOnEnter,
  focusSignal,
}: MessageComposerProps) {
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (!focusSignal) {
      return;
    }

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 40);

    return () => clearTimeout(timer);
  }, [focusSignal]);

  const handleKeyPress = (event: any) => {
    const pressedKey = event?.nativeEvent?.key ?? event?.key;
    if (!sendOnEnter || pressedKey !== 'Enter') {
      return;
    }

    const shiftPressed = Boolean(event?.nativeEvent?.shiftKey ?? event?.shiftKey);
    if (shiftPressed) {
      return;
    }

    if (typeof event?.preventDefault === 'function') {
      event.preventDefault();
    }
    onSend();
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.attachments}>
        <Tag label="+ Foto" onPress={onPickImage} />
        <Tag label="+ Archivo" onPress={onPickFile} />
        {showAudioRecorder ? (
          <Tag label={audioRecording ? 'Detener audio' : '+ Audio'} onPress={onPickAudio ?? (() => undefined)} />
        ) : null}
        {showEmojiPicker ? <Tag label={emojiPickerOpen ? 'Ocultar emojis' : '+ Emojis'} onPress={onToggleEmojiPicker ?? (() => undefined)} /> : null}
        {clipboardPasteEnabled ? <Text style={styles.clipboardHint}>Ctrl + V para pegar captura</Text> : null}
      </View>
      {showEmojiPicker && emojiPickerOpen ? (
        <View style={styles.emojiLibraryCard}>
          <ScrollView style={styles.emojiLibraryScroll} contentContainerStyle={styles.emojiLibraryGrid} showsVerticalScrollIndicator={false}>
            {ADMIN_EMOJI_LIBRARY.map((emoji) => (
              <Pressable key={emoji} onPress={() => onInsertEmoji?.(emoji)} style={styles.emojiLibraryChip}>
                <Text style={styles.emojiLibraryText}>{emoji}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {isDragActive ? (
        <View style={styles.dropHint}>
          <Text style={styles.dropHintTitle}>Suelta tu archivo aqui</Text>
          <Text style={styles.dropHintText}>Puedes arrastrar imagenes o archivos desde el escritorio.</Text>
        </View>
      ) : null}
      {attachment ? (
        <View style={styles.attachmentPreview}>
          <View style={styles.attachmentInfo}>
            <Text style={styles.attachmentName}>{attachment.name}</Text>
            <Text style={styles.attachmentMeta}>
              {attachment.type === 'image'
                ? 'Imagen lista para enviar'
                : attachment.mimeType?.startsWith('audio/')
                  ? 'Audio listo para enviar'
                  : 'Archivo listo para enviar'}
            </Text>
          </View>
          <Pressable onPress={onClearAttachment} style={styles.removeButton}>
            <Text style={styles.removeButtonText}>Quitar</Text>
          </Pressable>
        </View>
      ) : null}
      {replyPreview ? (
        <View style={styles.replyPreview}>
          <View style={styles.replyPreviewBody}>
            <Text style={styles.replyPreviewEyebrow}>Respondiendo a {replyPreview.author}</Text>
            <Text style={styles.replyPreviewText} numberOfLines={2}>
              {replyPreview.snippet || 'Mensaje'}
            </Text>
          </View>
          <Pressable onPress={onClearReplyPreview ?? (() => undefined)} style={styles.replyPreviewClose} hitSlop={10}>
            <Text style={styles.replyPreviewCloseText}>×</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.row}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onKeyPress={handleKeyPress}
          placeholder="Escribe un mensaje"
          placeholderTextColor={palette.mutedText}
          style={styles.input}
          multiline
        />
        <Pressable onPress={onSend} style={[styles.button, busy && styles.buttonDisabled]} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Enviando' : 'Enviar'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Tag({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: 'rgba(16,27,47,0.55)',
  },
  attachments: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: palette.border,
  },
  tagText: {
    color: palette.secondaryText,
    fontWeight: '600',
    fontSize: 12,
  },
  clipboardHint: {
    color: palette.mutedText,
    fontSize: 12,
    fontWeight: '600',
    alignSelf: 'center',
    marginLeft: 4,
  },
  dropHint: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.accent,
    backgroundColor: '#11231a',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  dropHintTitle: {
    color: palette.primaryText,
    fontWeight: '800',
    fontSize: 13,
  },
  dropHintText: {
    color: palette.secondaryText,
    fontSize: 12,
    lineHeight: 18,
  },
  emojiLibraryCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 10,
  },
  emojiLibraryScroll: {
    maxHeight: 220,
  },
  emojiLibraryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emojiLibraryChip: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.input,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emojiLibraryText: {
    fontSize: 22,
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  attachmentInfo: {
    flex: 1,
    gap: 2,
  },
  attachmentName: {
    color: palette.primaryText,
    fontWeight: '700',
    fontSize: 13,
  },
  attachmentMeta: {
    color: palette.secondaryText,
    fontSize: 12,
  },
  removeButton: {
    backgroundColor: palette.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeButtonText: {
    color: palette.secondaryText,
    fontWeight: '700',
    fontSize: 12,
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  replyPreviewBody: {
    flex: 1,
    gap: 2,
  },
  replyPreviewEyebrow: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '800',
  },
  replyPreviewText: {
    color: palette.secondaryText,
    fontSize: 12,
  },
  replyPreviewClose: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.card,
  },
  replyPreviewCloseText: {
    color: palette.secondaryText,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 58,
    maxHeight: 132,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: palette.primaryText,
    textAlignVertical: 'top',
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 22,
    minHeight: 58,
    minWidth: 96,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: palette.buttonText,
    fontWeight: '800',
  },
});
