import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth, authSecondary } from '../lib/firebase';

// Auth ใช้รหัสนักเรียน 5 หลักตาม spec — map เป็น "อีเมลปลอม" ภายใน
// เช่น รหัส 12345 -> 12345@classhub.local เพื่อให้ใช้ Firebase Email/Password ได้
// (ไม่ต้องเปิดผู้ใช้เห็นอีเมลนี้เลย)
function studentIdToEmail(studentId: string) {
  return `${studentId}@classhub.local`;
}

export default function Login() {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (studentId.length !== 5) {
      setError('รหัสนักเรียนต้องมี 5 หลัก');
      return;
    }
    setLoading(true);
    const email = studentIdToEmail(studentId);
    try {
      // ต้อง sign-in ทั้ง 2 โปรเจกต์พร้อมกัน (primary = ยืนยันตัวตน+ users/homework,
      // secondary = attendance/finance) ด้วย credential เดียวกัน เพราะบัญชีผู้ใช้ถูกสร้าง
      // เป็น "คู่แฝด" ไว้ในทั้งสองโปรเจกต์ตอนแอดมินเพิ่มนักเรียน (ดู SETUP.md ข้อ 3)
      await Promise.all([
        signInWithEmailAndPassword(auth, email, password),
        signInWithEmailAndPassword(authSecondary, email, password),
      ]);
      navigate('/attendance');
    } catch {
      setError('รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="glass-card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="text-4xl">🎓</div>
          <h1 className="mt-2 text-xl font-bold text-brand">ClassHub v2</h1>
          <p className="text-sm text-gray-500">เข้าสู่ระบบด้วยรหัสนักเรียน</p>
        </div>

        <label className="mb-1 block text-sm text-gray-600" htmlFor="studentId">
          รหัสนักเรียน (5 หลัก)
        </label>
        <input
          id="studentId"
          inputMode="numeric"
          maxLength={5}
          value={studentId}
          onChange={(e) => setStudentId(e.target.value.replace(/\D/g, ''))}
          className="mb-4 w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-center text-lg tracking-widest outline-brand"
          placeholder="•••••"
        />

        <label className="mb-1 block text-sm text-gray-600" htmlFor="password">
          รหัสผ่าน
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 outline-brand"
        />

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand py-3 font-semibold text-white shadow-glass transition active:scale-95 disabled:opacity-50"
        >
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}
