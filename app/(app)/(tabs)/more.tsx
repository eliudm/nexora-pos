import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Text, Appbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useTheme } from '../../../src/context/theme';
import { productQueries } from '../../../src/db/products';
import { salesQueries } from '../../../src/db/sales';
import { getBusinessInfo } from '../../../src/db/settings';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface MenuItem {
  label: string;
  description: string;
  icon: IconName;
  route: string;
  color: string;
}

const MENU_SECTIONS: { title: string; items: MenuItem[] }[] = [
  {
    title: 'Intelligence',
    items: [
      { label: 'Smart Insights', description: 'On-device business intelligence, instant & free', icon: 'brain', route: '/ai-insights', color: '#6f67ff' },
      { label: 'Analytics', description: 'Deep-dive charts and performance trends', icon: 'chart-line', route: '/analytics', color: '#1db8a0' },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Customers', description: 'Manage customer accounts and credit', icon: 'account-group-outline', route: '/customers', color: '#3b82f6' },
    ],
  },
  {
    title: 'Purchasing',
    items: [
      { label: 'Purchase Orders', description: 'Order stock from suppliers', icon: 'file-document-outline', route: '/purchase-orders', color: '#6f67ff' },
      { label: 'Vendor Bills', description: 'Track amounts owed to suppliers', icon: 'file-document-edit-outline', route: '/vendor-bills', color: '#e53935' },
      { label: 'Suppliers', description: 'Manage your suppliers', icon: 'truck-delivery-outline', route: '/suppliers', color: '#3b82f6' },
    ],
  },
  {
    title: 'Sales Tools',
    items: [
      { label: 'Quotations', description: 'Create and send quotes', icon: 'file-percent-outline', route: '/quotations', color: '#f59e0b' },
      { label: 'Layaway', description: 'Reserved / deposit sales', icon: 'calendar-clock-outline', route: '/layaway', color: '#8b5cf6' },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { label: 'Stock Take', description: 'Count and reconcile stock', icon: 'clipboard-list-outline', route: '/stocktake', color: '#22c55e' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Credit', description: 'Outstanding balances and repayments', icon: 'credit-card-clock-outline', route: '/credit', color: '#e53935' },
      { label: 'Expenses', description: 'Track business expenses', icon: 'cash-minus', route: '/expenses', color: '#e53935' },
    ],
  },
  {
    title: 'Support',
    items: [
      { label: 'Help & Support', description: 'FAQs and guides', icon: 'help-circle-outline', route: '/help', color: '#1db8a0' },
    ],
  },
];

export default function MoreScreen() {
  const { colors: C } = useTheme();
  const styles = makeStyles(C);
  const todayStr = dayjs().format('YYYY-MM-DD');

  const { data: outOfStock = [] } = useQuery({ queryKey: ['alerts-oos'], queryFn: productQueries.getOutOfStock });
  const { data: lowStock = [] } = useQuery({ queryKey: ['alerts-low'], queryFn: productQueries.getLowStock });
  const { data: expiring = [] } = useQuery({ queryKey: ['alerts-expiry'], queryFn: () => productQueries.getExpiring(30) });
  const alertCount = outOfStock.length + lowStock.length + expiring.length;

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="More" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Alerts banner */}
        <Pressable
          style={[styles.alertBanner, { backgroundColor: alertCount > 0 ? '#e53935' : '#22c55e', marginBottom: 16 }]}
          onPress={() => router.push('/alerts' as any)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialCommunityIcons name="bell-outline" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                {alertCount > 0 ? `${alertCount} Active Alert${alertCount !== 1 ? 's' : ''}` : 'All Clear'}
              </Text>
              <Text style={{ color: '#ffffff99', fontSize: 12 }}>
                {alertCount > 0
                  ? `${outOfStock.length} out of stock · ${lowStock.length} low stock · ${expiring.length} expiring`
                  : 'No stock or expiry alerts'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#fff" />
          </View>
        </Pressable>

        {MENU_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.grid}>
              {section.items.map((item) => (
                <Pressable
                  key={item.route}
                  style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
                  onPress={() => router.push(item.route as any)}
                >
                  <View style={[styles.iconWrap, { backgroundColor: item.color + '18' }]}>
                    <MaterialCommunityIcons name={item.icon} size={28} color={item.color} />
                  </View>
                  <Text style={styles.tileLabel}>{item.label}</Text>
                  <Text style={styles.tileDesc} numberOfLines={2}>{item.description}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: { backgroundColor: C.accent },
    headerTitle: { color: '#fff', fontWeight: '700' },
    scroll: { padding: 16 },
    section: { marginBottom: 20 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: {
      width: '47%',
      backgroundColor: C.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    tilePressed: { opacity: 0.7 },
    iconWrap: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    tileLabel: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 3 },
    tileDesc: { fontSize: 12, color: C.muted, lineHeight: 16 },
    alertBanner: { borderRadius: 14, padding: 14 },
  });
}
