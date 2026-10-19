import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, dbLogs } from '../lib/firebase';
import { uploadProof } from '../lib/cloudinary';
import { useAuth } from '../context/AuthContext';
import StatusChip from '../components/StatusChip';
import type { AppUser, FinanceRecord, FinanceSummary, PaymentStatus } from '../types';
import { PAYMENT_STATUS_LABEL } from '../types';

// โมดูล 3: บันทึกสถานะจ่าย (ได้เงิน ✅ / ไม่ได้ ❌ / รอยืนยัน ⏳) + สรุปยอดรวม/เดือน/วันอัตโนมัติ
// finance (เขียนถี่ทุกวัน) อยู่ dbLogs=secondary, finance_summary (cache, เขียนไม่บ่อย) อยู่ db=primary
// ฟอร์มบันทึกรายการทำเป็น 3 ขั้นตอนเหมือนหน้าเวร: เลือกนักเรียน (หลายคนได้) → เลือกสถานะ → ยืนยัน

type Step = 1 | 2 | 3;

const STATUS_OPTIONS: { value: PaymentStatus; emoji: string }[] = [
  { value: 'paid', emoji: '✅' },
  { value: 'unpaid', emoji: '❌' },
  { value: 'pending', emoji: '⏳' },
];

/** ตัดอีโมจิท้ายป้ายสถานะออก (เช่น "ได้เงิน ✅" -> "ได้เงิน") */
const plainLabel = (s: PaymentStatus) => PAYMENT_STATUS_LABEL[s].replace(/ [✅❌⏳]/, '');

/** วันที่ตามเวลาเครื่อง (YYYY-MM-DD) — toISOString ใช้ UTC จะเพี้ยนช่วงเช้ามืดของไทย */
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** ผลต่อยอดรวม: ได้เงิน = เพิ่ม · ใช้เงิน = หักออก · รอยืนยัน = ยังไม่นับ */
function effect(status: PaymentStatus, amount: number) {
  return status === 'paid' ? amount : status === 'unpaid' ? -amount : 0;
}

async function fetchStudents(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() } as AppUser))
    .filter((u) => u.role === 'student')
    .sort((a, b) => a.number - b.number);
}

async function fetchMonthRecords(ym: string): Promise<FinanceRecord[]> {
  const snap = await getDocs(
    query(collection(dbLogs, 'finance'), where('date', '>=', `${ym}-01`), where('date', '<=', `${ym}-31`))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as FinanceRecord))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** อัปเดต finance_summary/{ym} แบบ cache (บวกยอดใหม่เข้าไปแทนคำนวณสดทุกครั้ง) */
async function bumpSummary(ym: string, date: string, delta: number) {
  const ref = doc(db, 'finance_summary', ym);
  const snap = await getDoc(ref);
  const current: FinanceSummary = snap.exists()
    ? (snap.data() as FinanceSummary)
    : { ym, total: 0, monthTotal: 0, byDay: {} };
  const byDay = { ...current.byDay, [date]: (current.byDay[date] || 0) + delta };
  await setDoc(ref, {
    ym,
    total: current.total + delta,
    monthTotal: current.monthTotal + delta,
    byDay,
  });
}

/** บันทึกรายการใหม่ 3 ขั้นตอน (Admin) — หน้าตาและลำดับเหมือนหน้าเวร */
function AddRecordWizard({ ym, onClose }: { ym: string; onClose: () => void }) {
  const { profile, secondaryReady } = useAuth();
  const queryClient = useQueryClient();
  const { data: students = [], isLoading } = useQuery({ queryKey: ['students'], queryFn: fetchStudents });

  const [step, setStep] = useState<Step>(1);
  // เก็บด้วย studentId (รหัสนักเรียน 5 หลัก) เหมือนหน้าเวร เพื่อให้ตรงกับที่หน้าประวัติ/PDF ใช้ค้นหาชื่อ
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState(false);

  const amountNum = Number(amount);
  const amountOk = amount !== '' && Number.isFinite(amountNum) && amountNum > 0;

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile || !status || selected.size === 0 || !amountOk) throw new Error('missing');
      if (!secondaryReady) {
        throw new Error(
          'ยังไม่พร้อมเชื่อมต่อโปรเจกต์ Firebase ที่ 2 (attendance/finance) กรุณาลองใหม่อีกครั้ง หรือออกจากระบบแล้วเข้าใหม่'
        );
      }
      let proofUrl: string | undefined;
      if (file) proofUrl = await uploadProof(file, 'proofs');

      await Promise.all(
        Array.from(selected).map((studentId) =>
          addDoc(collection(dbLogs, 'finance'), {
            studentId,
            amount: amountNum,
            date,
            status,
            note: note.trim() || null,
            proofUrl: proofUrl || null,
            createdBy: profile.uid,
          })
        )
      );
      // อัปเดตยอดรวมครั้งเดียวหลังบันทึกครบทุกคน (ประหยัด read/write)
      const delta = effect(status, amountNum) * selected.size;
      if (delta !== 0) {
        await bumpSummary(date.slice(0, 7), date, delta);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-records', ym] });
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

  function resetForNext() {
    setStep(1);
    setSelected(new Set());
    setStatus(null);
    setAmount('');
    setDate(todayStr());
    setNote('');
    setFile(null);
    setDone(false);
    submit.reset();
  }

  if (done) {
    return (
      <div className="glass-card flex flex-col items-center gap-4 p-8 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-lg font-bold">บันทึกสำเร็จ</h2>
        <p className="text-sm text-gray-500">
          บันทึก {status && plainLabel(status)} {amountNum.toLocaleString()} บาท ให้ {selected.size} คนแล้ว
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-xl border border-gray-300 px-5 py-2">
            เสร็จสิ้น
          </button>
          <button onClick={resetForNext} className="rounded-xl bg-accent px-5 py-2 font-semibold text-white">
            บันทึกรายการใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="font-bold text-accent">➕ บันทึกรายการใหม่</h2>
          <p className="text-sm text-gray-500">ขั้นตอน {step} / 3</p>
        </div>
        <button onClick={onClose} className="text-xs text-gray-400 underline">
          ยกเลิก
        </button>
      </header>

      {/* Step 1: เลือกนักเรียน (หลายคนได้) */}
      {step === 1 && (
        <section className="glass-card p-4">
          <h3 className="mb-3 font-semibold">เลือกนักเรียน ({selected.size} คน)</h3>
          {isLoading ? (
            <p className="text-sm text-gray-400">กำลังโหลดรายชื่อ...</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
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
                            backgroundColor: 'var(--accent)',
                            color: '#ffffff',
                            boxShadow: '0 0 0 2px var(--accent) inset',
                          }
                        : undefined
                    }
                  >
                    <span className="font-semibold">{s.number}</span>
                    <span className="w-full truncate">{s.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          <button
            disabled={selected.size === 0}
            onClick={() => setStep(2)}
            className="mt-4 w-full rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-40"
          >
            ถัดไป
          </button>
        </section>
      )}

      {/* Step 2: เลือกสถานะ */}
      {step === 2 && (
        <section className="glass-card p-4">
          <h3 className="mb-3 font-semibold">เลือกสถานะ</h3>
          <div className="grid grid-cols-3 gap-3">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className="card-button"
                style={
                  status === opt.value
                    ? {
                        backgroundColor: 'var(--accent)',
                        color: '#ffffff',
                        boxShadow: '0 0 0 2px var(--accent) inset',
                      }
                    : undefined
                }
              >
                <span className="text-3xl">{opt.emoji}</span>
                <span>{plainLabel(opt.value)}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setStep(1)} className="flex-1 rounded-xl border border-gray-300 py-3">
              ย้อนกลับ
            </button>
            <button
              disabled={!status}
              onClick={() => setStep(3)}
              className="flex-1 rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-40"
            >
              ถัดไป
            </button>
          </div>
        </section>
      )}

      {/* Step 3: จำนวนเงิน + ยืนยัน + แนบรูปหลักฐาน */}
      {step === 3 && (
        <section className="glass-card p-4">
          <h3 className="mb-3 font-semibold">ยืนยัน + แนบรูปหลักฐาน</h3>
          <p className="mb-3 text-sm">
            {selected.size} คน · {status && plainLabel(status)}
            {amountOk &&
              ` · ${status === 'unpaid' ? 'ใช้ไปรวม' : 'รวม'} ${(amountNum * selected.size).toLocaleString()} บาท`}
          </p>
          <div className="mb-3 flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="จำนวนเงินต่อคน (บาท)"
              disabled={submit.isPending}
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm disabled:opacity-50"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submit.isPending}
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm disabled:opacity-50"
            />
          </div>
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
              disabled={submit.isPending || !secondaryReady || !amountOk}
              onClick={() => submit.mutate()}
              className="flex-1 rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-50"
            >
              {submit.isPending ? 'กำลังบันทึก...' : !secondaryReady ? 'กำลังเชื่อมต่อ...' : 'ยืนยันบันทึก'}
            </button>
          </div>
          {submit.isError && (
            <p className="mt-2 text-sm text-danger">
              {(submit.error as Error)?.message || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'}
            </p>
          )}
        </section>
      )}

      {/* ทับทั้งหน้าจอตอนกำลังบันทึก กันกดซ้ำ/กดปุ่มอื่นระหว่างรอ */}
      {submit.isPending && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm">
          <div className="h-10 w-10 animate-spin rounded-full border-4 spinner-ring" />
          <p className="text-sm font-semibold text-accent">กำลังบันทึก กรุณารอสักครู่...</p>
        </div>
      )}
    </div>
  );
}

export default function Finance() {
  const { profile } = useAuth();
  const [ym] = useState(todayStr().slice(0, 7));
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: students = [] } = useQuery({ queryKey: ['students'], queryFn: fetchStudents });
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['finance-records', ym],
    queryFn: () => fetchMonthRecords(ym),
  });

  // คำนวณจากรายการของเดือนที่โหลดมาแล้ว (ไม่เสีย read เพิ่ม และตรงกับรายการเสมอ)
  const { income, spent } = useMemo(() => {
    let inc = 0;
    let out = 0;
    for (const r of records) {
      if (r.status === 'paid') inc += r.amount;
      else if (r.status === 'unpaid') out += r.amount;
    }
    return { income: inc, spent: out };
  }, [records]);

  const nameByStudentId = useMemo(
    () => new Map(students.map((s) => [s.studentId, s.name])),
    [students]
  );

  const setStatus = useMutation({
    mutationFn: async ({ record, newStatus }: { record: FinanceRecord; newStatus: PaymentStatus }) => {
      await updateDoc(doc(dbLogs, 'finance', record.id), { status: newStatus });
      const delta = effect(newStatus, record.amount) - effect(record.status, record.amount);
      if (delta !== 0) {
        await bumpSummary(record.date.slice(0, 7), record.date, delta);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-records', ym] });
    },
  });

  return (
    <div className="flex flex-col gap-4" style={{ ['--accent' as string]: 'var(--finance)' }}>
      <h1 className="text-xl font-bold text-accent">💰 บัญชี & การเงินห้อง</h1>

      <div className="glass-card p-4">
        <p className="text-sm text-gray-500">ยอดคงเหลือเดือน {ym}</p>
        <p className="text-3xl font-bold text-accent">{(income - spent).toLocaleString()} บาท</p>
        <p className="mt-1 text-xs text-gray-400">
          ได้เงิน {income.toLocaleString()} · ใช้เงิน {spent.toLocaleString()} บาท
        </p>
      </div>

      {profile?.role === 'admin' &&
        (showForm ? (
          <AddRecordWizard ym={ym} onClose={() => setShowForm(false)} />
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full rounded-xl bg-accent py-3 font-semibold text-white shadow-glass active:scale-95"
          >
            ➕ บันทึกรายการใหม่
          </button>
        ))}

      {setStatus.isError && <p className="text-sm text-danger">เปลี่ยนสถานะไม่สำเร็จ ลองใหม่อีกครั้ง</p>}

      {isLoading ? (
        <p className="text-sm text-gray-400">กำลังโหลดรายการ...</p>
      ) : records.length === 0 ? (
        <div className="glass-card p-6 text-center text-sm text-gray-500">ยังไม่มีรายการเดือนนี้</div>
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2">
          {records.map((r) => (
            <li key={r.id} className="glass-card flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-semibold">{nameByStudentId.get(r.studentId) ?? r.studentId}</p>
                <p className="text-xs text-gray-400">
                  {r.date} · {r.status === 'unpaid' ? '−' : ''}
                  {r.amount.toLocaleString()} บาท {r.note ? `· ${r.note}` : ''}
                </p>
              </div>
              {profile?.role === 'admin' ? (
                <select
                  value={r.status}
                  onChange={(e) =>
                    setStatus.mutate({ record: r, newStatus: e.target.value as PaymentStatus })
                  }
                  className="rounded-full border-none bg-transparent text-sm"
                >
                  {(['paid', 'unpaid', 'pending'] as PaymentStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {PAYMENT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              ) : (
                <StatusChip
                  label={plainLabel(r.status)}
                  variant={r.status === 'paid' ? 'ok' : r.status === 'unpaid' ? 'danger' : 'pending'}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
