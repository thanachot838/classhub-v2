import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, authSecondary, db } from '../lib/firebase';
import { uploadProof } from '../lib/cloudinary';
import { useAuth } from '../context/AuthContext';
import type { ThemeSettings } from '../types';

// โมดูล 5: เปลี่ยน/รีเซ็ตรหัสผ่าน · ปรับธีม (สไลด์ 3 รูป + พื้นหลัง) · คู่มือใช้งาน

async function fetchTheme(): Promise<ThemeSettings> {
  const snap = await getDoc(doc(db, 'settings', 'theme'));
  return snap.exists() ? (snap.data() as ThemeSettings) : { sliderImages: [], backgroundUrl: undefined };
}

/** เปลี่ยนรหัสผ่านพร้อมกันทั้ง 2 โปรเจกต์ ไม่งั้นรหัสจะไม่ตรงกันอีกต่อไป (ดู SETUP.md ข้อ 3/8) */
function ChangePasswordForm() {
  const { firebaseUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser?.email) return;
    setBusy(true);
    setStatus('idle');
    try {
      const cred = EmailAuthProvider.credential(firebaseUser.email, current);
      // reauthenticate + updatePassword ต้องทำทั้ง primary และ secondary auth
      await reauthenticateWithCredential(auth.currentUser!, cred);
      await updatePassword(auth.currentUser!, next);
      if (authSecondary.currentUser) {
        await reauthenticateWithCredential(authSecondary.currentUser, cred);
        await updatePassword(authSecondary.currentUser, next);
      }
      setStatus('ok');
      setCurrent('');
      setNext('');
    } catch {
      setStatus('error');
      setErrorMsg('รหัสผ่านเดิมไม่ถูกต้อง หรือรหัสใหม่สั้นเกินไป (อย่างน้อย 6 ตัวอักษร)');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card flex flex-col gap-3 p-4">
      <h2 className="font-semibold">เปลี่ยนรหัสผ่าน</h2>
      <input
        type="password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        placeholder="รหัสผ่านเดิม"
        className="rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
      />
      <input
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)"
        className="rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
      />
      {status === 'ok' && <p className="text-sm text-ok">เปลี่ยนรหัสผ่านสำเร็จ ✅</p>}
      {status === 'error' && <p className="text-sm text-danger">{errorMsg}</p>}
      <button
        disabled={!current || next.length < 6 || busy}
        className="rounded-xl bg-brand py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
      </button>
    </form>
  );
}

/** ปรับธีม: สไลด์ 3 รูป + พื้นหลัง (Admin เท่านั้น ตาม security rules settings/*) */
function ThemeSettingsPanel() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: theme } = useQuery({ queryKey: ['theme'], queryFn: fetchTheme });
  const [uploading, setUploading] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (next: ThemeSettings) => setDoc(doc(db, 'settings', 'theme'), next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['theme'] }),
  });

  if (profile?.role !== 'admin') return null;

  async function handleSlideUpload(index: number, file: File) {
    setUploading(`slide-${index}`);
    try {
      const url = await uploadProof(file, 'theme');
      const images = [...(theme?.sliderImages ?? [])];
      images[index] = url;
      await save.mutateAsync({ sliderImages: images, backgroundUrl: theme?.backgroundUrl });
    } finally {
      setUploading(null);
    }
  }

  async function handleBackgroundUpload(file: File) {
    setUploading('background');
    try {
      const url = await uploadProof(file, 'theme');
      await save.mutateAsync({ sliderImages: theme?.sliderImages ?? [], backgroundUrl: url });
    } finally {
      setUploading(null);
    }
  }

  return (
    <section className="glass-card flex flex-col gap-3 p-4">
      <h2 className="font-semibold">ปรับธีม</h2>
      <p className="text-sm text-gray-500">สไลด์หน้าแรก (3 รูป)</p>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <label key={i} className="flex flex-col items-center gap-1">
            <div className="aspect-square w-full overflow-hidden rounded-xl bg-white/60">
              {theme?.sliderImages?.[i] ? (
                <img src={theme.sliderImages[i]} alt={`สไลด์ ${i + 1}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                  ว่าง
                </div>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleSlideUpload(i, e.target.files[0])}
            />
            <span className="text-xs text-brand underline">
              {uploading === `slide-${i}` ? 'กำลังอัป...' : 'เปลี่ยนรูป'}
            </span>
          </label>
        ))}
      </div>
      <p className="text-sm text-gray-500">พื้นหลัง</p>
      <label className="flex flex-col gap-1">
        {theme?.backgroundUrl && (
          <img src={theme.backgroundUrl} alt="พื้นหลัง" className="h-24 w-full rounded-xl object-cover" />
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleBackgroundUpload(e.target.files[0])}
        />
        <span className="text-xs text-brand underline">
          {uploading === 'background' ? 'กำลังอัป...' : 'เปลี่ยนพื้นหลัง'}
        </span>
      </label>
    </section>
  );
}

function UsageGuide() {
  const [open, setOpen] = useState(false);
  return (
    <section className="glass-card p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between font-semibold">
        📖 คู่มือใช้งาน
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-600">
          <li>🧹 เช็คชื่อ & ทำเวร — เลือกนักเรียนหลายคนพร้อมกัน → เลือกประเภท → แนบรูปแล้วยืนยัน</li>
          <li>📚 ติดตาม & ส่งงาน — นักเรียนอัปรูปการบ้านต่องาน แอดมินตรวจและกดยืนยันทีละคน</li>
          <li>💰 บัญชี & การเงินห้อง — แอดมินบันทึกสถานะจ่ายเงิน ระบบสรุปยอดให้อัตโนมัติ</li>
          <li>📄 ประวัติ & Export PDF — กรองช่วงวันที่แล้วกดปุ่มเพื่อดาวน์โหลดรายงาน</li>
          <li>🔐 ผู้ใช้ & ความปลอดภัย — เปลี่ยนรหัสผ่านของตัวเองได้ที่นี่ตลอดเวลา</li>
        </ol>
      )}
    </section>
  );
}

export default function Profile() {
  const { profile } = useAuth();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-brand">🔐 ผู้ใช้ & ความปลอดภัย</h1>
      <div className="glass-card p-4">
        <p className="font-semibold">{profile?.name}</p>
        <p className="text-sm text-gray-500">
          เลขที่ {profile?.number} · ห้อง {profile?.class}
        </p>
        {profile?.mustChangePassword && (
          <p className="mt-2 text-sm text-warn">⚠️ กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน</p>
        )}
      </div>

      <ChangePasswordForm />
      <ThemeSettingsPanel />
      <UsageGuide />

      <button
        onClick={() => {
          // ออกจากระบบทั้ง 2 โปรเจกต์พร้อมกัน (primary + secondary)
          signOut(auth);
          signOut(authSecondary);
        }}
        className="rounded-xl border border-danger py-3 font-semibold text-danger active:scale-95"
      >
        ออกจากระบบ
      </button>
    </div>
  );
}
