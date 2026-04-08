import { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MessagingApp } from './MessagingApp';
import { fetchAdminUsers, updateUserAccess } from './lib/adminService';
import { getSupabaseClient } from './lib/supabase';
import { palette } from './theme/palette';
import { AppUserStatus, ProfileRecord } from './types/chat';

type AdminWebAppProps = {
  session: Session;
  profile: ProfileRecord;
};

type AdminSection = 'users' | 'conversations';

const brandLogo = require('../assets/chat-santanita-logo.jpeg');

export function AdminWebApp({ session, profile }: AdminWebAppProps) {
  const [users, setUsers] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | AppUserStatus>('all');
  const [section, setSection] = useState<AdminSection>('users');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setFeedback(null);

    try {
      const nextUsers = await fetchAdminUsers();
      setUsers(nextUsers);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section !== 'users') {
      return;
    }

    void loadUsers();
  }, [loadUsers, section]);

  useEffect(() => {
    if (section !== 'users') {
      return;
    }

    const supabase = getSupabaseClient();
    const channel = supabase
      .channel('admin-profiles-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        void loadUsers();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadUsers, section]);

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      if (user.id === profile.id) {
        return false;
      }

      if (filter !== 'all' && user.status !== filter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = ((user.full_name ?? '') + ' ' + (user.email ?? '')).toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [filter, profile.id, query, users]);

  const counts = useMemo(
    () => ({
      pending: users.filter((user) => user.id !== profile.id && user.status === 'pending').length,
      approved: users.filter((user) => user.id !== profile.id && user.status === 'approved').length,
      blocked: users.filter((user) => user.id !== profile.id && user.status === 'blocked').length,
    }),
    [profile.id, users]
  );

  const handleUpdateStatus = async (userId: string, status: AppUserStatus) => {
    setActionUserId(userId);
    setFeedback(null);

    try {
      await updateUserAccess(userId, status);
      setUsers((current) => current.map((user) => (user.id === userId ? { ...user, status } : user)));
      setFeedback(
        status === 'approved'
          ? 'Usuario aprobado correctamente.'
          : status === 'blocked'
            ? 'Usuario bloqueado correctamente.'
            : 'Estado actualizado.'
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible actualizar el usuario.');
    } finally {
      setActionUserId(null);
    }
  };

  const handleSignOut = () => {
    getSupabaseClient().auth.signOut().catch(() => undefined);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.shell}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <Image source={brandLogo} style={styles.logo} resizeMode="contain" />
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>Panel administrador</Text>
              <Text style={styles.title}>Control de acceso y mensajeria</Text>
              <Text style={styles.subtitle}>Aprueba usuarios, bloquea accesos y responde conversaciones desde la version web.</Text>
            </View>
            <Pressable style={styles.signOutButton} onPress={handleSignOut}>
              <Text style={styles.signOutText}>Salir</Text>
            </Pressable>
          </View>

          <View style={styles.metricsRow}>
            <MetricCard label="Pendientes" value={String(counts.pending)} />
            <MetricCard label="Aprobados" value={String(counts.approved)} />
            <MetricCard label="Bloqueados" value={String(counts.blocked)} />
          </View>
        </View>

        <View style={styles.sectionTabs}>
          <SectionTab label="Usuarios" active={section === 'users'} onPress={() => setSection('users')} />
          <SectionTab label="Conversaciones" active={section === 'conversations'} onPress={() => setSection('conversations')} />
        </View>

        {section === 'users' ? (
          <>
            <View style={styles.toolbar}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por nombre o correo"
                placeholderTextColor={palette.mutedText}
                style={styles.searchInput}
              />
              <View style={styles.filterRow}>
                <FilterChip label="Todos" active={filter === 'all'} onPress={() => setFilter('all')} />
                <FilterChip label="Pendientes" active={filter === 'pending'} onPress={() => setFilter('pending')} />
                <FilterChip label="Aprobados" active={filter === 'approved'} onPress={() => setFilter('approved')} />
                <FilterChip label="Bloqueados" active={filter === 'blocked'} onPress={() => setFilter('blocked')} />
              </View>
            </View>

            {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

            <View style={styles.listCard}>
              <View style={styles.listHeader}>
                <Text style={styles.listTitle}>Usuarios registrados</Text>
                <Pressable style={styles.refreshButton} onPress={() => void loadUsers()}>
                  <Text style={styles.refreshText}>Recargar</Text>
                </Pressable>
              </View>

              {loading ? (
                <View style={styles.stateBox}>
                  <ActivityIndicator color={palette.accent} />
                  <Text style={styles.stateText}>Cargando usuarios...</Text>
                </View>
              ) : visibleUsers.length === 0 ? (
                <View style={styles.stateBox}>
                  <Text style={styles.stateTitle}>No hay usuarios para mostrar</Text>
                  <Text style={styles.stateText}>Cambia el filtro o espera nuevos registros.</Text>
                </View>
              ) : (
                <View style={styles.userList}>
                  {visibleUsers.map((user) => {
                    const busy = actionUserId === user.id;
                    return (
                      <View key={user.id} style={styles.userCard}>
                        <View style={styles.userMain}>
                          <View style={styles.userAvatar}>
                            <Text style={styles.userAvatarText}>{(user.full_name || user.email || 'U').charAt(0).toUpperCase()}</Text>
                          </View>
                          <View style={styles.userCopy}>
                            <Text style={styles.userName}>{user.full_name?.trim() || 'Sin nombre'}</Text>
                            <Text style={styles.userEmail}>{user.email ?? 'Sin correo'}</Text>
                            <Text style={styles.userMeta}>Rol: {user.role} | Estado: {user.status}</Text>
                          </View>
                        </View>
                        <View style={styles.actionsRow}>
                          <ActionButton label="Aprobar" tone="approve" disabled={busy || user.status === 'approved'} onPress={() => void handleUpdateStatus(user.id, 'approved')} />
                          <ActionButton label="Pendiente" tone="neutral" disabled={busy || user.status === 'pending'} onPress={() => void handleUpdateStatus(user.id, 'pending')} />
                          <ActionButton label="Bloquear" tone="block" disabled={busy || user.status === 'blocked'} onPress={() => void handleUpdateStatus(user.id, 'blocked')} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>Siguiente paso recomendado</Text>
              <Text style={styles.noteText}>Despues de esto conviene anadir biblioteca de imagenes precargadas, tags y respuestas rapidas para que el admin responda mas rapido.</Text>
              <Text style={styles.noteText}>Sesion actual: {session.user.email ?? 'admin'}.</Text>
            </View>
          </>
        ) : (
          <View style={styles.messagingCard}>
            <View style={styles.messagingHeader}>
              <Text style={styles.messagingTitle}>Bandeja del administrador</Text>
              <Text style={styles.messagingCopy}>Aqui puedes responder conversaciones desde la web. En el siguiente bloque podemos especializarla para clientes solamente, con biblioteca y tags.</Text>
            </View>
            <View style={styles.messagingViewport}>
              <MessagingApp session={session} />
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SectionTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.sectionTab, active && styles.sectionTabActive]}>
      <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, tone, disabled, onPress }: { label: string; tone: 'approve' | 'block' | 'neutral'; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.actionButton, tone === 'approve' && styles.actionApprove, tone === 'block' && styles.actionBlock, disabled && styles.actionDisabled]}>
      <Text style={[styles.actionText, tone !== 'neutral' && styles.actionTextDark]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: 18,
  },
  shell: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },
  heroCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 28,
    padding: 24,
    gap: 18,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    width: 126,
    height: 70,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    color: '#facc15',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: palette.primaryText,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
  },
  subtitle: {
    color: palette.secondaryText,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 760,
  },
  signOutButton: {
    backgroundColor: palette.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  signOutText: {
    color: palette.buttonText,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#101a2d',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 6,
  },
  metricValue: {
    color: palette.primaryText,
    fontSize: 28,
    fontWeight: '800',
  },
  metricLabel: {
    color: palette.secondaryText,
    fontSize: 13,
  },
  sectionTabs: {
    flexDirection: 'row',
    gap: 10,
  },
  sectionTab: {
    backgroundColor: '#13213a',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#22304a',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTabActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  sectionTabText: {
    color: '#bfdbfe',
    fontWeight: '800',
    fontSize: 13,
  },
  sectionTabTextActive: {
    color: palette.buttonText,
  },
  toolbar: {
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 12,
  },
  searchInput: {
    backgroundColor: palette.input,
    color: palette.primaryText,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    backgroundColor: '#13213a',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#22304a',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  filterChipText: {
    color: '#bfdbfe',
    fontWeight: '700',
    fontSize: 12,
  },
  filterChipTextActive: {
    color: palette.buttonText,
  },
  feedback: {
    color: '#fde68a',
    fontSize: 13,
    lineHeight: 18,
  },
  listCard: {
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 14,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listTitle: {
    color: palette.primaryText,
    fontSize: 22,
    fontWeight: '800',
  },
  refreshButton: {
    backgroundColor: palette.input,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshText: {
    color: palette.secondaryText,
    fontWeight: '700',
    fontSize: 12,
  },
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 34,
    gap: 10,
  },
  stateTitle: {
    color: palette.primaryText,
    fontSize: 18,
    fontWeight: '800',
  },
  stateText: {
    color: palette.secondaryText,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  userList: {
    gap: 12,
  },
  userCard: {
    backgroundColor: '#101a2d',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 14,
  },
  userMain: {
    flexDirection: 'row',
    gap: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#0891b2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: palette.primaryText,
    fontWeight: '800',
    fontSize: 20,
  },
  userCopy: {
    flex: 1,
    gap: 3,
  },
  userName: {
    color: palette.primaryText,
    fontSize: 17,
    fontWeight: '800',
  },
  userEmail: {
    color: palette.secondaryText,
    fontSize: 13,
  },
  userMeta: {
    color: palette.mutedText,
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: palette.input,
    borderWidth: 1,
    borderColor: palette.border,
  },
  actionApprove: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  actionBlock: {
    backgroundColor: '#f87171',
    borderColor: '#f87171',
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionText: {
    color: palette.secondaryText,
    fontWeight: '800',
    fontSize: 12,
  },
  actionTextDark: {
    color: '#111827',
  },
  noteCard: {
    backgroundColor: '#0b1220',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    gap: 8,
  },
  noteTitle: {
    color: palette.primaryText,
    fontSize: 18,
    fontWeight: '800',
  },
  noteText: {
    color: palette.secondaryText,
    fontSize: 14,
    lineHeight: 21,
  },
  messagingCard: {
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 14,
  },
  messagingHeader: {
    gap: 6,
  },
  messagingTitle: {
    color: palette.primaryText,
    fontSize: 24,
    fontWeight: '800',
  },
  messagingCopy: {
    color: palette.secondaryText,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 860,
  },
  messagingViewport: {
    minHeight: 820,
    borderRadius: 22,
    overflow: 'hidden',
  },
});