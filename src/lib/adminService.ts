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
  const { error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('id', userId);

  if (error) {
    throw error;
  }
}