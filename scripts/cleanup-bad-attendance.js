/**
 * สคริปต์ล้างข้อมูล "เช็คชื่อ/ทำเวร" เก่าที่เสียหายจากบั๊ก:
 * เวอร์ชันก่อนแก้ไข Attendance.tsx เก็บ Firebase UID ไว้ในฟิลด์ studentId แทนที่จะเก็บ
 * รหัสนักเรียน 5 หลัก ทำให้หน้า "ประวัติ" และ Export PDF หาชื่อไม่เจอ (ขึ้นตัวอักษรมั่วๆ แทน)
 *
 * สคริปต์นี้จะสแกน collection "attendance" ในโปรเจกต์ SECONDARY แล้วลบเฉพาะ document
 * ที่ studentId ไม่ใช่ตัวเลข 5 หลัก (ของจริงต้องเป็นแบบ "07401" เท่านั้น)
 *
 * ใช้ Service Account เดียวกับ create-user.js ต้องมีไฟล์
 * scripts/serviceAccount.secondary.json อยู่แล้ว (สร้างไว้ตั้งแต่ตอนสร้างบัญชี Admin)
 *
 * วิธีใช้ (ดูรายการก่อน ไม่ลบจริง):
 *   node scripts/cleanup-bad-attendance.js --dry-run
 *
 * ลบจริง:
 *   node scripts/cleanup-bad-attendance.js
 */

import { getAdminApps } from './user-creation.js';

const dryRun = process.argv.includes('--dry-run');
const VALID_STUDENT_ID = /^\d{5}$/;

async function main() {
  const { secondaryDb } = getAdminApps();
  const snap = await secondaryDb.collection('attendance').get();

  console.log(`พบข้อมูลเช็คชื่อทั้งหมด ${snap.size} รายการ กำลังตรวจสอบ...\n`);

  const bad = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (!VALID_STUDENT_ID.test(String(data.studentId || ''))) {
      bad.push({ id: docSnap.id, studentId: data.studentId, date: data.date, type: data.type });
    }
  });

  if (bad.length === 0) {
    console.log('✅ ไม่พบข้อมูลเสีย ไม่ต้องล้างอะไรเพิ่ม');
    process.exit(0);
  }

  console.log(`พบข้อมูลเสีย ${bad.length} รายการ (studentId ไม่ใช่รหัสนักเรียน 5 หลัก):\n`);
  for (const b of bad) {
    console.log(`  - doc:${b.id}  studentId:"${b.studentId}"  วันที่:${b.date}  ประเภท:${b.type}`);
  }

  if (dryRun) {
    console.log('\n(โหมด --dry-run: ยังไม่ได้ลบจริง รันซ้ำโดยไม่ใส่ --dry-run เพื่อลบจริง)');
    process.exit(0);
  }

  console.log('\nกำลังลบ...');
  for (const b of bad) {
    await secondaryDb.collection('attendance').doc(b.id).delete();
    console.log(`  ✅ ลบแล้ว: ${b.id}`);
  }
  console.log(`\n🎉 ลบข้อมูลเสียครบ ${bad.length} รายการเรียบร้อย`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ เกิดข้อผิดพลาด:', err.message || err);
  process.exit(1);
});
