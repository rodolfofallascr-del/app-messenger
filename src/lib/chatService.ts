import { getSupabaseClient } from './supabase';
import { ChatMemberRecord, ChatRecord, MessageRecord, ProfileRecord } from '../types/chat';

type RawProfile = ProfileRecord | ProfileRecord[] | null;

type RawChatRow = ChatRecord & {
  members: Array<Omit<ChatMemberRecord, 'profile'> & { profile: RawProfile }>;
  messages: Array<Omit<MessageRecord, 'profile'> & { profile: RawProfile }>;
};

type ChatRow = ChatRecord & {
  members: Array<ChatMemberRecord & { profile: ProfileRecord | null }>;
  messages: Array<MessageRecord & { profile: ProfileRecord | null }>;
};

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
            avatar_url,
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
            avatar_url,
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

export async function createChat(params: {
  currentUserId: string;
  currentUserEmail: string | null;
  name: string;
  participantEmails: string[];
}) {
  const supabase = getSupabaseClient();
  const normalizedEmails = Array.from(
    new Set(
      params.participantEmails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0)
        .filter((email) => email !== (params.currentUserEmail ?? '').toLowerCase())
    )
  );

  if (normalizedEmails.length === 0) {
    throw new Error('Agrega al menos un correo de participante.');
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id,email,full_name,avatar_url,created_at')
    .in('email', normalizedEmails);

  if (profilesError) {
    throw profilesError;
  }

  const foundProfiles = (profiles ?? []) as ProfileRecord[];
  const missingEmails = normalizedEmails.filter(
    (email) => !foundProfiles.some((profile) => profile.email?.toLowerCase() === email)
  );

  if (missingEmails.length > 0) {
    throw new Error(`Estos usuarios todavia no existen en la app: ${missingEmails.join(', ')}`);
  }

  const chatType = normalizedEmails.length > 1 ? 'group' : 'direct';

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

function normalizeProfile(profile: RawProfile) {
  if (Array.isArray(profile)) {
    return profile[0] ?? null;
  }

  return profile;
}
