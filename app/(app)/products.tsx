import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, Appbar, Searchbar, FAB, Portal, Dialog, TextInput, Button, Chip, Switch, Card, Menu, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productQueries, Product, Category } from '../../src/db/products';
import { brand } from '../../src/theme';

type DialogMode = 'product' | 'category' | null;

const EMPTY_PRODUCT = { name: '', price: '', cost: '', barcode: '', stock_qty: '0', track_stock: true, vat_rate: '16', category_id: null as number | null };

export default function ProductsScreen() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...EMPTY_PRODUCT });
  const [catName, setCatName] = useState('');
  const [menuId, setMenuId] = useState<number | null>(null);

  const { data: products } = useQuery({ queryKey: ['products', search], queryFn: () => productQueries.getAll(search) });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: productQueries.getCategories });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        name: form.name.trim(),
        price: parseFloat(form.price) || 0,
        cost: parseFloat(form.cost) || 0,
        barcode: form.barcode.trim() || null,
        stock_qty: parseInt(form.stock_qty) || 0,
        track_stock: form.track_stock ? 1 : 0,
        vat_rate: parseFloat(form.vat_rate) || 0,
        category_id: form.category_id,
        image_uri: null,
        is_active: 1,
      };
      if (editing) await productQueries.update(editing.id, data);
      else await productQueries.create(data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); closeDialog(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productQueries.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const catMutation = useMutation({
    mutationFn: () => productQueries.createCategory(catName.trim(), brand.primary),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); closeDialog(); },
  });

  const closeDialog = () => { setDialog(null); setEditing(null); setForm({ ...EMPTY_PRODUCT }); setCatName(''); };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, price: String(p.price), cost: String(p.cost),
      barcode: p.barcode ?? '', stock_qty: String(p.stock_qty),
      track_stock: p.track_stock === 1, vat_rate: String(p.vat_rate),
      category_id: p.category_id,
    });
    setDialog('product');
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete Product', 'Mark this product as inactive?', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Products" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="tag-plus" color="#fff" onPress={() => setDialog('category')} />
      </Appbar.Header>

      <Searchbar
        placeholder="Search products..."
        value={search}
        onChangeText={setSearch}
        style={styles.searchbar}
      />

      <FlatList
        data={products ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.productCard}>
            <Card.Content style={styles.productContent}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productSub}>{item.category_name ?? 'Uncategorized'}</Text>
                {item.track_stock === 1 && (
                  <Chip compact style={[styles.stockChip, item.stock_qty < 5 && styles.lowChip]} textStyle={{ fontSize: 10 }}>
                    Stock: {item.stock_qty}
                  </Chip>
                )}
              </View>
              <View style={styles.priceCol}>
                <Text style={styles.price}>KES {item.price.toLocaleString()}</Text>
                <Text style={styles.vatLabel}>VAT {item.vat_rate}%</Text>
              </View>
              <Menu
                visible={menuId === item.id}
                onDismiss={() => setMenuId(null)}
                anchor={
                  <Appbar.Action icon="dots-vertical" size={20} onPress={() => setMenuId(item.id)} />
                }
              >
                <Menu.Item onPress={() => { setMenuId(null); openEdit(item); }} title="Edit" />
                <Divider />
                <Menu.Item onPress={() => { setMenuId(null); handleDelete(item.id); }} title="Delete" titleStyle={{ color: '#e53935' }} />
              </Menu>
            </Card.Content>
          </Card>
        )}
      />

      <FAB icon="plus" style={styles.fab} color="#fff" onPress={() => setDialog('product')} />

      <Portal>
        {/* Product Dialog */}
        <Dialog visible={dialog === 'product'} onDismiss={closeDialog}>
          <Dialog.Title>{editing ? 'Edit Product' : 'Add Product'}</Dialog.Title>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView>
              <Dialog.Content>
                <TextInput label="Product Name *" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} mode="outlined" style={styles.input} />
                <View style={styles.row}>
                  <TextInput label="Selling Price (KES) *" value={form.price} onChangeText={(v) => setForm((f) => ({ ...f, price: v }))} mode="outlined" keyboardType="numeric" style={[styles.input, { flex: 1, marginRight: 8 }]} />
                  <TextInput label="Cost (KES)" value={form.cost} onChangeText={(v) => setForm((f) => ({ ...f, cost: v }))} mode="outlined" keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
                </View>
                <View style={styles.row}>
                  <TextInput label="VAT Rate (%)" value={form.vat_rate} onChangeText={(v) => setForm((f) => ({ ...f, vat_rate: v }))} mode="outlined" keyboardType="numeric" style={[styles.input, { flex: 1, marginRight: 8 }]} />
                  <TextInput label="Barcode" value={form.barcode} onChangeText={(v) => setForm((f) => ({ ...f, barcode: v }))} mode="outlined" style={[styles.input, { flex: 1 }]} />
                </View>
                <View style={styles.switchRow}>
                  <Text>Track Stock</Text>
                  <Switch value={form.track_stock} onValueChange={(v) => setForm((f) => ({ ...f, track_stock: v }))} color={brand.primary} />
                </View>
                {form.track_stock && (
                  <TextInput label="Stock Quantity" value={form.stock_qty} onChangeText={(v) => setForm((f) => ({ ...f, stock_qty: v }))} mode="outlined" keyboardType="numeric" style={styles.input} />
                )}
                {(categories?.length ?? 0) > 0 && (
                  <View>
                    <Text style={styles.sectionLabel}>Category</Text>
                    <View style={styles.catRow}>
                      <Chip
                        selected={form.category_id === null}
                        onPress={() => setForm((f) => ({ ...f, category_id: null }))}
                        style={{ marginRight: 6, marginBottom: 6 }}
                        compact
                      >
                        None
                      </Chip>
                      {categories!.map((c) => (
                        <Chip
                          key={c.id}
                          selected={form.category_id === c.id}
                          onPress={() => setForm((f) => ({ ...f, category_id: c.id }))}
                          style={{ marginRight: 6, marginBottom: 6 }}
                          compact
                        >
                          {c.name}
                        </Chip>
                      ))}
                    </View>
                  </View>
                )}
              </Dialog.Content>
            </ScrollView>
          </KeyboardAvoidingView>
          <Dialog.Actions>
            <Button onPress={closeDialog}>Cancel</Button>
            <Button mode="contained" onPress={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Category Dialog */}
        <Dialog visible={dialog === 'category'} onDismiss={closeDialog}>
          <Dialog.Title>Add Category</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Category Name" value={catName} onChangeText={setCatName} mode="outlined" />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeDialog}>Cancel</Button>
            <Button mode="contained" onPress={() => catMutation.mutate()} loading={catMutation.isPending}>Add</Button>
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
  productCard: { marginBottom: 8, borderRadius: 10 },
  productContent: { flexDirection: 'row', alignItems: 'center' },
  productName: { fontSize: 14, fontWeight: '700', color: '#111' },
  productSub: { fontSize: 12, color: '#888', marginTop: 2 },
  stockChip: { alignSelf: 'flex-start', marginTop: 4 },
  lowChip: { backgroundColor: '#fce4e4' },
  priceCol: { alignItems: 'flex-end', marginRight: 4 },
  price: { fontSize: 15, fontWeight: '700', color: brand.primary },
  vatLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  fab: { position: 'absolute', right: 20, bottom: 20, backgroundColor: brand.primary },
  input: { marginBottom: 10, backgroundColor: '#fff' },
  row: { flexDirection: 'row' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 12, color: '#666', marginBottom: 6, marginTop: 4 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap' },
});
