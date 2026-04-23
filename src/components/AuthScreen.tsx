import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getSupabaseClient } from '../lib/supabase';
import { palette } from '../theme/palette';

const brandLogo = require('../../assets/chat-santanita-logo.jpeg');
const buildLabel = 'Build 1.0.1 / Android fix';
const REMEMBER_LOGIN_STORAGE_KEY = 'chat-santanita-remember-login';
const CLIENT_AUTH_HOSTNAMES = new Set(['app.chatsantanita.com']);

function normalizePhoneInput(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/[^\d]/g, '');
  if (!digitsOnly) return '';

  // If user didn't include a country code and typed 8 digits, assume Costa Rica (+506).
  const normalizedDigits = !hasPlus && digitsOnly.length === 8 ? `506${digitsOnly}` : digitsOnly;
  return `+${normalizedDigits}`;
}

function phoneToAuthEmail(phoneE164: string) {
  const digits = phoneE164.replace(/[^\d]/g, '');
  return `u_${digits}@phone.chatsantanita.local`;
}

export function AuthScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberLogin, setRememberLogin] = useState(false);
  const [fullName, setFullName] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isClientAuth = Platform.OS !== 'web'
    ? true
    : CLIENT_AUTH_HOSTNAMES.has(globalThis.location?.hostname ?? '');

  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        const stored = window.localStorage.getItem(REMEMBER_LOGIN_STORAGE_KEY);
        if (!stored) {
          setRememberLogin(false);
          return;
        }

        const parsed = JSON.parse(stored) as { email?: string; phone?: string; password?: string; remember?: boolean };
        setRememberLogin(parsed.remember === true);
        setLoginId(parsed.phone ?? parsed.email ?? '');
        setPassword(parsed.password ?? '');
      } catch {
        window.localStorage.removeItem(REMEMBER_LOGIN_STORAGE_KEY);
        setRememberLogin(false);
      }

      return;
    }

    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(REMEMBER_LOGIN_STORAGE_KEY);
        if (!stored) {
          setRememberLogin(false);
          return;
        }

        const parsed = JSON.parse(stored) as { email?: string; phone?: string; password?: string; remember?: boolean };
        setRememberLogin(parsed.remember === true);
        setLoginId(parsed.phone ?? parsed.email ?? '');
        setPassword(parsed.password ?? '');
      } catch {
        await SecureStore.deleteItemAsync(REMEMBER_LOGIN_STORAGE_KEY);
        setRememberLogin(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (!rememberLogin) {
        window.localStorage.removeItem(REMEMBER_LOGIN_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(
        REMEMBER_LOGIN_STORAGE_KEY,
        JSON.stringify({
          remember: true,
          phone: loginId,
          password,
        })
      );
      return;
    }

    void (async () => {
      if (!rememberLogin) {
        await SecureStore.deleteItemAsync(REMEMBER_LOGIN_STORAGE_KEY);
        return;
      }

      await SecureStore.setItemAsync(
        REMEMBER_LOGIN_STORAGE_KEY,
        JSON.stringify({
          remember: true,
          phone: loginId,
          password,
        })
      );
    })();
  }, [loginId, password, rememberLogin]);

  const submit = async () => {
    const normalizedPassword = password.trim();
    const normalizedPhone = isClientAuth ? normalizePhoneInput(loginId) : '';
    const normalizedEmail = !isClientAuth ? loginId.trim().toLowerCase() : phoneToAuthEmail(normalizedPhone);

    if (isClientAuth) {
      if (!normalizedPhone || normalizedPhone.length < 9) {
        setMessage('Ingresa tu numero de telefono. Ejemplo: +50671314515');
        return;
      }
      if (!normalizedPassword) {
        setMessage('Ingresa tu contrasena.');
        return;
      }
    } else {
      if (!normalizedEmail || !normalizedPassword) {
        setMessage('Ingresa correo y contrasena.');
        return;
      }
    }

    if (!normalizedEmail || !normalizedPassword) {
      setMessage('Completa los datos para continuar.');
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const supabase = getSupabaseClient();

      if (mode === 'register') {
        const emailRedirectTo = Platform.OS === 'web' ? globalThis.location?.origin : undefined;
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: normalizedPassword,
          options: {
            emailRedirectTo,
            data: {
              full_name: fullName.trim(),
              phone: isClientAuth ? normalizedPhone : undefined,
            },
          },
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          setMessage('Cuenta creada y sesion iniciada correctamente.');
        } else {
          setMessage(isClientAuth ? 'Cuenta creada. Ya puedes iniciar sesion.' : 'Cuenta creada. Revisa tu correo y confirma la direccion antes de iniciar sesion.');
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });

      if (error) {
        throw error;
      }

      if (Platform.OS === 'web') {
        if (rememberLogin) {
          window.localStorage.setItem(
            REMEMBER_LOGIN_STORAGE_KEY,
            JSON.stringify({
              remember: true,
              phone: loginId,
              password: normalizedPassword,
            })
          );
        } else {
          window.localStorage.removeItem(REMEMBER_LOGIN_STORAGE_KEY);
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible autenticar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardShell, Platform.OS === 'web' && (styles.keyboardShellWeb as any)]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, isDesktop ? styles.contentDesktop : styles.contentMobile]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, isDesktop && styles.shellDesktop]}>
          <View style={[styles.authCard, isDesktop && styles.authCardDesktop]}>
            <Image
              source={brandLogo}
              style={[styles.logo, isDesktop ? (styles.logoDesktop as any) : null]}
              resizeMode="contain"
            />

            <View style={styles.brandCopy}>
              <Text style={styles.eyebrow}>Chat Santanita</Text>
              <Text style={styles.buildBadge}>{buildLabel}</Text>
              <Text style={styles.title}>Entra a tu mensajeria</Text>
              <Text style={styles.subtitle}>Accede a tus conversaciones, grupos y archivos desde el celular.</Text>
            </View>

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
                returnKeyType="next"
              />
            ) : null}

            <TextInput
              value={loginId}
              onChangeText={setLoginId}
              placeholder={isClientAuth ? 'Telefono (+506...)' : 'Correo'}
              placeholderTextColor={palette.mutedText}
              autoCapitalize="none"
              keyboardType={isClientAuth ? 'phone-pad' : 'email-address'}
              style={styles.input}
              returnKeyType="next"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Contrasena"
              placeholderTextColor={palette.mutedText}
              secureTextEntry
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={submit}
            />

            {Platform.OS === 'web' ? (
              <Pressable style={styles.rememberRow} onPress={() => setRememberLogin((current) => !current)}>
                <View style={[styles.rememberCheckbox, rememberLogin && styles.rememberCheckboxActive]}>
                  {rememberLogin ? <Text style={styles.rememberCheck}>✓</Text> : null}
                </View>
                <Text style={styles.rememberText}>Recordarme en este navegador</Text>
              </Pressable>
            ) : null}

            {Platform.OS !== 'web' ? (
              <Pressable style={styles.rememberRow} onPress={() => setRememberLogin((current) => !current)}>
                <View style={[styles.rememberCheckbox, rememberLogin && styles.rememberCheckboxActive]}>
                  {rememberLogin ? <Text style={styles.rememberCheck}>✓</Text> : null}
                </View>
                <Text style={styles.rememberText}>Recordarme en este telefono</Text>
              </Pressable>
            ) : null}

            {message ? <Text style={styles.message}>{message}</Text> : null}

            <Pressable style={[styles.submitButton, busy && styles.submitButtonDisabled]} onPress={submit} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={palette.buttonText} />
              ) : (
                <Text style={styles.submitText}>{mode === 'login' ? 'Entrar al chat' : 'Crear cuenta'}</Text>
              )}
            </Pressable>

            <Text style={styles.helperText}>Usa tu correo registrado en Supabase.</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  keyboardShell: {
    flex: 1,
    backgroundColor: palette.background,
  },
  keyboardShellWeb: ({
    backgroundImage:
      'radial-gradient(1200px 800px at 85% 0%, rgba(34,197,94,0.22), transparent 62%), radial-gradient(900px 700px at 10% 100%, rgba(56,189,248,0.18), transparent 58%), linear-gradient(180deg, #050814 0%, #070B16 100%)',
  } as any),
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  contentMobile: {
    justifyContent: 'flex-start',
    paddingBottom: 28,
  },
  contentDesktop: {
    justifyContent: 'center',
    paddingBottom: 18,
  },
  shell: {
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },
  shellDesktop: {
    maxWidth: 520,
  },
  authCard: {
    backgroundColor: 'rgba(16,27,47,0.70)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    gap: 14,
  },
  authCardDesktop: {
    width: 460,
    justifyContent: 'center',
  },
  brandCopy: {
    gap: 6,
  },
  logo: {
    width: 170,
    height: 78,
    alignSelf: 'center',
    marginBottom: 2,
  },
  logoDesktop: {
    width: 220,
    height: 100,
    alignSelf: 'flex-start',
  },
  eyebrow: {
    color: '#facc15',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  buildBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#13213a',
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  title: {
    color: palette.primaryText,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
  },
  subtitle: {
    color: palette.secondaryText,
    fontSize: 14,
    lineHeight: 21,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 16,
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
    fontWeight: '800',
  },
  modeTextActive: {
    color: palette.buttonText,
  },
  input: {
    backgroundColor: palette.input,
    color: palette.primaryText,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 15,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -2,
  },
  rememberCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberCheckboxActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  rememberCheck: {
    color: palette.buttonText,
    fontWeight: '900',
    fontSize: 13,
  },
  rememberText: {
    color: palette.secondaryText,
    fontSize: 13,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: palette.accent,
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: palette.buttonText,
    fontWeight: '800',
    fontSize: 15,
  },
  helperText: {
    color: palette.mutedText,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  message: {
    color: '#fde68a',
    fontSize: 13,
    lineHeight: 18,
  },
});
