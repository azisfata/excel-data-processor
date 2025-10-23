
import { ExcelData, ProcessingResult } from '../types';
import { parseExcelFile as parseExcelFilePipeline, processExcelData as processExcelDataPipeline } from './excelProcessor/pipeline';

declare var XLSX: any;

interface DownloadOptions {
    periodeLaluLabel?: string;
    periodeIniLabel?: string;
    sdPeriodeLabel?: string;
}

// Re-export functions from pipeline for backward compatibility
export { parseExcelFile as parseExcelFilePipeline, processExcelData as processExcelDataPipeline };

/**
 * Parses the binary string content of an Excel file.
 * @param binaryStr The binary string from FileReader.
 * @returns The Excel data as an array of arrays.
 */
export function parseExcelFile(binaryStr: string | ArrayBuffer): ExcelData {
    return parseExcelFilePipeline(binaryStr);
}

/**
 * Main function to process raw excel data.
 * @param data Raw data from excel file as array of arrays.
 * @returns An object containing the final filtered data, totals, and a preview of the processed data.
 */
export function processExcelData(data: ExcelData): ProcessingResult {
    return processExcelDataPipeline(data);
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
        sdPeriodeLabel
    ];

    // Add headers to the data if not already present
    const dataWithHeaders = [headers, ...data];
    
    const worksheet = XLSX.utils.aoa_to_sheet(dataWithHeaders);
    
    // Style the header row
    const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1E40AF' } },
        alignment: { horizontal: 'center' }
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
        { wch: 15 }  // Realisasi kumulatif (dinamis)
    ];
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Hasil Olahan');
    XLSX.writeFile(workbook, fileName);
}
