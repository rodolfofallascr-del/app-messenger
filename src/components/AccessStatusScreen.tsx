import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme/palette';

const brandLogo = require('../../assets/chat-santanita-logo.jpeg');

type AccessStatusScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function AccessStatusScreen({ eyebrow, title, description, actionLabel, onAction }: AccessStatusScreenProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Image source={brandLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {actionLabel && onAction ? (
          <Pressable style={styles.button} onPress={onAction}>
            <Text style={styles.buttonText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: palette.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 24,
    gap: 12,
  },
  logo: {
    width: 180,
    height: 84,
    alignSelf: 'center',
    marginBottom: 4,
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
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  description: {
    color: palette.secondaryText,
    fontSize: 15,
    lineHeight: 23,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: palette.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  buttonText: {
    color: palette.buttonText,
    fontWeight: '800',
  },
});