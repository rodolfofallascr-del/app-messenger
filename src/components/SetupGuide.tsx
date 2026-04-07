import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { palette } from '../theme/palette';

const steps = [
  'Crea un proyecto en Supabase.',
  'Copia Project URL y anon key.',
  'Agrega EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY a tu .env.',
  'Ejecuta el esquema SQL de la carpeta supabase.',
  'Reinicia Expo para que lea las variables nuevas.',
];

export function SetupGuide() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;

  return (
    <View style={styles.screen}>
      <View style={[styles.shell, isDesktop && styles.shellDesktop]}>
        <View style={[styles.infoCard, isDesktop && styles.infoCardDesktop]}>
          <Text style={styles.eyebrow}>Modo configuracion</Text>
          <Text style={styles.headline}>Conecta el backend y ya tendremos movil + web</Text>
          <Text style={styles.copy}>
            Esta app ya esta lista para abrirse desde el navegador de la compu. Lo que falta es
            conectar Supabase para activar usuarios, historial y sincronizacion real.
          </Text>
        </View>

        <View style={[styles.card, isDesktop && styles.cardDesktop]}>
          <Text style={styles.eyebrow}>Configuracion pendiente</Text>
          <Text style={styles.title}>Falta conectar Supabase</Text>
          <Text style={styles.subtitle}>
            La app ya esta preparada para autenticar usuarios. Solo faltan las credenciales del
            proyecto para activar el flujo real.
          </Text>

          <View style={styles.codeBox}>
            <Text style={styles.codeLine}>EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co</Text>
            <Text style={styles.codeLine}>EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key</Text>
          </View>

          <View style={styles.steps}>
            {steps.map((step, index) => (
              <Text key={step} style={styles.step}>
                {index + 1}. {step}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </View>
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
  infoCard: {
    backgroundColor: '#0b1220',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    gap: 12,
  },
  infoCardDesktop: {
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
  card: {
    backgroundColor: palette.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    gap: 14,
  },
  cardDesktop: {
    width: 480,
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
  },
  codeBox: {
    backgroundColor: palette.panel,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  codeLine: {
    color: palette.primaryText,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  steps: {
    gap: 8,
  },
  step: {
    color: palette.secondaryText,
    lineHeight: 20,
  },
});
