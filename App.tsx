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
    onDragEnter: undefined,
    onDragOver: undefined,
    onDragLeave: undefined
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
    return isDragActive ? `${base} border-blue-500 bg-blue-50` : `${base} border-gray-300 hover:border-blue-400`;
  }, [isDragActive]);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Only show upload section if no result yet */}
        {!result && (
          <div className="bg-white shadow-xl rounded-xl p-8 max-w-3xl mx-auto mt-8 border border-gray-100">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Mulai Memproses Excel</h2>
              <p className="text-gray-600">Unggah file Excel untuk memulai pemrosesan data</p>
            </div>
            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center justify-center space-y-2">
                <UploadIcon />
                <p className="text-sm text-gray-600">
                  {isDragActive ? 'Lepaskan file di sini...' : 'Seret file Excel ke sini, atau klik untuk memilih'}
                </p>
                <p className="text-xs text-gray-500">Hanya file .xls atau .xlsx yang didukung</p>
                {file && (
                  <p className="text-sm font-medium text-gray-900 mt-2">
                    File dipilih: {file.name}
                  </p>
                )}
              </div>
            </div>

            {isProcessing && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-800 bg-blue-100 rounded-md">
                  <Spinner /> Memproses file...
                </div>
              </div>
            )}
            
            {error && (
              <div className="mt-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
                <p>{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Dashboard & Results */}
        {result && (
          <div className="space-y-6">
            {/* Totals Card */}
            <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200 transition-all duration-200 hover:shadow-lg">
              <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700">
                <h3 className="text-lg font-semibold text-white">Ringkasan Keuangan</h3>
                <p className="text-sm text-blue-100 mt-1">Total dan ringkasan data yang telah diproses</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {result.totals.map((total, index) => {
                    const labels = [
                      { name: 'Pagu Revisi', color: 'bg-blue-100 text-blue-800' },
                      { name: 'Lock Pagu', color: 'bg-purple-100 text-purple-800' },
                      { name: 'Periode Lalu', color: 'bg-yellow-100 text-yellow-800' },
                      { name: 'Periode Saat Ini', color: 'bg-green-100 text-green-800' },
                      { name: 's.d. Periode', color: 'bg-indigo-100 text-indigo-800' }
                    ];
                    const label = labels[index];
                    return (
                      <div key={index} className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="px-4 py-3 text-center">
                          <p className="text-sm font-medium text-gray-500 truncate">{label.name}</p>
                          <p className="mt-1 text-lg font-semibold text-gray-900">
                            {typeof total === 'number' 
                              ? total.toLocaleString('id-ID', { 
                                  minimumFractionDigits: 2, 
                                  maximumFractionDigits: 2 
                                })
                              : total}
                          </p>
                        </div>
                        <div className={`${label.color} px-4 py-1 text-center text-xs font-medium`}>
                          {label.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Data Hasil Proses</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Menampilkan {Math.min(result.processedDataForPreview.length, 100)} dari {result.finalData.length} baris data
                </p>
              </div>
              <div className="flex space-x-2">
              <button
                onClick={() => document.getElementById('file-upload')?.click()}
                className="inline-flex items-center px-2.5 py-1 border border-gray-300 text-xs font-medium rounded text-gray-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                title="Unggah File Baru"
              >
                <UploadIcon className="h-3 w-3 mr-1.5" />
                <span>Unggah</span>
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  accept=".xls,.xlsx"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setFile(e.target.files[0]);
                      setError(null);
                      setResult(null);
                      processFile(e.target.files[0]);
                    }
                  }}
                />
              </button>
              <button
                onClick={handleDownload}
                className="inline-flex items-center px-2.5 py-1 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                title="Unduh Hasil"
              >
                <DownloadIcon className="h-3 w-3 mr-1.5" />
                <span>Unduh</span>
              </button>
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-100">
                      {result.processedDataForPreview[0]?.map((cell: any, cellIndex: number) => (
                        <th 
                          key={cellIndex} 
                          scope="col" 
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap border-b border-gray-200"
                        >
                          {cellIndex === 0 ? 'Kode' : 
                           cellIndex === 1 ? 'Uraian' : 
                           `Kol ${cellIndex + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {result.processedDataForPreview.map((row: any[], rowIndex: number) => (
                      <tr 
                        key={rowIndex} 
                        className={`transition-colors duration-150 ${rowIndex % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}`}
                      >
                        {row.map((cell: any, cellIndex: number) => (
                          <td 
                            key={cellIndex} 
                            className={`px-4 py-3 text-sm ${cellIndex === 1 ? 'text-gray-900 font-medium' : 'text-gray-600'} border-t border-gray-100`}
                          >
                            {cell}
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
  );
}