import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, Button, Appbar, Card, Portal, Dialog, TextInput, FAB, Chip, Menu } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { expenseQueries, Expense, EXPENSE_CATEGORIES } from '../../src/db/expenses';
import { useSession } from '../../src/context/session';
import { useTheme } from '../../src/context/theme';
import dayjs from 'dayjs';

type Period = 'today' | 'week' | 'month';

export default function ExpensesScreen() {
  const qc = useQueryClient();
  const { user } = useSession();
  const { colors: C } = useTheme();
  const [period, setPeriod] = useState<Period>('today');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [form, setForm] = useState({
    category: EXPENSE_CATEGORIES[0],
    description: '',
    amount: '',
    payment_method: 'CASH',
    reference: '',
  });

  const ranges: Record<Period, { from: string; to: string }> = {
    today: { from: dayjs().format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
    week: { from: dayjs().startOf('week').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
    month: { from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().format('YYYY-MM-DD') },
  };
  const { from, to } = ranges[period];

  const { data: expenses } = useQuery({
    queryKey: ['expenses', from, to],
    queryFn: () => expenseQueries.getAll(from, to),
  });

  const { data: summary } = useQuery({
    queryKey: ['expense-summary', from, to],
    queryFn: () => expenseQueries.getSummary(from, to),
  });

  const totalExpenses = (expenses ?? []).reduce((s, e) => s + e.amount, 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(form.amount);
      if (!form.amount || isNaN(amount) || amount <= 0) throw new Error('Enter a valid amount');
      await expenseQueries.create({
        category: form.category,
        description: form.description.trim() || null,
        amount,
        payment_method: form.payment_method,
        reference: form.reference.trim() || null,
        cashier_id: user?.id ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expense-summary'] });
      setDialogVisible(false);
      setForm({ category: EXPENSE_CATEGORIES[0], description: '', amount: '', payment_method: 'CASH', reference: '' });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => expenseQueries.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expense-summary'] }); },
  });
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Expenses" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <View style={styles.tabs}>
        {(['today', 'week', 'month'] as Period[]).map((p) => (
          <Chip key={p} selected={period === p} onPress={() => setPeriod(p)} style={[styles.tab, period === p && styles.tabActive]} textStyle={[styles.tabText, period === p && { color: '#fff', fontWeight: '700' }]} compact>
            {p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'Month'}
          </Chip>
        ))}
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalAmount}>KES {totalExpenses.toLocaleString()}</Text>
        <Text style={styles.totalLabel}>Total Expenses</Text>
      </View>

      {(summary?.length ?? 0) > 0 && (
        <View style={styles.summaryRow}>
          {(summary ?? []).slice(0, 4).map((s) => (
            <Chip key={s.category} compact style={styles.summaryChip} textStyle={{ fontSize: 11 }}>
              {s.category}: {s.total.toFixed(0)}
            </Chip>
          ))}
        </View>
      )}

      <FlatList
        data={expenses ?? []}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Content style={styles.cardRow}>
              <View style={styles.catIcon}>
                <MaterialCommunityIcons name="receipt" size={20} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.expCat}>{item.category}</Text>
                {item.description && <Text style={styles.expDesc}>{item.description}</Text>}
                <Text style={styles.expDate}>{dayjs(item.created_at).format('D MMM HH:mm')} · {item.payment_method}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.expAmount}>KES {item.amount.toLocaleString()}</Text>
                <Button compact icon="delete" textColor="#e53935" onPress={() => Alert.alert('Delete?', 'Remove this expense?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) }])} />
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="receipt-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No expenses recorded</Text>
          </View>
        }
      />

      <FAB icon="plus" style={styles.fab} onPress={() => setDialogVisible(true)} color="#fff" />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>Record Expense</Dialog.Title>
          <Dialog.Content>
            <Menu
              visible={categoryMenuOpen}
              onDismiss={() => setCategoryMenuOpen(false)}
              anchor={
                <Button mode="outlined" onPress={() => setCategoryMenuOpen(true)} style={styles.input}>
                  Category: {form.category}
                </Button>
              }
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <Menu.Item key={c} title={c} onPress={() => { setForm((f) => ({ ...f, category: c })); setCategoryMenuOpen(false); }} />
              ))}
            </Menu>
            <TextInput
              label="Amount (KES) *"
              value={form.amount}
              onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
              keyboardType="decimal-pad"
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Description"
              value={form.description}
              onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Reference / Receipt No."
              value={form.reference}
              onChangeText={(v) => setForm((f) => ({ ...f, reference: v }))}
              mode="outlined"
              style={styles.input}
            />
            <View style={styles.pmRow}>
              {['CASH', 'MPESA', 'BANK'].map((pm) => (
                <Chip key={pm} selected={form.payment_method === pm} onPress={() => setForm((f) => ({ ...f, payment_method: pm }))} style={styles.pmChip} compact>
                  {pm}
                </Chip>
              ))}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save</Button>
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
    tabs: { flexDirection: 'row', padding: 12, gap: 8 },
    tab: { flex: 1, backgroundColor: C.elevated },
    tabActive: { backgroundColor: C.accent },
    tabText: { fontSize: 12, textAlign: 'center' },
    totalCard: { alignItems: 'center', paddingVertical: 16, backgroundColor: C.surface, marginHorizontal: 12, borderRadius: 12, elevation: 1, marginBottom: 8 },
    totalAmount: { fontSize: 28, fontWeight: '800', color: C.danger },
    totalLabel: { fontSize: 12, color: C.muted, marginTop: 4 },
    summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, marginBottom: 8 },
    summaryChip: { backgroundColor: C.elevated },
    list: { padding: 12, gap: 8, paddingBottom: 80 },
    card: { borderRadius: 10 },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    catIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent + '22', alignItems: 'center', justifyContent: 'center' },
    expCat: { fontSize: 14, fontWeight: '700', color: C.text },
    expDesc: { fontSize: 12, color: C.muted, marginTop: 2 },
    expDate: { fontSize: 11, color: C.muted, marginTop: 2 },
    expAmount: { fontSize: 15, fontWeight: '700', color: C.danger },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyText: { color: C.muted, marginTop: 8, fontSize: 14 },
    fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: C.accent },
    input: { marginBottom: 10 },
    pmRow: { flexDirection: 'row', gap: 8 },
    pmChip: { flex: 1 },
  });
}
