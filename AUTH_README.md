# Sistem Autentikasi Custom

## Fitur

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

## Struktur File

### Backend (Server)
- `server/auth-server.js` - Server autentikasi (port 3002)
  - POST `/api/auth/signup` - Registrasi user baru
  - POST `/api/auth/login` - Login user
  - POST `/api/auth/logout` - Logout user
  - GET `/api/auth/me` - Get current user
  - GET `/api/users` - Get all users (admin only)
  - POST `/api/users` - Create user (admin only)
  - PUT `/api/users/:id` - Update user (admin only)
  - DELETE `/api/users/:id` - Delete user (admin only)

### Frontend (React)
- `src/contexts/AuthContext.tsx` - Context untuk state autentikasi
- `src/pages/LoginPage.tsx` - Halaman login
- `src/pages/SignupPage.tsx` - Halaman registrasi
- `src/pages/UserManagementPage.tsx` - Halaman manajemen user
- `src/components/ProtectedRoute.tsx` - HOC untuk protected routes
- `src/main.tsx` - Setup routing

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment Variables
Salin `.env.example` ke `.env` dan isi dengan nilai yang sesuai:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
JWT_SECRET=your-secret-key-change-this-in-production
```

**PENTING**: Ganti `JWT_SECRET` dengan string random yang aman untuk production!

### 3. Setup Database
Pastikan tabel `users` sudah dibuat di Supabase dengan schema:
```sql
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
);

create index IF not exists users_email_idx on public.users using btree (email);
```

### 4. Jalankan Aplikasi
```bash
npm run dev
```

Ini akan menjalankan:
- Client (Vite) di port 5173
- API Server di port 3001
- Auth Server di port 3002

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

## Role & Permissions

- **Admin**: Akses penuh, bisa mengelola user
- **User**: Akses dashboard dan input data
- **Viewer**: Read-only access

## Keamanan

1. **Password Hashing**: Menggunakan bcrypt dengan salt rounds 10
2. **JWT Token**: Token disimpan di httpOnly cookie untuk mencegah XSS
3. **Domain Validation**: Hanya email @kemenkopmk.go.id yang diperbolehkan
4. **Protected Routes**: Route dilindungi dengan middleware autentikasi
5. **Role-Based Access**: Admin-only routes untuk manajemen user

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

## Troubleshooting

### Error: "Token tidak ditemukan"
- Pastikan cookie diaktifkan di browser
- Cek apakah auth server berjalan di port 3002

### Error: "Hanya email dengan domain @kemenkopmk.go.id yang diperbolehkan"
- Pastikan email yang digunakan memiliki domain yang benar
- Cek validasi di `server/auth-server.js` jika perlu mengubah domain

### Error: "Akses ditolak. Hanya admin yang dapat mengakses"
- Pastikan user memiliki role 'admin' di database
- Cek di tabel users: `SELECT * FROM users WHERE email = 'your-email@kemenkopmk.go.id';`
