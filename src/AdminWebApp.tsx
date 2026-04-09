import * as DocumentPicker from 'expo-document-picker';
import { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MessagingApp } from './MessagingApp';
import { AdminResourcePanel } from './components/AdminResourcePanel';
import { createMediaLibraryItem, createMediaLibraryItemFromUpload, createQuickReply, deleteMediaLibraryItem, deleteQuickReply, fetchMediaLibrary, fetchQuickReplies } from './lib/adminLibraryService';
import { fetchAdminUsers, updateUserAccess } from './lib/adminService';
import { getSupabaseClient } from './lib/supabase';
import { palette } from './theme/palette';
import { AppUserStatus, MediaLibraryRecord, PendingAttachment, ProfileRecord, QuickReplyRecord } from './types/chat';
const tagColorOptions = ['#facc15', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f97316'];

type AdminWebAppProps = {
  session: Session;
  profile: ProfileRecord;
};

type AdminSection = 'users' | 'conversations' | 'library';

const brandLogo = require('../assets/chat-santanita-logo.jpeg');

export function AdminWebApp({ session, profile }: AdminWebAppProps) {
  const [users, setUsers] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | AppUserStatus>('all');
  const [section, setSection] = useState<AdminSection>('users');
  const [quickReplies, setQuickReplies] = useState<QuickReplyRecord[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<MediaLibraryRecord[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [resourceBusy, setResourceBusy] = useState(false);
  const [replyLabel, setReplyLabel] = useState('');
  const [replyTag, setReplyTag] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replyEmoji, setReplyEmoji] = useState('');
  const [replyColor, setReplyColor] = useState(tagColorOptions[0]);
  const [imageTitle, setImageTitle] = useState('');
  const [imageTag, setImageTag] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedLibraryImage, setSelectedLibraryImage] = useState<PendingAttachment | null>(null);
  const [queuedQuickReply, setQueuedQuickReply] = useState<QuickReplyRecord | null>(null);
  const [queuedMedia, setQueuedMedia] = useState<MediaLibraryRecord | null>(null);

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

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);

    try {
      const [nextReplies, nextMedia] = await Promise.all([fetchQuickReplies(), fetchMediaLibrary()]);
      setQuickReplies(nextReplies);
      setMediaLibrary(nextMedia);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible cargar la biblioteca.');
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section === 'users') {
      void loadUsers();
    }

    if (section === 'library' || section === 'conversations') {
      void loadLibrary();
    }
  }, [loadLibrary, loadUsers, section]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel('admin-backoffice-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        if (section === 'users') {
          void loadUsers();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_replies' }, () => {
        if (section === 'library' || section === 'conversations') {
          void loadLibrary();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media_library' }, () => {
        if (section === 'library' || section === 'conversations') {
          void loadLibrary();
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadLibrary, loadUsers, section]);

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

  const handleCreateReply = async () => {
    if (!replyLabel.trim() || !replyBody.trim()) {
      setFeedback('Ingresa etiqueta y mensaje para la respuesta rapida.');
      return;
    }

    setResourceBusy(true);
    setFeedback(null);

    try {
      await createQuickReply({
        label: replyLabel,
        tag: replyTag,
        body: replyBody,
        tagColor: replyColor,
        tagEmoji: replyEmoji,
        createdBy: profile.id,
      });
      setReplyLabel('');
      setReplyTag('');
      setReplyBody('');
      setReplyEmoji('');
      setReplyColor(tagColorOptions[0]);
      await loadLibrary();
      setFeedback('Respuesta rapida guardada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible guardar la respuesta.');
    } finally {
      setResourceBusy(false);
    }
  };

  const handlePickLibraryImage = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['image/*'],
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    setSelectedLibraryImage({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType || 'image/jpeg',
      type: 'image',
    });

    if (!imageTitle.trim()) {
      setImageTitle(asset.name.replace(/\.[^.]+$/, ''));
    }

    setFeedback(null);
  };
  const handleCreateImage = async () => {
    if (!imageTitle.trim()) {
      setFeedback('Ingresa titulo para la imagen.');
      return;
    }

    if (!imageUrl.trim() && !selectedLibraryImage) {
      setFeedback('Carga una imagen desde tu computadora o pega una URL publica.');
      return;
    }

    setResourceBusy(true);
    setFeedback(null);

    try {
      if (selectedLibraryImage) {
        await createMediaLibraryItemFromUpload({
          title: imageTitle,
          tag: imageTag,
          file: selectedLibraryImage,
          createdBy: profile.id,
        });
      } else {
        await createMediaLibraryItem({
          title: imageTitle,
          tag: imageTag,
          imageUrl,
          createdBy: profile.id,
        });
      }
      setImageTitle('');
      setImageTag('');
      setImageUrl('');
      setSelectedLibraryImage(null);
      await loadLibrary();
      setFeedback('Imagen precargada guardada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible guardar la imagen.');
    } finally {
      setResourceBusy(false);
    }
  };

  const handleDeleteReply = async (id: string) => {
    setResourceBusy(true);
    setFeedback(null);

    try {
      await deleteQuickReply(id);
      await loadLibrary();
      setFeedback('Respuesta rapida eliminada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible eliminar la respuesta.');
    } finally {
      setResourceBusy(false);
    }
  };

  const handleDeleteImage = async (id: string) => {
    setResourceBusy(true);
    setFeedback(null);

    try {
      await deleteMediaLibraryItem(id);
      await loadLibrary();
      setFeedback('Imagen precargada eliminada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible eliminar la imagen.');
    } finally {
      setResourceBusy(false);
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
              <Text style={styles.subtitle}>Aprueba usuarios, responde conversaciones y usa biblioteca con tags, mensajes e imagenes precargadas.</Text>
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
          <SectionTab label="Biblioteca" active={section === 'library'} onPress={() => setSection('library')} />
        </View>

        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

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
          </>
        ) : null}

        {section === 'conversations' ? (
          <View style={styles.messagingCard}>
            <View style={styles.messagingHeader}>
              <Text style={styles.messagingTitle}>Bandeja del administrador</Text>
              <Text style={styles.messagingCopy}>Abre una conversacion y usa la biblioteca lateral para insertar tags, mensajes precargados e imagenes guardadas directamente en el chat activo.</Text>
            </View>
            <View style={styles.messagingLayout}>
              <View style={styles.messagingViewport}>
                <MessagingApp
                  session={session}
                  adminMode
                  quickReplyToInsert={queuedQuickReply}
                  mediaToInsert={queuedMedia}
                  onResourceApplied={() => {
                    setQueuedQuickReply(null);
                    setQueuedMedia(null);
                  }}
                />
              </View>
              <AdminResourcePanel
                quickReplies={quickReplies}
                mediaLibrary={mediaLibrary}
                onUseQuickReply={(reply) => {
                  setQueuedMedia(null);
                  setQueuedQuickReply(reply);
                }}
                onUseMedia={(item) => {
                  setQueuedQuickReply(null);
                  setQueuedMedia(item);
                }}
              />
            </View>
          </View>
        ) : null}

        {section === 'library' ? (
          <View style={styles.libraryLayout}>
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Nuevo mensaje rapido</Text>
              <TextInput value={replyLabel} onChangeText={setReplyLabel} placeholder="Etiqueta visible" placeholderTextColor={palette.mutedText} style={styles.searchInput} />
              <TextInput value={replyTag} onChangeText={setReplyTag} placeholder="Tag, ejemplo #sinpe" placeholderTextColor={palette.mutedText} style={styles.searchInput} />
              <View style={styles.visualRow}>
                <TextInput value={replyEmoji} onChangeText={setReplyEmoji} placeholder="Emoji, ejemplo ?" placeholderTextColor={palette.mutedText} style={[styles.searchInput, styles.emojiInput]} maxLength={4} />
                <View style={styles.colorPickerRow}>
                  {tagColorOptions.map((color) => (
                    <Pressable key={color} onPress={() => setReplyColor(color)} style={[styles.colorChip, { backgroundColor: color }, replyColor === color && styles.colorChipActive]} />
                  ))}
                </View>
              </View>
              <View style={styles.previewBadge}>
                <View style={[styles.previewDot, { backgroundColor: replyColor }]} />
                {replyEmoji ? <Text style={styles.previewEmoji}>{replyEmoji}</Text> : null}
                <Text style={styles.previewBadgeText}>{replyTag.trim() || '#general'}</Text>
              </View>
              <TextInput value={replyBody} onChangeText={setReplyBody} placeholder="Mensaje precargado" placeholderTextColor={palette.mutedText} style={[styles.searchInput, styles.textArea]} multiline />
              <Pressable style={[styles.primaryButton, resourceBusy && styles.actionDisabled]} onPress={() => void handleCreateReply()} disabled={resourceBusy}>
                <Text style={styles.primaryButtonText}>Guardar mensaje rapido</Text>
              </Pressable>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Nueva imagen precargada</Text>
              <TextInput value={imageTitle} onChangeText={setImageTitle} placeholder="Titulo" placeholderTextColor={palette.mutedText} style={styles.searchInput} />
              <TextInput value={imageTag} onChangeText={setImageTag} placeholder="Tag opcional, ejemplo #catalogo" placeholderTextColor={palette.mutedText} style={styles.searchInput} />
              <Pressable style={styles.secondaryButton} onPress={() => void handlePickLibraryImage()}>
                <Text style={styles.secondaryButtonText}>{selectedLibraryImage ? 'Cambiar imagen desde la computadora' : 'Cargar imagen desde la computadora'}</Text>
              </Pressable>
              {selectedLibraryImage ? (
                <View style={styles.filePreview}>
                  <Text style={styles.filePreviewTitle}>{selectedLibraryImage.name}</Text>
                  <Text style={styles.filePreviewCopy}>Lista para subir a la biblioteca.</Text>
                  <Pressable onPress={() => setSelectedLibraryImage(null)} style={styles.inlineLinkButton}>
                    <Text style={styles.inlineLinkText}>Quitar</Text>
                  </Pressable>
                </View>
              ) : null}
              <Text style={styles.helperText}>Opcionalmente puedes seguir usando una URL publica si ya la tienes.</Text>
              <TextInput value={imageUrl} onChangeText={setImageUrl} placeholder="URL publica de la imagen" placeholderTextColor={palette.mutedText} style={styles.searchInput} />
              <Pressable style={[styles.primaryButton, resourceBusy && styles.actionDisabled]} onPress={() => void handleCreateImage()} disabled={resourceBusy}>
                <Text style={styles.primaryButtonText}>Guardar imagen</Text>
              </Pressable>
            </View>

            <View style={styles.libraryListCard}>
              <View style={styles.listHeader}>
                <Text style={styles.listTitle}>Biblioteca guardada</Text>
                {libraryLoading ? <ActivityIndicator color={palette.accent} /> : null}
              </View>
              <View style={styles.libraryColumns}>
                <View style={styles.libraryColumn}>
                  <Text style={styles.sectionMiniTitle}>Mensajes rapidos</Text>
                  <ScrollView style={styles.libraryScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.libraryStack}>
                      {quickReplies.map((reply) => (
                        <View key={reply.id} style={styles.libraryItemCard}>
                          <View style={styles.savedReplyHeader}>
                            <View style={[styles.previewDot, { backgroundColor: reply.tag_color || tagColorOptions[0] }]} />
                            {reply.tag_emoji ? <Text style={styles.previewEmoji}>{reply.tag_emoji}</Text> : null}
                            <Text style={styles.libraryTag}>{reply.tag}</Text>
                          </View>
                          <Text style={styles.libraryItemTitle}>{reply.label}</Text>
                          <Text style={styles.libraryBody}>{reply.body}</Text>
                          <Pressable style={styles.deleteButton} onPress={() => void handleDeleteReply(reply.id)}>
                            <Text style={styles.deleteButtonText}>Eliminar</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
                <View style={styles.libraryColumn}>
                  <Text style={styles.sectionMiniTitle}>Imagenes</Text>
                  <ScrollView style={styles.libraryScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.libraryStack}>
                      {mediaLibrary.map((item) => (
                        <View key={item.id} style={styles.libraryItemCard}>
                          <Image source={{ uri: item.image_url }} style={styles.savedImage} resizeMode="cover" />
                          <Text style={styles.libraryItemTitle}>{item.title}</Text>
                          <Text style={styles.libraryTag}>{item.tag || '#imagen'}</Text>
                          <Pressable style={styles.deleteButton} onPress={() => void handleDeleteImage(item.id)}>
                            <Text style={styles.deleteButtonText}>Eliminar</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>
        ) : null}
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
    maxWidth: 1380,
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
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  visualRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  emojiInput: {
    width: 110,
    marginBottom: 0,
  },
  colorPickerRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  colorChip: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorChipActive: {
    borderColor: '#f8fafc',
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#13213a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#22304a',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  previewEmoji: {
    fontSize: 14,
  },
  previewBadgeText: {
    color: palette.primaryText,
    fontWeight: '800',
    fontSize: 12,
  },
  secondaryButton: {
    backgroundColor: '#13213a',
    borderRadius: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#22304a',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: palette.primaryText,
    fontWeight: '800',
    textAlign: 'center',
  },
  filePreview: {
    backgroundColor: '#13213a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22304a',
    padding: 12,
    gap: 4,
  },
  filePreviewTitle: {
    color: palette.primaryText,
    fontSize: 13,
    fontWeight: '800',
  },
  filePreviewCopy: {
    color: palette.secondaryText,
    fontSize: 12,
  },
  inlineLinkButton: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  inlineLinkText: {
    color: '#fca5a5',
    fontWeight: '800',
    fontSize: 12,
  },
  helperText: {
    color: palette.mutedText,
    fontSize: 12,
    lineHeight: 18,
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
  messagingLayout: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'stretch',
    minHeight: 0,
  },
  messagingViewport: {
    flex: 1,
    minHeight: 820,
    borderRadius: 22,
    overflow: 'hidden',
  },
  libraryLayout: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  formCard: {
    width: 320,
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 12,
  },
  formTitle: {
    color: palette.primaryText,
    fontSize: 18,
    fontWeight: '800',
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: palette.buttonText,
    fontWeight: '800',
  },
  libraryListCard: {
    flex: 1,
    backgroundColor: palette.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 14,
    minHeight: 640,
  },
  libraryColumns: {
    flexDirection: 'row',
    gap: 16,
    minHeight: 0,
    flex: 1,
  },
  libraryColumn: {
    flex: 1,
    gap: 10,
    minHeight: 0,
  },
  sectionMiniTitle: {
    color: palette.primaryText,
    fontSize: 15,
    fontWeight: '800',
  },
  libraryScroll: {
    flex: 1,
    minHeight: 0,
  },
  libraryStack: {
    gap: 12,
    paddingBottom: 6,
  },
  libraryItemCard: {
    backgroundColor: '#101a2d',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    gap: 6,
  },
  savedReplyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  libraryItemTitle: {
    color: palette.primaryText,
    fontSize: 14,
    fontWeight: '800',
  },
  libraryTag: {
    color: '#facc15',
    fontSize: 11,
    fontWeight: '800',
  },
  libraryBody: {
    color: palette.secondaryText,
    fontSize: 12,
    lineHeight: 18,
  },
  savedImage: {
    width: '100%',
    height: 140,
    borderRadius: 14,
    backgroundColor: '#0f172a',
  },
  deleteButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f2937',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteButtonText: {
    color: '#fca5a5',
    fontWeight: '800',
    fontSize: 12,
  },
});










