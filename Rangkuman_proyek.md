# Rangkuman Proyek Excel Data Processor

## Informasi Umum
- **Nama**: Excel Data Processor
- **Tujuan**: Upload an Excel file, clean and restructure its contents, present hierarchical budget data with activity management, and enable downloads of processed spreadsheets
- **Tech Stack**: React + TypeScript (Vite), Tailwind CSS utility classes, Supabase for persistence, Google Gemini AI for analysis

## Overview
Proyek ini adalah aplikasi web React + TypeScript untuk memproses file Excel realisasi anggaran dari Kementerian Koperasi dan UKM (Kemenkop UKM). Aplikasi ini dirancang untuk membantu dalam analisis data anggaran dengan fitur canggih termasuk AI, manajemen kegiatan, dan sistem autentikasi.

## Teknologi Utama
- **Frontend**: React ^19.1.1, TypeScript, Vite, TailwindCSS, React Router, React Dropzone
- **Backend**: Express.js (Node.js)
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini AI (models/gemini-2.5-flash) for intelligent data analysis
- **Library**: XLSX (Excel processing), Multer (file upload), cookie-parser, bcryptjs, @google/genai, concurrently, serve

## Arsitektur Aplikasi

### Development Architecture
- **Auth Server**: Berjalan di port 3002, menangani autentikasi
- **API Server/Activity Upload Server**: Berjalan di port 3001, menangani upload file
- **Frontend Client**: Berjalan di port 5173, antarmuka pengguna

### Production Architecture
```
┌─────────────────────────────────────┐
│     PM2 Process Manager             │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐ │
│  │   Frontend (Serve)              │ │
│  │   Port: 5173                    │ │
│  └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐ │
│  │   Auth Server                   │ │
│  │   Port: 3002                    │ │
│  └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐ │
│  │   Activity Upload Server        │ │
│  │   Port: 3001                    │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Catatan: Konfigurasi PM2 dalam production menggunakan:
- excel-processor-frontend: berjalan dengan 'serve' di port 5173
- excel-processor-auth-server: menjalankan server/auth-server.js di port 3002
- excel-processor-activity-server: menjalankan server/activity-upload-server.js di port 3001

## Struktur File

### Backend (Server)
- `server/activity-upload-server.js` - Server untuk upload file (port 3001)
- `server/auth-server.js` - Server autentikasi (port 3002)

Endpoints Auth Server:
  - POST `/api/auth/signup` - Registrasi user baru
  - POST `/api/auth/login` - Login user
  - POST `/api/auth/logout` - Logout user
  - GET `/api/auth/me` - Get current user
  - GET `/api/users` - Get all users (admin only)
  - POST `/api/users` - Create user (admin only)
  - PUT `/api/users/:id` - Update user (admin only)
  - DELETE `/api/users/:id` - Delete user (admin only)

Endpoints Activity Upload Server:
  - GET `/api/activities/attachments` - Get all activity attachments
  - GET `/api/activities/:id/attachment` - Get attachments for a specific activity
  - POST `/api/activities/:id/attachment` - Upload an attachment for an activity
  - DELETE `/api/activities/:id/attachment/:attachmentId?` - Delete an attachment (or all attachments for an activity)
  - GET `/api/activities/:id/attachments/:attachmentId/download` - Download a specific attachment

### Frontend (React)
- `src/contexts/AuthContext.tsx` - Context untuk state autentikasi
- `src/pages/LoginPage.tsx` - Halaman login
- `src/pages/SignupPage.tsx` - Halaman registrasi
- `src/pages/UserManagementPage.tsx` - Halaman manajemen user (admin only)
- `src/components/ProtectedRoute.tsx` - HOC untuk protected routes
- `src/main.tsx` - Setup routing

### Services
- `services/excelProcessor.ts` - Core Excel processing logic
- `services/aiService.ts` - Gemini AI integration
- `services/supabaseService.ts` - Database operations (processed results, activities, user settings)
- `services/activityAttachmentService.ts` - Activity attachment operations (upload, delete, fetch)

### Utilities
- `utils/hierarchy.ts` - Hierarchical data structure
- `utils/supabase.ts` - Supabase client configuration

### Components & Core Files
- `App.tsx` - Main application component
- `index.tsx` - Application entry point
- `types.ts` - Type definitions
- `vite.config.ts` - Vite build configuration (includes proxy setup for /api and /activity-uploads to the backend server at port 3001)
- `ecosystem.config.cjs` - PM2 process configuration

### Scripts & Configuration
- `scripts/create-admin.js` - Script untuk membuat admin pertama
- `server/activity-upload-server.js` - Server untuk upload file (port 3001)
- `server/auth-server.js` - Server autentikasi (port 3002)

### Features
- `features/activities/` - Modul manajemen kegiatan
  - `features/activities/components/` - Komponen-komponen terkait kegiatan
  - `features/activities/hooks/` - Custom hooks untuk manajemen kegiatan

## Fitur Utama

### 1. Excel Data Processing
- **Smart parsing** of Indonesian government budget Excel files
- **Hierarchical code processing** with 7-level depth structure
- **Data cleaning and restructuring** to handle complex budget data
- **Column filtering and totals calculation**
- **Excel download** of processed data with proper formatting
- **Parsing**: FileReader hands the binary string to `parseExcelFile`, wrapping `XLSX.read` to produce a two-dimensional array representation
- **Cleaning** (`muatDanBersihkanData`):
  - Removes footer notes such as the "Lock Pagu" disclaimer
  - Finds the "Program Dukungan Manajemen" header to trim leading noise
  - Drops columns that are entirely empty
- **Restructuring** (`prosesDanStrukturData`):
  - Realigns codes and descriptions into the first two columns by shifting values
  - Builds trace codes to fill hierarchical identifiers, mirroring the Python prototype's logic
- **Pruning columns**: After restructuring, columns 19–20 and 3–13 are stripped to match the expected export format
- **Aggregation** (`filterDanHitungTotal`): Computes totals per account code, deriving sums, realization percentages, and remaining budgets
- **Result bundle**: Returns `finalData`, per-row totals, preview slices, and a code→name map for UI lookup

### 2. Activity Management
- CRUD (Create, Read, Update, Delete) untuk kegiatan anggaran
- Manajemen alokasi anggaran
- Manajemen status kegiatan (Rencana, Komitmen, Outstanding, Terbayar)
- Upload dan manajemen file lampiran
- Activities (`Activity` type) hold planned actions with optional status and multiple `BudgetAllocation` entries
- `supabaseService.ts` exposes CRUD-style helpers:
  - `getActivities` fetches activities and nested allocations
  - `addActivity`, `updateActivity`, and `removeActivity` synchronize UI changes back to Supabase tables (`activities`, `allocations`)
- Fitur tambahan:
  - `getSetting` dan `saveSetting` untuk manajemen pengaturan pengguna
  - `getAllProcessedResults`, `getLatestProcessedResult`, dan `getProcessedResultById` untuk manajemen hasil pemrosesan Excel
  - `saveProcessedResult` untuk menyimpan hasil pemrosesan Excel ke database
- Fitur filter dan pencarian kegiatan berdasarkan tahun, bulan, status, dan nama kegiatan
- Fitur pagination untuk daftar kegiatan
- Fitur pengelompokan kegiatan berdasarkan bulan pelaksanaan
- Fitur penambahan metadata (tanggal realisasi, jenis laporan) saat upload Excel
- Fitur penghapusan riwayat pemrosesan Excel
- Fitur manajemen lampiran (upload, unduh, hapus) dengan dukungan berbagai format file
- Fitur alokasi anggaran berdasarkan kode akun dengan validasi sisa anggaran

### 3. AI Assistant
- Integrasi Google Gemini untuk analisis data
- Dukungan bahasa Indonesia
- Jawaban kontekstual berdasarkan data anggaran saat ini
- Query analisis cepat untuk pertanyaan umum
- Context-aware responses with data context
- Context-aware prompts built from current budget data
- Error handling with fallback model support
- Rate limiting and timeout management
- Fitur percakapan berbasis konteks (dengan riwayat percakapan)
- Fitur quick prompts untuk pertanyaan-pertanyaan umum
- Sanitasi output model AI untuk keamanan tampilan
- Pembuatan snapshot data otomatis sebagai konteks untuk AI
- Pembuatan prompt sistem yang dinamis berdasarkan data terbaru
- Fitur format pesan dengan dukungan markup sederhana (bold, line breaks)
- Pengelolaan error API key dan koneksi layanan AI

### 4. Authentication & Authorization
- Sistem autentikasi custom dengan batasan domain email @kemenkopmk.go.id
- Sistem role-based access (Admin, User, Viewer)
- Token JWT untuk manajemen session
- Cookie httpOnly untuk mencegah XSS

#### Feature Autentikasi
1. **Registrasi (Signup)**
   - Hanya email dengan domain `@kemenkopmk.go.id` yang diperbolehkan
   - Password minimal 6 karakter
   - Field: Nama, Email, Unit Kerja (opsional), Password

2. **Login**
   - Menggunakan email dan password
   - Validasi domain email
   - Session menggunakan JWT token (disimpan di cookie)

3. **Manajemen User (Admin Only)**
   - CRUD user (Create, Read, Update, Delete)
   - Pengaturan role: admin, user, viewer
   - Admin tidak bisa menghapus akun sendiri

#### Role & Permissions
| Role | Dashboard | Input Data | Kelola User |
|------|-----------|------------|-------------|
| Admin | ✅ | ✅ | ✅ |
| User | ✅ | ✅ | ❌ |
| Viewer | ✅ | ❌ | ❌ |

### 5. Data Visualization
- Tabel realisasi anggaran dengan struktur hierarki
- Kalkulasi real-time total dan sisa anggaran
- Ringkasan status kegiatan
- Hierarchical presentation:
  - `createHierarchy` constructs nested tree nodes keyed by dotted account codes
  - `flattenTree` converts that tree into flat rows annotated with metadata such as levels, visibility, and computed aggregates for grouped nodes
- Process history persistence:
  - Processed results are stored in Supabase table `processed_results` via `saveProcessedResult`
  - `getAllProcessedResults`/`getLatestProcessedResult` hydrate UI history dropdowns with formatted Indonesian locale timestamps
- Visualisasi progres realisasi dalam bentuk progress bar
- Rekapitulasi per akun (level 7) dengan visualisasi jumlah pagu, realisasi, dan sisa anggaran
- Fitur pencarian dan filter pada data tabel (dengan operator AND/OR)
- Fitur ekspansi/kolaps node pada struktur hierarki
- Fitur pengaturan kedalaman tampilan hierarki (level 1-8)
- Fitur tampilan berdasarkan jenis realisasi (laporan, outstanding, komitmen)
- Fitur download hasil pemrosesan dalam format Excel
- Fitur tampilan kolom yang dapat diubah untuk menyesuaikan kebutuhan
- Fitur ringkasan visual untuk kebutuhan manajerial

## Struktur Database (Supabase)

### Core Tables
- **users**: Email, password_hash, role, name, unit, timestamps
  - id uuid not null default gen_random_uuid ()
  - email text not null
  - password_hash text not null
  - role text not null default 'user'::text
  - created_at timestamp with time zone null default now()
  - name text null
  - unit text null
  - constraint users_pkey primary key (id)
  - constraint users_email_key unique (email)
  - index: users_email_idx on public.users using btree (email)

- **processed_results**: Excel data storage with metadata
  - id uuid (primary key)
  - file_name (text): nama file yang diproses
  - processed_data (jsonb): data hasil pemrosesan Excel
  - totals (jsonb): total anggaran
  - account_name_map (jsonb): pemetaan kode akun ke nama
  - report_type (text): jenis laporan (Akrual/SP2D)
  - report_date (text): tanggal laporan
  - user_id (uuid): id pengguna yang mengunggah
  - created_at timestamp with time zone default now()

- **activities**: Budget activity management
  - id uuid (primary key)
  - nama (text): nama kegiatan
  - status (text): status kegiatan (Rencana, Komitmen, Outstanding, Terbayar)
  - tanggal_pelaksanaan (text): tanggal pelaksanaan kegiatan
  - tujuan_kegiatan (text): tujuan kegiatan
  - kl_unit_terkait (text): kementerian/lembaga/unit terkait
  - penanggung_jawab (text): penanggung jawab kegiatan
  - capaian (text): capaian kegiatan
  - pending_issue (text): permasalahan yang belum selesai
  - rencana_tindak_lanjut (text): rencana tindak lanjut
  - user_id (uuid): id pengguna yang membuat
  - created_at timestamp with time zone default now()

- **allocations**: Budget allocation details for activities
  - id uuid (primary key)
  - activity_id (uuid): foreign key ke tabel activities
  - kode (text): kode akun anggaran
  - uraian (text): uraian alokasi
  - jumlah (numeric): jumlah dana yang dialokasikan

- **activity_attachments**: File attachment references
  - attachmentId (text): ID unik lampiran
  - activityId (text): ID kegiatan terkait
  - fileName (text): nama file
  - storedFileName (text): nama file yang disimpan
  - filePath (text): path file
  - uploadedAt (text): tanggal unggah

- **user_settings**: Pengaturan pengguna
  - id uuid (primary key)
  - user_id (uuid): foreign key ke tabel users
  - key (text): kunci pengaturan
  - value (text): nilai pengaturan
  - updated_at timestamp with time zone default now()

### Setup Database
```sql
-- Buat tabel users
create table public.users (
  id uuid not null default gen_random_uuid (),
  email text not null,
  password_hash text not null,
  role text not null default 'user'::text,
  created_at timestamp with time zone null default now(),
  name text null,
  unit text null,
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email)
) tablespace pg_default;

-- Buat index untuk email
create index if not exists users_email_idx 
on public.users using btree (email) 
tablespace pg_default;

-- Buat tabel processed_results untuk menyimpan hasil pemrosesan Excel
create table public.processed_results (
  id uuid not null default gen_random_uuid (),
  file_name text,
  processed_data jsonb,
  totals jsonb,
  account_name_map jsonb,
  report_type text,
  report_date text,
  user_id uuid references public.users(id),
  created_at timestamp with time zone null default now(),
  constraint processed_results_pkey primary key (id)
) tablespace pg_default;

-- Buat tabel activities untuk manajemen kegiatan
create table public.activities (
  id uuid not null default gen_random_uuid (),
  nama text not null,
  status text,
  tanggal_pelaksanaan text,
  tujuan_kegiatan text,
  kl_unit_terkait text,
  penanggung_jawab text,
  capaian text,
  pending_issue text,
  rencana_tindak_lanjut text,
  user_id uuid references public.users(id),
  created_at timestamp with time zone null default now(),
  constraint activities_pkey primary key (id)
) tablespace pg_default;

-- Buat tabel allocations untuk alokasi anggaran kegiatan
create table public.allocations (
  id uuid not null default gen_random_uuid (),
  activity_id uuid references public.activities(id) on delete cascade,
  kode text,
  uraian text,
  jumlah numeric,
  constraint allocations_pkey primary key (id)
) tablespace pg_default;

-- Buat tabel user_settings untuk menyimpan preferensi pengguna
create table public.user_settings (
  id uuid not null default gen_random_uuid (),
  user_id uuid references public.users(id) on delete cascade,
  key text not null,
  value text,
  updated_at timestamp with time zone null default now(),
  constraint user_settings_pkey primary key (id),
  constraint user_settings_unique_key_per_user unique (user_id, key)
) tablespace pg_default;
```

## Security Features
- Validasi domain email @kemenkopmk.go.id di frontend dan backend
- Hashing password dengan bcrypt dengan salt rounds 10
- Session management dengan JWT token
- File upload validation dan path traversal protection
- CORS configuration untuk cross-origin requests
- JWT Token disimpan di httpOnly cookie untuk mencegah XSS
- Protected Routes dilindungi dengan middleware autentikasi
- Role-Based Access admin-only routes untuk manajemen user
- Service Role Key memiliki akses penuh ke database dan bypass semua RLS policies

### Keamanan Tambahan
- Password Hashing: Menggunakan bcrypt dengan salt rounds 10
- JWT Token: Token disimpan di httpOnly cookie untuk mencegah XSS
- Domain Validation: Hanya email @kemenkopmk.go.id yang diperbolehkan
- Protected Routes: Route dilindungi dengan middleware autentikasi
- Role-Based Access: Admin-only routes untuk manajemen user
- File type validation for Excel files only
- Path traversal protection in file serving
- Metadata-based access control for attachments
- Directory isolation per activity
- Sanitasi input untuk mencegah XSS dan injection
- Validasi token JWT di sisi server
- Penanganan error yang tidak bocor informasi sensitif ke klien
- CORS configuration yang terbatas pada domain yang diizinkan
- CSRF protection melalui kombinasi cookie HTTP-only dan validasi token
- Validasi dan sanitasi konten file upload
- Server-side validation untuk semua input pengguna

## Setup Development
### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment Variables
Salin `.env.example` ke `.env` dan isi dengan nilai yang sesuai:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
GEMINI_API_KEY=your-gemini-api-key-here
JWT_SECRET=ganti-dengan-string-random-yang-aman
```

### 3. Setup Database di Supabase
Buka Supabase Dashboard → SQL Editor, lalu jalankan query berikut:
```sql
-- Buat tabel users
create table public.users (
  id uuid not null default gen_random_uuid (),
  email text not null,
  password_hash text not null,
  role text not null default 'user'::text,
  created_at timestamp with time zone null default now(),
  name text null,
  unit text null,
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email)
) tablespace pg_default;

-- Buat index untuk email
create index if not exists users_email_idx 
on public.users using btree (email) 
tablespace pg_default;
```

### 4. Buat Admin Pertama
Jalankan script untuk membuat admin:
```bash
npm run create-admin
```

Anda akan diminta memasukkan:
- SUPABASE_URL (dari file .env)
- SUPABASE_ANON_KEY (dari file .env)
- Nama admin
- Email admin (harus @kemenkopmk.go.id)
- Unit kerja (opsional)
- Password (minimal 6 karakter)

### 5. Jalankan Aplikasi
```bash
npm run dev
```

Aplikasi akan berjalan di:
- **Frontend (Client)**: http://localhost:5173
- **API Server**: http://localhost:3001
- **Auth Server**: http://localhost:3002

### Alur Kerja Pengembangan (Development Workflow)
Aplikasi ini menggunakan Vite untuk server pengembangan frontend, yang dilengkapi dengan fitur **Hot Module Replacement (HMR)**.

- **Tidak Perlu `npm run build` untuk Pengembangan**: Perintah `npm run build` hanya untuk membuat versi produksi. Saat pengembangan, cukup jalankan `npm run dev`.
- **Perubahan Kode Otomatis**: Setiap kali Anda menyimpan perubahan pada file kode sumber (misalnya, file `.tsx` atau `.js`), Vite akan secara otomatis memperbarui aplikasi di browser Anda secara instan, seringkali tanpa perlu me-refresh halaman.
- **Kapan Perlu Restart?**: Anda **hanya perlu** menghentikan (`Ctrl + C`) dan menjalankan kembali `npm run dev` jika Anda melakukan perubahan pada file-file konfigurasi, seperti:
  - `vite.config.ts`
  - `tailwind.config.js`
  - `.env`
  - Perubahan pada file server Node.js (`server/*.js`) juga memerlukan restart.

## Production Deployment
### Prerequisites
1. **Node.js 18+** installed
2. **PM2** installed globally: `npm install -g pm2`
3. **Built frontend**: Run `npm run build` (already done)
4. **Production environment variables** configured in `.env` file

### Quick Start
1. Configure Environment Variables
```bash
# Copy the production template
cp .env.production .env

# Edit .env with your actual values:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - GEMINI_API_KEY
# - JWT_SECRET (generate secure random string)
# - CORS_ORIGIN (your production domain)
```

2. Start Production Application
```bash
# Option 1: Use the startup script
npm start
# or
./start-production.sh

# Option 2: Use PM2 directly
pm2 start ecosystem.config.js
```

### Updating the Application
To update the production website, you do not need to push changes to a Git repository first. The process is done directly on the server:
1.  **Get Latest Code**: Pull the latest changes from the repository.
    ```bash
    git pull origin main
    ```
2.  **Install Dependencies**: Install or update any required packages.
    ```bash
    npm install
    ```
3.  **Rebuild Frontend**: Create a new production build of the frontend.
    ```bash
    npm run build
    ```
4.  **Restart Services**: Restart the application using PM2 to apply changes.
    ```bash
    npm run pm2:restart
    ```

### Available NPM Scripts
```bash
# Production Management
npm start          # Start all services with PM2
npm stop           # Stop all services
npm run pm2:status # Check PM2 process status
npm run pm2:logs   # View all logs
npm run pm2:restart # Restart all services
npm run pm2:stop   # Stop all PM2 services

# Development
npm run dev        # Start development servers
npm run build      # Build for production

# Utilities
npm run create-admin # Create initial admin user
npm run check-env    # Validate environment configuration
```

## Environment Variables

### Required Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJ...` |
| `GEMINI_API_KEY` | Google Gemini AI API key | `AIza...` |
| `JWT_SECRET` | JWT signing secret | `random-64-char-string` |

### Optional Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `CORS_ORIGIN` | Production domain for CORS | `http://localhost:3000` |
| `NODE_ENV` | Node environment | `production` |
| `ACTIVITY_SERVER_PORT` | Activity server port | `3001` |

## Migrasi ke Database Lokal
Sistem ini dirancang agar mudah dimigrasikan ke database lokal:
1. Ganti Supabase client di `server/auth-server.js` dengan koneksi database lokal (PostgreSQL, MySQL, dll)
2. Update query sesuai dengan driver database yang digunakan
3. Tidak perlu mengubah frontend karena komunikasi melalui REST API

Contoh untuk PostgreSQL lokal:
```javascript
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'your_db',
  user: 'your_user',
  password: 'your_password'
});
```

## Security Considerations

### Input Validation & Sanitization
- Semua endpoint harus dilengkapi dengan validasi input untuk mencegah injection attacks
- File upload harus melalui validasi ekstensi dan ukuran file
- Input dari AI service perlu disanitasi sebelum ditampilkan di UI

### Rate Limiting
- Implementasi rate limiting untuk endpoint AI (Gemini) untuk mencegah biaya tinggi akibat penggunaan berlebihan
- Endpoint autentikasi perlu dilindungi dari brute force attack

### Error Handling & Monitoring

#### Error Handling Strategy
- Penanganan error secara konsisten di seluruh layer aplikasi (frontend dan backend)
- Pembungkus error handler untuk logging dan feedback pengguna
- Penanganan khusus untuk kegagalan koneksi ke Supabase dan Gemini AI

#### Logging Strategy
- Logging aktivitas penting seperti login, perubahan data penting, dan error
- Penyimpanan log dengan retensi yang sesuai kebijakan
- Pemantauan error secara real-time

## Testing Strategy

### Testing Framework
- Unit testing untuk fungsi-fungsi penting di `excelProcessor.ts`
- Integration testing untuk endpoint API
- End-to-end testing untuk alur bisnis utama

### Testing Coverage
- Target minimum 80% code coverage untuk fungsi-fungsi kritis
- Testing untuk berbagai format dan jenis file Excel
- Testing untuk skenario error dan edge cases

## Troubleshooting

### Common Issues
- **Error: "Token tidak ditemukan"**: Pastikan cookie diaktifkan di browser, cek apakah auth server berjalan di port 3002
- **Error: "Hanya email dengan domain @kemenkopmk.go.id yang diperbolehkan"**: Pastikan email yang digunakan memiliki domain yang benar, cek validasi di `server/auth-server.js` jika perlu mengubah domain
- **Error: "Akses ditolak. Hanya admin yang dapat mengakses"**: Pastikan user memiliki role 'admin' di database, cek di tabel users: `SELECT * FROM users WHERE email = 'your-email@kemenkopmk.go.id';`
- **PM2 not found**: `npm install -g pm2`
- **Port conflicts**: 
```bash
# Check what's using the ports
netstat -tulpn | grep :3001
netstat -tulpn | grep :3002
netstat -tulpn | grep :5173

# Kill conflicting processes
kill -9 <PID>
```
- **Database connection issues**: Pastikan variabel lingkungan untuk Supabase sudah benar
- **AI service errors**: Cek apakah kunci API Gemini valid dan layanan tersedia

## Testing Ideas
- Unit-test `processExcelData` with fixture tables to lock down transformations
- Add integration tests for `createHierarchy`/`flattenTree` to ensure expand/collapse totals remain consistent
- Mock Supabase in UI tests to verify activity CRUD flows without network calls
- Unit tests for `fetchAiResponse` with different input scenarios
- Integration tests for file upload and processing workflows
- End-to-end tests for authentication and authorization flows
- Tests for data validation and error handling in all API calls
- Component tests for UI interaction patterns

## Production Checklist
- [ ] Environment variables configured
- [ ] Frontend built (`dist/` folder exists)
- [ ] PM2 installed globally
- [ ] Logs directory created
- [ ] Initial admin user created (if needed)
- [ ] Firewall configured for required ports
- [ ] Reverse proxy configured (nginx/apache)
- [ ] SSL certificate installed (for HTTPS)
- [ ] Domain DNS configured
- [ ] Database backups configured
- [ ] Error monitoring system implemented
- [ ] Health check endpoints available for monitoring
- [ ] Rate limiting configured for API endpoints
- [ ] Regular security scanning scheduled

## Keamanan Tambahan untuk Production
1. **Environment Variables**: Never commit `.env` file to version control
2. **JWT Secret**: Generate a cryptographically secure random string
3. **CORS**: Configure `CORS_ORIGIN` for your production domain
4. **Service Role Key**: Keep `SUPABASE_SERVICE_ROLE_KEY` secure (server-side only)
5. Gunakan environment variables yang aman
6. Rotate keys secara berkala
7. Monitor access logs di Supabase Dashboard
8. Gunakan HTTPS untuk semua requests
9. Implementasikan rate limiting di server

## Cara Menggunakan

### Registrasi User Pertama
1. Buka http://localhost:5173/signup
2. Isi form dengan email @kemenkopmk.go.id
3. Klik "Daftar"
4. Setelah berhasil, login di http://localhost:5173/login

### Membuat Admin Pertama
Karena user pertama akan memiliki role 'user' secara default, Anda perlu mengubahnya menjadi 'admin' secara manual di database:
```sql
UPDATE users 
SET role = 'admin' 
WHERE email = 'email-anda@kemenkopmk.go.id';
```

Setelah itu, admin bisa mengelola user lain melalui halaman `/users`.

### Akses Halaman Manajemen User
1. Login sebagai admin
2. Klik tombol "Kelola User" di header
3. Atau akses langsung http://localhost:5173/users

## Tujuan Proyek
Membantu Kemenkop UKM dalam:
- Mengelola dan menganalisis data realisasi anggaran
- Mempermudah proses pelaporan dan monitoring anggaran
- Meningkatkan efisiensi dalam pengolahan data Excel kompleks
- Memberikan wawasan melalui AI yang terintegrasi

This implementation represents a **production-ready, enterprise-grade application** specifically designed for Indonesian government budget management, with robust security, sophisticated data processing capabilities, and modern web development practices.