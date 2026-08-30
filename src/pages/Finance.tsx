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

async function fetchSummary(ym: string): Promise<FinanceSummary | null> {
  const ref = doc(db, 'finance_summary', ym);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as FinanceSummary) : null;
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

function AddRecordForm({ ym, onDone }: { ym: string; onDone: () => void }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: students = [] } = useQuery({ queryKey: ['students'], queryFn: fetchStudents });
  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<PaymentStatus>('paid');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!profile || !studentId || !amount) throw new Error('missing');
      let proofUrl: string | undefined;
      if (file) proofUrl = await uploadProof(file, 'proofs');
      await addDoc(collection(dbLogs, 'finance'), {
        studentId,
        amount: Number(amount),
        date,
        status,
        note: note || null,
        proofUrl: proofUrl || null,
        createdBy: profile.uid,
      });
      if (status === 'paid') {
        await bumpSummary(date.slice(0, 7), date, Number(amount));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-records', ym] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary', ym] });
      setAmount('');
      setNote('');
      setFile(null);
      onDone();
    },
  });

  return (
    <section className="glass-card flex flex-col gap-3 p-4">
      <h2 className="font-semibold">บันทึกรายการใหม่</h2>
      <select
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        className="rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
      >
        <option value="">เลือกนักเรียน</option>
        {students.map((s) => (
          <option key={s.uid} value={s.studentId}>
            {s.number}. {s.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="จำนวนเงิน (บาท)"
          className="flex-1 rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['paid', 'unpaid', 'pending'] as PaymentStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-xl border py-2 text-sm ${
              status === s ? 'border-brand bg-brand/10 font-semibold text-brand' : 'border-gray-200'
            }`}
          >
            {PAYMENT_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="หมายเหตุ (ถ้ามี)"
        className="rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm"
      />
      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-xl border border-gray-300 py-2 text-sm">
          ยกเลิก
        </button>
        <button
          disabled={!studentId || !amount || create.isPending}
          onClick={() => create.mutate()}
          className="flex-1 rounded-xl bg-brand py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {create.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </section>
  );
}

export default function Finance() {
  const { profile } = useAuth();
  const [ym] = useState(new Date().toISOString().slice(0, 7));
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: students = [] } = useQuery({ queryKey: ['students'], queryFn: fetchStudents });
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['finance-records', ym],
    queryFn: () => fetchMonthRecords(ym),
  });
  const { data: summary } = useQuery({
    queryKey: ['finance-summary', ym],
    queryFn: () => fetchSummary(ym),
  });

  const nameByStudentId = useMemo(
    () => new Map(students.map((s) => [s.studentId, s.name])),
    [students]
  );

  const setStatus = useMutation({
    mutationFn: async ({ record, newStatus }: { record: FinanceRecord; newStatus: PaymentStatus }) => {
      await updateDoc(doc(dbLogs, 'finance', record.id), { status: newStatus });
      if (record.status !== 'paid' && newStatus === 'paid') {
        await bumpSummary(record.date.slice(0, 7), record.date, record.amount);
      } else if (record.status === 'paid' && newStatus !== 'paid') {
        await bumpSummary(record.date.slice(0, 7), record.date, -record.amount);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-records', ym] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary', ym] });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-brand">💰 บัญชี & การเงินห้อง</h1>

      <div className="glass-card p-4">
        <p className="text-sm text-gray-500">ยอดรวมเดือน {ym}</p>
        <p className="text-3xl font-bold text-brand">{(summary?.monthTotal ?? 0).toLocaleString()} บาท</p>
      </div>

      {profile?.role === 'admin' &&
        (showForm ? (
          <AddRecordForm ym={ym} onDone={() => setShowForm(false)} />
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-white shadow-glass active:scale-95"
          >
            ➕ บันทึกรายการใหม่
          </button>
        ))}

      {isLoading ? (
        <p className="text-sm text-gray-400">กำลังโหลดรายการ...</p>
      ) : records.length === 0 ? (
        <div className="glass-card p-6 text-center text-sm text-gray-500">ยังไม่มีรายการเดือนนี้</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {records.map((r) => (
            <li key={r.id} className="glass-card flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-semibold">{nameByStudentId.get(r.studentId) ?? r.studentId}</p>
                <p className="text-xs text-gray-400">
                  {r.date} · {r.amount.toLocaleString()} บาท {r.note ? `· ${r.note}` : ''}
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
                  label={PAYMENT_STATUS_LABEL[r.status].replace(/ [✅❌⏳]/, '')}
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
