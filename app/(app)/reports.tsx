import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Appbar, Card, Chip, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { salesQueries } from '../../src/db/sales';
import { brand } from '../../src/theme';

type Period = 'today' | 'week' | 'month';

export default function ReportsScreen() {
  const [period, setPeriod] = useState<Period>('today');

  const ranges: Record<Period, { from: string; to: string }> = {
    today: { from: dayjs().format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
    week: { from: dayjs().startOf('week').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
    month: { from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
  };

  const { from, to } = ranges[period];

  const { data: summary, refetch, isRefetching } = useQuery({
    queryKey: ['daily-summary', period],
    queryFn: () => salesQueries.getDailySummary(from),
    enabled: period === 'today',
  });

  const { data: sales, refetch: refetchSales } = useQuery({
    queryKey: ['sales-report', from, to],
    queryFn: () => salesQueries.getAll(from, to, 500),
  });

  const { data: topProducts } = useQuery({
    queryKey: ['top-products-report', from, to],
    queryFn: () => salesQueries.getTopProducts(from, to, 10),
  });

  const { data: trend } = useQuery({
    queryKey: ['trend-report', period],
    queryFn: () => salesQueries.getRevenueTrend(period === 'today' ? 1 : period === 'week' ? 7 : 30),
  });

  const totalRevenue = (sales ?? []).reduce((s, x) => s + x.total, 0);
  const totalVAT = (sales ?? []).reduce((s, x) => s + x.tax_amount, 0);
  const cashTotal = (sales ?? []).filter((x) => x.payment_method === 'CASH').reduce((s, x) => s + x.total, 0);
  const mpesaTotal = (sales ?? []).filter((x) => x.payment_method === 'MPESA').reduce((s, x) => s + x.total, 0);
  const creditTotal = (sales ?? []).filter((x) => x.payment_method === 'CREDIT').reduce((s, x) => s + x.total, 0);

  const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

  const onRefresh = () => { refetch(); refetchSales(); };

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Reports" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <View style={styles.tabs}>
        {(['today', 'week', 'month'] as Period[]).map((p) => (
          <Chip
            key={p}
            selected={period === p}
            onPress={() => setPeriod(p)}
            style={[styles.tab, period === p && styles.tabActive]}
            textStyle={[styles.tabText, period === p && styles.tabTextActive]}
          >
            {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
          </Chip>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} colors={[brand.primary]} />}
      >
        {/* Revenue Summary */}
        <Card style={styles.card}>
          <Card.Title title="Revenue Summary" titleStyle={styles.cardTitle} />
          <Card.Content>
            <View style={styles.bigStat}>
              <Text style={styles.bigVal}>{fmt(totalRevenue)}</Text>
              <Text style={styles.bigLabel}>Total Revenue</Text>
            </View>
            <Divider style={{ marginVertical: 12 }} />
            <View style={styles.statsRow}>
              <View style={styles.stat}><Text style={styles.statVal}>{(sales ?? []).length}</Text><Text style={styles.statLabel}>Sales</Text></View>
              <View style={styles.stat}><Text style={[styles.statVal, { color: '#f59e0b' }]}>{fmt(totalVAT)}</Text><Text style={styles.statLabel}>VAT</Text></View>
              <View style={styles.stat}><Text style={[styles.statVal, { color: '#888' }]}>{fmt(totalRevenue - totalVAT)}</Text><Text style={styles.statLabel}>Ex-VAT</Text></View>
            </View>
          </Card.Content>
        </Card>

        {/* Payment Breakdown */}
        <Card style={styles.card}>
          <Card.Title title="Payment Methods" titleStyle={styles.cardTitle} />
          <Card.Content>
            {[
              { label: 'Cash', value: cashTotal, color: '#22c55e' },
              { label: 'M-Pesa', value: mpesaTotal, color: '#f59e0b' },
              { label: 'Credit', value: creditTotal, color: '#6f67ff' },
            ].map(({ label, value, color }) => {
              const pct = totalRevenue > 0 ? (value / totalRevenue) * 100 : 0;
              return (
                <View key={label} style={styles.pmRow}>
                  <Text style={styles.pmLabel}>{label}</Text>
                  <View style={styles.barBg}>
                    <View style={[styles.bar, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={[styles.pmVal, { color }]}>{fmt(value)}</Text>
                </View>
              );
            })}
          </Card.Content>
        </Card>

        {/* Top Products */}
        {(topProducts?.length ?? 0) > 0 && (
          <Card style={styles.card}>
            <Card.Title title="Top Products" titleStyle={styles.cardTitle} />
            <Card.Content>
              {topProducts!.map((p, i) => (
                <View key={p.product_name} style={styles.productRow}>
                  <View style={[styles.rank, { backgroundColor: i < 3 ? brand.primary : '#eee' }]}>
                    <Text style={[styles.rankNum, { color: i < 3 ? '#fff' : '#666' }]}>{i + 1}</Text>
                  </View>
                  <Text style={styles.productName} numberOfLines={1}>{p.product_name}</Text>
                  <View style={styles.productRight}>
                    <Text style={styles.productQty}>{p.total_qty} sold</Text>
                    <Text style={styles.productRev}>{fmt(p.total_revenue)}</Text>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}

        {/* Daily Trend */}
        {(trend?.length ?? 0) > 0 && (
          <Card style={styles.card}>
            <Card.Title title="Daily Revenue" titleStyle={styles.cardTitle} />
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
  tabs: { flexDirection: 'row', padding: 12, gap: 8 },
  tab: { backgroundColor: '#f0f0f0', flex: 1, justifyContent: 'center' },
  tabActive: { backgroundColor: brand.primary },
  tabText: { fontSize: 12, textAlign: 'center' },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  scroll: { flex: 1 },
  card: { marginHorizontal: 12, marginBottom: 12, borderRadius: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  bigStat: { alignItems: 'center', paddingVertical: 8 },
  bigVal: { fontSize: 32, fontWeight: '800', color: brand.primary },
  bigLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: '700', color: brand.primary },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  pmRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pmLabel: { width: 56, fontSize: 13, color: '#444' },
  barBg: { flex: 1, height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, marginHorizontal: 8, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4 },
  pmVal: { width: 90, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  productRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rankNum: { fontSize: 12, fontWeight: '700' },
  productName: { flex: 1, fontSize: 13, color: '#222' },
  productRight: { alignItems: 'flex-end' },
  productQty: { fontSize: 11, color: '#888' },
  productRev: { fontSize: 13, fontWeight: '700', color: brand.primary },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  trendDate: { width: 44, fontSize: 12, color: '#666' },
  trendVal: { width: 90, fontSize: 11, color: '#444', textAlign: 'right' },
});
