import { getAllProcessedResults } from './supabaseService';
import { ProcessingResult } from '../types';

export interface MonthlyReport {
  id: string;
  fileName: string;
  reportDate: string;
  reportType: string;
  year: number;
  month: number;
  totals: number[];
  result: ProcessingResult;
}

export interface AccountLevel7Data {
  kode: string;
  kodeLengkap?: string;
  uraian: string;
  pagu: number;
  realisasi: number;
  persentase: number;
  sisa: number;
}

export interface MonthlyTrendData {
  month: string;
  year: number;
  totalPagu: number;
  totalRealisasi: number;
  persentase: number;
  reportType: string;
}

export interface AccountTrendData {
  kode: string;
  uraian: string;
  data: Array<{
    month: string;
    year: number;
    pagu: number;
    realisasi: number;
    persentase: number;
  }>;
}

/**
 * Mengambil data laporan bulanan dari processed_results
 * dan mengelompokkannya per bulan (ambil yang terbaru per bulan)
 */
export async function getMonthlyReports(userId: string): Promise<MonthlyReport[]> {
  const allResults = await getAllProcessedResults(userId);
  
  // Filter hanya yang memiliki report_date dan group by year-month
  const reportsByMonth = new Map<string, MonthlyReport>();
  
  allResults.forEach(item => {
    if (!item.reportDate) return;
    
    const reportDate = new Date(item.reportDate);
    const year = reportDate.getFullYear();
    const month = reportDate.getMonth() + 1; // 1-12
    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
    
    const existingReport = reportsByMonth.get(monthKey);
    
    // Jika belum ada atau report date lebih baru, gunakan yang ini
    if (!existingReport || new Date(item.reportDate) > new Date(existingReport.reportDate)) {
      reportsByMonth.set(monthKey, {
        id: item.id,
        fileName: item.fileName,
        reportDate: item.reportDate,
        reportType: item.reportType || 'Tidak diketahui',
        year,
        month,
        totals: item.result.totals,
        result: item.result
      });
    }
  });
  
  // Sort by date ascending
  return Array.from(reportsByMonth.values()).sort((a, b) => {
    const dateA = new Date(a.reportDate);
    const dateB = new Date(b.reportDate);
    return dateA.getTime() - dateB.getTime();
  });
}

/**
 * Mengekstrak data level 7 dari processing result
 */
export function extractLevel7Data(result: ProcessingResult): AccountLevel7Data[] {
  if (!result.finalData) return [];
  
  return result.finalData
    .filter(row => {
      const kodeStr = typeof row[0] === 'string' ? row[0].trim() : '';
      if (!kodeStr) return false;
      
      const segments = kodeStr.split('.').map(s => s.trim()).filter(Boolean);
      return segments.length === 8; // Level 7 = 8 segments (WA.6336.EBA.963.126.0B.521211.002523)
    })
    .map(row => {
      const kode = String(row[0] || '').trim();
      const uraian = String(row[1] || '').trim();
      const pagu = Number(row[2]) || 0;
      const realisasi = Number(row[6]) || 0;
      const persentase = pagu > 0 ? (realisasi / pagu) * 100 : 0;
      const sisa = pagu - realisasi;
      
      // Extract level 7 code (segment terakhir)
      const segments = kode.split('.').map(s => s.trim()).filter(Boolean);
      const level7Code = segments[segments.length - 1] || ''; // Segment terakhir adalah level 7
      
      return {
        kode: level7Code, // Gunakan hanya level 7 code untuk ranking
        kodeLengkap: kode, // Simpan kode lengkap untuk referensi
        uraian,
        pagu,
        realisasi,
        persentase,
        sisa
      };
    });
}

/**
 * Mengambil data level 7 untuk bulan tertentu
 */
export function getLevel7DataForMonth(monthlyReport: MonthlyReport): AccountLevel7Data[] {
  return extractLevel7Data(monthlyReport.result);
}

/**
 * Membuat data tren bulanan dari semua laporan
 */
export function createMonthlyTrendData(monthlyReports: MonthlyReport[]): MonthlyTrendData[] {
  return monthlyReports.map(report => {
    const totalPagu = report.totals[0] || 0;
    const totalRealisasi = report.totals[4] || 0; // Column index 4 = s.d. periode
    const persentase = totalPagu > 0 ? (totalRealisasi / totalPagu) * 100 : 0;
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const monthLabel = monthNames[report.month - 1];
    
    return {
      month: monthLabel,
      year: report.year,
      totalPagu,
      totalRealisasi,
      persentase,
      reportType: report.reportType
    };
  });
}

/**
 * Membuat data tren untuk akun level 7 tertentu
 */
export function createAccountTrendData(monthlyReports: MonthlyReport[], selectedAccount: string): AccountTrendData | null {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  
  const data = monthlyReports.map(report => {
    const level7Data = getLevel7DataForMonth(report);
    const account = level7Data.find(item => item.kode === selectedAccount);
    
    const monthLabel = monthNames[report.month - 1];
    
    return {
      month: monthLabel,
      year: report.year,
      pagu: account?.pagu || 0,
      realisasi: account?.realisasi || 0,
      persentase: account?.persentase || 0
    };
  });
  
  if (data.every(item => item.realisasi === 0)) {
    return null; // Tidak ada data untuk akun ini
  }
  
  // Cari uraian dari data pertama yang ada
  let uraian = selectedAccount;
  for (const report of monthlyReports) {
    const level7Data = getLevel7DataForMonth(report);
    const account = level7Data.find(item => item.kode === selectedAccount);
    if (account) {
      uraian = account.uraian;
      break;
    }
  }
  
  return {
    kode: selectedAccount,
    uraian,
    data
  };
}

/**
 * Mendapatkan daftar semua akun level 7 yang ada di semua laporan
 */
export function getAllLevel7Accounts(monthlyReports: MonthlyReport[]): Array<{ kode: string; uraian: string }> {
  const accountsSet = new Map<string, string>();
  
  monthlyReports.forEach(report => {
    const level7Data = getLevel7DataForMonth(report);
    level7Data.forEach(item => {
      if (item.realisasi > 0) { // Hanya akun yang ada realisasinya
        accountsSet.set(item.kode, item.uraian);
      }
    });
  });
  
  return Array.from(accountsSet.entries()).map(([kode, uraian]) => ({ kode, uraian }));
}

/**
 * Menghitung data komposisi belanja bulanan untuk stacked bar chart
 */
export function createMonthlyCompositionData(monthlyReports: MonthlyReport[]) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  
  return monthlyReports.map(report => {
    const level7Data = getLevel7DataForMonth(report);
    const monthLabel = monthNames[report.month - 1];
    
    // Group by uraian dan hitung total realisasi
    const composition = new Map<string, number>();
    level7Data.forEach(item => {
      if (item.realisasi > 0) {
        const existing = composition.get(item.uraian) || 0;
        composition.set(item.uraian, existing + item.realisasi);
      }
    });
    
    // Sort by value descending dan ambil top 10
    const sortedComposition = Array.from(composition.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    return {
      month: monthLabel,
      year: report.year,
      composition: sortedComposition,
      totalRealisasi: report.totals[4] || 0
    };
  });
}

/**
 * Menghitung kumulatif realisasi untuk analisis target
 */
export function createCumulativeData(monthlyReports: MonthlyReport[]) {
  let cumulative = 0;
  const totalPagu = monthlyReports[0]?.totals[0] || 0; // Ambil pagu dari bulan pertama
  
  return monthlyReports.map((report, index) => {
    cumulative += report.totals[4] || 0; // Tambah realisasi bulan ini
    
    // Hitung target kumulatif (seharusnya sudah terserap sesuai waktu)
    const monthProgress = (index + 1) / 12; // Asumsi 12 bulan
    const targetCumulative = totalPagu * monthProgress;
    
    return {
      month: report.month,
      year: report.year,
      cumulative,
      targetCumulative,
      persentaseKumulatif: totalPagu > 0 ? (cumulative / totalPagu) * 100 : 0,
      persentaseTarget: totalPagu > 0 ? (targetCumulative / totalPagu) * 100 : 0
    };
  });
}
