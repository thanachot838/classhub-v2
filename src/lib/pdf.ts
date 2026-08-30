import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SarabunBase64 } from '../fonts/sarabun';

export interface PdfRow {
  number: number | string;
  name: string;
  type: string;
  date: string;
}

/** สร้างรายงาน PDF ภาษาไทยรายเดือน (สระ/วรรณยุกต์ไม่เพี้ยน) */
export function exportMonthlyPdf(rows: PdfRow[], month: string) {
  const doc = new jsPDF();

  // ต้องระบุฟอนต์ทั้งใน setFont และใน autoTable ไม่งั้นหัวตารางจะเพี้ยน
  doc.addFileToVFS('Sarabun.ttf', SarabunBase64);
  doc.addFont('Sarabun.ttf', 'Sarabun', 'normal');
  doc.setFont('Sarabun');

  doc.setFontSize(16);
  doc.text(`สรุปประจำเดือน ${month}`, 14, 16);

  autoTable(doc, {
    startY: 24,
    styles: { font: 'Sarabun' },
    head: [['เลขที่', 'ชื่อ', 'ประเภท', 'วันที่']],
    body: rows.map((r) => [r.number, r.name, r.type, r.date]),
  });

  doc.save(`report-${month}.pdf`);
}
