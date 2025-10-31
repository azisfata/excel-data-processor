import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Activity, ProcessingResult } from '@/types';

/**
 * Generates an RKB (Rencana Kegiatan Bulanan) PDF based on pre-filtered activities
 * The activities passed to this function are already filtered according to user selections
 * This function only formats the data for PDF output
 */

export const generateRkbPdf = async (
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
    'Januari','Februari','Maret','April','Mei','Juni',
    'Juli','Agustus','September','Oktober','November','Desember',
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
          content:
            'Program Dukungan Manajemen dan Pelaksanaan Tugas Teknis Lainnya Kemenko PMK',
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

  // Prepare data for the table using the already filtered activities
  // The activities parameter is already filtered based on UI filters
  const tableData = activities.map((activity, index) => {
    const scheduledDate = activity.tanggal_pelaksanaan
      ? new Date(activity.tanggal_pelaksanaan).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '-';

    // Calculate realisasi value by looking up in the result data
    let realisasiValue = 0;
    if (resultData && resultData.finalData) {
      // Look for matching allocation codes in the processed data
      for (const allocation of activity.allocations) {
        const matchingRow = resultData.finalData.find((row: any[]) => row[0] === allocation.kode);
        if (matchingRow && matchingRow[6]) {
          // Realisasi is typically in the 6th column (index 6)
          realisasiValue += Number(matchingRow[6]) || 0;
        }
      }
    }

    // For Komponen Kegiatan, set default value to "PL: Rapat"
    const komponenKegiatan = 'PL: Rapat';

    // Format current date as DD/MM/YYYY
    const currentDate = new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // Using default values similar to rkbPdfGenerator
    const capaian =
      activity.deskripsi ||
      'Koordinasi dan pelaksanaan kegiatan berjalan sesuai rencana, menunggu tindak lanjut.';
    const pendingIssue =
      'Menunggu konfirmasi dan tindak lanjut dari pihak terkait untuk penyelesaian kegiatan.';
    const rencanaTindakLanjut = activity.rencana_tindak_lanjut || '-';

    return [
      (index + 1).toString(), // No
      komponenKegiatan, // Komponen Kegiatan
      activity.nama, // Judul Kegiatan
      '1.4', // RB
      activity.penanggung_jawab || '-', // PN/PP/KP (Penanggung Jawab)
      activity.kl_unit_terkait || '-', // K/L/Unit Terkait
      scheduledDate, // Tanggal Pelaksanaan
      `Rp ${formatCurrency(realisasiValue)}`, // Realisasi Anggaran
      capaian, // Capaian
      pendingIssue, // Pending Issue
      rencanaTindakLanjut, // Rencana Tindak Lanjut
    ];
  });

  // Calculate column widths similar to rkbPdfGenerator
  const colWidthsTopTable = [
    25,
    availableWidth - 25 - 80 - 60,
    80,
    60,
  ];
  const totalWidthTopTable = colWidthsTopTable.reduce((sum, w) => sum + w, 0);

  // Column widths for the main table - adding 11th column for Rencana Tindak Lanjut
  const colWidthsBottomTable = [
    12, // No.
    25, // Komponen Kegiatan
    26, // Judul Kegiatan
    10, // RB
    20, // PN/PP/KP
    28, // K/L/Unit Terkait
    25, // Tanggal Pelaksanaan
    25, // Realisasi Anggaran
    20, // Capaian
    25, // Pending Issue
    25, // Rencana Tindak Lanjut
  ];

  const totalWidthBottomTable = colWidthsBottomTable.reduce((sum, w) => sum + w, 0);
  const difference = totalWidthTopTable - totalWidthBottomTable;
  if (difference !== 0) {
    colWidthsBottomTable[2] += difference; // adjust Judul Kegiatan to maintain total width
  }

  // Use autoTable to create the table
  autoTable(doc, {
    head: [
      [
        'No.',
        'Komponen Kegiatan',
        'Judul Kegiatan',
        'RB', 
        'PN/PP/KP',
        'K/L/Unit Terkait',
        'Tanggal Pelaksanaan',
        'Realisasi Anggaran',
        'Capaian',
        'Pending Issue',
        'Rencana Tindak Lanjut',
      ],
    ],
    body: tableData,
    startY: tableStartY,
    styles: {
      fontSize: 9,
      cellPadding: 2,
      valign: 'top',
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [0, 0, 0], // Black background
      textColor: [255, 255, 255], // White text
      fontSize: 10,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: colWidthsBottomTable[0] }, // No.
      1: { cellWidth: colWidthsBottomTable[1] }, // Komponen Kegiatan
      2: { cellWidth: colWidthsBottomTable[2] }, // Judul Kegiatan
      3: { cellWidth: colWidthsBottomTable[3] }, // RB
      4: { cellWidth: colWidthsBottomTable[4] }, // PN/PP/KP
      5: { cellWidth: colWidthsBottomTable[5] }, // K/L/Unit Terkait
      6: { cellWidth: colWidthsBottomTable[6] }, // Tanggal Pelaksanaan
      7: { cellWidth: colWidthsBottomTable[7] }, // Realisasi Anggaran
      8: { cellWidth: colWidthsBottomTable[8] }, // Capaian
      9: { cellWidth: colWidthsBottomTable[9] }, // Pending Issue
      10: { cellWidth: colWidthsBottomTable[10] }, // Rencana Tindak Lanjut
    },
    margin: { left: marginLeft, right: marginRight },
    theme: 'grid',
    didDrawPage: function (data) {
      // Add page numbers
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(9);
      doc.text(
        `Halaman ${data.pageNumber} dari ${pageCount}`,
        pageWidth - 40,
        pageHeight - 10
      );
    },
  });

  // Return as blob
  return doc.output('blob');
};

/**
 * Formats currency in Indonesian format
 */
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
