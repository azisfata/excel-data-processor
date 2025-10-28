import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Activity, ProcessingResult } from '../../types';

/**
 * Generates an RKB (Rencana Kegiatan Bulanan) PDF with RKB-specific format
 * This function creates a simplified version focusing on planning aspects
 */

export const generateRkbDocumentPdf = async (
  activities: Activity[],
  selectedYear: number | 'all',
  selectedMonth: number | 'all' | 'no-date',
  selectedStatus: Set<string>,
  resultData?: ProcessingResult
): Promise<Blob> => {
  const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation for RKB
  const pageWidth = doc.internal.pageSize.getWidth();

  // Add header
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('RENCANA KEGIATAN BULANAN (RKB)', pageWidth / 2, 20, { align: 'center' });

  // Add filter information
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  doc.text(`Tahun: ${selectedYear === 'all' ? 'Semua Tahun' : selectedYear}`, 15, 30);

  if (selectedMonth === 'no-date') {
    doc.text('Bulan: Tanpa Tanggal', 15, 35);
  } else if (selectedMonth === 'all') {
    doc.text('Bulan: Semua Bulan', 15, 35);
  } else {
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
    doc.text(`Bulan: ${monthNames[selectedMonth]}`, 15, 35);
  }

  // Add status filter with proper formatting
  const statusArray = Array.from(selectedStatus);
  const statusLabels: Record<string, string> = {
    all: 'Semua',
    rencana: 'Rencana',
    komitmen: 'Komitmen',
    outstanding: 'Outstanding',
    terbayar: 'Terbayar',
  };
  const statusText =
    statusArray.length === 1 && statusArray[0] === 'all'
      ? 'Semua Status'
      : statusArray.map(status => statusLabels[status.toLowerCase()] || status).join(', ');
  doc.text(`Status: ${statusText}`, 15, 40);

  // Prepare data for the RKB table with the specified columns:
  // No., Komponen Kegiatan, Judul Kegiatan, K/L/Unit Terkait, Tujuan, RB, PN/PP/KP, Tanggal Pelaksanaan, Rencana Anggaran (Rp), PIC
  const tableData = activities.map((activity, index) => {
    const scheduledDate = activity.tanggal_pelaksanaan
      ? new Date(activity.tanggal_pelaksanaan).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '-';

    const totalAlokasi = activity.allocations.reduce((sum, alloc) => sum + (alloc.jumlah || 0), 0);

    // For Komponen Kegiatan, set default value to "PL: Rapat"
    const komponenKegiatan = 'PL: Rapat';

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

    return [
      (index + 1).toString(), // No
      komponenKegiatan, // Komponen Kegiatan
      activity.nama, // Judul Kegiatan
      activity.kl_unit_terkait || '-', // K/L/Unit Terkait
      activity.tujuan || '-', // Tujuan
      '1.4', // RB (Fixed value as requested)
      activity.penanggung_jawab || '-', // PN/PP/KP
      scheduledDate, // Tanggal Pelaksanaan
      `Rp ${formatCurrency(totalAlokasi)}`, // Rencana Anggaran (Rp)
      activity.pic || '-', // PIC (assuming this is a field in the activity)
    ];
  });

  // Use autoTable to create the RKB table
  autoTable(doc, {
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
        'Rencana Anggaran (Rp)',
        'PIC',
      ],
    ],
    body: tableData,
    startY: 45,
    styles: {
      fontSize: 9,
      cellPadding: 2,
      lineWidth: 0.1, // Border thickness
      lineColor: [0, 0, 0], // Black border color
    },
    headStyles: {
      fillColor: [0, 0, 0], // Black background
      textColor: [255, 255, 255], // White text
      fontSize: 10,
      fontStyle: 'bold',
      lineWidth: 0.1, // Border thickness
      lineColor: [0, 0, 0], // Black border color
    },
    alternateRowStyles: {
      fillColor: [241, 245, 249], // Light gray for alternate rows
      lineWidth: 0.1, // Border thickness
      lineColor: [0, 0, 0], // Black border color
    },
    columnStyles: {
      0: { cellWidth: 12 }, // No.
      1: { cellWidth: 25 }, // Komponen Kegiatan
      2: { cellWidth: 35 }, // Judul Kegiatan
      3: { cellWidth: 25 }, // K/L/Unit Terkait
      4: { cellWidth: 25 }, // Tujuan
      5: { cellWidth: 15 }, // RB
      6: { cellWidth: 25 }, // PN/PP/KP
      7: { cellWidth: 25 }, // Tanggal Pelaksanaan
      8: { cellWidth: 30 }, // Rencana Anggaran (Rp)
      9: { cellWidth: 25 }, // PIC
    },
    margin: { left: 10, right: 10 },
    theme: 'grid', // Add grid theme for borders
    didDrawPage: function (data) {
      // Add page numbers
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(10);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        data.settings.margin.left,
        doc.internal.pageSize.height - 10
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
  }).format(amount);
};