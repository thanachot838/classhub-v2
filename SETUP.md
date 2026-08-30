# คู่มือ Setup ClassHub v2

โปรเจกต์นี้สร้างตามเอกสารออกแบบ (Design Spec) — โครง React + Vite + TypeScript +
Tailwind พร้อม Firebase / Cloudinary / jsPDF ครบไฟล์ให้รันได้ทันที ส่วนที่ยังเป็น
**TODO** คือ UI รายละเอียดของโมดูล 2–5 (มีคอมเมนต์กำกับไว้ในแต่ละไฟล์) ส่วนโมดูล 1
(เช็คชื่อ & ทำเวร) ทำให้ครบทั้ง flow แล้วเป็นตัวอย่าง

## 0. ติดตั้ง dependencies

```bash
npm install
```

## 1. สร้าง Firebase Project 2 อัน (ฟรี ไม่ผูกบัตร)

ClassHub v2 ใช้ Firebase **2 โปรเจกต์แยกกัน** เพื่อแบ่งโควตา read/write รายวันของ
Firestore (โปรเจกต์ละ 50,000 read / 20,000 write / วัน บนแผน Spark ฟรี) ไม่ให้ collection
ที่เขียนถี่ (`attendance`, `finance`) ไปแย่งโควตากับ collection อื่น:

| โปรเจกต์ | เก็บอะไร | เหตุผล |
|---|---|---|
| **PRIMARY** | `users`, `homework` (+`submissions`), `settings`, `finance_summary` | เขียนไม่บ่อย |
| **SECONDARY** | `attendance`, `finance` | เขียนทุกวัน ทุกคน ปริมาณเยอะสุด |

ทำซ้ำขั้นตอนนี้ **2 รอบ** (ตั้งชื่อแยกกัน เช่น `classhub-primary` และ `classhub-secondary`):

1. ไปที่ https://console.firebase.google.com → "Add project"
2. ปิด Google Analytics ได้ (ไม่จำเป็น)
3. เมนูซ้าย → **Build → Authentication** → Get started → เปิด provider "Email/Password"
4. เมนูซ้าย → **Build → Firestore Database** → Create database → เลือก production mode →
   เลือก region ใกล้ไทย (เช่น `asia-southeast1`) — **ตั้งทั้ง 2 โปรเจกต์ให้ region เดียวกัน**
5. เมนูซ้าย → ⚙️ Project settings → เลื่อนลงหา "Your apps" → กด `</>` (Web) →
   ตั้งชื่อ app → คัดลอกค่า `firebaseConfig` มาใส่ในไฟล์ `.env`
   (โปรเจกต์แรกใส่ช่อง `VITE_FIREBASE_PRIMARY_*`, โปรเจกต์ที่สองใส่ช่อง `VITE_FIREBASE_SECONDARY_*`)

**สำคัญ:** ต้องอยู่บนแพ็กเกจ **Spark (ฟรี)** ทั้ง 2 โปรเจกต์ — อย่ากด upgrade เป็น Blaze
เพราะจะต้องผูกบัตรเครดิต (ผิดเกณฑ์ตามเอกสารออกแบบข้อ 1) การมี 2 โปรเจกต์**ไม่ได้ช่วยเลี่ยง**
กฎนี้ถ้าจะใช้ Cloud Storage — เราจึงยังฝากรูปไว้ที่ Cloudinary เหมือนเดิม (ดูหัวข้อ 4)

## 2. ตั้งค่า Firestore Security Rules + Indexes (deploy แยกโปรเจกต์)

```bash
npm install -g firebase-tools
firebase login

# --- โปรเจกต์ PRIMARY ---
firebase use --add   # เลือกโปรเจกต์ primary ตั้ง alias ว่า "primary"
firebase deploy --only firestore:rules,firestore:indexes \
  --project primary \
  --config firebase.primary.json    # ดูตัวอย่างการตั้งค่าด้านล่าง

# --- โปรเจกต์ SECONDARY ---
firebase use --add   # เลือกโปรเจกต์ secondary ตั้ง alias ว่า "secondary"
firebase deploy --only firestore:rules,firestore:indexes \
  --project secondary \
  --config firebase.secondary.json
```

หรือง่ายที่สุด: เปิด Firebase Console ของแต่ละโปรเจกต์ → Firestore Database → Rules →
คัดลอกเนื้อหาจาก `firestore.primary.rules` (สำหรับโปรเจกต์ primary) หรือ
`firestore.secondary.rules` (สำหรับโปรเจกต์ secondary) ไปวาง → Publish
แล้วสร้าง Composite Index ตามที่ระบุใน `firestore.secondary.indexes.json` ด้วยมือในหน้า
Firestore → Indexes ก็ได้เช่นกัน

## 3. สร้างบัญชี Admin คนแรกแบบ "คู่แฝด" ในทั้ง 2 โปรเจกต์

Auth ของระบบนี้ map "รหัสนักเรียน 5 หลัก" เป็นอีเมลภายใน `<รหัส>@classhub.local`
(ดู `src/pages/Login.tsx`) เพราะแอปนี้ sign-in **ทั้ง 2 โปรเจกต์พร้อมกัน** ทุกครั้งที่ login
(เพื่อให้ Security Rules ของโปรเจกต์ secondary เห็น `request.auth` ด้วย) จึงต้องสร้าง
ผู้ใช้แบบ **อีเมล/รหัสผ่านตรงกันเป๊ะ** ในทั้ง 2 โปรเจกต์ทุกครั้งที่เพิ่มนักเรียนใหม่:

**ในโปรเจกต์ PRIMARY:**
1. Authentication → Users → Add user → อีเมล `00001@classhub.local` ตั้งรหัสผ่านชั่วคราว
2. Firestore Database → เริ่ม collection `users` → เพิ่ม document โดยใช้ **UID เดียวกับที่เพิ่งสร้าง**
   ใส่ฟิลด์:
   ```json
   {
     "studentId": "00001",
     "name": "ครูแอดมิน",
     "number": 0,
     "class": "-",
     "role": "admin",
     "mustChangePassword": true
   }
   ```

**ในโปรเจกต์ SECONDARY:**
1. Authentication → Users → Add user → **อีเมลและรหัสผ่านต้องตรงกับ primary เป๊ะ**
   (`00001@classhub.local` + รหัสผ่านเดียวกัน) — UID ที่ได้จะ**ไม่ตรงกับ primary** และไม่เป็นไร
2. Firestore Database → เริ่ม collection `users` → เพิ่ม document โดยใช้ **UID ของโปรเจกต์ secondary เอง**
   (ไม่ใช่ UID จาก primary) ใส่แค่ field เดียว:
   ```json
   { "role": "admin" }
   ```

⚠️ ขั้นตอนนี้ทำมือ 2 รอบต่อผู้ใช้ 1 คน ถ้าห้องมีนักเรียนเยอะ แนะนำเขียนสคริปต์ Node.js
เรียก Firebase Admin SDK สร้างทั้ง 2 โปรเจกต์พร้อมกันแทนการกดทีละคนใน Console
(อยู่นอกขอบเขตของโค้ดชุดนี้ — บอกได้ถ้าต้องการให้เขียนสคริปต์นี้เพิ่ม)

## 4. ตั้งค่า Cloudinary (ฟรี ไม่ผูกบัตร)

1. สมัครที่ https://cloudinary.com/users/register/free
2. หน้า Dashboard จะเห็น **Cloud name** — คัดลอกไปใส่ `.env`
3. ไปที่ Settings (⚙️) → Upload → เลื่อนลงหา "Upload presets" → Add upload preset
   - Signing Mode: **Unsigned**
   - Preset name: `classhub_unsigned` (หรือชื่ออื่น แต่ต้องตรงกับ `.env`)
   - Folder: จำกัดไว้ล่วงหน้าได้ถ้าต้องการ
   - แนะนำจำกัด: Max file size, Allowed formats (jpg, png, webp) เพื่อกัน spam
     (unsigned preset ใครมี cloud_name ก็อัปได้ ตามคำเตือนในเอกสารออกแบบข้อ 8)
4. คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่า:

```bash
cp .env.example .env
```

## 5. ฟอนต์ Sarabun สำหรับ PDF

1. ดาวน์โหลด `Sarabun-Regular.ttf` จาก https://fonts.google.com/specimen/Sarabun
2. แปลงเป็น base64:
   ```bash
   node -e "console.log(require('fs').readFileSync('Sarabun-Regular.ttf').toString('base64'))" > sarabun-base64.txt
   ```
3. เปิด `src/fonts/sarabun.ts` แล้วแทนที่ `export const SarabunBase64 = '';`
   ด้วย `export const SarabunBase64 = '<ค่าที่ได้จากไฟล์ sarabun-base64.txt>';`
   (ไฟล์จะยาวมาก ~200KB ไม่ต้องกังวล เป็นเรื่องปกติ)

## 6. รันตอน dev

```bash
npm run dev
```

## 7. Deploy ขึ้น GitHub Pages (ฟรีถาวร)

1. สร้าง repo บน GitHub เช่น `classhub-v2`
2. แก้ `base` ใน `vite.config.ts` และ `basename` ใน `src/main.tsx` ให้ตรงกับชื่อ repo
3. push โค้ดขึ้น repo แล้วรัน:
   ```bash
   npm run deploy
   ```
   (สคริปต์นี้ build แล้ว push โฟลเดอร์ `dist` ไปที่ branch `gh-pages` ให้อัตโนมัติ
   ผ่านแพ็กเกจ `gh-pages` ที่ติดตั้งไว้แล้ว)
4. ไปที่ repo → Settings → Pages → เลือก branch `gh-pages` เป็น source
5. เว็บจะพร้อมใช้งานที่ `https://<username>.github.io/classhub-v2/`

## 8. สิ่งที่เหลือให้ทำต่อ (ตามหัวข้อ 13 ในเอกสารออกแบบ)

- [x] วางโครงโปรเจกต์ครบไฟล์ พร้อมรัน
- [x] โมดูล "เช็คชื่อ & ทำเวร" ทำครบ flow เชื่อม Firestore (2 โปรเจกต์) + Cloudinary จริง
- [x] แบ่ง Firestore เป็น 2 โปรเจกต์ (primary/secondary) เพื่อกันโควตา read/write เต็ม
- [ ] เติม UI โมดูล 2 (ติดตาม & ส่งงาน) — โครง Firestore พร้อมแล้วใน `src/types` (อยู่ฝั่ง primary)
- [ ] เติม UI โมดูล 3 (บัญชี & การเงินห้อง) — `finance` อยู่ secondary, `finance_summary` อยู่ primary
- [ ] เติม UI โมดูล 4 (ประวัติ + ตัวกรองวันที่ ก่อนเรียก `exportMonthlyPdf`) — ดึงจาก secondary
- [ ] เติม UI โมดูล 5 (จัดการผู้ใช้ / เปลี่ยนรหัส / ปรับธีม) — ตอนสร้างผู้ใช้ใหม่ต้องเขียนลง
      ทั้ง 2 โปรเจกต์ (ดูข้อ 3) แนะนำทำเป็นฟอร์มเดียวที่ยิง Firebase Admin SDK ทั้งคู่พร้อมกัน
- [ ] ตั้งค่า `mustChangePassword` flow บังคับเปลี่ยนรหัสรอบแรกจริง — ต้องเปลี่ยนรหัสผ่าน
      พร้อมกันทั้ง 2 โปรเจกต์ (primary auth + secondary auth) ไม่งั้นรหัสจะไม่ตรงกันอีกต่อไป
- [ ] เขียนสคริปต์ Node.js (Firebase Admin SDK) สำหรับสร้าง/แก้บัญชีนักเรียนแบบ "คู่แฝด"
      ในทั้ง 2 โปรเจกต์อัตโนมัติ แทนการกดมือทีละคนใน Console — ลดความเสี่ยงรหัสสองฝั่งไม่ตรงกัน
