import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Activity } from '../../types';

/**
 * Generates an RKB (Rencana Kegiatan Bulanan) PDF based on pre-filtered activities
 * The activities passed to this function are already filtered according to user selections
 * This function only formats the data for PDF output
 */
export const generateRkbPdf = async (
  activities: Activity[],
  selectedYear: number | 'all',
  selectedMonth: number | 'all' | 'no-date',
  selectedStatus: Set<string>
): Promise<Blob> => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Add header
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Rencana Kegiatan Bulanan (RKB)', pageWidth / 2, 20, { align: 'center' });
  
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
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    doc.text(`Bulan: ${monthNames[selectedMonth]}`, 15, 35);
  }
  
  // Add status filter with proper formatting
  const statusArray = Array.from(selectedStatus);
  const statusLabels: Record<string, string> = {
    'all': 'Semua',
    'rencana': 'Rencana',
    'komitmen': 'Komitmen', 
    'outstanding': 'Outstanding',
    'terbayar': 'Terbayar'
  };
  const statusText = statusArray.length === 1 && statusArray[0] === 'all' 
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
          year: 'numeric'
        })
      : '-';
    
    const totalAlokasi = activity.allocations.reduce((sum, alloc) => sum + (alloc.jumlah || 0), 0);
    
    // Format allocations for display
    let allocationText = '';
    if (activity.allocations.length === 0) {
      allocationText = 'Tidak ada alokasi';
    } else if (activity.allocations.length === 1) {
      const allocation = activity.allocations[0];
      allocationText = `${allocation.kode}: Rp ${formatCurrency(allocation.jumlah)}`;
    } else {
      const firstAllocation = activity.allocations[0];
      allocationText = `${firstAllocation.kode}: Rp ${formatCurrency(firstAllocation.jumlah)}`;
      
      if (activity.allocations.length > 2) {
        allocationText += `\n+${activity.allocations.length - 1} alokasi lainnya`;
      } else {
        const secondAllocation = activity.allocations[1];
        allocationText += `\n${secondAllocation.kode}: Rp ${formatCurrency(secondAllocation.jumlah)}`;
      }
    }
    
    return [
      (index + 1).toString(),
      activity.nama,
      scheduledDate,
      activity.status || '-',
      `Rp ${formatCurrency(totalAlokasi)}`,
      allocationText
    ];
  });
  
  // Use autoTable to create the table
  autoTable(doc, {
    head: [['No', 'Nama Kegiatan', 'Tanggal', 'Status', 'Total Alokasi', 'Alokasi']],
    body: tableData,
    startY: 45,
    styles: {
      fontSize: 10,
      cellPadding: 3
    },
    headStyles: {
      fillColor: [59, 130, 246], // Tailwind blue-500
      textColor: [255, 255, 255],
      fontSize: 11,
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [241, 245, 249] // Light gray for alternate rows
    },
    columnStyles: {
      0: { cellWidth: 15 }, // No
      1: { cellWidth: 50 }, // Nama Kegiatan
      2: { cellWidth: 30 }, // Tanggal
      3: { cellWidth: 30 }, // Status
      4: { cellWidth: 30 }, // Total Alokasi
      5: { cellWidth: 70 }  // Alokasi
    },
    margin: { left: 15, right: 15 },
    didDrawPage: function(data) {
      // Add page numbers
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(10);
      doc.text(`Page ${data.pageNumber} of ${pageCount}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
    }
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
    maximumFractionDigits: 0 
  }).format(amount);
};

export default generateRkbPdf;