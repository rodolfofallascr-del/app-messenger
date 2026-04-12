import { ChatMessage, ChatMemberRecord, ChatRecord, ChatThread, MessageRecord, ProfileRecord } from '../types/chat';

const avatarPalette = ['#0284c7', '#7c3aed', '#ea580c', '#16a34a', '#dc2626', '#0891b2'];

export function formatRelativeTime(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('es-CR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function profileDisplayName(profile: ProfileRecord | null | undefined, fallback?: string) {
  return profile?.full_name?.trim() || profile?.email || fallback || 'Usuario';
}

export function buildChatThread(params: {
  chat: ChatRecord;
  members: ChatMemberRecord[];
  lastMessage?: MessageRecord | null;
  currentUserId: string;
  unreadCount?: number;
}) {
  const { chat, members, lastMessage, currentUserId, unreadCount = 0 } = params;
  const otherMembers = members.filter((member) => member.user_id !== currentUserId);
  const visibleMembers = members.map((member) => profileDisplayName(member.profile));

  const name =
    chat.type === 'group'
      ? chat.name?.trim() || visibleMembers.join(', ')
      : otherMembers.map((member) => profileDisplayName(member.profile)).join(', ') || 'Chat directo';

  return {
    id: chat.id,
    name,
    lastMessage: messagePreview(lastMessage),
    lastActivity: lastMessage ? formatRelativeTime(lastMessage.created_at) : formatRelativeTime(chat.created_at),
    lastActivityAt: lastMessage?.created_at ?? chat.created_at,
    unreadCount,
    type: chat.type,
    members: visibleMembers,
    avatarColor: avatarPalette[Math.abs(hashString(chat.id)) % avatarPalette.length],
    encryptionLabel: chat.type === 'group' ? 'Grupo' : 'Directo',
  } satisfies ChatThread;
}

export function buildChatMessages(messages: MessageRecord[], currentUserId: string) {
  return messages.map((message) => ({
    id: message.id,
    author: message.sender_id === currentUserId ? 'Tu' : profileDisplayName(message.profile),
    content: message.body?.trim() || attachmentFallback(message),
    timestamp: formatRelativeTime(message.created_at),
    direction: message.sender_id === currentUserId ? 'outgoing' : 'incoming',
    canDelete: message.sender_id === currentUserId,
    attachmentLabel: message.attachment_name || undefined,
    attachmentUrl: message.attachment_url || undefined,
    attachmentType: message.message_type === 'image' ? 'image' : message.message_type === 'file' ? 'file' : undefined,
  })) satisfies ChatMessage[];
}

function messagePreview(message?: MessageRecord | null) {
  if (!message) {
    return 'Sin mensajes todavia';
  }

  if (message.body?.trim()) {
    return message.body;
  }

  return attachmentFallback(message);
}

function attachmentFallback(message: MessageRecord) {
  if (message.message_type === 'image') {
    return 'Imagen adjunta';
  }

  if (message.message_type === 'file') {
    return message.attachment_name || 'Archivo adjunto';
  }

  return 'Mensaje';
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return hash;
}


