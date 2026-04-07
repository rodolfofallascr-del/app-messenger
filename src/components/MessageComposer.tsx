import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette } from '../theme/palette';

type MessageComposerProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
};

export function MessageComposer({ value, onChangeText, onSend }: MessageComposerProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.attachments}>
        <Tag label="+ Foto" />
        <Tag label="+ Archivo" />
      </View>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Escribe un mensaje"
          placeholderTextColor={palette.mutedText}
          style={styles.input}
          multiline
        />
        <Pressable onPress={onSend} style={styles.button}>
          <Text style={styles.buttonText}>Enviar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
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
  buttonText: {
    color: palette.buttonText,
    fontWeight: '800',
  },
});
