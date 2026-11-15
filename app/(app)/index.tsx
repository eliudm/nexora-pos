import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { Text, Chip } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { salesQueries } from '../../src/db/sales';
import { getBusinessInfo } from '../../src/db/settings';
import { useTheme } from '../../src/context/theme';

export default function DashboardScreen() {
  const { colors: D } = useTheme();
  const today = dayjs().format('YYYY-MM-DD');
  const weekStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');

  const { data: summary, refetch: refetchSummary, isRefetching } = useQuery({
    queryKey: ['daily-summary', today],
    queryFn: () => salesQueries.getDailySummary(today),
  });

  const { data: topProducts } = useQuery({
    queryKey: ['top-products', weekStart, today],
    queryFn: () => salesQueries.getTopProducts(weekStart, today, 5),
  });

  const { data: trend } = useQuery({
    queryKey: ['trend', 7],
    queryFn: () => salesQueries.getRevenueTrend(7),
  });

  const { data: bizInfo } = useQuery({
    queryKey: ['biz-info'],
    queryFn: getBusinessInfo,
  });

  const onRefresh = useCallback(() => { refetchSummary(); }, [refetchSummary]);
  const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

  const statCards = [
    { label: "Today's Sales",   value: String(summary?.total_sales ?? 0),   icon: 'cart',         color: D.accent,   route: '/(app)/sales'   },
    { label: "Today's Revenue", value: fmt(summary?.total_revenue ?? 0),     icon: 'cash-multiple', color: D.accent2,  route: '/(app)/reports' },
    { label: 'Cash',            value: fmt(summary?.cash_total ?? 0),        icon: 'cash',          color: D.success,  route: '/(app)/sales'   },
    { label: 'M-Pesa',          value: fmt(summary?.mpesa_total ?? 0),       icon: 'cellphone',     color: D.warning,  route: '/(app)/sales'   },
  ];

  const quickLinks = [
    { label: 'New Sale',    icon: 'cash-register',      color: D.accent,  route: '/(app)/pos'            },
    { label: 'Products',    icon: 'package-variant',    color: D.accent2, route: '/(app)/products'       },
    { label: 'Customers',   icon: 'account-group',      color: D.success, route: '/(app)/customers'      },
    { label: 'Suppliers',   icon: 'truck-delivery',     color: D.warning, route: '/(app)/suppliers'      },
    { label: 'Expenses',    icon: 'receipt',            color: D.danger,  route: '/(app)/expenses'       },
    { label: 'Stocktake',   icon: 'clipboard-list',     color: '#a78bfa', route: '/(app)/stocktake'      },
    { label: 'Reports',     icon: 'chart-bar',          color: D.accent,  route: '/(app)/reports'        },
    { label: 'Analytics',   icon: 'chart-line',         color: D.accent2, route: '/(app)/analytics'      },
  ];

  const trendMax = Math.max(...(trend ?? []).map((x) => x.revenue), 1);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: D.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: D.surface, borderBottomColor: D.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.bizName, { color: D.text }]} numberOfLines={1}>
            {bizInfo?.name ?? 'Nexora POS'}
          </Text>
          <Text style={[styles.dateText, { color: D.muted }]}>
            {dayjs().format('dddd, D MMM YYYY')}
          </Text>
        </View>
        <Pressable
          style={[styles.posBtn, { backgroundColor: D.accent }]}
          onPress={() => router.push('/(app)/pos')}
        >
          <MaterialCommunityIcons name="cash-register" size={16} color="#fff" />
          <Text style={styles.posBtnText}>Open POS</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} colors={[D.accent]} />}
      >
        {/* Stat Cards */}
        <View style={styles.statsGrid}>
          {statCards.map((s) => (
            <Pressable
              key={s.label}
              style={({ pressed }) => [
                styles.statCard,
                { backgroundColor: D.surface, borderColor: D.border },
                pressed && { backgroundColor: D.elevated },
              ]}
              onPress={() => router.push(s.route as any)}
            >
              <View style={[styles.statIconWrap, { backgroundColor: s.color + '22' }]}>
                <MaterialCommunityIcons name={s.icon as any} size={22} color={s.color} />
              </View>
              <Text style={[styles.statValue, { color: D.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: D.muted }]}>{s.label}</Text>
              <MaterialCommunityIcons name="chevron-right" size={14} color={D.border} style={styles.statArrow} />
            </Pressable>
          ))}
        </View>

        {/* Quick Links */}
        <Text style={[styles.sectionTitle, { color: D.muted }]}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          {quickLinks.map((q) => (
            <Pressable
              key={q.label}
              style={({ pressed }) => [
                styles.quickCard,
                { backgroundColor: D.surface, borderColor: D.border },
                pressed && { backgroundColor: D.elevated },
              ]}
              onPress={() => router.push(q.route as any)}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: q.color + '22' }]}>
                <MaterialCommunityIcons name={q.icon as any} size={24} color={q.color} />
              </View>
              <Text style={[styles.quickLabel, { color: D.text }]}>{q.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Top Products */}
        {(topProducts?.length ?? 0) > 0 && (
          <Pressable
            style={[styles.card, { backgroundColor: D.surface, borderColor: D.border }]}
            onPress={() => router.push('/(app)/analytics')}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: D.text }]}>Top Products</Text>
              <Text style={[styles.cardSub, { color: D.muted }]}>7 days</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={D.muted} />
            </View>
            {topProducts!.map((p, i) => (
              <View key={p.product_name} style={[styles.productRow, { borderBottomColor: D.border }]}>
                <View style={[styles.rank, { backgroundColor: i === 0 ? D.accent : D.elevated }]}>
                  <Text style={[styles.rankText, { color: i === 0 ? '#fff' : D.muted }]}>{i + 1}</Text>
                </View>
                <Text style={[styles.productName, { color: D.text }]} numberOfLines={1}>{p.product_name}</Text>
                <View style={styles.productStats}>
                  <Text style={[styles.productQty, { color: D.muted }]}>{p.total_qty} sold</Text>
                  <Text style={[styles.productRev, { color: D.accent }]}>{fmt(p.total_revenue)}</Text>
                </View>
              </View>
            ))}
          </Pressable>
        )}

        {/* Revenue Trend */}
        {(trend?.length ?? 0) > 0 && (
          <Pressable
            style={[styles.card, { backgroundColor: D.surface, borderColor: D.border }]}
            onPress={() => router.push('/(app)/reports')}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: D.text }]}>Revenue Trend</Text>
              <Text style={[styles.cardSub, { color: D.muted }]}>7 days</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={D.muted} />
            </View>
            {trend!.map((t) => (
              <View key={t.date} style={styles.trendRow}>
                <Text style={[styles.trendDate, { color: D.muted }]}>{dayjs(t.date).format('ddd D')}</Text>
                <View style={[styles.barBg, { backgroundColor: D.elevated }]}>
                  <View style={[styles.bar, { width: `${(t.revenue / trendMax) * 100}%`, backgroundColor: D.accent }]} />
                </View>
                <Text style={[styles.trendVal, { color: D.muted }]}>{fmt(t.revenue)}</Text>
              </View>
            ))}
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  bizName: { fontSize: 17, fontWeight: '800' },
  dateText: { fontSize: 12, marginTop: 2 },
  posBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  posBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  statCard: { flex: 1, minWidth: '44%', borderRadius: 14, padding: 14, borderWidth: 1 },
  statIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', marginTop: 10 },
  statLabel: { fontSize: 11, marginTop: 3 },
  statArrow: { position: 'absolute', top: 10, right: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 16, marginBottom: 10, textTransform: 'uppercase' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10, marginBottom: 20 },
  quickCard: { width: '22%', flexGrow: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  quickIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 11, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  card: { marginHorizontal: 12, marginBottom: 14, borderRadius: 14, padding: 14, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  cardSub: { fontSize: 11, marginRight: 4 },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  rank: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rankText: { fontSize: 12, fontWeight: '700' },
  productName: { flex: 1, fontSize: 13, fontWeight: '500' },
  productStats: { alignItems: 'flex-end' },
  productQty: { fontSize: 11 },
  productRev: { fontSize: 13, fontWeight: '700', marginTop: 1 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  trendDate: { width: 44, fontSize: 12 },
  barBg: { flex: 1, height: 8, borderRadius: 4, marginHorizontal: 8, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4 },
  trendVal: { width: 80, fontSize: 11, textAlign: 'right' },
});
