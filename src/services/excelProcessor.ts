import { ExcelData, ProcessingResult } from '@/types';
import {
  normalizeCodeAndDescription,
  deriveAccountNameMap,
  isSixDigitSegment,
} from '@/utils/dataNormalization';

declare let XLSX: any;

interface DownloadOptions {
  periodeLaluLabel?: string;
  periodeIniLabel?: string;
  sdPeriodeLabel?: string;
}

/**
 * Helper function to check for empty cells, mimicking pandas' isna() for practical purposes.
 * @param val The cell value to check.
 * @returns True if the cell is null, undefined, or an empty string.
 */
const isEmpty = (val: any): boolean => val === null || val === undefined || val === '';

/**
 * Parses the binary string content of an Excel file.
 * @param binaryStr The binary string from FileReader.
 * @returns The Excel data as an array of arrays.
 */
export function parseExcelFile(binaryStr: string | ArrayBuffer): ExcelData {
  if (!binaryStr) {
    throw new Error('File content is empty.');
  }
  const workbook = XLSX.read(binaryStr, { type: 'binary', cellFormula: false, cellHTML: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  // Use defval: undefined to ensure empty cells are not converted to another type.
  const data: ExcelData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: undefined });
  return data;
}

/**
 * Main function to process raw excel data.
 * @param data Raw data from excel file as array of arrays.
 * @returns An object containing the final filtered data, totals, and a preview of the processed data.
 */
export function processExcelData(data: ExcelData): ProcessingResult {
  // Step 1: Initial cleaning
  const cleanedData = muatDanBersihkanData(data);
  if (!cleanedData || cleanedData.length === 0) {
    throw new Error('Pembersihan data awal gagal atau data kosong.');
  }

  // Step 2: Process and structure data
  const structuredData = prosesDanStrukturData(cleanedData);

  // Step 2.5: Remove columns 19 and 20 (indices 18, 19) before filtering
  const dataWithColsRemoved = structuredData.map(row => {
    return row.filter((_, colIndex) => {
      // A column should be kept if its index is NOT 18 or 19
      return colIndex !== 18 && colIndex !== 19;
    });
  });

  // Step 3: Remove columns 3 through 13 (indices 2 to 12)
  const dataWithColsRemoved2 = dataWithColsRemoved.map(row => {
    return row.filter((_, colIndex) => {
      // A column should be kept if its index is NOT between 2 and 12 (inclusive)
      const isColumnToDelete = colIndex >= 2 && colIndex <= 12;
      return !isColumnToDelete;
    });
  });

  const normalizedData = normalizeCodeAndDescription(dataWithColsRemoved2);

  // Log dataWithColsRemoved2
  console.log('=== DATA DENGAN KOLOM YANG TELAH DIHAPUS ===');
  console.log('Jumlah baris:', normalizedData.length);
  if (normalizedData.length > 0) {
    console.log('Jumlah kolom per baris:', normalizedData[0].length);
    console.log(
      'Contoh data (5 baris pertama):',
      JSON.stringify(normalizedData.slice(0, 5), null, 2)
    );
  }

  // Step 4: Filter and calculate totals on the final data structure
  const { finalData, totals } = filterDanHitungTotal(normalizedData);

  const accountNameMap = deriveAccountNameMap(normalizedData);

  return {
    finalData, // Data with columns removed, ready for download
    totals,
    // The preview now shows the exact same data as the download file (limited to 100 rows for performance).
    processedDataForPreview: finalData.slice(0, 100),
    accountNameMap, // Map of account codes to account names
  };
}

/**
 * Corresponds to Python's muat_dan_bersihkan_data function.
 * Cleans the initial dataset.
 */
function muatDanBersihkanData(data: ExcelData): ExcelData {
  // Remove footer note
  const stringToRemove =
    '*Lock Pagu adalah jumlah pagu yang sedang dalam proses usulan revisi DIPA atau POK.';
  // Convert all cells to string to mimic pandas' astype(str).any() behavior
  let df = data.filter(row => !row.some(cell => String(cell).includes(stringToRemove)));

  // Find header row "Program Dukungan Manajemen" and slice data from there
  const headerKeyword = 'Program Dukungan Manajemen';
  let headerIndex = -1;
  for (let i = 0; i < df.length; i++) {
    // Convert all cells to string for searching
    if (df[i].some(cell => String(cell).includes(headerKeyword))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    console.warn("Peringatan: Header 'Program Dukungan Manajemen' tidak ditemukan.");
  } else {
    df = df.slice(headerIndex);
  }

  // Remove columns that are entirely empty (dropna axis=1, how='all')
  if (df.length > 0) {
    const columnsToRemove = new Set<number>();
    const colCount = Math.max(0, ...df.map(r => r.length));

    for (let j = 0; j < colCount; j++) {
      const isColumnEmpty = df.every(row => isEmpty(row[j]));
      if (isColumnEmpty) {
        columnsToRemove.add(j);
      }
    }

    if (columnsToRemove.size > 0) {
      df = df.map(row => row.filter((_, colIndex) => !columnsToRemove.has(colIndex)));
    }
  }

  return df;
}

/**
 * Corresponds to Python's proses_dan_struktur_data function.
 * Restructures columns and fills hierarchical codes.
 */
function prosesDanStrukturData(data: ExcelData): ExcelData {
  // Shift data to fill empty cells in the first two columns
  const df = data.map(rowArray => {
    const row = [...rowArray]; // Work with a mutable copy

    // Rule 1: If col 1 is empty, fill with first non-empty from left
    if (isEmpty(row[0])) {
      for (let i = 1; i < row.length; i++) {
        if (!isEmpty(row[i])) {
          row[0] = row[i];
          row[i] = undefined;
          break;
        }
      }
    }

    // Rule 2: If col 2 is empty, fill with first non-numeric from left
    if (isEmpty(row[1])) {
      for (let i = 2; i < row.length; i++) {
        const val = row[i];
        // Use !Number.isFinite() as a more robust check for non-numeric values,
        // mimicking Python's `not isinstance(val, (int, float))`.
        if (!isEmpty(val) && !Number.isFinite(val)) {
          row[1] = val;
          row[i] = undefined;
          break;
        }
      }
    }

    // Rule 3: If col 2 is still empty, move value from col 1
    if (isEmpty(row[1])) {
      row[1] = row[0];
      row[0] = undefined;
    }

    return row;
  });

  // Initialize trace for hierarchical code processing
  const trace: string[] = [];
  const MAX_TRACE_SIZE = 7;
  const newCodes: string[] = [];

  // Process each row to build hierarchical codes
  for (const row of df) {
    const value = row[0];

    if (!isEmpty(value)) {
      // Convert to string and remove .0 suffix if present
      let valueStr = String(value);
      if (valueStr.endsWith('.0')) {
        valueStr = valueStr.slice(0, -2);
      }

      // Add the original value to new codes
      newCodes.push(valueStr);

      // Process the value to update the trace
      const itemsToAdd = valueStr.includes('.') ? valueStr.split('.') : [valueStr];

      for (const item of itemsToAdd) {
        if (!trace.includes(item)) {
          if (trace.length < MAX_TRACE_SIZE) {
            trace.push(item);
          } else {
            // Update trace based on item type
            if (item.length === 6 && /^\d+$/.test(item)) {
              trace[6] = item; // Update 6-digit code at position 6
            } else if (item.length === 3 && /^\d+$/.test(item)) {
              trace[4] = item; // Update 3-digit code at position 4
            } else if (item.length === 2 && /^\d[a-zA-Z]$/.test(item)) {
              trace[5] = item; // Update 2-char code (1 digit + 1 letter) at position 5
            }
          }
        }
      }
    } else {
      // For empty cells, use the current trace
      newCodes.push(trace.join('.'));
    }
  }

  // Update the first column with the new hierarchical codes
  df.forEach((row, index) => {
    if (index < newCodes.length) {
      row[0] = newCodes[index];
    }
  });

  return df;
}

/**
 * Corresponds to Python's filter_dan_hitung_total function.
 * Filters data and calculates totals for specific columns.
 */
function filterDanHitungTotal(data: ExcelData): { finalData: ExcelData; totals: number[] } {
  const filteredData = data.filter(row => {
    const kodeStr = typeof row[0] === 'string' ? row[0].trim() : '';
    if (!kodeStr) {
      return false;
    }

    const segments = kodeStr
      .split('.')
      .map(segment => segment.trim())
      .filter(Boolean);

    // Pastikan hanya kode lengkap (8 level) yang ikut ke hasil akhir.
    if (segments.length < 8) {
      return false;
    }

    const lastSegment = segments[segments.length - 1] || '';
    return isSixDigitSegment(lastSegment);
  });

  const totals: number[] = [];
  // Columns to sum: 3rd to 7th (indices 2, 3, 4, 5, 6)
  const columnsToSum = [2, 3, 4, 5, 6];

  columnsToSum.forEach(colIndex => {
    const total = filteredData.reduce((sum, row) => {
      const rawValue = row[colIndex];
      let value = 0;

      // First, check if the value is already a valid number.
      if (typeof rawValue === 'number' && isFinite(rawValue)) {
        value = rawValue;
      }
      // If it's a string, attempt to parse it using Indonesian locale rules.
      else if (typeof rawValue === 'string' && rawValue.trim() !== '') {
        // Remove thousand separators (.), then replace decimal comma (,) with a period for parseFloat.
        const formattedStr = rawValue.replace(/\./g, '').replace(/,/g, '.');
        const parsed = parseFloat(formattedStr);
        // Only add if it's a valid number.
        if (!isNaN(parsed)) {
          value = parsed;
        }
      }
      return sum + value;
    }, 0);
    totals.push(total);
  });

  return { finalData: filteredData, totals };
}

/**
 * Generates and triggers the download of an Excel file.
 * @param data The data to write to the file.
 * @param fileName The desired name for the downloaded file.
 */
export function downloadExcelFile(
  data: ExcelData,
  fileName: string,
  options: DownloadOptions = {}
): void {
  const {
    periodeLaluLabel = 'Periode Lalu',
    periodeIniLabel = 'Periode Ini',
    sdPeriodeLabel = 's.d. Periode',
  } = options;

  // Define headers
  const headers = [
    'Kode',
    'Uraian',
    'Pagu Revisi',
    'Lock Pagu',
    periodeLaluLabel,
    periodeIniLabel,
    sdPeriodeLabel,
  ];

  // Add headers to the data if not already present
  const dataWithHeaders = [headers, ...data];

  const worksheet = XLSX.utils.aoa_to_sheet(dataWithHeaders);

  // Style the header row
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E40AF' } },
    alignment: { horizontal: 'center' },
  };

  // Apply style to header cells
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!worksheet[cellAddress]) continue;
    worksheet[cellAddress].s = headerStyle;
  }

  // Auto-size columns
  worksheet['!cols'] = [
    { wch: 20 }, // Kode
    { wch: 50 }, // Uraian
    { wch: 15 }, // Pagu Revisi
    { wch: 15 }, // Lock Pagu
    { wch: 15 }, // Realisasi periode lalu (dinamis)
    { wch: 15 }, // Realisasi periode berjalan (dinamis)
    { wch: 15 }, // Realisasi kumulatif (dinamis)
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Hasil Olahan');
  XLSX.writeFile(workbook, fileName);
}
