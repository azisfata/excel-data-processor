import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { ProcessingResult } from './types';
import { processExcelData, downloadExcelFile, parseExcelFile } from './services/excelProcessor';
import { createHierarchy, flattenTree } from './utils/hierarchy';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [hierarchicalData, setHierarchicalData] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [result, setResult] = useState<ProcessingResult | null>(() => {
    // Load saved result from localStorage on initial render
    const savedResult = localStorage.getItem('excelProcessorResult');
    return savedResult ? JSON.parse(savedResult) : null;
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string>(() => {
    // Load saved lastUpdated from localStorage on initial render
    return localStorage.getItem('excelProcessorLastUpdated') || '';
  });
  const [maxDepth, setMaxDepth] = useState<number>(6); // Default to showing 6 levels

  // Calculate progress percentage
  const progressPercentage = useMemo(() => {
    if (!result || typeof result.totals[0] !== 'number' || result.totals[0] <= 0) return 0;
    if (typeof result.totals[4] !== 'number') return 0;
    return (result.totals[4] / result.totals[0]) * 100;
  }, [result]);

  // Update hierarchical data when result, expandedNodes, or maxDepth changes
  useEffect(() => {
    if (result) {
      const hierarchy = createHierarchy(result.processedDataForPreview);
      
      // Apply expanded state and max depth to nodes
      const withExpanded = (nodes: any[], currentLevel = 0): any[] => nodes.map(node => {
        const shouldExpand = currentLevel < maxDepth - 1; // Expand if within max depth
        const isExpanded = expandedNodes[node.fullPath] ?? shouldExpand;
        
        return {
          ...node,
          isExpanded,
          children: withExpanded(Object.values(node.children), currentLevel + 1)
        };
      });
      
      const processedHierarchy = withExpanded(hierarchy);
      const flatData = flattenTree(processedHierarchy);
      setHierarchicalData(flatData);
      setFilteredData(flatData); // Initialize filtered data with all data
    }
  }, [result, expandedNodes, maxDepth]);

  const toggleNode = useCallback((path: string, isDataGroup = false) => {
    setExpandedNodes(prev => ({
      ...prev,
      [path]: !prev[path],
      // For data groups, we need to update the hierarchy to reflect the expanded state
      ...(isDataGroup ? { [`${path}-data`]: !prev[path] } : {})
    }));
  }, []);

  // Update max depth and save to localStorage
  const handleDepthChange = (depth: number) => {
    setMaxDepth(depth);
    localStorage.setItem('hierarchyMaxDepth', depth.toString());
  };

  const processFile = useCallback((fileToProcess: File) => {
    if (!fileToProcess) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);
    
    // Load saved max depth or use default
    const savedDepth = localStorage.getItem('hierarchyMaxDepth');
    if (savedDepth) {
      setMaxDepth(parseInt(savedDepth, 10));
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const binaryStr = event.target?.result;
        const data = parseExcelFile(binaryStr as string | ArrayBuffer);
        const processingResult = processExcelData(data);
        
        // Save result to state
        setResult(processingResult);
        
        // Save to localStorage
        localStorage.setItem('excelProcessorResult', JSON.stringify(processingResult));
        const now = new Date();
        const dateOptions: Intl.DateTimeFormatOptions = {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        };
        const timeOptions: Intl.DateTimeFormatOptions = {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        };
        const dateStr = now.toLocaleDateString('id-ID', dateOptions);
        const timeStr = now.toLocaleTimeString('id-ID', timeOptions);
        const formattedDate = `${dateStr} pukul ${timeStr}`;
        setLastUpdated(formattedDate);
        localStorage.setItem('excelProcessorLastUpdated', formattedDate);
        
      } catch (err) {
        console.error('Error processing file:', err);
        setError('Gagal memproses file. Pastikan format file sesuai.');
        setResult(null);
      } finally {
        setIsProcessing(false);
      }
    };
    
    reader.onerror = () => {
      setError('Gagal membaca file. Silakan coba lagi.');
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

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredData(hierarchicalData);
      return;
    }

    // When searching, automatically expand to max level (8) to show all matching results
    if (maxDepth < 8) {
      setMaxDepth(8);
    }

    // Split search terms by 'OR' (case-insensitive) and trim whitespace
    const searchTerms = searchTerm
      .split(/\s+OR\s+/i)
      .map(term => term.trim().toLowerCase())
      .filter(term => term.length > 0);

    const filtered = hierarchicalData.filter(item => {
      // Get values to search in (Kode and Uraian)
      const kode = String(item[0] || '').toLowerCase();
      const uraian = String(item[1] || '').toLowerCase();
      
      // Check if any search term matches either kode or uraian
      return searchTerms.some(term => 
        kode.includes(term) || 
        uraian.includes(term)
      );
    });

    setFilteredData(filtered);
  }, [searchTerm, hierarchicalData, maxDepth]);

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
            {/* Header with Title and Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Anggaran Biro Digitalisasi dan Pengelolaan Informasi</h2>
                <p className="text-sm text-gray-600">Informasi Pagu dan Realisasi</p>
              </div>
              {lastUpdated && (
                <div className="text-xs text-gray-600 bg-gray-100 px-3 py-1.5 rounded-md">
                  <div>Diperbarui:</div>
                  <div className="whitespace-nowrap font-medium">{lastUpdated}</div>
                </div>
              )}
            </div>

            {/* Totals Card */}
            <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200 transition-all duration-200 hover:shadow-lg">
              <div className="p-6 space-y-6">
                {/* Cards Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Pagu Revisi */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-4 text-center">
                      <p className="text-sm font-medium text-gray-500 mb-1">Pagu Revisi</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {typeof result.totals[0] === 'number' 
                          ? result.totals[0].toLocaleString('id-ID', { 
                              maximumFractionDigits: 0 
                            })
                          : '0'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Realisasi */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-4 text-center">
                      <p className="text-sm font-medium text-gray-500 mb-1">Realisasi</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {typeof result.totals[4] === 'number' 
                          ? result.totals[4].toLocaleString('id-ID', { 
                              maximumFractionDigits: 0 
                            })
                          : '0'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Sisa Anggaran */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-4 text-center">
                      <p className="text-sm font-medium text-gray-500 mb-1">Sisa Anggaran</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {typeof result.totals[0] === 'number' && typeof result.totals[4] === 'number'
                          ? (Number(result.totals[0]) - Number(result.totals[4])).toLocaleString('id-ID', { 
                              maximumFractionDigits: 0 
                            })
                          : '0'}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Progress Bar Section */}
                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                  <div className="max-w-3xl mx-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Capaian Realisasi</span>
                      <span className="text-sm font-semibold text-indigo-700">
                        {progressPercentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.min(progressPercentage, 100)}%`,
                          boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)'
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-xs text-gray-400">0%</span>
                      <span className="text-xs text-gray-400">100%</span>
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
                  Menampilkan {filteredData.length} dari {result.finalData.length} baris data
                  {searchTerm && ` (difilter berdasarkan: "${searchTerm}")`}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Cari kode/uraian..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center">
                  <label htmlFor="depthSelect" className="text-sm font-medium text-gray-700 mr-2 whitespace-nowrap">Level:</label>
                  <select
                    id="depthSelect"
                    value={maxDepth}
                    onChange={(e) => handleDepthChange(parseInt(e.target.value, 10))}
                    className="block rounded-md border-gray-300 py-1.5 pl-2 pr-8 text-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex space-x-1.5">
                <button
                  onClick={() => document.getElementById('file-upload')?.click()}
                  className="inline-flex items-center px-2 py-0.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                  title="Unggah File Baru"
                >
                  <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
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
                      <th className="px-6 py-3 w-1/6 text-right">REALISASI</th>
                      <th className="px-6 py-3 w-[120px] text-right">% Realisasi</th>
                      <th className="px-6 py-3 w-1/6 text-right">Sisa Anggaran</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                          Tidak ada data yang cocok dengan pencarian "{searchTerm}"
                        </td>
                      </tr>
                    ) : (
                      filteredData
                        .filter(row => row.__isVisible !== false)
                        .map((row: any, rowIndex: number) => {
                        const isGroup = row.__hasChildren && !row.__isDataGroup;
                        const isDataGroup = row.__isDataGroup;
                        const [kode, uraian, paguRevisi, sdPeriode] = [0, 1, 2, 6].map(index => row[index]);
                        const indent = row.__level * 20;
                        const showExpandCollapse = row.__hasChildren || row.__isDataGroup;
                        
                        return (
                          <tr 
                            key={`${row.__path}-${rowIndex}`} 
                            className={`hover:bg-gray-50 transition-colors ${isGroup ? 'bg-gray-50' : ''}`}
                          >
                            <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              <div className="flex items-center" style={{ paddingLeft: `${indent}px` }}>
                                {showExpandCollapse && (
                                  <button 
                                    onClick={() => toggleNode(row.__path, isDataGroup)}
                                    className="mr-2 text-gray-500 hover:text-gray-700 focus:outline-none w-4 flex-shrink-0"
                                    aria-label={row.__isExpanded ? 'Collapse' : 'Expand'}
                                  >
                                    {row.__isExpanded ? '▼' : '▶'}
                                  </button>
                                )}
                                {!showExpandCollapse && <div className="w-6"></div>}
                                {isGroup || isDataGroup ? (
                                  <span className={`${isDataGroup ? 'text-blue-600' : 'font-semibold'}`}>
                                    {isDataGroup ? `${kode} (${row.__dataCount} items)` : kode}
                                  </span>
                                ) : kode}
                              </div>
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
                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                              {typeof paguRevisi === 'number' && typeof sdPeriode === 'number' && paguRevisi > 0
                                ? `${((sdPeriode / paguRevisi) * 100).toFixed(2)}%`
                                : ''}
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                              {typeof paguRevisi === 'number' && typeof sdPeriode === 'number'
                                ? (paguRevisi - sdPeriode).toLocaleString('id-ID')
                                : ''}
                            </td>
                          </tr>
                        );
                      })
                    )}
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