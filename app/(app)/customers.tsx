import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, Appbar, Searchbar, FAB, Portal, Dialog, TextInput, Button, Card, Menu, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerQueries, Customer } from '../../src/db/customers';
import { brand } from '../../src/theme';

const EMPTY = { name: '', phone: '', email: '', credit_balance: '0' };

export default function CustomersScreen() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [menuId, setMenuId] = useState<number | null>(null);

  const { data: customers } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => customerQueries.getAll(search),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
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

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm({ ...EMPTY }); };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', credit_balance: String(c.credit_balance) });
    setDialogOpen(true);
  };

  const handleDelete = (id: number) =>
    Alert.alert('Delete Customer', 'Remove this customer?', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);

  const f = (key: keyof typeof form) => (val: string) => setForm((p) => ({ ...p, [key]: val }));

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
                {item.credit_balance !== 0 && (
                  <Text style={[styles.credit, item.credit_balance > 0 ? styles.creditPos : styles.creditNeg]}>
                    Balance: KES {item.credit_balance.toLocaleString()}
                  </Text>
                )}
              </View>
              <Menu
                visible={menuId === item.id}
                onDismiss={() => setMenuId(null)}
                anchor={<Appbar.Action icon="dots-vertical" size={20} onPress={() => setMenuId(item.id)} />}
              >
                <Menu.Item onPress={() => { setMenuId(null); openEdit(item); }} title="Edit" />
                <Divider />
                <Menu.Item onPress={() => { setMenuId(null); handleDelete(item.id); }} title="Delete" titleStyle={{ color: '#e53935' }} />
              </Menu>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No customers yet. Add your first customer.</Text>
          </View>
        }
      />

      <FAB icon="account-plus" style={styles.fab} color="#fff" onPress={() => setDialogOpen(true)} />

      <Portal>
        <Dialog visible={dialogOpen} onDismiss={closeDialog}>
          <Dialog.Title>{editing ? 'Edit Customer' : 'Add Customer'}</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Name *" value={form.name} onChangeText={f('name')} mode="outlined" style={styles.input} />
            <TextInput label="Phone" value={form.phone} onChangeText={f('phone')} mode="outlined" keyboardType="phone-pad" style={styles.input} />
            <TextInput label="Email" value={form.email} onChangeText={f('email')} mode="outlined" keyboardType="email-address" style={styles.input} />
            <TextInput label="Credit Balance (KES)" value={form.credit_balance} onChangeText={f('credit_balance')} mode="outlined" keyboardType="numeric" style={styles.input} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeDialog}>Cancel</Button>
            <Button mode="contained" onPress={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save</Button>
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
  searchbar: { margin: 12, elevation: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0' },
  list: { paddingHorizontal: 12, paddingBottom: 80 },
  card: { marginBottom: 8, borderRadius: 10 },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#888', marginTop: 2 },
  credit: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  creditPos: { color: '#22c55e' },
  creditNeg: { color: '#e53935' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#aaa', textAlign: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 20, backgroundColor: brand.primary },
  input: { marginBottom: 10, backgroundColor: '#fff' },
});
