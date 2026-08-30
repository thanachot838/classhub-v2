import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, dbLogs } from '../lib/firebase';
import { exportMonthlyPdf } from '../lib/pdf';
import type { AppUser, AttendanceRecord, FinanceRecord } from '../types';
import { ATTENDANCE_TYPE_LABEL, PAYMENT_STATUS_LABEL } from '../types';

// โมดูล 4: ตารางย้อนหลัง กรองตามวันที่ + แปลงเป็นรายงาน PDF รายเดือน
// attendance/finance อยู่ Firebase โปรเจกต์ SECONDARY (dbLogs)

type Row = { number: number; name: string; type: string; date: string };

async function fetchStudents(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() } as AppUser))
    .filter((u) => u.role === 'student')
    .sort((a, b) => a.number - b.number);
}

async function fetchAttendance(from: string, to: string): Promise<AttendanceRecord[]> {
  const snap = await getDocs(
    query(collection(dbLogs, 'attendance'), where('date', '>=', from), where('date', '<=', to))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord));
}

async function fetchFinance(from: string, to: string): Promise<FinanceRecord[]> {
  const snap = await getDocs(
    query(collection(dbLogs, 'finance'), where('date', '>=', from), where('date', '<=', to))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FinanceRecord));
}

export default function History() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState<'attendance' | 'finance'>('attendance');

  const { data: students = [] } = useQuery({ queryKey: ['students'], queryFn: fetchStudents });
  const { data: attendance = [], isLoading: loadingA } = useQuery({
    queryKey: ['history-attendance', from, to],
    queryFn: () => fetchAttendance(from, to),
  });
  const { data: finance = [], isLoading: loadingF } = useQuery({
    queryKey: ['history-finance', from, to],
    queryFn: () => fetchFinance(from, to),
  });

  const byStudentId = useMemo(() => {
    const m = new Map<string, AppUser>();
    students.forEach((s) => m.set(s.studentId, s));
    return m;
  }, [students]);

  const attendanceRows: Row[] = useMemo(
    () =>
      attendance
        .map((r) => {
          const s = byStudentId.get(r.studentId);
          return { number: s?.number ?? 0, name: s?.name ?? r.studentId, type: ATTENDANCE_TYPE_LABEL[r.type], date: r.date };
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [attendance, byStudentId]
  );

  const financeRows: Row[] = useMemo(
    () =>
      finance
        .map((r) => {
          const s = byStudentId.get(r.studentId);
          return {
            number: s?.number ?? 0,
            name: s?.name ?? r.studentId,
            type: `${r.amount.toLocaleString()} บาท · ${PAYMENT_STATUS_LABEL[r.status]}`,
            date: r.date,
          };
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [finance, byStudentId]
  );

  const rows = tab === 'attendance' ? attendanceRows : financeRows;
  const isLoading = tab === 'attendance' ? loadingA : loadingF;

  function handleExport() {
    exportMonthlyPdf(rows, from.slice(0, 7));
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-brand">📄 ประวัติ & Export PDF</h1>

      <section className="glass-card flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-gray-600">
            จากวันที่
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-gray-600">
            ถึงวันที่
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('attendance')}
            className={`flex-1 rounded-xl py-2 text-sm ${tab === 'attendance' ? 'bg-brand text-white font-semibold' : 'border border-gray-200'}`}
          >
            🧹 เช็คชื่อ/เวร
          </button>
          <button
            onClick={() => setTab('finance')}
            className={`flex-1 rounded-xl py-2 text-sm ${tab === 'finance' ? 'bg-brand text-white font-semibold' : 'border border-gray-200'}`}
          >
            💰 การเงิน
          </button>
        </div>
      </section>

      {isLoading ? (
        <p className="text-sm text-gray-400">กำลังโหลด...</p>
      ) : rows.length === 0 ? (
        <div className="glass-card p-6 text-center text-sm text-gray-500">ไม่มีข้อมูลในช่วงวันที่นี้</div>
      ) : (
        <div className="glass-card overflow-x-auto p-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="p-2">เลขที่</th>
                <th className="p-2">ชื่อ</th>
                <th className="p-2">ประเภท</th>
                <th className="p-2">วันที่</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="p-2">{r.number}</td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.type}</td>
                  <td className="p-2">{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={handleExport}
        disabled={rows.length === 0}
        className="rounded-xl bg-brand py-3 font-semibold text-white shadow-glass active:scale-95 disabled:opacity-40"
      >
        📥 Export PDF ({from} ถึง {to})
      </button>
      <p className="text-xs text-gray-400">
        ⚠️ ต้องใส่ค่า Sarabun base64 ใน src/fonts/sarabun.ts ก่อน export จะได้ตัวอักษรไทยไม่เพี้ยน
        (ดู SETUP.md)
      </p>
    </div>
  );
}
