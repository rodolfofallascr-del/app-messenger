import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PendingAttachment } from '../types/chat';
import { palette } from '../theme/palette';

type MessageComposerProps = {
  value: string;
  attachment: PendingAttachment | null;
  busy?: boolean;
  isDragActive?: boolean;
  onChangeText: (value: string) => void;
  onPickImage: () => void;
  onPickFile: () => void;
  onClearAttachment: () => void;
  onSend: () => void;
};

export function MessageComposer({
  value,
  attachment,
  busy,
  isDragActive,
  onChangeText,
  onPickImage,
  onPickFile,
  onClearAttachment,
  onSend,
}: MessageComposerProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.attachments}>
        <Tag label="+ Foto" onPress={onPickImage} />
        <Tag label="+ Archivo" onPress={onPickFile} />
      </View>
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
            <Text style={styles.attachmentMeta}>{attachment.type === 'image' ? 'Imagen lista para enviar' : 'Archivo listo para enviar'}</Text>
          </View>
          <Pressable onPress={onClearAttachment} style={styles.removeButton}>
            <Text style={styles.removeButtonText}>Quitar</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
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
    padding: 14,
    gap: 12,
  },
  attachments: {
    flexDirection: 'row',
    gap: 8,
  },
  tag: {
    backgroundColor: palette.input,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagText: {
    color: palette.secondaryText,
    fontWeight: '600',
    fontSize: 12,
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
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#122033',
    borderRadius: 16,
    padding: 12,
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
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    backgroundColor: palette.input,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: palette.primaryText,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 18,
    minHeight: 52,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: palette.buttonText,
    fontWeight: '800',
  },
});
