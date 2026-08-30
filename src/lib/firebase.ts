import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * ClassHub v2 ใช้ Firebase 2 โปรเจกต์ (ทั้งคู่แผน Spark ฟรี ไม่ผูกบัตร) เพื่อ "แบ่ง" โควตา
 * อ่าน/เขียนรายวันของ Firestore ออกเป็น 2 ก้อน (โปรเจกต์ละ 50,000 read / 20,000 write / วัน)
 * แทนที่จะยัดทุก collection ไว้โปรเจกต์เดียว
 *
 * แบ่งงานตามความถี่การเขียน:
 *  - PRIMARY   (ยืนยันตัวตนหลัก + ข้อมูลที่แก้ไม่บ่อย)
 *      -> users, homework (+ submissions), settings, finance_summary
 *  - SECONDARY (ข้อมูลที่ถูกเขียนทุกวัน ปริมาณเยอะสุด)
 *      -> attendance, finance
 *
 * Firebase Authentication ผูกอยู่กับแต่ละโปรเจกต์แยกกัน ดังนั้นตอน login ต้อง sign-in
 * ทั้ง 2 โปรเจกต์พร้อมกันด้วย credential เดียวกัน (ดู src/pages/Login.tsx) เพื่อให้
 * Firestore Security Rules ของโปรเจกต์ secondary เห็น request.auth ด้วย — งั้น
 * ต้องสร้างบัญชีผู้ใช้ "คู่แฝด" ในทั้ง 2 โปรเจกต์ตอนเพิ่มนักเรียนใหม่ (ดู SETUP.md ข้อ 3)
 */

const primaryConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_PRIMARY_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_PRIMARY_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PRIMARY_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_PRIMARY_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_PRIMARY_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_PRIMARY_APP_ID,
};

const secondaryConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_SECONDARY_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_SECONDARY_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_SECONDARY_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_SECONDARY_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SECONDARY_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_SECONDARY_APP_ID,
};

export const primaryApp = initializeApp(primaryConfig, 'primary');
export const secondaryApp = initializeApp(secondaryConfig, 'secondary');

// Auth หลัก (ใช้ profile.role, mustChangePassword ฯลฯ จากตรงนี้)
export const auth = getAuth(primaryApp);
// Auth รอง — เอาไว้แค่ทำให้ request.auth ของ secondary project ไม่เป็น null
export const authSecondary = getAuth(secondaryApp);

// Firestore หลัก: users, homework(+submissions), settings, finance_summary
export const db = getFirestore(primaryApp);
// Firestore รอง: attendance, finance (เขียนถี่สุด แยกไว้กันโควตาเต็ม)
export const dbLogs = getFirestore(secondaryApp);

// หมายเหตุ: เราตั้งใจไม่ใช้ Firebase Storage / Cloud Functions
// เพราะตั้งแต่ 3 ก.พ. 2569 Cloud Storage บังคับแผน Blaze (ต้องผูกบัตรเครดิต)
// ทุกโปรเจกต์ ไม่ว่าจะเปิดกี่โปรเจกต์ก็ตาม — รูปภาพทั้งหมดจึงยังฝากไว้ที่ Cloudinary
