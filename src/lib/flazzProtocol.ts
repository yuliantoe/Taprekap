export const FLAZZ_PROTOCOL_SPEC = {
  issuer: 'bca' as const,
  name: 'BCA Flazz Gen 1 & Gen 2',
  aidGen1: 'F0000000030001',
  aidGen2: 'A0000006021010',
  standard: 'ISO/IEC 14443-A · ISO-DEP (Type A)',
  binPrefixes: ['0148', '5200', '0140'],
  apduSelectGen1: '00 A4 04 00 07 F0 00 00 00 03 00 01 00',
  apduSelectGen2: '00 A4 04 00 07 A0 00 00 06 02 10 10 00',
  apduReadBalance: '80 5C 00 02 04',
  apduReadLogRecord: '00 B2 01 C4 00',
};

export interface UsbReaderProbeResult {
  supported: boolean;
  deviceName?: string;
  aidSelected: boolean;
  note: string;
}

interface UsbDeviceLike {
  productName?: string;
  manufacturerName?: string;
  opened: boolean;
  configuration?: {
    configurationValue: number;
    interfaces: Array<{
      interfaceNumber: number;
      alternate?: { interfaceClass: number };
      alternates?: Array<{ interfaceClass: number }>;
    }>;
  } | null;
  open: () => Promise<void>;
  selectConfiguration: (configurationValue: number) => Promise<void>;
  claimInterface: (interfaceNumber: number) => Promise<void>;
  close: () => Promise<void>;
}

interface NavigatorWithUsb extends Navigator {
  usb?: {
    requestDevice: (options: { filters: Array<Record<string, number>> }) => Promise<UsbDeviceLike>;
  };
}

export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

export async function probeUsbCcidFlazzReader(): Promise<UsbReaderProbeResult> {
  const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithUsb) : null;
  if (!nav?.usb) {
    return {
      supported: false,
      aidSelected: false,
      note: 'WebUSB tidak tersedia di browser ini. Gunakan Chrome Desktop / Android Web NFC.',
    };
  }

  try {
    // USB Smart Card CCID Class (0x0B) or known ACR122U / ACS Vendor ID (0x072F)
    const device = await nav.usb.requestDevice({
      filters: [{ classCode: 0x0b }, { vendorId: 0x072f }],
    });
    if (!device.opened) {
      await device.open();
    }
    if (!device.configuration) {
      await device.selectConfiguration(1);
    }
    const ccidInterface = device.configuration?.interfaces.find(
      (iface) =>
        iface.alternate?.interfaceClass === 0x0b ||
        iface.alternates?.some((alt) => alt.interfaceClass === 0x0b),
    );
    const deviceLabel = [device.manufacturerName, device.productName]
      .filter(Boolean)
      .join(' ')
      .trim() || 'USB NFC CCID Reader';

    if (ccidInterface) {
      await device.claimInterface(ccidInterface.interfaceNumber);
    }

    await device.close().catch(() => undefined);
    return {
      supported: true,
      deviceName: deviceLabel,
      aidSelected: Boolean(ccidInterface),
      note: ccidInterface
        ? `Reader ${deviceLabel} terhubung (Interface CCID #${ccidInterface.interfaceNumber}). Siap menerima dump APDU Flazz AID ${FLAZZ_PROTOCOL_SPEC.aidGen1} / ${FLAZZ_PROTOCOL_SPEC.aidGen2} untuk dianalisis AI Key.`
        : `Perangkat ${deviceLabel} terdeteksi, namun tidak mengekspos interface SmartCard CCID (0x0B). Gunakan tap Web NFC Android atau upload struk/myBCA.`,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      return {
        supported: true,
        aidSelected: false,
        note: 'Pemilihan reader USB CCID dibatalkan.',
      };
    }
    return {
      supported: true,
      aidSelected: false,
      note:
        err instanceof Error
          ? `Reader USB belum bisa diklaim browser: ${err.message}. Gunakan Android Chrome Web NFC atau upload mutasi myBCA.`
          : 'Gagal menghubungkan reader USB CCID.',
    };
  }
}
