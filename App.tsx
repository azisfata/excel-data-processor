import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { ProcessingResult } from './types';
import { processExcelData, downloadExcelFile, parseExcelFile } from './services/excelProcessor';

// --- Icon Components ---
const UploadIcon = () => (
  <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
  </svg>
);

const DownloadIcon = () => (
    <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

const ProcessIcon = () => (
    <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0l3.181-3.183m-4.991-2.696v4.992h-4.992m0 0v4.992m0-4.992 3.181-3.183a8.25 8.25 0 0 0-11.667 0l3.181 3.183" />
    </svg>
);

const Spinner = () => (
  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// --- Main App Component ---
export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);

  const processFile = useCallback((fileToProcess: File) => {
    if (!fileToProcess) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        const data = parseExcelFile(binaryStr as string | ArrayBuffer);
        const processingResult = processExcelData(data);
        setResult(processingResult);
      } catch (e: any) {
        setError(e.message || "Terjadi kesalahan yang tidak diketahui saat memproses file.");
        console.error(e);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      setError("Gagal membaca file. Silakan coba lagi.");
      setIsProcessing(false);
    };
    reader.readAsBinaryString(fileToProcess);
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const uploadedFile = acceptedFiles[0];
      setFile(uploadedFile);
      setError(null);
      setResult(null);
      // Mulai proses file secara otomatis
      processFile(uploadedFile);
    }
  }, [processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    multiple: false,
  });

  // Fungsi handleProcessFile sudah tidak digunakan lagi karena proses langsung dijalankan saat upload
  
  const handleDownload = () => {
      if (!result) return;
      const originalFileName = file?.name.replace(/\.(xlsx|xls)$/, '') || 'laporan';
      const newFileName = `${originalFileName}_processed.xlsx`;
      downloadExcelFile(result.finalData, newFileName);
  };

  const dropzoneClasses = useMemo(() => {
    const base = 'flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50';
    return isDragActive ? `${base} border-blue-500 bg-blue-50` : `${base} border-gray-300 hover:bg-gray-100`;
  }, [isDragActive]);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800">Excel Data Processor</h1>
          <p className="text-slate-600 mt-2">Unggah, proses, dan unduh data Excel Anda dengan logika khusus.</p>
        </header>

        <main className="bg-white rounded-xl shadow-lg p-6 md:p-8">
          {/* Step 1: Upload */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-700 mb-3">Langkah 1: Unggah File Excel</h2>
            <div {...getRootProps()} className={dropzoneClasses}>
              <input {...getInputProps()} />
              <UploadIcon />
              <p className="mb-2 text-sm text-gray-500">
                <span className="font-semibold">Klik untuk mengunggah</span> atau seret dan lepas
              </p>
              <p className="text-xs text-gray-500">XLS atau XLSX</p>
            </div>
            {file && (
              <p className="text-center text-sm text-slate-600 mt-4">
                File terpilih: <span className="font-medium text-slate-800">{file.name}</span>
              </p>
            )}
          </div>

          {/* Processing indicator */}
          {isProcessing && (
            <div className="text-center mb-6">
              <div className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-800 bg-blue-100 rounded-md">
                <Spinner /> Memproses file...
              </div>
            </div>
          )}
          
          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md mb-6" role="alert">
                <p className="font-bold">Error</p>
                <p>{error}</p>
            </div>
          )}

          {/* Step 3: Results */}
          {result && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-semibold text-slate-700 mb-4">Langkah 3: Hasil Proses</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Totals */}
                <div className="bg-slate-50 p-4 rounded-lg">
                    <h3 className="font-bold text-slate-800 mb-3">Hasil Perhitungan Total</h3>
                    <ul className="space-y-2 text-sm">
                        {result.totals.map((total, index) => {
                            const labels = [
                                'Pagu Revisi',
                                'Lock Pagu',
                                'Periode Lalu',
                                'Periode Saat Ini',
                                's.d. Periode'
                            ];
                            return (
                                <li key={index} className="flex justify-between items-center bg-white p-2 rounded shadow-sm">
                                    <span className="text-slate-600">{labels[index]}:</span>
                                    <span className="font-mono font-semibold text-blue-700">
                                        {typeof total === 'number' ? total.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2}) : total}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                {/* Download Button */}
                <div className="bg-green-50 p-4 rounded-lg flex flex-col items-center justify-center">
                    <h3 className="font-bold text-green-800 mb-3">Unduh Hasil Akhir</h3>
                    <p className="text-sm text-green-700 text-center mb-4">Data yang difilter siap untuk diunduh sebagai file Excel baru.</p>
                     <button
                        onClick={handleDownload}
                        className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                    >
                        <DownloadIcon />
                        Unduh File
                    </button>
                </div>
              </div>

              {/* Data Preview */}
              <div className="mt-8">
                <h3 className="font-bold text-slate-800 mb-3">Pratinjau Data Hasil Akhir (Sama seperti file unduhan)</h3>
                <div className="overflow-x-auto max-h-96 border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                {result.processedDataForPreview[0]?.map((_, index) => (
                                    <th key={index} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Kolom {index + 1}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {result.processedDataForPreview.map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-gray-50">
                                    {row.map((cell, cellIndex) => (
                                        <td key={cellIndex} className="px-4 py-2 whitespace-nowrap text-slate-700">
                                            {cell === undefined || cell === null ? '' : String(cell)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}