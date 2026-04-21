import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function normalizeSupabaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Users sometimes paste the host without protocol; Supabase client expects a full URL.
  return `https://${trimmed}`;
}

export const hasSupabaseConfig = Boolean(
  typeof rawSupabaseUrl === 'string' &&
    rawSupabaseUrl.trim() &&
    typeof rawSupabaseAnonKey === 'string' &&
    rawSupabaseAnonKey.trim()
);

export function getSupabaseConfig() {
  if (!hasSupabaseConfig || !rawSupabaseUrl || !rawSupabaseAnonKey) {
    throw new Error('Supabase no esta configurado. Agrega EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }

  const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
  const supabaseAnonKey = rawSupabaseAnonKey.trim();

  try {
    // Validate early so we fail with a helpful message on misconfigured web deployments.
    // eslint-disable-next-line no-new
    new URL(supabaseUrl);
  } catch {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL es invalida. Debe verse como "https://TU-PROYECTO.supabase.co". Revisa las variables de entorno en Vercel/Expo.'
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

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
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

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
