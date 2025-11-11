# Rangkuman Proyek SAPA AI - Smart Analytics Platform

## Ikhtisar Aplikasi
- Platform web internal Kemenko PMK untuk memproses file Excel realisasi anggaran (SAKTI), mengelola kegiatan, dan menyajikan analitik.
- Stack utama: React 19 + TypeScript (frontend), Node/Express microservices (auth & activity upload), Supabase (database), Vite (build), TailwindCSS (UI), integrasi Google Gemini API (AI).
- Tiga servis utama: frontend (5173), auth API (3002), activity/upload API (3001). Vite proxy dan konfigurasi CORS mengatur komunikasi antar-servis.

## Modul Fungsional Utama
- **Pemrosesan Excel** (`src/services/excelProcessor.ts`): membaca workbook lewat SheetJS, membersihkan dan menormalisasi kode/uraian, menghitung metrik, serta menyiapkan data untuk unduhan. Hasil akhir disimpan ke Supabase (`processed_results`) via `src/services/supabaseService.ts`.
- **Manajemen Kegiatan**: CRUD aktivitas lengkap dengan status (Rencana/Komitmen/Outstanding/Terbayar), metadata detail, alokasi anggaran berhirarki, pagination, filter, pencarian, dan dukungan unggah lampiran (PDF/DOC/XLS/JPG/PNG).
- **AI Chat Assistant**: `src/components/AIChatModal.tsx`, `FloatingAIButton`, dan `src/services/aiService.ts` menangani percakapan dengan Gemini. Fitur mencakup context-aware conversation, fallback multi-model, quick prompts, serta integrasi dengan aktivitas.
- **Dashboard & Visualisasi**: panel ringkasan, tren bulanan, komposisi per akun, dan chart penyerapan anggaran dengan tooltip interaktif (Chart.js + react-chartjs-2 + chartjs-plugin-datalabels).

## Alur Data End-to-End
1. **Upload Excel** -> `parseExcelFile()` membaca sheet, normalisasi menghapus kolom tak relevan, memetakan hierarki kode, dan menyusun `ProcessingResult`.
2. **Persistensi** -> `supabaseService` menyimpan data terolah beserta totals dan peta nama akun ke Supabase.
3. **Dashboard** -> hook `useHistoricalData` memuat koleksi `MonthlyReport`; `MonthlyAnalyticsPanel` mengelompokkan data per uraian, membagi realisasi vs sisa, lalu menyiapkan dataset dan tooltip.
4. **AI Context** -> `aiActivityPrompts.ts` mendeteksi jenis pertanyaan, menjalankan query paralel (`activityQueryService.ts`), menyusun konteks statistik/kegiatan, dan menambahkan ke prompt sebelum memanggil Gemini.
5. **Lampiran** -> `activityAttachmentService.ts` berinteraksi dengan activity-upload-server (metadata JSON + filesystem terisolasi per aktivitas) untuk unggah, unduh, dan hapus lampiran.

## Integrasi AI dan Otomasi
- **Deteksi Query**: regex dan kata kunci membedakan TODAY/TOMORROW/THIS_WEEK/NEXT_WEEK/OVERDUE/STATISTICS; quick prompt tersedia di UI.
- **Pembangun Konteks**: `buildActivityContext` menjalankan `Promise.all` untuk mengambil aktivitas hari ini/minggu ini/minggu depan/overdue/statistik sekaligus, kemudian memformat ringkasan yang siap digabung ke system prompt.
- **Prompt Enhancement**: `createActivityEnhancedPrompt` menggabungkan sistem prompt bawaan dengan konteks data dan instruksi balasan berbahasa Indonesia.
- **Auto-fill Form**: `handleAutoFillFromPdf` mengekstrak teks dari lampiran PDF memakai `pdfjs-dist`, mengirim instruksi JSON ke Gemini, lalu mengisi field kegiatan (dengan review manual sebelum simpan). Error handling dan progress step-by-step tersedia.
- **Keamanan AI**: sanitasi input/output, logging model terakhir, pembatasan ukuran konteks, dan rencana rate limiting untuk endpoint AI.

## Infrastruktur & Konfigurasi
- File konfigurasi: `.env.example` sebagai template; `.env.loc` untuk pengembangan; `.env.prod` untuk produksi. `vite.config.ts` otomatis memilih file berdasar mode build.
- Variabel penting: port (`AUTH_SERVER_PORT`, `ACTIVITY_SERVER_PORT`, `FRONTEND_PORT`), host, kredensial Supabase, kunci Gemini, direktori unggah, batas ukuran file, daftar email admin.
- Manajemen proses produksi memakai PM2 (`ecosystem.config.cjs`, `scripts/start-production.sh`, `scripts/stop-production.sh`). `npm run check-env` membantu validasi environment.
- Praktik keamanan: JWT secret kuat, cookie secure + domain khusus di produksi, whitelist CORS, dan larangan penggunaan service-role key di sisi klien.

## Proses Visualisasi Penyerapan Anggaran
- `MonthlyAnalyticsPanel` menarik `AccountLevel7Data`, mengelompokkan berdasarkan uraian, menghitung sisa serta persentase serapan, kemudian menyortir berdasarkan pagu.
- Chart horizontal stacked menampilkan perbandingan realisasi vs sisa. Warna menandakan status kesehatan: >=75% sehat, 50-74% perlu perhatian, <50% kritis.
- Tooltip kustom memanfaatkan `originalData` untuk menampilkan uraian, pagu, realisasi, sisa, persentase, dan status kesehatan; data label menampilkan nominal jutaan dan persentase langsung di batang.

## Migrasi & Operasional Produksi
- Alur migrasi: salin `.env.example` menjadi `.env.prod`, isi nilai produksi (domain `sapa.kemenkopmk.go.id`, konfigurasi cookie secure, CORS, kunci Gemini), jalankan `npm run build`, lalu `npm run start:prod` (atau skrip `start` yang mem-boot API dan auth server).
- Troubleshooting umum: konflik port (ubah di `.env`), error CORS (tambahkan origin), cookie bermasalah (pastikan opsi secure/domain), kunci Gemini (sinkronkan variabel frontend dan server).
- Workflow dev -> prod: gunakan `npm run dev:local` saat pengembangan, jalankan lint/format, build, verifikasi via `npm run preview`, deploy artefak ke server, kemudian hidupkan proses PM2.

## Ringkasan Refactor & Kualitas Kode
- Refactor terkini menghasilkan 0 lint error (ESLint v9 + Prettier), menambahkan virtualisasi tabel (`react-window`), memoization, lazy loading, serta type definitions global.
- Script tooling diperluas (`npm run lint`, `lint:fix`, `format`, `validate`), TypeScript configuration diperketat, dan build produksi telah diverifikasi.
- UI enhancement meliputi grafik penyerapan dengan label jelas, loading states yang konsisten, serta panel analitik yang lebih responsif.

## Masalah & Rekomendasi Prioritas
- **Keamanan**: pastikan JWT secret dan service-role key hanya digunakan di server; lengkapi sanitasi input/output; implementasikan rate limiting untuk request AI.
- **Maintainability**: `App.tsx` masih sangat besar; perlu dipecah menjadi komponen terpisah dan memindahkan business logic ke hooks/services khusus; kurangi duplikasi pemanggilan API.
- **Skalabilitas & Performa**: tambahkan caching & pagination di sisi server, optimalkan query Supabase, dan terapkan debouncing pencarian.
- **UX**: pastikan setiap operasi async memiliki loading state dan feedback error yang jelas; tambah validasi sisi klien untuk form utama.
- **Testing**: bangun unit, integration, dan E2E tests untuk pipeline Excel, query aktivitas, dan fitur AI; siapkan fondasi CI/CD.
- **Monitoring & Operasional**: lengkapi logging, endpoint health check, dan dokumentasi backup/recovery (termasuk rotasi kunci API).

## Rekomendasi Langkah Berikutnya
1. Memecah `App.tsx` menjadi modul modular serta memindahkan business logic ke hooks/services reusable.
2. Melengkapi sanitasi dan rate limiting, audit penggunaan kunci Supabase, dan menyiapkan guard ekstra untuk fitur AI.
3. Menambahkan testing (unit/integration/E2E) dan pipeline CI/CD agar build, lint, dan test berjalan otomatis.
4. Mengimplementasikan pagination dan caching backend untuk dataset besar, sekaligus merapikan pipeline Excel agar setiap langkah mudah diuji.
5. Menyusun SOP operasional (backup `.env.prod`, rotasi kunci, monitoring service) sehingga deployment berulang lebih terkontrol.

Dokumen ini menggantikan seluruh dokumentasi markdown sebelumnya; `README.md` tetap sebagai panduan utama proyek, sementara ringkasan ini memberi gambaran komprehensif kondisi kode dan rencana tindak lanjut.
