
import { ExcelData, ExcelRow, ProcessingResult } from '../types';

declare var XLSX: any;

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
        throw new Error("File content is empty.");
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
        throw new Error("Pembersihan data awal gagal atau data kosong.");
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
    
    // Step 4: Filter and calculate totals on the final data structure
    const { finalData, totals } = filterDanHitungTotal(dataWithColsRemoved2);

    return { 
        finalData, // Data with columns removed, ready for download
        totals,
        // The preview now shows the exact same data as the download file (limited to 100 rows for performance).
        processedDataForPreview: finalData.slice(0, 100) 
    };
}


/**
 * Corresponds to Python's muat_dan_bersihkan_data function.
 * Cleans the initial dataset.
 */
function muatDanBersihkanData(data: ExcelData): ExcelData {
    // Remove footer note
    const stringToRemove = '*Lock Pagu adalah jumlah pagu yang sedang dalam proses usulan revisi DIPA atau POK.';
    // Convert all cells to string to mimic pandas' astype(str).any() behavior
    let df = data.filter(row => !row.some(cell => String(cell).includes(stringToRemove)));

    // Find header row "Program Dukungan Manajemen" and slice data from there
    const headerKeyword = "Program Dukungan Manajemen";
    let headerIndex = -1;
    for(let i = 0; i < df.length; i++) {
        // Convert all cells to string for searching
        if(df[i].some(cell => String(cell).includes(headerKeyword))) {
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
    if(df.length > 0) {
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
    let df = data.map(rowArray => {
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

    // Forward-fill (ffill) the first column, similar to pandas' ffill()
    let lastValidCode: any = undefined;
    df.forEach(row => {
        if (!isEmpty(row[0])) {
            lastValidCode = row[0];
        } else {
            row[0] = lastValidCode;
        }
    });

    return df;
}


/**
 * Corresponds to Python's filter_dan_hitung_total function.
 * Filters data and calculates totals for specific columns.
 */
function filterDanHitungTotal(data: ExcelData): { finalData: ExcelData; totals: number[] } {
    // Filter rows where the second column starts with 6 digits
    const filteredData = data.filter(row => {
        const cellValue = row[1];
        const cellStr = cellValue?.toString() || '';
        return /^\d{6}/.test(cellStr);
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
export function downloadExcelFile(data: ExcelData, fileName: string): void {
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Hasil Olahan');
    XLSX.writeFile(workbook, fileName);
}
