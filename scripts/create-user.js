/**
 * สคริปต์สร้างบัญชีผู้ใช้ (admin หรือ student) แบบ "คู่แฝด" ในทั้ง 2 โปรเจกต์ Firebase
 * (primary + secondary) พร้อมกันในคำสั่งเดียว — ไม่ต้องกดมือใน Console ทีละขั้น
 *
 * ก่อนใช้งานต้องมี Service Account Key ของทั้ง 2 โปรเจกต์:
 *   1. Firebase Console -> โปรเจกต์ PRIMARY -> ⚙️ Project settings -> Service accounts
 *      -> Generate new private key -> เซฟเป็น scripts/serviceAccount.primary.json
 *   2. ทำซ้ำสำหรับโปรเจกต์ SECONDARY -> เซฟเป็น scripts/serviceAccount.secondary.json
 *
 * ⚠️ ไฟล์ serviceAccount.*.json ห้าม commit ขึ้น GitHub เด็ดขาด (อยู่ใน .gitignore แล้ว)
 *
 * วิธีใช้:
 *   npm run create-user -- --id 00001 --name "ครูแอดมิน" --password "รหัสผ่านชั่วคราว" --role admin
 *   npm run create-user -- --id 00002 --name "สมชาย ใจดี" --number 1 --class "M5/1" --password "1234abcd" --role student
 */

import { createTwinAccount } from './user-creation.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { role: 'student', number: 0, class: '-' };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    out[key] = args[i + 1];
  }
  return out;
}

const args = parseArgs();

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!args.id) fail('ต้องระบุ --id (รหัสนักเรียน/แอดมิน 5 หลัก)');
if (!args.name) fail('ต้องระบุ --name (ชื่อ-นามสกุล)');
if (!args.password) fail('ต้องระบุ --password (รหัสผ่านชั่วคราว)');

const studentId = String(args.id).padStart(5, '0');

async function main() {
  console.log(`\nกำลังสร้างบัญชี "คู่แฝด" สำหรับ ${studentId}@classhub.local (role: ${args.role}) ...\n`);
  await createTwinAccount({
    studentId,
    name: args.name,
    password: args.password,
    role: args.role,
    number: args.number,
    class: args.class,
  });
  console.log(`\n✅ เสร็จสิ้น! เข้าสู่ระบบด้วยรหัส ${studentId} และรหัสผ่านที่ตั้งไว้ได้เลย`);
  console.log('   (ระบบจะบังคับให้เปลี่ยนรหัสผ่านตอน login ครั้งแรก เพราะ mustChangePassword: true)\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ เกิดข้อผิดพลาด:', err.message || err);
  process.exit(1);
});
