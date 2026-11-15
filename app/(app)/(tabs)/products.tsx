import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert, KeyboardAvoidingView, Platform, ScrollView, Image, Pressable } from 'react-native';
import { Text, Appbar, Searchbar, FAB, Portal, Dialog, TextInput, Button, Chip, Switch, Card, Menu, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { productQueries, Product, Category } from '../../../src/db/products';
import { wastageQueries, WASTAGE_REASONS } from '../../../src/db/wastage';
import { variantQueries, ProductVariant } from '../../../src/db/variants';
import { useSession } from '../../../src/context/session';
import { useTheme } from '../../../src/context/theme';

type DialogMode = 'product' | 'category' | 'barcode' | 'wastage' | 'variants' | null;

const EMPTY_PRODUCT = {
  name: '', price: '', cost: '', barcode: '', stock_qty: '0',
  track_stock: true, vat_rate: '16', category_id: null as number | null, image_uri: null as string | null,
  low_stock_threshold: '5', reorder_qty: '10',
};

const PRESET_COLORS = ['#1db8a0', '#6f67ff', '#f59e0b', '#e53935', '#22c55e', '#3b82f6', '#ec4899', '#8b5cf6', '#f97316', '#64748b'];

export default function ProductsScreen() {
  const qc = useQueryClient();
  const { user } = useSession();
  const { colors: C } = useTheme();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...EMPTY_PRODUCT });
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState(C.accent);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [lastScan, setLastScan] = useState('');
  const [wastageProduct, setWastageProduct] = useState<Product | null>(null);
  const [wastageQty, setWastageQty] = useState('');
  const [wastageReason, setWastageReason] = useState(WASTAGE_REASONS[0]);

  // Variants
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantForm, setVariantForm] = useState({ name: '', sku: '', price_adj: '', stock: '' });
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [variantFormOpen, setVariantFormOpen] = useState(false);

  const { data: products } = useQuery({ queryKey: ['products', search], queryFn: () => productQueries.getAll(search) });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: productQueries.getCategories });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        name: form.name.trim(), price: parseFloat(form.price) || 0, cost: parseFloat(form.cost) || 0,
        barcode: form.barcode.trim() || null, stock_qty: parseInt(form.stock_qty) || 0,
        track_stock: form.track_stock ? 1 : 0, vat_rate: parseFloat(form.vat_rate) || 0,
        category_id: form.category_id, image_uri: form.image_uri, is_active: 1,
        low_stock_threshold: parseFloat(form.low_stock_threshold) || 0,
        reorder_qty: parseFloat(form.reorder_qty) || 0,
      };
      if (editing) await productQueries.update(editing.id, data);
      else await productQueries.create(data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); closeDialog(); },
  });

  const wastageMutation = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(wastageQty);
      if (!wastageProduct || isNaN(qty) || qty <= 0) throw new Error('Enter a valid quantity');
      await wastageQueries.record({
        product_id: wastageProduct.id,
        product_name: wastageProduct.name,
        qty,
        reason: wastageReason,
        cost: wastageProduct.cost * qty,
        user_id: user?.id ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setDialog(null);
      setWastageProduct(null);
      setWastageQty('');
      Alert.alert('Recorded', 'Wastage has been logged and stock adjusted.');
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productQueries.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const catMutation = useMutation({
    mutationFn: () => productQueries.createCategory(catName.trim(), catColor),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); closeDialog(); },
  });

  const saveVariantMutation = useMutation({
    mutationFn: async () => {
      if (!variantProduct) return;
      const data = {
        product_id: variantProduct.id,
        variant_name: variantForm.name.trim(),
        sku: variantForm.sku.trim() || null,
        price_adjustment: parseFloat(variantForm.price_adj) || 0,
        stock_qty: parseFloat(variantForm.stock) || 0,
        barcode: null,
        is_active: 1,
      };
      if (editingVariant) await variantQueries.update(editingVariant.id, data);
      else await variantQueries.create(data);
    },
    onSuccess: async () => {
      if (variantProduct) {
        const updated = await variantQueries.getByProduct(variantProduct.id);
        setVariants(updated);
      }
      setVariantFormOpen(false);
      setEditingVariant(null);
      setVariantForm({ name: '', sku: '', price_adj: '', stock: '' });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const deleteVariantMutation = useMutation({
    mutationFn: (id: number) => variantQueries.delete(id),
    onSuccess: async () => {
      if (variantProduct) {
        const updated = await variantQueries.getByProduct(variantProduct.id);
        setVariants(updated);
      }
    },
  });

  const openVariants = async (p: Product) => {
    setVariantProduct(p);
    const list = await variantQueries.getByProduct(p.id);
    setVariants(list);
    setDialog('variants');
  };

  const closeDialog = () => { setDialog(null); setEditing(null); setForm({ ...EMPTY_PRODUCT }); setCatName(''); setCatColor(C.accent); };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, price: String(p.price), cost: String(p.cost), barcode: p.barcode ?? '',
      stock_qty: String(p.stock_qty), track_stock: p.track_stock === 1, vat_rate: String(p.vat_rate),
      category_id: p.category_id, image_uri: p.image_uri,
      low_stock_threshold: String((p as any).low_stock_threshold ?? 5),
      reorder_qty: String((p as any).reorder_qty ?? 10),
    });
    setDialog('product');
  };

  const handleDelete = (id: number) => Alert.alert('Delete Product', 'Mark this product as inactive?', [
    { text: 'Cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
  ]);

  const openBarcodeScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) { Alert.alert('Permission needed', 'Camera permission required.'); return; }
    }
    setDialog('barcode');
  };

  const handleBarcodeScan = ({ data }: { data: string }) => {
    if (data === lastScan) return;
    setLastScan(data);
    setForm((f) => ({ ...f, barcode: data }));
    setDialog('product');
    setTimeout(() => setLastScan(''), 2000);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!result.canceled) setForm((f) => ({ ...f, image_uri: result.assets[0].uri }));
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Camera permission required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!result.canceled) setForm((f) => ({ ...f, image_uri: result.assets[0].uri }));
  };
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Products" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="tag-plus" color="#fff" onPress={() => setDialog('category')} />
      </Appbar.Header>

      <Searchbar placeholder="Search products..." value={search} onChangeText={setSearch} style={styles.searchbar} />

      <FlatList
        data={products ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.productCard}>
            <Card.Content style={styles.productContent}>
              {item.image_uri ? (
                <Image source={{ uri: item.image_uri }} style={styles.productImage} />
              ) : (
                <View style={styles.productImagePlaceholder}>
                  <MaterialCommunityIcons name="package-variant" size={24} color="#ccc" />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productSub}>{item.category_name ?? 'Uncategorized'}</Text>
                {item.barcode && <Text style={styles.barcode}>{item.barcode}</Text>}
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
                anchor={<Appbar.Action icon="dots-vertical" size={20} onPress={() => setMenuId(item.id)} />}
              >
                <Menu.Item onPress={() => { setMenuId(null); openEdit(item); }} title="Edit" />
                <Menu.Item onPress={() => { setMenuId(null); setWastageProduct(item); setWastageQty(''); setWastageReason(WASTAGE_REASONS[0]); setDialog('wastage'); }} title="Record Wastage" leadingIcon="trash-can" />
                <Menu.Item onPress={() => { setMenuId(null); openVariants(item); }} title="Manage Variants" leadingIcon="tag-multiple" />
                <Divider />
                <Menu.Item onPress={() => { setMenuId(null); handleDelete(item.id); }} title="Delete" titleStyle={{ color: '#e53935' }} />
              </Menu>
            </Card.Content>
          </Card>
        )}
      />

      <FAB icon="plus" style={styles.fab} color="#fff" onPress={() => setDialog('product')} />

      <Portal>
        {/* Barcode Scanner */}
        <Dialog visible={dialog === 'barcode'} onDismiss={() => setDialog('product')}>
          <Dialog.Title>Scan Barcode</Dialog.Title>
          <Dialog.Content style={{ height: 280 }}>
            {dialog === 'barcode' && (
              <CameraView
                style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr'] }}
                onBarcodeScanned={handleBarcodeScan}
              />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialog('product')}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Product Dialog */}
        <Dialog visible={dialog === 'product'} onDismiss={closeDialog}>
          <Dialog.Title>{editing ? 'Edit Product' : 'Add Product'}</Dialog.Title>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView>
              <Dialog.Content>
                {/* Product Image */}
                <View style={styles.imageRow}>
                  {form.image_uri ? (
                    <Image source={{ uri: form.image_uri }} style={styles.imagePreview} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <MaterialCommunityIcons name="image-outline" size={36} color="#ccc" />
                    </View>
                  )}
                  <View style={styles.imageButtons}>
                    <Button mode="outlined" onPress={pickImage} compact icon="image" style={{ marginBottom: 6 }}>Gallery</Button>
                    <Button mode="outlined" onPress={takePhoto} compact icon="camera">Camera</Button>
                  </View>
                </View>

                <TextInput label="Product Name *" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} mode="outlined" style={styles.input} />
                <View style={styles.row}>
                  <TextInput label="Selling Price (KES) *" value={form.price} onChangeText={(v) => setForm((f) => ({ ...f, price: v }))} mode="outlined" keyboardType="numeric" style={[styles.input, { flex: 1, marginRight: 8 }]} />
                  <TextInput label="Cost (KES)" value={form.cost} onChangeText={(v) => setForm((f) => ({ ...f, cost: v }))} mode="outlined" keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
                </View>
                <View style={styles.row}>
                  <TextInput label="VAT Rate (%)" value={form.vat_rate} onChangeText={(v) => setForm((f) => ({ ...f, vat_rate: v }))} mode="outlined" keyboardType="numeric" style={[styles.input, { flex: 1, marginRight: 8 }]} />
                  <View style={[styles.input, { flex: 1, flexDirection: 'row', alignItems: 'center' }]}>
                    <TextInput label="Barcode" value={form.barcode} onChangeText={(v) => setForm((f) => ({ ...f, barcode: v }))} mode="outlined" style={{ flex: 1 }} />
                    <Pressable onPress={openBarcodeScanner} style={styles.scanBtn}>
                      <MaterialCommunityIcons name="barcode-scan" size={22} color={C.accent} />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.switchRow}>
                  <Text>Track Stock</Text>
                  <Switch value={form.track_stock} onValueChange={(v) => setForm((f) => ({ ...f, track_stock: v }))} color={C.accent} />
                </View>
                {form.track_stock && (
                  <>
                    <TextInput label="Stock Quantity" value={form.stock_qty} onChangeText={(v) => setForm((f) => ({ ...f, stock_qty: v }))} mode="outlined" keyboardType="numeric" style={styles.input} />
                    <View style={styles.row}>
                      <TextInput label="Low Stock Alert at" value={form.low_stock_threshold} onChangeText={(v) => setForm((f) => ({ ...f, low_stock_threshold: v }))} mode="outlined" keyboardType="numeric" style={[styles.input, { flex: 1, marginRight: 8 }]} />
                      <TextInput label="Reorder Qty" value={form.reorder_qty} onChangeText={(v) => setForm((f) => ({ ...f, reorder_qty: v }))} mode="outlined" keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
                    </View>
                  </>
                )}
                {(categories?.length ?? 0) > 0 && (
                  <View>
                    <Text style={styles.sectionLabel}>Category</Text>
                    <View style={styles.catRow}>
                      <Chip selected={form.category_id === null} onPress={() => setForm((f) => ({ ...f, category_id: null }))} style={{ marginRight: 6, marginBottom: 6 }} compact>None</Chip>
                      {categories!.map((c) => (
                        <Chip key={c.id} selected={form.category_id === c.id} onPress={() => setForm((f) => ({ ...f, category_id: c.id }))} style={{ marginRight: 6, marginBottom: 6, backgroundColor: c.color + '33' }} compact>{c.name}</Chip>
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

        {/* Wastage Dialog */}
        <Dialog visible={dialog === 'wastage'} onDismiss={() => setDialog(null)}>
          <Dialog.Title>Record Wastage</Dialog.Title>
          <Dialog.Content>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 10 }}>{wastageProduct?.name}</Text>
            <TextInput label="Quantity *" value={wastageQty} onChangeText={setWastageQty} keyboardType="decimal-pad" mode="outlined" style={{ marginBottom: 10 }} autoFocus />
            <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Reason</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {WASTAGE_REASONS.map((r) => (
                <Chip key={r} selected={wastageReason === r} onPress={() => setWastageReason(r)} compact>{r}</Chip>
              ))}
            </View>
            {wastageProduct && wastageQty && (
              <Text style={{ marginTop: 10, fontSize: 12, color: '#888' }}>
                Estimated cost: KES {(wastageProduct.cost * (parseFloat(wastageQty) || 0)).toFixed(0)}
              </Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialog(null)}>Cancel</Button>
            <Button mode="contained" onPress={() => wastageMutation.mutate()} loading={wastageMutation.isPending}>Record</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Variants Dialog */}
        <Dialog visible={dialog === 'variants'} onDismiss={() => { setDialog(null); setVariantProduct(null); }}>
          <Dialog.ScrollArea style={{ maxHeight: 500 }}>
            <Dialog.Title>{variantProduct?.name} â€” Variants</Dialog.Title>
            <View style={{ padding: 16 }}>
              {variants.length === 0 && <Text style={{ color: '#aaa', marginBottom: 12 }}>No variants yet. Add sizes, colours, etc.</Text>}
              {variants.map((v) => (
                <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>{v.variant_name}</Text>
                    <Text style={{ fontSize: 12, color: '#888' }}>
                      {v.sku ? `SKU: ${v.sku}  ` : ''}
                      {v.price_adjustment !== 0 ? `${v.price_adjustment > 0 ? '+' : ''}KES${v.price_adjustment}  ` : ''}
                      Stock: {v.stock_qty}
                    </Text>
                  </View>
                  <Button compact icon="pencil" onPress={() => { setEditingVariant(v); setVariantForm({ name: v.variant_name, sku: v.sku ?? '', price_adj: String(v.price_adjustment), stock: String(v.stock_qty) }); setVariantFormOpen(true); }}>Edit</Button>
                  <Button compact icon="delete" textColor="#e53935" onPress={() => Alert.alert('Delete Variant', 'Remove this variant?', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteVariantMutation.mutate(v.id) }])}>Del</Button>
                </View>
              ))}
              <Button mode="outlined" icon="plus" style={{ marginTop: 12 }} onPress={() => { setEditingVariant(null); setVariantForm({ name: '', sku: '', price_adj: '', stock: '' }); setVariantFormOpen(true); }}>
                Add Variant
              </Button>
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => { setDialog(null); setVariantProduct(null); }}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Variant Form Dialog */}
        <Dialog visible={variantFormOpen} onDismiss={() => setVariantFormOpen(false)}>
          <Dialog.Title>{editingVariant ? 'Edit Variant' : 'Add Variant'}</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Variant Name *" value={variantForm.name} onChangeText={(v) => setVariantForm(f => ({ ...f, name: v }))} mode="outlined" style={{ marginBottom: 10 }} placeholder="e.g. Small, Red, 1L" autoFocus />
            <TextInput label="SKU (optional)" value={variantForm.sku} onChangeText={(v) => setVariantForm(f => ({ ...f, sku: v }))} mode="outlined" style={{ marginBottom: 10 }} />
            <TextInput label="Price Adjustment (KES, can be negative)" value={variantForm.price_adj} onChangeText={(v) => setVariantForm(f => ({ ...f, price_adj: v }))} mode="outlined" keyboardType="decimal-pad" style={{ marginBottom: 10 }} />
            <TextInput label="Stock Qty" value={variantForm.stock} onChangeText={(v) => setVariantForm(f => ({ ...f, stock: v }))} mode="outlined" keyboardType="decimal-pad" />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setVariantFormOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => saveVariantMutation.mutate()} loading={saveVariantMutation.isPending}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Category Dialog */}
        <Dialog visible={dialog === 'category'} onDismiss={closeDialog}>
          <Dialog.Title>Add Category</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Category Name" value={catName} onChangeText={setCatName} mode="outlined" style={{ marginBottom: 16 }} />
            <Text style={styles.sectionLabel}>Category Colour</Text>
            <View style={styles.colorGrid}>
              {PRESET_COLORS.map((c) => (
                <Pressable key={c} style={[styles.colorSwatch, { backgroundColor: c }, catColor === c && styles.colorSelected]} onPress={() => setCatColor(c)} />
              ))}
            </View>
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

function makeStyles(C: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: { backgroundColor: C.accent },
    headerTitle: { color: '#fff', fontWeight: '700' },
    searchbar: { margin: 12, elevation: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    list: { paddingHorizontal: 12, paddingBottom: 80 },
    productCard: { marginBottom: 8, borderRadius: 10 },
    productContent: { flexDirection: 'row', alignItems: 'center' },
    productImage: { width: 48, height: 48, borderRadius: 8 },
    productImagePlaceholder: { width: 48, height: 48, borderRadius: 8, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' },
    productName: { fontSize: 14, fontWeight: '700', color: C.text },
    productSub: { fontSize: 12, color: C.muted, marginTop: 2 },
    barcode: { fontSize: 10, color: C.muted, marginTop: 1, fontFamily: 'monospace' },
    stockChip: { alignSelf: 'flex-start', marginTop: 4 },
    lowChip: { backgroundColor: '#fce4e4' },
    priceCol: { alignItems: 'flex-end', marginRight: 4 },
    price: { fontSize: 15, fontWeight: '700', color: C.accent },
    vatLabel: { fontSize: 11, color: C.muted, marginTop: 2 },
    fab: { position: 'absolute', right: 20, bottom: 20, backgroundColor: C.accent },
    input: { marginBottom: 10 },
    row: { flexDirection: 'row' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
    sectionLabel: { fontSize: 12, color: C.muted, marginBottom: 6, marginTop: 4 },
    catRow: { flexDirection: 'row', flexWrap: 'wrap' },
    imageRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    imagePreview: { width: 72, height: 72, borderRadius: 8 },
    imagePlaceholder: { width: 72, height: 72, borderRadius: 8, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
    imageButtons: { flex: 1, marginLeft: 12 },
    scanBtn: { padding: 8 },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    colorSwatch: { width: 36, height: 36, borderRadius: 18 },
    colorSelected: { borderWidth: 3, borderColor: C.text },
  });
}
