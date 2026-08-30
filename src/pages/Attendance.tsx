import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, addDoc, serverTimestamp, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, dbLogs } from '../lib/firebase';
import { uploadProof } from '../lib/cloudinary';
import { useAuth } from '../context/AuthContext';
import type { AppUser, AttendanceControl, AttendanceType } from '../types';
import { ATTENDANCE_TYPE_LABEL } from '../types';

type Step = 1 | 2 | 3;

// แท็บ/เครื่องนี้ถือ session lock อยู่ได้นานสุดกี่ ms ก่อนถือว่าหลุด (ปิดเบราว์เซอร์ไปเฉยๆ ไม่ได้ปลดล็อก)
const LOCK_TTL_MS = 45_000;
const HEARTBEAT_MS = 20_000;

const TYPE_OPTIONS: { value: AttendanceType; emoji: string }[] = [
  { value: 'duty', emoji: '🧹' },
  { value: 'task', emoji: '📦' },
  { value: 'leave', emoji: '🌿' },
  { value: 'late', emoji: '⏰' },
];

async function fetchStudents(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() } as AppUser))
    .filter((u) => u.role === 'student')
    .sort((a, b) => a.number - b.number);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * ควบคุมสิทธิ์เช็คชื่อ 2 ชั้นตามที่ตกลง:
 *  1) จำกัดสิทธิ์แบบถาวร: มีแอดมินได้แค่ "คนเดียว" ที่เช็คชื่อได้ (adminUid ใน settings/attendanceControl)
 *  2) กันเปิดซ้อน: แอดมินคนนั้นเปิดหน้านี้พร้อมกันหลายแท็บ/เครื่องไม่ได้ (lockSessionId + heartbeat)
 */
function useAttendanceControl(profileUid: string | undefined) {
  const [control, setControl] = useState<AttendanceControl | null>(null);
  const [loadingControl, setLoadingControl] = useState(true);
  const sessionId = useRef(crypto.randomUUID());
  const holdsLock = useRef(false);
  // ใช้บังคับ re-render เป็นระยะ เพื่อคำนวณ "ล็อกหมดอายุหรือยัง" ใหม่เรื่อยๆ
  // ไม่งั้นถ้าอีกเครื่อง (เช่นมือถือ) ปิดไปกะทันหันโดยไม่ทัน release lock, Firestore doc
  // จะไม่มีการเปลี่ยนแปลงใหม่เข้ามาอีกเลย (ไม่มี onSnapshot event ใหม่) หน้าที่ถูกบล็อกอยู่
  // (เช่นฝั่งคอม) จะค้างที่ foreignLockActive=true ตลอดไป เพราะ Date.now() ไม่เคยถูกคำนวณซ้ำ
  const [, setTick] = useState(0);

  useEffect(() => {
    const ref = doc(db, 'settings', 'attendanceControl');
    const unsub = onSnapshot(ref, (snap) => {
      setControl(snap.exists() ? (snap.data() as AttendanceControl) : {});
      setLoadingControl(false);
    });
    return unsub;
  }, []);

  // เช็คซ้ำทุก 2 วินาทีว่าล็อกหมดอายุหรือยัง (ครอบคลุมกรณีอีกเครื่องปิดไปเฉยๆ ไม่ทัน release)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 2_000);
    return () => clearInterval(interval);
  }, []);

  const isDesignatedAdmin = !!control?.adminUid && control.adminUid === profileUid;
  const noOneAssignedYet = !control?.adminUid;

  const foreignLockActive =
    isDesignatedAdmin &&
    !!control?.lockSessionId &&
    control.lockSessionId !== sessionId.current &&
    control.lockDate === todayStr() &&
    Date.now() - (control.lockedAt ?? 0) < LOCK_TTL_MS;

  // แอดมินที่ได้รับมอบหมาย + ไม่มีใครล็อกอยู่ (หรือ lock เป็นของเราเอง) -> เข้าไปจับ lock ให้ตัวเอง + heartbeat ต่อเนื่อง
  useEffect(() => {
    if (!isDesignatedAdmin || foreignLockActive) return;
    const ref = doc(db, 'settings', 'attendanceControl');

    async function acquire() {
      holdsLock.current = true;
      await setDoc(
        ref,
        { lockSessionId: sessionId.current, lockedAt: Date.now(), lockDate: todayStr() },
        { merge: true }
      );
    }
    acquire();

    const interval = setInterval(() => {
      if (holdsLock.current) {
        setDoc(ref, { lockedAt: Date.now() }, { merge: true }).catch(() => {});
      }
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
      holdsLock.current = false;
      // ปล่อย lock ให้แท็บ/เครื่องอื่นใช้ได้ทันทีตอนออกจากหน้านี้ (best-effort)
      setDoc(ref, { lockSessionId: null }, { merge: true }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesignatedAdmin, foreignLockActive]);

  async function claimRole(name: string) {
    await setDoc(
      doc(db, 'settings', 'attendanceControl'),
      { adminUid: profileUid, adminName: name },
      { merge: true }
    );
  }

  async function releaseRole() {
    await setDoc(
      doc(db, 'settings', 'attendanceControl'),
      { adminUid: null, adminName: null, lockSessionId: null },
      { merge: true }
    );
  }

  return {
    control,
    loadingControl,
    isDesignatedAdmin,
    noOneAssignedYet,
    foreignLockActive,
    claimRole,
    releaseRole,
  };
}

export default function Attendance() {
  const { profile, secondaryReady } = useAuth();
  const queryClient = useQueryClient();
  const { data: students = [], isLoading } = useQuery({
    queryKey: ['students'],
    queryFn: fetchStudents,
  });

  const { control, loadingControl, isDesignatedAdmin, noOneAssignedYet, foreignLockActive, claimRole, releaseRole } =
    useAttendanceControl(profile?.uid);

  const [step, setStep] = useState<Step>(1);
  // เก็บด้วย studentId (รหัสนักเรียน 5 หลัก) ไม่ใช่ uid — เพื่อให้ตรงกับที่หน้าประวัติ/PDF ใช้ค้นหาชื่อ
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [type, setType] = useState<AttendanceType | null>(null);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      if (!type || !profile) throw new Error('missing');
      if (!secondaryReady) {
        throw new Error(
          'ยังไม่พร้อมเชื่อมต่อโปรเจกต์ Firebase ที่ 2 (attendance/finance) กรุณาลองใหม่อีกครั้ง หรือออกจากระบบแล้วเข้าใหม่'
        );
      }
      let proofUrl: string | undefined;
      if (file) proofUrl = await uploadProof(file, 'proofs');

      const date = todayStr();
      // attendance เขียนถี่มาก (ทุกวัน ทุกคน) จึงแยกไปอยู่ dbLogs (โปรเจกต์ secondary)
      // เพื่อไม่ให้กินโควตา write ของโปรเจกต์ primary ที่เก็บ users/homework/settings
      const batch = Array.from(selected).map((studentId) =>
        addDoc(collection(dbLogs, 'attendance'), {
          studentId,
          date,
          type,
          note: note || null,
          proofUrl: proofUrl || null,
          createdBy: profile.uid,
          createdAt: serverTimestamp(),
        })
      );
      await Promise.all(batch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setDone(true);
    },
  });

  function toggleStudent(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(studentId) ? next.delete(studentId) : next.add(studentId);
      return next;
    });
  }

  function reset() {
    setStep(1);
    setSelected(new Set());
    setType(null);
    setNote('');
    setFile(null);
    setDone(false);
  }

  // โมดูลนี้เป็นเครื่องมือของแอดมิน (ต้องเขียน settings/attendanceControl ซึ่ง Rules อนุญาตเฉพาะแอดมิน)
  if (profile && profile.role !== 'admin') {
    return (
      <div className="glass-card flex flex-col items-center gap-3 p-8 text-center">
        <div className="text-4xl">🧑‍🏫</div>
        <h2 className="text-lg font-bold">โมดูลนี้สำหรับแอดมินเท่านั้น</h2>
        <p className="text-sm text-gray-500">การเช็คชื่อ/ทำเวรถูกจัดการโดยแอดมินของห้อง</p>
      </div>
    );
  }

  // ---- ชั้นควบคุมสิทธิ์: รอโหลดสถานะสิทธิ์ก่อน ----
  if (loadingControl) {
    return <p className="text-sm text-gray-400">กำลังตรวจสอบสิทธิ์...</p>;
  }

  // ยังไม่มีใครรับสิทธิ์เป็นผู้เช็คชื่อเลย — แอดมินคนแรกที่เข้ามาเลือกรับสิทธิ์ได้
  if (noOneAssignedYet && profile) {
    return (
      <div className="glass-card flex flex-col items-center gap-4 p-8 text-center">
        <div className="text-4xl">🔐</div>
        <h2 className="text-lg font-bold">ยังไม่มีผู้รับผิดชอบเช็คชื่อ</h2>
        <p className="text-sm text-gray-500">
          เพื่อกันข้อมูลซ้ำซ้อน ระบบจะให้แอดมิน "คนเดียว" เป็นผู้เช็คชื่อ/ทำเวรได้ในแต่ละช่วง
        </p>
        <button
          onClick={() => claimRole(profile.name)}
          className="rounded-xl bg-brand px-6 py-3 font-semibold text-white shadow-glass active:scale-95"
        >
          รับสิทธิ์เป็นผู้เช็คชื่อ
        </button>
      </div>
    );
  }

  // มีคนรับสิทธิ์แล้วแต่ไม่ใช่เรา — บล็อกไม่ให้เช็คชื่อ
  if (!isDesignatedAdmin) {
    return (
      <div className="glass-card flex flex-col items-center gap-3 p-8 text-center">
        <div className="text-4xl">🚫</div>
        <h2 className="text-lg font-bold">เช็คชื่อได้เฉพาะผู้ที่ได้รับมอบหมาย</h2>
        <p className="text-sm text-gray-500">
          ตอนนี้ <span className="font-semibold text-brand">{control?.adminName}</span> เป็นผู้รับผิดชอบเช็คชื่ออยู่
        </p>
      </div>
    );
  }

  // เป็นแอดมินที่ได้รับมอบหมาย แต่มีอีกแท็บ/เครื่องของแอดมินคนเดียวกันเปิดค้างอยู่
  if (foreignLockActive) {
    return (
      <div className="glass-card flex flex-col items-center gap-3 p-8 text-center">
        <div className="text-4xl">⏳</div>
        <h2 className="text-lg font-bold">กำลังเช็คชื่ออยู่ในอีกหน้าต่าง/เครื่อง</h2>
        <p className="text-sm text-gray-500">
          ปิดแท็บหรือหน้าต่างอื่นที่เปิด ClassHub ค้างไว้ก่อน แล้วรีเฟรชหน้านี้อีกครั้ง
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="glass-card flex flex-col items-center gap-4 p-8 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-lg font-bold">บันทึกสำเร็จ</h2>
        <p className="text-sm text-gray-500">
          บันทึก {ATTENDANCE_TYPE_LABEL[type!]} ให้ {selected.size} คนแล้ว
        </p>
        <button onClick={reset} className="rounded-xl bg-brand px-6 py-2 font-semibold text-white">
          บันทึกรายการใหม่
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand">🧹 เช็คชื่อ & ทำเวร</h1>
          <p className="text-sm text-gray-500">ขั้นตอน {step} / 3</p>
        </div>
        <button onClick={releaseRole} className="text-xs text-gray-400 underline">
          สละสิทธิ์ผู้เช็คชื่อ
        </button>
      </header>

      {/* Step 1: Batch Select students */}
      {step === 1 && (
        <section className="glass-card p-4">
          <h2 className="mb-3 font-semibold">เลือกนักเรียน ({selected.size} คน)</h2>
          {isLoading ? (
            <p className="text-sm text-gray-400">กำลังโหลดรายชื่อ...</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {students.map((s) => {
                const isSelected = selected.has(s.studentId);
                return (
                  <button
                    key={s.uid}
                    onClick={() => toggleStudent(s.studentId)}
                    className="card-button !p-3 text-sm transition-colors"
                    style={
                      isSelected
                        ? {
                            backgroundColor: '#00B894',
                            color: '#ffffff',
                            boxShadow: '0 0 0 2px #00B894 inset',
                          }
                        : undefined
                    }
                  >
                    <span className="font-semibold">{s.number}</span>
                    <span className="truncate w-full">{s.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          <button
            disabled={selected.size === 0}
            onClick={() => setStep(2)}
            className="mt-4 w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-40"
          >
            ถัดไป
          </button>
        </section>
      )}

      {/* Step 2: choose type */}
      {step === 2 && (
        <section className="glass-card p-4">
          <h2 className="mb-3 font-semibold">เลือกประเภท</h2>
          <div className="grid grid-cols-2 gap-3">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setType(opt.value)}
                className="card-button"
                style={
                  type === opt.value
                    ? {
                        backgroundColor: '#00B894',
                        color: '#ffffff',
                        boxShadow: '0 0 0 2px #00B894 inset',
                      }
                    : undefined
                }
              >
                <span className="text-3xl">{opt.emoji}</span>
                <span>{ATTENDANCE_TYPE_LABEL[opt.value]}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setStep(1)} className="flex-1 rounded-xl border border-gray-300 py-3">
              ย้อนกลับ
            </button>
            <button
              disabled={!type}
              onClick={() => setStep(3)}
              className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-40"
            >
              ถัดไป
            </button>
          </div>
        </section>
      )}

      {/* Step 3: confirm + attach proof */}
      {step === 3 && (
        <section className="glass-card p-4">
          <h2 className="mb-3 font-semibold">ยืนยัน + แนบรูปหลักฐาน</h2>
          <p className="mb-2 text-sm">
            {selected.size} คน · {type && ATTENDANCE_TYPE_LABEL[type]}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุ (ถ้ามี)"
            disabled={submit.isPending}
            className="mb-3 w-full rounded-xl border border-gray-200 bg-white/70 p-3 text-sm disabled:opacity-50"
            rows={2}
          />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={submit.isPending}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mb-4 w-full text-sm disabled:opacity-50"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              disabled={submit.isPending}
              className="flex-1 rounded-xl border border-gray-300 py-3 disabled:opacity-40"
            >
              ย้อนกลับ
            </button>
            <button
              disabled={submit.isPending || !secondaryReady}
              onClick={() => submit.mutate()}
              className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50"
            >
              {submit.isPending
                ? 'กำลังบันทึก...'
                : !secondaryReady
                  ? 'กำลังเชื่อมต่อ...'
                  : 'ยืนยันบันทึก'}
            </button>
          </div>
          {submit.isError && (
            <p className="mt-2 text-sm text-danger">
              {(submit.error as Error)?.message || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'}
            </p>
          )}
        </section>
      )}

      {/* ทับทั้งหน้าจอตอนกำลังบันทึก กันกดซ้ำ/กดปุ่มอื่นระหว่างรอ (เช่นแท็บเมนูด้านล่าง) */}
      {submit.isPending && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
          <p className="text-sm font-semibold text-brand">กำลังบันทึก กรุณารอสักครู่...</p>
        </div>
      )}
    </div>
  );
}
