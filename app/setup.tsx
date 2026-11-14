import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, HelperText, Appbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { setSetting } from '../src/db/settings';
import { brand } from '../src/theme';

interface FormData {
  business_name: string;
  phone: string;
  address: string;
  vat_no: string;
  receipt_footer: string;
  mpesa_paybill: string;
  mpesa_till: string;
}

const INITIAL: FormData = {
  business_name: '',
  phone: '',
  address: '',
  vat_no: '',
  receipt_footer: 'Thank you for your business!',
  mpesa_paybill: '',
  mpesa_till: '',
};

export default function SetupScreen() {
  const [form, setForm] = useState<FormData>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<FormData>>({});

  const set = (key: keyof FormData) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const validate = () => {
    const e: Partial<FormData> = {};
    if (!form.business_name.trim()) e.business_name = 'Business name is required';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await Promise.all([
        setSetting('business_name', form.business_name.trim()),
        setSetting('phone', form.phone.trim()),
        setSetting('address', form.address.trim()),
        setSetting('vat_no', form.vat_no.trim()),
        setSetting('receipt_footer', form.receipt_footer.trim()),
        setSetting('mpesa_paybill', form.mpesa_paybill.trim()),
        setSetting('mpesa_till', form.mpesa_till.trim()),
      ]);
      router.replace('/(auth)');
    } catch (e: any) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Business Setup" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>Set up your business details to get started</Text>

          <Text style={styles.section}>Business Information</Text>

          <TextInput
            label="Business Name *"
            value={form.business_name}
            onChangeText={set('business_name')}
            mode="outlined"
            style={styles.input}
            error={!!errors.business_name}
          />
          {errors.business_name && <HelperText type="error">{errors.business_name}</HelperText>}

          <TextInput
            label="Phone Number *"
            value={form.phone}
            onChangeText={set('phone')}
            keyboardType="phone-pad"
            mode="outlined"
            style={styles.input}
            error={!!errors.phone}
          />
          {errors.phone && <HelperText type="error">{errors.phone}</HelperText>}

          <TextInput
            label="Business Address"
            value={form.address}
            onChangeText={set('address')}
            mode="outlined"
            style={styles.input}
            multiline
            numberOfLines={2}
          />

          <TextInput
            label="VAT / PIN Number (for eTIMS)"
            value={form.vat_no}
            onChangeText={set('vat_no')}
            mode="outlined"
            style={styles.input}
            autoCapitalize="characters"
          />

          <TextInput
            label="Receipt Footer Message"
            value={form.receipt_footer}
            onChangeText={set('receipt_footer')}
            mode="outlined"
            style={styles.input}
          />

          <Text style={styles.section}>M-Pesa Details (optional)</Text>

          <TextInput
            label="M-Pesa Paybill Number"
            value={form.mpesa_paybill}
            onChangeText={set('mpesa_paybill')}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="M-Pesa Till Number"
            value={form.mpesa_till}
            onChangeText={set('mpesa_till')}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />

          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.saveBtn}
            contentStyle={styles.btnContent}
            labelStyle={styles.btnLabel}
          >
            Save & Continue
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: { backgroundColor: brand.primary },
  headerTitle: { color: '#fff', fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 48 },
  subtitle: { color: '#666', fontSize: 14, marginBottom: 24 },
  section: { fontSize: 13, fontWeight: '700', color: brand.primary, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  input: { marginBottom: 4, backgroundColor: '#fff' },
  saveBtn: { marginTop: 32, borderRadius: 10, backgroundColor: brand.primary },
  btnContent: { height: 50 },
  btnLabel: { fontSize: 16, fontWeight: '700' },
});
