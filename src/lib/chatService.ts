import { File } from 'expo-file-system';
import { getSupabaseClient, getSupabaseConfig } from './supabase';
import { ChatMemberRecord, ChatRecord, MessageRecord, PendingAttachment, ProfileRecord, SelectableUser } from '../types/chat';

type RawProfile = ProfileRecord | ProfileRecord[] | null;

type RawChatRow = ChatRecord & {
  members: Array<Omit<ChatMemberRecord, 'profile'> & { profile: RawProfile }>;
  messages: Array<Omit<MessageRecord, 'profile'> & { profile: RawProfile }>;
};

type ChatRow = ChatRecord & {
  members: Array<ChatMemberRecord & { profile: ProfileRecord | null }>;
  messages: Array<MessageRecord & { profile: ProfileRecord | null }>;
};

const ATTACHMENTS_BUCKET = 'chat-attachments';

export async function fetchChatRowsForCurrentUser() {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  if (!user) {
    throw new Error('No hay un usuario autenticado.');
  }

  const { data, error } = await supabase
    .from('chats')
    .select(
      `
        id,
        name,
        type,
        created_by,
        created_at,
        members:chat_members(
          chat_id,
          user_id,
          role,
          joined_at,
          profile:profiles(
            id,
            email,
            full_name,
            admin_alias,
            admin_tags,
            avatar_url,
            role,
            status,
            created_at
          )
        ),
        messages(
          id,
          chat_id,
          sender_id,
          body,
          message_type,
          attachment_url,
          attachment_name,
          created_at,
          profile:profiles(
            id,
            email,
            full_name,
            admin_alias,
            admin_tags,
            avatar_url,
            role,
            status,
            created_at
          )
        )
      `
    )
    .order('created_at', { ascending: false })
    .order('created_at', { referencedTable: 'messages', ascending: true });

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as RawChatRow[]).map((row) => ({
    ...row,
    members: row.members.map((member) => ({
      ...member,
      profile: normalizeProfile(member.profile),
    })),
    messages: row.messages.map((message) => ({
      ...message,
      profile: normalizeProfile(message.profile),
    })),
  })) satisfies ChatRow[];

  return {
    userId: user.id,
    rows,
  };
}

export async function fetchSelectableUsers(currentUserId: string, options?: { onlyAdmins?: boolean }) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('profiles')
    .select('id,email,full_name,admin_alias,admin_tags')
    .neq('id', currentUserId)
    .not('email', 'is', null);

  if (options?.onlyAdmins) {
    query = query.eq('role', 'admin').eq('status', 'approved');
  }

  const { data, error } = await query
    .order('full_name', { ascending: true })
    .order('email', { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Pick<ProfileRecord, 'id' | 'email' | 'full_name'>>).map((profile) => ({
    id: profile.id,
    email: profile.email ?? '',
    fullName: profile.full_name?.trim() || profile.email || 'Usuario',
  })) satisfies SelectableUser[];
}

export async function createChat(params: {
  currentUserId: string;
  name: string;
  participantIds: string[];
}) {
  const supabase = getSupabaseClient();
  const normalizedParticipantIds = Array.from(
    new Set(params.participantIds.map((id) => id.trim()).filter((id) => id.length > 0).filter((id) => id !== params.currentUserId))
  );

  if (normalizedParticipantIds.length === 0) {
    throw new Error('Selecciona al menos un usuario.');
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id,email,full_name,admin_alias,admin_tags,avatar_url,created_at')
    .in('id', normalizedParticipantIds);

  if (profilesError) {
    throw profilesError;
  }

  const foundProfiles = (profiles ?? []) as ProfileRecord[];
  const missingParticipants = normalizedParticipantIds.filter(
    (participantId) => !foundProfiles.some((profile) => profile.id === participantId)
  );

  if (missingParticipants.length > 0) {
    throw new Error('Algunos usuarios seleccionados ya no estan disponibles.');
  }

  const chatType = normalizedParticipantIds.length > 1 ? 'group' : 'direct';

  if (chatType === 'direct') {
    const existingChatId = await findExistingDirectChat(params.currentUserId, foundProfiles[0].id);
    if (existingChatId) {
      return existingChatId;
    }
  }

  const { data: createdChat, error: chatError } = await supabase
    .from('chats')
    .insert({
      name: chatType === 'group' ? params.name.trim() || 'Nuevo grupo' : null,
      type: chatType,
      created_by: params.currentUserId,
    })
    .select('id')
    .single();

  if (chatError) {
    throw chatError;
  }

  const memberRows = [
    {
      chat_id: createdChat.id,
      user_id: params.currentUserId,
      role: 'owner' as const,
    },
    ...foundProfiles.map((profile) => ({
      chat_id: createdChat.id,
      user_id: profile.id,
      role: 'member' as const,
    })),
  ];

  const { error: membersError } = await supabase.from('chat_members').insert(memberRows);

  if (membersError) {
    throw membersError;
  }

  return createdChat.id;
}

export async function sendTextMessage(params: { chatId: string; senderId: string; body: string }) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('messages').insert({
    chat_id: params.chatId,
    sender_id: params.senderId,
    body: params.body,
    message_type: 'text',
  });

  if (error) {
    throw error;
  }
}

export async function upsertPushToken(params: {
  userId: string;
  expoPushToken: string;
  platform: 'android' | 'ios';
  deviceId?: string | null;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: params.userId,
      expo_push_token: params.expoPushToken,
      platform: params.platform,
      device_id: params.deviceId ?? null,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,expo_push_token',
    }
  );

  if (error) {
    throw error;
  }
}

export async function notifyNewMessage(params: { chatId: string; senderId: string; preview?: string }) {
  const supabase = getSupabaseClient();
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token ?? '';
  // Fallback: in some web builds, env inlining can be finicky; the client still knows the key.
  const anonKeyFallback = (supabase as any)?.supabaseKey as string | undefined;
  const apiKey = (supabaseAnonKey || anonKeyFallback || '').trim();

  // supabase.functions.invoke() occasionally fails to forward Authorization in some web contexts.
  // Use a direct fetch to guarantee headers are included.
  // Some proxies/browsers can be finicky with non-standard headers; Supabase also accepts `apikey`
  // as a query param for routing/auth on the Edge Functions gateway.
  const functionsUrl = `${supabaseUrl}/functions/v1/notify-message?apikey=${encodeURIComponent(apiKey)}`;

  let error: unknown = null;

  try {
    const response = await fetch(functionsUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Supabase Edge Functions require `apikey` to route/auth the request before our code runs.
        apikey: apiKey,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        chatId: params.chatId,
        senderId: params.senderId,
        preview: params.preview ?? '',
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      error = new Error(`notify-message http ${response.status}: ${text}`);
      console.warn('[notify-message] failed', {
        status: response.status,
        hasApiKey: Boolean(apiKey),
        hasAccessToken: Boolean(accessToken),
        body: text,
      });
    }
  } catch (fetchError) {
    error = fetchError;
  }

  // Best effort: chat send should not fail if notifications fail.
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('notify-message failed', error);
  }
}

export async function deleteOwnMessage(messageId: string, currentUserId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .eq('sender_id', currentUserId);

  if (error) {
    throw error;
  }
}

export async function sendAttachmentMessage(params: {
  chatId: string;
  senderId: string;
  attachment: PendingAttachment;
  body?: string;
}) {
  const supabase = getSupabaseClient();
  const path = `${params.chatId}/${Date.now()}-${sanitizeFileName(params.attachment.name)}`;
  const fileBuffer = await readFileAsArrayBuffer(params.attachment.uri);

  const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, fileBuffer, {
    contentType: params.attachment.mimeType,
    upsert: false,
  });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);

  const { error } = await supabase.from('messages').insert({
    chat_id: params.chatId,
    sender_id: params.senderId,
    body: params.body?.trim() || null,
    message_type: params.attachment.type,
    attachment_url: publicUrlData.publicUrl,
    attachment_name: params.attachment.name,
  });

  if (error) {
    throw error;
  }
}

async function findExistingDirectChat(currentUserId: string, otherUserId: string) {
  const supabase = getSupabaseClient();
  const { data: memberships, error } = await supabase
    .from('chat_members')
    .select('chat_id,user_id,chats!inner(id,type)')
    .in('user_id', [currentUserId, otherUserId]);

  if (error) {
    throw error;
  }

  const rows = (memberships ?? []) as Array<{
    chat_id: string;
    user_id: string;
    chats: { id: string; type: string } | { id: string; type: string }[];
  }>;

  const grouped = new Map<string, Set<string>>();

  for (const row of rows) {
    const chat = Array.isArray(row.chats) ? row.chats[0] : row.chats;
    if (!chat || chat.type !== 'direct') {
      continue;
    }

    if (!grouped.has(row.chat_id)) {
      grouped.set(row.chat_id, new Set());
    }

    grouped.get(row.chat_id)?.add(row.user_id);
  }

  for (const [chatId, users] of grouped.entries()) {
    if (users.has(currentUserId) && users.has(otherUserId) && users.size === 2) {
      return chatId;
    }
  }

  return null;
}

async function readFileAsArrayBuffer(uri: string) {
  if (uri.startsWith('blob:') || uri.startsWith('http://') || uri.startsWith('https://')) {
    const response = await fetch(uri);

    if (!response.ok) {
      throw new Error('No fue posible leer el adjunto seleccionado.');
    }

    return await response.blob();
  }

  try {
    const file = new File(uri);
    const arrayBuffer = await file.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    throw new Error(error instanceof Error ? 'No fue posible preparar el archivo: ' + error.message : 'No fue posible preparar el archivo.');
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeProfile(profile: RawProfile) {
  if (Array.isArray(profile)) {
    return profile[0] ?? null;
  }

  return profile;
}

export async function fetchChatReadMarkers() {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  if (!user) {
    throw new Error('No hay un usuario autenticado.');
  }

  const { data, error } = await supabase
    .from('chat_read_markers')
    .select('chat_id,last_read_message_at')
    .eq('user_id', user.id);

  if (error) {
    if (isMissingReadMarkersTable(error)) {
      return {} as Record<string, string>;
    }

    throw error;
  }

  return Object.fromEntries(
    (data ?? []).map((row) => [row.chat_id, row.last_read_message_at])
  ) as Record<string, string>;
}

export async function upsertChatReadMarker(chatId: string, lastReadMessageAt: string) {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  if (!user) {
    throw new Error('No hay un usuario autenticado.');
  }

  const { error } = await supabase.from('chat_read_markers').upsert(
    {
      user_id: user.id,
      chat_id: chatId,
      last_read_message_at: lastReadMessageAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,chat_id' }
  );

  if (error && !isMissingReadMarkersTable(error)) {
    throw error;
  }
}

function isMissingReadMarkersTable(error: { message?: string; code?: string }) {
  return error.code === '42P01' || error.message?.includes('chat_read_markers') || false;
}
