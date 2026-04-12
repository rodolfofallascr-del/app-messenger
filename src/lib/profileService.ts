import { ProfileRecord } from '../types/chat';
import { getSupabaseClient } from './supabase';

export async function fetchCurrentProfile(userId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,admin_alias,admin_tags,avatar_url,role,status,created_at')
    .eq('id', userId)
    .single();

  if (error) {
    throw error;
  }

  return data as ProfileRecord;
}
