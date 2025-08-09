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
  const [result, setResult] = useState<ProcessingResult | null>(() => {
    // Load saved result from localStorage on initial render
    const savedResult = localStorage.getItem('excelProcessorResult');
    return savedResult ? JSON.parse(savedResult) : null;
  });
  const [lastUpdated, setLastUpdated] = useState<string>(() => {
    // Load saved lastUpdated from localStorage on initial render
    return localStorage.getItem('excelProcessorLastUpdated') || '';
  });

  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    if (!result || typeof result.totals[0] !== 'number' || result.totals[0] <= 0) return 0;
    if (typeof result.totals[4] !== 'number') return 0;
    return (result.totals[4] / result.totals[0]) * 100;
  }, [result]);

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
        
        // Save result to state
        setResult(processingResult);
        
        // Set last updated time
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = { 
          weekday: 'long',
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZoneName: 'short'
        };
        const formattedDate = now.toLocaleString('id-ID', options);
        setLastUpdated(formattedDate);
        
        // Save to localStorage
        localStorage.setItem('excelProcessorResult', JSON.stringify(processingResult));
        localStorage.setItem('excelProcessorLastUpdated', formattedDate);
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
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Anggaran Biro Digitalisasi dan Pengelolaan Informasi</h3>
                    <p className="text-sm text-blue-100">Informasi Pagu dan Realisasi</p>
                  </div>
                  {lastUpdated && (
                    <p className="text-xs text-blue-200 bg-blue-700/50 px-2 py-1 rounded">
                      Diperbarui: {lastUpdated.split(', ')[1]}
                    </p>
                  )}
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Pagu Revisi */}
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="px-4 py-3 text-center">
                      <p className="text-sm font-medium text-gray-500 truncate">Pagu Revisi</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {typeof result.totals[0] === 'number' 
                          ? result.totals[0].toLocaleString('id-ID', { 
                              maximumFractionDigits: 0 
                            })
                          : '0'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Realisasi */}
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="px-4 py-3 text-center">
                      <p className="text-sm font-medium text-gray-500 truncate">Realisasi</p>
                      <div className="flex items-center justify-center gap-2">
                        <p className="text-lg font-semibold text-gray-900">
                          {typeof result.totals[4] === 'number' 
                            ? result.totals[4].toLocaleString('id-ID', { 
                                maximumFractionDigits: 0 
                              })
                            : '0'}
                        </p>
                        {typeof result.totals[0] === 'number' && result.totals[0] > 0 && (
                          <span className="text-sm text-indigo-600">
                            ({(Number(result.totals[4]) / Number(result.totals[0]) * 100).toFixed(2)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="px-4 pb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">Capaian Realisasi</span>
                        <span className="text-xs font-semibold text-indigo-700">
                          {progressPercentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full transition-all duration-700 ease-out"
                          style={{ 
                            width: `${Math.min(progressPercentage, 100)}%`,
                            boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)'
                          }}
                        ></div>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-gray-400">0%</span>
                        <span className="text-xs text-gray-400">100%</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Sisa Anggaran */}
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="px-4 py-3 text-center">
                      <p className="text-sm font-medium text-gray-500 truncate">Sisa Anggaran</p>
                      <div className="flex items-center justify-center gap-2">
                        <p className="text-lg font-semibold text-gray-900">
                          {typeof result.totals[0] === 'number' && typeof result.totals[4] === 'number'
                            ? (Number(result.totals[0]) - Number(result.totals[4])).toLocaleString('id-ID', { 
                                maximumFractionDigits: 0 
                              })
                            : '0'}
                        </p>
                        {typeof result.totals[0] === 'number' && result.totals[0] > 0 && (
                          <span className="text-sm text-green-600">
                            ({((Number(result.totals[0]) - Number(result.totals[4])) / Number(result.totals[0]) * 100).toFixed(2)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Detail Anggaran</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Menampilkan {Math.min(result.processedDataForPreview.length, 100)} dari {result.finalData.length} baris data
                </p>

              </div>
              <div className="flex space-x-1.5">
                <button
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="inline-flex items-center px-2 py-0.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                  title="Unggah File Baru"
                >
                  <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
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
                  className="inline-flex items-center px-2 py-0.5 text-xs text-blue-600 hover:text-white hover:bg-blue-600 rounded transition-colors"
                  title="Unduh Hasil"
                >
                  <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Unduh</span>
                </button>
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      <th className="px-6 py-3 w-1/6">Kode</th>
                      <th className="px-6 py-3 w-3/6">Uraian</th>
                      <th className="px-6 py-3 w-1/6 text-right">Pagu Revisi</th>
                      <th className="px-6 py-3 w-1/6 text-right">s.d. Periode</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {result.processedDataForPreview.map((row: any[], rowIndex: number) => {
                      // Only include columns 0, 1, 2, and 6 (Kode, Uraian, Pagu Revisi, s.d. Periode)
                      const [kode, uraian, paguRevisi, sdPeriode] = [0, 1, 2, 6].map(index => row[index]);
                      
                      return (
                        <tr key={rowIndex} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {kode}
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-700">
                            {uraian}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                            {typeof paguRevisi === 'number' 
                              ? paguRevisi.toLocaleString('id-ID')
                              : paguRevisi}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                            {typeof sdPeriode === 'number' 
                              ? sdPeriode.toLocaleString('id-ID')
                              : sdPeriode}
                          </td>
                        </tr>
                      );
                    })}
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