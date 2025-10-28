import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Activity, ProcessingResult } from '../../types';

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

  // Add header
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('LKBB', pageWidth / 2, 20, { align: 'center' });

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

  // Prepare data for the table using the already filtered activities
  // The activities parameter is already filtered based on UI filters
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

    // Format current date as DD/MM/YYYY
    const currentDate = new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    return [
      (index + 1).toString(), // No
      komponenKegiatan, // Komponen Kegiatan
      activity.nama, // Judul Kegiatan
      currentDate, // RB (Changed to show current date)
      activity.penanggung_jawab || '-', // PN/PP/KP (Penanggung Jawab)
      activity.kl_unit_terkait || '-', // K/L/Unit Terkait
      scheduledDate, // Tanggal Pelaksanaan
      `Rp ${formatCurrency(realisasiValue)}`, // Realisasi Anggaran
      activity.capaian || '-', // Capaian
      activity.pending_issue || '-', // Pending Issue
      activity.rencana_tindak_lanjut || '-', // Rencana Tindak Lanjut
    ];
  });

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
    startY: 45,
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [59, 130, 246], // Tailwind blue-500
      textColor: [255, 255, 255],
      fontSize: 11,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [241, 245, 249], // Light gray for alternate rows
    },
    columnStyles: {
      0: { cellWidth: 12 }, // No.
      1: { cellWidth: 25 }, // Komponen Kegiatan
      2: { cellWidth: 40 }, // Judul Kegiatan
      3: { cellWidth: 25 }, // Tanggal (Changed from RB)
      4: { cellWidth: 25 }, // PN/PP/KP
      5: { cellWidth: 30 }, // K/L/Unit Terkait
      6: { cellWidth: 25 }, // Tanggal Pelaksanaan
      7: { cellWidth: 25 }, // Realisasi Anggaran
      8: { cellWidth: 20 }, // Capaian
      9: { cellWidth: 25 }, // Pending Issue
      10: { cellWidth: 25 }, // Rencana Tindak Lanjut
    },
    margin: { left: 15, right: 15 },
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
