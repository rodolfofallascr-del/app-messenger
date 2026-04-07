import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette } from '../theme/palette';

type CreateChatCardProps = {
  groupName: string;
  participantEmails: string;
  onChangeGroupName: (value: string) => void;
  onChangeParticipantEmails: (value: string) => void;
  onCreate: () => void;
  busy?: boolean;
  message?: string | null;
};

export function CreateChatCard({
  groupName,
  participantEmails,
  onChangeGroupName,
  onChangeParticipantEmails,
  onCreate,
  busy,
  message,
}: CreateChatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Crear chat</Text>
      <Text style={styles.subtitle}>
        Ingresa uno o varios correos de usuarios ya registrados. Si agregas mas de uno, se crea un
        grupo.
      </Text>
      <TextInput
        value={groupName}
        onChangeText={onChangeGroupName}
        placeholder="Nombre del grupo (opcional)"
        placeholderTextColor={palette.mutedText}
        style={styles.input}
      />
      <TextInput
        value={participantEmails}
        onChangeText={onChangeParticipantEmails}
        placeholder="correo1@empresa.com, correo2@empresa.com"
        placeholderTextColor={palette.mutedText}
        style={[styles.input, styles.textArea]}
        multiline
      />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={onCreate} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Creando...' : 'Crear conversacion'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
    marginBottom: 12,
  },
  title: {
    color: palette.primaryText,
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: palette.secondaryText,
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    backgroundColor: palette.input,
    color: palette.primaryText,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  message: {
    color: '#fde68a',
    fontSize: 12,
    lineHeight: 18,
  },
  button: {
    backgroundColor: palette.accent,
    minHeight: 46,
    borderRadius: 14,
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
