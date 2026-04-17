import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { ShareIntentProvider } from 'expo-share-intent';
import { RootApp } from './src/RootApp';

export default function App() {
  return (
    <ShareIntentProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <RootApp />
      </SafeAreaView>
    </ShareIntentProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
});
