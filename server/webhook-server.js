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

const buildSystemPrompt = () => [
  'Anda adalah asisten AI untuk WhatsApp Kementerian Koperasi dan UKM.',
  'Anda membantu analisis data anggaran dan kegiatan internal.',
  'Jawab dalam bahasa Indonesia yang ringkas, profesional, dan berbasis data.',
  'Gunakan format yang mudah dibaca di WhatsApp (line breaks, emoji jika perlu).',
  'Jika tidak memiliki informasi cukup, jelaskan data apa yang dibutuhkan.',
  'Hanya berikan informasi yang relevan dengan pertanyaan pengguna.'
].join('\n');

const processWhatsAppMessage = async ({ sender, message, userId }) => {
  const cleanMessage = (message ?? '').toString().trim();
  if (!cleanMessage) {
    throw new Error('Pesan kosong.');
  }

  const history = sessionManager.getSession(sender);
  const payload = [
    { role: 'system', content: buildSystemPrompt() },
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
      await sendWhatsAppMessage(sender, 'Nomor WhatsApp Anda belum terhubung dengan akun SAPA. Silakan login ke portal SAPA dan verifikasi nomor Anda terlebih dahulu.');
      return res.status(403).json({ error: 'Nomor WhatsApp belum terverifikasi.' });
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
