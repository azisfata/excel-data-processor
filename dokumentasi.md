# Dokumentasi Project Excel Data Processor

## Deskripsi Umum
Project **Excel Data Processor** adalah aplikasi web berbasis React yang dirancang untuk memproses, menganalisis, dan mengelola data realisasi anggaran dari file Excel. Aplikasi ini dikembangkan khusus untuk kebutuhan Kementerian Koperasi dan UKM Republik Indonesia dalam mengelola data realisasi SAKTI (Sistem Administrasi Keuangan Terpadu Indonesia) dan mengelola kegiatan serta alokasi anggaran.

## Arsitektur dan Teknologi

### Teknologi Utama:
- **Frontend**: React 19.1.11 (TypeScript)
- **Backend**: Node.js/Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT-based dengan role-based access
- **File Processing**: xlsx.js untuk pemrosesan Excel
- **AI Integration**: Google Gemini API untuk asisten cerdas
- **Styling**: Tailwind CSS
- **Build Tool**: Vite

### Struktur Aplikasi:
- **Tiga Server**:
  1. Client (React/Vite) - Port 5173
  2. Auth Server - Port 3002
  3. Activity Upload Server - Port 3001

## Fitur Utama

### 1. Pemrosesan File Excel
- Upload file Excel (.xls/.xlsx) hasil realisasi SAKTI
- Pemrosesan otomatis untuk ekstraksi data anggaran
- Filter dan validasi data
- Penyimpanan riwayat pemrosesan

### 2. Manajemen Kegiatan
- CRUD kegiatan dengan status (Rencana, Komitmen, Outstanding, Terbayar)
- Alokasi anggaran ke kode akun spesifik
- Upload lampiran dokumen (PDF, DOC, XLS, JPG, PNG)
- Filter dan pencarian berdasarkan tahun, bulan, dan status

### 3. Visualisasi Data
- Tabel hierarki kode akun (level 1-8)
- Dashboard realisasi dan pagu anggaran
- Grafik progres realisasi
- Rekapitulasi per akun dengan detail pagu, realisasi, dan sisa anggaran

### 4. Sistem Otentikasi dan Otorisasi
- Login/registrasi berbasis email @kemenkopmk.go.id
- Role-based access (user, admin)
- Approval admin untuk user baru
- JWT untuk session management

### 5. Asisten AI Cerdas
- Integrasi Google Gemini API
- Kemampuan bertanya tentang data realisasi dan alokasi
- Respon berbasis data yang telah diproses
- Panduan untuk membuat dan memperbarui kegiatan

### 6. Pencarian dan Filter
- Pencarian cerdas dengan operator AND/OR
- Filter berdasarkan tahun, bulan, status kegiatan
- Filter berdasarkan level hierarki kode akun

## Struktur Data

### Tipe Utama:
- **Activity**: Data kegiatan dengan nama, status, tanggal pelaksanaan, detail, dan alokasi anggaran
- **BudgetAllocation**: Kode akun, uraian, dan jumlah alokasi
- **ActivityAttachment**: File lampiran terkait kegiatan
- **ProcessingResult**: Hasil pemrosesan file Excel dengan data final dan ringkasan

## Konfigurasi Lingkungan
- Dukungan variabel lingkungan untuk konfigurasi
- Supabase URL dan kunci anonim
- Google Gemini API key
- JWT Secret untuk autentikasi
- Daftar email admin otomatis

## Workflow Utama
1. **Upload dan Proses Excel**: Pengguna mengunggah file realisasi Excel, sistem memproses dan menyimpan ke Supabase
2. **Manajemen Kegiatan**: Pengguna membuat kegiatan dengan alokasi ke masing-masing kode akun
3. **Visualisasi**: Data ditampilkan dalam berbagai bentuk tabel dan ringkasan
4. **Interaksi AI**: Pengguna dapat bertanya tentang data melalui asisten AI
5. **Filter dan Cari**: Data dapat difilter berdasarkan berbagai kriteria

## Keamanan
- Pembatasan akses hanya untuk email domain @kemenkopmk.go.id
- Role-based access control
- Validasi input di frontend dan backend
- Penggunaan JWT untuk session management
- Service role key Supabase untuk operasi server-side

## Deploy dan Manajemen
- Skrip PM2 untuk manajemen proses produksi
- Script pembuatan akun admin
- Sistem backup dan histori pemrosesan
- Konfigurasi CORS untuk multiple origins

## Penyimpanan
- Data Excel diproses dan disimpan di Supabase
- File lampiran disimpan di sistem file lokal
- Metadata lampiran disimpan di JSON file
- Riwayat pemrosesan disimpan dengan metadata lengkap

## Kontribusi
Project ini dirancang untuk memenuhi kebutuhan internal Kementerian Koperasi dan UKM dalam manajemen data realisasi anggaran, dengan fokus pada kemudahan penggunaan, keakuratan data, dan integrasi dengan sistem AI untuk analisis data.