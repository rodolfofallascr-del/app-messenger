import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MessagingApp } from './MessagingApp';
import { AuthScreen } from './components/AuthScreen';
import { SetupGuide } from './components/SetupGuide';
import { getSupabaseClient, hasSupabaseConfig } from './lib/supabase';
import { palette } from './theme/palette';

export function RootApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .finally(() => {
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={styles.loadingText}>Preparando la app...</Text>
      </View>
    );
  }

  if (!hasSupabaseConfig) {
    return <SetupGuide />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  return <MessagingApp session={session} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: palette.secondaryText,
    fontSize: 15,
  },
});
