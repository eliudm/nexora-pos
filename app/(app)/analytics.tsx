import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Text, Appbar, Card, Chip, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { salesQueries } from '../../src/db/sales';
import { useTheme } from '../../src/context/theme';
import dayjs from 'dayjs';

type Period = '7d' | '14d' | '30d';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W - 48; // full width minus padding

const PAYMENT_COLORS: Record<string, string> = {
  CASH: '#22c55e',
  MPESA: '#3b82f6',
  CREDIT: '#f59e0b',
  SPLIT: '#8b5cf6',
};

const CAT_COLORS = ['#1db8a0', '#6f67ff', '#f59e0b', '#e53935', '#22c55e', '#3b82f6', '#ec4899', '#64748b'];

export default function AnalyticsScreen() {
  const { colors: C } = useTheme();
  const [period, setPeriod] = useState<Period>('7d');

  const days = period === '7d' ? 7 : period === '14d' ? 14 : 30;
  const from = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD');
  const to = dayjs().format('YYYY-MM-DD');

  const fmt = (n: number) => `KES ${n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0)}`;
  const fmtFull = (n: number) => `KES ${(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

  const { data: trend } = useQuery({
    queryKey: ['trend', days],
    queryFn: () => salesQueries.getRevenueTrend(days),
  });

  const { data: hourly } = useQuery({
    queryKey: ['hourly', days],
    queryFn: () => salesQueries.getHourlySales(days),
  });

  const { data: topProducts } = useQuery({
    queryKey: ['top-products', from, to],
    queryFn: () => salesQueries.getTopProducts(from, to, 6),
  });

  const { data: paymentMix } = useQuery({
    queryKey: ['payment-mix', from, to],
    queryFn: () => salesQueries.getPaymentMix(from, to),
  });

  const { data: categorySales } = useQuery({
    queryKey: ['category-sales', from, to],
    queryFn: () => salesQueries.getCategorySales(from, to),
  });

  const { data: cashierSales } = useQuery({
    queryKey: ['cashier-sales', from, to],
    queryFn: () => salesQueries.getCashierSales(from, to),
  });

  // ---- KPI calculations ----
  const totalRevenue = (trend ?? []).reduce((s, d) => s + d.revenue, 0);
  const totalTransactions = (trend ?? []).reduce((s, d) => s + d.sales_count, 0);
  const avgOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
  const bestDay = (trend ?? []).reduce<{ date: string; revenue: number; sales_count: number } | null>(
    (best, d) => d.revenue > (best?.revenue ?? 0) ? d : best, null,
  );

  // ---- Line chart data (revenue trend) ----
  const trendData = (() => {
    if (!trend || trend.length === 0) return [];
    const map = new Map(trend.map(d => [d.date, d.revenue]));
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
      result.push({
        value: map.get(date) ?? 0,
        label: i % Math.ceil(days / 6) === 0 ? dayjs(date).format('D MMM') : '',
        dataPointText: '',
      });
    }
    return result;
  })();

  const maxTrend = Math.max(...trendData.map(d => d.value), 1);

  // ---- Hourly bar data ----
  const hourlyData = (() => {
    const map = new Map((hourly ?? []).map(h => [h.hour, h.revenue]));
    return Array.from({ length: 24 }, (_, h) => ({
      value: map.get(h) ?? 0,
      label: h % 4 === 0 ? `${h}h` : '',
      frontColor: h >= 8 && h <= 20 ? C.accent : C.border,
    }));
  })();

  // ---- Pie chart data (payment mix) ----
  const pieData = (paymentMix ?? []).map((p, i) => ({
    value: p.total,
    color: PAYMENT_COLORS[p.payment_method] ?? CAT_COLORS[i % CAT_COLORS.length],
    text: p.payment_method,
    label: `${p.payment_method}\n${fmtFull(p.total)}`,
  }));

  // ---- Top products bars ----
  const maxProductRev = Math.max(...(topProducts ?? []).map(p => p.total_revenue), 1);
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction color="#fff" onPress={() => router.back()} />
        <Appbar.Content title="Analytics" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {(['7d', '14d', '30d'] as Period[]).map((p) => (
          <Chip
            key={p}
            selected={period === p}
            onPress={() => setPeriod(p)}
            style={[styles.periodChip, period === p && styles.periodChipActive]}
            textStyle={[styles.periodText, period === p && styles.periodTextActive]}
            compact
          >
            {p === '7d' ? 'Last 7 days' : p === '14d' ? 'Last 14 days' : 'Last 30 days'}
          </Chip>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ---- KPI Row ---- */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <MaterialCommunityIcons name="cash-multiple" size={22} color={C.accent} />
            <Text style={styles.kpiVal}>{fmt(totalRevenue)}</Text>
            <Text style={styles.kpiLabel}>Revenue</Text>
          </View>
          <View style={styles.kpiCard}>
            <MaterialCommunityIcons name="receipt" size={22} color="#6f67ff" />
            <Text style={[styles.kpiVal, { color: '#6f67ff' }]}>{totalTransactions}</Text>
            <Text style={styles.kpiLabel}>Sales</Text>
          </View>
          <View style={styles.kpiCard}>
            <MaterialCommunityIcons name="cart-arrow-up" size={22} color="#f59e0b" />
            <Text style={[styles.kpiVal, { color: '#f59e0b' }]}>{fmt(avgOrderValue)}</Text>
            <Text style={styles.kpiLabel}>Avg Order</Text>
          </View>
          <View style={styles.kpiCard}>
            <MaterialCommunityIcons name="star" size={22} color="#22c55e" />
            <Text style={[styles.kpiVal, { color: '#22c55e', fontSize: 13 }]}>
              {bestDay ? dayjs(bestDay.date).format('D MMM') : '—'}
            </Text>
            <Text style={styles.kpiLabel}>Best Day</Text>
          </View>
        </View>

        {/* ---- Revenue Trend ---- */}
        <Card style={styles.card}>
          <Card.Title title="Revenue Trend" titleStyle={styles.cardTitle} subtitle={`Last ${days} days`} />
          <Card.Content>
            {trendData.length > 0 ? (
              <LineChart
                data={trendData}
                width={CHART_W - 24}
                height={160}
                color={C.accent}
                thickness={2.5}
                startFillColor={C.accent}
                endFillColor="transparent"
                startOpacity={0.18}
                endOpacity={0}
                areaChart
                hideDataPoints={days > 14}
                dataPointsColor={C.accent}
                dataPointsRadius={4}
                xAxisColor="#e0e0e0"
                yAxisColor="transparent"
                yAxisTextStyle={{ color: '#aaa', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#aaa', fontSize: 10 }}
                noOfSections={4}
                maxValue={maxTrend * 1.15}
                rulesColor="#f5f5f5"
                rulesType="solid"
                initialSpacing={8}
                spacing={(CHART_W - 48) / Math.max(trendData.length, 1)}
                curved
              />
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No sales data for this period</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* ---- Peak Hours ---- */}
        <Card style={styles.card}>
          <Card.Title title="Peak Selling Hours" titleStyle={styles.cardTitle} subtitle="When your store is busiest" />
          <Card.Content>
            <BarChart
              data={hourlyData}
              width={CHART_W - 24}
              height={130}
              barWidth={Math.floor((CHART_W - 60) / 24)}
              spacing={1}
              noOfSections={3}
              xAxisColor="#e0e0e0"
              yAxisColor="transparent"
              yAxisTextStyle={{ color: '#aaa', fontSize: 9 }}
              xAxisLabelTextStyle={{ color: '#aaa', fontSize: 9 }}
              hideRules
              barBorderRadius={2}
              isAnimated
            />
            <Text style={styles.chartNote}>Highlighted bars = business hours (8am–8pm)</Text>
          </Card.Content>
        </Card>

        {/* ---- Payment Mix ---- */}
        <Card style={styles.card}>
          <Card.Title title="Payment Mix" titleStyle={styles.cardTitle} subtitle="How customers pay" />
          <Card.Content>
            {pieData.length > 0 ? (
              <View style={styles.pieRow}>
                <PieChart
                  data={pieData}
                  radius={80}
                  innerRadius={48}
                  centerLabelComponent={() => (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: '#888' }}>Total</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#111' }}>{fmt(totalRevenue)}</Text>
                    </View>
                  )}
                  showText={false}
                  strokeWidth={2}
                  strokeColor="#fff"
                />
                <View style={styles.legend}>
                  {pieData.map((p, i) => (
                    <View key={i} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: p.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.legendLabel}>{p.text}</Text>
                        <Text style={styles.legendVal}>{fmtFull(p.value)}</Text>
                      </View>
                      <Text style={styles.legendPct}>
                        {((p.value / totalRevenue) * 100).toFixed(0)}%
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.empty}><Text style={styles.emptyText}>No payment data</Text></View>
            )}
          </Card.Content>
        </Card>

        {/* ---- Top Products ---- */}
        <Card style={styles.card}>
          <Card.Title title="Top Products" titleStyle={styles.cardTitle} subtitle="By revenue" />
          <Card.Content>
            {(topProducts ?? []).length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyText}>No product data</Text></View>
            ) : (
              (topProducts ?? []).map((p, i) => {
                const pct = p.total_revenue / maxProductRev;
                return (
                  <View key={i} style={styles.productRow}>
                    <View style={[styles.rank, { backgroundColor: i === 0 ? '#fbbf24' : i === 1 ? '#d1d5db' : i === 2 ? '#cd7c3b' : '#f5f5f5' }]}>
                      <Text style={[styles.rankNum, { color: i < 3 ? '#fff' : '#999' }]}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName} numberOfLines={1}>{p.product_name}</Text>
                      <View style={styles.barBg}>
                        <View style={[styles.bar, { width: `${pct * 100}%`, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }]} />
                      </View>
                    </View>
                    <View style={styles.productRight}>
                      <Text style={styles.productRev}>{fmt(p.total_revenue)}</Text>
                      <Text style={styles.productQty}>{p.total_qty} sold</Text>
                    </View>
                  </View>
                );
              })
            )}
          </Card.Content>
        </Card>

        {/* ---- Category Performance ---- */}
        <Card style={styles.card}>
          <Card.Title title="Category Performance" titleStyle={styles.cardTitle} subtitle="Revenue by product category" />
          <Card.Content>
            {(categorySales ?? []).length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyText}>No category data</Text></View>
            ) : (
              <BarChart
                data={(categorySales ?? []).map((c, i) => ({
                  value: c.revenue,
                  label: c.category_name.length > 8 ? c.category_name.slice(0, 7) + '…' : c.category_name,
                  frontColor: CAT_COLORS[i % CAT_COLORS.length],
                  topLabelComponent: () => (
                    <Text style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>{fmt(c.revenue)}</Text>
                  ),
                }))}
                width={CHART_W - 32}
                height={160}
                barWidth={Math.floor((CHART_W - 80) / Math.max((categorySales ?? []).length, 1))}
                spacing={8}
                noOfSections={4}
                xAxisColor="#e0e0e0"
                yAxisColor="transparent"
                yAxisTextStyle={{ color: '#aaa', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#555', fontSize: 9 }}
                barBorderRadius={4}
                isAnimated
                hideRules
              />
            )}
          </Card.Content>
        </Card>

        {/* ---- Cashier Performance ---- */}
        <Card style={styles.card}>
          <Card.Title title="Cashier Performance" titleStyle={styles.cardTitle} subtitle="Sales by staff member" />
          <Card.Content>
            {(cashierSales ?? []).length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyText}>No cashier data</Text></View>
            ) : (
              (cashierSales ?? []).map((c, i) => {
                const maxRev = Math.max(...(cashierSales ?? []).map(x => x.revenue), 1);
                return (
                  <View key={i} style={styles.cashierRow}>
                    <View style={[styles.avatar, { backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }]}>
                      <Text style={styles.avatarText}>{(c.cashier_name ?? '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={styles.cashierName}>{c.cashier_name}</Text>
                        <Text style={styles.cashierRev}>{fmtFull(c.revenue)}</Text>
                      </View>
                      <View style={styles.barBg}>
                        <View style={[styles.bar, { width: `${(c.revenue / maxRev) * 100}%`, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }]} />
                      </View>
                      <Text style={styles.cashierTx}>{c.count} transactions</Text>
                    </View>
                  </View>
                );
              })
            )}
          </Card.Content>
        </Card>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: { backgroundColor: C.accent },
    headerTitle: { color: '#fff', fontWeight: '700' },
    periodRow: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 4 },
    periodChip: { backgroundColor: C.elevated },
    periodChipActive: { backgroundColor: C.accent },
    periodText: { fontSize: 12 },
    periodTextActive: { color: '#fff', fontWeight: '600' },
    scroll: { padding: 12, paddingTop: 8 },
    kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    kpiCard: { flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 10, alignItems: 'center', elevation: 1 },
    kpiVal: { fontSize: 14, fontWeight: '800', color: C.accent, marginTop: 4 },
    kpiLabel: { fontSize: 10, color: C.muted, marginTop: 2, textAlign: 'center' },
    card: { borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
    empty: { alignItems: 'center', paddingVertical: 24 },
    emptyText: { color: C.muted, fontSize: 13 },
    chartNote: { fontSize: 10, color: C.muted, marginTop: 6 },
    pieRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    legend: { flex: 1, gap: 8 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendLabel: { fontSize: 12, color: C.text, fontWeight: '600' },
    legendVal: { fontSize: 11, color: C.muted },
    legendPct: { fontSize: 12, fontWeight: '700', color: C.muted, minWidth: 32, textAlign: 'right' },
    productRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
    rank: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    rankNum: { fontSize: 12, fontWeight: '800' },
    productName: { fontSize: 13, color: C.text, fontWeight: '600', marginBottom: 4 },
    barBg: { height: 6, backgroundColor: C.elevated, borderRadius: 3, overflow: 'hidden' },
    bar: { height: '100%', borderRadius: 3 },
    productRight: { alignItems: 'flex-end', minWidth: 70 },
    productRev: { fontSize: 13, fontWeight: '700', color: C.accent },
    productQty: { fontSize: 10, color: C.muted, marginTop: 2 },
    cashierRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    cashierName: { fontSize: 13, fontWeight: '600', color: C.text },
    cashierRev: { fontSize: 13, fontWeight: '700', color: C.accent },
    cashierTx: { fontSize: 10, color: C.muted, marginTop: 3 },
  });
}
