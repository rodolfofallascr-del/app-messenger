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
