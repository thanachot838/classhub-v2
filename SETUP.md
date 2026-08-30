# คู่มือ Setup ClassHub v2

โปรเจกต์นี้สร้างตามเอกสารออกแบบ (Design Spec) — โครง React + Vite + TypeScript +
Tailwind พร้อม Firebase (2 โปรเจกต์) / Cloudinary / jsPDF **ครบทั้ง 5 โมดูลแล้ว**
พร้อมใช้งานจริง (ดูเช็คลิสต์ท้ายไฟล์นี้สำหรับสิ่งที่เหลือให้ปรับแต่งเพิ่มเติม)

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

**ทางลัด (แนะนำถ้าห้องมีนักเรียนหลายคน):** ไม่ต้องทำมือ 2 รอบต่อคนตามข้อข้างบน — ใช้สคริปต์
`scripts/create-user.js` (ทีละคน) หรือ `scripts/bulk-create-users.js` (ทีเดียวหลายคนจาก
`scripts/roster.json`) ที่มีอยู่ในโปรเจกต์แล้ว ซึ่งเรียก Firebase Admin SDK สร้างบัญชี "คู่แฝด"
ในทั้ง 2 โปรเจกต์พร้อมกันให้อัตโนมัติ — ต้องมี `scripts/serviceAccount.primary.json` และ
`scripts/serviceAccount.secondary.json` ก่อน (ดูวิธีดาวน์โหลดในคอมเมนต์บนสุดของไฟล์สคริปต์):

```bash
node scripts/create-user.js -- --id 00001 --name "ครูแอดมิน" --password "รหัสผ่านชั่วคราว" --role admin
node scripts/bulk-create-users.js   # อ่านรายชื่อจาก scripts/roster.json
```

## 4. ตั้งค่า Cloudinary (ฟรี ไม่ผูกบัตร)

1. สมัครที่ https://cloudinary.com/users/register/free
2. หน้า Dashboard จะเห็น **Cloud name** — คัดลอกไปใส่ `.env`
3. ไปที่ Settings (⚙️) → Upload → เลื่อนลงหา "Upload presets" → Add upload preset
   - Signing Mode: **Unsigned**
   - Preset name: `classhub_unsigned` (หรือชื่ออื่น แต่ต้องตรงกับ `.env`)
   - Folder: จำกัดไว้ล่วงหน้าได้ถ้าต้องการ
   - แนะนำจำกัด: Max file size, Allowed formats (jpg, png, webp) เพื่อกัน spam
     (unsigned preset ใครมี cloud_name ก็อัปได้ ตามคำเตือนในเอกสารออกแบบข้อ 8)
4. สร้างไฟล์ `.env` ที่ root ของโปรเจกต์ (อยู่ใน `.gitignore` แล้ว จะไม่ถูก commit ขึ้น git)
   แล้วใส่ค่าตามชื่อตัวแปรทั้งหมดนี้ (ดูค่าจริงจาก Firebase Console และ Cloudinary Dashboard):

```
VITE_FIREBASE_PRIMARY_API_KEY=
VITE_FIREBASE_PRIMARY_AUTH_DOMAIN=
VITE_FIREBASE_PRIMARY_PROJECT_ID=
VITE_FIREBASE_PRIMARY_STORAGE_BUCKET=
VITE_FIREBASE_PRIMARY_MESSAGING_SENDER_ID=
VITE_FIREBASE_PRIMARY_APP_ID=

VITE_FIREBASE_SECONDARY_API_KEY=
VITE_FIREBASE_SECONDARY_AUTH_DOMAIN=
VITE_FIREBASE_SECONDARY_PROJECT_ID=
VITE_FIREBASE_SECONDARY_STORAGE_BUCKET=
VITE_FIREBASE_SECONDARY_MESSAGING_SENDER_ID=
VITE_FIREBASE_SECONDARY_APP_ID=

VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=
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

## 8. สถานะปัจจุบัน

- [x] วางโครงโปรเจกต์ครบไฟล์ พร้อมรัน
- [x] แบ่ง Firestore เป็น 2 โปรเจกต์ (primary/secondary) เพื่อกันโควตา read/write เต็ม
- [x] โมดูล 1 เช็คชื่อ & ทำเวร — ครบ flow 3 สเต็ป + ระบบล็อกสิทธิ์ผู้เช็คชื่อ (กันข้อมูลชนกัน)
- [x] โมดูล 2 ติดตาม & ส่งงาน — สร้างงาน (แอดมิน) / ส่งรูปการบ้าน (นักเรียน) / Modal ตรวจหลักฐาน
- [x] โมดูล 3 บัญชี & การเงินห้อง — บันทึกสถานะจ่าย + สรุปยอดอัตโนมัติ (cache ที่ finance_summary)
- [x] โมดูล 4 ประวัติ & Export PDF — กรองช่วงวันที่ + export PDF ภาษาไทยผ่าน jsPDF+Sarabun
- [x] โมดูล 5 ผู้ใช้ & ความปลอดภัย — เปลี่ยนรหัสผ่าน (เคลียร์ mustChangePassword อัตโนมัติ) / ปรับธีม / คู่มือใช้งาน
- [x] สคริปต์ Node.js สร้างบัญชี "คู่แฝด" ทั้งทีละคน (`create-user.js`) และเป็นชุด (`bulk-create-users.js`)

### สิ่งที่ยังเหลือให้พิจารณาต่อ (ไม่กระทบการใช้งานพื้นฐาน)

- [ ] **บังคับเปลี่ยนรหัสผ่านรอบแรกแบบ hard-block** — ตอนนี้แค่โชว์ข้อความเตือนในหน้าโปรไฟล์
      เท่านั้น ยังไม่ได้ redirect บังคับก่อนเข้าใช้งานโมดูลอื่น (ตัดสินใจแล้วว่าไม่จำเป็นสำหรับตอนนี้)
- [ ] เพิ่ม npm script alias `create-user` / `bulk-create-users` ใน `package.json`
      (ตอนนี้ต้องรันตรงด้วย `node scripts/create-user.js -- --id ...`)
- [ ] `bumpSummary()` ใน `Finance.tsx` เป็น read-then-write ธรรมดา ถ้าแอดมิน 2 คน
      บันทึกพร้อมกันพอดีอาจมีค่าคลาดเคลื่อนเล็กน้อย — พิจารณาเปลี่ยนไปใช้ Firestore `increment()`
      หรือ transaction ถ้าห้องมีแอดมินหลายคนใช้งานพร้อมกันบ่อย
