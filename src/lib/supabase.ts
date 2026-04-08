import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

const storage =
  Platform.OS === 'web'
    ? {
        getItem: (key: string) => Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
        setItem: (key: string, value: string) => {
          globalThis.localStorage?.setItem(key, value);
          return Promise.resolve();
        },
        removeItem: (key: string) => {
          globalThis.localStorage?.removeItem(key);
          return Promise.resolve();
        },
      }
    : {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      };

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!hasSupabaseConfig || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase no esta configurado. Agrega EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
  }

  return client;
}