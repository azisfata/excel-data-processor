import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Activity, ProcessingResult } from '@/types';

export const generateRkbDocumentPdf = async (
  activities: Activity[],
  selectedYear: number | 'all',
  selectedMonth: number | 'all' | 'no-date',
  selectedStatus: Set<string>,
  resultData?: ProcessingResult
): Promise<Blob> => {
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 10;
  const marginRight = 10;
  const availableWidth = pageWidth - marginLeft - marginRight;

  // ===== HEADER TITLE =====
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('LAPORAN KEMAJUAN KEGIATAN BULANAN', pageWidth / 2, 15, { align: 'center' });

  const monthNames = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  let bulanText = 'Semua Bulan';
  if (selectedMonth === 'no-date') bulanText = 'Tanpa Tanggal';
  else if (typeof selectedMonth === 'number') bulanText = monthNames[selectedMonth];
  const bulanLabel = `Bulan: ${bulanText} ${selectedYear === 'all' ? '' : selectedYear}`;

  // ===== TABEL HEADER INFO =====
  let y = 20;
  autoTable(doc, {
    startY: y,
    body: [
      [
        {
          content: 'Laporan Kemajuan Kegiatan Bulanan',
          colSpan: 3,
          styles: {
            halign: 'left',
            fontStyle: 'bold',
            fontSize: 12,
            fillColor: [0, 0, 0],
            textColor: [255, 255, 255],
            cellPadding: 4,
          },
        },
        {
          content: bulanLabel,
          styles: {
            halign: 'right',
            fontStyle: 'bold',
            fontSize: 12,
            fillColor: [0, 0, 0],
            textColor: [255, 255, 255],
            cellPadding: 4,
          },
        },
      ],
      [
        { content: 'Program :', styles: { fontStyle: 'bold', cellPadding: 2 } },
        {
          content: 'Program Dukungan Manajemen dan Pelaksanaan Tugas Teknis Lainnya Kemenko PMK',
        },
        { content: 'Satuan Kerja', styles: { fontStyle: 'bold', halign: 'center' } },
        { content: 'Biro Digitalisasi dan Pengelolaan Informasi' },
      ],
      [
        { content: 'Kegiatan :', styles: { fontStyle: 'bold', cellPadding: 2 } },
        {
          content:
            'Dukungan Manajemen Internal Kementerian Koordinator Bidang Pembangunan Manusia dan Kebudayaan (6336)',
          colSpan: 3,
        },
      ],
      [
        { content: 'Layanan :', styles: { fontStyle: 'bold', cellPadding: 2 } },
        { content: 'Layanan Data dan Informasi (6336.963)', colSpan: 3 },
      ],
    ],
    theme: 'grid',
    styles: {
      fontSize: 9,
      halign: 'left',
      valign: 'middle',
      lineColor: [0, 0, 0],
      lineWidth: 0.12,
      cellPadding: 2,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: availableWidth - 25 - 80 - 60 },
      2: { cellWidth: 80 },
      3: { cellWidth: 60 },
    },
    margin: { left: marginLeft, right: marginRight },
  });

  const tableStartY = (doc as any).lastAutoTable.finalY;

  // ===== TABLE DATA =====
  const tableBody = activities.map((activity, index) => {
    const tanggalPelaksanaan = activity.tanggal_pelaksanaan
      ? new Date(activity.tanggal_pelaksanaan).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '-';

    // Calculate total allocations for Rencana Anggaran
    const totalAlokasi = activity.allocations.reduce((sum, alloc) => sum + (alloc.jumlah || 0), 0);

    return [
      (index + 1).toString(), // No.
      'PL: Rapat', // Komponen Kegiatan
      activity.nama || '-', // Judul Kegiatan
      activity.kl_unit_terkait || '-', // K/L/Unit Terkait
      activity.deskripsi || '-', // Tujuan
      '1.4', // RB
      '-', // PN/PP/KP
      tanggalPelaksanaan, // Tanggal Pelaksanaan
      `Rp ${formatCurrency(totalAlokasi)}`, // Rencana Anggaran(Rp)
    ];
  });

  // Hitung total lebar tabel atas
  const colWidthsTopTable = [25, availableWidth - 25 - 80 - 60, 80, 60];
  const totalWidthTopTable = colWidthsTopTable.reduce((sum, w) => sum + w, 0);

  // ===== Kolom bawah disesuaikan =====
  const colWidthsBottomTable = [
    12, // No.
    25, // Komponen Kegiatan
    20, // Judul Kegiatan
    40, // K/L/Unit Terkait
    35, // Tujuan
    10, // RB
    20, // PN/PP/KP
    25, // Tanggal Pelaksanaan
    25, // Rencana Anggaran(Rp)
  ];

  const totalWidthBottomTable = colWidthsBottomTable.reduce((sum, w) => sum + w, 0);
  const difference = totalWidthTopTable - totalWidthBottomTable;
  if (difference !== 0) {
    colWidthsBottomTable[2] += difference;
  }

  autoTable(doc, {
    startY: tableStartY,
    head: [
      [
        'No.',
        'Komponen Kegiatan',
        'Judul Kegiatan',
        'K/L/Unit Terkait',
        'Tujuan',
        'RB',
        'PN/PP/KP',
        'Tanggal Pelaksanaan',
        'Rencana Anggaran(Rp)',
      ],
    ],
    body: tableBody,
    styles: {
      fontSize: 9,
      cellPadding: 2,
      valign: 'top',
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: colWidthsBottomTable[0] },
      1: { cellWidth: colWidthsBottomTable[1] },
      2: { cellWidth: colWidthsBottomTable[2] },
      3: { cellWidth: colWidthsBottomTable[3] },
      4: { cellWidth: colWidthsBottomTable[4] },
      5: { cellWidth: colWidthsBottomTable[5] },
      6: { cellWidth: colWidthsBottomTable[6] },
      7: { cellWidth: colWidthsBottomTable[7] },
      8: { cellWidth: colWidthsBottomTable[8] },
    },
    margin: { left: marginLeft, right: marginRight },
    theme: 'grid',
    didDrawPage: data => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(9);
      doc.text(`Halaman ${data.pageNumber} dari ${pageCount}`, pageWidth - 40, pageHeight - 10);
    },
  });

  // === Tambahkan tabel tanda tangan menyatu rapi ===
  const lastTable = (doc as any).lastAutoTable;
  const finalY = lastTable.finalY;

  // Overlap 0.2 mm agar border bawah & atas saling menutup
  const startY = finalY - 0.2;

  // Tambahkan tabel tanda tangan
  autoTable(doc, {
    startY: startY,
    body: [
      [
        {
          content: 'Dipersiapkan Oleh:\nKepala Biro Digitalisasi dan Pengelolaan Informasi\n\n\n\n\n\n\nAgung Gumilar Triyanto',
          styles: {
            halign: 'left',
            valign: 'top',
            cellPadding: 4,
            fontSize: 9,
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
          },
        },
        {
          content: 'Mengetahui:\nSekretaris Kementerian Koordinator Bidang PMK\n\n\n\n\n\n\nImam Machdi',
          styles: {
            halign: 'left',
            valign: 'top',
            cellPadding: 4,
            fontSize: 9,
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
          },
        },
        {
          content: 'Arahan:',
          styles: {
            halign: 'left',
            valign: 'top',
            cellPadding: 4,
            fontSize: 9,
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
          },
        },
      ],
    ],
    styles: {
      fontSize: 9,
      cellPadding: 2,
      valign: 'top',
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: availableWidth / 3 },
      1: { cellWidth: availableWidth / 3 },
      2: { cellWidth: availableWidth / 3 },
    },
    margin: { left: marginLeft, right: marginRight },
    theme: 'grid',
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.1,
  });

  return doc.output('blob');
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace('Rp', '')
    .trim();
};
