import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, Appbar, Card, TextInput, Button, Divider, List } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getBusinessInfo, setSetting } from '../../src/db/settings';
import { getDb } from '../../src/db/database';
import { brand } from '../../src/theme';

export default function SettingsScreen() {
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
    if (!newUserName.trim() || newUserPin.length !== 4) {
      Alert.alert('Required', 'Enter a name and 4-digit PIN.');
      return;
    }
    setAddingUser(true);
    try {
      const db = await getDb();
      await db.runAsync(
        'INSERT INTO users (name, pin_hash, role) VALUES (?, ?, ?)',
        [newUserName.trim(), newUserPin, newUserRole],
      );
      setNewUserName('');
      setNewUserPin('');
      Alert.alert('User Added', `${newUserName} added as ${newUserRole}.`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to add user');
    } finally {
      setAddingUser(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Lock Screen', 'Return to PIN screen?', [
      { text: 'Cancel' },
      { text: 'Lock', onPress: () => router.replace('/(auth)') },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Settings" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="lock" color="#fff" onPress={handleLogout} />
      </Appbar.Header>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

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

          <Button mode="contained" onPress={handleSaveBusiness} loading={saving} disabled={saving} style={styles.saveBtn}>
            Save Business Settings
          </Button>

          <Divider style={{ marginVertical: 24 }} />

          <Text style={styles.section}>User Management</Text>
          <Card style={styles.card}>
            <Card.Content>
              <TextInput label="Full Name" value={newUserName} onChangeText={setNewUserName} mode="outlined" style={styles.input} />
              <TextInput label="4-Digit PIN" value={newUserPin} onChangeText={(v) => setNewUserPin(v.replace(/[^0-9]/g, '').slice(0, 4))} mode="outlined" keyboardType="numeric" secureTextEntry style={styles.input} />
              <View style={styles.roleRow}>
                {(['CASHIER', 'ADMIN'] as const).map((r) => (
                  <Button
                    key={r}
                    mode={newUserRole === r ? 'contained' : 'outlined'}
                    onPress={() => setNewUserRole(r)}
                    style={styles.roleBtn}
                    compact
                  >
                    {r}
                  </Button>
                ))}
              </View>
              <Button mode="contained-tonal" onPress={handleAddUser} loading={addingUser} style={{ marginTop: 8 }}>
                Add User
              </Button>
            </Card.Content>
          </Card>

          <Divider style={{ marginVertical: 24 }} />

          <Text style={styles.section}>About</Text>
          <Card style={styles.card}>
            <List.Item
              title="Nexora POS"
              description="Version 1.0.0 — Standalone Android POS"
              left={(props) => <List.Icon {...props} icon="cash-register" color={brand.primary} />}
            />
            <Divider />
            <List.Item
              title="Subscription"
              description="KES 600/month via Google Play"
              left={(props) => <List.Icon {...props} icon="google-play" color={brand.primary} />}
            />
          </Card>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
});
