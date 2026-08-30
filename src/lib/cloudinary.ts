const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/** บีบรูปเป็น WebP ~150KB ก่อนอัป เพื่อประหยัด bandwidth/CDN quota */
async function compress(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(
    Math.round(bmp.width * scale),
    Math.round(bmp.height * scale)
  );
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
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
