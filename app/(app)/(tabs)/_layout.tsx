import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../src/context/theme';
import { subscriptionService, TRIAL_DAYS } from '../../../src/services/subscription';
import { getSetting } from '../../../src/db/settings';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function TabIcon({ name, color, size }: { name: IconName; color: string | any; size: number }) {
  return <MaterialCommunityIcons name={name} color={color as string} size={size} />;
}

function TrialBanner({ daysLeft, colors }: { daysLeft: number; colors: any }) {
  const urgent = daysLeft <= 3;
  const bg = urgent ? '#ef444422' : '#f59e0b18';
  const fg = urgent ? '#ef4444' : '#d97706';
  const icon: IconName = urgent ? 'alert-circle-outline' : 'clock-outline';
  const { top } = useSafeAreaInsets();

  return (
    <Pressable
      style={[styles.banner, { backgroundColor: bg, borderBottomColor: fg + '44', paddingTop: top + 7 }]}
      onPress={() => router.push('/(app)/subscription')}
    >
      <MaterialCommunityIcons name={icon} size={14} color={fg} />
      <Text style={[styles.bannerText, { color: fg }]}>
        {daysLeft === 1
          ? 'Last day of free trial — subscribe to keep access'
          : `Free trial: ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`}
      </Text>
      <Text style={[styles.bannerCta, { color: fg }]}>Subscribe →</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    checkTrial();
  }, []);

  const checkTrial = async () => {
    const trial = await subscriptionService.getTrialInfo();
    if (trial.expired) return; // paywall handles expired state

    // Don't show banner if subscribed
    const phone = await getSetting('phone');
    if (phone) {
      const sub = await subscriptionService.isActive(phone);
      if (sub.active) return;
    }

    // Show banner for the whole trial period
    setTrialDaysLeft(trial.daysLeft);
  };

  const showBanner = trialDaysLeft !== null && trialDaysLeft > 0;

  return (
    <View style={{ flex: 1 }}>
      {showBanner && <TrialBanner daysLeft={trialDaysLeft!} colors={colors} />}
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            height: 64,
            paddingBottom: 8,
            paddingTop: 4,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => <TabIcon name="view-dashboard" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="pos"
          options={{
            title: 'POS',
            tabBarIcon: ({ color, size }) => <TabIcon name="cash-register" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="products"
          options={{
            title: 'Products',
            tabBarIcon: ({ color, size }) => <TabIcon name="package-variant" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="customers"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="sales"
          options={{
            title: 'Sales',
            tabBarIcon: ({ color, size }) => <TabIcon name="receipt" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: 'Reports',
            tabBarIcon: ({ color, size }) => <TabIcon name="chart-bar" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="analytics"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, size }) => <TabIcon name="dots-grid" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => <TabIcon name="cog" color={color} size={size} />,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  bannerText: { flex: 1, fontSize: 12, fontWeight: '600' },
  bannerCta: { fontSize: 12, fontWeight: '800' },
});
