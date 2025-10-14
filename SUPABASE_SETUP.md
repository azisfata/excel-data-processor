# Setup Supabase untuk Autentikasi Custom

## Langkah 1: Mendapatkan API Keys

### 1.1 Buka Supabase Dashboard
1. Login ke https://supabase.com
2. Pilih project Anda
3. Klik **Settings** (ikon gear) di sidebar kiri
4. Pilih **API**

### 1.2 Copy API Keys
Anda akan melihat beberapa keys:

**Project URL:**
```
https://xxxxxxxxxxxxx.supabase.co
```
Copy ini ke `.env` sebagai `VITE_SUPABASE_URL`

**anon/public key:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6...
```
Copy ini ke `.env` sebagai `VITE_SUPABASE_ANON_KEY`

**service_role key:** ⚠️ **RAHASIA - JANGAN EXPOSE DI FRONTEND!**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6...
```
Copy ini ke `.env` sebagai `SUPABASE_SERVICE_ROLE_KEY`

## Langkah 2: Setup Database

### 2.1 Buat Tabel Users
1. Di Supabase Dashboard, klik **SQL Editor**
2. Klik **New Query**
3. Copy-paste SQL berikut:

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

4. Klik **Run** atau tekan `Ctrl+Enter`

### 2.2 Setup Row Level Security (RLS)

**PENTING:** Karena kita menggunakan autentikasi custom (bukan Supabase Auth), kita perlu disable RLS atau membuat policy khusus.

#### Opsi A: Disable RLS (Lebih Mudah untuk Development)

```sql
-- Disable RLS untuk tabel users
alter table public.users disable row level security;
```

#### Opsi B: Buat Policy untuk Service Role (Lebih Aman)

```sql
-- Enable RLS
alter table public.users enable row level security;

-- Policy: Allow service_role to do everything
create policy "Service role can do everything"
on public.users
for all
to service_role
using (true)
with check (true);

-- Policy: Allow authenticated users to read their own data
create policy "Users can read own data"
on public.users
for select
to authenticated
using (auth.uid()::text = id::text);
```

**Catatan:** Karena kita menggunakan JWT custom (bukan Supabase Auth), lebih mudah menggunakan **Opsi A** untuk development. Untuk production, gunakan service_role key di server dan jangan expose ke frontend.

## Langkah 3: Update File .env

Buka file `.env` dan isi dengan nilai yang sesuai:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase Service Role Key (untuk server-side operations)
# PENTING: Jangan expose key ini di frontend!
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# JWT Secret for Authentication
JWT_SECRET=your-secret-key-change-this-in-production

# Admin User (for initial setup)
ADMIN_EMAILS=azisfata@kemenkopmk.go.id
```

## Langkah 4: Buat Admin Pertama

Jalankan script untuk membuat admin:

```bash
npm run create-admin
```

Anda akan diminta memasukkan:
- Nama admin
- Unit kerja (opsional)
- Password (minimal 6 karakter)

Email akan otomatis diambil dari `ADMIN_EMAILS` di file `.env`.

## Langkah 5: Jalankan Aplikasi

```bash
npm run dev
```

Aplikasi akan berjalan di:
- Frontend: http://localhost:5173
- Auth Server: http://localhost:3002
- API Server: http://localhost:3001

## Troubleshooting

### Error: "new row violates row-level security policy"

**Penyebab:** RLS aktif dan tidak ada policy yang mengizinkan insert.

**Solusi:**
1. Pastikan `SUPABASE_SERVICE_ROLE_KEY` sudah diset di `.env`
2. Atau disable RLS dengan SQL:
   ```sql
   alter table public.users disable row level security;
   ```

### Error: "Invalid API key"

**Penyebab:** API key salah atau tidak lengkap.

**Solusi:**
1. Cek kembali di Supabase Dashboard → Settings → API
2. Pastikan copy seluruh key (biasanya sangat panjang)
3. Pastikan tidak ada spasi di awal/akhir key

### Error: "relation 'users' does not exist"

**Penyebab:** Tabel users belum dibuat.

**Solusi:**
1. Jalankan SQL di Langkah 2.1
2. Refresh Supabase Dashboard
3. Cek di Table Editor apakah tabel `users` sudah ada

## Keamanan

### ⚠️ PENTING - Service Role Key

**Service Role Key** memiliki akses penuh ke database dan **bypass semua RLS policies**. 

**DO:**
- ✅ Gunakan di server-side (Node.js backend)
- ✅ Simpan di environment variables
- ✅ Tambahkan `.env` ke `.gitignore`
- ✅ Gunakan untuk scripts admin

**DON'T:**
- ❌ JANGAN expose di frontend/client code
- ❌ JANGAN commit ke Git
- ❌ JANGAN share dengan orang lain
- ❌ JANGAN hardcode di source code

### Untuk Production

1. Gunakan environment variables yang aman
2. Rotate keys secara berkala
3. Monitor access logs di Supabase Dashboard
4. Gunakan HTTPS untuk semua requests
5. Implementasikan rate limiting di server

## Migrasi ke Database Lokal (Future)

Ketika siap migrasi ke database lokal:

1. Export schema dari Supabase:
   ```bash
   supabase db dump -f schema.sql
   ```

2. Import ke PostgreSQL lokal:
   ```bash
   psql -U postgres -d your_db -f schema.sql
   ```

3. Update `server/auth-server.js`:
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

4. Ganti semua query Supabase dengan query PostgreSQL native

## Support

Jika masih ada masalah, cek:
1. Supabase Dashboard → Logs untuk error messages
2. Browser Console untuk frontend errors
3. Terminal untuk server errors
