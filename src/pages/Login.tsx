import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, BookOpen, BookMarked, PenLine, ArrowRight, Sparkles, Leaf } from 'lucide-react';
import { auth, authSecondary } from '../lib/firebase';

// Auth ใช้รหัสนักเรียน 5 หลักตาม spec — map เป็น "อีเมลปลอม" ภายใน
// เช่น รหัส 12345 -> 12345@classhub.local เพื่อให้ใช้ Firebase Email/Password ได้
// (ไม่ต้องเปิดผู้ใช้เห็นอีเมลนี้เลย)
function studentIdToEmail(studentId: string) {
  return `${studentId}@classhub.local`;
}

export default function Login() {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
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
      setSuccess(true);
      setTimeout(() => navigate('/attendance'), 500);
    } catch {
      setError('รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="desk-bg flex min-h-svh items-center justify-center p-4 sm:p-5">
      <div className="notebook-perspective h-[540px] w-full max-w-[850px] sm:h-[580px]">
        <div className={`notebook ${open ? 'open' : ''}`}>
          {/* ขดลวดเข้าเล่ม */}
          <div
            className="pointer-events-none absolute bottom-4 left-2 top-4 z-50 flex flex-col justify-between sm:bottom-5 sm:left-[18px] sm:top-5"
            aria-hidden="true"
          >
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="spiral-ring" />
            ))}
          </div>

          {/* ปกสมุด พลิกเปิด-ปิด 3 มิติ */}
          <div className="cover-wrapper absolute inset-0 z-30">
            {/* ด้านหน้าปก */}
            <div
              className="cover-face absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-[8px_18px_18px_8px] px-6 py-8 sm:p-10"
              style={{
                borderLeft: '12px solid var(--nb-cover-dark)',
                background: `linear-gradient(to bottom right, var(--nb-cover), var(--nb-cover-dark))`,
                boxShadow: 'inset -4px 0 14px rgba(0,0,0,0.25), inset 2px 0 0 rgba(255,255,255,0.06)',
              }}
            >
              <Leaf
                className="absolute -left-2 -top-2 h-24 w-24 rotate-12 nb-paper-text"
                style={{ opacity: 0.05 }}
                strokeWidth={1}
                aria-hidden="true"
              />
              <Leaf
                className="absolute -bottom-3 -right-3 h-28 w-28 -rotate-45 nb-paper-text"
                style={{ opacity: 0.05 }}
                strokeWidth={1}
                aria-hidden="true"
              />

              <div
                className="mb-5 flex h-[92px] w-[92px] items-center justify-center rounded-2xl"
                style={{
                  border: '1px solid color-mix(in srgb, var(--nb-amber) 30%, transparent)',
                  background: 'color-mix(in srgb, var(--nb-amber) 15%, transparent)',
                  boxShadow: '0 6px 20px rgba(185, 118, 45, 0.25)',
                }}
              >
                <GraduationCap className="h-12 w-12" style={{ color: 'var(--nb-amber)' }} strokeWidth={1.75} />
              </div>
              <h1 className="nb-paper-text text-4xl font-extrabold tracking-tight sm:text-5xl">ClassHub</h1>
              <p className="nb-paper-text-soft mt-2 text-sm font-medium">ระบบจัดการห้องเรียนนักเรียน</p>

              <button
                type="button"
                onClick={() => setOpen(true)}
                className="page-fold-btn"
                aria-label="แตะมุมกระดาษเพื่อเปิดสมุดและเข้าสู่ระบบ"
              >
                <span className="page-fold-hint">
                  <BookOpen className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  แตะมุมเพื่อเปิด
                </span>
                <span className="page-fold-triangle" aria-hidden="true" />
              </button>
            </div>

            {/* ด้านในปก (โผล่มาตอนพลิกเปิด) */}
            <div
              className="cover-face cover-back notebook-paper-bg absolute inset-0 rounded-[8px_18px_18px_8px] p-6 pl-12 sm:p-10 sm:pl-[85px]"
              style={{ borderRight: '4px solid color-mix(in srgb, var(--nb-accent) 15%, transparent)' }}
            >
              <h3 className="nb-ink flex items-center gap-2 text-lg font-bold">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{
                    background: 'color-mix(in srgb, var(--nb-amber) 20%, transparent)',
                    color: 'var(--nb-amber)',
                  }}
                >
                  <Sparkles className="h-4 w-4" strokeWidth={2.5} />
                </span>
                ประกาศสำคัญ
              </h3>
              <p className="nb-ink-soft mt-4 text-[13px] leading-relaxed">
                ยินดีต้อนรับสู่ ClassHub กรุณาเข้าสู่ระบบด้วยรหัสนักเรียน เพื่อตรวจตารางเวร ส่งการบ้าน
                และเช็คยอดเงินห้อง
              </p>
            </div>
          </div>

          {/* กระดาษด้านในพร้อมฟอร์ม login (ฝั่งขวา) */}
          <div className="notebook-paper-bg absolute inset-0 overflow-y-auto rounded-2xl py-6 pl-10 pr-4 sm:py-[30px] sm:pl-[85px] sm:pr-10">
            <button type="button" onClick={() => setOpen(false)} className="nb-close-btn absolute right-5 top-[15px] z-10">
              <BookMarked className="h-3.5 w-3.5" strokeWidth={2} />
              ปิดสมุด
            </button>

            <div className="mx-auto mt-6 max-w-[380px]">
              <div className="mb-7">
                <span className="nb-badge">
                  <PenLine className="h-3 w-3" strokeWidth={2.5} />
                  หน้าเข้าสู่ระบบ
                </span>
                <h2 className="nb-ink mt-3 text-xl font-extrabold leading-tight sm:text-[26px]">ยินดีต้อนรับกลับมา</h2>
                <p className="nb-ink-soft mt-1 text-[13px]">กรอกรหัสนักเรียนเพื่อเปิดหน้าการบ้านของคุณ</p>
              </div>

              {success ? (
                <div
                  className="rounded-2xl border-2 border-dashed p-7 text-center"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--nb-accent) 40%, transparent)',
                    background: 'color-mix(in srgb, var(--nb-accent) 5%, transparent)',
                  }}
                >
                  <div
                    className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ background: 'color-mix(in srgb, var(--nb-accent) 15%, transparent)' }}
                  >
                    <Sparkles className="h-6 w-6" style={{ color: 'var(--nb-accent)' }} strokeWidth={2} />
                  </div>
                  <p className="text-lg font-bold" style={{ color: 'var(--nb-accent)' }}>
                    เข้าสู่ระบบสำเร็จ!
                  </p>
                  <p className="nb-ink-soft mt-1 text-[13px]">กำลังพาไปยังหน้าเช็คชื่อ & ทำเวร</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="mb-5 flex flex-col">
                    <label htmlFor="studentId" className="nb-ink mb-1.5 text-[13px] font-bold" style={{ opacity: 0.7 }}>
                      รหัสนักเรียน (5 หลัก)
                    </label>
                    <input
                      id="studentId"
                      inputMode="numeric"
                      maxLength={5}
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value.replace(/\D/g, ''))}
                      placeholder="•••••"
                      className="nb-input text-center tracking-widest"
                    />
                  </div>

                  <div className="mb-5 flex flex-col">
                    <label htmlFor="password" className="nb-ink mb-1.5 text-[13px] font-bold" style={{ opacity: 0.7 }}>
                      รหัสผ่าน
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="nb-input"
                    />
                  </div>

                  {error && (
                    <p className="mb-4 text-sm font-medium" style={{ color: 'var(--danger)' }}>
                      {error}
                    </p>
                  )}

                  <button type="submit" disabled={loading} className="nb-cta group">
                    {loading ? 'กำลังเข้าสู่ระบบ...' : 'เปิดสมุดเข้าใช้งาน'}
                    {!loading && (
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
