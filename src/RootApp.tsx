import { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { AdminWebApp } from './AdminWebApp';
import { MessagingApp } from './MessagingApp';
import { AccessStatusScreen } from './components/AccessStatusScreen';
import { AuthScreen } from './components/AuthScreen';
import { SetupGuide } from './components/SetupGuide';
import { fetchCurrentProfile } from './lib/profileService';
import { getSupabaseClient, hasSupabaseConfig } from './lib/supabase';
import { palette } from './theme/palette';
import { ProfileRecord } from './types/chat';

export function RootApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    fetchCurrentProfile(session.user.id)
      .then((nextProfile) => {
        setProfile(nextProfile);
      })
      .catch((error) => {
        setProfile(null);
        setProfileError(error instanceof Error ? error.message : 'No fue posible cargar el perfil.');
      })
      .finally(() => {
        setProfileLoading(false);
      });
  }, [session]);

  const handleSignOut = () => {
    getSupabaseClient()
      .auth.signOut()
      .catch(() => undefined);
  };

  if (loading || profileLoading) {
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

  if (profileError) {
    return (
      <AccessStatusScreen
        eyebrow="Perfil"
        title="No fue posible validar el acceso"
        description={profileError}
        actionLabel="Cerrar sesion"
        onAction={handleSignOut}
      />
    );
  }

  if (!profile) {
    return (
      <AccessStatusScreen
        eyebrow="Perfil"
        title="Tu perfil aun no esta listo"
        description="Inicia sesion de nuevo en unos segundos o revisa que el usuario exista en la tabla profiles."
        actionLabel="Cerrar sesion"
        onAction={handleSignOut}
      />
    );
  }

  if (profile.status === 'pending') {
    return (
      <AccessStatusScreen
        eyebrow="Acceso pendiente"
        title="Tu cuenta aun no ha sido aprobada"
        description="El administrador debe autorizar este usuario desde el panel web antes de que puedas entrar al chat."
        actionLabel="Cerrar sesion"
        onAction={handleSignOut}
      />
    );
  }

  if (profile.status === 'blocked') {
    return (
      <AccessStatusScreen
        eyebrow="Acceso bloqueado"
        title="Tu cuenta fue deshabilitada"
        description="Si crees que esto es un error, contacta al administrador para revisar tu acceso."
        actionLabel="Cerrar sesion"
        onAction={handleSignOut}
      />
    );
  }

  if (profile.role === 'admin' && Platform.OS === 'web') {
    return <AdminWebApp session={session} profile={profile} />;
  }

  if (profile.role === 'admin' && Platform.OS !== 'web') {
    return (
      <AccessStatusScreen
        eyebrow="Panel admin"
        title="El administrador debe usar la version web"
        description="Tu cuenta es administradora. Entra desde la web para aprobar usuarios y gestionar conversaciones."
        actionLabel="Cerrar sesion"
        onAction={handleSignOut}
      />
    );
  }

  if (profile.role === 'client' && Platform.OS === 'web') {
    return (
      <AccessStatusScreen
        eyebrow="Version cliente"
        title="Los clientes usan la app movil"
        description="Esta version web quedara reservada para administracion. Ingresa al chat desde Android con tu usuario aprobado."
        actionLabel="Cerrar sesion"
        onAction={handleSignOut}
      />
    );
  }

  return <MessagingApp session={session} clientMode />;
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