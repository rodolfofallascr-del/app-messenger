import { StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme/palette';

const stats = [
  { value: '300', label: 'usuarios objetivo' },
  { value: '1:1 + grupos', label: 'chat inicial' },
  { value: 'imagenes + archivos', label: 'adjuntos MVP' },
];

export function QuickStats() {
  return (
    <View style={styles.row}>
      {stats.map((stat) => (
        <View key={stat.label} style={styles.card}>
          <Text style={styles.value}>{stat.value}</Text>
          <Text style={styles.label}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  card: {
    flex: 1,
    backgroundColor: palette.panel,
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  value: {
    color: palette.primaryText,
    fontSize: 18,
    fontWeight: '800',
  },
  label: {
    color: palette.secondaryText,
    fontSize: 12,
    lineHeight: 18,
  },
});
