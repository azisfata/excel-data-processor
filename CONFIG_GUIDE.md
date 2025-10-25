# 📋 Panduan Konfigurasi SAPA AI - Smart Analytics Platform

## 🎯 Overview
Proyek ini sekarang menggunakan sistem konfigurasi terpusat melalui environment variables untuk memudahkan setup di berbagai lingkungan (development, staging, production).

## 📋 Repository vs Application Name

**Note**: Repository name (`excel-data-processor`) maintains backward compatibility, 
while application has been rebranded to "SAPA AI - Smart Analytics Platform".

- **Repository**: `excel-data-processor` (GitHub compatibility)
- **Application**: "SAPA AI" (brand name)
- **Package**: `sapa-ai-platform` (npm package)

## 🔧 File Konfigurasi Utama

### 1. `.env` - Environment Variables
File ini berisi semua konfigurasi yang dapat disesuaikan. Copy dari `.env.example`:

```bash
cp .env.example .env
```

### 2. `ecosystem.config.cjs` - PM2 Configuration
Konfigurasi untuk production deployment dengan PM2. Otomatis membaca dari `.env`.

### 3. `vite.config.ts` - Vite Development
Konfigurasi development server dengan proxy yang dinamis.

## 🚀 Quick Start

### Development
```bash
# Setup environment
cp .env.example .env
# Edit .env dengan konfigurasi lokal Anda

# Install dependencies
npm install

# Start development servers
npm run dev
```

### Production
```bash
# Setup environment
cp .env.example .env
# Edit .env dengan konfigurasi production Anda

# Build & start with PM2
npm run build
npm run start
```

## 🔐 Konfigurasi Port & URLs

### Port Configuration
```bash
# Server Ports
AUTH_SERVER_PORT=3002          # Auth server
ACTIVITY_SERVER_PORT=3001       # File upload server  
FRONTEND_PORT=5173             # Frontend application

# Host Configuration
SERVER_HOST=localhost           # Server host
FRONTEND_HOST=localhost         # Frontend host
```

### API URLs
```bash
# Auth Server Configuration
VITE_AUTH_SERVER_URL=http://localhost:3002

# CORS Configuration (comma-separated origins)
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

## 🗄️ Database & External Services

### Supabase Configuration
```bash
# Supabase URL & Keys
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### AI Configuration
```bash
# Gemini AI
GEMINI_API_KEY=your_gemini_api_key_here
VITE_GEMINI_MODEL=gemini-1.5-flash
VITE_GEMINI_FALLBACK_MODELS=gemini-1.5-pro,gemini-pro
VITE_GEMINI_TIMEOUT_MS=30000
```

## 🔐 Authentication & Security

### JWT & Cookies
```bash
# JWT Secret (gunakan strong random string untuk production)
JWT_SECRET=your-secret-key-change-this-in-production

# Cookie Configuration
COOKIE_SECURE=false              # true untuk HTTPS
COOKIE_DOMAIN=                   # domain untuk production
COOKIE_SAME_SITE=lax            # strict, lax, atau none
```

### Admin Configuration
```bash
# Auto-approved admin emails (comma-separated)
ADMIN_EMAILS=admin1@kemenkopmk.go.id,admin2@kemenkopmk.go.id
```

## 📁 File Upload Configuration

```bash
# Upload Settings
MAX_FILE_SIZE=10485760          # 10MB dalam bytes
ALLOWED_FILE_TYPES=pdf,doc,docx,xls,xlsx,jpg,jpeg,png

# Directory Configuration
UPLOAD_DIR=activity_uploads
METADATA_FILE=activity_attachments.json
```

## 🌍 Environment-Specific Configuration

### Development (.env.development)
```bash
NODE_ENV=development
COOKIE_SECURE=false
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

### Production (.env.production)
```bash
NODE_ENV=production
COOKIE_SECURE=true
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
VITE_AUTH_SERVER_URL=https://api.yourdomain.com:3002
```

## 🔄 Port Mapping

| Service | Default Port | Environment Variable | Description |
|---------|-------------|---------------------|-------------|
| Frontend | 5173 | `FRONTEND_PORT` | Vite dev server / static serve |
| Auth API | 3002 | `AUTH_SERVER_PORT` | Authentication & user management |
| Activity API | 3001 | `ACTIVITY_SERVER_PORT` | File upload & attachment management |

## 🛠️ Troubleshooting

### Common Issues

1. **Port Conflict**
   ```bash
   # Ubah port di .env
   AUTH_SERVER_PORT=3003
   ACTIVITY_SERVER_PORT=3004
   ```

2. **CORS Issues**
   ```bash
   # Tambahkan origin ke CORS_ORIGIN
   CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.100:5173
   ```

3. **Authentication Issues**
   ```bash
   # Reset JWT secret
   JWT_SECRET=new-strong-secret-key-here
   ```

### Debug Commands
```bash
# Check PM2 status
npm run pm2:status

# View PM2 logs
npm run pm2:logs

# Restart PM2 processes
npm run pm2:restart

# Stop PM2 processes
npm run pm2:stop
```

## 📝 Best Practices

1. **Environment Separation**
   - Gunakan file `.env` terpisah untuk setiap environment
   - Jangan commit file `.env` ke version control

2. **Security**
   - Gunakan strong JWT secret untuk production
   - Set `COOKIE_SECURE=true` untuk HTTPS
   - Limit CORS origins untuk production

3. **Port Management**
   - Gunakan environment variables untuk semua port configuration
   - Pastikan tidak ada port conflicts di deployment

4. **Backup Configuration**
   - Backup file `.env` untuk production
   - Document custom configuration changes

## 🆘 Help

Jika mengalami masalah dengan konfigurasi:
1. Periksa file `.env` sudah benar
2. Jalankan `npm run check-env` untuk validasi environment variables
3. Cek logs di directory `logs/` untuk error details
4. Pastikan semua port yang didefinisikan tidak digunakan oleh service lain
