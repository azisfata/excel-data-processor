
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { ProcessingResult, Activity, BudgetAllocation } from './types';
import { processExcelData, downloadExcelFile, parseExcelFile } from './services/excelProcessor';
import { createHierarchy, flattenTree } from './utils/hierarchy';
import * as supabaseService from './services/supabaseService';

// --- Icon Components ---
const UploadIcon = () => (
  <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
  </svg>
);

const Spinner = () => (
  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const InitializingSpinner = () => (
    <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <div className="flex items-center space-x-3">
            <Spinner />
            <span className="text-lg text-gray-700">Menginisialisasi data...</span>
        </div>
    </div>
);


// --- Main App Component ---
export default function App() {
  // Loading states
  const [isInitializing, setIsInitializing] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Data states
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // UI states
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [hierarchicalData, setHierarchicalData] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [maxDepth, setMaxDepth] = useState<number>(6);
  const [showActivityForm, setShowActivityForm] = useState(false);

  // Form states
  const [newActivity, setNewActivity] = useState<Omit<Activity, 'id'>>({ nama: '', allocations: [] });
  const [newAllocation, setNewAllocation] = useState<BudgetAllocation>({ kode: '', jumlah: 0 });

  // Initial data loading from Supabase
  useEffect(() => {
    async function loadInitialData() {
      setIsInitializing(true);
      try {
        const [processedResultData, activitiesData, maxDepthSetting] = await Promise.all([
          supabaseService.getLatestProcessedResult(),
          supabaseService.getActivities(),
          supabaseService.getSetting('hierarchyMaxDepth')
        ]);

        if (processedResultData) {
          setResult(processedResultData.result);
          setLastUpdated(processedResultData.lastUpdated);
        }

        setActivities(activitiesData);

        if (maxDepthSetting) {
          setMaxDepth(parseInt(maxDepthSetting, 10));
        }
      } catch (err) {
        console.error("Error loading initial data:", err);
        setError("Gagal memuat data dari server. Silakan segarkan halaman.");
      } finally {
        setIsInitializing(false);
      }
    }
    loadInitialData();
  }, []);

  // --- Activity Form Handlers ---
  const handleAddAllocation = () => {
    if (!newAllocation.kode || newAllocation.jumlah <= 0) return;
    setNewActivity(prev => ({ ...prev, allocations: [...prev.allocations, { ...newAllocation }] }));
    setNewAllocation({ kode: '', jumlah: 0 });
  };

  const handleRemoveAllocation = (index: number) => {
    setNewActivity(prev => ({ ...prev, allocations: prev.allocations.filter((_, i) => i !== index) }));
  };

  const handleAddActivity = async () => {
    if (!newActivity.nama || newActivity.allocations.length === 0) return;
    setIsSaving(true);
    try {
      const addedActivity = await supabaseService.addActivity(newActivity);
      setActivities(prev => [...prev, addedActivity]);
      setNewActivity({ nama: '', allocations: [] });
      setShowActivityForm(false);
    } catch (err) {
      setError('Gagal menyimpan kegiatan baru.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveActivity = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus kegiatan ini?')) {
      setIsSaving(true);
      try {
        await supabaseService.removeActivity(id);
        setActivities(prev => prev.filter(activity => activity.id !== id));
      } catch (err) {
        setError('Gagal menghapus kegiatan.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const calculateTotalAllocation = (allocations: BudgetAllocation[]) => {
    return allocations.reduce((sum, item) => sum + item.jumlah, 0);
  };

  // --- Data & Hierarchy Logic ---
  const progressPercentage = useMemo(() => {
    if (!result || typeof result.totals[0] !== 'number' || result.totals[0] <= 0) return 0;
    if (typeof result.totals[4] !== 'number') return 0;
    return (result.totals[4] / result.totals[0]) * 100;
  }, [result]);

  useEffect(() => {
    if (result) {
      const hierarchy = createHierarchy(result.processedDataForPreview);
      const withExpanded = (nodes: any[], currentLevel = 0): any[] => nodes.map(node => {
        const shouldExpand = currentLevel < maxDepth - 1;
        const isExpanded = expandedNodes[node.fullPath] ?? shouldExpand;
        return { ...node, isExpanded, children: withExpanded(Object.values(node.children), currentLevel + 1) };
      });
      const processedHierarchy = withExpanded(hierarchy);
      const flatData = flattenTree(processedHierarchy);
      setHierarchicalData(flatData);
      setFilteredData(flatData);
    }
  }, [result, expandedNodes, maxDepth]);

  const toggleNode = useCallback((path: string, isDataGroup = false) => {
    setExpandedNodes(prev => ({ ...prev, [path]: !prev[path], ...(isDataGroup ? { [`${path}-data`]: !prev[path] } : {}) }));
  }, []);

  const handleDepthChange = async (depth: number) => {
    setMaxDepth(depth);
    try {
      await supabaseService.saveSetting('hierarchyMaxDepth', depth.toString());
    } catch (err) {
      setError('Gagal menyimpan pengaturan level.');
    }
  };

  // --- File Processing ---
  const processFile = useCallback(async (fileToProcess: File) => {
    if (!fileToProcess) return;

    setIsProcessing(true);
    setError(null);
    setResult(null); // Clear previous result immediately

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const binaryStr = event.target?.result;
        const data = parseExcelFile(binaryStr as string | ArrayBuffer);
        const processingResult = processExcelData(data);

        await supabaseService.saveProcessedResult(processingResult, fileToProcess.name);
        
        // After saving, fetch the latest to ensure consistency
        const latestData = await supabaseService.getLatestProcessedResult();
        if (latestData) {
            setResult(latestData.result);
            setLastUpdated(latestData.lastUpdated);
        }

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

  const handleDownload = () => {
      if (!result) return;
      const originalFileName = file?.name.replace(/\.(xlsx|xls)$/, '') || 'laporan';
      const newFileName = `${originalFileName}_processed.xlsx`;
      downloadExcelFile(result.finalData, newFileName);
  };

  // --- Search Logic ---
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredData(hierarchicalData);
      return;
    }
    if (maxDepth < 8) setMaxDepth(8);

    const orGroups = searchTerm.split(/\s+OR\s+/i).map(g => g.trim()).filter(Boolean);
    const filtered = hierarchicalData.filter(item => {
      const kode = String(item[0] || '').toLowerCase();
      const uraian = String(item[1] || '').toLowerCase();
      return orGroups.some(group => {
        const andTerms = group.split(/\s+AND\s+/i).map(t => t.trim().toLowerCase()).filter(Boolean);
        return andTerms.every(term => kode.includes(term) || uraian.includes(term));
      });
    });
    setFilteredData(filtered);
  }, [searchTerm, hierarchicalData, maxDepth]);

  // --- Render Logic ---
  if (isInitializing) {
    return <InitializingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* UPLOAD VIEW */}
        {!result && !isProcessing && (
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
                <p className="text-sm text-gray-600">{isDragActive ? 'Lepaskan file di sini...' : 'Seret file Excel ke sini, atau klik untuk memilih'}</p>
                <p className="text-xs text-gray-500">Hanya file .xls atau .xlsx yang didukung</p>
              </div>
            </div>
          </div>
        )}

        {/* PROCESSING VIEW */}
        {isProcessing && (
            <div className="text-center mt-8">
                <div className="inline-flex items-center px-6 py-3 text-lg font-medium text-blue-800 bg-blue-100 rounded-lg shadow">
                    <Spinner /> Memproses dan menyimpan file...
                </div>
            </div>
        )}

        {error && (
            <div className="mt-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md max-w-3xl mx-auto" role="alert">
                <p className="font-bold">Terjadi Kesalahan</p>
                <p>{error}</p>
            </div>
        )}

        {/* DASHBOARD & RESULTS VIEW */}
        {result && !isProcessing && (
          <div className="space-y-6">
            {/* Header */}
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

            {/* Totals & Progress */}
            <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Pagu Revisi, Realisasi, Sisa Anggaran Cards */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-center">
                    <p className="text-sm font-medium text-gray-500 mb-1">Pagu Revisi</p>
                    <p className="text-lg font-semibold text-gray-900">{(result.totals[0] || 0).toLocaleString('id-ID')}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-center">
                    <p className="text-sm font-medium text-gray-500 mb-1">Realisasi</p>
                    <p className="text-lg font-semibold text-gray-900">{(result.totals[4] || 0).toLocaleString('id-ID')}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-center">
                    <p className="text-sm font-medium text-gray-500 mb-1">Sisa Anggaran</p>
                    <p className="text-lg font-semibold text-gray-900">{(Number(result.totals[0] || 0) - Number(result.totals[4] || 0)).toLocaleString('id-ID')}</p>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                  <div className="max-w-3xl mx-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Capaian Realisasi</span>
                      <span className="text-sm font-semibold text-indigo-700">{progressPercentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5"><div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full" style={{ width: `${progressPercentage}%` }}/></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                {/* Search and Filter */}
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
                        className="block w-full sm:w-64 pl-10 pr-8 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                        title="Contoh: a and b atau x or y"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                        <div className="relative group">
                            <svg 
                              className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" 
                              fill="none" 
                              viewBox="0 0 24 24" 
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="absolute z-20 invisible group-hover:visible w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-700"
                              style={{ top: 'calc(100% + 8px)', right: '0' }}
                            >
                              <p className="font-semibold text-gray-900 border-b pb-1 mb-2">Panduan Pencarian</p>
                              <p><code className="text-blue-600">ATK AND 521211</code>: Mencari baris yang mengandung KEDUA kata.</p>
                              <p><code className="text-blue-600">ATK OR 521211</code>: Mencari baris yang mengandung SALAH SATU kata.</p>
                              <p className="text-xs text-gray-500 mt-2">• Tidak case-sensitive. Kombinasikan dengan `AND` atau `OR`.</p>
                            </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center">
                        <label htmlFor="depthSelect" className="text-sm font-medium text-gray-700 mr-2">Level:</label>
                        <select id="depthSelect" value={maxDepth} onChange={(e) => handleDepthChange(parseInt(e.target.value, 10))} className="block rounded-md border-gray-300 py-1.5 pl-2 pr-8 text-sm">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                </div>
                {/* Upload/Download Buttons */}
                <div className="flex space-x-1.5">
                    <button onClick={() => document.getElementById('file-upload-hidden')?.click()} className="inline-flex items-center px-3 py-1 text-xs text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">Unggah Baru</button>
                    <input id="file-upload-hidden" type="file" className="hidden" accept=".xls,.xlsx" onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
                    <button onClick={handleDownload} className="inline-flex items-center px-3 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">Unduh Hasil</button>
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
                      const paguRevisi = row[2];
                      const sdPeriode = row[6];
                      return (
                        <tr key={`${row.__path}-${rowIndex}`} className={`hover:bg-gray-50 ${isGroup ? 'bg-gray-50' : ''}`}>
                          <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            <div className="flex items-center" style={{ paddingLeft: `${indent}px` }}>
                              {showExpandCollapse && <button onClick={() => toggleNode(row.__path, row.__isDataGroup)} className="mr-2 w-4">{row.__isExpanded ? '▼' : '▶'}</button>}
                              {!showExpandCollapse && <div className="w-6"></div>}
                              <span>{row[0]}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-700">{row[1]}</td>
                          <td className="px-6 py-3 text-right">{(typeof paguRevisi === 'number') ? paguRevisi.toLocaleString('id-ID') : paguRevisi}</td>
                          <td className="px-6 py-3 text-right">{(typeof sdPeriode === 'number') ? sdPeriode.toLocaleString('id-ID') : sdPeriode}</td>
                          <td className="px-6 py-3 text-right">{(paguRevisi > 0 && typeof sdPeriode === 'number') ? `${((sdPeriode / paguRevisi) * 100).toFixed(2)}%` : ''}</td>
                          <td className="px-6 py-3 text-right">{(typeof paguRevisi === 'number' && typeof sdPeriode === 'number') ? (paguRevisi - sdPeriode).toLocaleString('id-ID') : ''}</td>
                        </tr>
                      );
                    })}
                    {searchTerm && (
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td colSpan={2} className="px-6 py-2 text-sm text-gray-900">Total Hasil Pencarian</td>
                        <td className="px-6 py-2 text-right text-sm text-gray-900">
                          {(() => {
                            const dataRows = filteredData.filter(row => !row.__hasChildren && !row.__isDataGroup);
                            return dataRows.reduce((sum, row) => sum + (Number(row[2]) || 0), 0).toLocaleString('id-ID');
                          })()}
                        </td>
                        <td className="px-6 py-2 text-right text-sm text-gray-900">
                          {(() => {
                            const dataRows = filteredData.filter(row => !row.__hasChildren && !row.__isDataGroup);
                            return dataRows.reduce((sum, row) => sum + (Number(row[6]) || 0), 0).toLocaleString('id-ID');
                          })()}
                        </td>
                        <td className="px-6 py-2 text-right text-sm text-gray-900">
                          {(() => {
                            const dataRows = filteredData.filter(row => !row.__hasChildren && !row.__isDataGroup);
                            const totalPagu = dataRows.reduce((sum, row) => sum + (Number(row[2]) || 0), 0);
                            const totalRealisasi = dataRows.reduce((sum, row) => sum + (Number(row[6]) || 0), 0);
                            return totalPagu > 0 ? `${((totalRealisasi / totalPagu) * 100).toFixed(2)}%` : '0%';
                          })()}
                        </td>
                        <td className="px-6 py-2 text-right text-sm text-gray-900">
                          {(() => {
                            const dataRows = filteredData.filter(row => !row.__hasChildren && !row.__isDataGroup);
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

            {/* Activities Section */}
            <div className="bg-white shadow-xl rounded-xl p-6 mt-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">Daftar Kegiatan</h2>
                    <button onClick={() => setShowActivityForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">Tambah Kegiatan</button>
                </div>
                {activities.length > 0 ? (
                    <div className="space-y-4">
                        {activities.map((activity) => (
                            <div key={activity.id} className="border rounded-lg p-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-medium text-gray-900">{activity.nama}</h3>
                                        <p className="text-sm text-gray-500">{activity.allocations.length} alokasi • Total: Rp {calculateTotalAllocation(activity.allocations).toLocaleString('id-ID')}</p>
                                    </div>
                                    <button onClick={() => handleRemoveActivity(activity.id)} className="text-red-500 hover:text-red-700">Hapus</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-gray-500 text-center py-4">Belum ada kegiatan.</p>}
            </div>
          </div>
        )}

        {/* Add Activity Modal */}
        {showActivityForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg w-full max-w-md p-6">
              <h2 className="text-xl font-semibold mb-4">Tambah Kegiatan Baru</h2>
              <div className="space-y-4">
                <input type="text" value={newActivity.nama} onChange={(e) => setNewActivity({...newActivity, nama: e.target.value})} className="w-full p-2 border rounded-md" placeholder="Nama Kegiatan"/>
                <div className="flex space-x-2">
                    <input type="text" value={newAllocation.kode} onChange={(e) => setNewAllocation({...newAllocation, kode: e.target.value})} className="flex-1 p-2 border rounded-md" placeholder="Kode Anggaran"/>
                    <input type="number" value={newAllocation.jumlah || ''} onChange={(e) => setNewAllocation({...newAllocation, jumlah: Number(e.target.value)})} className="w-32 p-2 border rounded-md" placeholder="Jumlah"/>
                    <button onClick={handleAddAllocation} className="bg-blue-100 text-blue-700 px-3 rounded-md">Tambah</button>
                </div>
                {newActivity.allocations.length > 0 && (
                  <ul className="space-y-2 border-t pt-3">
                    {newActivity.allocations.map((alloc, idx) => <li key={idx} className="flex justify-between items-center bg-gray-50 p-2 rounded"><span>{alloc.kode}: Rp {alloc.jumlah.toLocaleString('id-ID')}</span><button onClick={() => handleRemoveAllocation(idx)} className="text-red-500">X</button></li>)}
                  </ul>
                )}
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button onClick={() => setShowActivityForm(false)} className="px-4 py-2 text-gray-700 border rounded-md">Batal</button>
                  <button onClick={handleAddActivity} disabled={!newActivity.nama || newActivity.allocations.length === 0 || isSaving} className="px-4 py-2 text-white bg-blue-600 rounded-md disabled:bg-gray-300">{isSaving ? 'Menyimpan...' : 'Simpan Kegiatan'}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
