import {
  ActivityQueryResult,
  formatActivitiesForAI,
  getActivityStatistics,
} from '@/services/activityQueryService';

export interface ActivityContext {
  todayActivities?: ActivityQueryResult;
  tomorrowActivities?: ActivityQueryResult;
  thisWeekActivities?: ActivityQueryResult;
  nextWeekActivities?: ActivityQueryResult;
  thisMonthActivities?: ActivityQueryResult;
  nextMonthActivities?: ActivityQueryResult;
  overdueActivities?: ActivityQueryResult;
  statistics?: string;
}

/**
 * Membangun context data kegiatan untuk AI
 */
export async function buildActivityContext(userId: string): Promise<string> {
  try {
    const [todayActivities, thisWeekActivities, nextWeekActivities, overdueActivities, statistics] =
      await Promise.all([
        import('@/services/activityQueryService').then(m => m.getTodayActivities(userId)),
        import('@/services/activityQueryService').then(m => m.getThisWeekActivities(userId)),
        import('@/services/activityQueryService').then(m => m.getNextWeekActivities(userId)),
        import('@/services/activityQueryService').then(m => m.getOverdueActivities(userId)),
        import('@/services/activityQueryService').then(m => m.getActivityStatistics(userId)),
      ]);

    let context = `=== DATA KEGIATAN TERKINI ===\n\n`;

    context += `${statistics}\n\n`;

    if (todayActivities.totalCount > 0) {
      context += `**KEGIATAN HARI INI (${todayActivities.totalCount} kegiatan):**\n`;
      context += formatActivitiesForAI(todayActivities.activities) + '\n\n';
    }

    if (thisWeekActivities.totalCount > 0) {
      context += `**KEGIATAN MINGGU INI (${thisWeekActivities.totalCount} kegiatan):**\n`;
      context += formatActivitiesForAI(thisWeekActivities.activities) + '\n\n';
    }

    if (nextWeekActivities.totalCount > 0) {
      context += `**KEGIATAN MINGGU DEPAN (${nextWeekActivities.totalCount} kegiatan):**\n`;
      context += formatActivitiesForAI(nextWeekActivities.activities) + '\n\n';
    }

    if (overdueActivities.totalCount > 0) {
      context += `**KEGIATAN TERLAMBAT (${overdueActivities.totalCount} kegiatan):**\n`;
      context += formatActivitiesForAI(overdueActivities.activities) + '\n\n';
    }

    if (
      todayActivities.totalCount === 0 &&
      thisWeekActivities.totalCount === 0 &&
      nextWeekActivities.totalCount === 0 &&
      overdueActivities.totalCount === 0
    ) {
      context += 'Tidak ada kegiatan yang tercatat saat ini.\n';
    }

    context += `=== AKHIR DATA KEGIATAN ===\n\n`;

    return context;
  } catch (error) {
    console.error('Error building activity context:', error);
    return 'Terjadi kesalahan saat mengambil data kegiatan.\n\n';
  }
}

/**
 * Template prompt untuk query kegiatan
 */
export const ACTIVITY_QUERY_TEMPLATES = {
  // Query berdasarkan waktu
  TODAY: 'apa saja kegiatan hari ini',
  TOMORROW: 'apa saja kegiatan besok',
  THIS_WEEK: 'apa saja kegiatan minggu ini',
  NEXT_WEEK: 'apa saja kegiatan minggu depan',
  THIS_MONTH: 'apa saja kegiatan bulan ini',
  NEXT_MONTH: 'apa saja kegiatan bulan depan',

  // Query berdasarkan status
  OVERDUE: 'kegiatan terlambat',
  PENDING: 'kegiatan pending',
  COMPLETED: 'kegiatan selesai',

  // Query statistik
  STATISTICS: 'statistik kegiatan',
  SUMMARY: 'ringkasan kegiatan',

  // Query pencarian
  SEARCH: 'cari kegiatan',
  FIND: 'temukan kegiatan',

  // Query umum
  AGENDA: 'agenda',
  JADWAL: 'jadwal',
  KEGIATAN: 'kegiatan',
};

/**
 * Mendeteksi jenis query kegiatan dari input user
 */
export function detectActivityQueryType(userInput: string): string | null {
  const input = userInput.toLowerCase().trim();

  // Check untuk query waktu
  if (input.includes('hari ini') || input.includes('today')) {
    return 'TODAY';
  }
  if (input.includes('besok') || input.includes('tomorrow')) {
    return 'TOMORROW';
  }
  if (input.includes('minggu ini') || input.includes('this week')) {
    return 'THIS_WEEK';
  }
  if (input.includes('minggu depan') || input.includes('next week')) {
    return 'NEXT_WEEK';
  }
  if (input.includes('bulan ini') || input.includes('this month')) {
    return 'THIS_MONTH';
  }
  if (input.includes('bulan depan') || input.includes('next month')) {
    return 'NEXT_MONTH';
  }

  // Check untuk query status
  if (input.includes('terlambat') || input.includes('overdue')) {
    return 'OVERDUE';
  }
  if (input.includes('pending') || input.includes('menunggu')) {
    return 'PENDING';
  }
  if (input.includes('selesai') || input.includes('completed') || input.includes('terbayar')) {
    return 'COMPLETED';
  }

  // Check untuk query statistik
  if (input.includes('statistik') || input.includes('statistics') || input.includes('summary')) {
    return 'STATISTICS';
  }

  // Check untuk query pencarian
  if (
    input.includes('cari') ||
    input.includes('search') ||
    input.includes('temukan') ||
    input.includes('find')
  ) {
    return 'SEARCH';
  }

  // Check untuk query umum
  if (input.includes('agenda') || input.includes('jadwal') || input.includes('kegiatan')) {
    return 'GENERAL';
  }

  return null;
}

/**
 * Membuat prompt yang diperkaya dengan data kegiatan
 */
export async function createActivityEnhancedPrompt(
  basePrompt: string,
  userId: string,
  userInput: string
): Promise<string> {
  const activityContext = await buildActivityContext(userId);
  const queryType = detectActivityQueryType(userInput);

  let enhancedPrompt = basePrompt;

  // Tambahkan context kegiatan
  enhancedPrompt += '\n\n' + activityContext;

  // Tambahkan instruksi khusus berdasarkan jenis query
  if (queryType) {
    enhancedPrompt += `\n\n**INSTRUKSI KHUSUS:**\n`;

    switch (queryType) {
      case 'TODAY':
        enhancedPrompt +=
          'Fokus pada kegiatan yang dijadwalkan untuk hari ini. Berikan informasi detail termasuk waktu, lokasi (jika ada), dan prioritas.';
        break;
      case 'TOMORROW':
        enhancedPrompt +=
          'Fokus pada kegiatan yang dijadwalkan untuk besok. Berikan informasi detail untuk persiapan.';
        break;
      case 'THIS_WEEK':
        enhancedPrompt +=
          'Fokus pada kegiatan minggu ini. Kelompokkan per hari dan berikan prioritas.';
        break;
      case 'NEXT_WEEK':
        enhancedPrompt += 'Fokus pada kegiatan minggu depan. Berikan informasi untuk perencanaan.';
        break;
      case 'OVERDUE':
        enhancedPrompt +=
          'Fokus pada kegiatan yang terlambat. Berikan informasi urgensi dan saran tindakan.';
        break;
      case 'STATISTICS':
        enhancedPrompt += 'Fokus pada analisis statistik dan tren kegiatan.';
        break;
      case 'SEARCH':
        enhancedPrompt += 'Cari kegiatan berdasarkan kata kunci yang disebutkan user.';
        break;
      case 'GENERAL':
        enhancedPrompt += 'Berikan ringkasan umum kegiatan yang relevan dengan pertanyaan user.';
        break;
    }
  }

  enhancedPrompt += '\n\n**PETUNJUK JAWABAN:**\n';
  enhancedPrompt += '- Jawab dalam bahasa Indonesia yang ringkas dan jelas\n';
  enhancedPrompt += '- Gunakan data kegiatan yang disediakan di atas\n';
  enhancedPrompt +=
    '- Jika tidak ada data yang relevan, jelaskan bahwa tidak ada kegiatan yang sesuai\n';
  enhancedPrompt += '- Berikan saran atau rekomendasi jika diperlukan\n';
  enhancedPrompt +=
    '- Format jawaban dengan bullet points atau numbering untuk kemudahan membaca\n';

  return enhancedPrompt;
}

/**
 * Quick prompt templates untuk AI Chat
 */
export const QUICK_ACTIVITY_PROMPTS = [
  {
    label: 'Agenda Hari Ini',
    prompt: 'Apa saja agenda kegiatan hari ini?',
    icon: '📅',
  },
  {
    label: 'Kegiatan Minggu Ini',
    prompt: 'Tampilkan semua kegiatan untuk minggu ini',
    icon: '📋',
  },
  {
    label: 'Kegiatan Terlambat',
    prompt: 'Apakah ada kegiatan yang terlambat?',
    icon: '⚠️',
  },
  {
    label: 'Statistik Kegiatan',
    prompt: 'Berikan statistik lengkap kegiatan saya',
    icon: '📊',
  },
  {
    label: 'Prioritas Minggu Depan',
    prompt: 'Apa saja kegiatan prioritas untuk minggu depan?',
    icon: '🎯',
  },
  {
    label: 'Ringkasan Bulanan',
    prompt: 'Buat ringkasan kegiatan bulan ini',
    icon: '📝',
  },
];

/**
 * Format response untuk query kegiatan
 */
export function formatActivityResponse(queryType: string, result: ActivityQueryResult): string {
  if (result.totalCount === 0) {
    switch (queryType) {
      case 'TODAY':
        return '📅 **Tidak ada kegiatan untuk hari ini.**\n\nIni adalah kesempatan baik untuk fokus pada tugas lain atau persiapan untuk kegiatan mendatang.';
      case 'TOMORROW':
        return '📅 **Tidak ada kegiatan untuk besok.**\n\nAnda bisa menggunakan waktu ini untuk persiapan atau menyelesaikan tugas tertunda.';
      case 'THIS_WEEK':
        return '📋 **Tidak ada kegiatan untuk minggu ini.**\n\nMungkin ini saat yang tepat untuk merencanakan kegiatan baru atau fokus pada proyek lain.';
      case 'NEXT_WEEK':
        return '📋 **Tidak ada kegiatan untuk minggu depan.**\n\nIni adalah kesempatan baik untuk merencanakan kegiatan baru.';
      case 'OVERDUE':
        return '✅ **Tidak ada kegiatan yang terlambat.**\n\nBagus! Semua kegiatan berjalan sesuai jadwal.';
      default:
        return '📝 **Tidak ada kegiatan yang ditemukan.**\n\nCoba dengan kata kunci atau rentang waktu yang berbeda.';
    }
  }

  let response = `${result.summary}\n\n`;

  if (result.activities.length > 0) {
    response += '**Detail Kegiatan:**\n\n';
    response += formatActivitiesForAI(result.activities);
  }

  // Tambahkan saran atau rekomendasi
  if (queryType === 'OVERDUE' && result.totalCount > 0) {
    response += '\n\n**💡 Rekomendasi:**\n';
    response += '- Segera hubungi pihak terkait untuk konfirmasi status\n';
    response += '- Prioritaskan kegiatan dengan dampak terbesar\n';
    response += '- Perbarui jadwal jika diperlukan\n';
  }

  return response;
}
