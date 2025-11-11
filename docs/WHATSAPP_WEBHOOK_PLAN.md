# WhatsApp Webhook Integration Plan

## Overview
Dokumen ini merangkum rencana implementasi webhook WhatsApp sebagai bridge antara FONNTE dan layanan AI yang sudah digunakan di aplikasi Excel Data Processor. Fokus utama rencana ini adalah memastikan alur percakapan berjalan aman, kontekstual, dan efisien tanpa menambah beban pada infrastruktur yang ada.

## Tujuan
- Menerima pesan WhatsApp dari FONNTE.
- Memetakan pengirim ke akun yang sah di aplikasi SAPA.
- Memproses pesan melalui layanan AI eksisting.
- Mengirimkan balasan AI kembali ke WhatsApp melalui FONNTE.
- Menjaga konteks percakapan per pengguna.

## Arsitektur

### Flow Diagram
```
User WhatsApp -> FONNTE -> Webhook Server -> AI Service -> Webhook Server -> FONNTE -> User WhatsApp
```

### Komponen Inti
1. **Webhook Server** (port 3003) - Express.js server untuk menangani pesan masuk/keluar WhatsApp.
2. **AI Service Integration** - Reuse `fetchAiResponse` melalui helper Node (`server/ai-service.js`).
3. **Session Management** - Penyimpanan konteks percakapan in-memory.
4. **User Identity Mapping** - Validasi nomor WhatsApp terhadap akun SAPA yang telah diverifikasi.
5. **FONNTE API Client** - Klien HTTP untuk mengirim balasan ke FONNTE.

Komponen identity bersifat wajib agar data internal hanya diberikan kepada nomor yang benar-benar sudah dihubungkan dengan akun resmi SAPA. Tanpa mekanisme ini, pesan anonim bisa mengakses informasi sensitif.

## Struktur File

### File Baru
```
server/
  webhook-server.js        # Webhook WhatsApp utama
  ai-service.js            # Adaptasi fetchAiResponse untuk runtime Node
```

### File yang Dimodifikasi
```
ecosystem.config.cjs       # Tambah proses PM2 untuk webhook
.env                       # Tambah variabel lingkungan WhatsApp/FONNTE
package.json               # Tambah skrip npm untuk webhook server
server/auth-server.js      # (Sebelumnya) memperkenalkan kolom phone_number & OTP
```

## Implementasi Teknis

### 1. Webhook Server (`server/webhook-server.js`)

#### Dependencies & Imports
```javascript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import { fetchAiResponse } from './ai-service.js';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

#### Session Management
```javascript
class WhatsAppSessionManager {
  constructor() {
    this.sessions = new Map();
    this.maxMessages = 20; // Maksimal 20 pesan per sesi
    this.sessionTimeout = 30 * 60 * 1000; // 30 menit
  }

  getSession(sender) {
    return this.sessions.get(sender) || [];
  }

  addMessage(sender, role, content) {
    let session = this.sessions.get(sender) || [];

    session.push({
      role,
      content,
      timestamp: Date.now()
    });

    if (session.length > this.maxMessages) {
      session = session.slice(-this.maxMessages);
    }

    this.sessions.set(sender, session);
    return session;
  }

  cleanupOldSessions() {
    const now = Date.now();
    for (const [sender, session] of this.sessions.entries()) {
      const lastMessage = session.at(-1);
      if (!lastMessage || now - lastMessage.timestamp > this.sessionTimeout) {
        this.sessions.delete(sender);
      }
    }
  }
}
```

> Catatan: tetap gunakan in-memory Map agar ringan. Jika dibutuhkan ketahanan terhadap restart, siapkan scheduler sederhana yang menulis snapshot sesi ke file JSON lokal dan memuatnya kembali saat server menyala.

#### WhatsApp System Prompt
```javascript
function buildWhatsAppSystemPrompt() {
  return [
    'Anda adalah asisten AI untuk WhatsApp Kementerian Koperasi dan UKM.',
    'Anda membantu analisis data anggaran dan kegiatan internal.',
    'Jawab dalam bahasa Indonesia yang ringkas, profesional, dan berbasis data.',
    'Gunakan format yang mudah dibaca di WhatsApp (line breaks, emoji jika perlu).',
    'Jika tidak memiliki informasi cukup, jelaskan data apa yang dibutuhkan.',
    'Hanya berikan informasi yang relevan dengan pertanyaan pengguna.'
  ].join('\n');
}
```

#### AI Processing Logic
```javascript
async function processWhatsAppMessage({ sender, message }) {
  const cleanMessage = (message ?? '').toString().trim();
  if (!cleanMessage) {
    throw new Error('Pesan kosong.');
  }

  const history = sessionManager.getSession(sender);
  const payload = [
    { role: 'system', content: buildWhatsAppSystemPrompt() },
    ...history.map(entry => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content
    })),
    { role: 'user', content: cleanMessage }
  ];

  const aiReply = await fetchAiResponse(payload);

  sessionManager.addMessage(sender, 'user', cleanMessage);
  sessionManager.addMessage(sender, 'assistant', aiReply);

  return aiReply;
}
```

> Enhancement berikutnya dapat menyuntikkan context SAPA (melalui `createActivityEnhancedPrompt`) ketika dibutuhkan, tetapi implementasi awal fokus pada respons cepat berbasis history percakapan.

#### FONNTE API Integration
```javascript
async function sendWhatsAppMessage(target, message) {
  try {
    const response = await fetch(process.env.FONNTE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: process.env.FONNTE_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Fase awal cukup target + message; parameter lanjutan ditambahkan sesuai kebutuhan fitur.
        target,
        message
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`FONNTE API error (${response.status}): ${detail}`);
    }

    return await response.json().catch(() => ({}));
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}
```

#### User Identity Resolver
```javascript
function normalizeWhatsAppNumber(rawNumber) {
  const digitsOnly = String(rawNumber ?? '').replace(/\D/g, '');
  if (!digitsOnly) return '';
  if (digitsOnly.startsWith('0')) return `62${digitsOnly.slice(1)}`;
  if (digitsOnly.startsWith('62')) return digitsOnly;
  return `62${digitsOnly}`;
}

const whatsappUserResolver = {
  async findByPhone(phoneNumber) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role, is_approved')
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user by WhatsApp number:', error);
      throw new Error('Gagal memeriksa data pengguna.');
    }

    if (!data || !data.is_approved) {
      return null;
    }

    return data;
  }
};
```

#### Main Webhook Handler
```javascript
async function handleWhatsAppWebhook(req, res) {
  try {
    const sender = normalizeWhatsAppNumber(req.body?.sender);
    const pesan = req.body?.pesan ?? req.body?.message ?? '';

    if (!sender || !pesan) {
      return res.status(400).json({ error: 'Sender dan pesan wajib diisi.' });
    }

    const linkedUser = await whatsappUserResolver.findByPhone(sender);
    if (!linkedUser) {
      await sendWhatsAppMessage(
        sender,
        'Nomor WhatsApp Anda belum terhubung dengan akun SAPA. Silakan login ke portal SAPA dan verifikasi nomor Anda terlebih dahulu.'
      );
      return res.status(403).json({ error: 'Nomor belum terverifikasi.' });
    }

    const aiResponse = await processWhatsAppMessage({ sender, message: pesan });

    await sendWhatsAppMessage(sender, aiResponse);

    res.json({ success: true });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);

    try {
      const fallbackTarget = normalizeWhatsAppNumber(req.body?.sender);
      if (fallbackTarget) {
        await sendWhatsAppMessage(
          fallbackTarget,
          'Maaf, terjadi gangguan. Silakan coba beberapa saat lagi.'
        );
      }
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }

    res.status(500).json({ error: 'Processing failed' });
  }
}
```

#### Complete Server Setup
```javascript
const app = express();
const sessionManager = new WhatsAppSessionManager();
const port = process.env.WHATSAPP_SERVER_PORT
  ? Number(process.env.WHATSAPP_SERVER_PORT)
  : 3003;

app.use(cors({
  origin(origin, callback) {
    if (!origin || origin.includes('fonnte.com')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  }
}));

app.use(express.json({ limit: '10mb' }));

app.post('/webhook/whatsapp', handleWhatsAppWebhook);

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

### 2. AI Service Helper (`server/ai-service.js`)
Helper Node ini memindahkan logika `fetchAiResponse` ke runtime Node sehingga webhook tidak bergantung pada bundler.

```javascript
import { fetchAiResponse } from './ai-service.js';
```

Sorotan utama:
- Gunakan `GEMINI_API_KEY` (fallback `VITE_GEMINI_API_KEY`) agar server memiliki kredensial sendiri.
- Mendukung fallback model dan timeout sama seperti implementasi front-end.
- Pastikan perubahan pada `src/services/aiService.ts` disinkronkan ke helper ini.

### 3. Environment Variables (`.env`)
```env
WHATSAPP_SERVER_PORT=3003
FONNTE_API_URL=https://api.fonnte.com/send
FONNTE_TOKEN=your_fonnte_token_here
WEBHOOK_SECRET_KEY=your_optional_webhook_signature
GEMINI_API_KEY=your_gemini_server_key
```
Pastikan variabel Supabase (`VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY`) tersedia bagi proses webhook.

### 4. PM2 Configuration (`ecosystem.config.cjs`)
Tambahkan aplikasi baru berikut agar webhook dikelola PM2:

```javascript
    {
      name: 'excel-processor-whatsapp-webhook',
      script: 'server/webhook-server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        WHATSAPP_SERVER_PORT: getEnvVar('WHATSAPP_SERVER_PORT', 3003),
        ...envConfig
      },
      error_file: './logs/webhook-err.log',
      out_file: './logs/webhook-out.log',
      log_file: './logs/webhook.log',
      time: true
    }
```

### 5. User Linking & Verification
- Gunakan kolom `phone_number` (format E.164, contoh `628123456789`) pada tabel `users` untuk mencocokkan akun.
- Alur OTP di aplikasi web memastikan nomor diverifikasi sebelum mengakses WhatsApp AI.
- Normalisasi nomor (hapus spasi/tanda baca) sebelum menyimpan.
- Dokumentasikan prosedur reset nomor bagi tim support (kosongkan `phone_number`, ulangi OTP).

## Deployment Steps

### 1. Preparation
```bash
mkdir -p logs
npm install express cors dotenv
node -e "console.log('WHATSAPP_SERVER_PORT:', process.env.WHATSAPP_SERVER_PORT)"
```

### 2. Start Webhook Server
```bash
# Jalankan lokal (development)
npm run webhook

# Atau kelola via PM2
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs excel-processor-whatsapp-webhook
```

### 3. Testing
```bash
# Health check
curl http://localhost:3003/api/health

# Manual send
curl -X POST http://localhost:3003/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{"target":"628123456789","message":"Test message"}'

# Simulasi webhook dari FONNTE
curl -X POST http://localhost:3003/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"sender":"628123456789","pesan":"Tolong kirim laporan anggaran terbaru"}'

# Pastikan nomor tak terdaftar ditolak
curl -X POST http://localhost:3003/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"sender":"628000000000","pesan":"Coba akses data tanpa registrasi"}'
```

### 4. Cloudflare Tunnel
- Arahkan tunnel Cloudflare ke `http://localhost:3003`.
- Mapping domain publik (mis. `https://fonnte.azisfata.my.id`).
- Set webhook URL FONNTE ke `https://fonnte.azisfata.my.id/webhook/whatsapp`.
- Uji kembali melalui domain publik dan pantau log webhook.

## Security Considerations

### Webhook Security
```javascript
function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-fonnte-signature'];
  const secret = process.env.WEBHOOK_SECRET_KEY;
  if (!signature || !secret) return next();
  // TODO: implementasi verifikasi sesuai format FONNTE
  next();
}
```

### Rate Limiting
```javascript
const rateLimitMap = new Map();
function rateLimit(req, res, next) {
  const sender = normalizeWhatsAppNumber(req.body?.sender);
  if (!sender) return res.status(400).json({ error: 'Invalid sender' });
  const now = Date.now();
  const history = (rateLimitMap.get(sender) || []).filter(ts => now - ts < 60 * 1000);
  if (history.length >= 10) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  history.push(now);
  rateLimitMap.set(sender, history);
  next();
}
```

### Input Validation
```javascript
function validateWhatsAppInput(req, res, next) {
  const sender = normalizeWhatsAppNumber(req.body?.sender);
  const pesan = (req.body?.pesan ?? '').toString();
  if (!sender) return res.status(400).json({ error: 'Invalid sender format' });
  if (!pesan || typeof pesan !== 'string' || pesan.length > 1000) {
    return res.status(400).json({ error: 'Invalid message' });
  }
  next();
}
```

## Testing Strategy

### Unit Testing
```javascript
async function testAIIntegration() {
  const tests = ['Halo, siapa saya?', 'Berikan saya data anggaran'];
  for (const message of tests) {
    const response = await processWhatsAppMessage({ sender: 'test', message });
    console.log('Response:', response.substring(0, 60));
  }
}
```

### Integration Testing
Lakukan pengujian end-to-end dengan payload JSON meniru FONNTE via curl/Postman.

## Monitoring & Logging
- Endpoint `GET /api/health` untuk health check.
- Tambah endpoint `/api/metrics` (opsional) guna expose metrik sesi aktif, uptime, dan memori.
- Log event penting dalam format JSON agar mudah dianalisis.

## Troubleshooting
- **AI timeout**: naikkan `GEMINI_TIMEOUT_MS` atau gunakan fallback model lain.
- **FONNTE error**: baca detail response body, aktifkan retry bila diperlukan.
- **Nomor belum terhubung**: arahkan user mengulang verifikasi OTP di portal SAPA.

## Next Steps

### Phase 1 – Basic Implementation
- [x] Create webhook server file.
- [x] Implement basic AI integration (Gemini helper untuk Node).
- [x] Add FONNTE API integration.
- [x] Tambah resolver Supabase untuk mencocokkan nomor WhatsApp -> user aplikasi.
- [x] Tambahkan helper AI Node (`server/ai-service.js`).
- [x] Update PM2 configuration & npm scripts.
- [ ] Basic end-to-end testing (FONNTE -> tunnel -> webhook -> balasan).

### Phase 2 – Enhancement
- [ ] Tambah hardening keamanan (signature verification, allow-list IP).
- [x] Implement session management (in-memory + auto cleanup).
- [x] Rilis alur verifikasi nomor WhatsApp + OTP di aplikasi web.
- [ ] Integrasi `createActivityEnhancedPrompt` untuk permintaan data kegiatan kompleks.
- [ ] Tambah monitoring endpoints/log enrichment.
- [ ] Comprehensive testing (unit + integration).

### Phase 3 – Production Ready
- [ ] Load testing.
- [ ] Error handling improvements (alerting, retry queue).
- [ ] Documentation completion (runbook + SOP support).
- [ ] Production deployment.

## Useful Links
- [FONNTE API Documentation](https://fonnte.com/api/)
- [Gemini API Documentation](https://ai.google.dev/)
- [Express.js Documentation](https://expressjs.com/)
- [PM2 Documentation](https://pm2.keymetrics.io/)

---

Dokumen ini akan terus diperbarui selama proses implementasi. Pastikan seluruh pengujian selesai sebelum meluncurkan ke produksi.
