# Panduan Setup Aplikasi Excel Data Processor

## Langkah-langkah Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment Variables

Salin file `.env.example` menjadi `.env`:
```bash
copy .env.example .env
```

Kemudian edit file `.env` dan isi dengan nilai yang sesuai:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
GEMINI_API_KEY=your-gemini-api-key-here
JWT_SECRET=ganti-dengan-string-random-yang-aman
```

**PENTING untuk JWT_SECRET**: 
- Untuk development, bisa menggunakan string random apa saja
- Untuk production, gunakan string yang sangat aman dan random
- Contoh generate JWT_SECRET yang aman:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
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

### 6. Login Pertama Kali

1. Buka browser dan akses http://localhost:5173
2. Anda akan diarahkan ke halaman login
3. Masukkan email dan password admin yang telah dibuat
4. Setelah login, Anda bisa mengakses:
   - Dashboard utama (/)
   - Manajemen User (/users) - khusus admin

## Fitur Aplikasi

### Autentikasi
- ✅ Registrasi user baru (hanya email @kemenkopmk.go.id)
- ✅ Login dengan email dan password
- ✅ Logout
- ✅ Protected routes (halaman yang memerlukan login)

### Manajemen User (Admin Only)
- ✅ Lihat daftar semua user
- ✅ Tambah user baru
- ✅ Edit user (nama, unit, role, password)
- ✅ Hapus user (kecuali diri sendiri)
- ✅ Atur role: admin, user, viewer

### Dashboard
- ✅ Upload dan proses file Excel
- ✅ Lihat realisasi anggaran
- ✅ Kelola kegiatan
- ✅ AI Assistant untuk analisis data

## Role & Permissions

| Role | Dashboard | Input Data | Kelola User |
|------|-----------|------------|-------------|
| Admin | ✅ | ✅ | ✅ |
| User | ✅ | ✅ | ❌ |
| Viewer | ✅ | ❌ | ❌ |

## Troubleshooting

### Error: "Cannot find module"
```bash
npm install
```

### Error: "Port already in use"
Matikan aplikasi yang menggunakan port 3001, 3002, atau 5173:
```bash
# Windows
netstat -ano | findstr :3001
netstat -ano | findstr :3002
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### Error: "Token tidak ditemukan"
- Pastikan auth server berjalan di port 3002
- Cek apakah cookie diaktifkan di browser
- Coba logout dan login kembali

### Error: "Hanya email dengan domain @kemenkopmk.go.id yang diperbolehkan"
- Pastikan email yang digunakan memiliki domain @kemenkopmk.go.id
- Jika perlu mengubah domain, edit file `server/auth-server.js` pada fungsi `isValidEmail`

### Error saat membuat admin
- Pastikan tabel `users` sudah dibuat di Supabase
- Pastikan SUPABASE_URL dan SUPABASE_ANON_KEY benar
- Cek apakah email sudah terdaftar sebelumnya

## Struktur Folder

```
excel-data-processor/
├── server/
│   ├── activity-upload-server.js  # Server untuk upload file
│   └── auth-server.js             # Server autentikasi
├── src/
│   ├── components/
│   │   └── ProtectedRoute.tsx     # HOC untuk protected routes
│   ├── contexts/
│   │   └── AuthContext.tsx        # Context autentikasi
│   ├── pages/
│   │   ├── LoginPage.tsx          # Halaman login
│   │   ├── SignupPage.tsx         # Halaman registrasi
│   │   └── UserManagementPage.tsx # Halaman manajemen user
│   ├── services/                  # Services untuk API calls
│   ├── utils/                     # Utility functions
│   ├── index.css                  # Global styles
│   └── main.tsx                   # Entry point
├── scripts/
│   └── create-admin.js            # Script membuat admin
├── App.tsx                        # Main app component
├── package.json
├── vite.config.ts
├── .env.example
└── AUTH_README.md
```

## Keamanan

1. **Jangan commit file `.env`** ke Git
2. **Ganti JWT_SECRET** dengan string yang aman untuk production
3. **Gunakan HTTPS** untuk production
4. **Backup database** secara berkala
5. **Update dependencies** secara berkala untuk patch keamanan

## Migrasi ke Database Lokal (Future)

Sistem ini dirancang agar mudah dimigrasikan ke database lokal:

1. Install PostgreSQL lokal
2. Import schema dari Supabase
3. Update `server/auth-server.js`:
   - Ganti Supabase client dengan pg/mysql client
   - Update semua query sesuai driver database
4. Tidak perlu mengubah frontend

## Support

Jika ada pertanyaan atau masalah, silakan hubungi tim development.
