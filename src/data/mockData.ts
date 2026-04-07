import { ChatMessage, ChatThread } from '../types/chat';

export const mockChats: ChatThread[] = [
  {
    id: 'chat-ventas',
    name: 'Equipo Ventas',
    lastMessage: 'Comparti el PDF con la promo actual.',
    lastActivity: '5:32 PM',
    unreadCount: 3,
    type: 'group',
    members: ['Carla', 'Luis', 'Sofia', 'Tu'],
    avatarColor: '#0284c7',
    encryptionLabel: 'Privado',
  },
  {
    id: 'chat-paola',
    name: 'Paola',
    lastMessage: 'Te mande las fotos del pedido.',
    lastActivity: '4:18 PM',
    unreadCount: 0,
    type: 'direct',
    members: ['Paola', 'Tu'],
    avatarColor: '#7c3aed',
    encryptionLabel: '1 a 1',
  },
  {
    id: 'chat-operaciones',
    name: 'Operaciones',
    lastMessage: 'Adjunto el reporte de cierre.',
    lastActivity: '11:20 AM',
    unreadCount: 1,
    type: 'group',
    members: ['Mario', 'Ana', 'Tu'],
    avatarColor: '#ea580c',
    encryptionLabel: 'Interno',
  },
];

export const mockMessages: Record<string, ChatMessage[]> = {
  'chat-ventas': [
    {
      id: 'msg-1',
      author: 'Carla',
      content: 'Buenisimo, ya tenemos listo el anuncio para hoy.',
      timestamp: '5:10 PM',
      direction: 'incoming',
    },
    {
      id: 'msg-2',
      author: 'Tu',
      content: 'Perfecto. Yo actualizo el texto y lo comparto al grupo.',
      timestamp: '5:12 PM',
      direction: 'outgoing',
      status: 'leido',
    },
    {
      id: 'msg-3',
      author: 'Luis',
      content: 'Comparti el PDF con la promo actual.',
      timestamp: '5:32 PM',
      direction: 'incoming',
      attachmentLabel: 'promo-abril.pdf',
    },
  ],
  'chat-paola': [
    {
      id: 'msg-4',
      author: 'Paola',
      content: 'Te mande las fotos del pedido.',
      timestamp: '4:18 PM',
      direction: 'incoming',
      attachmentLabel: '3 imagenes',
    },
    {
      id: 'msg-5',
      author: 'Tu',
      content: 'Recibido, gracias. Las reviso y te confirmo.',
      timestamp: '4:22 PM',
      direction: 'outgoing',
      status: 'entregado',
    },
  ],
  'chat-operaciones': [
    {
      id: 'msg-6',
      author: 'Mario',
      content: 'Adjunto el reporte de cierre.',
      timestamp: '11:20 AM',
      direction: 'incoming',
      attachmentLabel: 'cierre-semanal.xlsx',
    },
    {
      id: 'msg-7',
      author: 'Tu',
      content: 'Gracias. Lo veo y les confirmo si falta algo.',
      timestamp: '11:28 AM',
      direction: 'outgoing',
      status: 'leido',
    },
  ],
};
