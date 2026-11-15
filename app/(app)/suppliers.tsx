import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, Button, Appbar, Searchbar, Card, Portal, Dialog, TextInput, FAB, Chip } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supplierQueries, Supplier } from '../../src/db/suppliers';
import { useTheme } from '../../src/context/theme';

const EMPTY: Omit<Supplier, 'id' | 'created_at'> = {
  name: '', phone: null, email: null, address: null, notes: null,
};

export default function SuppliersScreen() {
  const qc = useQueryClient();
  const { colors: C } = useTheme();
  const [search, setSearch] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () => supplierQueries.getAll(search),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Name is required');
      if (editing) {
        await supplierQueries.update(editing.id, form);
      } else {
        await supplierQueries.create({ ...form, name: form.name.trim() });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      setDialogVisible(false);
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => supplierQueries.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setDialogVisible(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, phone: s.phone, email: s.email, address: s.address, notes: s.notes });
    setDialogVisible(true);
  };

  const confirmDelete = (s: Supplier) => {
    Alert.alert('Delete Supplier', `Delete "${s.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(s.id) },
    ]);
  };
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Suppliers" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <Searchbar
        placeholder="Search suppliers..."
        value={search}
        onChangeText={setSearch}
        style={styles.searchbar}
      />

      <FlatList
        data={suppliers ?? []}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.card} onPress={() => openEdit(item)}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.supplierIcon}>
                <MaterialCommunityIcons name="truck" size={24} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                {item.phone && <Text style={styles.detail}>{item.phone}</Text>}
                {item.email && <Text style={styles.detail}>{item.email}</Text>}
                {item.address && <Text style={styles.detail} numberOfLines={1}>{item.address}</Text>}
              </View>
              <Button compact icon="delete" textColor="#e53935" onPress={() => confirmDelete(item)} />
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="truck-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No suppliers yet</Text>
          </View>
        }
      />

      <FAB icon="plus" style={styles.fab} onPress={openNew} color="#fff" />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>{editing ? 'Edit Supplier' : 'New Supplier'}</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Name *" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} mode="outlined" style={styles.input} />
            <TextInput label="Phone" value={form.phone ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, phone: v || null }))} mode="outlined" keyboardType="phone-pad" style={styles.input} />
            <TextInput label="Email" value={form.email ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, email: v || null }))} mode="outlined" keyboardType="email-address" style={styles.input} />
            <TextInput label="Address" value={form.address ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, address: v || null }))} mode="outlined" multiline style={styles.input} />
            <TextInput label="Notes" value={form.notes ?? ''} onChangeText={(v) => setForm((f) => ({ ...f, notes: v || null }))} mode="outlined" multiline style={styles.input} />
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
    searchbar: { margin: 12, elevation: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    list: { padding: 12, gap: 8, paddingBottom: 80 },
    card: { borderRadius: 10 },
    cardContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    supplierIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent + '22', alignItems: 'center', justifyContent: 'center' },
    name: { fontSize: 15, fontWeight: '700', color: C.text },
    detail: { fontSize: 12, color: C.muted, marginTop: 2 },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyText: { color: C.muted, marginTop: 8, fontSize: 14 },
    fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: C.accent },
    input: { marginBottom: 10 },
  });
}
