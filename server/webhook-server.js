import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import { fetchAiResponse } from './ai-service.js';

dotenv.config();

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FONNTE_API_URL', 'FONNTE_TOKEN'];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[WhatsAppWebhook] Environment variable ${key} belum dikonfigurasi.`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const fetchUserActivities = async (userId) => {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('activities')
    .select(
      `
        id,
        nama,
        status,
        tanggal_pelaksanaan,
        tujuan_kegiatan,
        kl_unit_terkait,
        penanggung_jawab,
        capaian,
        pending_issue,
        rencana_tindak_lanjut,
        allocations (
          id,
          kode,
          uraian,
          jumlah
        )
      `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[WhatsAppWebhook] Error fetching activities:', error);
    return [];
  }

  return (data ?? []).map((activity) => ({
    id: activity.id,
    nama: activity.nama,
    status: activity.status || 'draft',
    tanggal_pelaksanaan: activity.tanggal_pelaksanaan || null,
    tujuan_kegiatan: activity.tujuan_kegiatan || null,
    kl_unit_terkait: activity.kl_unit_terkait || null,
    penanggung_jawab: activity.penanggung_jawab || null,
    capaian: activity.capaian || null,
    pending_issue: activity.pending_issue || null,
    rencana_tindak_lanjut: activity.rencana_tindak_lanjut || null,
    allocations: (activity.allocations ?? []).map((alloc) => ({
      kode: alloc.kode,
      uraian: alloc.uraian || '',
      jumlah: Number(alloc.jumlah ?? 0)
    }))
  }));
};

const formatActivitiesForAI = (activities) => {
  if (!activities.length) {
    return 'Tidak ada kegiatan yang ditemukan.';
  }

  return activities
    .map((activity, index) => {
      const date = activity.tanggal_pelaksanaan
        ? new Date(activity.tanggal_pelaksanaan).toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        : 'Tanggal tidak ditentukan';

      const allocations =
        activity.allocations?.length > 0
          ? `\n  Alokasi Anggaran:\n${activity.allocations
              .map(
                (alloc) =>
                  `    - ${alloc.kode}: ${Number(alloc.jumlah ?? 0).toLocaleString('id-ID')} (${alloc.uraian})`
              )
              .join('\n')}`
          : '';

      return `${index + 1}. **${activity.nama}**
    - Status: ${activity.status || 'Tidak ditentukan'}
    - Tanggal: ${date}
    - Tujuan: ${activity.tujuan_kegiatan || 'Tidak ditentukan'}
    - Penanggung Jawab: ${activity.penanggung_jawab || 'Tidak ditentukan'}
    - Unit Terkait: ${activity.kl_unit_terkait || 'Tidak ditentukan'}
    - Capaian: ${activity.capaian || 'Belum ada capaian'}
    - Pending Issues: ${activity.pending_issue || 'Tidak ada'}${allocations}`;
    })
    .join('\n\n');
};

const buildActivityStatistics = (activities) => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const startOfNextWeek = new Date(startOfWeek);
  startOfNextWeek.setDate(startOfWeek.getDate() + 7);
  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
  endOfNextWeek.setHours(23, 59, 59, 999);

  const stats = {
    total: activities.length,
    rencana: activities.filter((a) => a.status === 'Rencana').length,
    komitmen: activities.filter((a) => a.status === 'Komitmen').length,
    outstanding: activities.filter((a) => a.status === 'Outstanding').length,
    terbayar: activities.filter((a) => a.status === 'Terbayar').length,
    thisWeek: activities.filter((activity) => {
      if (!activity.tanggal_pelaksanaan) return false;
      const activityDate = new Date(activity.tanggal_pelaksanaan);
      return activityDate >= startOfWeek && activityDate <= endOfWeek;
    }).length,
    nextWeek: activities.filter((activity) => {
      if (!activity.tanggal_pelaksanaan) return false;
      const activityDate = new Date(activity.tanggal_pelaksanaan);
      return activityDate >= startOfNextWeek && activityDate <= endOfNextWeek;
    }).length,
    overdue: activities.filter((activity) => {
      if (!activity.tanggal_pelaksanaan) return false;
      const activityDate = new Date(activity.tanggal_pelaksanaan);
      return activityDate < today && activity.status !== 'Terbayar' && activity.status !== 'Selesai';
    }).length
  };

  return `**Statistik Kegiatan:**
- Total Kegiatan: ${stats.total}
- Status Rencana: ${stats.rencana}
- Status Komitmen: ${stats.komitmen}
- Status Outstanding: ${stats.outstanding}
- Status Terbayar: ${stats.terbayar}
- Kegiatan Minggu Ini: ${stats.thisWeek}
- Kegiatan Minggu Depan: ${stats.nextWeek}
- Kegiatan Terlambat: ${stats.overdue}`;
};

const buildRangeSummary = (activities, label) => ({
  activities,
  totalCount: activities.length,
  summary:
    activities.length > 0
      ? `Ditemukan ${activities.length} kegiatan untuk ${label}.`
      : `Tidak ada kegiatan untuk ${label}.`
});

const categorizeActivities = (activities) => {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);

  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const dayOfWeek = startOfToday.getDay();
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const startOfNextWeek = new Date(startOfWeek);
  startOfNextWeek.setDate(startOfWeek.getDate() + 7);
  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
  endOfNextWeek.setHours(23, 59, 59, 999);

  const sorted = [...activities].sort((a, b) => {
    const dateA = a.tanggal_pelaksanaan ? new Date(a.tanggal_pelaksanaan).getTime() : 0;
    const dateB = b.tanggal_pelaksanaan ? new Date(b.tanggal_pelaksanaan).getTime() : 0;
    return dateA - dateB;
  });

  const todayActivities = [];
  const thisWeekActivities = [];
  const nextWeekActivities = [];
  const overdueActivities = [];

  for (const activity of sorted) {
    if (!activity.tanggal_pelaksanaan) {
      continue;
    }
    const activityDate = new Date(activity.tanggal_pelaksanaan);

    if (activityDate >= startOfToday && activityDate < startOfTomorrow) {
      todayActivities.push(activity);
    }
    if (activityDate >= startOfWeek && activityDate <= endOfWeek) {
      thisWeekActivities.push(activity);
    }
    if (activityDate >= startOfNextWeek && activityDate <= endOfNextWeek) {
      nextWeekActivities.push(activity);
    }
    if (activityDate < endOfToday && activity.status !== 'Terbayar' && activity.status !== 'Selesai') {
      overdueActivities.push(activity);
    }
  }

  return {
    todayActivities: buildRangeSummary(todayActivities, 'hari ini'),
    thisWeekActivities: buildRangeSummary(thisWeekActivities, 'minggu ini'),
    nextWeekActivities: buildRangeSummary(nextWeekActivities, 'minggu depan'),
    overdueActivities: {
      activities: overdueActivities,
      totalCount: overdueActivities.length,
      summary:
        overdueActivities.length > 0
          ? `Ditemukan ${overdueActivities.length} kegiatan yang terlambat atau belum selesai.`
          : 'Tidak ada kegiatan yang terlambat.'
    }
  };
};

const buildActivityContext = async (userId) => {
  try {
    const activities = await fetchUserActivities(userId);
    const { todayActivities, thisWeekActivities, nextWeekActivities, overdueActivities } =
      categorizeActivities(activities);

    let context = '=== DATA KEGIATAN TERKINI ===\n\n';
    context += `${buildActivityStatistics(activities)}\n\n`;

    if (todayActivities.totalCount > 0) {
      context += `**KEGIATAN HARI INI (${todayActivities.totalCount} kegiatan):**\n`;
      context += `${formatActivitiesForAI(todayActivities.activities)}\n\n`;
    }

    if (thisWeekActivities.totalCount > 0) {
      context += `**KEGIATAN MINGGU INI (${thisWeekActivities.totalCount} kegiatan):**\n`;
      context += `${formatActivitiesForAI(thisWeekActivities.activities)}\n\n`;
    }

    if (nextWeekActivities.totalCount > 0) {
      context += `**KEGIATAN MINGGU DEPAN (${nextWeekActivities.totalCount} kegiatan):**\n`;
      context += `${formatActivitiesForAI(nextWeekActivities.activities)}\n\n`;
    }

    if (overdueActivities.totalCount > 0) {
      context += `**KEGIATAN TERLAMBAT (${overdueActivities.totalCount} kegiatan):**\n`;
      context += `${formatActivitiesForAI(overdueActivities.activities)}\n\n`;
    }

    if (
      todayActivities.totalCount === 0 &&
      thisWeekActivities.totalCount === 0 &&
      nextWeekActivities.totalCount === 0 &&
      overdueActivities.totalCount === 0
    ) {
      context += 'Tidak ada kegiatan yang tercatat saat ini.\n\n';
    }

    context += '=== AKHIR DATA KEGIATAN ===\n\n';
    return context;
  } catch (error) {
    console.error('[WhatsAppWebhook] Error building activity context:', error);
    return 'Terjadi kesalahan saat mengambil data kegiatan.\n\n';
  }
};

const detectActivityQueryType = (userInput) => {
  const input = (userInput || '').toLowerCase().trim();

  if (input.includes('hari ini') || input.includes('today')) return 'TODAY';
  if (input.includes('besok') || input.includes('tomorrow')) return 'TOMORROW';
  if (input.includes('minggu ini') || input.includes('this week')) return 'THIS_WEEK';
  if (input.includes('minggu depan') || input.includes('next week')) return 'NEXT_WEEK';
  if (input.includes('bulan ini') || input.includes('this month')) return 'THIS_MONTH';
  if (input.includes('bulan depan') || input.includes('next month')) return 'NEXT_MONTH';

  if (input.includes('terlambat') || input.includes('overdue')) return 'OVERDUE';
  if (input.includes('pending') || input.includes('menunggu')) return 'PENDING';
  if (input.includes('selesai') || input.includes('completed') || input.includes('terbayar'))
    return 'COMPLETED';

  if (input.includes('statistik') || input.includes('statistics') || input.includes('summary'))
    return 'STATISTICS';

  if (
    input.includes('cari') ||
    input.includes('search') ||
    input.includes('temukan') ||
    input.includes('find')
  ) {
    return 'SEARCH';
  }

  if (input.includes('agenda') || input.includes('jadwal') || input.includes('kegiatan')) {
    return 'GENERAL';
  }

  return null;
};

const createActivityEnhancedPrompt = async ({ basePrompt, userId, userInput, queryType }) => {
  const resolvedQueryType = queryType ?? detectActivityQueryType(userInput);
  let enhancedPrompt = `${basePrompt}\n\n${await buildActivityContext(userId)}`;

  if (resolvedQueryType) {
    enhancedPrompt += '\n\n**INSTRUKSI KHUSUS:**\n';
    switch (resolvedQueryType) {
      case 'TODAY':
        enhancedPrompt +=
          'Fokus pada kegiatan yang dijadwalkan untuk hari ini. Berikan informasi detail termasuk waktu, lokasi (jika ada), dan prioritas.';
        break;
      case 'TOMORROW':
        enhancedPrompt +=
          'Fokus pada kegiatan yang dijadwalkan untuk besok. Berikan informasi detail untuk persiapan.';
        break;
      case 'THIS_WEEK':
        enhancedPrompt += 'Fokus pada kegiatan minggu ini. Kelompokkan per hari dan berikan prioritas.';
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
      default:
        break;
    }
  }

  enhancedPrompt += '\n\n**PETUNJUK JAWABAN:**\n';
  enhancedPrompt += '- Jawab dalam bahasa Indonesia yang ringkas dan jelas\n';
  enhancedPrompt += '- Gunakan data kegiatan yang disediakan di atas\n';
  enhancedPrompt += '- Jika tidak ada data yang relevan, jelaskan bahwa tidak ada kegiatan yang sesuai\n';
  enhancedPrompt += '- Berikan saran atau rekomendasi jika diperlukan\n';
  enhancedPrompt += '- Format jawaban dengan bullet points atau numbering untuk kemudahan membaca\n';

  return enhancedPrompt;
};

class WhatsAppSessionManager {
  constructor() {
    this.sessions = new Map();
    this.maxMessages = 20;
    this.sessionTimeout = 30 * 60 * 1000;
  }

  getSession(sender) {
    return this.sessions.get(sender) || [];
  }

  addMessage(sender, role, content) {
    const history = this.getSession(sender);
    history.push({ role, content, timestamp: Date.now() });
    if (history.length > this.maxMessages) {
      history.splice(0, history.length - this.maxMessages);
    }
    this.sessions.set(sender, history);
  }

  cleanup() {
    const now = Date.now();
    for (const [sender, history] of this.sessions.entries()) {
      const last = history.at(-1);
      if (!last || now - last.timestamp > this.sessionTimeout) {
        this.sessions.delete(sender);
      }
    }
  }
}

const normalizeWhatsAppNumber = (input) => {
  if (typeof input !== 'string' && typeof input !== 'number') return '';
  const digits = String(input).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  return `62${digits}`;
};

const sessionManager = new WhatsAppSessionManager();
const app = express();

const port = Number(process.env.WHATSAPP_SERVER_PORT || 3003);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.includes('fonnte.com') || origin.includes('azisfata.my.id')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  }
}));

app.use(express.json({ limit: '5mb' }));

const sendWhatsAppMessage = async (target, message) => {
  if (!target || !message) {
    throw new Error('Target dan pesan wajib diisi.');
  }

  const response = await fetch(process.env.FONNTE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: process.env.FONNTE_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ target, message })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`FONNTE API error (${response.status}): ${detail}`);
  }

  return response.json().catch(() => ({}));
};

const findUserByPhone = async (phoneNumber) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, is_approved')
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (error) {
    console.error('[WhatsAppWebhook] Supabase error:', error);
    throw new Error('Gagal memeriksa data pengguna.');
  }

  if (!data || !data.is_approved) {
    return null;
  }

  return data;
};

const buildSystemPrompt = () =>
  [
    'Anda adalah asisten AI yang membantu analisis data anggaran di aplikasi internal.',
    'Jawab dalam bahasa Indonesia yang ringkas, spesifik, dan berbasis data yang diberikan pengguna.',
    'Jika tidak memiliki informasi yang cukup, jelaskan data apa yang dibutuhkan.'
  ].join('\n');

const processWhatsAppMessage = async ({ sender, message, userId }) => {
  const cleanMessage = (message ?? '').toString().trim();
  if (!cleanMessage) {
    throw new Error('Pesan kosong.');
  }

  const basePrompt = buildSystemPrompt();
  let systemPrompt = basePrompt;

  if (userId) {
    const detectedQueryType = detectActivityQueryType(cleanMessage);
    if (detectedQueryType) {
      try {
        systemPrompt = await createActivityEnhancedPrompt({
          basePrompt,
          userId,
          userInput: cleanMessage,
          queryType: detectedQueryType
        });
      } catch (activityError) {
        console.error('[WhatsAppWebhook] Failed to enhance prompt with activity data:', activityError);
      }
    }
  }

  const history = sessionManager.getSession(sender);
  const payload = [
    { role: 'system', content: systemPrompt },
    ...history.map(entry => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content
    })),
    { role: 'user', content: cleanMessage }
  ];

  const reply = await fetchAiResponse(payload);
  sessionManager.addMessage(sender, 'user', cleanMessage);
  sessionManager.addMessage(sender, 'assistant', reply);
  return reply;
};

app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const rawSender = req.body?.sender;
    const sender = normalizeWhatsAppNumber(rawSender);
    const message = req.body?.pesan ?? req.body?.message ?? '';

    if (!sender || !message) {
      return res.status(400).json({ error: 'Sender dan pesan wajib diisi.' });
    }

    const linkedUser = await findUserByPhone(sender);
    if (!linkedUser) {
      await sendWhatsAppMessage(
        sender,
        'Nomor Anda belum terdaftar dengan SAPA AI. Silakan lakukan pendaftaran pada sapa.kemenkopmk.go.id'
      );
      // Return 200 agar FONNTE tidak menganggap request gagal dan mengirim ulang payload.
      return res.json({ success: true, warning: 'Nomor WhatsApp belum terverifikasi.' });
    }

    const aiReply = await processWhatsAppMessage({
      sender,
      message,
      userId: linkedUser.id
    });

    await sendWhatsAppMessage(sender, aiReply);
    res.json({ success: true });
  } catch (error) {
    console.error('[WhatsAppWebhook] Error:', error);
    try {
      const fallback = normalizeWhatsAppNumber(req.body?.sender);
      if (fallback) {
        await sendWhatsAppMessage(fallback, 'Maaf, terjadi gangguan. Silakan coba beberapa saat lagi.');
      }
    } catch (sendError) {
      console.error('[WhatsAppWebhook] Failed to send fallback message:', sendError);
    }
    res.status(500).json({ error: 'Gagal memproses webhook.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeSessions: sessionManager.sessions.size
  });
});

app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const target = normalizeWhatsAppNumber(req.body?.target);
    const message = req.body?.message;
    if (!target || !message) {
      return res.status(400).json({ error: 'Target dan message wajib diisi.' });
    }
    await sendWhatsAppMessage(target, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error('[WhatsAppWebhook] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

setInterval(() => sessionManager.cleanup(), 5 * 60 * 1000);

app.listen(port, () => {
  console.log(`[WhatsAppWebhook] Listening on port ${port}`);
});
