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
1. **Webhook Server** (port 3003) – Express.js server untuk menangani pesan masuk/keluar WhatsApp.
2. **AI Service Integration** – Reuse `fetchAiResponse` dari `aiService.ts`.
3. **Session Management** – Penyimpanan konteks percakapan in-memory.
4. **User Identity Mapping** – Validasi nomor WhatsApp terhadap akun SAPA yang telah diverifikasi.
5. **FONNTE API Client** – Klien HTTP untuk mengirim balasan ke FONNTE.

Komponen identity bersifat wajib agar data internal hanya diberikan kepada nomor yang benar-benar sudah dihubungkan dengan akun resmi SAPA. Tanpa mekanisme ini, pesan anonim bisa mengakses informasi sensitif.

## Struktur File

### File Baru
```
server/
  webhook-server.js        # Webhook WhatsApp utama
```

### File yang Dimodifikasi
```
ecosystem.config.cjs       # Tambah proses PM2 untuk webhook
.env                       # Tambah variabel lingkungan WhatsApp
src/services/aiService.ts  # Perlu menambahkan fallback ke process.env
```

## Implementasi Teknis

### 1. Webhook Server (`server/webhook-server.js`)

#### Dependencies & Imports
```javascript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import { fetchAiResponse } from '../src/services/aiService.js';
import { createActivityEnhancedPrompt, detectActivityQueryType } from '../src/utils/aiActivityPrompts.js';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Penting:
 * Perbarui helper environment di src/services/aiService.ts agar juga membaca process.env.
 * Hal ini membuat fetchAiResponse dapat dipanggil dari runtime Node (server) maupun Vite (client).
 */
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
async function processWhatsAppMessage({ sender, message, sessionManager, userId }) {
  try {
    const normalizedMessage = (message ?? '').toString().trim();
    if (!normalizedMessage) {
      throw new Error('Pesan kosong atau tidak valid.');
    }

    const existingSession = sessionManager.getSession(sender);

    const payload = [
      { role: 'system', content: buildWhatsAppSystemPrompt() },
      ...existingSession.map(entry => ({
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        content: entry.content
      })),
      { role: 'user', content: normalizedMessage }
    ];

    // Enhancement tahap berikutnya:
    // Jika userId tersedia, panggil createActivityEnhancedPrompt/detectActivityQueryType
    // untuk menyuntikkan context SAPA sebelum request AI.
    if (userId) {
      // Contoh (aktifkan setelah siap):
      // const enhancedPrompt = await createActivityEnhancedPrompt(buildWhatsAppSystemPrompt(), userId, normalizedMessage);
      // payload[0] = { role: 'system', content: enhancedPrompt };
    }

    const aiReply = await fetchAiResponse(payload);

    sessionManager.addMessage(sender, 'user', normalizedMessage);
    sessionManager.addMessage(sender, 'assistant', aiReply);

    return aiReply;
  } catch (error) {
    console.error('Error processing WhatsApp message:', error);
    throw error;
  }
}
```

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
      throw new Error(`FONNTE API error: ${response.status}`);
    }

    return await response.json();
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
      .select('id, name, role')
      .eq('whatsapp_number', phoneNumber)
      .eq('is_approved', true)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user by WhatsApp number:', error);
      throw new Error('Gagal memeriksa data pengguna.');
    }

    return data ?? null;
  }
};
```

#### Main Webhook Handler
```javascript
async function handleWhatsAppWebhook(req, res) {
  try {
    const rawPayload = req.body ?? {};
    console.log('[WhatsApp] Incoming payload:', JSON.stringify(rawPayload));

    const sender = typeof rawPayload.sender === 'string'
      ? rawPayload.sender.trim()
      : String(rawPayload.sender ?? '').trim();
    const pesan = typeof rawPayload.pesan === 'string'
      ? rawPayload.pesan
      : String(rawPayload.pesan ?? '');

    if (!sender || !pesan) {
      return res.status(400).json({ error: 'Missing sender or message' });
    }

    const normalizedSender = normalizeWhatsAppNumber(sender);
    if (!normalizedSender) {
      return res.status(400).json({ error: 'Sender format invalid' });
    }

    const appUser = await whatsappUserResolver.findByPhone(normalizedSender);
    if (!appUser) {
      await sendWhatsAppMessage(
        normalizedSender,
        'Nomor WhatsApp Anda belum terhubung dengan akun SAPA. Silakan login ke portal SAPA dan verifikasi nomor Anda terlebih dahulu.'
      );
      return res.status(403).json({ error: 'Sender not linked to any user' });
    }

    logWebhookEvent(req, 'incoming', 'accepted');

    const aiResponse = await processWhatsAppMessage({
      sender: normalizedSender,
      message: pesan,
      sessionManager,
      userId: appUser.id
    });

    await sendWhatsAppMessage(normalizedSender, aiResponse);

    res.json({ success: true, message: 'Processed successfully' });
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
    const { target, message } = req.body;
    if (!target || !message) {
      return res.status(400).json({ error: 'Target and message required' });
    }
    await sendWhatsAppMessage(target, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

setInterval(() => {
  sessionManager.cleanupOldSessions();
}, 5 * 60 * 1000);

app.use((error, req, res, next) => {
  console.error('Webhook server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`WhatsApp webhook server listening on port ${port}`);
});
```

### 2. Environment Variables (`.env`)
Tambahkan konfigurasi berikut:

```env
# WhatsApp Webhook Configuration
WHATSAPP_SERVER_PORT=3003
FONNTE_API_URL=https://api.fonnte.com/send
FONNTE_TOKEN=your_fonnte_token_here
WEBHOOK_SECRET_KEY=your_webhook_secret_here

# AI Configuration (existing)
VITE_GEMINI_API_KEY=...           # sudah tersedia
VITE_GEMINI_MODEL=gemini-2.5-flash
VITE_GEMINI_TIMEOUT_MS=60000
```

Pastikan variabel Supabase (`VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY`) turut tersedia di proses webhook agar resolver pengguna dapat bekerja.

### 3. PM2 Configuration (`ecosystem.config.cjs`)
```javascript
module.exports = {
  apps: [
    // ... existing apps
    {
      name: 'excel-processor-webhook',
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
  ]
};
```

### 4. User Linking & Verification
- Tambah kolom `whatsapp_number` (format E.164 tanpa tanda plus, mis. `628123456789`) pada tabel `users`.
- Bangun alur verifikasi di aplikasi web: user login -> input nomor WhatsApp -> kirim OTP via FONNTE -> simpan nomor bila OTP cocok.
- Hanya user `is_approved = true` dan nomor terverifikasi yang diizinkan mengakses WhatsApp AI.
- Siapkan job untuk menormalisasi nomor tersimpan (hapus spasi/tanda baca) agar pencarian konsisten.
- Dokumentasikan prosedur reset nomor bagi tim support.

## Deployment Steps

### 1. Preparation
```bash
mkdir -p logs
npm install express cors dotenv
node -e "console.log('WHATSAPP_SERVER_PORT:', process.env.WHATSAPP_SERVER_PORT)"
```

### 2. Start Webhook Server
```bash
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs excel-processor-webhook
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

## Security Considerations

### Webhook Security
```javascript
function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-fonnte-signature'];
  const secret = process.env.WEBHOOK_SECRET_KEY;
  if (!signature || !secret) return next(); // Optional; aktifkan jika FONNTE menyediakan signature
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

  if (!sender) {
    return res.status(400).json({ error: 'Invalid sender format' });
  }

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
  const testMessages = [
    'Halo, siapa saya?',
    'Berikan saya data anggaran',
    'Terima kasih',
    'Buat kegiatan baru'
  ];

  for (const message of testMessages) {
    try {
      const response = await processWhatsAppMessage({
        sender: 'test123',
        message,
        sessionManager: new WhatsAppSessionManager()
      });
      console.log(`Test passed: ${message.substring(0, 20)}... -> ${response.substring(0, 50)}...`);
    } catch (error) {
      console.error(`Test failed: ${message}`, error);
    }
  }
}
```

### Integration Testing
```bash
curl -X POST http://localhost:3003/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "628123456789",
    "pesan": "Tolong berikan saya laporan anggaran bulan ini"
  }'

# Verifikasi nomor yang belum terhubung
curl -X POST http://localhost:3003/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "628000000000",
    "pesan": "Coba akses data tanpa registrasi"
  }'
```

### Load Testing
```bash
for i in {1..10}; do
  curl -X POST http://localhost:3003/webhook/whatsapp \
    -H "Content-Type: application/json" \
    -d "{\"sender\":\"test${i}\",\"pesan\":\"Test message ${i}\"}" &
done
wait
```

## Monitoring & Logging

### Monitoring Endpoints
```javascript
app.get('/api/metrics', (req, res) => {
  res.json({
    activeSessions: sessionManager.sessions.size,
    totalMessages: Array.from(sessionManager.sessions.values())
      .reduce((total, session) => total + session.length, 0),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
```

### Enhanced Logging
```javascript
function logWebhookEvent(req, action, result) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    sender: req.body?.sender,
    message: req.body?.pesan?.substring(0, 100),
    action,
    result,
    userAgent: req.headers['user-agent']
  };
  console.log(JSON.stringify(logEntry));
}
```

## Troubleshooting

### AI Service Timeout
```javascript
const AI_TIMEOUT = 30000;

const aiResponse = await Promise.race([
  fetchAiResponse(payload),
  new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), AI_TIMEOUT))
]);
```

### FONNTE API Errors
```javascript
async function sendWithRetry(target, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sendWhatsAppMessage(target, message);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1}/${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### Memory Management
```javascript
setInterval(() => {
  sessionManager.cleanupOldSessions();
  console.log(`Cleanup complete. Active sessions: ${sessionManager.sessions.size}`);
}, 60 * 1000);
```

## Performance Optimization

### Response Caching
```javascript
const responseCache = new Map();

function getCachedResponse(message) {
  const key = message.toLowerCase().trim();
  return responseCache.get(key);
}

function setCachedResponse(message, response) {
  const key = message.toLowerCase().trim();
  if (responseCache.size > 100) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
  responseCache.set(key, response);
}
```

### Message Queue (Advanced)
```javascript
const messageQueue = [];

async function processQueue() {
  while (messageQueue.length > 0) {
    const { target, message } = messageQueue.shift();
    try {
      await sendWhatsAppMessage(target, message);
    } catch (error) {
      console.error('Queue processing error:', error);
      messageQueue.unshift({ target, message });
    }
  }
}

setInterval(processQueue, 1000);
```

## Next Steps

### Phase 1 – Basic Implementation
- [ ] Create webhook server file.
- [ ] Implement basic AI integration.
- [ ] Add FONNTE API integration.
- [ ] Tambah resolver Supabase untuk mencocokkan nomor WhatsApp -> user aplikasi.
- [ ] Update `aiService.ts` agar membaca `process.env` selain `import.meta.env`.
- [ ] Update PM2 configuration.
- [ ] Basic testing.

### Phase 2 – Enhancement
- [ ] Add security features.
- [ ] Implement session management.
- [ ] Rilis alur verifikasi nomor WhatsApp + OTP di aplikasi web.
- [ ] Integrasi `createActivityEnhancedPrompt` untuk pertanyaan yang memerlukan data kegiatan.
- [ ] Add monitoring endpoints.
- [ ] Comprehensive testing.

### Phase 3 – Production Ready
- [ ] Load testing.
- [ ] Error handling improvements.
- [ ] Documentation completion.
- [ ] Production deployment.

## Useful Links
- [FONNTE API Documentation](https://fonnte.com/api/)
- [Gemini API Documentation](https://ai.google.dev/)
- [Express.js Documentation](https://expressjs.com/)
- [PM2 Documentation](https://pm2.keymetrics.io/)

---

Dokumen ini akan terus diperbarui selama proses implementasi. Pastikan seluruh pengujian selesai sebelum meluncurkan ke produksi.
