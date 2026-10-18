const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/** บีบรูปเป็น WebP ~150KB ก่อนอัป เพื่อประหยัด bandwidth/CDN quota */
async function compress(file: File): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('เปิดรูปนี้ไม่ได้ ลองใช้รูปแบบ JPG หรือ PNG');
  }
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);

  // Safari/มือถือรุ่นเก่าไม่มี OffscreenCanvas จึงถอยไปใช้ canvas ปกติแทน
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    return canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('บีบรูปไม่สำเร็จ ลองใหม่อีกครั้ง'))),
      'image/webp',
      0.8
    )
  );
}

/**
 * อัปโหลดรูปหลักฐานตรงจาก browser ไปยัง Cloudinary (unsigned preset)
 * คืนค่า secure_url สำหรับเก็บลงใน Firestore (proofUrl)
 */
export async function uploadProof(
  file: File,
  folder: 'proofs' | 'homework' | 'theme'
): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      'ยังไม่ได้ตั้งค่า VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET ใน .env'
    );
  }

  const blob = await compress(file);
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: form }
  );

  if (!res.ok) {
    throw new Error('อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง');
  }

  const data = await res.json();
  return data.secure_url as string;
}
