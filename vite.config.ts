import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// เปลี่ยน base เป็นชื่อ repo ของคุณตอน deploy บน GitHub Pages
// เช่น ถ้า repo ชื่อ "classhub-v2" ให้ใช้ base: '/classhub-v2/'
export default defineConfig({
  plugins: [react()],
  base: '/classhub-v2/',
});
