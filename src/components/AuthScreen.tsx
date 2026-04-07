import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { getSupabaseClient } from '../lib/supabase';
import { palette } from '../theme/palette';

export function AuthScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password.trim()) {
      setMessage('Ingresa correo y contrasena.');
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const supabase = getSupabaseClient();

      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (error) {
          throw error;
        }

        setMessage('Cuenta creada. Revisa tu correo para confirmar el acceso si tu proyecto lo requiere.');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible autenticar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.shell, isDesktop && styles.shellDesktop]}>
        <View style={[styles.introCard, isDesktop && styles.introCardDesktop]}>
          <Text style={styles.eyebrow}>Holla estilo profesional</Text>
          <Text style={styles.headline}>Una sola app para movil y computadora</Text>
          <Text style={styles.copy}>
            Esta base usa Expo para compartir codigo entre Android y web, y Supabase para login,
            persistencia e historial real de conversaciones.
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bullet}>Mensajes persistentes y disponibles aunque el receptor no este conectado.</Text>
            <Text style={styles.bullet}>Misma cuenta desde celular y navegador.</Text>
            <Text style={styles.bullet}>Preparada para grupos, archivos, imagenes y notificaciones.</Text>
          </View>
        </View>

        <View style={[styles.card, isDesktop && styles.cardDesktop]}>
          <Text style={styles.eyebrow}>Supabase Auth</Text>
          <Text style={styles.title}>Entra a tu app de mensajeria</Text>
          <Text style={styles.subtitle}>
            Esta primera version usa correo y contrasena. Luego podemos agregar telefono, perfiles
            y permisos por organizacion.
          </Text>

          <View style={styles.toggleRow}>
            <ModeButton active={mode === 'login'} label="Entrar" onPress={() => setMode('login')} />
            <ModeButton active={mode === 'register'} label="Crear cuenta" onPress={() => setMode('register')} />
          </View>

          {mode === 'register' ? (
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nombre completo"
              placeholderTextColor={palette.mutedText}
              style={styles.input}
            />
          ) : null}

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Correo"
            placeholderTextColor={palette.mutedText}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Contrasena"
            placeholderTextColor={palette.mutedText}
            secureTextEntry
            style={styles.input}
          />

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Pressable style={[styles.submitButton, busy && styles.submitButtonDisabled]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={palette.buttonText} /> : <Text style={styles.submitText}>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ModeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.modeButton, active && styles.modeButtonActive]}>
      <Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: palette.background,
  },
  shell: {
    gap: 18,
    width: '100%',
    alignSelf: 'center',
  },
  shellDesktop: {
    maxWidth: 1180,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  introCard: {
    backgroundColor: '#0b1220',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    gap: 12,
  },
  introCardDesktop: {
    flex: 1,
    justifyContent: 'center',
  },
  headline: {
    color: palette.primaryText,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  copy: {
    color: palette.secondaryText,
    fontSize: 15,
    lineHeight: 22,
  },
  bulletList: {
    gap: 10,
    marginTop: 4,
  },
  bullet: {
    color: palette.secondaryText,
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    gap: 12,
  },
  cardDesktop: {
    width: 440,
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: palette.primaryText,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: palette.secondaryText,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  modeText: {
    color: palette.secondaryText,
    fontWeight: '700',
  },
  modeTextActive: {
    color: palette.buttonText,
  },
  input: {
    backgroundColor: palette.input,
    color: palette.primaryText,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  message: {
    color: '#fde68a',
    fontSize: 13,
    lineHeight: 18,
  },
  submitButton: {
    backgroundColor: palette.accent,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: palette.buttonText,
    fontWeight: '800',
    fontSize: 15,
  },
});
