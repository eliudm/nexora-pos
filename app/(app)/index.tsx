import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Card, Appbar, Chip } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { salesQueries } from '../../src/db/sales';
import { getBusinessInfo } from '../../src/db/settings';
import { brand } from '../../src/theme';

export default function DashboardScreen() {
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

  const onRefresh = useCallback(() => {
    refetchSummary();
  }, [refetchSummary]);

  const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

  const statCards = [
    { label: "Today's Sales", value: String(summary?.total_sales ?? 0), icon: 'cart', color: brand.primary },
    { label: "Today's Revenue", value: fmt(summary?.total_revenue ?? 0), icon: 'cash-multiple', color: '#6f67ff' },
    { label: 'Cash', value: fmt(summary?.cash_total ?? 0), icon: 'cash', color: '#22c55e' },
    { label: 'M-Pesa', value: fmt(summary?.mpesa_total ?? 0), icon: 'cellphone', color: '#f59e0b' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content
          title={bizInfo?.name ?? 'Nexora POS'}
          subtitle={dayjs().format('dddd, D MMM YYYY')}
          titleStyle={styles.headerTitle}
          subtitleStyle={styles.headerSub}
        />
        <Chip style={styles.dateBadge} textStyle={styles.dateText} compact>Today</Chip>
      </Appbar.Header>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} colors={[brand.primary]} />}
      >
        <View style={styles.statsGrid}>
          {statCards.map((s) => (
            <Card key={s.label} style={styles.statCard}>
              <Card.Content style={styles.statContent}>
                <MaterialCommunityIcons name={s.icon as any} size={28} color={s.color} />
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </Card.Content>
            </Card>
          ))}
        </View>

        {(topProducts?.length ?? 0) > 0 && (
          <Card style={styles.card}>
            <Card.Title title="Top Products (7 days)" titleStyle={styles.cardTitle} />
            <Card.Content>
              {topProducts!.map((p, i) => (
                <View key={p.product_name} style={styles.productRow}>
                  <View style={[styles.rank, { backgroundColor: i === 0 ? brand.primary : '#eee' }]}>
                    <Text style={[styles.rankText, { color: i === 0 ? '#fff' : '#666' }]}>{i + 1}</Text>
                  </View>
                  <Text style={styles.productName} numberOfLines={1}>{p.product_name}</Text>
                  <View style={styles.productStats}>
                    <Text style={styles.productQty}>{p.total_qty} sold</Text>
                    <Text style={styles.productRev}>{fmt(p.total_revenue)}</Text>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}

        {(trend?.length ?? 0) > 0 && (
          <Card style={styles.card}>
            <Card.Title title="Revenue Trend (7 days)" titleStyle={styles.cardTitle} />
            <Card.Content>
              {trend!.map((t) => {
                const max = Math.max(...trend!.map((x) => x.revenue), 1);
                const pct = (t.revenue / max) * 100;
                return (
                  <View key={t.date} style={styles.trendRow}>
                    <Text style={styles.trendDate}>{dayjs(t.date).format('ddd D')}</Text>
                    <View style={styles.barBg}>
                      <View style={[styles.bar, { width: `${pct}%`, backgroundColor: brand.primary }]} />
                    </View>
                    <Text style={styles.trendVal}>{fmt(t.revenue)}</Text>
                  </View>
                );
              })}
            </Card.Content>
          </Card>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: brand.primary },
  headerTitle: { color: '#fff', fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  dateBadge: { backgroundColor: 'rgba(255,255,255,0.2)', marginRight: 8 },
  dateText: { color: '#fff', fontSize: 11 },
  scroll: { flex: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 },
  statCard: { flex: 1, minWidth: '44%', borderRadius: 12 },
  statContent: { alignItems: 'center', paddingVertical: 16 },
  statValue: { fontSize: 20, fontWeight: '800', marginTop: 8, color: '#111' },
  statLabel: { fontSize: 11, color: '#666', marginTop: 2, textAlign: 'center' },
  card: { marginHorizontal: 16, marginBottom: 16, borderRadius: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  productRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rankText: { fontSize: 12, fontWeight: '700' },
  productName: { flex: 1, fontSize: 14, color: '#222' },
  productStats: { alignItems: 'flex-end' },
  productQty: { fontSize: 11, color: '#888' },
  productRev: { fontSize: 13, fontWeight: '700', color: brand.primary },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  trendDate: { width: 44, fontSize: 12, color: '#666' },
  barBg: { flex: 1, height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, marginHorizontal: 8, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4 },
  trendVal: { width: 80, fontSize: 11, color: '#444', textAlign: 'right' },
});
