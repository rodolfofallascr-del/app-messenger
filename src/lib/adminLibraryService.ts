import { File } from 'expo-file-system';
import { MediaLibraryRecord, PendingAttachment, QuickReplyRecord } from '../types/chat';
import { getSupabaseClient } from './supabase';

const ATTACHMENTS_BUCKET = 'chat-attachments';

export async function fetchQuickReplies() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('quick_replies')
    .select('id,label,tag,body,tag_color,tag_emoji,created_by,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as QuickReplyRecord[];
}

export async function createQuickReply(input: {
  label: string;
  tag: string;
  body: string;
  tagColor?: string;
  tagEmoji?: string;
  createdBy: string;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('quick_replies').insert({
    label: input.label.trim(),
    tag: normalizeTag(input.tag),
    body: input.body.trim(),
    tag_color: normalizeOptionalText(input.tagColor),
    tag_emoji: normalizeOptionalText(input.tagEmoji),
    created_by: input.createdBy,
  });

  if (error) {
    throw error;
  }
}

export async function deleteQuickReply(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('quick_replies').delete().eq('id', id);

  if (error) {
    throw error;
  }
}

export async function fetchMediaLibrary() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('media_library')
    .select('id,title,tag,image_url,created_by,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as MediaLibraryRecord[];
}

export async function createMediaLibraryItem(input: { title: string; tag: string; imageUrl: string; createdBy: string }) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('media_library').insert({
    title: input.title.trim(),
    tag: input.tag.trim() ? normalizeTag(input.tag) : null,
    image_url: input.imageUrl.trim(),
    created_by: input.createdBy,
  });

  if (error) {
    throw error;
  }
}

export async function createMediaLibraryItemFromUpload(input: {
  title: string;
  tag: string;
  file: PendingAttachment;
  createdBy: string;
}) {
  const supabase = getSupabaseClient();
  const path = `library/${Date.now()}-${sanitizeFileName(input.file.name)}`;
  const fileBuffer = await readFileAsArrayBuffer(input.file.uri);

  const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, fileBuffer, {
    contentType: input.file.mimeType,
    upsert: false,
  });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);
  await createMediaLibraryItem({
    title: input.title,
    tag: input.tag,
    imageUrl: publicUrlData.publicUrl,
    createdBy: input.createdBy,
  });
}

export async function deleteMediaLibraryItem(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('media_library').delete().eq('id', id);

  if (error) {
    throw error;
  }
}

async function readFileAsArrayBuffer(uri: string) {
  if (uri.startsWith('blob:') || uri.startsWith('http://') || uri.startsWith('https://')) {
    const response = await fetch(uri);

    if (!response.ok) {
      throw new Error('No fue posible leer la imagen seleccionada.');
    }

    return await response.blob();
  }

  try {
    const file = new File(uri);
    const arrayBuffer = await file.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    throw new Error(error instanceof Error ? 'No fue posible preparar la imagen: ' + error.message : 'No fue posible preparar la imagen.');
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeTag(tag: string) {
  const trimmed = tag.trim();
  if (!trimmed) {
    return '#general';
  }

  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function normalizeOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
