import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert, ScrollView, Pressable } from 'react-native';
import { Text, Button, RadioButton, TextInput, Card, Chip, ActivityIndicator, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  printerService,
  PrinterConfig,
  PrinterConnectionType,
  BluetoothDevice,
  UsbDevice,
} from '../services/printer';
import { brand } from '../theme';

export function PrinterSetup() {
  const [config, setConfig] = useState<PrinterConfig>({ type: 'none', address: '', port: 9100, name: '' });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [btDevices, setBtDevices] = useState<BluetoothDevice[]>([]);
  const [usbDevices, setUsbDevices] = useState<UsbDevice[]>([]);

  useEffect(() => {
    printerService.getConfig().then((c) => { setConfig(c); setLoaded(true); });
  }, []);

  const setType = (type: PrinterConnectionType) => {
    setConfig((c) => ({ ...c, type, address: '', name: '' }));
    setBtDevices([]);
    setUsbDevices([]);
  };

  const scanBluetooth = async () => {
    setScanning(true);
    try {
      const devices = await printerService.getBluetoothDevices();
      if (devices.length === 0) {
        Alert.alert('No Devices', 'No paired Bluetooth devices found.\n\nPair your printer in Android Settings → Bluetooth first, then come back here.');
      }
      setBtDevices(devices);
    } catch (e: any) {
      Alert.alert('Scan Failed', e.message ?? 'Could not scan Bluetooth devices.\nMake sure Bluetooth is enabled.');
    } finally {
      setScanning(false);
    }
  };

  const scanUsb = async () => {
    setScanning(true);
    try {
      const devices = await printerService.getUsbDevices();
      if (devices.length === 0) {
        Alert.alert('No USB Devices', 'No USB printers detected.\nConnect your printer via USB OTG cable and try again.');
      }
      setUsbDevices(devices);
    } catch (e: any) {
      Alert.alert('Scan Failed', e.message ?? 'Could not detect USB devices.');
    } finally {
      setScanning(false);
    }
  };

  const selectBtDevice = (device: BluetoothDevice) => {
    setConfig((c) => ({ ...c, address: device.macAddress, name: device.deviceName }));
  };

  const selectUsbDevice = (device: UsbDevice) => {
    setConfig((c) => ({ ...c, address: `${device.vendorId}:${device.productId}`, name: device.deviceName }));
  };

  const handleSave = async () => {
    if (config.type === 'bluetooth' && !config.address) {
      Alert.alert('Select Printer', 'Scan and select a Bluetooth printer first.'); return;
    }
    if (config.type === 'wifi' && !config.address) {
      Alert.alert('Enter IP', 'Enter the printer\'s IP address.'); return;
    }
    setSaving(true);
    await printerService.saveConfig(config);
    setSaving(false);
    Alert.alert('Saved', 'Printer settings saved.');
  };

  const handleTest = async () => {
    setTesting(true);
    const result = await printerService.testPrint();
    setTesting(false);
    if (result.success) {
      Alert.alert('Test Successful', 'Test page printed successfully!');
    } else {
      Alert.alert('Print Failed', result.error ?? 'Could not connect to printer.');
    }
  };

  if (!loaded) return <ActivityIndicator style={{ padding: 20 }} color={brand.primary} />;

  return (
    <View>
      <Text style={styles.hint}>
        Select how your thermal receipt printer is connected to this device.
      </Text>

      {/* Connection type selector */}
      <RadioButton.Group value={config.type} onValueChange={(v) => setType(v as PrinterConnectionType)}>
        <View style={styles.typeRow}>
          {([
            { value: 'bluetooth', icon: 'bluetooth', label: 'Bluetooth' },
            { value: 'wifi',      icon: 'wifi',       label: 'Wi-Fi' },
            { value: 'usb',       icon: 'usb',        label: 'USB / Cable' },
          ] as const).map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.typeCard, config.type === opt.value && styles.typeCardActive]}
              onPress={() => setType(opt.value)}
            >
              <MaterialCommunityIcons
                name={opt.icon as any}
                size={28}
                color={config.type === opt.value ? '#fff' : '#666'}
              />
              <Text style={[styles.typeLabel, config.type === opt.value && styles.typeLabelActive]}>
                {opt.label}
              </Text>
              <RadioButton value={opt.value} color="#fff" uncheckedColor={config.type === opt.value ? '#fff' : '#ccc'} />
            </Pressable>
          ))}
        </View>
      </RadioButton.Group>

      {/* Bluetooth */}
      {config.type === 'bluetooth' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bluetooth Printer</Text>
          <Text style={styles.sectionHint}>
            Pair your printer in Android Settings → Bluetooth first, then scan below.
          </Text>

          <Button
            mode="outlined"
            icon="bluetooth-search"
            onPress={scanBluetooth}
            loading={scanning}
            disabled={scanning}
            style={styles.scanBtn}
          >
            {scanning ? 'Scanning...' : 'Scan for Paired Devices'}
          </Button>

          {btDevices.map((d) => (
            <Pressable
              key={d.macAddress}
              style={[styles.deviceRow, config.address === d.macAddress && styles.deviceRowSelected]}
              onPress={() => selectBtDevice(d)}
            >
              <MaterialCommunityIcons name="printer" size={20} color={config.address === d.macAddress ? brand.primary : '#666'} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.deviceName}>{d.deviceName}</Text>
                <Text style={styles.deviceAddr}>{d.macAddress}</Text>
              </View>
              {config.address === d.macAddress && (
                <MaterialCommunityIcons name="check-circle" size={20} color={brand.primary} />
              )}
            </Pressable>
          ))}

          {config.address ? (
            <Chip icon="printer-check" style={styles.selectedChip} textStyle={{ color: brand.primary }}>
              Selected: {config.name || config.address}
            </Chip>
          ) : null}
        </View>
      )}

      {/* Wi-Fi */}
      {config.type === 'wifi' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wi-Fi / Network Printer</Text>
          <Text style={styles.sectionHint}>
            Connect your printer to the same Wi-Fi network, then enter its IP address.
            Default port is 9100 (used by most Epson, Star and Xprinter models).
          </Text>

          <TextInput
            label="Printer IP Address"
            value={config.address}
            onChangeText={(v) => setConfig((c) => ({ ...c, address: v.trim(), name: v.trim() }))}
            mode="outlined"
            placeholder="e.g. 192.168.1.100"
            keyboardType="numeric"
            style={styles.input}
            left={<TextInput.Icon icon="ip-network" />}
          />

          <TextInput
            label="Port"
            value={String(config.port)}
            onChangeText={(v) => setConfig((c) => ({ ...c, port: parseInt(v) || 9100 }))}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
            left={<TextInput.Icon icon="numeric" />}
          />

          <Text style={styles.wifiNote}>
            💡 To find your printer's IP: print a self-test page (usually hold Feed button while powering on).
          </Text>
        </View>
      )}

      {/* USB */}
      {config.type === 'usb' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>USB / Cable Printer</Text>
          <Text style={styles.sectionHint}>
            Connect your printer via a USB OTG cable or USB-C adapter. Android will
            request permission when first connecting.
          </Text>

          <Button
            mode="outlined"
            icon="usb"
            onPress={scanUsb}
            loading={scanning}
            disabled={scanning}
            style={styles.scanBtn}
          >
            {scanning ? 'Detecting...' : 'Detect USB Printers'}
          </Button>

          {usbDevices.map((d) => (
            <Pressable
              key={`${d.vendorId}:${d.productId}`}
              style={[styles.deviceRow, config.address === `${d.vendorId}:${d.productId}` && styles.deviceRowSelected]}
              onPress={() => selectUsbDevice(d)}
            >
              <MaterialCommunityIcons name="printer" size={20} color={config.address === `${d.vendorId}:${d.productId}` ? brand.primary : '#666'} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.deviceName}>{d.deviceName}</Text>
                <Text style={styles.deviceAddr}>VID:{d.vendorId} PID:{d.productId}</Text>
              </View>
              {config.address === `${d.vendorId}:${d.productId}` && (
                <MaterialCommunityIcons name="check-circle" size={20} color={brand.primary} />
              )}
            </Pressable>
          ))}
        </View>
      )}

      <Divider style={{ marginVertical: 16 }} />

      {/* Action buttons */}
      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving || config.type === 'none'}
          style={[styles.btn, { backgroundColor: brand.primary }]}
          icon="content-save"
        >
          Save Printer
        </Button>

        <Button
          mode="outlined"
          onPress={handleTest}
          loading={testing}
          disabled={testing || config.type === 'none'}
          style={styles.btn}
          icon="printer-check"
        >
          Test Print
        </Button>
      </View>

      {config.type !== 'none' && config.name ? (
        <Card style={styles.activeCard}>
          <Card.Content style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name="printer-check" size={24} color={brand.primary} />
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.activeName}>{config.name}</Text>
              <Text style={styles.activeType}>{config.type.toUpperCase()} printer configured</Text>
            </View>
          </Card.Content>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, color: '#666', marginBottom: 16 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeCard: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 12, alignItems: 'center', padding: 10, gap: 4 },
  typeCardActive: { backgroundColor: brand.primary },
  typeLabel: { fontSize: 11, fontWeight: '700', color: '#555' },
  typeLabelActive: { color: '#fff' },
  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 4 },
  sectionHint: { fontSize: 12, color: '#777', marginBottom: 12, lineHeight: 18 },
  scanBtn: { marginBottom: 12, borderColor: brand.primary },
  deviceRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, backgroundColor: '#f9f9f9', marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  deviceRowSelected: { borderColor: brand.primary, backgroundColor: '#f0fdf8' },
  deviceName: { fontSize: 14, fontWeight: '600', color: '#111' },
  deviceAddr: { fontSize: 11, color: '#888', marginTop: 2 },
  selectedChip: { backgroundColor: '#f0fdf8', borderColor: brand.primary, marginTop: 8, alignSelf: 'flex-start' },
  input: { marginBottom: 10, backgroundColor: '#fff' },
  wifiNote: { fontSize: 12, color: '#888', lineHeight: 18, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  btn: { flex: 1 },
  activeCard: { borderRadius: 10, borderWidth: 1, borderColor: brand.primary + '44' },
  activeName: { fontSize: 14, fontWeight: '700', color: '#111' },
  activeType: { fontSize: 12, color: brand.primary, marginTop: 2 },
});
