# Excel Processing Pipeline

Dokumen ini menjabarkan alur lengkap pengolahan Excel di SAPA AI, mulai dari berkas yang diunggah pengguna hingga data siap dianalisis dan diunduh kembali.

---

## 1. Titik Masuk Upload
- Komponen utama berada di `src/App.tsx:1354-1405`.
- `processFile()` dipanggil ketika pengguna men-drop `.xls/.xlsx`.
- Menggunakan `FileReader` untuk mendapatkan string biner dan memastikan sesi pengguna masih valid sebelum memulai proses.

## 2. Parsing Workbook
- Fungsi `parseExcelFile()` (`src/services/excelProcessor.ts:28-38`) memakai SheetJS (`XLSX.read`) untuk mengambil sheet pertama.
- Hasilnya berupa `ExcelData` (array of arrays) tanpa memaksa tipe sel sehingga deteksi kolom kosong tetap akurat.

## 3. Pembersihan Awal
- `muatDanBersihkanData()` (`src/services/excelProcessor.ts:103-145`) menghapus catatan kaki “Lock Pagu…”, memotong baris sebelum header *Program Dukungan Manajemen*, dan menghapus kolom yang seluruhnya kosong (`dropna axis=1, how='all'` versi JS).

## 4. Restrukturisasi Hirarki
- `prosesDanStrukturData()` (`src/services/excelProcessor.ts:151-242`) menggeser nilai agar kolom kode & uraian terisi.
- Menggunakan array `trace` untuk membentuk kembali kode hirarkis maksimal 8 level (program → kegiatan → akun 6 digit) sehingga baris kosong tetap “mewarisi” kode induknya.

## 5. Pemangkasan Kolom & Normalisasi
- Setelah restrukturisasi, pipeline menghapus kolom 19–20 lalu 3–13, menyisakan kode, uraian, dan lima kolom angka utama (`src/services/excelProcessor.ts:55-72`).
- `normalizeCodeAndDescription()` (`src/utils/dataNormalization.ts:30-59`) mendeteksi uraian berformat “123456. Deskripsi”, memastikan segmen 6 digit ikut tercantum di kode dan uraian dibersihkan.

## 6. Filter & Totals
- `filterDanHitungTotal()` (`src/services/excelProcessor.ts:248-298`) hanya mempertahankan baris dengan kedalaman kode penuh (8 segmen) dan segmen terakhir 6 digit (`isSixDigitSegment`).
- Lima kolom numerik dijumlahkan dengan parsing lokal Indonesia (hapus `.` ribuan, ubah `,` ke `.`) sehingga total akurat meski input berupa string.

## 7. Penyusunan `ProcessingResult`
- `processExcelData()` merangkai `ProcessingResult` (`src/services/excelProcessor.ts:45-97`):
  - `finalData`: tabel siap unduh.
  - `totals`: agregasi kolom.
  - `processedDataForPreview`: 100 baris pertama untuk tampilan cepat.
  - `accountNameMap`: peta kode level-7 → uraian (disusun via `deriveAccountNameMap()`).

## 8. Persistensi Supabase
- `saveProcessedResult()` (`src/services/supabaseService.ts:231-259`) menyimpan hasil ke tabel `processed_results` lengkap dengan metadata `report_type` & `report_date`.
- `buildProcessingResult()` (`src/services/supabaseService.ts:19-38`) menormalkan ulang data ketika histori diambil, memastikan konsistensi jika format baru diterapkan.

## 9. Konsumsi di Dashboard
- Hook `useProcessedMetrics()` (`src/hooks/useProcessedMetrics.ts:30-192`) menggabungkan `ProcessingResult` dengan alokasi kegiatan (status outstanding/komitmen) untuk menghitung ulang realisasi, progres, dan ringkasan akun level-7.
- `useHistoricalData()` dan panel analitik memakai data ini untuk visualisasi tren, serapan, serta context AI.

## 10. Ekspor Ulang ke Excel
- `downloadExcelFile()` (`src/services/excelProcessor.ts:305-360`) menambahkan header dinamis (label periode), menerapkan styling dasar SheetJS, lalu mengunduh file `*_processed.xlsx`.
- Dipanggil dari tombol unduh di UI (`src/App.tsx:1858-1866`).

---

### Ringkasan Alur
1. **Upload** → `processFile()` validasi user.
2. **Parsing** → `parseExcelFile()` menghasilkan `ExcelData`.
3. **Clean** → `muatDanBersihkanData()`.
4. **Structure** → `prosesDanStrukturData()`.
5. **Trim & Normalize** → hapus kolom, `normalizeCodeAndDescription()`.
6. **Filter & Aggregate** → `filterDanHitungTotal()`.
7. **Persist** → `saveProcessedResult()` (Supabase).
8. **Consume** → hook/historis memuat `ProcessingResult`.
9. **Export** → `downloadExcelFile()` untuk file olahan.

## Contoh Transformasi Data

| Tahap | Data Sebelum | Data Sesudah |
| --- | --- | --- |
| Pembersihan (`muatDanBersihkanData`) | `["*Lock Pagu adalah...", "", "", ...]` | Baris catatan kaki dihapus sepenuhnya sebelum proses lanjut. |
| Restrukturisasi (`prosesDanStrukturData`) | `["", "", "057.04", "1", "A", "057.04.1.A.524111 Belanja Barang Operasional", ...]` | `["057.04.1.A", "057.04.1.A.524111 Belanja Barang Operasional", ...]` — kolom kode/uraian terisi konsisten. |
| Normalisasi (`normalizeCodeAndDescription`) | `["057.04.1.A", "524111. Belanja Barang Operasional", 2_000_000, ...]` | `["057.04.1.A.524111", "Belanja Barang Operasional", 2_000_000, ...]`. |
| Filter akhir (`filterDanHitungTotal`) | `["057.04.1.A", "Belanja Barang Operasional", ...]` (kode belum 8 segmen) | Baris dibuang karena tidak memiliki segmen 6 digit di posisi terakhir. Hanya baris dengan kode seperti `1.2.3.4.5.6.7.524111` yang dipertahankan. |

### Cuplikan Dataset

```text
Input mentah (disederhanakan):
[
  ["", "", "057.04", "1", "A", "524111. Belanja Barang Operasional", "1.234.567,89", "456.789,00", "1.691.356,89"],
  ["", "", "", "", "", "*Lock Pagu adalah jumlah pagu...", "", "", ""]
]

Output `finalData`:
[
  ["1.57.04.01.A.524111", "Belanja Barang Operasional", 1234567.89, 0, 0, 456789, 1691356.89]
]
```

Angka di-output sudah berupa `number`, sehingga hook `useProcessedMetrics()` bisa langsung melakukan agregasi tanpa parsing tambahan.

## Diagram Alur

```mermaid
flowchart LR
    A[User Uploads Excel] --> B[processFile (App.tsx)]
    B --> C[parseExcelFile]
    C --> D[muatDanBersihkanData]
    D --> E[prosesDanStrukturData]
    E --> F[Trim Columns + normalizeCodeAndDescription]
    F --> G[filterDanHitungTotal]
    G --> H[ProcessingResult]
    H --> I[saveProcessedResult (Supabase)]
    H --> J[useProcessedMetrics / Dashboard]
    H --> K[downloadExcelFile]
```

Dokumen ini bisa diperluas jika pipeline mendapat tahapan baru (misalnya validasi schema khusus atau enrichment tambahan).
