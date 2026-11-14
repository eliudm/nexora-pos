import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import Constants from 'expo-constants';
import { paperTheme } from '../src/theme';
import { AppSplashScreen } from '../src/components/SplashScreen';
import { getDb } from '../src/db/database';
import { getSetting } from '../src/db/settings';
import { SessionProvider } from '../src/context/session';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const RC_API_KEY =
  (Constants.expoConfig?.extra as { rcApiKey?: string })?.rcApiKey ?? '';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<string>('subscription');

  useEffect(() => {
    (async () => {
      // 1. Init DB
      await getDb();

      // 2. Init RevenueCat
      if (RC_API_KEY && RC_API_KEY !== 'REVENUECAT_ANDROID_API_KEY') {
        Purchases.setLogLevel(LOG_LEVEL.ERROR);
        await Purchases.configure({ apiKey: RC_API_KEY });
      }

      // 3. Check subscription
      let isSubscribed = false;
      try {
        const info = await Purchases.getCustomerInfo();
        isSubscribed = Object.keys(info.entitlements.active).length > 0;
      } catch {
        // No RC key in dev — treat as subscribed
        isSubscribed = !RC_API_KEY || RC_API_KEY === 'REVENUECAT_ANDROID_API_KEY';
      }

      if (!isSubscribed) {
        setInitialRoute('subscription');
        setReady(true);
        return;
      }

      // 4. Check if business is set up
      const businessName = await getSetting('business_name');
      if (!businessName) {
        setInitialRoute('setup');
        setReady(true);
        return;
      }

      // 5. Go to PIN login
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
        <QueryClientProvider client={queryClient}>
          <PaperProvider
            theme={paperTheme}
            settings={{ icon: (props) => <MaterialCommunityIcons {...props} /> }}
          >
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="subscription" />
              <Stack.Screen name="setup" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
            </Stack>
          </PaperProvider>
        </QueryClientProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
