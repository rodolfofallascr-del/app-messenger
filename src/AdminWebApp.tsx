import * as DocumentPicker from 'expo-document-picker';
import { Session } from '@supabase/supabase-js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MessagingApp } from './MessagingApp';
import { createMediaLibraryItem, createMediaLibraryItemFromUpload, createQuickReply, deleteMediaLibraryItem, deleteQuickReply, fetchMediaLibrary, fetchQuickReplies } from './lib/adminLibraryService';
import { ADMIN_EMOJI_LIBRARY } from './constants/adminEmojiLibrary';
import { ADMIN_TAG_PRESETS, ADMIN_TAG_SYMBOL_PRESETS, getAdminTagPresentation } from './lib/adminTags';
import { deleteUserCompletely, fetchAdminUsers, updateAdminAlias, updateAdminTags, updateUserAccess } from './lib/adminService';
import { isAnnouncementActiveNow, normalizeRecurringTimeInput, toSqlTimeLiteral } from './lib/announcementScheduling';
import { getSupabaseClient } from './lib/supabase';
import { adminThemes, AdminThemeMode, palette } from './theme/palette';
import { AnnouncementRecord, AppUserStatus, MediaLibraryRecord, PendingAttachment, ProfileRecord, QuickReplyRecord } from './types/chat';
const tagColorOptions = ['#facc15', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f97316'];
const tagSymbolPresets = ['\u274C', '\u2705', '\uD83D\uDCB8', '\uD83D\uDCB0', '\uD83D\uDCCC', '\u26A0\uFE0F', '\uD83D\uDCCD', '\uD83D\uDFE2', '\uD83D\uDD34', '\uD83D\uDFE1'];

type AdminWebAppProps = {
  session: Session;
  profile: ProfileRecord;
};

type AdminSection = 'users' | 'conversations' | 'library' | 'announcements';
type ReplyTargetField = 'label' | 'tag' | 'emoji' | 'body';

const brandLogo = require('../assets/chat-santanita-logo.jpeg');
const ADMIN_THEME_STORAGE_KEY = 'chat-santanita-admin-theme';
const ADMIN_SECTION_STORAGE_KEY = 'chat-santanita-admin-section';
const ADMIN_SOUND_STORAGE_KEY = 'chat-santanita-admin-sound';
const ADMIN_UI_BUILD_ID =
  (process as any)?.env?.VERCEL_GIT_COMMIT_SHA?.slice?.(0, 7) ||
  (process as any)?.env?.VERCEL_GIT_COMMIT_REF ||
  (process as any)?.env?.NODE_ENV ||
  'local';

export function AdminWebApp({ session, profile }: AdminWebAppProps) {
  const [themeMode, setThemeMode] = useState<AdminThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const savedTheme = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
    return savedTheme === 'light' ? 'light' : 'dark';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.localStorage.getItem(ADMIN_SOUND_STORAGE_KEY) !== 'off';
  });
  const [users, setUsers] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | AppUserStatus>('all');
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({});
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [section, setSection] = useState<AdminSection>(() => {
    if (typeof window === 'undefined') {
      return 'users';
    }

    const savedSection = window.localStorage.getItem(ADMIN_SECTION_STORAGE_KEY);
    return savedSection === 'conversations' || savedSection === 'library' || savedSection === 'announcements' ? savedSection : 'users';
  });
  const [quickReplies, setQuickReplies] = useState<QuickReplyRecord[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<MediaLibraryRecord[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const ANNOUNCEMENTS_PAGE_SIZE = 50;
  const [announcementsOffset, setAnnouncementsOffset] = useState(0);
  const [announcementsHasMore, setAnnouncementsHasMore] = useState(true);
  const announcementsOffsetRef = useRef(0);
  const announcementsHasMoreRef = useRef(true);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementActive, setAnnouncementActive] = useState(true);
  const [announcementEndsAt, setAnnouncementEndsAt] = useState(''); // ISO date-time string (local)
  const [announcementRecurring, setAnnouncementRecurring] = useState(false);
  const [announcementDaysOfWeek, setAnnouncementDaysOfWeek] = useState<number[]>([2]); // default: Tuesday
  const [announcementStartTime, setAnnouncementStartTime] = useState('07:00');
  const [announcementEndTime, setAnnouncementEndTime] = useState('11:00');
  const [announcementTimezone, setAnnouncementTimezone] = useState('America/Costa_Rica');
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [resourceBusy, setResourceBusy] = useState(false);
  const [replyLabel, setReplyLabel] = useState('');
  const [replyTag, setReplyTag] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replyEmoji, setReplyEmoji] = useState('');
  const [activeReplyField, setActiveReplyField] = useState<ReplyTargetField>('body');
  const [showEmojiLibrary, setShowEmojiLibrary] = useState(false);
  const [replyColor, setReplyColor] = useState(tagColorOptions[0]);
  const [imageTitle, setImageTitle] = useState('');
  const [imageTag, setImageTag] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedLibraryImage, setSelectedLibraryImage] = useState<PendingAttachment | null>(null);
  const [queuedQuickReply, setQueuedQuickReply] = useState<QuickReplyRecord | null>(null);
  const [queuedMedia, setQueuedMedia] = useState<MediaLibraryRecord | null>(null);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [quickToolsOpen, setQuickToolsOpen] = useState(false);
  const [quickToolsSection, setQuickToolsSection] = useState<'replies' | 'media'>('replies');
  const screenScrollRef = useRef<ScrollView | null>(null);
  const dirtyAliasDraftsRef = useRef<Set<string>>(new Set());
  const dirtyTagDraftsRef = useRef<Set<string>>(new Set());
  const theme = adminThemes[themeMode];

  const weekdayChips = useMemo(
    () =>
      [
        { id: 1, label: 'Lun' },
        { id: 2, label: 'Mar' },
        { id: 3, label: 'Mie' },
        { id: 4, label: 'Jue' },
        { id: 5, label: 'Vie' },
        { id: 6, label: 'Sab' },
        { id: 0, label: 'Dom' },
      ] as const,
    []
  );

  const loadUsers = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setFeedback(null);
    }

    try {
      const nextUsers = await fetchAdminUsers();
      setUsers(nextUsers);

      setAliasDrafts((current) => {
        const next = { ...current };
        const keep = new Set(nextUsers.map((user) => user.id));
        for (const key of Object.keys(next)) {
          if (!keep.has(key)) {
            delete next[key];
          }
        }

        for (const user of nextUsers) {
          if (!dirtyAliasDraftsRef.current.has(user.id) || !(user.id in next)) {
            next[user.id] = user.admin_alias?.trim() || '';
          }
        }

        return next;
      });

      setTagDrafts((current) => {
        const next = { ...current };
        const keep = new Set(nextUsers.map((user) => user.id));
        for (const key of Object.keys(next)) {
          if (!keep.has(key)) {
            delete next[key];
          }
        }

        for (const user of nextUsers) {
          const serverValue = (user.admin_tags ?? []).filter(Boolean).join(', ');
          if (!dirtyTagDraftsRef.current.has(user.id) || !(user.id in next)) {
            next[user.id] = serverValue;
          }
        }

        return next;
      });
    } catch (error) {
      if (!options?.silent) {
        setFeedback(error instanceof Error ? error.message : 'No fue posible cargar los usuarios.');
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
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

  const mergeAnnouncements = useCallback((current: AnnouncementRecord[], incoming: AnnouncementRecord[]) => {
    const byId = new Map<string, AnnouncementRecord>();
    current.forEach((a) => byId.set(a.id, a));
    incoming.forEach((a) => byId.set(a.id, a));
    return Array.from(byId.values()).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, []);

  const loadAnnouncements = useCallback(async (options?: { reset?: boolean }) => {
    setAnnouncementsLoading(true);

    try {
      const supabase = getSupabaseClient();
      const reset = options?.reset ?? false;
      const offset = reset ? 0 : announcementsOffsetRef.current;
      const to = offset + ANNOUNCEMENTS_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('announcements')
        .select('id,title,body,active,starts_at,ends_at,is_recurring,days_of_week,start_time,end_time,timezone,created_by,created_at,updated_at')
        .order('updated_at', { ascending: false })
        .range(offset, to);

      if (error) {
        throw error;
      }

      const page = (data ?? []) as AnnouncementRecord[];

      setAnnouncements((current) => (reset ? page : mergeAnnouncements(current, page)));
      const nextOffset = reset ? page.length : offset + page.length;
      const hasMore = page.length === ANNOUNCEMENTS_PAGE_SIZE;
      announcementsOffsetRef.current = nextOffset;
      announcementsHasMoreRef.current = hasMore;
      setAnnouncementsOffset(nextOffset);
      setAnnouncementsHasMore(hasMore);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible cargar los anuncios.');
    } finally {
      setAnnouncementsLoading(false);
    }
  }, [ANNOUNCEMENTS_PAGE_SIZE, mergeAnnouncements]);

  useEffect(() => {
    if (section === 'users') {
      void loadUsers();
    }

    if (section === 'library' || section === 'conversations') {
      void loadLibrary();
    }

    if (section === 'announcements') {
      // Reset pagination when entering the section so older items don't "disappear".
      announcementsOffsetRef.current = 0;
      announcementsHasMoreRef.current = true;
      setAnnouncementsOffset(0);
      setAnnouncementsHasMore(true);
      void loadAnnouncements({ reset: true });
    }
  }, [loadAnnouncements, loadLibrary, loadUsers, section]);

  useEffect(() => {
    if (section !== 'users') {
      return;
    }

    // Realtime can miss events depending on publication/network. Poll silently to keep the list fresh.
    const intervalId = setInterval(() => {
      void loadUsers({ silent: true });
    }, 5000);

    return () => clearInterval(intervalId);
  }, [loadUsers, section]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, themeMode);
    }
  }, [themeMode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ADMIN_SECTION_STORAGE_KEY, section);
    }
  }, [section]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ADMIN_SOUND_STORAGE_KEY, soundEnabled ? 'on' : 'off');
    }
  }, [soundEnabled]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClockNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (section !== 'conversations') {
      setQuickToolsOpen(false);
    }
  }, [section]);

  const scrollToChatWorkspace = useCallback(() => {
    setTimeout(() => {
      screenScrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
  }, []);

  const handleQueueQuickReply = useCallback((reply: QuickReplyRecord) => {
    setQueuedMedia(null);
    setQueuedQuickReply(reply);
    setQuickToolsOpen(false);
    scrollToChatWorkspace();
  }, [scrollToChatWorkspace]);

  const handleQueueMedia = useCallback((item: MediaLibraryRecord) => {
    setQueuedQuickReply(null);
    setQueuedMedia(item);
    setQuickToolsOpen(false);
    scrollToChatWorkspace();
  }, [scrollToChatWorkspace]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel('admin-backoffice-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        if (section === 'users') {
          void loadUsers({ silent: true });
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        if (section === 'announcements') {
          void loadAnnouncements();
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAnnouncements, loadLibrary, loadUsers, section]);

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

      const haystack = (
        (user.admin_alias ?? '') +
        ' ' +
        (user.full_name ?? '') +
        ' ' +
        (user.email ?? '') +
        ' ' +
        (user.admin_tags ?? []).join(' ')
      ).toLowerCase();
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

  const handleDeleteBlockedUser = async (userId: string) => {
    setActionUserId(userId);
    setFeedback(null);

    try {
      const confirmed = typeof (globalThis as any).confirm === 'function'
        ? (globalThis as any).confirm(
            'Vas a eliminar este usuario PERMANENTEMENTE.\n\nEsto borrara:\n- Su acceso (Auth)\n- Su perfil y su historial de chat\n\nEsta accion no se puede deshacer.\n\nDeseas continuar?'
          )
        : true;

      if (!confirmed) {
        setFeedback('Accion cancelada.');
        return;
      }

      await deleteUserCompletely(userId);
      setUsers((current) => current.filter((user) => user.id !== userId));
      setFeedback('Usuario eliminado permanentemente.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible eliminar el usuario.');
    } finally {
      setActionUserId(null);
    }
  };

  const handleSaveAlias = async (userId: string) => {
    setActionUserId(userId);
    setFeedback(null);

    try {
      const nextAlias = aliasDrafts[userId]?.trim() || null;
      const updatedProfile = await updateAdminAlias(userId, nextAlias);
      setUsers((current) =>
        current.map((user) => (user.id === userId ? { ...user, admin_alias: updatedProfile.admin_alias ?? null } : user))
      );
      setAliasDrafts((current) => ({
        ...current,
        [userId]: updatedProfile.admin_alias?.trim() || '',
      }));
      dirtyAliasDraftsRef.current.delete(userId);
      setFeedback(nextAlias ? 'Alias administrativo guardado.' : 'Alias administrativo eliminado.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible guardar el alias administrativo.');
    } finally {
      setActionUserId(null);
    }
  };

  const handleSaveTags = async (userId: string) => {
    setActionUserId(userId);
    setFeedback(null);

    try {
      const nextTags = Array.from(
        new Set(
          (tagDrafts[userId] ?? '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        )
      );
      const updatedProfile = await updateAdminTags(userId, nextTags);
      setUsers((current) =>
        current.map((user) => (user.id === userId ? { ...user, admin_tags: updatedProfile.admin_tags ?? [] } : user))
      );
      setTagDrafts((current) => ({
        ...current,
        [userId]: (updatedProfile.admin_tags ?? []).join(', '),
      }));
      dirtyTagDraftsRef.current.delete(userId);
      setFeedback(nextTags.length ? 'Etiquetas administrativas guardadas.' : 'Etiquetas administrativas eliminadas.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible guardar las etiquetas administrativas.');
    } finally {
      setActionUserId(null);
    }
  };

  const handleAppendTagPreset = useCallback((userId: string, nextTag: string) => {
    dirtyTagDraftsRef.current.add(userId);
    setTagDrafts((current) => {
      const parsed = Array.from(
        new Set(
          (current[userId] ?? '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        )
      );

      if (!parsed.includes(nextTag)) {
        parsed.push(nextTag);
      }

      return {
        ...current,
        [userId]: parsed.join(', '),
      };
    });
  }, []);

  const handleAppendTagSymbol = useCallback((userId: string, nextSymbol: string) => {
    dirtyTagDraftsRef.current.add(userId);
    setTagDrafts((current) => {
      const draft = current[userId] ?? '';
      const nextDraft = draft.trim().length > 0 ? `${draft}${nextSymbol}` : `${nextSymbol} `;

      return {
        ...current,
        [userId]: nextDraft,
      };
    });
  }, []);

  const handleRemoveSingleTag = async (userId: string, tagToRemove: string) => {
    setActionUserId(userId);
    setFeedback(null);

    try {
      const currentUser = users.find((user) => user.id === userId);
      const nextTags = (currentUser?.admin_tags ?? []).filter((tag) => tag !== tagToRemove);
      const updatedProfile = await updateAdminTags(userId, nextTags);
      setUsers((current) =>
        current.map((user) => (user.id === userId ? { ...user, admin_tags: updatedProfile.admin_tags ?? [] } : user))
      );
      setTagDrafts((current) => ({
        ...current,
        [userId]: (updatedProfile.admin_tags ?? []).join(', '),
      }));
      dirtyTagDraftsRef.current.delete(userId);
      setFeedback('Etiqueta eliminada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible eliminar la etiqueta.');
    } finally {
      setActionUserId(null);
    }
  };

  const handleCreateReply = async () => {
    if (!replyBody.trim()) {
      setFeedback('Ingresa el mensaje precargado antes de guardarlo.');
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

  const handleAppendReplySymbol = (symbol: string) => {
    setReplyEmoji((current) => `${current}${symbol}`.trim());
  };


  const handleBackspaceReplyEmoji = () => {
    setReplyEmoji((current) => Array.from(current).slice(0, -1).join('')); 
  };

  const handleClearReplyEmoji = () => {
    setReplyEmoji('');
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

  const resetAnnouncementForm = () => {
    setEditingAnnouncementId(null);
    setAnnouncementTitle('');
    setAnnouncementBody('');
    setAnnouncementActive(true);
    setAnnouncementEndsAt('');
    setAnnouncementRecurring(false);
    setAnnouncementDaysOfWeek([2]);
    setAnnouncementStartTime('07:00');
    setAnnouncementEndTime('11:00');
    setAnnouncementTimezone('America/Costa_Rica');
  };

  const fromSqlTimeLiteral = (value: string | null | undefined) => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return '';
    return normalizeRecurringTimeInput(trimmed.slice(0, 5));
  };

  const handleEditAnnouncement = (item: AnnouncementRecord) => {
    setFeedback(null);
    setEditingAnnouncementId(item.id);
    setAnnouncementTitle(item.title?.trim() ?? '');
    setAnnouncementBody(item.body?.trim() ?? '');
    setAnnouncementActive(Boolean(item.active));
    setAnnouncementEndsAt(item.ends_at ? new Date(item.ends_at).toISOString().slice(0, 16) : '');
    setAnnouncementRecurring(Boolean(item.is_recurring));
    setAnnouncementDaysOfWeek(item.days_of_week?.length ? item.days_of_week : [2]);
    setAnnouncementStartTime(fromSqlTimeLiteral(item.start_time) || '07:00');
    setAnnouncementEndTime(fromSqlTimeLiteral(item.end_time) || '11:00');
    setAnnouncementTimezone((item.timezone ?? 'America/Costa_Rica').trim() || 'America/Costa_Rica');
  };

  const handlePublishAnnouncement = async () => {
    if (!announcementBody.trim()) {
      setFeedback('Escribe el mensaje del anuncio.');
      return;
    }

    if (announcementRecurring) {
      const startTime = normalizeRecurringTimeInput(announcementStartTime);
      const endTime = normalizeRecurringTimeInput(announcementEndTime);
      if (!startTime || !endTime) {
        setFeedback('Define hora inicio y hora fin para la programacion.');
        return;
      }

      if (!announcementDaysOfWeek.length) {
        setFeedback('Selecciona al menos un dia de la semana.');
        return;
      }
    }

    setResourceBusy(true);
    setFeedback(null);

    try {
      const supabase = getSupabaseClient();
      const endsAt = announcementEndsAt.trim();
      const normalizedEndsAt = endsAt ? (endsAt.includes('T') ? endsAt : endsAt.replace(' ', 'T')) : '';
      const parsedEndsAt = normalizedEndsAt ? new Date(normalizedEndsAt) : null;

      const payload = {
        title: announcementTitle.trim() || null,
        body: announcementBody.trim(),
        active: Boolean(announcementActive),
        ends_at: parsedEndsAt && !Number.isNaN(parsedEndsAt.getTime()) ? parsedEndsAt.toISOString() : null,
        is_recurring: Boolean(announcementRecurring),
        days_of_week: announcementRecurring ? announcementDaysOfWeek : null,
        start_time: announcementRecurring ? toSqlTimeLiteral(announcementStartTime) : null,
        end_time: announcementRecurring ? toSqlTimeLiteral(announcementEndTime) : null,
        timezone: announcementRecurring ? announcementTimezone.trim() || 'America/Costa_Rica' : null,
      };

      const { error } = editingAnnouncementId
        ? await supabase.from('announcements').update(payload).eq('id', editingAnnouncementId)
        : await supabase.from('announcements').insert({
            ...payload,
            starts_at: new Date().toISOString(),
            created_by: profile.id,
          });

      if (error) {
        throw error;
      }

      resetAnnouncementForm();
      setFeedback(editingAnnouncementId ? 'Anuncio actualizado.' : 'Anuncio publicado.');
      await loadAnnouncements();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : editingAnnouncementId ? 'No fue posible actualizar el anuncio.' : 'No fue posible publicar el anuncio.');
    } finally {
      setResourceBusy(false);
    }
  };

  const handleToggleAnnouncementActive = async (announcementId: string, nextActive: boolean) => {
    setResourceBusy(true);
    setFeedback(null);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('announcements')
        .update({ active: nextActive })
        .eq('id', announcementId);

      if (error) {
        throw error;
      }

      await loadAnnouncements();
      setFeedback(nextActive ? 'Anuncio activado.' : 'Anuncio desactivado.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible actualizar el anuncio.');
    } finally {
      setResourceBusy(false);
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    setResourceBusy(true);
    setFeedback(null);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('announcements').delete().eq('id', announcementId);

      if (error) {
        throw error;
      }

      await loadAnnouncements();
      setFeedback('Anuncio eliminado.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible eliminar el anuncio.');
    } finally {
      setResourceBusy(false);
    }
  };

  const handleRepublishAnnouncement = async (item: AnnouncementRecord) => {
    setResourceBusy(true);
    setFeedback(null);

    try {
      const supabase = getSupabaseClient();

      let nextEndsAt: string | null = item.ends_at ?? null;

      if (typeof window !== 'undefined') {
        const currentLocal = item.ends_at ? new Date(item.ends_at).toISOString().slice(0, 16) : '';
        const raw = window.prompt(
          'Nueva fecha/hora de caducidad (opcional). Formato: YYYY-MM-DDTHH:mm. Deja vacio para no caducar.',
          currentLocal
        );

        if (raw === null) {
          setResourceBusy(false);
          return;
        }

        const trimmed = raw.trim();
        if (!trimmed) {
          nextEndsAt = null;
        } else {
          const parsed = new Date(trimmed);
          nextEndsAt = Number.isNaN(parsed.getTime()) ? item.ends_at ?? null : parsed.toISOString();
        }
      }

      const { error } = await supabase
        .from('announcements')
        .update({
          active: true,
          starts_at: new Date().toISOString(),
          ends_at: nextEndsAt,
        })
        .eq('id', item.id);

      if (error) {
        throw error;
      }

      await loadAnnouncements();
      setFeedback('Anuncio republicado.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No fue posible republicar el anuncio.');
    } finally {
      setResourceBusy(false);
    }
  };

  const formattedClock = useMemo(
    () =>
      new Intl.DateTimeFormat('es-CR', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(clockNow),
    [clockNow]
  );

  const sectionLabel = useMemo(() => {
    if (section === 'users') return 'Usuarios';
    if (section === 'conversations') return 'Conversaciones';
    if (section === 'library') return 'Biblioteca';
    if (section === 'announcements') return 'Anuncios';
    return 'Panel';
  }, [section]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View pointerEvents="none" style={styles.ambient}>
        <View style={[styles.ambientBlob, styles.ambientBlobA]} />
        <View style={[styles.ambientBlob, styles.ambientBlobB]} />
        <View style={[styles.ambientBlob, styles.ambientBlobC]} />
      </View>
      <ScrollView ref={screenScrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
        <View
          style={[
            styles.controlBar,
            Platform.OS === 'web' && (styles.controlBarSticky as any),
            Platform.OS === 'web' && ({ backdropFilter: 'blur(14px)', boxShadow: '0 18px 50px rgba(0,0,0,0.35)' } as any),
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View style={styles.controlBrand}>
            <Image source={brandLogo} style={styles.controlLogo} resizeMode="contain" />
            <View style={styles.controlBrandCopy}>
              <Text style={styles.eyebrow}>Panel administrador</Text>
              <Text style={[styles.controlTitle, { color: theme.title }]}>Chat Santanita CRM</Text>
              <Text style={[styles.controlSubtitle, { color: theme.text }]}>Administra usuarios y conversaciones sin quitarle espacio al chat.</Text>
              <View style={styles.buildRow}>
                <View style={[styles.buildPill, { borderColor: theme.border, backgroundColor: theme.cardSoft }]}>
                  <Text style={[styles.buildPillText, { color: theme.muted }]}>UI {ADMIN_UI_BUILD_ID}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.controlCenter}>
            <SectionTab label={`Usuarios ${counts.pending > 0 ? `(${counts.pending})` : ''}`} active={section === 'users'} onPress={() => setSection('users')} themeMode={themeMode} />
            <SectionTab label="Conversaciones" active={section === 'conversations'} onPress={() => setSection('conversations')} themeMode={themeMode} />
            <SectionTab label={`Biblioteca ${quickReplies.length + mediaLibrary.length > 0 ? `(${quickReplies.length + mediaLibrary.length})` : ''}`} active={section === 'library'} onPress={() => setSection('library')} themeMode={themeMode} />
            <SectionTab label={`Anuncios ${announcements.filter((item) => item.active).length > 0 ? `(${announcements.filter((item) => item.active).length})` : ''}`} active={section === 'announcements'} onPress={() => setSection('announcements')} themeMode={themeMode} />
          </View>

          <View style={styles.headerActions}>
            <MetricPill label="Pend" value={String(counts.pending)} themeMode={themeMode} />
            <MetricPill label="Ok" value={String(counts.approved)} themeMode={themeMode} />
            <MetricPill label="Block" value={String(counts.blocked)} themeMode={themeMode} />
            <View style={[styles.clockPill, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
              <Text style={[styles.clockPillLabel, { color: theme.muted }]}>Hora</Text>
              <Text style={[styles.clockPillValue, { color: theme.title }]}>{formattedClock}</Text>
            </View>
            <Pressable
              style={[
                styles.themeToggle,
                {
                  backgroundColor: soundEnabled ? theme.accent : theme.input,
                  borderColor: soundEnabled ? theme.accent : theme.border,
                },
              ]}
              onPress={() => setSoundEnabled((current) => !current)}
            >
              <Text style={[styles.themeToggleText, { color: soundEnabled ? theme.buttonText : theme.title }]}>
                {soundEnabled ? 'Sonido ON' : 'Sonido OFF'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.themeToggle, { backgroundColor: theme.input, borderColor: theme.border }]}
              onPress={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}
            >
              <Text style={[styles.themeToggleText, { color: theme.title }]}>
                {themeMode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              </Text>
            </Pressable>
            <Pressable style={[styles.signOutButton, { backgroundColor: theme.accent }]} onPress={handleSignOut}>
              <Text style={[styles.signOutText, { color: theme.buttonText }]}>Salir</Text>
            </Pressable>
          </View>
        </View>

        {feedback ? <Text style={[styles.feedback, { color: theme.warning }]}>{feedback}</Text> : null}

        {section === 'users' ? (
          <>
            <View style={[styles.toolbar, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por alias, nombre o correo"
                placeholderTextColor={theme.muted}
                style={[styles.searchInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]}
              />
              <View style={styles.filterRow}>
                <FilterChip label="Todos" active={filter === 'all'} onPress={() => setFilter('all')} themeMode={themeMode} />
                <FilterChip label="Pendientes" active={filter === 'pending'} onPress={() => setFilter('pending')} themeMode={themeMode} />
                <FilterChip label="Aprobados" active={filter === 'approved'} onPress={() => setFilter('approved')} themeMode={themeMode} />
                <FilterChip label="Bloqueados" active={filter === 'blocked'} onPress={() => setFilter('blocked')} themeMode={themeMode} />
              </View>
            </View>

            <View style={[styles.listCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <View style={styles.listHeader}>
                <Text style={[styles.listTitle, { color: theme.title }]}>Usuarios registrados</Text>
                <Pressable style={[styles.refreshButton, { backgroundColor: theme.input }]} onPress={() => void loadUsers()}>
                  <Text style={[styles.refreshText, { color: theme.text }]}>Recargar</Text>
                </Pressable>
              </View>

              {loading ? (
                <View style={styles.stateBox}>
                  <ActivityIndicator color={palette.accent} />
                  <Text style={[styles.stateText, { color: theme.text }]}>Cargando usuarios...</Text>
                </View>
              ) : visibleUsers.length === 0 ? (
                <View style={styles.stateBox}>
                  <Text style={[styles.stateTitle, { color: theme.title }]}>No hay usuarios para mostrar</Text>
                  <Text style={[styles.stateText, { color: theme.text }]}>Cambia el filtro o espera nuevos registros.</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.userListScroll}
                  showsVerticalScrollIndicator
                  persistentScrollbar
                  contentContainerStyle={styles.userList}
                >
                  {visibleUsers.map((user) => {
                    const busy = actionUserId === user.id;
                    return (
                      <View key={user.id} style={[styles.userCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                        <View style={styles.userMain}>
                          <View style={styles.userAvatar}>
                            <Text style={styles.userAvatarText}>{(user.admin_alias || user.full_name || user.email || 'U').charAt(0).toUpperCase()}</Text>
                          </View>
                          <View style={styles.userCopy}>
                            <Text style={[styles.userName, { color: theme.title }]}>
                              {user.admin_alias?.trim() || user.full_name?.trim() || 'Sin nombre'}
                            </Text>
                            {user.admin_alias?.trim() ? (
                              <Text style={[styles.userAliasHint, { color: theme.muted }]}>
                                Nombre real: {user.full_name?.trim() || 'Sin nombre'}
                              </Text>
                            ) : null}
                            <Text style={[styles.userEmail, { color: theme.text }]}>{user.email ?? 'Sin correo'}</Text>
                            <Text style={[styles.userMeta, { color: theme.muted }]}>Rol: {user.role} | Estado: {user.status}</Text>
                            {user.admin_tags?.length ? (
                              <View style={styles.userTagsRow}>
                                {user.admin_tags.map((tag) => {
                                  const visual = getAdminTagPresentation(tag);
                                  return (
                                    <View key={`${user.id}-${tag}`} style={[styles.userTagChip, { backgroundColor: `${visual.color}20`, borderColor: visual.color }]}>
                                      <Text style={[styles.userTagSymbol, { color: visual.color }]}>{visual.symbol}</Text>
                                      <Text style={[styles.userTagText, { color: theme.title }]}>{tag}</Text>
                                      <Pressable onPress={() => void handleRemoveSingleTag(user.id, tag)} hitSlop={8}>
                                        <Text style={[styles.userTagRemove, { color: visual.color }]}>×</Text>
                                      </Pressable>
                                    </View>
                                  );
                                })}
                              </View>
                            ) : null}
                            <View style={styles.aliasEditorRow}>
                              <TextInput
                                value={aliasDrafts[user.id] ?? ''}
                                onChangeText={(value) => {
                                  dirtyAliasDraftsRef.current.add(user.id);
                                  setAliasDrafts((current) => ({
                                    ...current,
                                    [user.id]: value,
                                  }));
                                }}
                                placeholder="Alias solo para admin"
                                placeholderTextColor={theme.muted}
                                style={[styles.aliasInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]}
                              />
                              <Pressable
                                style={[styles.aliasSaveButton, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]}
                                onPress={() => void handleSaveAlias(user.id)}
                                disabled={busy}
                              >
                                <Text style={[styles.aliasSaveButtonText, { color: theme.title }]}>
                                  {busy ? 'Guardando...' : 'Guardar'}
                                </Text>
                              </Pressable>
                            </View>
                            <View style={styles.aliasEditorRow}>
                              <TextInput
                                value={tagDrafts[user.id] ?? ''}
                                onChangeText={(value) => {
                                  dirtyTagDraftsRef.current.add(user.id);
                                  setTagDrafts((current) => ({
                                    ...current,
                                    [user.id]: value,
                                  }));
                                }}
                                placeholder="Etiquetas admin: VIP, Pendiente, SINPE"
                                placeholderTextColor={theme.muted}
                                style={[styles.aliasInput, styles.tagsInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]}
                              />
                              <Pressable
                                style={[styles.aliasSaveButton, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]}
                                onPress={() => void handleSaveTags(user.id)}
                                disabled={busy}
                              >
                                <Text style={[styles.aliasSaveButtonText, { color: theme.title }]}>
                                  {busy ? 'Guardando...' : 'Guardar tags'}
                                </Text>
                              </Pressable>
                            </View>
                            <View style={styles.tagPresetRow}>
                              {ADMIN_TAG_PRESETS.map((preset) => (
                                <Pressable
                                  key={`${user.id}-${preset.value}`}
                                  style={[styles.tagPresetChip, { backgroundColor: `${preset.color}20`, borderColor: preset.color }]}
                                  onPress={() => handleAppendTagPreset(user.id, preset.value)}
                                >
                                  <Text style={[styles.tagPresetSymbol, { color: preset.color }]}>{preset.symbol}</Text>
                                  <Text style={[styles.tagPresetText, { color: theme.title }]}>{preset.value}</Text>
                                </Pressable>
                              ))}
                            </View>
                            <View style={styles.tagSymbolRow}>
                              {ADMIN_TAG_SYMBOL_PRESETS.map((preset) => (
                                <Pressable
                                  key={`${user.id}-${preset.value}-${preset.color}`}
                                  style={[styles.tagSymbolChip, { backgroundColor: `${preset.color}20`, borderColor: preset.color }]}
                                  onPress={() => handleAppendTagSymbol(user.id, preset.value)}
                                >
                                  <Text style={[styles.tagSymbolChipText, { color: preset.color }]}>{preset.value}</Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        </View>
                        <View style={styles.actionsRow}>
                          <ActionButton label="Aprobar" tone="approve" disabled={busy || user.status === 'approved'} onPress={() => void handleUpdateStatus(user.id, 'approved')} themeMode={themeMode} />
                          <ActionButton label="Pendiente" tone="neutral" disabled={busy || user.status === 'pending'} onPress={() => void handleUpdateStatus(user.id, 'pending')} themeMode={themeMode} />
                          <ActionButton label="Bloquear" tone="block" disabled={busy || user.status === 'blocked'} onPress={() => void handleUpdateStatus(user.id, 'blocked')} themeMode={themeMode} />
                          {user.status === 'blocked' ? (
                            <ActionButton label="Eliminar usuario" tone="danger" disabled={busy} onPress={() => void handleDeleteBlockedUser(user.id)} themeMode={themeMode} />
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </>
        ) : null}

        {section === 'conversations' ? (
          <View style={[styles.messagingCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            <View style={styles.messagingHeader}>
              <View style={styles.messagingHeaderMain}>
                <Text style={[styles.messagingTitle, { color: theme.title }]}>Bandeja del administrador</Text>
                <Text style={[styles.messagingCopy, { color: theme.text }]}>La lista de contactos queda a la izquierda y el chat toma la mayor parte del espacio. Las herramientas rapidas se abren solo cuando las necesitas.</Text>
              </View>
              <View style={styles.messagingActions}>
                <Pressable style={[styles.topActionButton, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]} onPress={() => setSection('users')}>
                  <Text style={[styles.topActionText, { color: theme.title }]}>Usuarios</Text>
                </Pressable>
                <Pressable style={[styles.topActionButton, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]} onPress={() => setSection('library')}>
                  <Text style={[styles.topActionText, { color: theme.title }]}>Biblioteca</Text>
                </Pressable>
                <Pressable
                  style={[styles.topActionButton, styles.topActionPrimary, { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  onPress={() => setQuickToolsOpen((current) => !current)}
                >
                  <Text style={[styles.topActionText, { color: theme.buttonText }]}>{quickToolsOpen ? 'Ocultar rapidos' : 'Abrir rapidos'}</Text>
                </Pressable>
              </View>
            </View>
            {quickToolsOpen ? (
              <View style={[styles.quickToolsCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                <View style={styles.quickToolsTabs}>
                  <Pressable
                    style={[
                      styles.quickToolsTab,
                      { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft },
                      quickToolsSection === 'replies' && { backgroundColor: theme.accent, borderColor: theme.accent },
                    ]}
                    onPress={() => setQuickToolsSection('replies')}
                  >
                    <Text style={[styles.quickToolsTabText, { color: quickToolsSection === 'replies' ? theme.buttonText : theme.title }]}>Mensajes</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.quickToolsTab,
                      { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft },
                      quickToolsSection === 'media' && { backgroundColor: theme.accent, borderColor: theme.accent },
                    ]}
                    onPress={() => setQuickToolsSection('media')}
                  >
                    <Text style={[styles.quickToolsTabText, { color: quickToolsSection === 'media' ? theme.buttonText : theme.title }]}>Imagenes</Text>
                  </Pressable>
                </View>
                <ScrollView style={styles.quickToolsScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.quickToolsContent}>
                  {quickToolsSection === 'replies'
                    ? quickReplies.map((reply) => (
                        <Pressable
                          key={reply.id}
                          style={[styles.quickReplyCompactCard, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]}
                          onPress={() => handleQueueQuickReply(reply)}
                        >
                          <View style={styles.savedReplyHeader}>
                            <View style={[styles.previewDot, { backgroundColor: reply.tag_color || tagColorOptions[0] }]} />
                            {reply.tag_emoji ? <Text style={styles.previewEmoji}>{reply.tag_emoji}</Text> : null}
                            <Text style={styles.libraryTag}>{reply.tag}</Text>
                          </View>
                          <Text style={[styles.libraryItemTitle, { color: theme.title }]} numberOfLines={1}>{reply.label}</Text>
                          <Text style={[styles.libraryBody, { color: theme.text }]} numberOfLines={2}>{reply.body}</Text>
                        </Pressable>
                      ))
                    : mediaLibrary.map((item) => (
                        <Pressable
                          key={item.id}
                          style={[styles.quickReplyCompactCard, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]}
                          onPress={() => handleQueueMedia(item)}
                        >
                          <View style={styles.quickMediaRow}>
                            <Image source={{ uri: item.image_url }} style={styles.quickMediaThumb} resizeMode="cover" />
                            <View style={styles.quickMediaCopy}>
                              <Text style={[styles.libraryItemTitle, { color: theme.title }]} numberOfLines={1}>{item.title}</Text>
                              <Text style={[styles.libraryBody, { color: theme.text }]} numberOfLines={2}>{item.tag || '#imagen'}</Text>
                            </View>
                          </View>
                        </Pressable>
                      ))}
                </ScrollView>
              </View>
            ) : null}
            <View style={[styles.messagingLayout, styles.messagingLayoutWide]}>
              <View style={styles.messagingViewport}>
                <MessagingApp
                  session={session}
                  adminMode
                  adminSoundEnabled={soundEnabled}
                  quickReplyToInsert={queuedQuickReply}
                  mediaToInsert={queuedMedia}
                  onResourceApplied={() => {
                    setQueuedQuickReply(null);
                    setQueuedMedia(null);
                  }}
                />
              </View>
            </View>
          </View>
        ) : null}

        {section === 'library' ? (
          <View style={styles.libraryLayout}>
            <View style={[styles.formCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <Text style={[styles.formTitle, { color: theme.title }]}>Nuevo mensaje rapido</Text>
              <TextInput value={replyLabel} onChangeText={setReplyLabel} onFocus={() => setActiveReplyField('label')} placeholder="Etiqueta visible opcional" placeholderTextColor={theme.muted} style={[styles.searchInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]} />
              <TextInput value={replyTag} onChangeText={setReplyTag} onFocus={() => setActiveReplyField('tag')} placeholder="Tag, ejemplo #sinpe" placeholderTextColor={theme.muted} style={[styles.searchInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]} />
              <View style={styles.visualRow}>
                <TextInput value={replyEmoji} onChangeText={setReplyEmoji} onFocus={() => setActiveReplyField('emoji')} placeholder="Insignia visual opcional" placeholderTextColor={theme.muted} style={[styles.searchInput, styles.emojiInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]} maxLength={24} />
                <View style={styles.colorPickerRow}>
                  {tagColorOptions.map((color) => (
                    <Pressable key={color} onPress={() => setReplyColor(color)} style={[styles.colorChip, { backgroundColor: color }, replyColor === color && styles.colorChipActive]} />
                  ))}
                </View>
              </View>
              <Pressable style={[styles.secondaryButton, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]} onPress={() => setShowEmojiLibrary((current) => !current)}> 
                <Text style={[styles.secondaryButtonText, { color: theme.title }]}>{showEmojiLibrary ? 'Ocultar biblioteca de emojis' : 'Abrir biblioteca de emojis'}</Text>
              </Pressable>
              {showEmojiLibrary ? (
                <View style={[styles.emojiLibraryCard, { backgroundColor: theme.cardAlt, borderColor: theme.borderSoft }]}>
                  <ScrollView style={styles.emojiLibraryScroll} contentContainerStyle={styles.emojiLibraryGrid} showsVerticalScrollIndicator={false}>
                    {ADMIN_EMOJI_LIBRARY.map((emoji) => (
                      <Pressable key={emoji} onPress={() => handleAppendReplySymbol(emoji)} style={[styles.emojiLibraryChip, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]}>
                        <Text style={styles.emojiLibraryText}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              <Text style={[styles.helperText, { color: theme.muted }]}>Los simbolos se pegan en el campo que tengas activo. Si no seleccionas otro, van al mensaje.</Text>
              <View style={styles.emojiActionsRow}>
                <Pressable style={[styles.emojiActionButton, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]} onPress={handleBackspaceReplyEmoji}>
                  <Text style={[styles.emojiActionText, { color: theme.title }]}>Borrar ultimo</Text>
                </Pressable>
                <Pressable style={[styles.emojiActionButton, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]} onPress={handleClearReplyEmoji}>
                  <Text style={[styles.emojiActionText, { color: theme.title }]}>Limpiar insignia</Text>
                </Pressable>
              </View>
              <View style={styles.symbolPresetRow}>
                {tagSymbolPresets.map((symbol) => (
                  <Pressable key={symbol} onPress={() => handleAppendReplySymbol(symbol)} style={[styles.symbolPresetChip, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]}>
                    <Text style={styles.symbolPresetText}>{symbol}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={[styles.previewBadge, { backgroundColor: theme.previewBg, borderColor: theme.borderSoft }]}>
                <View style={[styles.previewDot, { backgroundColor: replyColor }]} />
                {replyEmoji ? <Text style={styles.previewEmoji}>{replyEmoji}</Text> : null}
                <Text style={[styles.previewBadgeText, { color: theme.title }]}>{replyTag.trim() || '#general'}</Text>
              </View>
              <TextInput value={replyBody} onChangeText={setReplyBody} onFocus={() => setActiveReplyField('body')} placeholder="Mensaje precargado" placeholderTextColor={theme.muted} style={[styles.searchInput, styles.textArea, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]} multiline />
              <Pressable style={[styles.primaryButton, { backgroundColor: theme.accent }, resourceBusy && styles.actionDisabled]} onPress={() => void handleCreateReply()} disabled={resourceBusy}>
                <Text style={[styles.primaryButtonText, { color: theme.buttonText }]}>Guardar mensaje rapido</Text>
              </Pressable>
            </View>

            <View style={[styles.formCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <Text style={[styles.formTitle, { color: theme.title }]}>Nueva imagen precargada</Text>
              <TextInput value={imageTitle} onChangeText={setImageTitle} placeholder="Titulo" placeholderTextColor={theme.muted} style={[styles.searchInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]} />
              <TextInput value={imageTag} onChangeText={setImageTag} placeholder="Tag opcional, ejemplo #catalogo" placeholderTextColor={theme.muted} style={[styles.searchInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]} />
              <Pressable style={[styles.secondaryButton, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]} onPress={() => void handlePickLibraryImage()}>
                <Text style={[styles.secondaryButtonText, { color: theme.title }]}>{selectedLibraryImage ? 'Cambiar imagen desde la computadora' : 'Cargar imagen desde la computadora'}</Text>
              </Pressable>
              {selectedLibraryImage ? (
                <View style={[styles.filePreview, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }]}>
                  <Text style={[styles.filePreviewTitle, { color: theme.title }]}>{selectedLibraryImage.name}</Text>
                  <Text style={[styles.filePreviewCopy, { color: theme.text }]}>Lista para subir a la biblioteca.</Text>
                  <Pressable onPress={() => setSelectedLibraryImage(null)} style={styles.inlineLinkButton}>
                    <Text style={[styles.inlineLinkText, { color: theme.danger }]}>Quitar</Text>
                  </Pressable>
                </View>
              ) : null}
              <Text style={[styles.helperText, { color: theme.muted }]}>Opcionalmente puedes seguir usando una URL publica si ya la tienes.</Text>
              <TextInput value={imageUrl} onChangeText={setImageUrl} placeholder="URL publica de la imagen" placeholderTextColor={theme.muted} style={[styles.searchInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]} />
              <Pressable style={[styles.primaryButton, { backgroundColor: theme.accent }, resourceBusy && styles.actionDisabled]} onPress={() => void handleCreateImage()} disabled={resourceBusy}>
                <Text style={[styles.primaryButtonText, { color: theme.buttonText }]}>Guardar imagen</Text>
              </Pressable>
            </View>

            <View style={[styles.libraryListCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <View style={styles.listHeader}>
                <Text style={[styles.listTitle, { color: theme.title }]}>Biblioteca guardada</Text>
                {libraryLoading ? <ActivityIndicator color={palette.accent} /> : null}
              </View>
              <View style={styles.libraryColumns}>
                <View style={styles.libraryColumn}>
                  <Text style={[styles.sectionMiniTitle, { color: theme.title }]}>Mensajes rapidos</Text>
                  <ScrollView style={styles.libraryScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.libraryStack}>
                      {quickReplies.map((reply) => (
                        <Pressable
                          key={reply.id}
                          onPress={() => handleQueueQuickReply(reply)}
                          style={[
                            styles.libraryItemCard,
                            { backgroundColor: theme.cardAlt, borderColor: theme.border },
                            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                          ]}
                        >
                          <View style={styles.savedReplyHeader}>
                            <View style={[styles.previewDot, { backgroundColor: reply.tag_color || tagColorOptions[0] }]} />
                            {reply.tag_emoji ? <Text style={styles.previewEmoji}>{reply.tag_emoji}</Text> : null}
                            <Text style={styles.libraryTag}>{reply.tag}</Text>
                          </View>
                          <Text style={[styles.libraryItemTitle, { color: theme.title }]}>{reply.label}</Text>
                          <Text style={[styles.libraryBody, { color: theme.text }]}>{reply.body}</Text>
                          <Pressable
                            style={[styles.deleteButton, { backgroundColor: theme.cardSoft }]}
                            onPress={(event) => {
                              (event as any)?.stopPropagation?.();
                              void handleDeleteReply(reply.id);
                            }}
                          >
                            <Text style={[styles.deleteButtonText, { color: theme.danger }]}>Eliminar</Text>
                          </Pressable>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </View>
                <View style={styles.libraryColumn}>
                  <Text style={[styles.sectionMiniTitle, { color: theme.title }]}>Imagenes</Text>
                  <ScrollView style={styles.libraryScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.libraryStack}>
                      {mediaLibrary.map((item) => (
                        <Pressable
                          key={item.id}
                          onPress={() => handleQueueMedia(item)}
                          style={[
                            styles.libraryItemCard,
                            { backgroundColor: theme.cardAlt, borderColor: theme.border },
                            Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                          ]}
                        >
                          <Image source={{ uri: item.image_url }} style={[styles.savedImage, { backgroundColor: theme.card }]} resizeMode="cover" />
                          <Text style={[styles.libraryItemTitle, { color: theme.title }]}>{item.title}</Text>
                          <Text style={styles.libraryTag}>{item.tag || '#imagen'}</Text>
                          <Pressable
                            style={[styles.deleteButton, { backgroundColor: theme.cardSoft }]}
                            onPress={(event) => {
                              (event as any)?.stopPropagation?.();
                              void handleDeleteImage(item.id);
                            }}
                          >
                            <Text style={[styles.deleteButtonText, { color: theme.danger }]}>Eliminar</Text>
                          </Pressable>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {section === 'announcements' ? ( 
          <View style={styles.libraryLayout}> 
            <View style={[styles.formCard, { backgroundColor: theme.panel, borderColor: theme.border }]}> 
              <Text style={[styles.formTitle, { color: theme.title }]}> 
                {editingAnnouncementId ? 'Editar anuncio' : 'Nuevo anuncio'} 
              </Text> 
              <TextInput 
                value={announcementTitle} 
                onChangeText={setAnnouncementTitle} 
                placeholder="Titulo (opcional)" 
                placeholderTextColor={theme.muted} 
                style={[styles.searchInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]}
              />
              <TextInput
                value={announcementBody}
                onChangeText={setAnnouncementBody}
                placeholder="Mensaje del anuncio"
                placeholderTextColor={theme.muted}
                multiline
                style={[styles.longTextInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]}
              />
              <View style={styles.actionsRow}>
                <ActionButton
                  label={announcementRecurring ? 'Programado' : 'Unico'}
                  tone={announcementRecurring ? 'approve' : 'neutral'}
                  disabled={resourceBusy}
                  onPress={() => setAnnouncementRecurring((current) => !current)}
                  themeMode={themeMode}
                />
              </View>
              {announcementRecurring ? (
                <View style={[styles.scheduleCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                  <Text style={[styles.scheduleTitle, { color: theme.title }]}>Programacion automatica</Text>
                  <Text style={[styles.helperText, { color: theme.muted }]}>
                    El anuncio aparecera solo en los dias y horas seleccionadas (zona horaria configurable).
                  </Text>
                  <View style={styles.scheduleRow}>
                    {weekdayChips.map((chip) => {
                      const selected = announcementDaysOfWeek.includes(chip.id);
                      return (
                        <Pressable
                          key={chip.id}
                          onPress={() =>
                            setAnnouncementDaysOfWeek((current) =>
                              current.includes(chip.id) ? current.filter((value) => value !== chip.id) : [...current, chip.id]
                            )
                          }
                          style={[
                            styles.scheduleChip,
                            { borderColor: selected ? palette.accent : theme.border, backgroundColor: selected ? `${palette.accent}22` : theme.input },
                          ]}
                        >
                          <Text style={[styles.scheduleChipText, { color: selected ? palette.accent : theme.muted }]}>{chip.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.scheduleTimes}>
                    <View style={styles.scheduleTimeBlock}>
                      <Text style={[styles.scheduleLabel, { color: theme.muted }]}>Inicio</Text>
                      {Platform.OS === 'web' ? (
                        <View style={[styles.scheduleInput, { backgroundColor: theme.input, borderColor: theme.border }]}>
                          {React.createElement('input', {
                            type: 'time',
                            value: announcementStartTime,
                            onChange: (event: any) => setAnnouncementStartTime(normalizeRecurringTimeInput(String(event?.target?.value ?? ''))),
                            style: {
                              width: '100%',
                              background: 'transparent',
                              border: 'none',
                              outline: 'none',
                              color: theme.title,
                              fontSize: 14,
                              fontWeight: 800,
                            },
                          })}
                        </View>
                      ) : (
                        <TextInput
                          value={announcementStartTime}
                          onChangeText={(value) => setAnnouncementStartTime(normalizeRecurringTimeInput(value))}
                          placeholder="07:00"
                          placeholderTextColor={theme.muted}
                          style={[styles.scheduleInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]}
                        />
                      )}
                    </View>
                    <View style={styles.scheduleTimeBlock}>
                      <Text style={[styles.scheduleLabel, { color: theme.muted }]}>Fin</Text>
                      {Platform.OS === 'web' ? (
                        <View style={[styles.scheduleInput, { backgroundColor: theme.input, borderColor: theme.border }]}>
                          {React.createElement('input', {
                            type: 'time',
                            value: announcementEndTime,
                            onChange: (event: any) => setAnnouncementEndTime(normalizeRecurringTimeInput(String(event?.target?.value ?? ''))),
                            style: {
                              width: '100%',
                              background: 'transparent',
                              border: 'none',
                              outline: 'none',
                              color: theme.title,
                              fontSize: 14,
                              fontWeight: 800,
                            },
                          })}
                        </View>
                      ) : (
                        <TextInput
                          value={announcementEndTime}
                          onChangeText={(value) => setAnnouncementEndTime(normalizeRecurringTimeInput(value))}
                          placeholder="11:00"
                          placeholderTextColor={theme.muted}
                          style={[styles.scheduleInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]}
                        />
                      )}
                    </View>
                    <View style={styles.scheduleTimeBlock}>
                      <Text style={[styles.scheduleLabel, { color: theme.muted }]}>Zona</Text>
                      <TextInput
                        value={announcementTimezone}
                        onChangeText={setAnnouncementTimezone}
                        placeholder="America/Costa_Rica"
                        placeholderTextColor={theme.muted}
                        style={[styles.scheduleInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]}
                      />
                    </View>
                  </View>
                  <Text style={[styles.helperText, { color: theme.muted }]}>
                    Horas en formato 24h (ej: 07:00, 14:30). Se mostrara automaticamente dentro de esa ventana sin refrescar.
                  </Text>
                </View>
              ) : null}
              {Platform.OS === 'web' ? (
                <View style={[styles.searchInput, { backgroundColor: theme.input, borderColor: theme.border }]}>
                  {React.createElement('input', {
                    type: 'datetime-local',
                    value: announcementEndsAt,
                    onChange: (event: any) => setAnnouncementEndsAt(String(event?.target?.value ?? '')),
                    style: {
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: theme.title,
                      fontSize: 15,
                      fontWeight: 700,
                    },
                  })}
                </View>
              ) : (
                <TextInput
                  value={announcementEndsAt}
                  onChangeText={setAnnouncementEndsAt}
                  placeholder="Fin (opcional)"
                  placeholderTextColor={theme.muted}
                  style={[styles.searchInput, { backgroundColor: theme.input, borderColor: theme.border, color: theme.title }]}
                />
              )} 
              <View style={styles.actionsRow}> 
                <ActionButton 
                  label={announcementActive ? 'Activo' : 'Inactivo'} 
                  tone="neutral" 
                  disabled={resourceBusy} 
                  onPress={() => setAnnouncementActive((current) => !current)} 
                  themeMode={themeMode} 
                /> 
                {editingAnnouncementId ? ( 
                  <> 
                    <ActionButton 
                      label="Cancelar" 
                      tone="neutral" 
                      disabled={resourceBusy} 
                      onPress={resetAnnouncementForm} 
                      themeMode={themeMode} 
                    /> 
                    <ActionButton 
                      label="Guardar cambios" 
                      tone="approve" 
                      disabled={resourceBusy} 
                      onPress={() => void handlePublishAnnouncement()} 
                      themeMode={themeMode} 
                    /> 
                  </> 
                ) : ( 
                  <ActionButton 
                    label="Publicar" 
                    tone="approve" 
                    disabled={resourceBusy} 
                    onPress={() => void handlePublishAnnouncement()} 
                    themeMode={themeMode} 
                  /> 
                )} 
              </View> 
              <Text style={[styles.helperText, { color: theme.muted }]}> 
                Los clientes ven el anuncio en la parte superior de la app movil. Los anuncios programados se activan solos segun el horario. 
              </Text> 
            </View> 

            <View style={[styles.libraryListCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
              <View style={styles.listHeader}>
                <Text style={[styles.listTitle, { color: theme.title }]}>Anuncios publicados</Text>
                {announcementsLoading ? <ActivityIndicator color={palette.accent} /> : null}
              </View>
              <ScrollView style={styles.libraryScroll} showsVerticalScrollIndicator persistentScrollbar>
                <View style={styles.libraryStack}>
                  {announcements.map((item, index) => (
                    <View key={item.id} style={[styles.libraryItemCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
                      <View style={styles.announcementRow}>
                        <Text style={styles.announcementIcon}>📣</Text>
                        <View style={styles.announcementCopy}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: theme.border,
                                backgroundColor: theme.input,
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '900', color: theme.muted }}>{`#${index + 1}`}</Text>
                            </View>
                            <Text style={[styles.libraryItemTitle, { color: theme.title, flex: 1 }]} numberOfLines={1}>
                              {item.title?.trim() || 'Anuncio'}
                            </Text>
                          </View>
                          <Text style={[styles.libraryBody, { color: theme.text }]} numberOfLines={3}>
                            {item.body}
                          </Text>
                        </View>
                        <View style={styles.announcementBadges}>
                          <View
                            style={[
                              styles.announcementBadge,
                              {
                                backgroundColor: item.active ? `${palette.accent}25` : `${palette.input}90`,
                                borderColor: item.active ? palette.accent : palette.border,
                              },
                            ]}
                          >
                            <Text style={[styles.announcementBadgeText, { color: item.active ? palette.accent : theme.muted }]}>
                              {item.active ? 'ACTIVO' : 'PAUSADO'}
                            </Text>
                          </View>
                          {item.is_recurring ? (
                            <View
                              style={[
                                styles.announcementBadge,
                                {
                                  backgroundColor: `${palette.accentSoft}18`,
                                  borderColor: `${palette.accentSoft}55`,
                                },
                              ]}
                            >
                              <Text style={[styles.announcementBadgeText, { color: palette.accentSoft }]}>PROGRAMADO</Text>
                            </View>
                          ) : null}
                          {item.is_recurring && item.active ? (
                            <View
                              style={[
                                styles.announcementBadge,
                                {
                                  backgroundColor: isAnnouncementActiveNow(item, clockNow) ? `${palette.accent}20` : `${palette.input}90`,
                                  borderColor: isAnnouncementActiveNow(item, clockNow) ? palette.accent : palette.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.announcementBadgeText,
                                  { color: isAnnouncementActiveNow(item, clockNow) ? palette.accent : theme.muted },
                                ]}
                              >
                                {isAnnouncementActiveNow(item, clockNow) ? 'EN LINEA' : 'FUERA'}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View> 
                      <Text style={[styles.userMeta, { color: theme.muted }]}> 
                        {item.active ? 'Activo' : 'Inactivo'} | {new Date(item.updated_at).toLocaleString('es-CR')} 
                        {item.is_recurring ? ` | ${formatRecurringLabel(item)}` : ''} 
                      </Text> 
                        <View style={styles.actionsRow}> 
                          <ActionButton 
                            label="Editar" 
                            tone="neutral" 
                            disabled={resourceBusy} 
                            onPress={() => handleEditAnnouncement(item)} 
                            themeMode={themeMode} 
                          /> 
                          <ActionButton 
                            label={item.active ? 'Desactivar' : 'Activar'} 
                            tone={item.active ? 'neutral' : 'approve'} 
                            disabled={resourceBusy} 
                            onPress={() => void handleToggleAnnouncementActive(item.id, !item.active)}
                            themeMode={themeMode}
                          />
                          <ActionButton
                            label="Republicar"
                            tone="approve"
                            disabled={resourceBusy}
                            onPress={() => void handleRepublishAnnouncement(item)}
                            themeMode={themeMode}
                          />
                          <ActionButton
                            label="Eliminar"
                            tone="block"
                            disabled={resourceBusy}
                            onPress={() => {
                            if (typeof window !== 'undefined') {
                              const ok = window.confirm('¿Eliminar este anuncio?');
                              if (!ok) return;
                            }
                            void handleDeleteAnnouncement(item.id);
                          }}
                          themeMode={themeMode}
                        />
                      </View>
                    </View>
                  ))}
                  {announcementsHasMore ? (
                    <View style={{ paddingTop: 10 }}>
                      <ActionButton
                        label={announcementsLoading ? 'Cargando…' : 'Cargar más'}
                        tone="neutral"
                        disabled={resourceBusy || announcementsLoading}
                        onPress={() => void loadAnnouncements()}
                        themeMode={themeMode}
                      />
                      <Text style={[styles.helperText, { color: theme.muted, textAlign: 'center', paddingTop: 8 }]}>
                        Mostrando {announcements.length} anuncios.
                      </Text>
                    </View>
                  ) : announcements.length > 0 ? (
                    <Text style={[styles.helperText, { color: theme.muted, textAlign: 'center', paddingTop: 10 }]}>
                      No hay más anuncios para cargar.
                    </Text>
                  ) : null}
                </View>
              </ScrollView>
            </View>
          </View>
        ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function MetricCard({ label, value, themeMode }: { label: string; value: string; themeMode: AdminThemeMode }) {
  const theme = adminThemes[themeMode];
  return (
    <View style={[styles.metricCard, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <Text style={[styles.metricValue, { color: theme.title }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.text }]}>{label}</Text>
    </View>
  );
}

function formatRecurringLabel(item: AnnouncementRecord) {
  const formatTime = (value: string) => {
    const raw = (value || '').slice(0, 5);
    const parts = raw.split(':');
    if (parts.length < 2) return raw || '??';
    const hour24 = Number(parts[0]);
    const minute = parts[1].padStart(2, '0');
    if (!Number.isFinite(hour24)) return raw || '??';
    const suffix = hour24 >= 12 ? 'p. m.' : 'a. m.';
    const hour12 = ((hour24 + 11) % 12) + 1;
    return `${hour12}:${minute} ${suffix}`;
  };

  const days = Array.isArray(item.days_of_week) ? item.days_of_week : [];
  const labelByDay: Record<number, string> = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mie', 4: 'Jue', 5: 'Vie', 6: 'Sab' };
  const dayLabel = days
    .filter((value) => typeof value === 'number')
    .map((value) => labelByDay[value] ?? String(value))
    .join(', ');
  const start = formatTime(String(item.start_time ?? ''));
  const end = formatTime(String(item.end_time ?? ''));
  const zone = item.timezone ?? 'America/Costa_Rica';
  return `${dayLabel || 'Dias'} ${start}-${end} (${zone})`;
}

function MetricPill({ label, value, themeMode }: { label: string; value: string; themeMode: AdminThemeMode }) {
  const theme = adminThemes[themeMode];
  return (
    <View style={[styles.metricPill, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <Text style={[styles.metricPillLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.metricPillValue, { color: theme.title }]}>{value}</Text>
    </View>
  );
}

function SectionTab({ label, active, onPress, themeMode }: { label: string; active: boolean; onPress: () => void; themeMode: AdminThemeMode }) {
  const theme = adminThemes[themeMode];
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.sectionTab,
        { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft },
        active && [styles.sectionTabActive, { backgroundColor: theme.accent, borderColor: theme.accent }],
      ]}
    >
      <Text style={[styles.sectionTabText, { color: theme.chipText }, active && [styles.sectionTabTextActive, { color: theme.buttonText }]]}>{label}</Text>
    </Pressable>
  );
}

function FilterChip({ label, active, onPress, themeMode }: { label: string; active: boolean; onPress: () => void; themeMode: AdminThemeMode }) {
  const theme = adminThemes[themeMode];
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, { backgroundColor: theme.cardSoft, borderColor: theme.borderSoft }, active && [styles.filterChipActive, { backgroundColor: theme.accent, borderColor: theme.accent }]]}>
      <Text style={[styles.filterChipText, { color: theme.chipText }, active && [styles.filterChipTextActive, { color: theme.buttonText }]]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({ label, tone, disabled, onPress, themeMode }: { label: string; tone: 'approve' | 'block' | 'danger' | 'neutral'; disabled?: boolean; onPress: () => void; themeMode: AdminThemeMode }) {
  const theme = adminThemes[themeMode];
  const isDestructive = tone === 'block' || tone === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionButton,
        { backgroundColor: theme.input, borderColor: theme.border },
        tone === 'approve' && [styles.actionApprove, { backgroundColor: theme.accent, borderColor: theme.accent }],
        isDestructive && styles.actionBlock,
        disabled && styles.actionDisabled,
      ]}
    >
      <Text
        style={[
          styles.actionText,
          { color: theme.text },
          tone !== 'neutral' && [styles.actionTextDark, { color: tone === 'approve' ? theme.buttonText : '#111827' }],
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
    minHeight: '100vh' as any,
  },
  content: {
    // Full-bleed CRM: use all available width (no centered maxWidth).
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
    width: '100%',
  },
  shell: {
    width: '100%',
    alignSelf: 'stretch',
    gap: 18,
  },
  ambient: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
  },
  ambientBlob: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 999,
    opacity: 0.16,
  },
  ambientBlobA: {
    backgroundColor: '#00e5a0',
    top: -120,
    right: -110,
  },
  ambientBlobB: {
    backgroundColor: '#00b8ff',
    bottom: -160,
    left: -130,
  },
  ambientBlobC: {
    backgroundColor: '#ff9500',
    top: '42%',
    left: '36%',
    width: 260,
    height: 260,
    opacity: 0.08,
  },
  controlBar: {
    // SaaS top app bar (less "recuadro", more chrome).
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  controlBarSticky: {
    position: 'sticky' as any,
    top: 14,
    zIndex: 50,
  },
  controlBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    flex: 1.1,
  },
  controlLogo: {
    width: 92,
    height: 52,
  },
  controlBrandCopy: {
    minWidth: 0,
    gap: 2,
  },
  controlTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  controlSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  buildRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  buildPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  buildPillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  controlCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flex: 1.2,
    flexWrap: 'wrap',
  },
  heroCard: {
    // Reduce heavy card framing; feel more like a CRM workspace.
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flex: 1,
  },
  clockPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clockPillLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  clockPillValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  metricPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricPillLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricPillValue: {
    fontSize: 14,
    fontWeight: '800',
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
  clockCard: {
    minWidth: 170,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  clockLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  clockValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  // Removed floating clock dock: it was overlapping/tapping UI controls on smaller screens.
  themeToggle: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  themeToggleText: {
    fontWeight: '800',
    fontSize: 12,
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
  longTextInput: {
    backgroundColor: palette.input,
    color: palette.primaryText,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    minHeight: 140,
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
  symbolPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  symbolPresetChip: {
    minWidth: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#13213a',
    borderWidth: 1,
    borderColor: '#22304a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolPresetText: {
    fontSize: 15,
  },
  emojiLibraryCard: {
    backgroundColor: '#101a2d',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#22304a',
    maxHeight: 220,
    overflow: 'hidden',
  },
  emojiLibraryScroll: {
    maxHeight: 220,
  },
  emojiLibraryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
  },
  emojiLibraryChip: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#13213a',
    borderWidth: 1,
    borderColor: '#22304a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiLibraryText: {
    fontSize: 20,
  },
  emojiActionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  emojiActionButton: {
    backgroundColor: '#13213a',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#22304a',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emojiActionText: {
    color: palette.primaryText,
    fontWeight: '700',
    fontSize: 12,
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
    maxHeight: 'calc(100vh - 220px)' as any,
    overflow: 'hidden',
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
    gap: 10,
    paddingBottom: 6,
  },
  userListScroll: {
    minHeight: 0,
    flexShrink: 1,
  },
  userCard: {
    // Table-like row (less "recuadro").
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 10,
  },
  userMain: {
    flexDirection: 'row',
    gap: 10,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
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
    gap: 2,
  },
  userName: {
    color: palette.primaryText,
    fontSize: 15,
    fontWeight: '800',
  },
  userAliasHint: {
    color: palette.mutedText,
    fontSize: 11,
    lineHeight: 14,
  },
  userEmail: {
    color: palette.secondaryText,
    fontSize: 12,
  },
  userMeta: {
    color: palette.mutedText,
    fontSize: 11,
  },
  userTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  userTagChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userTagSymbol: {
    fontSize: 10,
  },
  userTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  userTagRemove: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 13,
  },
  tagPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  tagPresetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagPresetSymbol: {
    fontSize: 10,
  },
  tagPresetText: {
    fontSize: 10,
    fontWeight: '800',
  },
  tagSymbolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  tagSymbolChip: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagSymbolChipText: {
    fontSize: 14,
    fontWeight: '800',
  },
  aliasEditorRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  aliasInput: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
  },
  tagsInput: {
    maxWidth: 420,
  },
  aliasSaveButton: {
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  aliasSaveButtonText: {
    fontSize: 11,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    fontSize: 11,
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
    gap: 14,
  },
  messagingHeaderMain: {
    gap: 6,
  },
  messagingActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  topActionButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topActionPrimary: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  topActionText: {
    fontSize: 12,
    fontWeight: '800',
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
  messagingLayoutWide: {
    gap: 0,
  },
  messagingViewport: {
    flex: 1,
    minHeight: 820,
    borderRadius: 22,
    overflow: 'hidden',
  },
  quickToolsCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    maxHeight: 280,
  },
  quickToolsTabs: {
    flexDirection: 'row',
    gap: 10,
  },
  quickToolsTab: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickToolsTabText: {
    fontSize: 12,
    fontWeight: '800',
  },
  quickToolsScroll: {
    minHeight: 0,
  },
  quickToolsContent: {
    gap: 10,
    paddingBottom: 4,
  },
  quickReplyCompactCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  quickMediaRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  quickMediaThumb: {
    width: 62,
    height: 62,
    borderRadius: 12,
    backgroundColor: '#0f172a',
  },
  quickMediaCopy: {
    flex: 1,
    gap: 4,
  },
  libraryLayout: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
    minHeight: 0,
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
    maxHeight: 'calc(100vh - 170px)' as any,
    overflow: 'hidden',
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
    maxHeight: '100%',
  },
  libraryStack: {
    gap: 12,
    paddingBottom: 6,
  },
  scheduleCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  scheduleTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  scheduleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scheduleChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scheduleChipText: {
    fontSize: 12,
    fontWeight: '900',
  },
  scheduleTimes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  scheduleTimeBlock: {
    flex: 1,
    minWidth: 140,
    gap: 6,
  },
  scheduleLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  scheduleInput: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '800',
  },
  announcementRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  announcementIcon: {
    fontSize: 18,
    marginTop: 2,
  },
  announcementCopy: {
    flex: 1,
    gap: 6,
  },
  announcementBadges: {
    gap: 6,
    alignItems: 'flex-end',
  },
  announcementBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  announcementBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
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




















