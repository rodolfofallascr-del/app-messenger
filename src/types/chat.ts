export type ChatType = 'direct' | 'group';
export type MessageDirection = 'incoming' | 'outgoing';
export type MessageStatus = 'sending' | 'sent' | 'entregado' | 'leido';

export type ChatThread = {
  id: string;
  name: string;
  lastMessage: string;
  lastActivity: string;
  unreadCount: number;
  type: ChatType;
  members: string[];
  avatarColor: string;
  encryptionLabel: string;
};

export type ChatMessage = {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  direction: MessageDirection;
  status?: MessageStatus;
  attachmentLabel?: string;
};

export type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type ChatRecord = {
  id: string;
  name: string | null;
  type: ChatType;
  created_by: string | null;
  created_at: string;
};

export type ChatMemberRecord = {
  chat_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  profile?: ProfileRecord | null;
};

export type MessageRecord = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string | null;
  message_type: 'text' | 'image' | 'file';
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
  profile?: ProfileRecord | null;
};

export type SelectableUser = {
  id: string;
  email: string;
  fullName: string;
};
