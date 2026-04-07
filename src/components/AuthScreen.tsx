import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { getSupabaseClient } from '../lib/supabase';
import { palette } from '../theme/palette';

const brandLogo = require('../../assets/chat-santanita-logo.jpeg');

const quickStats = ['Mensajes en vivo', 'Grupos privados', 'Imagenes y archivos'];

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

        setMessage('Cuenta creada. Ya puedes iniciar sesion si tu proyecto no exige confirmar correo.');
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.shell, isDesktop && styles.shellDesktop]}>
        <View style={[styles.authCard, isDesktop && styles.authCardDesktop]}>
          <Image source={brandLogo} style={[styles.logo, isDesktop && styles.logoDesktop]} resizeMode="contain" />

          <View style={styles.brandCopy}>
            <Text style={styles.eyebrow}>Chat Santanita</Text>
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
            {busy ? (
              <ActivityIndicator color={palette.buttonText} />
            ) : (
              <Text style={styles.submitText}>{mode === 'login' ? 'Entrar al chat' : 'Crear cuenta'}</Text>
            )}
          </Pressable>

          <Text style={styles.helperText}>Usa tu correo registrado en Supabase.</Text>
        </View>

        {isDesktop ? (
          <View style={[styles.introCard, styles.introCardDesktop]}>
            <Text style={styles.panelEyebrow}>Mensajeria privada</Text>
            <Text style={styles.panelTitle}>Tu equipo conectado en un solo lugar</Text>
            <Text style={styles.panelCopy}>
              Una experiencia pensada para conversaciones rapidas, grupos internos y envio de archivos sin perder historial.
            </Text>

            <View style={styles.statsRow}>
              {quickStats.map((item) => (
                <View key={item} style={styles.statChip}>
                  <Text style={styles.statChipText}>{item}</Text>
                </View>
              ))}
            </View>

            <View style={styles.previewCard}>
              <View style={[styles.previewBubble, styles.previewBubbleIncoming]}>
                <Text style={styles.previewAuthor}>Soporte</Text>
                <Text style={styles.previewText}>Buenos dias. Ya revise tu pedido y lo deje listo.</Text>
              </View>
              <View style={[styles.previewBubble, styles.previewBubbleOutgoing]}>
                <Text style={styles.previewText}>Perfecto, lo confirmo con el cliente y te aviso.</Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
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
    backgroundColor: palette.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    justifyContent: 'center',
  },
  contentDesktop: {
    justifyContent: 'center',
  },
  shell: {
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },
  shellDesktop: {
    maxWidth: 1180,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  authCard: {
    backgroundColor: palette.card,
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
  introCard: {
    backgroundColor: '#0b1220',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    gap: 14,
  },
  introCardDesktop: {
    flex: 1,
    justifyContent: 'center',
    padding: 26,
  },
  panelEyebrow: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  panelTitle: {
    color: palette.primaryText,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
  },
  panelCopy: {
    color: palette.secondaryText,
    fontSize: 15,
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statChip: {
    backgroundColor: '#13213a',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#21314b',
  },
  statChipText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '700',
  },
  previewCard: {
    backgroundColor: '#0f172a',
    borderRadius: 22,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1f2a3d',
  },
  previewBubble: {
    maxWidth: '84%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    gap: 4,
  },
  previewBubbleIncoming: {
    alignSelf: 'flex-start',
    backgroundColor: '#172554',
    borderTopLeftRadius: 6,
  },
  previewBubbleOutgoing: {
    alignSelf: 'flex-end',
    backgroundColor: '#14532d',
    borderTopRightRadius: 6,
  },
  previewAuthor: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700',
  },
  previewText: {
    color: palette.primaryText,
    fontSize: 14,
    lineHeight: 20,
  },
});
