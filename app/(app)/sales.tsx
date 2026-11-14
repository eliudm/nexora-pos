import React, { useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Appbar, Card, Chip, Portal, Dialog, Button, Divider, DataTable } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { salesQueries, Sale } from '../../src/db/sales';
import { brand } from '../../src/theme';

const PM_COLORS: Record<string, string> = {
  CASH: '#22c55e',
  MPESA: '#f59e0b',
  CREDIT: '#6f67ff',
};

export default function SalesScreen() {
  const [from, setFrom] = useState(dayjs().format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [selected, setSelected] = useState<Sale | null>(null);

  const { data: sales } = useQuery({
    queryKey: ['sales', from, to],
    queryFn: () => salesQueries.getAll(from, to, 200),
  });

  const { data: detail } = useQuery({
    queryKey: ['sale-detail', selected?.id],
    queryFn: () => salesQueries.getById(selected!.id),
    enabled: !!selected,
  });

  const presets = [
    { label: 'Today', from: dayjs().format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
    { label: 'Yesterday', from: dayjs().subtract(1, 'day').format('YYYY-MM-DD'), to: dayjs().subtract(1, 'day').format('YYYY-MM-DD') },
    { label: 'This Week', from: dayjs().startOf('week').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
    { label: 'This Month', from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
  ];

  const totalRevenue = (sales ?? []).reduce((s, x) => s + x.total, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Sales History" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <View style={styles.presets}>
        {presets.map((p) => (
          <Chip
            key={p.label}
            selected={from === p.from && to === p.to}
            onPress={() => { setFrom(p.from); setTo(p.to); }}
            style={styles.presetChip}
            selectedColor={brand.primary}
            compact
          >
            {p.label}
          </Chip>
        ))}
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryCount}>{(sales ?? []).length} transactions</Text>
        <Text style={styles.summaryTotal}>KES {totalRevenue.toLocaleString()}</Text>
      </View>

      <FlatList
        data={sales ?? []}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.card} onPress={() => setSelected(item)}>
            <Card.Content style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.invoiceNo}>{item.invoice_no}</Text>
                <Text style={styles.time}>{dayjs(item.created_at).format('D MMM, HH:mm')}</Text>
                {item.customer_name && <Text style={styles.customer}>{item.customer_name}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.total}>KES {item.total.toLocaleString()}</Text>
                <Chip
                  compact
                  style={[styles.pmChip, { backgroundColor: (PM_COLORS[item.payment_method] ?? '#888') + '22' }]}
                  textStyle={[styles.pmText, { color: PM_COLORS[item.payment_method] ?? '#888' }]}
                >
                  {item.payment_method}
                </Chip>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No sales found for this period.</Text>
          </View>
        }
      />

      <Portal>
        <Dialog visible={!!selected} onDismiss={() => setSelected(null)}>
          <Dialog.Title>Receipt — {selected?.invoice_no}</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.receiptDate}>{dayjs(selected?.created_at).format('D MMM YYYY, HH:mm')}</Text>
            {selected?.customer_name && <Text style={styles.receiptCustomer}>Customer: {selected.customer_name}</Text>}

            <Divider style={{ marginVertical: 10 }} />

            <DataTable>
              <DataTable.Header>
                <DataTable.Title>Item</DataTable.Title>
                <DataTable.Title numeric>Qty</DataTable.Title>
                <DataTable.Title numeric>Total</DataTable.Title>
              </DataTable.Header>
              {(detail?.items ?? []).map((item, i) => (
                <DataTable.Row key={i}>
                  <DataTable.Cell>{item.product_name}</DataTable.Cell>
                  <DataTable.Cell numeric>{item.qty}</DataTable.Cell>
                  <DataTable.Cell numeric>KES {item.total.toFixed(0)}</DataTable.Cell>
                </DataTable.Row>
              ))}
            </DataTable>

            <Divider style={{ marginVertical: 10 }} />

            <View style={styles.receiptTotals}>
              <View style={styles.rRow}><Text style={styles.rLabel}>Subtotal</Text><Text>KES {selected?.subtotal.toFixed(0)}</Text></View>
              <View style={styles.rRow}><Text style={styles.rLabel}>VAT</Text><Text>KES {selected?.tax_amount.toFixed(0)}</Text></View>
              {(selected?.discount ?? 0) > 0 && (
                <View style={styles.rRow}><Text style={styles.rLabel}>Discount</Text><Text style={{ color: '#e53935' }}>-KES {selected?.discount}</Text></View>
              )}
              <View style={[styles.rRow, { marginTop: 4 }]}>
                <Text style={styles.grandLabel}>TOTAL</Text>
                <Text style={styles.grandVal}>KES {selected?.total.toFixed(0)}</Text>
              </View>
              <View style={styles.rRow}>
                <Text style={styles.rLabel}>Payment</Text>
                <Text style={{ fontWeight: '600', color: PM_COLORS[selected?.payment_method ?? ''] ?? '#333' }}>{selected?.payment_method}</Text>
              </View>
              {selected?.mpesa_ref && (
                <View style={styles.rRow}><Text style={styles.rLabel}>Ref</Text><Text>{selected.mpesa_ref}</Text></View>
              )}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSelected(null)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: brand.primary },
  headerTitle: { color: '#fff', fontWeight: '700' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  presetChip: { backgroundColor: '#f0f0f0' },
  summary: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  summaryCount: { fontSize: 13, color: '#666' },
  summaryTotal: { fontSize: 15, fontWeight: '800', color: brand.primary },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  card: { marginBottom: 8, borderRadius: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  invoiceNo: { fontSize: 14, fontWeight: '700', color: '#111' },
  time: { fontSize: 12, color: '#888', marginTop: 2 },
  customer: { fontSize: 12, color: '#666', marginTop: 2 },
  total: { fontSize: 15, fontWeight: '800', color: brand.primary },
  pmChip: { marginTop: 4, height: 22 },
  pmText: { fontSize: 10, fontWeight: '700' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#aaa' },
  receiptDate: { fontSize: 13, color: '#666', marginBottom: 2 },
  receiptCustomer: { fontSize: 13, color: '#444', marginBottom: 4 },
  receiptTotals: { marginTop: 4 },
  rRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rLabel: { color: '#666', fontSize: 13 },
  grandLabel: { fontSize: 15, fontWeight: '800', color: '#111' },
  grandVal: { fontSize: 15, fontWeight: '800', color: brand.primary },
});
