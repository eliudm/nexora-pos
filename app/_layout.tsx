import React, { useEffect, useState } from 'react';
import { LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// React Native Paper 5.x passes `compact` to React.Fragment internally — harmless in RN 19
LogBox.ignoreLogs(['Invalid prop `compact` supplied to `React.Fragment`']);
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppSplashScreen } from '../src/components/SplashScreen';
import { getDb } from '../src/db/database';
import { getSetting } from '../src/db/settings';
import { SessionProvider } from '../src/context/session';
import { ThemeProvider, useTheme } from '../src/context/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function ThemedApp({ initialRoute }: { initialRoute: string }) {
  const { paperTheme, mode } = useTheme();
  return (
    <PaperProvider
      theme={paperTheme}
      settings={{ icon: (props) => <MaterialCommunityIcons {...props} /> }}
    >
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="setup" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </PaperProvider>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<string>('(auth)');

  useEffect(() => {
    (async () => {
      await getDb();

      const businessName = await getSetting('business_name');
      if (!businessName) {
        setInitialRoute('setup');
        setReady(true);
        return;
      }

      setInitialRoute('(auth)');
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) router.replace(initialRoute as any);
  }, [ready, initialRoute]);

  if (!ready) return <AppSplashScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <ThemeProvider>
            <QueryClientProvider client={queryClient}>
              <ThemedApp initialRoute={initialRoute} />
            </QueryClientProvider>
          </ThemeProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
