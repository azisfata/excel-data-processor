import { Activity } from '../types';
import { getActivities } from './supabaseService';

export interface ActivityQueryResult {
  activities: Activity[];
  summary: string;
  totalCount: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Mendapatkan kegiatan untuk hari ini
 */
export async function getTodayActivities(userId: string): Promise<ActivityQueryResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return getActivitiesByDateRange(userId, today, tomorrow, 'hari ini');
}

/**
 * Mendapatkan kegiatan untuk besok
 */
export async function getTomorrowActivities(userId: string): Promise<ActivityQueryResult> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  
  return getActivitiesByDateRange(userId, tomorrow, dayAfterTomorrow, 'besok');
}

/**
 * Mendapatkan kegiatan untuk minggu ini
 */
export async function getThisWeekActivities(userId: string): Promise<ActivityQueryResult> {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Minggu, 1 = Senin, etc.
  
  // Start of week (Senin)
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  startOfWeek.setHours(0, 0, 0, 0);
  
  // End of week (Minggu)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  return getActivitiesByDateRange(userId, startOfWeek, endOfWeek, 'minggu ini');
}

/**
 * Mendapatkan kegiatan untuk minggu depan
 */
export async function getNextWeekActivities(userId: string): Promise<ActivityQueryResult> {
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  // Start of next week (Senin depan)
  const startOfNextWeek = new Date(today);
  startOfNextWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + 7);
  startOfNextWeek.setHours(0, 0, 0, 0);
  
  // End of next week (Minggu depan)
  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
  endOfNextWeek.setHours(23, 59, 59, 999);
  
  return getActivitiesByDateRange(userId, startOfNextWeek, endOfNextWeek, 'minggu depan');
}

/**
 * Mendapatkan kegiatan untuk bulan ini
 */
export async function getThisMonthActivities(userId: string): Promise<ActivityQueryResult> {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);
  
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);
  
  return getActivitiesByDateRange(userId, startOfMonth, endOfMonth, 'bulan ini');
}

/**
 * Mendapatkan kegiatan untuk bulan depan
 */
export async function getNextMonthActivities(userId: string): Promise<ActivityQueryResult> {
  const today = new Date();
  const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  startOfNextMonth.setHours(0, 0, 0, 0);
  
  const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  endOfNextMonth.setHours(23, 59, 59, 999);
  
  return getActivitiesByDateRange(userId, startOfNextMonth, endOfNextMonth, 'bulan depan');
}

/**
 * Mendapatkan kegiatan overdue (terlambat)
 */
export async function getOverdueActivities(userId: string): Promise<ActivityQueryResult> {
  const allActivities = await getActivities(userId);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  const overdueActivities = allActivities.filter(activity => {
    if (!activity.tanggal_pelaksanaan) return false;
    
    const activityDate = new Date(activity.tanggal_pelaksanaan);
    return activityDate < today && activity.status !== 'Terbayar' && activity.status !== 'Selesai';
  });
  
  const summary = overdueActivities.length > 0 
    ? `Ditemukan ${overdueActivities.length} kegiatan yang terlambat atau belum selesai.`
    : 'Tidak ada kegiatan yang terlambat.';
  
  return {
    activities: overdueActivities,
    summary,
    totalCount: overdueActivities.length
  };
}

/**
 * Mendapatkan kegiatan berdasarkan status
 */
export async function getActivitiesByStatus(userId: string, status: string): Promise<ActivityQueryResult> {
  const allActivities = await getActivities(userId);
  const filteredActivities = allActivities.filter(activity => 
    activity.status?.toLowerCase() === status.toLowerCase()
  );
  
  const summary = filteredActivities.length > 0
    ? `Ditemukan ${filteredActivities.length} kegiatan dengan status "${status}".`
    : `Tidak ada kegiatan dengan status "${status}".`;
  
  return {
    activities: filteredActivities,
    summary,
    totalCount: filteredActivities.length
  };
}

/**
 * Mendapatkan kegiatan berdasarkan rentang tanggal
 */
async function getActivitiesByDateRange(
  userId: string, 
  startDate: Date, 
  endDate: Date, 
  periodName: string
): Promise<ActivityQueryResult> {
  const allActivities = await getActivities(userId);
  
  const filteredActivities = allActivities.filter(activity => {
    if (!activity.tanggal_pelaksanaan) return false;
    
    const activityDate = new Date(activity.tanggal_pelaksanaan);
    return activityDate >= startDate && activityDate <= endDate;
  });
  
  // Sort by date
  filteredActivities.sort((a, b) => {
    const dateA = new Date(a.tanggal_pelaksanaan || '');
    const dateB = new Date(b.tanggal_pelaksanaan || '');
    return dateA.getTime() - dateB.getTime();
  });
  
  const summary = filteredActivities.length > 0
    ? `Ditemukan ${filteredActivities.length} kegiatan untuk ${periodName}.`
    : `Tidak ada kegiatan untuk ${periodName}.`;
  
  return {
    activities: filteredActivities,
    summary,
    totalCount: filteredActivities.length
  };
}

/**
 * Mencari kegiatan berdasarkan kata kunci
 */
export async function searchActivities(userId: string, keyword: string): Promise<ActivityQueryResult> {
  const allActivities = await getActivities(userId);
  const lowerKeyword = keyword.toLowerCase();
  
  const filteredActivities = allActivities.filter(activity => 
    activity.nama.toLowerCase().includes(lowerKeyword) ||
    activity.tujuan_kegiatan?.toLowerCase().includes(lowerKeyword) ||
    activity.penanggung_jawab?.toLowerCase().includes(lowerKeyword) ||
    activity.kl_unit_terkait?.toLowerCase().includes(lowerKeyword) ||
    activity.capaian?.toLowerCase().includes(lowerKeyword) ||
    activity.pending_issue?.toLowerCase().includes(lowerKeyword) ||
    activity.rencana_tindak_lanjut?.toLowerCase().includes(lowerKeyword)
  );
  
  const summary = filteredActivities.length > 0
    ? `Ditemukan ${filteredActivities.length} kegiatan yang mengandung kata kunci "${keyword}".`
    : `Tidak ada kegiatan yang mengandung kata kunci "${keyword}".`;
  
  return {
    activities: filteredActivities,
    summary,
    totalCount: filteredActivities.length
  };
}

/**
 * Format activity data untuk AI context
 */
export function formatActivitiesForAI(activities: Activity[]): string {
  if (activities.length === 0) {
    return 'Tidak ada kegiatan yang ditemukan.';
  }
  
  return activities.map((activity, index) => {
    const date = activity.tanggal_pelaksanaan 
      ? new Date(activity.tanggal_pelaksanaan).toLocaleDateString('id-ID', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : 'Tanggal tidak ditentukan';
    
    const allocations = activity.allocations.length > 0
      ? `\n  Alokasi Anggaran:\n${activity.allocations.map(alloc => 
          `    - ${alloc.kode}: ${alloc.jumlah.toLocaleString('id-ID')} (${alloc.uraian})`
        ).join('\n')}`
      : '';
    
    return `${index + 1}. **${activity.nama}**
    - Status: ${activity.status || 'Tidak ditentukan'}
    - Tanggal: ${date}
    - Tujuan: ${activity.tujuan_kegiatan || 'Tidak ditentukan'}
    - Penanggung Jawab: ${activity.penanggung_jawab || 'Tidak ditentukan'}
    - Unit Terkait: ${activity.kl_unit_terkait || 'Tidak ditentukan'}
    - Capaian: ${activity.capaian || 'Belum ada capaian'}
    - Pending Issues: ${activity.pending_issue || 'Tidak ada'}${allocations}`;
  }).join('\n\n');
}

/**
 * Mendapatkan ringkasan statistik kegiatan
 */
export async function getActivityStatistics(userId: string): Promise<string> {
  const allActivities = await getActivities(userId);
  const today = new Date();
  
  const stats = {
    total: allActivities.length,
    rencana: allActivities.filter(a => a.status === 'Rencana').length,
    komitmen: allActivities.filter(a => a.status === 'Komitmen').length,
    outstanding: allActivities.filter(a => a.status === 'Outstanding').length,
    terbayar: allActivities.filter(a => a.status === 'Terbayar').length,
    thisWeek: 0,
    nextWeek: 0,
    overdue: 0
  };
  
  // Hitung kegiatan minggu ini
  const dayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  
  stats.thisWeek = allActivities.filter(activity => {
    if (!activity.tanggal_pelaksanaan) return false;
    const activityDate = new Date(activity.tanggal_pelaksanaan);
    return activityDate >= startOfWeek && activityDate <= endOfWeek;
  }).length;
  
  // Hitung kegiatan minggu depan
  const startOfNextWeek = new Date(startOfWeek);
  startOfNextWeek.setDate(startOfWeek.getDate() + 7);
  
  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
  endOfNextWeek.setHours(23, 59, 59, 999);
  
  stats.nextWeek = allActivities.filter(activity => {
    if (!activity.tanggal_pelaksanaan) return false;
    const activityDate = new Date(activity.tanggal_pelaksanaan);
    return activityDate >= startOfNextWeek && activityDate <= endOfNextWeek;
  }).length;
  
  // Hitung kegiatan overdue
  stats.overdue = allActivities.filter(activity => {
    if (!activity.tanggal_pelaksanaan) return false;
    const activityDate = new Date(activity.tanggal_pelaksanaan);
    return activityDate < today && activity.status !== 'Terbayar' && activity.status !== 'Selesai';
  }).length;
  
  return `**Statistik Kegiatan:**
- Total Kegiatan: ${stats.total}
- Status Rencana: ${stats.rencana}
- Status Komitmen: ${stats.komitmen}
- Status Outstanding: ${stats.outstanding}
- Status Terbayar: ${stats.terbayar}
- Kegiatan Minggu Ini: ${stats.thisWeek}
- Kegiatan Minggu Depan: ${stats.nextWeek}
- Kegiatan Terlambat: ${stats.overdue}`;
}