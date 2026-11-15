import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Text, Appbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../src/context/theme';

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
    title: 'Purchasing',
    items: [
      { label: 'Purchase Orders', description: 'Order stock from suppliers', icon: 'file-document-outline', route: '/purchase-orders', color: '#6f67ff' },
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

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="More" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll}>
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
  });
}
