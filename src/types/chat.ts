export type ChatType = 'direct' | 'group';
export type MessageDirection = 'incoming' | 'outgoing';
export type MessageStatus = 'sending' | 'sent' | 'entregado' | 'leido';
export type AppUserRole = 'admin' | 'client';
export type AppUserStatus = 'pending' | 'approved' | 'blocked';

export type ChatThread = {
  id: string;
  name: string;
  lastMessage: string;
  lastActivity: string;
  lastActivityAt: string;
  unreadCount: number;
  type: ChatType;
  members: string[];
  adminTags?: string[];
  avatarColor: string;
  encryptionLabel: string;
};

export type ChatMessage = {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  createdAt: string;
  direction: MessageDirection;
  status?: MessageStatus;
  attachmentLabel?: string;
  attachmentUrl?: string;
  attachmentType?: 'image' | 'video' | 'audio' | 'file';
  canDelete?: boolean;
};

export type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  admin_alias?: string | null;
  admin_tags?: string[] | null;
  avatar_url: string | null;
  role: AppUserRole;
  status: AppUserStatus;
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

export type PendingAttachment = {
  uri: string;
  name: string;
  mimeType: string;
  type: 'image' | 'file';
};

export type QuickReplyRecord = {
  id: string;
  label: string;
  tag: string;
  body: string;
  tag_color: string | null;
  tag_emoji: string | null;
  created_by: string | null;
  created_at: string;
};

export type MediaLibraryRecord = {
  id: string;
  title: string;
  tag: string | null;
  image_url: string;
  created_by: string | null;
  created_at: string;
};

export type AnnouncementRecord = {
  id: string;
  title: string | null;
  body: string;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  is_recurring?: boolean;
  days_of_week?: number[] | null;
  start_time?: string | null;
  end_time?: string | null;
  timezone?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

