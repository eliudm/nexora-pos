import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert, TextInput as RNTextInput } from 'react-native';
import { Text, Appbar, Card, Chip, Divider, Menu, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import dayjs from 'dayjs';
import { salesQueries } from '../../../src/db/sales';
import { productQueries } from '../../../src/db/products';
import { customerQueries } from '../../../src/db/customers';
import { cashDrawerQueries } from '../../../src/db/cash_drawer';
import { shiftQueries } from '../../../src/db/shifts';
import { getBusinessInfo } from '../../../src/db/settings';
import { vendorBillQueries } from '../../../src/db/vendor_bills';
import { useTheme } from '../../../src/context/theme';

type Period = 'today' | 'week' | 'month';
type ReportTab = 'sales' | 'profit' | 'stock' | 'customers' | 'vat' | 'reconcile';

export default function ReportsScreen() {
  const { colors: C } = useTheme();
  const [period, setPeriod] = useState<Period>('today');
  const [reportTab, setReportTab] = useState<ReportTab>('sales');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [actualCash, setActualCash] = useState('');

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

  const { data: bizInfo } = useQuery({ queryKey: ['biz-info'], queryFn: getBusinessInfo });

  const { data: trend } = useQuery({
    queryKey: ['trend-report', period],
    queryFn: () => salesQueries.getRevenueTrend(period === 'today' ? 1 : period === 'week' ? 7 : 30),
  });

  const { data: allProducts } = useQuery({
    queryKey: ['products-report'],
    queryFn: () => productQueries.getAll(),
    enabled: reportTab === 'stock' || reportTab === 'profit',
  });

  const { data: cogsData } = useQuery({
    queryKey: ['cogs-report', from, to],
    queryFn: () => salesQueries.getCOGS(from, to),
    enabled: reportTab === 'profit',
  });

  const { data: inputVATData } = useQuery({
    queryKey: ['input-vat-report', from, to],
    queryFn: () => vendorBillQueries.getInputVAT(from, to),
    enabled: reportTab === 'vat' || reportTab === 'profit',
  });

  const { data: allCustomers } = useQuery({
    queryKey: ['customers-report'],
    queryFn: () => customerQueries.getAll(),
    enabled: reportTab === 'customers',
  });

  const { data: drawerBalance } = useQuery({
    queryKey: ['drawer-balance-report'],
    queryFn: cashDrawerQueries.getCurrentBalance,
    enabled: reportTab === 'reconcile',
  });

  const { data: openShift } = useQuery({
    queryKey: ['open-shift-report'],
    queryFn: shiftQueries.getOpen,
    enabled: reportTab === 'reconcile',
  });

  // Reconcile always uses today regardless of the period selector
  const reconToday = dayjs().format('YYYY-MM-DD');
  const { data: reconSalesRaw } = useQuery({
    queryKey: ['sales-reconcile', reconToday],
    queryFn: () => salesQueries.getAll(reconToday, reconToday, 500),
    enabled: reportTab === 'reconcile',
  });

  // Exclude VOIDED (REVERSED + REVERSAL pairs net to zero naturally)
  const reconSales = (reconSalesRaw ?? []).filter(s => s.status !== 'VOIDED');
  const expectedCash = reconSales.filter(s => s.payment_method === 'CASH').reduce((a, s) => a + s.total, 0)
    + reconSales.filter(s => s.payment_method === 'SPLIT').reduce((a, s) => a + ((s as any).split_cash ?? 0), 0);
  const expectedMpesa = reconSales.filter(s => s.payment_method === 'MPESA').reduce((a, s) => a + s.total, 0)
    + reconSales.filter(s => s.payment_method === 'SPLIT').reduce((a, s) => a + ((s as any).split_mpesa ?? 0), 0);
  const expectedCredit = reconSales.filter(s => s.payment_method === 'CREDIT').reduce((a, s) => a + s.total, 0);
  // Expected drawer = opening float + cash sales + net petty cash movements
  const expectedDrawer = (openShift?.opening_cash ?? 0) + expectedCash + (drawerBalance ?? 0);
  const cashVariance = (parseFloat(actualCash) || 0) - expectedDrawer;

  const totalCOGS = cogsData ?? 0;
  const inputVAT = inputVATData ?? 0;

  // Products where buying price >= selling price — sold at a loss.
  // Both prices are VAT-inclusive; profit = (price - cost) / (1 + vat_rate/100).
  const productsAtRisk = (allProducts ?? []).filter((p) => {
    if (!p.cost || !p.price || p.cost <= 0 || p.price <= 0) return false;
    return p.cost >= p.price;
  });

  // Stock valuation
  const stockAtCost = (allProducts ?? []).filter((p) => p.track_stock).reduce((s, p) => s + p.cost * p.stock_qty, 0);
  const stockAtSell = (allProducts ?? []).filter((p) => p.track_stock).reduce((s, p) => s + p.price * p.stock_qty, 0);
  const lowStockItems = (allProducts ?? []).filter((p) => p.track_stock && p.stock_qty <= ((p as any).low_stock_threshold ?? 5) && p.stock_qty > 0);
  const outOfStockItems = (allProducts ?? []).filter((p) => p.track_stock && p.stock_qty <= 0);

  // Customer debt
  const debtCustomers = (allCustomers ?? []).filter((c) => c.credit_balance < 0);
  const totalDebt = debtCustomers.reduce((s, c) => s + Math.abs(c.credit_balance), 0);

  // Include PAID + REVERSAL (negative totals) in financial totals — matches getCOGS filter
  const paidSales = (sales ?? []).filter((x) => x.status === 'PAID' || x.status === 'REVERSAL');
  const totalRevenue = paidSales.reduce((s, x) => s + x.total, 0);
  const totalVAT = paidSales.reduce((s, x) => s + x.tax_amount, 0);
  const revenueExVAT = totalRevenue - totalVAT;
  const grossProfit = revenueExVAT - totalCOGS;
  const netVATToKRA = totalVAT - inputVAT;
  const cashTotal = paidSales.filter((x) => x.payment_method === 'CASH').reduce((s, x) => s + x.total, 0);
  const mpesaTotal = paidSales.filter((x) => x.payment_method === 'MPESA').reduce((s, x) => s + x.total, 0);
  const creditTotal = paidSales.filter((x) => x.payment_method === 'CREDIT').reduce((s, x) => s + x.total, 0);

  const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

  const onRefresh = () => { refetch(); refetchSales(); };

  const exportPDF = async () => {
    setExportMenuOpen(false);
    const label = period === 'today' ? 'Today' : period === 'week' ? 'This Week' : 'This Month';
    const topRows = (topProducts ?? []).map((p, i) =>
      `<tr><td>${i + 1}</td><td>${p.product_name}</td><td>${p.total_qty}</td><td>KES ${fmt(p.total_revenue)}</td></tr>`
    ).join('');
    const html = `
      <html><body style="font-family:sans-serif;padding:24px;max-width:700px;margin:0 auto">
        <h1 style="color:#1db8a0">${bizInfo?.name ?? 'Nexora POS'} — Sales Report</h1>
        <p style="color:#666">Period: <b>${label}</b> (${from} to ${to})</p>
        <hr/>
        <h2>Summary</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px;border:1px solid #eee">Total Sales</td><td style="padding:6px;border:1px solid #eee;font-weight:bold">${(sales ?? []).length}</td></tr>
          <tr><td style="padding:6px;border:1px solid #eee">Total Revenue</td><td style="padding:6px;border:1px solid #eee;font-weight:bold">${fmt(totalRevenue)}</td></tr>
          <tr><td style="padding:6px;border:1px solid #eee">VAT Collected</td><td style="padding:6px;border:1px solid #eee">${fmt(totalVAT)}</td></tr>
          <tr><td style="padding:6px;border:1px solid #eee">Cash</td><td style="padding:6px;border:1px solid #eee">${fmt(cashTotal)}</td></tr>
          <tr><td style="padding:6px;border:1px solid #eee">M-Pesa</td><td style="padding:6px;border:1px solid #eee">${fmt(mpesaTotal)}</td></tr>
          <tr><td style="padding:6px;border:1px solid #eee">Credit</td><td style="padding:6px;border:1px solid #eee">${fmt(creditTotal)}</td></tr>
        </table>
        <h2>Top Products</h2>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f5f5f5"><th style="padding:6px;border:1px solid #eee;text-align:left">#</th><th style="padding:6px;border:1px solid #eee;text-align:left">Product</th><th style="padding:6px;border:1px solid #eee">Qty</th><th style="padding:6px;border:1px solid #eee">Revenue</th></tr></thead>
          <tbody>${topRows}</tbody>
        </table>
        <p style="color:#aaa;font-size:11px;margin-top:24px">Generated by Nexora POS on ${dayjs().format('D MMM YYYY HH:mm')}</p>
      </body></html>
    `;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Report PDF' });
  };

  const exportCSV = async () => {
    setExportMenuOpen(false);
    const header = 'Invoice No,Date,Customer,Payment,Total,VAT\n';
    const rows = (sales ?? []).map((s) =>
      `${s.invoice_no},${dayjs(s.created_at).format('YYYY-MM-DD HH:mm')},${s.customer_name ?? ''},${s.payment_method},${s.total.toFixed(2)},${s.tax_amount.toFixed(2)}`
    ).join('\n');
    const csv = header + rows;
    const path = `${FileSystem.cacheDirectory}nexora_report_${period}_${dayjs().format('YYYYMMDD')}.csv`;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Share Report CSV' });
  };
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Reports" titleStyle={styles.headerTitle} />
        <Menu
          visible={exportMenuOpen}
          onDismiss={() => setExportMenuOpen(false)}
          anchor={<Appbar.Action icon="export" color="#fff" onPress={() => setExportMenuOpen(true)} />}
        >
          <Menu.Item onPress={exportPDF} title="Export PDF" leadingIcon="file-pdf-box" />
          <Menu.Item onPress={exportCSV} title="Export CSV" leadingIcon="file-delimited" />
        </Menu>
      </Appbar.Header>

      {/* Report Type Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reportTabsScroll} contentContainerStyle={styles.reportTabsContent}>
        {([
          { key: 'sales', label: 'Sales' },
          { key: 'profit', label: 'Profit/Loss' },
          { key: 'stock', label: 'Stock Value' },
          { key: 'customers', label: 'Customer Debt' },
          { key: 'vat', label: 'VAT Report' },
          { key: 'reconcile', label: 'Reconcile' },
        ] as { key: ReportTab; label: string }[]).map((t) => (
          <Chip
            key={t.key}
            selected={reportTab === t.key}
            onPress={() => setReportTab(t.key)}
            style={[styles.reportTab, reportTab === t.key && styles.reportTabActive]}
            textStyle={[styles.tabText, reportTab === t.key && styles.tabTextActive]}
            compact
          >
            {t.label}
          </Chip>
        ))}
      </ScrollView>

      {/* Period Filter (only for time-sensitive reports) */}
      {(['sales', 'profit', 'vat', 'reconcile'] as ReportTab[]).includes(reportTab) && (
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
      )}

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} colors={[C.accent]} />}
      >
        {/* ---- Sales Report ---- */}
        {reportTab === 'sales' && (<>
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
                <View key={`${p.product_name}-${i}`} style={styles.productRow}>
                  <View style={[styles.rank, { backgroundColor: i < 3 ? C.accent : C.elevated }]}>
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
                      <View style={[styles.bar, { width: `${pct}%`, backgroundColor: C.accent }]} />
                    </View>
                    <Text style={styles.trendVal}>{fmt(t.revenue)}</Text>
                  </View>
                );
              })}
            </Card.Content>
          </Card>
        )}
        </>)}

        {/* ---- Profit / Loss ---- */}
        {reportTab === 'profit' && (
          <>
            <Card style={styles.card}>
              <Card.Title title="Profit & Loss" titleStyle={styles.cardTitle} />
              <Card.Content>
                <View style={styles.bigStat}>
                  <Text style={[styles.bigVal, { color: grossProfit >= 0 ? '#22c55e' : '#e53935' }]}>
                    {grossProfit < 0 ? '-' : ''}KES {Math.abs(grossProfit).toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                  </Text>
                  <Text style={styles.bigLabel}>
                    Gross Profit (est.) {revenueExVAT > 0 ? `· ${((grossProfit / revenueExVAT) * 100).toFixed(1)}% margin` : ''}
                  </Text>
                </View>
                {grossProfit < 0 && totalCOGS > 0 && (
                  <View style={{ backgroundColor: '#fff3cd', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: '#856404', fontWeight: '700', marginBottom: 4 }}>
                      ⚠ Selling at a loss — buying price exceeds selling price
                    </Text>
                    <Text style={{ fontSize: 12, color: '#856404' }}>
                      Both your buying and selling prices include VAT. Profit = (Selling − Buying) ÷ 1.16. As long as your selling price is higher than your buying price, you make a profit. Check the "Pricing Check" card below for affected products.
                    </Text>
                  </View>
                )}
                <Divider style={{ marginVertical: 12 }} />
                {[
                  { label: 'Revenue (incl. VAT)', value: totalRevenue, color: C.accent },
                  { label: 'Output VAT (payable)', value: -totalVAT, color: '#f59e0b' },
                  { label: 'Revenue (excl. VAT)', value: revenueExVAT, color: '#3b82f6' },
                  { label: 'Est. Cost of Goods Sold', value: -totalCOGS, color: '#e53935' },
                ].map(({ label, value, color }) => (
                  <View key={label} style={styles.plRow}>
                    <Text style={styles.plLabel}>{label}</Text>
                    <Text style={[styles.plVal, { color }]}>{value >= 0 ? '' : '-'}KES {Math.abs(value).toLocaleString('en-KE', { maximumFractionDigits: 0 })}</Text>
                  </View>
                ))}
              </Card.Content>
            </Card>
            <Card style={styles.card}>
              <Card.Title title="VAT Position" titleStyle={styles.cardTitle} />
              <Card.Content>
                <View style={styles.plRow}>
                  <Text style={styles.plLabel}>Output VAT (from sales)</Text>
                  <Text style={[styles.plVal, { color: '#f59e0b' }]}>{fmt(totalVAT)}</Text>
                </View>
                <View style={styles.plRow}>
                  <Text style={styles.plLabel}>Input VAT (from purchases)</Text>
                  <Text style={[styles.plVal, { color: '#22c55e' }]}>{fmt(inputVAT)}</Text>
                </View>
                <Divider style={{ marginVertical: 8 }} />
                <View style={styles.plRow}>
                  <Text style={[styles.plLabel, { fontWeight: '700', color: C.text }]}>Net VAT Payable to KRA</Text>
                  <Text style={[styles.plVal, { color: netVATToKRA >= 0 ? '#e53935' : '#22c55e' }]}>
                    {fmt(Math.abs(netVATToKRA))}
                    {netVATToKRA < 0 ? ' (credit)' : ''}
                  </Text>
                </View>
              </Card.Content>
            </Card>

            {/* Pricing Check — products sold at a loss after VAT */}
            <Card style={styles.card}>
              <Card.Title
                title={productsAtRisk.length > 0 ? `⚠ Pricing Check (${productsAtRisk.length} issue${productsAtRisk.length !== 1 ? 's' : ''})` : '✓ Pricing Check'}
                titleStyle={[styles.cardTitle, { color: productsAtRisk.length > 0 ? '#e53935' : '#22c55e' }]}
              />
              <Card.Content>
                <Text style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
                  Both buying and selling prices are VAT-inclusive. You reclaim input VAT on purchases. Profit per unit = (Sell − Buy) ÷ (1 + VAT rate). A product is at risk only when its buying price ≥ selling price.
                </Text>
                {productsAtRisk.length === 0 ? (
                  <Text style={{ fontSize: 13, color: '#22c55e' }}>All products are priced above their buying price. ✓</Text>
                ) : (
                  productsAtRisk.map((p) => {
                    const vatFactor = (p.vat_rate ?? 16) / 100;
                    const lossPerUnit = (p.price - p.cost) / (1 + vatFactor); // negative
                    return (
                      <View key={p.id} style={{ marginBottom: 10, padding: 8, backgroundColor: '#fff5f5', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#e53935' }}>
                        <Text style={{ fontWeight: '700', fontSize: 13, color: C.text }}>{p.name}</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text style={{ fontSize: 12, color: C.muted }}>Buying price (VAT-incl.)</Text>
                          <Text style={{ fontSize: 12, color: '#e53935' }}>KES {p.cost.toLocaleString('en-KE', { maximumFractionDigits: 0 })}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 12, color: C.muted }}>Selling price (VAT-incl.)</Text>
                          <Text style={{ fontSize: 12, color: C.text }}>KES {p.price.toLocaleString('en-KE', { maximumFractionDigits: 0 })}</Text>
                        </View>
                        <Divider style={{ marginVertical: 4 }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 12, color: '#e53935', fontWeight: '700' }}>Loss per unit (after VAT)</Text>
                          <Text style={{ fontSize: 12, color: '#e53935', fontWeight: '700' }}>KES {lossPerUnit.toLocaleString('en-KE', { maximumFractionDigits: 0 })}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: '#856404', marginTop: 4 }}>
                          Min. selling price to break even: KES {(p.cost + 1).toLocaleString('en-KE', { maximumFractionDigits: 0 })} (must exceed buying price of KES {p.cost.toLocaleString('en-KE', { maximumFractionDigits: 0 })})
                        </Text>
                      </View>
                    );
                  })
                )}
              </Card.Content>
            </Card>
          </>
        )}

        {/* ---- Stock Valuation ---- */}
        {reportTab === 'stock' && (
          <>
            <Card style={styles.card}>
              <Card.Title title="Stock Valuation" titleStyle={styles.cardTitle} />
              <Card.Content>
                <View style={styles.statsRow}>
                  <View style={styles.stat}><Text style={styles.statVal}>{(allProducts ?? []).filter((p) => p.track_stock).length}</Text><Text style={styles.statLabel}>Tracked</Text></View>
                  <View style={styles.stat}><Text style={[styles.statVal, { color: '#f59e0b' }]}>{lowStockItems.length}</Text><Text style={styles.statLabel}>Low Stock</Text></View>
                  <View style={styles.stat}><Text style={[styles.statVal, { color: '#e53935' }]}>{outOfStockItems.length}</Text><Text style={styles.statLabel}>Out of Stock</Text></View>
                </View>
                <Divider style={{ marginVertical: 12 }} />
                <View style={styles.plRow}><Text style={styles.plLabel}>Value at Cost</Text><Text style={[styles.plVal, { color: '#3b82f6' }]}>{fmt(stockAtCost)}</Text></View>
                <View style={styles.plRow}><Text style={styles.plLabel}>Value at Selling Price</Text><Text style={[styles.plVal, { color: C.accent }]}>{fmt(stockAtSell)}</Text></View>
                <View style={styles.plRow}><Text style={styles.plLabel}>Potential Profit</Text><Text style={[styles.plVal, { color: '#22c55e' }]}>{fmt(stockAtSell - stockAtCost)}</Text></View>
              </Card.Content>
            </Card>
            {lowStockItems.length > 0 && (
              <Card style={styles.card}>
                <Card.Title title="âš  Low Stock Alerts" titleStyle={[styles.cardTitle, { color: '#f59e0b' }]} />
                <Card.Content>
                  {lowStockItems.map((p) => (
                    <View key={p.id} style={styles.stockAlertRow}>
                      <Text style={styles.plLabel} numberOfLines={1}>{p.name}</Text>
                      <Text style={{ color: '#f59e0b', fontWeight: '700', fontSize: 13 }}>{p.stock_qty} left</Text>
                    </View>
                  ))}
                </Card.Content>
              </Card>
            )}
          </>
        )}

        {/* ---- Customer Debt ---- */}
        {reportTab === 'customers' && (
          <>
            <Card style={styles.card}>
              <Card.Title title="Customer Debt" titleStyle={styles.cardTitle} />
              <Card.Content>
                <View style={styles.bigStat}>
                  <Text style={[styles.bigVal, { color: '#e53935' }]}>{fmt(totalDebt)}</Text>
                  <Text style={styles.bigLabel}>Total Outstanding Debt</Text>
                </View>
                <Divider style={{ marginVertical: 12 }} />
                {debtCustomers.length === 0 ? (
                  <Text style={{ color: '#aaa', textAlign: 'center', padding: 10 }}>No customers with outstanding debt</Text>
                ) : (
                  debtCustomers.map((c) => (
                    <View key={c.id} style={styles.plRow}>
                      <View>
                        <Text style={styles.plLabel}>{c.name}</Text>
                        {c.phone && <Text style={{ fontSize: 11, color: '#aaa' }}>{c.phone}</Text>}
                      </View>
                      <Text style={[styles.plVal, { color: '#e53935' }]}>{fmt(Math.abs(c.credit_balance))}</Text>
                    </View>
                  ))
                )}
              </Card.Content>
            </Card>
          </>
        )}

        {/* ---- VAT Report ---- */}
        {reportTab === 'vat' && (
          <>
            <Card style={styles.card}>
              <Card.Title title="Output VAT (Sales)" titleStyle={styles.cardTitle} />
              <Card.Content>
                <View style={styles.bigStat}>
                  <Text style={[styles.bigVal, { color: '#f59e0b' }]}>{fmt(totalVAT)}</Text>
                  <Text style={styles.bigLabel}>VAT Collected from Customers</Text>
                </View>
                <Divider style={{ marginVertical: 12 }} />
                <View style={styles.plRow}><Text style={styles.plLabel}>Gross Revenue (incl. VAT)</Text><Text style={[styles.plVal, { color: C.accent }]}>{fmt(totalRevenue)}</Text></View>
                <View style={styles.plRow}><Text style={styles.plLabel}>Taxable Sales (excl. VAT)</Text><Text style={styles.plVal}>{fmt(totalRevenue - totalVAT)}</Text></View>
                <View style={styles.plRow}><Text style={styles.plLabel}>Output VAT @ 16%</Text><Text style={[styles.plVal, { color: '#f59e0b' }]}>{fmt(totalVAT)}</Text></View>
              </Card.Content>
            </Card>
            <Card style={styles.card}>
              <Card.Title title="Input VAT (Purchases)" titleStyle={styles.cardTitle} />
              <Card.Content>
                <View style={styles.bigStat}>
                  <Text style={[styles.bigVal, { color: '#22c55e' }]}>{fmt(inputVAT)}</Text>
                  <Text style={styles.bigLabel}>Reclaimable VAT on Vendor Bills</Text>
                </View>
                <Divider style={{ marginVertical: 12 }} />
                <Text style={{ fontSize: 12, color: C.muted, lineHeight: 18 }}>
                  Input VAT is extracted from vendor bills recorded in this period using the VAT-inclusive treatment (VAT = amount × rate / (100 + rate)).
                </Text>
              </Card.Content>
            </Card>
            <Card style={styles.card}>
              <Card.Title title="Net VAT Payable to KRA" titleStyle={[styles.cardTitle, { color: netVATToKRA >= 0 ? '#e53935' : '#22c55e' }]} />
              <Card.Content>
                <View style={styles.bigStat}>
                  <Text style={[styles.bigVal, { color: netVATToKRA >= 0 ? '#e53935' : '#22c55e' }]}>
                    {fmt(Math.abs(netVATToKRA))}
                  </Text>
                  <Text style={styles.bigLabel}>{netVATToKRA >= 0 ? 'Payable to KRA' : 'VAT Credit (carry forward)'}</Text>
                </View>
                <Divider style={{ marginVertical: 12 }} />
                <View style={styles.plRow}><Text style={styles.plLabel}>Output VAT</Text><Text style={[styles.plVal, { color: '#f59e0b' }]}>{fmt(totalVAT)}</Text></View>
                <View style={styles.plRow}><Text style={styles.plLabel}>Less: Input VAT</Text><Text style={[styles.plVal, { color: '#22c55e' }]}>-{fmt(inputVAT)}</Text></View>
                <Divider style={{ marginVertical: 8 }} />
                <View style={styles.plRow}>
                  <Text style={[styles.plLabel, { fontWeight: '700', color: C.text }]}>Net VAT</Text>
                  <Text style={[styles.plVal, { color: netVATToKRA >= 0 ? '#e53935' : '#22c55e' }]}>{fmt(netVATToKRA)}</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#aaa', lineHeight: 16, marginTop: 8 }}>
                  File this via KRA iTax or your eTIMS system. Keep all vendor bills and receipts as supporting documents.
                </Text>
              </Card.Content>
            </Card>
          </>
        )}

        {/* ---- Daily Reconciliation ---- */}
        {reportTab === 'reconcile' && (
          <>
            <Card style={styles.card}>
              <Card.Title title="Daily Reconciliation" titleStyle={styles.cardTitle} subtitle={dayjs().format('D MMMM YYYY')} />
              <Card.Content>
                {openShift ? (
                  <Text style={{ fontSize: 12, color: '#22c55e', marginBottom: 8 }}>
                    Shift open — {openShift.cashier_name} since {dayjs(openShift.opened_at).format('HH:mm')} · Opening cash: {fmt(openShift.opening_cash)}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>No open shift</Text>
                )}
                <Divider style={{ marginBottom: 12 }} />
                <View style={styles.plRow}><Text style={styles.plLabel}>Opening Float</Text><Text style={styles.plVal}>{fmt(openShift?.opening_cash ?? 0)}</Text></View>
                <View style={styles.plRow}><Text style={styles.plLabel}>Cash Sales</Text><Text style={styles.plVal}>{fmt(expectedCash)}</Text></View>
                <View style={styles.plRow}><Text style={styles.plLabel}>Petty Cash In/Out</Text><Text style={[styles.plVal, { color: (drawerBalance ?? 0) >= 0 ? C.accent : '#e53935' }]}>{(drawerBalance ?? 0) >= 0 ? '+' : ''}{fmt(drawerBalance ?? 0)}</Text></View>
                <View style={[styles.plRow, { borderTopWidth: 1, borderTopColor: '#eee', marginTop: 4, paddingTop: 8 }]}>
                  <Text style={[styles.plLabel, { fontWeight: '700' }]}>Expected in Drawer</Text>
                  <Text style={[styles.plVal, { color: C.accent, fontWeight: '700' }]}>{fmt(expectedDrawer)}</Text>
                </View>
                <View style={styles.plRow}><Text style={styles.plLabel}>M-Pesa Sales</Text><Text style={styles.plVal}>{fmt(expectedMpesa)}</Text></View>
                <View style={styles.plRow}><Text style={styles.plLabel}>Credit Sales</Text><Text style={[styles.plVal, { color: '#f59e0b' }]}>{fmt(expectedCredit)}</Text></View>
                <Divider style={{ marginVertical: 10 }} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 }}>Count Actual Cash</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 13, color: C.muted }}>KES</Text>
                  <RNTextInput
                    value={actualCash}
                    onChangeText={setActualCash}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    style={{ flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, color: C.text, backgroundColor: C.elevated }}
                  />
                </View>
                {actualCash !== '' && (
                  <View style={[styles.plRow, { marginTop: 10 }]}>
                    <Text style={[styles.plLabel, { fontWeight: '700', fontSize: 14 }]}>Over / Short</Text>
                    <Text style={[styles.plVal, { fontWeight: '900', fontSize: 15, color: cashVariance >= 0 ? '#22c55e' : '#e53935' }]}>
                      {cashVariance >= 0 ? '+' : ''}{fmt(cashVariance)}
                    </Text>
                  </View>
                )}
                <Text style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
                  Expected = opening float ({fmt(openShift?.opening_cash ?? 0)}) + cash sales ({fmt(expectedCash)}) + petty movements ({fmt(drawerBalance ?? 0)})
                </Text>
              </Card.Content>
            </Card>
          </>
        )}

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
    tabs: { flexDirection: 'row', padding: 12, gap: 8 },
    tab: { backgroundColor: C.elevated, flex: 1, justifyContent: 'center' },
    tabActive: { backgroundColor: C.accent },
    tabText: { fontSize: 12, textAlign: 'center' },
    tabTextActive: { color: '#fff', fontWeight: '700' },
    scroll: { flex: 1 },
    card: { marginHorizontal: 12, marginBottom: 12, borderRadius: 12 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: C.text },
    bigStat: { alignItems: 'center', paddingVertical: 8 },
    bigVal: { fontSize: 32, fontWeight: '800', color: C.accent },
    bigLabel: { fontSize: 12, color: C.muted, marginTop: 4 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
    stat: { alignItems: 'center' },
    statVal: { fontSize: 16, fontWeight: '700', color: C.accent },
    statLabel: { fontSize: 11, color: C.muted, marginTop: 2 },
    pmRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    pmLabel: { width: 56, fontSize: 13, color: C.text },
    barBg: { flex: 1, height: 8, backgroundColor: C.elevated, borderRadius: 4, marginHorizontal: 8, overflow: 'hidden' },
    bar: { height: '100%', borderRadius: 4 },
    pmVal: { width: 90, fontSize: 12, fontWeight: '700', textAlign: 'right' },
    productRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    rankNum: { fontSize: 12, fontWeight: '700' },
    productName: { flex: 1, fontSize: 13, color: C.text },
    productRight: { alignItems: 'flex-end' },
    productQty: { fontSize: 11, color: C.muted },
    productRev: { fontSize: 13, fontWeight: '700', color: C.accent },
    trendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    trendDate: { width: 44, fontSize: 12, color: C.muted },
    trendVal: { width: 90, fontSize: 11, color: C.text, textAlign: 'right' },
    reportTabsScroll: { maxHeight: 44 },
    reportTabsContent: { paddingHorizontal: 12, gap: 8, paddingVertical: 6 },
    reportTab: { backgroundColor: C.elevated },
    reportTabActive: { backgroundColor: C.accent },
    plRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    plLabel: { fontSize: 13, color: C.muted, flex: 1 },
    plVal: { fontSize: 13, fontWeight: '700', color: C.text },
    stockAlertRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  });
}
