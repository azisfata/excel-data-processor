# 🚀 Panduan Migrasi ke Produksi

## 📋 Overview
Tutorial ini menjelaskan cara migrasi aplikasi Excel Data Processor ke produksi di domain `http://sapa.kemenkopmk.go.id` dengan sistem environment terpisah (`.env.loc` untuk local, `.env.prod` untuk produksi).

## 🗂️ Struktur Environment Files

### 1. **.env.loc** - Local Development
- Digunakan untuk development di localhost
- Port: 3002 (auth), 3001 (activity), 5173 (frontend)
- Host: localhost
- Cookie: non-secure, lax same-site
- CORS: localhost URLs

### 2. **.env.prod** - Production
- Digunakan untuk produksi di `sapa.kemenkopmk.go.id`
- Port: sama (3002, 3001, 5173)
- Host: sapa.kemenkopmk.go.id
- Cookie: secure, strict same-site
- CORS: production URLs

### 3. **.env.example** - Template
- Template untuk developer baru
- Berisi semua variabel yang diperlukan

## 🛠️ Setup Local Development

```bash
# Install dependencies
npm install

# Start development dengan .env.loc
npm run dev:local

# Atau start individual services
npm run api:local
npm run auth:local
npm run dev:client:local
```

## 🚀 Deploy ke Produksi

### 1. **Setup Production Environment**

```bash
# Copy template ke production
cp .env.example .env.prod

# Edit .env.prod dengan nilai production:
# - SERVER_HOST=sapa.kemenkopmk.go.id
# - FRONTEND_HOST=sapa.kemenkopmk.go.id
# - NODE_ENV=production
# - JWT_SECRET=generate-new-secure-secret
# - COOKIE_SECURE=true
# - COOKIE_DOMAIN=kemenkopmk.go.id
# - VITE_AUTH_SERVER_URL=https://sapa.kemenkopmk.go.id:3002
# - CORS_ORIGIN=https://sapa.kemenkopmk.go.id,https://www.sapa.kemenkopmk.go.id
# - GEMINI_API_KEY=your-production-api-key
# - VITE_GEMINI_API_KEY=your-production-api-key
```

### 2. **Build untuk Production**

```bash
# Build frontend dengan production config
npm run build

# Atau build dengan config lokal (jika diperlukan)
npm run build:local
```

### 3. **Start Production Servers**

```bash
# Start production servers dengan .env.prod
npm run start:prod

# Atau gunakan script yang sudah ada
npm run start

# Atau individual:
npm run api:prod
npm run auth:prod
```

## 🔧 Konfigurasi Vite

Vite config sudah diupdate untuk otomatis load environment file berdasarkan mode:

```typescript
// vite.config.ts
let envFile = '';
if (mode === 'production') {
    envFile = '.env.prod';
} else if (mode === 'development') {
    envFile = '.env.loc';
}
```

## 📝 Perintah npm Scripts

### Development Commands:
- `npm run dev` - Development default (gunakan .env)
- `npm run dev:local` - Development dengan .env.loc
- `npm run dev:client` - Frontend development
- `npm run dev:client:local` - Frontend dengan .env.loc

### Production Commands:
- `npm run build` - Build untuk production (.env.prod)
- `npm run build:local` - Build dengan .env.loc
- `npm run start:prod` - Start servers dengan .env.prod
- `npm run api:prod` - API server dengan .env.prod
- `npm run auth:prod` - Auth server dengan .env.prod

## 🔐 Security Notes untuk Production

1. **JWT Secret**: Generate secret yang benar-benar random dan kuat
2. **API Keys**: Gunakan API keys production yang terpisah dari development
3. **Cookies**: Pastikan `COOKIE_SECURE=true` dan `COOKIE_SAME_SITE=strict`
4. **CORS**: Hanya allow domain production yang valid
5. **Environment**: Jangan commit .env.prod ke version control

## 🧪 Testing Production

```bash
# Test build
npm run build

# Preview build
npm run preview

# Test individual services
npm run api:prod
npm run auth:prod
```

## 🔄 Workflow Development

1. **Local Development**: Gunakan `npm run dev:local`
2. **Testing**: Test semua fitur di local
3. **Build**: `npm run build` 
4. **Deploy**: Upload build hasilnya ke server
5. **Production**: `npm run start:prod` di server production

## 🐛 Troubleshooting

### Error "AI API key Gemini belum dikonfigurasi"
- Pastikan `VITE_GEMINI_API_KEY` ada di .env.prod
- Restart server setelah mengubah environment variables

### CORS Error
- Cek CORS_ORIGIN di .env.prod sudah benar
- Pastikan domain production sudah terdaftar

### Cookie Issues
- Verify COOKIE_SECURE=true untuk production
- Pastikan COOKIE_DOMAIN sesuai dengan production domain

---
**Note**: Jangan lupa untuk menghapus atau mengamankan API keys sensitif di production environment!
