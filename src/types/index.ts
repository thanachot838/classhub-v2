// ตรงกับ Firestore Schema ในเอกสารออกแบบ (หัวข้อ 6)
//
// ⚠️ ข้อมูลด้านล่างนี้ถูกแบ่งเก็บใน Firebase 2 โปรเจกต์เพื่อแบ่งโควตา read/write รายวัน
// (ดู src/lib/firebase.ts):
//   PRIMARY (db)     -> AppUser, HomeworkTask, HomeworkSubmission, FinanceSummary, ThemeSettings
//   SECONDARY (dbLogs) -> AttendanceRecord, FinanceRecord (เขียนถี่สุด ทุกวันทุกคน)

export type Role = 'admin' | 'student';

export interface AppUser {
  uid: string;
  studentId: string; // รหัสนักเรียน 5 หลัก
  name: string;
  number: number; // เลขที่
  class: string;
  role: Role;
  mustChangePassword: boolean;
}

export type AttendanceType = 'duty' | 'task' | 'leave' | 'late'; // ทำเวร / ทำภารกิจ / ลา / มาสาย

export interface AttendanceRecord {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  type: AttendanceType;
  note?: string;
  proofUrl?: string;
  createdBy: string;
  createdAt: number;
}

export type PaymentStatus = 'paid' | 'unpaid' | 'pending'; // ได้เงิน / ไม่ได้ / รอยืนยัน

export interface FinanceRecord {
  id: string;
  studentId: string;
  amount: number;
  date: string;
  status: PaymentStatus;
  note?: string;
  proofUrl?: string;
  createdBy: string;
}

export interface HomeworkTask {
  id: string;
  subject: string;
  title: string;
  detail: string;
  deadline: string;
  createdBy: string;
}

export interface HomeworkSubmission {
  uid: string;
  submittedAt: number;
  verified: boolean;
  proofUrl: string;
}

export interface FinanceSummary {
  ym: string; // เช่น "2026-08"
  total: number;
  monthTotal: number;
  byDay: Record<string, number>;
}

export interface ThemeSettings {
  sliderImages: string[]; // 3 รูป ตาม spec
  backgroundUrl?: string;
}

/** ควบคุมสิทธิ์ + กันเช็คชื่อซ้ำซ้อน เก็บที่ settings/attendanceControl (primary) */
export interface AttendanceControl {
  adminUid?: string; // uid ของแอดมินคนเดียวที่มีสิทธิ์เช็คชื่อ (ว่าง = ยังไม่มีใครรับสิทธิ์)
  adminName?: string;
  lockSessionId?: string; // สุ่มใหม่ทุกครั้งที่เปิดหน้าเช็คชื่อ กันเปิดซ้อนกันหลายแท็บ/เครื่อง
  lockedAt?: number; // epoch ms ของ heartbeat ล่าสุด
  lockDate?: string; // YYYY-MM-DD ของวันที่ lock นี้ใช้งาน
}

export const ATTENDANCE_TYPE_LABEL: Record<AttendanceType, string> = {
  duty: 'ทำเวร',
  task: 'ทำภารกิจ',
  leave: 'ลา',
  late: 'มาสาย',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: 'ได้เงิน ✅',
  unpaid: 'ไม่ได้ ❌',
  pending: 'รอยืนยัน ⏳',
};
