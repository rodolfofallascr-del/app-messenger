import { AppUserStatus, ProfileRecord } from '../types/chat';
import { getSupabaseClient } from './supabase';

export async function fetchAdminUsers() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,admin_alias,admin_tags,avatar_url,role,status,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as ProfileRecord[];
}

export async function updateUserAccess(userId: string, status: AppUserStatus) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_set_user_status', {
    target_user_id: userId,
    new_status: status,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Supabase no confirmo el cambio de estado del usuario.');
  }
}

export async function deleteBlockedUserChats(userId: string) {
  const supabase = getSupabaseClient();
  // Backend function name in Supabase is `admin_delete_user_chats`.
  // Keep the frontend aligned to avoid silent "not found" failures.
  const { data, error } = await supabase.rpc('admin_delete_user_chats', {
    target_user_id: userId,
  });

  if (error) {
    throw error;
  }

  return Number(data ?? 0);
}

export async function deleteUserCompletely(userId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('admin-delete-user', {
    body: { target_user_id: userId },
  });

  if (error) {
    throw error;
  }

  const ok = Boolean((data as any)?.ok);
  if (!ok) {
    const message = (data as any)?.error ?? 'No fue posible eliminar el usuario.';
    throw new Error(typeof message === 'string' ? message : 'No fue posible eliminar el usuario.');
  }

  return data as { ok: true };
}

export async function updateAdminAlias(userId: string, alias: string | null) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_set_user_alias', {
    target_user_id: userId,
    new_alias: alias,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Supabase no confirmo el cambio de alias del usuario.');
  }

  return data as ProfileRecord;
}

export async function updateAdminTags(userId: string, tags: string[]) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('admin_set_user_tags', {
    target_user_id: userId,
    new_tags: tags,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('Supabase no confirmo el cambio de etiquetas del usuario.');
  }

  return data as ProfileRecord;
}
