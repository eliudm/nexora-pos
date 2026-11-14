/**
 * Unified printer service supporting Bluetooth, Wi-Fi (TCP) and USB
 * thermal receipt printers using react-native-thermal-printer.
 *
 * Config is persisted in SQLite settings table under key 'printer_config'.
 */

import ThermalPrinter, { PrinterTypes } from 'react-native-thermal-printer';
import { getSetting, setSetting } from '../db/settings';

export type PrinterConnectionType = 'bluetooth' | 'wifi' | 'usb' | 'none';

export interface PrinterConfig {
  type: PrinterConnectionType;
  /** MAC address for Bluetooth; IP address for Wi-Fi; ignored for USB */
  address: string;
  /** TCP port for Wi-Fi (default 9100); ignored for Bluetooth/USB */
  port: number;
  /** Human-readable name shown in settings */
  name: string;
}

export interface BluetoothDevice {
  macAddress: string;
  deviceName: string;
}

export interface UsbDevice {
  vendorId: number;
  productId: number;
  deviceName: string;
}

const DEFAULT_CONFIG: PrinterConfig = {
  type: 'none',
  address: '',
  port: 9100,
  name: '',
};

export const printerService = {
  getConfig: async (): Promise<PrinterConfig> => {
    const raw = await getSetting('printer_config');
    if (!raw) return { ...DEFAULT_CONFIG };
    try {
      return JSON.parse(raw) as PrinterConfig;
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  },

  saveConfig: async (config: PrinterConfig): Promise<void> => {
    await setSetting('printer_config', JSON.stringify(config));
  },

  /** Returns paired Bluetooth devices visible to Android */
  getBluetoothDevices: async (): Promise<BluetoothDevice[]> => {
    try {
      const devices = await ThermalPrinter.getBluetoothDeviceList();
      return (devices ?? []).map((d: any) => ({
        macAddress: d.macAddress ?? d.address ?? '',
        deviceName: d.deviceName ?? d.name ?? 'Unknown Device',
      }));
    } catch (e: any) {
      throw new Error(`Bluetooth scan failed: ${e.message ?? e}`);
    }
  },

  /** Returns USB devices connected to the Android device */
  getUsbDevices: async (): Promise<UsbDevice[]> => {
    try {
      const devices = await ThermalPrinter.getUsbDeviceList();
      return (devices ?? []).map((d: any) => ({
        vendorId: d.vendorId ?? 0,
        productId: d.productId ?? 0,
        deviceName: d.manufacturer ?? `USB Device ${d.vendorId}:${d.productId}`,
      }));
    } catch (e: any) {
      throw new Error(`USB scan failed: ${e.message ?? e}`);
    }
  },

  /**
   * Print a receipt string.
   * Falls back gracefully if the printer is not configured.
   * Returns { success, error? }.
   */
  print: async (text: string): Promise<{ success: boolean; error?: string }> => {
    const config = await printerService.getConfig();

    if (config.type === 'none' || !config.address && config.type !== 'usb') {
      return { success: false, error: 'No printer configured. Set up a printer in Settings.' };
    }

    try {
      switch (config.type) {
        case 'bluetooth':
          await ThermalPrinter.printBluetooth({
            macAddress: config.address,
            payload: text,
            printerWidthMM: 80,
          });
          break;

        case 'wifi':
          await ThermalPrinter.printTcp({
            ip: config.address,
            port: config.port || 9100,
            payload: text,
            printerWidthMM: 80,
            timeout: 5000,
          });
          break;

        case 'usb':
          await ThermalPrinter.printUsb({
            payload: text,
            printerWidthMM: 80,
          });
          break;
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Printer error' };
    }
  },

  /** Prints a short test page to verify the connection */
  testPrint: async (): Promise<{ success: boolean; error?: string }> => {
    const config = await printerService.getConfig();
    const text =
      `[C]<b>NEXORA POS</b>\n` +
      `[C]Printer Test\n` +
      `[C]--------------------------------\n` +
      `[L]Connection: ${config.type.toUpperCase()}\n` +
      `[L]Address: ${config.address || 'USB'}\n` +
      `[C]--------------------------------\n` +
      `[C]Test successful!\n` +
      `\n\n\n`;
    return printerService.print(text);
  },
};
