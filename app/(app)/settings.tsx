import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, Appbar, Card, TextInput, Button, Divider, List, Portal, Dialog, DataTable } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getBusinessInfo, setSetting } from '../../src/db/settings';
import { getDb } from '../../src/db/database';
import { shiftQueries } from '../../src/db/shifts';
import { stockLogQueries } from '../../src/db/stock_log';
import { useSession } from '../../src/context/session';
import { brand } from '../../src/theme';
import dayjs from 'dayjs';

function EtimsFields() {
  const [serial, setSerial] = useState('');
  const [bhfId, setBhfId] = useState('00');
  const [serverUrl, setServerUrl] = useState('https://etims-api.kra.go.ke');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { getSetting } = await import('../../src/db/settings');
      setSerial((await getSetting('etims_device_serial')) ?? '');
      setBhfId((await getSetting('etims_bhf_id')) ?? '00');
      setServerUrl((await getSetting('etims_server_url')) ?? 'https://etims-api.kra.go.ke');
      setLoaded(true);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { setSetting } = await import('../../src/db/settings');
    await Promise.all([
      setSetting('etims_device_serial', serial.trim()),
      setSetting('etims_bhf_id', bhfId.trim()),
      setSetting('etims_server_url', serverUrl.trim()),
    ]);
    setSaving(false);
    Alert.alert('Saved', 'eTIMS settings updated.');
  };

  if (!loaded) return null;
  return (
    <>
      <Text style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
        Sales are automatically submitted to KRA eTIMS after each transaction if configured.
        Your VAT/PIN number (above) is used as the TIN.
      </Text>
      <TextInput label="Device Serial Number" value={serial} onChangeText={setSerial} mode="outlined" style={{ marginBottom: 10, backgroundColor: '#fff' }} />
      <TextInput label="Branch ID (BhfId)" value={bhfId} onChangeText={setBhfId} mode="outlined" style={{ marginBottom: 10, backgroundColor: '#fff' }} />
      <TextInput label="eTIMS Server URL" value={serverUrl} onChangeText={setServerUrl} mode="outlined" style={{ marginBottom: 10, backgroundColor: '#fff' }} />
      <Button mode="outlined" onPress={handleSave} loading={saving} compact>Save eTIMS Config</Button>
    </>
  );
}

export default function SettingsScreen() {
  const qc = useQueryClient();
  const { user, setUser } = useSession();
  const [bizName, setBizName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [vatNo, setVatNo] = useState('');
  const [footer, setFooter] = useState('');
  const [paybill, setPaybill] = useState('');
  const [till, setTill] = useState('');
  const [saving, setSaving] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserRole, setNewUserRole] = useState<'CASHIER' | 'ADMIN'>('CASHIER');
  const [addingUser, setAddingUser] = useState(false);
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [stockLogOpen, setStockLogOpen] = useState(false);
  const [shiftHistoryOpen, setShiftHistoryOpen] = useState(false);

  useEffect(() => {
    getBusinessInfo().then((info) => {
      setBizName(info?.name ?? '');
      setPhone(info?.phone ?? '');
      setAddress(info?.address ?? '');
      setVatNo(info?.vatNo ?? '');
      setFooter(info?.receiptFooter ?? '');
      setPaybill(info?.mpesaPaybill ?? '');
      setTill(info?.mpesaTill ?? '');
    });
  }, []);

  const { data: openShift, refetch: refetchShift } = useQuery({
    queryKey: ['open-shift'],
    queryFn: shiftQueries.getOpen,
  });

  const { data: shiftHistory } = useQuery({
    queryKey: ['shift-history'],
    queryFn: () => shiftQueries.getAll(20),
    enabled: shiftHistoryOpen,
  });

  const { data: stockLog } = useQuery({
    queryKey: ['stock-log'],
    queryFn: () => stockLogQueries.getAll(100),
    enabled: stockLogOpen,
  });

  const openShiftMutation = useMutation({
    mutationFn: () => shiftQueries.open(user!.id, user!.name, parseFloat(openingCash) || 0),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['open-shift'] }); refetchShift(); setShiftDialogOpen(false); setOpeningCash(''); Alert.alert('Shift Opened', 'Your shift has started.'); },
  });

  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      if (!openShift) return;
      const db = await getDb();
      const summary = await db.getFirstAsync<{ c: number; r: number }>(
        "SELECT COUNT(*) as c, COALESCE(SUM(total),0) as r FROM sales WHERE cashier_id=? AND date(created_at)=date('now') AND status='PAID'",
        [user?.id],
      );
      await shiftQueries.close(openShift.id, parseFloat(closingCash) || 0, summary?.c ?? 0, summary?.r ?? 0);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['open-shift'] }); refetchShift(); setShiftDialogOpen(false); setClosingCash(''); Alert.alert('Shift Closed', 'Your shift has ended.'); },
  });

  const handleSaveBusiness = async () => {
    if (!bizName.trim()) { Alert.alert('Required', 'Business name is required'); return; }
    setSaving(true);
    try {
      await Promise.all([
        setSetting('business_name', bizName.trim()),
        setSetting('phone', phone.trim()),
        setSetting('address', address.trim()),
        setSetting('vat_no', vatNo.trim()),
        setSetting('receipt_footer', footer.trim()),
        setSetting('mpesa_paybill', paybill.trim()),
        setSetting('mpesa_till', till.trim()),
      ]);
      Alert.alert('Saved', 'Business settings updated.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserName.trim() || newUserPin.length !== 4) { Alert.alert('Required', 'Enter a name and 4-digit PIN.'); return; }
    setAddingUser(true);
    try {
      const db = await getDb();
      await db.runAsync('INSERT INTO users (name, pin_hash, role) VALUES (?, ?, ?)', [newUserName.trim(), newUserPin, newUserRole]);
      setNewUserName(''); setNewUserPin('');
      Alert.alert('User Added', `${newUserName} added as ${newUserRole}.`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to add user');
    } finally {
      setAddingUser(false);
    }
  };

  // Backup: copy DB file to a shareable location
  const handleBackup = async () => {
    try {
      const dbPath = `${FileSystem.documentDirectory}SQLite/nexora_pos.db`;
      const backupName = `nexora_pos_backup_${dayjs().format('YYYYMMDD_HHmmss')}.db`;
      const backupPath = `${FileSystem.cacheDirectory}${backupName}`;
      await FileSystem.copyAsync({ from: dbPath, to: backupPath });
      await Sharing.shareAsync(backupPath, { mimeType: 'application/octet-stream', dialogTitle: 'Save Database Backup' });
    } catch (e: any) {
      Alert.alert('Backup Failed', e.message ?? 'Could not create backup.');
    }
  };

  // Restore: pick a backup file and copy over the DB
  const handleRestore = async () => {
    Alert.alert('Restore Database', 'This will REPLACE all current data with the backup. This cannot be undone.', [
      { text: 'Cancel' },
      {
        text: 'Restore', style: 'destructive', onPress: async () => {
          try {
            const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
            if (result.canceled) return;
            const dbPath = `${FileSystem.documentDirectory}SQLite/nexora_pos.db`;
            await FileSystem.copyAsync({ from: result.assets[0].uri, to: dbPath });
            Alert.alert('Restored', 'Database restored. Please restart the app.');
          } catch (e: any) {
            Alert.alert('Restore Failed', e.message ?? 'Could not restore backup.');
          }
        },
      },
    ]);
  };

  const handleLogout = () => Alert.alert('Lock Screen', 'Return to PIN screen?', [
    { text: 'Cancel' },
    { text: 'Lock', onPress: () => { setUser(null); router.replace('/(auth)'); } },
  ]);

  const fmt = (n: number) => `KES ${(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Settings" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="lock" color="#fff" onPress={handleLogout} />
      </Appbar.Header>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Shift Management */}
          <Text style={styles.section}>Shift Management</Text>
          <Card style={styles.card}>
            {openShift ? (
              <>
                <List.Item
                  title={`Shift Open — ${openShift.cashier_name}`}
                  description={`Opened ${dayjs(openShift.opened_at).format('D MMM HH:mm')} · Opening cash: ${fmt(openShift.opening_cash)}`}
                  left={(p) => <List.Icon {...p} icon="clock-check" color="#22c55e" />}
                />
                <Card.Content>
                  <TextInput label="Closing Cash (KES)" value={closingCash} onChangeText={setClosingCash} mode="outlined" keyboardType="numeric" style={styles.input} />
                  <Button mode="contained" onPress={() => closeShiftMutation.mutate()} loading={closeShiftMutation.isPending} style={{ backgroundColor: '#e53935' }}>
                    Close Shift
                  </Button>
                </Card.Content>
              </>
            ) : (
              <List.Item
                title="No Open Shift"
                description="Start a shift to track your session's sales"
                left={(p) => <List.Icon {...p} icon="clock-outline" color="#aaa" />}
                onPress={() => setShiftDialogOpen(true)}
                right={(p) => <List.Icon {...p} icon="chevron-right" />}
              />
            )}
            <Divider />
            <List.Item title="Shift History" left={(p) => <List.Icon {...p} icon="history" color={brand.primary} />} onPress={() => setShiftHistoryOpen(true)} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
          </Card>

          {/* Stock Log */}
          <Text style={styles.section}>Inventory Audit</Text>
          <Card style={styles.card}>
            <List.Item title="Stock Movement Log" description="View all stock additions and deductions" left={(p) => <List.Icon {...p} icon="package-variant" color={brand.primary} />} onPress={() => setStockLogOpen(true)} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
          </Card>

          {/* Business Details */}
          <Text style={styles.section}>Business Details</Text>
          <Card style={styles.card}>
            <Card.Content>
              <TextInput label="Business Name *" value={bizName} onChangeText={setBizName} mode="outlined" style={styles.input} />
              <TextInput label="Phone Number" value={phone} onChangeText={setPhone} mode="outlined" keyboardType="phone-pad" style={styles.input} />
              <TextInput label="Address" value={address} onChangeText={setAddress} mode="outlined" multiline numberOfLines={2} style={styles.input} />
              <TextInput label="VAT / PIN Number" value={vatNo} onChangeText={setVatNo} mode="outlined" autoCapitalize="characters" style={styles.input} />
              <TextInput label="Receipt Footer" value={footer} onChangeText={setFooter} mode="outlined" style={styles.input} />
            </Card.Content>
          </Card>

          <Text style={styles.section}>M-Pesa Configuration</Text>
          <Card style={styles.card}>
            <Card.Content>
              <TextInput label="Paybill Number" value={paybill} onChangeText={setPaybill} mode="outlined" keyboardType="numeric" style={styles.input} />
              <TextInput label="Till Number" value={till} onChangeText={setTill} mode="outlined" keyboardType="numeric" style={styles.input} />
            </Card.Content>
          </Card>

          <Text style={styles.section}>eTIMS / KRA Configuration</Text>
          <Card style={styles.card}>
            <Card.Content>
              <EtimsFields />
            </Card.Content>
          </Card>

          <Button mode="contained" onPress={handleSaveBusiness} loading={saving} disabled={saving} style={styles.saveBtn}>
            Save Business Settings
          </Button>

          <Divider style={{ marginVertical: 24 }} />

          {/* User Management */}
          <Text style={styles.section}>User Management</Text>
          <Card style={styles.card}>
            <Card.Content>
              <TextInput label="Full Name" value={newUserName} onChangeText={setNewUserName} mode="outlined" style={styles.input} />
              <TextInput label="4-Digit PIN" value={newUserPin} onChangeText={(v) => setNewUserPin(v.replace(/[^0-9]/g, '').slice(0, 4))} mode="outlined" keyboardType="numeric" secureTextEntry style={styles.input} />
              <View style={styles.roleRow}>
                {(['CASHIER', 'ADMIN'] as const).map((r) => (
                  <Button key={r} mode={newUserRole === r ? 'contained' : 'outlined'} onPress={() => setNewUserRole(r)} style={styles.roleBtn} compact>{r}</Button>
                ))}
              </View>
              <Button mode="contained-tonal" onPress={handleAddUser} loading={addingUser} style={{ marginTop: 8 }}>Add User</Button>
            </Card.Content>
          </Card>

          <Divider style={{ marginVertical: 24 }} />

          {/* Backup & Restore */}
          <Text style={styles.section}>Data Management</Text>
          <Card style={styles.card}>
            <List.Item title="Backup Database" description="Export database file to share or save" left={(p) => <List.Icon {...p} icon="database-export" color={brand.primary} />} onPress={handleBackup} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
            <Divider />
            <List.Item title="Restore Database" description="Import a previously exported backup" left={(p) => <List.Icon {...p} icon="database-import" color="#f59e0b" />} onPress={handleRestore} right={(p) => <List.Icon {...p} icon="chevron-right" />} />
          </Card>

          <Divider style={{ marginVertical: 24 }} />

          <Text style={styles.section}>About</Text>
          <Card style={styles.card}>
            <List.Item title="Nexora POS" description="Version 1.0.0 — Standalone Android POS" left={(p) => <List.Icon {...p} icon="cash-register" color={brand.primary} />} />
            <Divider />
            <List.Item title="Subscription" description="KES 600/month via Google Play" left={(p) => <List.Icon {...p} icon="google-play" color={brand.primary} />} />
          </Card>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        {/* Open Shift Dialog */}
        <Dialog visible={shiftDialogOpen} onDismiss={() => setShiftDialogOpen(false)}>
          <Dialog.Title>Open Shift</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 12, color: '#555' }}>Cashier: {user?.name}</Text>
            <TextInput label="Opening Cash (KES)" value={openingCash} onChangeText={setOpeningCash} mode="outlined" keyboardType="numeric" />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShiftDialogOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => openShiftMutation.mutate()} loading={openShiftMutation.isPending}>Open Shift</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Shift History Dialog */}
        <Dialog visible={shiftHistoryOpen} onDismiss={() => setShiftHistoryOpen(false)}>
          <Dialog.Title>Shift History</Dialog.Title>
          <Dialog.Content>
            <ScrollView style={{ maxHeight: 400 }}>
              {(shiftHistory ?? []).map((s) => (
                <View key={s.id} style={styles.shiftRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shiftCashier}>{s.cashier_name}</Text>
                    <Text style={styles.shiftTime}>{dayjs(s.opened_at).format('D MMM HH:mm')} → {s.closed_at ? dayjs(s.closed_at).format('HH:mm') : 'Open'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.shiftRev}>{fmt(s.total_revenue)}</Text>
                    <Text style={styles.shiftSales}>{s.total_sales} sales</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions><Button onPress={() => setShiftHistoryOpen(false)}>Close</Button></Dialog.Actions>
        </Dialog>

        {/* Stock Log Dialog */}
        <Dialog visible={stockLogOpen} onDismiss={() => setStockLogOpen(false)}>
          <Dialog.Title>Stock Movement Log</Dialog.Title>
          <Dialog.Content>
            <ScrollView style={{ maxHeight: 420 }}>
              {(stockLog ?? []).map((entry) => (
                <View key={entry.id} style={styles.logRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logProduct}>{entry.product_name}</Text>
                    <Text style={styles.logReason}>{entry.reason}</Text>
                    <Text style={styles.logTime}>{dayjs(entry.created_at).format('D MMM HH:mm')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.logQty, { color: entry.change_qty > 0 ? '#22c55e' : '#e53935' }]}>
                      {entry.change_qty > 0 ? '+' : ''}{entry.change_qty}
                    </Text>
                    <Text style={styles.logBalance}>Balance: {entry.balance_after}</Text>
                  </View>
                </View>
              ))}
              {(stockLog ?? []).length === 0 && <Text style={{ color: '#aaa', textAlign: 'center', padding: 20 }}>No stock movements yet.</Text>}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions><Button onPress={() => setStockLogOpen(false)}>Close</Button></Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: brand.primary },
  headerTitle: { color: '#fff', fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 48 },
  section: { fontSize: 12, fontWeight: '700', color: brand.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  card: { borderRadius: 12, marginBottom: 8 },
  input: { marginBottom: 10, backgroundColor: '#fff' },
  saveBtn: { borderRadius: 10, backgroundColor: brand.primary, marginTop: 8 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: { flex: 1 },
  shiftRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  shiftCashier: { fontSize: 14, fontWeight: '700', color: '#111' },
  shiftTime: { fontSize: 11, color: '#888', marginTop: 2 },
  shiftRev: { fontSize: 14, fontWeight: '700', color: brand.primary },
  shiftSales: { fontSize: 11, color: '#888', marginTop: 2 },
  logRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  logProduct: { fontSize: 13, fontWeight: '600', color: '#111' },
  logReason: { fontSize: 11, color: '#666', marginTop: 1 },
  logTime: { fontSize: 10, color: '#aaa', marginTop: 1 },
  logQty: { fontSize: 15, fontWeight: '800' },
  logBalance: { fontSize: 10, color: '#888', marginTop: 2 },
});
