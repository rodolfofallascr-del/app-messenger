import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette } from '../theme/palette';
import { SelectableUser } from '../types/chat';

type CreateChatCardProps = {
  groupName: string;
  selectedUserIds: string[];
  users: SelectableUser[];
  loadingUsers?: boolean;
  onChangeGroupName: (value: string) => void;
  onToggleUser: (userId: string) => void;
  onCreate: () => void;
  busy?: boolean;
  message?: string | null;
};

export function CreateChatCard({
  groupName,
  selectedUserIds,
  users,
  loadingUsers,
  onChangeGroupName,
  onToggleUser,
  onCreate,
  busy,
  message,
}: CreateChatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Crear chat</Text>
      <Text style={styles.subtitle}>
        Selecciona usuarios registrados. Si eliges uno, se crea un chat directo. Si eliges varios,
        se crea un grupo.
      </Text>
      <TextInput
        value={groupName}
        onChangeText={onChangeGroupName}
        placeholder="Nombre del grupo (opcional)"
        placeholderTextColor={palette.mutedText}
        style={styles.input}
      />

      <View style={styles.selectionHeader}>
        <Text style={styles.selectionTitle}>Participantes</Text>
        <Text style={styles.selectionCount}>{selectedUserIds.length}</Text>
      </View>

      {loadingUsers ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Cargando usuarios...</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Todavia no hay otros usuarios registrados.</Text>
        </View>
      ) : (
        <ScrollView style={styles.userList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <View style={styles.userListContent}>
            {users.map((user) => {
              const selected = selectedUserIds.includes(user.id);
              return (
                <Pressable
                  key={user.id}
                  onPress={() => onToggleUser(user.id)}
                  style={[styles.userRow, selected && styles.userRowSelected]}
                >
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{user.fullName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.userContent}>
                    <Text style={styles.userName}>{user.fullName}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                  </View>
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected ? <Text style={styles.checkboxText}>?</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

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
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionTitle: {
    color: palette.primaryText,
    fontWeight: '700',
    fontSize: 13,
  },
  selectionCount: {
    minWidth: 24,
    textAlign: 'center',
    color: palette.accentSoft,
    backgroundColor: palette.input,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontWeight: '800',
    fontSize: 12,
  },
  userList: {
    maxHeight: 220,
  },
  userListContent: {
    gap: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.input,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 10,
  },
  userRowSelected: {
    borderColor: palette.accent,
    backgroundColor: '#11231a',
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0891b2',
  },
  userAvatarText: {
    color: palette.primaryText,
    fontWeight: '800',
  },
  userContent: {
    flex: 1,
    gap: 2,
  },
  userName: {
    color: palette.primaryText,
    fontWeight: '700',
    fontSize: 13,
  },
  userEmail: {
    color: palette.secondaryText,
    fontSize: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.card,
  },
  checkboxSelected: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  checkboxText: {
    color: palette.buttonText,
    fontWeight: '800',
    fontSize: 12,
  },
  emptyState: {
    backgroundColor: palette.input,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
  },
  emptyStateText: {
    color: palette.secondaryText,
    fontSize: 12,
    lineHeight: 18,
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
