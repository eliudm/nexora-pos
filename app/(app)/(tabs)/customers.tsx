import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert, ScrollView } from 'react-native';
import { Text, Appbar, Searchbar, FAB, Portal, Dialog, TextInput, Button, Card, Menu, Divider, Chip } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { customerQueries, Customer } from '../../../src/db/customers';
import { router } from 'expo-router';
import { salesQueries, Sale } from '../../../src/db/sales';
import { loyaltyQueries, LoyaltyTransaction } from '../../../src/db/loyalty';
import { useTheme } from '../../../src/context/theme';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import dayjs from 'dayjs';

const EMPTY = { name: '', phone: '', email: '', kra_pin: '', credit_balance: '0' };

export default function CustomersScreen() {
  const qc = useQueryClient();
  const { colors: C } = useTheme();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [menuId, setMenuId] = useState<number | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<Customer | null>(null);
  const [adjustPoints, setAdjustPoints] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  const { data: customers } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => customerQueries.getAll(search),
  });

  const { data: statementSales } = useQuery({
    queryKey: ['customer-sales', statementCustomer?.id],
    queryFn: () => salesQueries.getAll(undefined, undefined, 100).then((all) =>
      all.filter((s) => s.customer_id === statementCustomer!.id)
    ),
    enabled: !!statementCustomer,
  });

  const { data: loyaltyHistory } = useQuery({
    queryKey: ['loyalty-history', loyaltyCustomer?.id],
    queryFn: () => loyaltyQueries.getHistory(loyaltyCustomer!.id),
    enabled: !!loyaltyCustomer,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        kra_pin: form.kra_pin.trim() || null,
        credit_balance: parseFloat(form.credit_balance) || 0,
      };
      if (editing) await customerQueries.update(editing.id, data);
      else await customerQueries.create(data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); closeDialog(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customerQueries.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });

  const loyaltyAdjustMutation = useMutation({
    mutationFn: async () => {
      const pts = parseInt(adjustPoints);
      if (isNaN(pts) || pts === 0) throw new Error('Enter a non-zero point value');
      await loyaltyQueries.adjust(loyaltyCustomer!.id, pts, adjustNote.trim() || 'Manual adjustment');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['loyalty-history'] });
      setAdjustPoints('');
      setAdjustNote('');
      Alert.alert('Done', 'Loyalty points adjusted.');
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm({ ...EMPTY }); };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', kra_pin: c.kra_pin ?? '', credit_balance: String(c.credit_balance) });
    setDialogOpen(true);
  };

  const handleDelete = (id: number) =>
    Alert.alert('Delete Customer', 'Remove this customer?', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);

  const f = (key: keyof typeof form) => (val: string) => setForm((p) => ({ ...p, [key]: val }));

  const shareStatement = async () => {
    if (!statementCustomer || !statementSales) return;
    const rows = statementSales.map((s) =>
      `<tr><td>${s.invoice_no}</td><td>${dayjs(s.created_at).format('D MMM YYYY')}</td><td>${s.payment_method}</td><td style="text-align:right">KES ${s.total.toFixed(0)}</td><td>${s.status}</td></tr>`
    ).join('');
    const totalOwed = statementSales.filter((s) => s.payment_method === 'CREDIT' && s.status === 'PAID').reduce((sum, s) => sum + s.total, 0);
    const html = `<html><body style="font-family:sans-serif;padding:24px">
      <h2>${statementCustomer.name} — Account Statement</h2>
      <p>Phone: ${statementCustomer.phone ?? 'N/A'} &nbsp; Credit Balance: KES ${statementCustomer.credit_balance.toLocaleString()}</p>
      <p>Loyalty Points: ${(statementCustomer as any).loyalty_points ?? 0}</p>
      <hr/>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f5f5f5"><th>Invoice</th><th>Date</th><th>Payment</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <hr/><p><b>Generated:</b> ${dayjs().format('D MMM YYYY HH:mm')}</p>
    </body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${statementCustomer.name} Statement` });
  };
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Customers" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <Searchbar
        placeholder="Search customers..."
        value={search}
        onChangeText={setSearch}
        style={styles.searchbar}
      />

      <FlatList
        data={customers ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name}>{item.name}</Text>
                {item.phone && <Text style={styles.sub}>{item.phone}</Text>}
                {item.kra_pin && <Text style={[styles.sub, { fontSize: 10, color: '#999' }]}>KRA: {item.kra_pin}</Text>}
                <View style={styles.badgeRow}>
                  {item.credit_balance < 0 && (
                    <Chip compact icon="alert-circle-outline"
                      style={[styles.badge, { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5' }]}
                      textStyle={{ fontSize: 10, color: '#dc2626', fontWeight: '700' }}>
                      Owes KES {Math.abs(item.credit_balance).toLocaleString('en-KE')}
                    </Chip>
                  )}
                  {item.credit_balance > 0 && (
                    <Chip compact style={[styles.badge, { backgroundColor: '#f0fdf4' }]}
                      textStyle={{ fontSize: 10, color: '#16a34a' }}>
                      Credit KES {item.credit_balance.toLocaleString('en-KE')}
                    </Chip>
                  )}
                  {(item as any).loyalty_points > 0 && (
                    <Chip compact style={[styles.badge, { backgroundColor: '#fffbeb' }]} textStyle={{ fontSize: 10, color: '#92400e' }}
                      icon="star">
                      {(item as any).loyalty_points} pts
                    </Chip>
                  )}
                </View>
              </View>
              <Menu
                visible={menuId === item.id}
                onDismiss={() => setMenuId(null)}
                anchor={<Appbar.Action icon="dots-vertical" size={20} onPress={() => setMenuId(item.id)} />}
              >
                <Menu.Item onPress={() => { setMenuId(null); openEdit(item); }} title="Edit" />
                <Menu.Item onPress={() => { setMenuId(null); setStatementCustomer(item); }} title="View Statement" leadingIcon="file-document" />
                <Menu.Item onPress={() => { setMenuId(null); setLoyaltyCustomer(item); }} title="Loyalty Points" leadingIcon="star" />
                {item.credit_balance < 0 && (
                  <Menu.Item onPress={() => { setMenuId(null); router.push('/(app)/credit' as any); }} title="Manage Credit" leadingIcon="credit-card-clock-outline" titleStyle={{ color: '#6f67ff' }} />
                )}
                <Divider />
                <Menu.Item onPress={() => { setMenuId(null); handleDelete(item.id); }} title="Delete" titleStyle={{ color: '#e53935' }} />
              </Menu>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="account-multiple-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No customers yet. Add your first customer.</Text>
          </View>
        }
      />

      <FAB icon="account-plus" style={styles.fab} color="#fff" onPress={() => setDialogOpen(true)} />

      <Portal>
        {/* Edit/Add Customer */}
        <Dialog visible={dialogOpen} onDismiss={closeDialog}>
          <Dialog.Title>{editing ? 'Edit Customer' : 'Add Customer'}</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Name *" value={form.name} onChangeText={f('name')} mode="outlined" style={styles.input} />
            <TextInput label="Phone" value={form.phone} onChangeText={f('phone')} mode="outlined" keyboardType="phone-pad" style={styles.input} />
            <TextInput label="Email" value={form.email} onChangeText={f('email')} mode="outlined" keyboardType="email-address" style={styles.input} />
            <TextInput label="KRA PIN" value={form.kra_pin} onChangeText={f('kra_pin')} mode="outlined" style={styles.input} autoCapitalize="characters" placeholder="e.g. A012345678Z" />
            <TextInput label="Credit Balance (KES)" value={form.credit_balance} onChangeText={f('credit_balance')} mode="outlined" keyboardType="numeric" style={styles.input} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeDialog}>Cancel</Button>
            <Button mode="contained" onPress={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Customer Statement */}
        <Dialog visible={!!statementCustomer} onDismiss={() => setStatementCustomer(null)} style={styles.wideDialog}>
          <Dialog.Title>{statementCustomer?.name} — Statement</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 500 }}>
              <View style={styles.statRow}>
                <View style={styles.statBox}><Text style={styles.statVal}>KES {(statementCustomer?.credit_balance ?? 0).toLocaleString()}</Text><Text style={styles.statLabel}>Credit Balance</Text></View>
                <View style={styles.statBox}><Text style={styles.statVal}>{(statementSales ?? []).length}</Text><Text style={styles.statLabel}>Total Sales</Text></View>
                <View style={styles.statBox}><Text style={[styles.statVal, { color: '#f59e0b' }]}>{(statementCustomer as any)?.loyalty_points ?? 0}</Text><Text style={styles.statLabel}>Loyalty Pts</Text></View>
              </View>
              <Divider style={{ marginVertical: 10 }} />
              {(statementSales ?? []).map((s) => (
                <View key={s.id} style={styles.saleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.saleInv}>{s.invoice_no}</Text>
                    <Text style={styles.saleDate}>{dayjs(s.created_at).format('D MMM YYYY HH:mm')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.saleAmt, s.status === 'VOIDED' && { textDecorationLine: 'line-through', color: '#999' }]}>
                      KES {s.total.toFixed(0)}
                    </Text>
                    <Text style={styles.salePm}>{s.payment_method}</Text>
                  </View>
                </View>
              ))}
              {(statementSales ?? []).length === 0 && (
                <Text style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>No sales recorded</Text>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setStatementCustomer(null)}>Close</Button>
            <Button mode="contained" icon="share" onPress={shareStatement}>Share PDF</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Loyalty Points */}
        <Dialog visible={!!loyaltyCustomer} onDismiss={() => setLoyaltyCustomer(null)} style={styles.wideDialog}>
          <Dialog.Title>Loyalty Points — {loyaltyCustomer?.name}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView style={{ maxHeight: 460 }}>
              <View style={styles.loyaltyBalance}>
                <Text style={styles.loyaltyBalNum}>{(loyaltyCustomer as any)?.loyalty_points ?? 0}</Text>
                <Text style={styles.loyaltyBalLabel}>Current Points</Text>
              </View>
              <Divider style={{ marginVertical: 10 }} />
              <Text style={styles.sectionLabel}>Adjust Points Manually</Text>
              <TextInput
                label="Points (use - to deduct)"
                value={adjustPoints}
                onChangeText={setAdjustPoints}
                keyboardType="numbers-and-punctuation"
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Reason"
                value={adjustNote}
                onChangeText={setAdjustNote}
                mode="outlined"
                style={styles.input}
              />
              <Button mode="outlined" onPress={() => loyaltyAdjustMutation.mutate()} loading={loyaltyAdjustMutation.isPending} style={{ marginBottom: 16 }}>
                Apply Adjustment
              </Button>
              <Divider style={{ marginBottom: 10 }} />
              <Text style={styles.sectionLabel}>History</Text>
              {(loyaltyHistory ?? []).map((tx) => (
                <View key={tx.id} style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txNote}>{tx.note ?? tx.type}</Text>
                    <Text style={styles.txDate}>{dayjs(tx.created_at).format('D MMM HH:mm')}</Text>
                  </View>
                  <Text style={[styles.txPoints, { color: tx.points_change > 0 ? '#22c55e' : '#e53935' }]}>
                    {tx.points_change > 0 ? '+' : ''}{tx.points_change}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setLoyaltyCustomer(null)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: { backgroundColor: C.accent },
    headerTitle: { color: '#fff', fontWeight: '700' },
    searchbar: { margin: 12, elevation: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    list: { paddingHorizontal: 12, paddingBottom: 80 },
    card: { marginBottom: 8, borderRadius: 10 },
    cardContent: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
    name: { fontSize: 15, fontWeight: '700', color: C.text },
    sub: { fontSize: 12, color: C.muted, marginTop: 2 },
    badgeRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
    badge: { borderRadius: 6 },
    creditPosBg: { backgroundColor: '#f0fdf4' },
    creditNegBg: { backgroundColor: '#fef2f2' },
    empty: { padding: 40, alignItems: 'center' },
    emptyText: { color: C.muted, textAlign: 'center', marginTop: 10 },
    fab: { position: 'absolute', right: 20, bottom: 20, backgroundColor: C.accent },
    input: { marginBottom: 10 },
    wideDialog: { marginHorizontal: 8 },
    statRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 8 },
    statBox: { alignItems: 'center' },
    statVal: { fontSize: 18, fontWeight: '800', color: C.accent },
    statLabel: { fontSize: 11, color: C.muted, marginTop: 2 },
    saleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    saleInv: { fontSize: 13, fontWeight: '600', color: C.text },
    saleDate: { fontSize: 11, color: C.muted, marginTop: 2 },
    saleAmt: { fontSize: 13, fontWeight: '700', color: C.accent },
    salePm: { fontSize: 11, color: C.muted },
    loyaltyBalance: { alignItems: 'center', paddingVertical: 12 },
    loyaltyBalNum: { fontSize: 40, fontWeight: '800', color: '#f59e0b' },
    loyaltyBalLabel: { fontSize: 13, color: C.muted, marginTop: 4 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: C.muted, marginBottom: 6 },
    txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    txNote: { fontSize: 13, color: C.text },
    txDate: { fontSize: 11, color: C.muted, marginTop: 2 },
    txPoints: { fontSize: 15, fontWeight: '700' },
  });
}
