import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { ProcessingResult, Activity, BudgetAllocation } from './types';
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
    // Load saved data from localStorage on initial render
    const savedResult = localStorage.getItem('excelProcessorResult');
    return savedResult ? JSON.parse(savedResult) : null;
  });
  const [searchTerm, setSearchTerm] = useState('');
  // Inisialisasi activities dari localStorage jika ada
  const [activities, setActivities] = useState<Activity[]>(() => {
    const savedActivities = localStorage.getItem('excelProcessorActivities');
    return savedActivities ? JSON.parse(savedActivities) : [];
  });
  
  const [newActivity, setNewActivity] = useState<Omit<Activity, 'id'>>({ 
    nama: '', 
    allocations: [] 
  });
  const [newAllocation, setNewAllocation] = useState<BudgetAllocation>({ 
    kode: '', 
    jumlah: 0 
  });
  const [showActivityForm, setShowActivityForm] = useState(false);

  // Fungsi untuk menangani penambahan alokasi anggaran
  const handleAddAllocation = () => {
    if (!newAllocation.kode || newAllocation.jumlah <= 0) return;
    
    setNewActivity(prev => ({
      ...prev,
      allocations: [...prev.allocations, { ...newAllocation }]
    }));
    
    // Reset form alokasi
    setNewAllocation({ kode: '', jumlah: 0 });
  };

  // Fungsi untuk menghapus alokasi
  const handleRemoveAllocation = (index: number) => {
    setNewActivity(prev => ({
      ...prev,
      allocations: prev.allocations.filter((_, i) => i !== index)
    }));
  };

  // Fungsi untuk menghapus kegiatan
  const handleRemoveActivity = (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus kegiatan ini?')) {
      setActivities(prev => prev.filter(activity => activity.id !== id));
    }
  };

  // Fungsi untuk menambahkan kegiatan baru
  const handleAddActivity = () => {
    if (!newActivity.nama || newActivity.allocations.length === 0) return;
    
    const newActivityWithId: Activity = {
      ...newActivity,
      id: Date.now().toString()
    };
    
    setActivities(prev => [...prev, newActivityWithId]);
    
    // Reset form
    setNewActivity({ nama: '', allocations: [] });
    setShowActivityForm(false);
  };

  // Hitung total alokasi untuk sebuah kegiatan
  const calculateTotalAllocation = (allocations: BudgetAllocation[]) => {
    return allocations.reduce((sum, item) => sum + item.jumlah, 0);
  };

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

    // First split by ' OR ' to handle OR conditions between groups
    const orGroups = searchTerm
      .split(/\s+OR\s+/i)
      .map(group => group.trim())
      .filter(group => group.length > 0);

    const filtered = hierarchicalData.filter(item => {
      // Get values to search in (Kode and Uraian)
      const kode = String(item[0] || '').toLowerCase();
      const uraian = String(item[1] || '').toLowerCase();
      
      // Check each OR group
      return orGroups.some(group => {
        // Split group by ' AND ' to handle AND conditions within the group
        const andTerms = group
          .split(/\s+AND\s+/i)
          .map(term => term.trim().toLowerCase())
          .filter(term => term.length > 0);
        
        // All AND terms must match for this group to be a match
        return andTerms.every(term => 
          kode.includes(term) || 
          uraian.includes(term)
        );
      });
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
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Cari kode/uraian..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="block w-full pl-10 pr-8 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                      title="Contoh: a and b atau x or y"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 group-hover:opacity-100 opacity-70 transition-opacity">
                      <svg 
                        className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="absolute z-20 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 ease-in-out w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-700"
                        style={{
                          top: 'calc(100% + 8px)',
                          right: '0',
                        }}
                      >
                        <div className="space-y-2">
                          <p className="font-semibold text-gray-900 border-b pb-1 mb-2">Panduan Pencarian</p>
                          
                          <div className="space-y-3">
                            <div>
                              <p className="font-medium text-gray-800">Pencarian Sederhana:</p>
                              <div className="bg-gray-50 p-2 rounded mt-1">
                                <code className="text-blue-600">ATK</code>
                                <p className="text-gray-600 text-xs mt-1">Mencari semua baris yang mengandung "ATK"</p>
                              </div>
                            </div>
                            
                            <div>
                              <p className="font-medium text-gray-800">Menggunakan AND:</p>
                              <div className="bg-gray-50 p-2 rounded mt-1">
                                <code className="text-blue-600">ATK AND 521211</code>
                                <p className="text-gray-600 text-xs mt-1">Mencari baris yang mengandung KEDUA kata tersebut</p>
                                <p className="text-green-600 text-xs mt-1 font-medium">Contoh: "ATK Kantor 521211" akan muncul</p>
                                <p className="text-red-600 text-xs font-medium">"ATK saja" atau "521211 saja" tidak akan muncul</p>
                              </div>
                            </div>
                            
                            <div>
                              <p className="font-medium text-gray-800">Menggunakan OR:</p>
                              <div className="bg-gray-50 p-2 rounded mt-1">
                                <code className="text-blue-600">ATK OR 521211</code>
                                <p className="text-gray-600 text-xs mt-1">Mencari baris yang mengandung SALAH SATU kata</p>
                                <p className="text-green-600 text-xs mt-1 font-medium">"ATK saja" atau "521211" atau "Kedua-duanya" akan muncul</p>
                              </div>
                            </div>
                            
                            <div className="text-xs text-gray-500 border-t pt-2 mt-2">
                              <p>• Pencarian tidak case-sensitive (tidak memperhatikan huruf besar/kecil)</p>
                              <p>• Bisa dikombinasikan: <code className="text-blue-600">(ATK OR ALAT) AND 521211</code></p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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
                    {filteredData.map((row, rowIndex) => {
                      const indent = row.__level * 20;
                      const showExpandCollapse = row.__hasChildren || row.__isDataGroup;
                      const isGroup = row.__isGroup;
                      const isDataGroup = row.__isDataGroup;
                      const kode = row[0] || '';
                      const uraian = row[1] || '';
                      const paguRevisi = row[2];
                      const sdPeriode = row[6];
                      
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
                    })}
                    {result && searchTerm && (
                      <tr className="bg-gray-100 border-t-2 border-gray-300">
                        <td colSpan={2} className="px-6 py-2 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {isProcessing ? 'Menghitung...' : 'Total Hasil Pencarian'}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                          {isProcessing ? '...' : (
                            filteredData
                              .filter(row => !row.__isGroup && !row.__isDataGroup) // Exclude group/header rows
                              .reduce((sum, row) => sum + (Number(row[2]) || 0), 0)
                              .toLocaleString('id-ID')
                          )}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                          {isProcessing ? '...' : (
                            filteredData
                              .filter(row => !row.__isGroup && !row.__isDataGroup) // Exclude group/header rows
                              .reduce((sum, row) => sum + (Number(row[6]) || 0), 0)
                              .toLocaleString('id-ID')
                          )}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                          {isProcessing ? '...' : (() => {
                            const dataRows = filteredData.filter(row => !row.__isGroup && !row.__isDataGroup);
                            const totalPagu = dataRows.reduce((sum, row) => sum + (Number(row[2]) || 0), 0);
                            const totalRealisasi = dataRows.reduce((sum, row) => sum + (Number(row[6]) || 0), 0);
                            return totalPagu > 0 
                              ? `${((totalRealisasi / totalPagu) * 100).toFixed(2)}%`
                              : '0%';
                          })()}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                          {isProcessing ? '...' : (() => {
                            const dataRows = filteredData.filter(row => !row.__isGroup && !row.__isDataGroup);
                            const totalPagu = dataRows.reduce((sum, row) => sum + (Number(row[2]) || 0), 0);
                            const totalRealisasi = dataRows.reduce((sum, row) => sum + (Number(row[6]) || 0), 0);
                            return (totalPagu - totalRealisasi).toLocaleString('id-ID');
                          })()}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {/* Daftar Kegiatan */}
        {result && (
          <div className="bg-white shadow-xl rounded-xl p-6 mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Daftar Kegiatan</h2>
              <button
                onClick={() => setShowActivityForm(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Tambah Kegiatan
              </button>
            </div>

            {/* Daftar Kegiatan */}
            {activities.length > 0 ? (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900">{activity.nama}</h3>
                        <p className="text-sm text-gray-500">
                          {activity.allocations.length} alokasi • Total: Rp {calculateTotalAllocation(activity.allocations).toLocaleString('id-ID')}
                        </p>
                      </div>
                      <button 
                        onClick={() => handleRemoveActivity(activity.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Hapus Kegiatan"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    {activity.allocations.length > 0 && (
                      <div className="mt-2 text-sm">
                        <h4 className="font-medium text-gray-700 mb-1">Alokasi Anggaran:</h4>
                        <ul className="space-y-1">
                          {activity.allocations.map((alloc, idx) => (
                            <li key={idx} className="flex justify-between">
                              <span>{alloc.kode}</span>
                              <span>Rp {alloc.jumlah.toLocaleString('id-ID')}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">Belum ada kegiatan. Klik 'Tambah Kegiatan' untuk memulai.</p>
            )}
          </div>
        )}

        {/* Modal Tambah Kegiatan */}
        {showActivityForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg w-full max-w-md p-6">
              <h2 className="text-xl font-semibold mb-4">Tambah Kegiatan Baru</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nama Kegiatan</label>
                  <input
                    type="text"
                    value={newActivity.nama}
                    onChange={(e) => setNewActivity({...newActivity, nama: e.target.value})}
                    className="w-full p-2 border rounded-md"
                    placeholder="Contoh: Pembangunan Jalan"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tambah Alokasi Anggaran</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newAllocation.kode}
                      onChange={(e) => setNewAllocation({...newAllocation, kode: e.target.value})}
                      className="flex-1 p-2 border rounded-md"
                      placeholder="Kode Anggaran"
                    />
                    <input
                      type="number"
                      value={newAllocation.jumlah || ''}
                      onChange={(e) => setNewAllocation({...newAllocation, jumlah: Number(e.target.value)})}
                      className="w-32 p-2 border rounded-md"
                      placeholder="Jumlah"
                    />
                    <button
                      onClick={handleAddAllocation}
                      className="bg-blue-100 text-blue-700 px-3 rounded-md hover:bg-blue-200"
                    >
                      Tambah
                    </button>
                  </div>
                </div>

                {newActivity.allocations.length > 0 && (
                  <div className="border-t pt-3">
                    <h4 className="font-medium text-gray-700 mb-2">Daftar Alokasi</h4>
                    <ul className="space-y-2">
                      {newActivity.allocations.map((alloc, idx) => (
                        <li key={idx} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                          <div>
                            <span className="font-medium">{alloc.kode}</span>
                            <span className="ml-2 text-gray-600">Rp {alloc.jumlah.toLocaleString('id-ID')}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveAllocation(idx)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 text-right font-medium">
                      Total: Rp {calculateTotalAllocation(newActivity.allocations).toLocaleString('id-ID')}
                    </div>
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    onClick={() => setShowActivityForm(false)}
                    className="px-4 py-2 text-gray-700 border rounded-md hover:bg-gray-50"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleAddActivity}
                    disabled={!newActivity.nama || newActivity.allocations.length === 0}
                    className={`px-4 py-2 text-white rounded-md ${!newActivity.nama || newActivity.allocations.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    Simpan Kegiatan
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}