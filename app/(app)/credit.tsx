import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert, ScrollView, Pressable, RefreshControl, TextInput as RNTextInput } from 'react-native';
import { Text, Button, Appbar, Portal, Dialog, TextInput, Chip, ActivityIndicator, RadioButton, Divider, DataTable } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import { creditQueries, Debtor, CreditLedgerEntry } from '../../src/db/credit';
import { salesQueries, Sale } from '../../src/db/sales';
import { useSession } from '../../src/context/session';
import { useTheme } from '../../src/context/theme';

type Tab = 'debtors' | 'aging';
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const PAY_METHODS = ['CASH', 'MPESA', 'BANK'] as const;
type PM = typeof PAY_METHODS[number];

export default function CreditScreen() {
  const qc = useQueryClient();
  const { user } = useSession();
  const { colors: C } = useTheme();
  const S = makeStyles(C);

  const [tab, setTab] = useState<Tab>('debtors');
  const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [repayVisible, setRepayVisible] = useState(false);
  const [limitVisible, setLimitVisible] = useState(false);

  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<PM>('CASH');
  const [repayMpesaRef, setRepayMpesaRef] = useState('');
  const [repayNote, setRepayNote] = useState('');
  const [limitInput, setLimitInput] = useState('');

  const [invoiceVisible, setInvoiceVisible] = useState(false);
  const [selectedInvoiceNo, setSelectedInvoiceNo] = useState<string | null>(null);
  const [debtorSearch, setDebtorSearch] = useState('');
  type SortKey = 'amount' | 'name' | 'oldest';
  const [sortBy, setSortBy] = useState<SortKey>('amount');

  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ['credit-summary'],
    queryFn: creditQueries.getSummary,
  });

  const { data: debtors = [], isLoading: loadingDebtors, refetch: refetchDebtors, isRefetching } = useQuery({
    queryKey: ['credit-debtors'],
    queryFn: creditQueries.getDebtors,
  });

  const { data: aging = [] } = useQuery({
    queryKey: ['credit-aging'],
    queryFn: creditQueries.getAgingBuckets,
  });

  const { data: ledger = [], isLoading: loadingLedger } = useQuery({
    queryKey: ['credit-ledger', selectedDebtor?.id],
    queryFn: () => (selectedDebtor ? creditQueries.getLedger(selectedDebtor.id) : Promise.resolve([])),
    enabled: !!selectedDebtor && detailVisible,
  });

  const { data: invoiceDetail } = useQuery({
    queryKey: ['sale-by-invoice', selectedInvoiceNo],
    queryFn: () => salesQueries.getByInvoiceNo(selectedInvoiceNo!),
    enabled: !!selectedInvoiceNo && invoiceVisible,
  });

  const repayMutation = useMutation({
    mutationFn: () => creditQueries.recordRepayment({
      customerId: selectedDebtor!.id,
      amount: parseFloat(repayAmount),
      paymentMethod: repayMethod,
      mpesaRef: repayMethod === 'MPESA' ? repayMpesaRef.trim() || undefined : undefined,
      note: repayNote.trim() || undefined,
      cashierId: user?.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-debtors'] });
      qc.invalidateQueries({ queryKey: ['credit-summary'] });
      qc.invalidateQueries({ queryKey: ['credit-ledger', selectedDebtor?.id] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['daily-summary'] });
      setRepayVisible(false);
      setRepayAmount('');
      setRepayMethod('CASH');
      setRepayMpesaRef('');
      setRepayNote('');
      Alert.alert('Payment Recorded', `KES ${parseFloat(repayAmount).toLocaleString('en-KE', { minimumFractionDigits: 2 })} credited to account.`);
      // Refresh selected debtor balance from list
      setSelectedDebtor(d => d ? { ...d, credit_balance: d.credit_balance + parseFloat(repayAmount) } : d);
    },
    onError: (e: any) => Alert.alert('Error', e.message ?? 'Failed to record payment'),
  });

  const limitMutation = useMutation({
    mutationFn: () => creditQueries.updateCreditLimit(selectedDebtor!.id, parseFloat(limitInput) || 0),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-debtors'] });
      setLimitVisible(false);
      setSelectedDebtor(d => d ? { ...d, credit_limit: parseFloat(limitInput) || 0 } : d);
    },
    onError: (e: any) => Alert.alert('Error', e.message ?? 'Failed to update limit'),
  });

  const handleRepaySubmit = () => {
    const amount = parseFloat(repayAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a valid payment amount.');
      return;
    }
    if (repayMethod === 'MPESA' && !repayMpesaRef.trim()) {
      Alert.alert('M-Pesa Reference', 'Enter the M-Pesa transaction code.');
      return;
    }
    repayMutation.mutate();
  };

  const openDebtor = (debtor: Debtor) => {
    setSelectedDebtor(debtor);
    setDetailVisible(true);
  };

  const onRefresh = useCallback(() => { refetchDebtors(); refetchSummary(); }, [refetchDebtors, refetchSummary]);

  const owed = Math.abs(selectedDebtor?.credit_balance ?? 0);
  const overage = selectedDebtor && selectedDebtor.credit_limit > 0
    ? Math.max(0, Math.abs(selectedDebtor.credit_balance) - selectedDebtor.credit_limit)
    : 0;

  return (
    <SafeAreaView style={S.safe}>
      <Appbar.Header style={S.header}>
        <Appbar.BackAction color="#fff" onPress={() => router.back()} />
        <Appbar.Content title="Credit Management" titleStyle={S.headerTitle} />
      </Appbar.Header>

      {/* Summary banner */}
      <View style={S.summaryRow}>
        <View style={S.summaryCard}>
          <MaterialCommunityIcons name="currency-usd-off" size={22} color="#e53935" />
          <Text style={S.summaryValue}>KES {(summary?.totalOwed ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</Text>
          <Text style={S.summaryLabel}>Total Outstanding</Text>
        </View>
        <View style={S.summaryCard}>
          <MaterialCommunityIcons name="account-multiple-outline" size={22} color="#f59e0b" />
          <Text style={S.summaryValue}>{summary?.debtorCount ?? 0}</Text>
          <Text style={S.summaryLabel}>Debtors</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={S.tabRow}>
        {(['debtors', 'aging'] as Tab[]).map(t => (
          <Chip
            key={t}
            selected={tab === t}
            onPress={() => setTab(t)}
            style={[S.tabChip, tab === t && { backgroundColor: C.accent + '22' }]}
            textStyle={[S.tabText, tab === t && { color: C.accent }]}
          >
            {t === 'debtors' ? 'Debtors' : 'Aging Report'}
          </Chip>
        ))}
      </View>

      {/* Content */}
      {tab === 'debtors' && (
        loadingDebtors
          ? <ActivityIndicator style={{ marginTop: 48 }} />
          : (
            <>
              {debtors.length > 0 && (
                <View style={[S.searchBar, { backgroundColor: C.elevated, borderColor: C.border }]}>
                  <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
                  <RNTextInput
                    value={debtorSearch}
                    onChangeText={setDebtorSearch}
                    placeholder="Search debtors..."
                    placeholderTextColor={C.muted}
                    style={[S.searchInput, { color: C.text }]}
                  />
                  {debtorSearch.length > 0 && (
                    <Pressable onPress={() => setDebtorSearch('')}>
                      <MaterialCommunityIcons name="close-circle" size={16} color={C.muted} />
                    </Pressable>
                  )}
                </View>
              )}
              {/* Sort chips */}
              {debtors.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 8 }}>
                  {(['amount', 'name', 'oldest'] as SortKey[]).map(s => (
                    <Chip key={s} selected={sortBy === s} onPress={() => setSortBy(s)}
                      style={[S.tabChip, sortBy === s && { backgroundColor: C.accent + '22' }]}
                      textStyle={[S.tabText, sortBy === s && { color: C.accent }]} compact>
                      {s === 'amount' ? 'Most Owed' : s === 'name' ? 'Name' : 'Oldest'}
                    </Chip>
                  ))}
                </View>
              )}
              {debtors.filter(d => d.name.toLowerCase().includes(debtorSearch.toLowerCase()) || (d.phone ?? '').includes(debtorSearch)).length === 0
                ? (
                  <View style={S.empty}>
                    <MaterialCommunityIcons name="check-circle-outline" size={56} color={C.muted} />
                    <Text style={[S.emptyText, { color: C.muted }]}>
                      {debtors.length === 0 ? 'No outstanding credit balances' : 'No debtors match your search'}
                    </Text>
                  </View>
                )
                : (
              <FlatList
                data={debtors
                  .filter(d => d.name.toLowerCase().includes(debtorSearch.toLowerCase()) || (d.phone ?? '').includes(debtorSearch))
                  .sort((a, b) => {
                    if (sortBy === 'amount') return a.credit_balance - b.credit_balance; // most negative first
                    if (sortBy === 'name') return a.name.localeCompare(b.name);
                    // oldest: earliest sale date first
                    if (!a.oldest_sale_date) return 1;
                    if (!b.oldest_sale_date) return -1;
                    return a.oldest_sale_date < b.oldest_sale_date ? -1 : 1;
                  })}
                keyExtractor={d => String(d.id)}
                contentContainerStyle={{ padding: 16, gap: 10 }}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} colors={[C.accent]} />}
                renderItem={({ item }) => {
                  const owedAmt = Math.abs(item.credit_balance);
                  const isOverLimit = item.credit_limit > 0 && owedAmt > item.credit_limit;
                  const daysOld = item.oldest_sale_date
                    ? dayjs().diff(dayjs(item.oldest_sale_date), 'day')
                    : null;
                  return (
                    <View
                      style={[S.debtorCard, { backgroundColor: C.surface, borderColor: isOverLimit ? '#e53935' : C.border }]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={[S.avatar, { backgroundColor: isOverLimit ? '#e5393520' : C.accent + '20' }]}>
                          <MaterialCommunityIcons
                            name="account-outline"
                            size={22}
                            color={isOverLimit ? '#e53935' : C.accent}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[S.debtorName, { color: C.text }]}>{item.name}</Text>
                          <Text style={[S.debtorPhone, { color: C.muted }]}>
                            {item.phone ?? 'No phone'}
                            {item.unpaid_invoices > 0 && ` · ${item.unpaid_invoices} invoice${item.unpaid_invoices !== 1 ? 's' : ''}`}
                            {daysOld !== null && ` · ${daysOld}d old`}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[S.owedAmount, { color: '#e53935' }]}>
                            KES {owedAmt.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                          </Text>
                          {item.credit_limit > 0 && (
                            <Text style={[S.limitText, { color: isOverLimit ? '#e53935' : C.muted }]}>
                              Limit: {item.credit_limit.toLocaleString('en-KE')}
                              {isOverLimit ? ' ⚠ Over limit' : ''}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={S.debtorActions}>
                        <Button
                          mode="text"
                          compact
                          textColor={C.accent}
                          onPress={() => openDebtor(item)}
                          icon="eye-outline"
                        >
                          View
                        </Button>
                        <Button
                          mode="contained"
                          compact
                          buttonColor={C.accent}
                          textColor="#fff"
                          onPress={() => { setSelectedDebtor(item); setRepayVisible(true); }}
                          icon="cash-plus"
                        >
                          Record Payment
                        </Button>
                      </View>
                    </View>
                  );
                }}
              />
                )}
            </>
          )
      )}

      {tab === 'aging' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={[S.sectionHeader, { color: C.muted }]}>Outstanding credit by age of sale</Text>
          {aging.length === 0 ? (
            <View style={S.empty}>
              <MaterialCommunityIcons name="check-circle-outline" size={56} color={C.muted} />
              <Text style={[S.emptyText, { color: C.muted }]}>No aging data</Text>
            </View>
          ) : (() => {
            const bucketColors: Record<string, string> = {
              '0-30 days': '#22c55e',
              '31-60 days': '#f59e0b',
              '61-90 days': '#f97316',
              'Over 90 days': '#e53935',
            };
            const totalAmount = aging.reduce((s, r) => s + r.amount, 0);
            return (
              <>
                {/* Proportional stacked bar */}
                <View style={{ flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', marginBottom: 4 }}>
                  {aging.map((row, i) => (
                    <View key={i} style={{ flex: row.amount / (totalAmount || 1), backgroundColor: bucketColors[row.bucket] ?? C.muted }} />
                  ))}
                </View>
                {aging.map((row, i) => {
                  const color = bucketColors[row.bucket] ?? C.text;
                  const pct = totalAmount > 0 ? ((row.amount / totalAmount) * 100).toFixed(0) : '0';
                  return (
                    <View key={i} style={[S.agingRow, { backgroundColor: C.surface, borderColor: C.border }]}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 10, marginTop: 4 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[S.agingBucket, { color }]}>{row.bucket}</Text>
                        <Text style={[S.agingCount, { color: C.muted }]}>{row.count} debtor{row.count !== 1 ? 's' : ''} · {pct}%</Text>
                      </View>
                      <Text style={[S.agingAmount, { color }]}>
                        KES {row.amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                      </Text>
                    </View>
                  );
                })}
                {/* Totals row */}
                <View style={[S.agingRow, { backgroundColor: C.elevated, borderColor: C.accent + '44', borderWidth: 1 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[S.agingBucket, { color: C.text, fontWeight: '800' }]}>Total Outstanding</Text>
                    <Text style={[S.agingCount, { color: C.muted }]}>{aging.reduce((s, r) => s + r.count, 0)} debtors</Text>
                  </View>
                  <Text style={[S.agingAmount, { color: C.accent, fontWeight: '800' }]}>
                    KES {totalAmount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              </>
            );
          })()}
        </ScrollView>
      )}

      {/* Detail Dialog */}
      <Portal>
        <Dialog visible={detailVisible} onDismiss={() => setDetailVisible(false)} style={{ maxHeight: '90%', backgroundColor: C.surface }}>
          <Dialog.Title style={{ color: C.text }}>
            {selectedDebtor?.name}
          </Dialog.Title>
          <Dialog.Content style={{ paddingBottom: 0 }}>
            {/* Balance row */}
            <View style={S.detailBalanceRow}>
              <View style={{ flex: 1 }}>
                <Text style={[S.detailBalLabel, { color: C.muted }]}>Balance Owed</Text>
                <Text style={[S.detailBal, { color: '#e53935' }]}>
                  KES {owed.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.detailBalLabel, { color: C.muted }]}>Credit Limit</Text>
                <Text style={[S.detailBal, { color: overage > 0 ? '#e53935' : C.text }]}>
                  {selectedDebtor?.credit_limit ? `KES ${selectedDebtor.credit_limit.toLocaleString('en-KE')}` : 'No limit'}
                </Text>
              </View>
            </View>
            {selectedDebtor?.phone && (
              <Text style={[S.detailPhone, { color: C.muted }]}>{selectedDebtor.phone}</Text>
            )}

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <Button
                mode="contained"
                compact
                buttonColor={C.accent}
                textColor="#fff"
                icon="cash-plus"
                onPress={() => { setDetailVisible(false); setRepayVisible(true); }}
              >
                Record Payment
              </Button>
              <Button
                mode="outlined"
                compact
                textColor={C.text}
                icon="shield-edit-outline"
                onPress={() => { setLimitInput(String(selectedDebtor?.credit_limit ?? 0)); setLimitVisible(true); }}
              >
                Set Limit
              </Button>
            </View>

            {/* Ledger */}
            <Text style={[S.sectionHeader, { color: C.muted, marginBottom: 8 }]}>Transaction History</Text>
          </Dialog.Content>

          {loadingLedger ? (
            <ActivityIndicator style={{ marginVertical: 24 }} />
          ) : (
            <FlatList
              data={ledger}
              keyExtractor={(_, i) => String(i)}
              style={{ maxHeight: 240, paddingHorizontal: 16 }}
              renderItem={({ item }) => (
              <LedgerRow
                item={item}
                C={C}
                onInvoicePress={(inv) => { setSelectedInvoiceNo(inv); setInvoiceVisible(true); }}
              />
            )}
              ListEmptyComponent={
                <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 16 }}>No transactions found</Text>
              }
            />
          )}

          <Dialog.Actions>
            <Button onPress={() => setDetailVisible(false)} textColor={C.muted}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Repayment Dialog */}
        <Dialog visible={repayVisible} onDismiss={() => setRepayVisible(false)} style={{ backgroundColor: C.surface }}>
          <Dialog.Title style={{ color: C.text }}>Record Payment</Dialog.Title>
          <Dialog.Content>
            {selectedDebtor && (
              <Text style={{ color: C.muted, marginBottom: 12 }}>
                {selectedDebtor.name} owes KES {Math.abs(selectedDebtor.credit_balance).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
              </Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <TextInput
                label="Amount (KES)"
                value={repayAmount}
                onChangeText={setRepayAmount}
                keyboardType="numeric"
                mode="outlined"
                style={{ flex: 1 }}
              />
              <Button
                mode="contained-tonal"
                compact
                onPress={() => setRepayAmount(String(Math.abs(selectedDebtor?.credit_balance ?? 0).toFixed(2)))}
              >
                Pay Full
              </Button>
            </View>
            <Text style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>Payment Method</Text>
            <RadioButton.Group value={repayMethod} onValueChange={v => setRepayMethod(v as PM)}>
              <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                {PAY_METHODS.map(m => (
                  <Chip
                    key={m}
                    selected={repayMethod === m}
                    onPress={() => setRepayMethod(m)}
                    style={repayMethod === m ? { backgroundColor: C.accent + '22' } : {}}
                    textStyle={repayMethod === m ? { color: C.accent } : {}}
                  >
                    {m}
                  </Chip>
                ))}
              </View>
            </RadioButton.Group>
            {repayMethod === 'MPESA' && (
              <TextInput
                label="M-Pesa Reference"
                value={repayMpesaRef}
                onChangeText={setRepayMpesaRef}
                mode="outlined"
                autoCapitalize="characters"
                style={{ marginBottom: 10 }}
              />
            )}
            <TextInput
              label="Note (optional)"
              value={repayNote}
              onChangeText={setRepayNote}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRepayVisible(false)} textColor={C.muted}>Cancel</Button>
            <Button
              onPress={handleRepaySubmit}
              loading={repayMutation.isPending}
              disabled={repayMutation.isPending}
              textColor={C.accent}
            >
              Save Payment
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Credit Limit Dialog */}
        <Dialog visible={limitVisible} onDismiss={() => setLimitVisible(false)} style={{ backgroundColor: C.surface }}>
          <Dialog.Title style={{ color: C.text }}>Set Credit Limit</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: C.muted, marginBottom: 12 }}>
              Maximum amount {selectedDebtor?.name} can owe. Set to 0 for no limit.
            </Text>
            <TextInput
              label="Credit Limit (KES)"
              value={limitInput}
              onChangeText={setLimitInput}
              keyboardType="numeric"
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLimitVisible(false)} textColor={C.muted}>Cancel</Button>
            <Button
              onPress={() => limitMutation.mutate()}
              loading={limitMutation.isPending}
              disabled={limitMutation.isPending}
              textColor={C.accent}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Invoice Detail Dialog */}
        <Dialog
          visible={invoiceVisible}
          onDismiss={() => { setInvoiceVisible(false); setSelectedInvoiceNo(null); }}
          style={{ maxHeight: '85%', backgroundColor: C.surface }}
        >
          <Dialog.Title style={{ color: C.text }}>
            {invoiceDetail?.invoice_no ?? selectedInvoiceNo}
          </Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {!invoiceDetail ? (
                <ActivityIndicator style={{ marginVertical: 32 }} />
              ) : (
                <>
                  <Text style={{ color: C.muted, fontSize: 13, marginBottom: 2 }}>
                    {dayjs(invoiceDetail.created_at).format('D MMM YYYY, HH:mm')}
                  </Text>
                  {invoiceDetail.customer_name && (
                    <Text style={{ color: C.text, fontSize: 13, marginBottom: 10 }}>
                      Customer: {invoiceDetail.customer_name}
                    </Text>
                  )}

                  <Divider style={{ marginBottom: 10 }} />

                  <DataTable>
                    <DataTable.Header>
                      <DataTable.Title>Item</DataTable.Title>
                      <DataTable.Title numeric>Qty</DataTable.Title>
                      <DataTable.Title numeric>Total</DataTable.Title>
                    </DataTable.Header>
                    {(invoiceDetail.items ?? []).map((item, i) => (
                      <DataTable.Row key={i}>
                        <DataTable.Cell>{item.product_name}</DataTable.Cell>
                        <DataTable.Cell numeric>{item.qty}</DataTable.Cell>
                        <DataTable.Cell numeric>KES {item.total.toFixed(0)}</DataTable.Cell>
                      </DataTable.Row>
                    ))}
                  </DataTable>

                  <Divider style={{ marginVertical: 10 }} />

                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: C.muted, fontSize: 13 }}>Subtotal</Text>
                      <Text style={{ color: C.text }}>KES {invoiceDetail.subtotal.toFixed(0)}</Text>
                    </View>
                    {invoiceDetail.tax_amount > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: C.muted, fontSize: 13 }}>VAT</Text>
                        <Text style={{ color: C.text }}>KES {invoiceDetail.tax_amount.toFixed(0)}</Text>
                      </View>
                    )}
                    {(invoiceDetail.discount ?? 0) > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: C.muted, fontSize: 13 }}>Discount</Text>
                        <Text style={{ color: '#e53935' }}>-KES {invoiceDetail.discount}</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>TOTAL</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#e53935' }}>
                        KES {invoiceDetail.total.toFixed(2)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: C.muted, fontSize: 13 }}>Payment</Text>
                      <Text style={{ fontWeight: '600', color: '#6f67ff' }}>CREDIT</Text>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            {invoiceDetail?.customer_id && (
              <Button
                textColor={C.accent}
                icon="cash-plus"
                onPress={() => {
                  setInvoiceVisible(false);
                  setRepayVisible(true);
                  // pre-select the debtor if not already
                  if (!selectedDebtor) {
                    setSelectedDebtor({
                      id: invoiceDetail.customer_id!,
                      name: invoiceDetail.customer_name ?? '',
                      phone: null,
                      credit_balance: 0,
                      credit_limit: 0,
                      oldest_sale_date: null,
                      unpaid_invoices: 0,
                    });
                  }
                }}
              >
                Record Payment
              </Button>
            )}
            <Button
              onPress={() => { setInvoiceVisible(false); setSelectedInvoiceNo(null); }}
              textColor={C.muted}
            >
              Close
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

function LedgerRow({ item, C, onInvoicePress }: { item: CreditLedgerEntry; C: any; onInvoicePress?: (invoiceNo: string) => void }) {
  const isSale = item.type === 'SALE';
  const isRepayment = item.type === 'REPAYMENT';
  const color = isSale ? '#e53935' : '#22c55e';
  const icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] = isSale
    ? 'cart-outline'
    : isRepayment ? 'cash-check' : 'pencil-outline';
  const sign = isSale ? '-' : '+';
  const tappable = isSale && !!item.invoice_no;

  const content = (
    <>
      <MaterialCommunityIcons name={icon} size={18} color={color} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 13, color: C.text, fontWeight: '600' }}>
            {item.invoice_no ?? item.note ?? (isRepayment ? 'Payment' : item.type)}
          </Text>
          {tappable && <MaterialCommunityIcons name="chevron-right" size={14} color={C.muted} />}
        </View>
        <Text style={{ fontSize: 11, color: C.muted }}>
          {dayjs(item.date).format('DD MMM YYYY, HH:mm')}
          {item.mpesa_ref ? ` · ${item.mpesa_ref}` : ''}
        </Text>
      </View>
      <Text style={{ fontWeight: '700', color, fontSize: 14 }}>
        {sign}KES {Math.abs(item.amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
      </Text>
    </>
  );

  if (tappable) {
    return (
      <Pressable
        onPress={() => onInvoicePress?.(item.invoice_no!)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#00000015', opacity: pressed ? 0.6 : 1 })}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#00000015' }}>
      {content}
    </View>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: { backgroundColor: C.accent },
    headerTitle: { color: '#fff', fontWeight: '700' },
    summaryRow: { flexDirection: 'row', gap: 12, padding: 16 },
    summaryCard: {
      flex: 1, backgroundColor: C.surface, borderRadius: 12,
      borderWidth: 1, borderColor: C.border,
      padding: 14, alignItems: 'center', gap: 4,
    },
    summaryValue: { fontSize: 18, fontWeight: '800', color: C.text },
    summaryLabel: { fontSize: 11, color: C.muted, textAlign: 'center' },
    tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
    tabChip: { borderRadius: 20 },
    tabText: { fontSize: 13, fontWeight: '600' },
    debtorCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    debtorName: { fontSize: 15, fontWeight: '700' },
    debtorPhone: { fontSize: 12, marginTop: 2 },
    owedAmount: { fontSize: 15, fontWeight: '800' },
    limitText: { fontSize: 11, marginTop: 2 },
    debtorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
    sectionHeader: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    agingRow: {
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 12, borderWidth: 1, padding: 14,
    },
    agingBucket: { fontSize: 14, fontWeight: '700' },
    agingCount: { fontSize: 12, marginTop: 2 },
    agingAmount: { fontSize: 16, fontWeight: '800' },
    detailBalanceRow: { flexDirection: 'row', marginBottom: 8 },
    detailBalLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
    detailBal: { fontSize: 18, fontWeight: '800', marginTop: 2 },
    detailPhone: { fontSize: 13, marginBottom: 10 },
    empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyText: { fontSize: 15, fontWeight: '600' },
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 4, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
    searchInput: { flex: 1, fontSize: 14 },
  });
}
