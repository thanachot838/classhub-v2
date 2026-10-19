import React, { useState } from 'react';
import {
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, authSecondary, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

// โมดูล 5: เปลี่ยนรหัสผ่าน · คู่มือใช้งาน · ออกจากระบบ

/** เปลี่ยนรหัสผ่านพร้อมกันทั้ง 2 โปรเจกต์ ไม่งั้นรหัสจะไม่ตรงกันอีกต่อไป (ดู SETUP.md ข้อ 3/8) */
function ChangePasswordForm() {
  const { firebaseUser, profile } = useAuth();
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
      // เคลียร์ mustChangePassword หลังเปลี่ยนรหัสสำเร็จ ไม่งั้นคำเตือนจะค้างตลอดไป
      // (mustChangePassword เก็บอยู่ในโปรเจกต์ primary เท่านั้น ตาม schema)
      if (profile?.mustChangePassword) {
        // ไม่ต้อง invalidate query เพิ่ม เพราะ AuthContext ใช้ onSnapshot ฟัง
        // users/{uid} อยู่แล้ว จึงอัปเดต profile.mustChangePassword ให้อัตโนมัติทันที
        await setDoc(
          doc(db, 'users', firebaseUser.uid),
          { mustChangePassword: false },
          { merge: true }
        );
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
        className="rounded-xl bg-accent py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
      </button>
    </form>
  );
}

function UsageGuide() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [open, setOpen] = useState(false);
  return (
    <section className="glass-card p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between font-semibold">
        📖 คู่มือใช้งาน
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-600">
          {isAdmin && (
            <li>🧹 เช็คชื่อ & ทำเวร — เลือกนักเรียนหลายคนพร้อมกัน → เลือกประเภท → แนบรูปแล้วยืนยัน</li>
          )}
          <li>
            {isAdmin
              ? '📚 ติดตาม & ส่งงาน — สร้าง/แก้ไข/ลบงาน แนบรูปและลิงก์ได้ นักเรียนกด "ทำแล้ว" เมื่อทำเสร็จ แล้วกด "ดูสถานะ" เพื่อเช็คว่าใครยังค้างงาน'
              : '📚 ติดตาม & ส่งงาน — ทำงานเสร็จแล้วกด "ทำแล้ว" ถ้ากดผิดแตะอีกครั้งเพื่อยกเลิกได้'}
          </li>
          <li>
            {isAdmin
              ? '💰 บัญชี & การเงินห้อง — บันทึกรายการ "ได้เงิน" (ยอดเพิ่ม) หรือ "ใช้เงิน" (หักออก) ระบบสรุปยอดคงเหลือให้อัตโนมัติ'
              : '💰 บัญชี & การเงินห้อง — ดูยอดคงเหลือและรายการรับ-จ่ายของห้องในแต่ละเดือน'}
          </li>
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
    <div className="flex flex-col gap-4" style={{ ['--accent' as string]: 'var(--profile)' }}>
      <h1 className="text-xl font-bold text-accent">🔐 ผู้ใช้ & ความปลอดภัย</h1>
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
