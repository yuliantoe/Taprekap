import { useState } from 'react';
import { Check, Cloud, Copy, X } from 'lucide-react';
import type { WorkspaceProfile } from '../types';

interface CloudSyncModalProps {
  open: boolean;
  onClose: () => void;
  workspaceCode: string;
  profile: WorkspaceProfile;
  onSwitchWorkspace: (nextCode: string) => void;
  onSaveProfile: (profile: Partial<WorkspaceProfile>) => Promise<void>;
}

export function CloudSyncModal({
  open,
  onClose,
  workspaceCode,
  profile,
  onSwitchWorkspace,
  onSaveProfile,
}: CloudSyncModalProps) {
  const [codeInput, setCodeInput] = useState(workspaceCode);
  const [employeeName, setEmployeeName] = useState(profile.employeeName);
  const [employeeId, setEmployeeId] = useState(profile.employeeId);
  const [department, setDepartment] = useState(profile.department);
  const [companyName, setCompanyName] = useState(profile.companyName);
  const [approverName, setApproverName] = useState(profile.approverName);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const shareUrl = `${window.location.origin}/?ws=${encodeURIComponent(workspaceCode)}`;

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = codeInput
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');

    setSaving(true);
    try {
      if (cleaned && cleaned !== workspaceCode) {
        onSwitchWorkspace(cleaned);
      } else {
        await onSaveProfile({
          employeeName,
          employeeId,
          department,
          companyName,
          approverName,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-sync-title"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
            <h2 id="cloud-sync-title" className="text-base font-bold text-slate-900 font-display">
              Sinkronisasi Cloud & Profil Kantor
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="text-xs font-semibold text-slate-800">
              Tautan Sinkronisasi Lintas Perangkat (HP & Laptop)
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Buka tautan ini di Chrome Android untuk scan kartu NFC di jalan, lalu pantau saldo dan cetak PDF di laptop kantor secara real-time.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 min-h-[38px] px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-700"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="min-h-[38px] px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Kode Workspace Cloud
            </label>
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="Contoh: TIM-OPS-2026"
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm font-mono uppercase text-slate-900 focus:outline-none focus:border-blue-600"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Ganti kode untuk membuka ruang penyimpanan baru atau kembali ke KANTOR-ID-01.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-200 space-y-3">
            <div className="text-xs font-bold text-slate-900">
              Identitas Default Laporan PDF Kantor
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Karyawan
                </label>
                <input
                  type="text"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  NIK / ID Karyawan
                </label>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-sm font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Departemen
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Perusahaan
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-sm text-slate-900"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Atasan / Finance Penyetuju
              </label>
              <input
                type="text"
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-sm text-slate-900"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] px-5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold cursor-pointer"
            >
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
