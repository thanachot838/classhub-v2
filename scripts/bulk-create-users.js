/**
 * สคริปต์สร้างบัญชีนักเรียน "ทั้งห้อง" พร้อมกันจากไฟล์รายชื่อ scripts/roster.json
 * ใช้ตรรกะเดียวกับ create-user.js (ผ่าน user-creation.js) แต่วนสร้างทีละคนอัตโนมัติ
 * แทนที่จะรันคำสั่งทีละคน
 *
 * รูปแบบรหัสผ่านชั่วคราว: รหัสนักเรียน + "0" ต่อท้าย (เช่น 07401 -> 074010)
 * เพื่อให้ครบ 6 ตัวอักษรตามข้อกำหนดของ Firebase Auth
 * ทุกคนถูกบังคับเปลี่ยนรหัสผ่านตอน login ครั้งแรกอยู่แล้ว (mustChangePassword: true)
 *
 * ก่อนใช้งานต้องมีไฟล์ scripts/serviceAccount.primary.json และ
 * scripts/serviceAccount.secondary.json แล้ว (ดูวิธีสร้างใน create-user.js)
 *
 * แก้ไขรายชื่อ/ห้องได้ที่ scripts/roster.json แล้วรัน:
 *   npm run bulk-create-users
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createTwinAccount } from './user-creation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// แก้ชื่อห้องตรงนี้ถ้าต้องใช้กับห้องอื่น
const CLASS_NAME = 'M5/1';
const PASSWORD_SUFFIX = '0'; // รหัสผ่าน = studentId + ตัวนี้

const rosterPath = join(__dirname, 'roster.json');
const roster = JSON.parse(readFileSync(rosterPath, 'utf-8'));

async function main() {
  console.log(`กำลังสร้างบัญชีนักเรียนทั้งหมด ${roster.length} คน สำหรับห้อง ${CLASS_NAME} ...\n`);

  const results = [];
  const errors = [];

  for (const student of roster) {
    const studentId = String(student.studentId).padStart(5, '0');
    const password = `${studentId}${PASSWORD_SUFFIX}`;

    console.log(`[เลขที่ ${student.number}] ${student.name} (${studentId})`);
    try {
      await createTwinAccount({
        studentId,
        name: student.name,
        password,
        role: 'student',
        number: student.number,
        class: CLASS_NAME,
      });
      results.push({ number: student.number, studentId, name: student.name, password });
    } catch (err) {
      console.error(`   ❌ ล้มเหลว: ${err.message || err}`);
      errors.push({ number: student.number, studentId, name: student.name, error: err.message || String(err) });
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`สร้างสำเร็จ ${results.length}/${roster.length} คน`);
  if (errors.length) {
    console.log(`ล้มเหลว ${errors.length} คน:`);
    for (const e of errors) console.log(`  - เลขที่ ${e.number} (${e.studentId}) ${e.name}: ${e.error}`);
  }
  console.log('='.repeat(60));

  if (results.length) {
    console.log('\nรายชื่อ + รหัสผ่านชั่วคราว (แจกให้นักเรียนแต่ละคน):\n');
    console.log('เลขที่\tรหัสนักเรียน\tชื่อ\t\t\t\tรหัสผ่าน');
    for (const r of results) {
      console.log(`${r.number}\t${r.studentId}\t\t${r.name}\t${r.password}`);
    }
  }

  process.exit(errors.length ? 1 : 0);
}

main().catch((err) => {
  console.error('\n❌ เกิดข้อผิดพลาดร้ายแรง:', err.message || err);
  process.exit(1);
});
