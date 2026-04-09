import { MediaLibraryRecord, QuickReplyRecord } from '../types/chat';
import { getSupabaseClient } from './supabase';

export async function fetchQuickReplies() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('quick_replies')
    .select('id,label,tag,body,created_by,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as QuickReplyRecord[];
}

export async function createQuickReply(input: { label: string; tag: string; body: string; createdBy: string }) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('quick_replies').insert({
    label: input.label.trim(),
    tag: normalizeTag(input.tag),
    body: input.body.trim(),
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

export async function deleteMediaLibraryItem(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('media_library').delete().eq('id', id);

  if (error) {
    throw error;
  }
}

function normalizeTag(tag: string) {
  const trimmed = tag.trim();
  if (!trimmed) {
    return '#general';
  }

  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}