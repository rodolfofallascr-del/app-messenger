import { AppUserStatus, ProfileRecord } from '../types/chat';
import { getSupabaseClient } from './supabase';

export async function fetchAdminUsers() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,avatar_url,role,status,created_at')
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
