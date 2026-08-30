/**
 * โมดูลกลาง: เชื่อมต่อ Firebase Admin SDK ทั้ง 2 โปรเจกต์ และสร้าง/อัปเดตบัญชีผู้ใช้
 * แบบ "คู่แฝด" (twin account) ใช้ร่วมกันทั้งจาก create-user.js (สร้างทีละคน)
 * และ bulk-create-users.js (สร้างทีเดียวหลายคนจากไฟล์รายชื่อ)
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

const primaryKeyPath = join(__dirname, 'serviceAccount.primary.json');
const secondaryKeyPath = join(__dirname, 'serviceAccount.secondary.json');

export function assertServiceAccountsExist() {
  if (!existsSync(primaryKeyPath)) {
    throw new Error(
      `ไม่พบไฟล์ ${primaryKeyPath}\n` +
        '   ไปที่ Firebase Console (โปรเจกต์ PRIMARY) -> Project settings -> Service accounts\n' +
        '   -> Generate new private key -> เซฟเป็น scripts/serviceAccount.primary.json'
    );
  }
  if (!existsSync(secondaryKeyPath)) {
    throw new Error(
      `ไม่พบไฟล์ ${secondaryKeyPath}\n` +
        '   ทำแบบเดียวกับ primary แต่เลือกโปรเจกต์ SECONDARY แล้วเซฟเป็น\n' +
        '   scripts/serviceAccount.secondary.json'
    );
  }
}

let cachedApps = null;

// เริ่ม Firebase Admin App ทั้ง 2 โปรเจกต์ครั้งเดียว แล้วแคชไว้ใช้ซ้ำ
// (สำคัญสำหรับ bulk script ที่เรียกฟังก์ชันนี้วนหลายรอบ — กัน error "app already exists")
export function getAdminApps() {
  if (cachedApps) return cachedApps;

  assertServiceAccountsExist();
  const primaryServiceAccount = JSON.parse(readFileSync(primaryKeyPath, 'utf-8'));
  const secondaryServiceAccount = JSON.parse(readFileSync(secondaryKeyPath, 'utf-8'));

  const existingPrimary = getApps().find((a) => a.name === 'primary-admin');
  const existingSecondary = getApps().find((a) => a.name === 'secondary-admin');

  const primaryApp = existingPrimary || initializeApp({ credential: cert(primaryServiceAccount) }, 'primary-admin');
  const secondaryApp =
    existingSecondary || initializeApp({ credential: cert(secondaryServiceAccount) }, 'secondary-admin');

  cachedApps = {
    primaryAuth: getAuth(primaryApp),
    secondaryAuth: getAuth(secondaryApp),
    primaryDb: getFirestore(primaryApp),
    secondaryDb: getFirestore(secondaryApp),
  };
  return cachedApps;
}

async function upsertAuthUser(authInstance, email, password, displayName, projectLabel, log) {
  try {
    const existing = await authInstance.getUserByEmail(email);
    await authInstance.updateUser(existing.uid, { password });
    log(`   ↳ [${projectLabel}] มีผู้ใช้อยู่แล้ว — อัปเดตรหัสผ่านให้ตรงกัน (uid: ${existing.uid})`);
    return existing.uid;
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      const created = await authInstance.createUser({ email, password, displayName });
      log(`   ↳ [${projectLabel}] สร้างผู้ใช้ใหม่ (uid: ${created.uid})`);
      return created.uid;
    }
    throw err;
  }
}

/**
 * สร้าง/อัปเดตบัญชีคู่แฝด 1 คน ในทั้ง 2 โปรเจกต์
 * @param {{studentId:string, name:string, password:string, role:'admin'|'student', number?:number, class?:string}} user
 * @param {(msg:string)=>void} [log] ฟังก์ชันพิมพ์ log (ค่าเริ่มต้น console.log)
 */
export async function createTwinAccount(user, log = console.log) {
  const { studentId, name, password, role } = user;
  const number = Number(user.number) || 0;
  const klass = user.class || '-';
  const email = `${studentId}@classhub.local`;

  if (!studentId || studentId.length !== 5) throw new Error(`studentId ต้องมี 5 หลัก ได้รับ: "${studentId}"`);
  if (!name) throw new Error('ต้องระบุชื่อ (name)');
  if (!password || password.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
  if (!['admin', 'student'].includes(role)) throw new Error(`role ต้องเป็น admin หรือ student ได้รับ: "${role}"`);

  const { primaryAuth, secondaryAuth, primaryDb, secondaryDb } = getAdminApps();

  const primaryUid = await upsertAuthUser(primaryAuth, email, password, name, 'PRIMARY', log);
  await primaryDb.collection('users').doc(primaryUid).set(
    { studentId, name, number, class: klass, role, mustChangePassword: true },
    { merge: true }
  );
  log(`   ↳ [PRIMARY] บันทึก Firestore users/${primaryUid} แล้ว`);

  const secondaryUid = await upsertAuthUser(secondaryAuth, email, password, name, 'SECONDARY', log);
  await secondaryDb.collection('users').doc(secondaryUid).set({ role }, { merge: true });
  log(`   ↳ [SECONDARY] บันทึก Firestore users/${secondaryUid} แล้ว`);

  return { email, primaryUid, secondaryUid };
}
