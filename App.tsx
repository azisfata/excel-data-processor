import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useDropzone, type DropzoneOptions } from 'react-dropzone';
import { ProcessingResult, Activity, ActivityAttachment, BudgetAllocation } from './types';
import { processExcelData, downloadExcelFile, parseExcelFile } from './services/excelProcessor';
import { createHierarchy, flattenTree } from './utils/hierarchy';
import * as supabaseService from './services/supabaseService';
import * as attachmentService from './services/activityAttachmentService';
import { supabase } from './utils/supabase';

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

const PAGE_SIZE_OPTIONS = [5, 10, 50, 100, 'all'] as const;

// --- Icon Components ---
const UploadIcon = () => (
  <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
  </svg>
);

const App: React.FC = () => {
  // State for activity management
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [newActivity, setNewActivity] = useState<Omit<Activity, 'id'>>({ 
    nama: '', 
    status: 'Komitmen', 
    allocations: [],
    attachments: [],
    tanggal_pelaksanaan: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [newAllocation, setNewAllocation] = useState<Omit<BudgetAllocation, 'id'>>({ 
    kode: '', 
    uraian: '',
    jumlah: 0 
  });
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activityAttachments, setActivityAttachments] = useState<ActivityAttachment[]>([]);
  const [newAttachmentFiles, setNewAttachmentFiles] = useState<File[]>([]);
  const [attachmentsToRemove, setAttachmentsToRemove] = useState<Set<string>>(new Set());
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'all' | 'no-date'>(() => new Date().getMonth());
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [activitySearchTerm, setActivitySearchTerm] = useState('');
  const [activitiesPerPage, setActivitiesPerPage] = useState<number | 'all'>(10);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [latestReportMeta, setLatestReportMeta] = useState<{ reportType: string | null; reportDate: string | null }>({
    reportType: null,
    reportDate: null,
  });
  const [showUploadMetadataModal, setShowUploadMetadataModal] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [uploadReportType, setUploadReportType] = useState<'Akrual' | 'SP2D'>('Akrual');
  const [uploadReportDate, setUploadReportDate] = useState('');
  const [uploadMetadataError, setUploadMetadataError] = useState('');
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const currentMonthIndex = useMemo(() => new Date().getMonth(), []);
  const getAttachmentDownloadUrl = useCallback(
    (attachment: ActivityAttachment) =>
      `/api/activities/${attachment.activityId}/attachments/${attachment.attachmentId}/download`,
    []
  );
  const isInlinePreview = useCallback((fileName: string) => /\.(pdf|png|jpe?g|gif)$/i.test(fileName), []);

  // State for file processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [hierarchicalData, setHierarchicalData] = useState<any[]>([]);
  const [displayedData, setDisplayedData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [maxDepth, setMaxDepth] = useState(7);
  const [isTableExpanded, setIsTableExpanded] = useState(true);
  const [showAccountSummary, setShowAccountSummary] = useState(true);
  const [showActivities, setShowActivities] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [error, setError] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  
  // Refs
  const historyRef = useRef<HTMLDivElement>(null);
  
  // Format currency helper function
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('id-ID', { 
      style: 'currency', 
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0 
    }).format(amount);
  };
  
  // State for expanded nodes
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
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

const HistoryDropdown = () => (
    <div className="relative" ref={historyRef}>
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="flex items-center space-x-1 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md transition-colors"
      >
        <span>Riwayat</span>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {showHistory && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg overflow-hidden z-50 border border-gray-200">
          <div className="py-1">
            {history.length === 0 ? (
              <div className="px-4 py-2 text-sm text-gray-500">Tidak ada riwayat</div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="group relative">
                  <button
                    onClick={() => loadHistoricalResult(item.id)}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 pr-8"
                  >
                    <div className="font-medium truncate">
                      {item.reportType || 'Laporan'}{' '}
                      {item.reportDate
                        ? new Date(item.reportDate).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'UTC',
                          })
                        : ''}
                    </div>
                    <div className="text-xs text-gray-500">Diproses: {item.formattedDate}</div>
                  </button>
                  <div 
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      console.log('Delete button clicked for ID:', item.id);
                      deleteHistoryItem(item.id);
                    }}
                  >
                    <button
                      type="button"
                      className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none"
                      title="Hapus dari riwayat"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );



  // Load history from Supabase
  const loadHistory = useCallback(async () => {
    try {
      const historyData = await supabaseService.getAllProcessedResults();
      setHistory(
        historyData.map(item => ({
          id: item.id,
          fileName: item.fileName,
          formattedDate: item.formattedDate,
          createdAt: item.createdAt,
          reportType: item.reportType ?? null,
          reportDate: item.reportDate ?? null,
        }))
      );
    } catch (err) {
      console.error('Error loading history:', err);
      setError('Gagal memuat riwayat pemrosesan.');
    }
  }, []);

  // Delete a history item
  const deleteHistoryItem = useCallback(async (id: string) => {
    console.log('Delete initiated for ID:', id);
    
    // Show confirmation dialog
    const confirmMessage = 'Apakah Anda yakin ingin menghapus riwayat ini?';
    console.log('Showing confirmation dialog...');
    const isConfirmed = window.confirm(confirmMessage);
    console.log('User confirmed:', isConfirmed);
    
    if (!isConfirmed) return;

    try {
      console.log('Attempting to delete history item with ID:', id);
      
      // First, try to fetch the record to ensure it exists
      const { data: existing, error: fetchError } = await supabase
        .from('processed_results')
        .select('id')
        .eq('id', id)
        .single();
        
      console.log('Fetch result:', { existing, fetchError });
      
      if (fetchError) {
        console.error('Error fetching record:', fetchError);
        throw new Error('Gagal memeriksa data yang akan dihapus');
      }
      
      if (!existing) {
        throw new Error('Data tidak ditemukan');
      }
      
      // If we get here, the record exists - proceed with deletion
      const { error: deleteError } = await supabase
        .from('processed_results')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('Supabase delete error:', deleteError);
        throw deleteError;
      }
      
      console.log('Successfully deleted record with ID:', id);
      
      // Update local state directly for immediate UI update
      setHistory(prev => prev.filter(item => item.id !== id));
      
      // Also refresh from server to ensure consistency
      loadHistory().catch(err => {
        console.error('Error refreshing history after delete:', err);
      });
    } catch (err) {
      console.error('Error in deleteHistoryItem:', err);
      setError('Gagal menghapus riwayat');
    }
  }, [loadHistory]);

  // Load a specific historical result
  const loadHistoricalResult = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('processed_results')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Data not found');

      const normalizedResult: ProcessingResult = {
        finalData: data.processed_data ?? [],
        totals: data.totals ?? [],
        processedDataForPreview: data.processed_data?.slice(0, 100) ?? [],
        accountNameMap: data.account_name_map
          ? new Map(Object.entries(data.account_name_map as Record<string, string>))
          : new Map(),
      };

      setResult(normalizedResult);
      setFile(null);
      setLatestReportMeta({
        reportType: data.report_type || null,
        reportDate: data.report_date || null,
      });
      setLastUpdated(new Date(data.created_at).toLocaleString('id-ID'));
      setShowHistory(false);
    } catch (err) {
      console.error('Error loading historical result:', err);
      setLatestReportMeta({ reportType: null, reportDate: null });
      setError('Gagal memuat data riwayat yang dipilih.');
    }
  }, []);

  // Close history dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Initial data loading from Supabase
  useEffect(() => {
    async function loadInitialData() {
      setIsInitializing(true);
      try {
        const [processedResultData, activitiesData, attachmentsMap, maxDepthSetting] = await Promise.all([
          supabaseService.getLatestProcessedResult(),
          supabaseService.getActivities(),
          attachmentService.fetchActivityAttachments().catch((err) => {
            console.error('Error loading attachments:', err);
            return {} as Record<string, ActivityAttachment[]>;
          }),
          supabaseService.getSetting('hierarchyMaxDepth')
        ]);

        if (processedResultData) {
          setResult(processedResultData.result);
          setLastUpdated(processedResultData.lastUpdated);
          setLatestReportMeta({
            reportType: processedResultData.reportType,
            reportDate: processedResultData.reportDate,
          });
        } else {
          setResult(null);
          setLatestReportMeta({ reportType: null, reportDate: null });
        }

        const attachmentsLookup: Record<string, ActivityAttachment[]> = attachmentsMap ?? {};
        const mergedActivities = activitiesData.map(activity => ({
          ...activity,
          attachments: attachmentsLookup[activity.id] ?? []
        }));
        setActivities(mergedActivities);

        if (maxDepthSetting) {
          setMaxDepth(parseInt(maxDepthSetting, 10));
        }

        // Load history after initial data
        await loadHistory();
      } catch (err) {
        console.error("Error loading initial data:", err);
        setError("Gagal memuat data dari server. Silakan segarkan halaman.");
      } finally {
        setIsInitializing(false);
      }
    }
    loadInitialData();
  }, []);

  useEffect(() => {
    if (showActivityForm && !isEditing) {
      setNewActivity({ nama: '', allocations: [], status: 'Rencana', attachments: [], tanggal_pelaksanaan: '' });
      setActivityAttachments([]);
      setNewAttachmentFiles([]);
      setAttachmentsToRemove(new Set());
    }
  }, [showActivityForm, isEditing]);

  // Format number with thousand separators
  const formatNumber = (num: string): string => {
    // Remove all non-digit characters
    const numStr = num.replace(/\D/g, '');
    // Format with thousand separators
    return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  // Parse formatted number back to number
  const parseFormattedNumber = (formatted: string): number => {
    return parseInt(formatted.replace(/\./g, ''), 10) || 0;
  };

  // Handle number input change
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
  
    // Remove all non-digit characters
    const numericValue = value.replace(/\D/g, '');
    
    // Update the state with the numeric value
    setNewAllocation({
      ...newAllocation,
      jumlah: numericValue === '' ? 0 : parseInt(numericValue, 10)
    });
    
    // Update the input value with formatted number (for display)
    e.target.value = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  // --- Activity Form Handlers ---
  const handleAddAllocation = () => {
    if (!newAllocation.kode || newAllocation.jumlah <= 0) return;
    setNewActivity(prev => ({ ...prev, allocations: [...prev.allocations, { ...newAllocation }] }));
    setNewAllocation({ kode: '', uraian: '', jumlah: 0 });
  };

  const handleRemoveAllocation = (index: number) => {
    setNewActivity(prev => ({ ...prev, allocations: prev.allocations.filter((_, i) => i !== index) }));
  };

  const handleAttachmentSelection = (files: FileList | File[] | null) => {
    if (!files) return;
    const incomingFiles = Array.isArray(files) ? files : Array.from(files);
    if (!incomingFiles.length) return;

    setNewAttachmentFiles(prev => {
      const existingKeys = new Set(prev.map(file => `${file.name}_${file.lastModified}`));
      const additions = incomingFiles.filter(file => {
        const key = `${file.name}_${file.lastModified}`;
        if (existingKeys.has(key)) {
          return false;
        }
        existingKeys.add(key);
        return true;
      });
      return [...prev, ...additions];
    });
  };

  const handleRemoveNewAttachment = (index: number) => {
    setNewAttachmentFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toggleAttachmentRemoval = (attachmentId: string) => {
    setAttachmentsToRemove(prev => {
      const next = new Set(prev);
      if (next.has(attachmentId)) {
        next.delete(attachmentId);
      } else {
        next.add(attachmentId);
      }
      return next;
    });
  };

  const handleYearFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedYear(value === 'all' ? 'all' : Number(value));
  };

  const handleMonthFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === 'all' || value === 'no-date') {
      setSelectedMonth(value);
    } else {
      const monthNumber = Number(value);
      if (!Number.isNaN(monthNumber)) {
        setSelectedMonth(monthNumber);
      }
    }
    setShowAllActivities(false);
  };

  const handleStatusFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStatus(event.target.value);
  };

  const handleResetFilters = () => {
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonthIndex);
    setShowAllActivities(false);
    setSelectedStatus('all');
  };

  const handleShowAllToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    setShowAllActivities(event.target.checked);
  };

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === 'all') {
      setActivitiesPerPage('all');
    } else {
      const parsed = Number(value);
      setActivitiesPerPage(Number.isNaN(parsed) ? 10 : parsed);
    }
  };

  // --- File Processing ---
  const processFile = useCallback(
    async (fileToProcess: File, metadata: { reportType: 'Akrual' | 'SP2D'; reportDate: string }) => {
      if (!fileToProcess) return;

      setIsProcessing(true);
      setError('');
      setResult(null); // Clear previous result immediately

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const binaryStr = event.target?.result;
          const data = parseExcelFile(binaryStr as string | ArrayBuffer);
          const processingResult = processExcelData(data);

          await supabaseService.saveProcessedResult(processingResult, fileToProcess.name, {
            reportType: metadata.reportType,
            reportDate: metadata.reportDate,
          });

          // After saving, fetch the latest to ensure consistency
          const latestData = await supabaseService.getLatestProcessedResult();
          if (latestData) {
            setResult(latestData.result);
            setLastUpdated(latestData.lastUpdated);
            setLatestReportMeta({
              reportType: latestData.reportType,
              reportDate: latestData.reportDate,
            });
          }
          
          // Refresh the history list to include the new entry
          await loadHistory();

          setFile(fileToProcess);
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
    },
    []
  );

  const handleFileSelection = useCallback((selectedFile: File | null) => {
    if (!selectedFile) return;
    setError('');
    setPendingUploadFile(selectedFile);
    setUploadReportType('Akrual');
    setUploadReportDate(new Date().toISOString().slice(0, 10));
    setUploadMetadataError('');
    setShowUploadMetadataModal(true);
  }, []);

  const handleCancelUpload = useCallback(() => {
    setShowUploadMetadataModal(false);
    setPendingUploadFile(null);
    setUploadMetadataError('');
  }, []);

  const handleConfirmUpload = useCallback(async () => {
    if (!pendingUploadFile) {
      setUploadMetadataError('Pilih file realisasi terlebih dahulu.');
      return;
    }
    if (!uploadReportDate) {
      setUploadMetadataError('Tanggal realisasi wajib diisi.');
      return;
    }
    const parsedDate = new Date(uploadReportDate);
    if (Number.isNaN(parsedDate.getTime())) {
      setUploadMetadataError('Tanggal realisasi tidak valid.');
      return;
    }
    setUploadMetadataError('');
    setShowUploadMetadataModal(false);
    try {
      await processFile(pendingUploadFile, { reportType: uploadReportType, reportDate: uploadReportDate });
    } finally {
      setPendingUploadFile(null);
    }
  }, [pendingUploadFile, uploadReportDate, uploadReportType, processFile]);

  const formatMonthLabel = useCallback((date: Date) => {
    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }, []);

  const formatActivityDate = useCallback((value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    activities.forEach(activity => {
      if (!activity.tanggal_pelaksanaan) return;
      const date = new Date(activity.tanggal_pelaksanaan);
      if (!Number.isNaN(date.getTime())) {
        years.add(date.getFullYear());
      }
    });
    if (!years.size) {
      years.add(currentYear);
    } else if (!years.has(currentYear)) {
      years.add(currentYear);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [activities, currentYear]);

  const hasNoDateActivities = useMemo(
    () => activities.some(activity => !activity.tanggal_pelaksanaan || Number.isNaN(new Date(activity.tanggal_pelaksanaan).getTime())),
    [activities]
  );

  const monthOptions = useMemo(
    () => MONTH_NAMES_ID.map((label, index) => ({ label, value: index })),
    []
  );

  const activitiesByMonth = useMemo(() => {
    if (!activities.length) return [];

    type GroupBucket = {
      key: string;
      label: string;
      sortKey: number;
      year: number | null;
      month: number | null;
      isNoDate: boolean;
      activities: Activity[];
    };

    const groupMap = new Map<string, GroupBucket>();

    activities.forEach(activity => {
      const rawDate = activity.tanggal_pelaksanaan;
      const parsedDate = rawDate ? new Date(rawDate) : null;
      const hasValidDate = parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime());
      const label = hasValidDate ? formatMonthLabel(parsedDate) : 'Tanpa Tanggal';
      const sortKey = hasValidDate
        ? new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1).getTime()
        : Number.NEGATIVE_INFINITY;
      const key = hasValidDate
        ? `${parsedDate.getFullYear()}-${parsedDate.getMonth()}`
        : 'no-date';

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key,
          label,
          sortKey,
          year: hasValidDate ? parsedDate.getFullYear() : null,
          month: hasValidDate ? parsedDate.getMonth() : null,
          isNoDate: !hasValidDate,
          activities: []
        });
      }

      groupMap.get(key)!.activities.push(activity);
    });

    const grouped = Array.from(groupMap.values());

    grouped.forEach(group => {
      group.activities.sort((a, b) => {
        const dateA = a.tanggal_pelaksanaan ? new Date(a.tanggal_pelaksanaan).getTime() : 0;
        const dateB = b.tanggal_pelaksanaan ? new Date(b.tanggal_pelaksanaan).getTime() : 0;

        if (dateA && dateB) {
          return dateB - dateA;
        }
        if (dateA) return -1;
        if (dateB) return 1;
        return a.nama.localeCompare(b.nama);
      });
    });

    grouped.sort((a, b) => {
      if (a.sortKey === b.sortKey) {
        return a.label.localeCompare(b.label);
      }
      return b.sortKey - a.sortKey;
    });

    return grouped;
  }, [activities, formatMonthLabel]);

  const filteredActivityGroups = useMemo(() => {
    if (!activitiesByMonth.length) return [];

    const normalizedSearch = activitySearchTerm.trim().toLowerCase();
    const matchesSearch = (activity: Activity) =>
      !normalizedSearch || activity.nama.toLowerCase().includes(normalizedSearch);
    const matchesStatus = (activity: Activity) =>
      selectedStatus === 'all' ||
      (activity.status ? activity.status.toLowerCase() === selectedStatus.toLowerCase() : selectedStatus === 'tanpa-status');

    const baseGroups = showAllActivities
      ? activitiesByMonth
      : activitiesByMonth.filter(group => {
          if (selectedMonth === 'no-date') {
            return group.isNoDate;
          }

          if (group.isNoDate) {
            return selectedMonth === 'all' && selectedYear === 'all';
          }

          const matchesYear = selectedYear === 'all' || group.year === selectedYear;
          const matchesMonth = selectedMonth === 'all' || group.month === selectedMonth;

          return matchesYear && matchesMonth;
        });

    const filtered = baseGroups
      .map(group => ({
        ...group,
        activities: group.activities.filter(activity => matchesSearch(activity) && matchesStatus(activity)),
      }))
      .filter(group => group.activities.length > 0);

    if (!filtered.length && normalizedSearch) {
      const fallback = activitiesByMonth
        .map(group => ({
          ...group,
          activities: group.activities.filter(activity => matchesSearch(activity) && matchesStatus(activity)),
        }))
        .filter(group => group.activities.length > 0);

      return fallback;
    }

    return filtered;
  }, [activitiesByMonth, selectedMonth, selectedYear, showAllActivities, activitySearchTerm, selectedStatus]);

  const flattenedActivities = useMemo(
    () =>
      filteredActivityGroups.flatMap(group =>
        group.activities.map(activity => ({
          groupKey: group.key,
          groupLabel: group.label,
          activity,
        }))
      ),
    [filteredActivityGroups]
  );

  const totalActivities = flattenedActivities.length;
  const totalPages =
    totalActivities === 0 || activitiesPerPage === 'all'
      ? 1
      : Math.ceil(totalActivities / activitiesPerPage);

  useEffect(() => {
    setActivitiesPage(prev => {
      const safeTotalPages = totalPages || 1;
      return prev > safeTotalPages ? safeTotalPages : prev;
    });
  }, [totalPages]);

  useEffect(() => {
    setActivitiesPage(1);
  }, [selectedYear, selectedMonth, selectedStatus, activitySearchTerm, showAllActivities, activitiesPerPage]);

  const paginatedActivityGroups = useMemo(() => {
    if (!flattenedActivities.length) return [];
    const slice =
      activitiesPerPage === 'all'
        ? flattenedActivities
        : flattenedActivities.slice(
            (activitiesPage - 1) * activitiesPerPage,
            (activitiesPage - 1) * activitiesPerPage + activitiesPerPage
          );
    const map = new Map<string, { key: string; label: string; activities: Activity[] }>();

    slice.forEach(item => {
      if (!map.has(item.groupKey)) {
        map.set(item.groupKey, {
          key: item.groupKey,
          label: item.groupLabel,
          activities: [],
        });
      }
      map.get(item.groupKey)!.activities.push(item.activity);
    });

    return Array.from(map.values());
  }, [flattenedActivities, activitiesPage, activitiesPerPage]);

  const pageRangeStart =
    totalActivities === 0
      ? 0
      : activitiesPerPage === 'all'
        ? 1
        : (activitiesPage - 1) * activitiesPerPage + 1;
  const pageRangeEnd =
    totalActivities === 0
      ? 0
      : activitiesPerPage === 'all'
        ? totalActivities
        : Math.min(activitiesPage * activitiesPerPage, totalActivities);
  const totalActivitiesByGroup = useMemo(() => {
    const map = new Map<string, number>();
    filteredActivityGroups.forEach(group => {
      map.set(group.key, group.activities.length);
    });
    return map;
  }, [filteredActivityGroups]);

  const handleAddActivity = async () => {
    if (!newActivity.nama || newActivity.allocations.length === 0) return;
    setIsSaving(true);
    try {
      let savedActivity: Activity;
      const remainingAttachments = activityAttachments.filter(
        attachment => !attachmentsToRemove.has(attachment.attachmentId)
      );

      const payload = {
        ...newActivity,
        attachments: remainingAttachments
      };

      if (isEditing && editingActivityId) {
        await supabaseService.updateActivity(editingActivityId, payload);
        savedActivity = { ...payload, id: editingActivityId };
      } else {
        savedActivity = await supabaseService.addActivity(payload);
      }

      if (isEditing && editingActivityId) {
        for (const attachmentId of attachmentsToRemove) {
          try {
            await attachmentService.deleteActivityAttachment(editingActivityId, attachmentId);
          } catch (attachmentErr) {
            console.error('Error deleting attachment:', attachmentErr);
            throw new Error('Gagal menghapus lampiran kegiatan.');
          }
        }
      }

      let updatedAttachments = [...remainingAttachments];

      if (newAttachmentFiles.length > 0) {
        try {
          const uploaded = await attachmentService.uploadActivityAttachments(savedActivity.id, newAttachmentFiles);
          updatedAttachments = [...updatedAttachments, ...uploaded];
        } catch (uploadErr) {
          console.error('Error uploading attachment(s):', uploadErr);
          throw new Error('Gagal mengunggah lampiran kegiatan.');
        }
      }

      const activityWithAttachments: Activity = {
        ...savedActivity,
        attachments: updatedAttachments
      };

      if (isEditing && editingActivityId) {
        setActivities(prev => prev.map(activity => 
          activity.id === editingActivityId ? activityWithAttachments : activity
        ));
        if (selectedActivity?.id === editingActivityId) {
          setSelectedActivity(activityWithAttachments);
        }
      } else {
        setActivities(prev => [...prev, activityWithAttachments]);
      }

      setNewActivity({ nama: '', allocations: [], status: 'Rencana', attachments: [], tanggal_pelaksanaan: '' });
      setActivityAttachments([]);
      setNewAttachmentFiles([]);
      setAttachmentsToRemove(new Set());
      setShowActivityForm(false);
      setIsEditing(false);
      setEditingActivityId(null);
    } catch (err) {
      console.error('Error saving activity:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(isEditing ? 'Gagal memperbarui kegiatan.' : 'Gagal menyimpan kegiatan baru.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditActivity = (activity: Activity) => {
    setNewActivity({
      nama: activity.nama,
      status: activity.status || 'Komitmen',
      allocations: [...activity.allocations],
      attachments: activity.attachments ?? [],
      tanggal_pelaksanaan: activity.tanggal_pelaksanaan || ''
    });
    setActivityAttachments(activity.attachments ?? []);
    setNewAttachmentFiles([]);
    setAttachmentsToRemove(new Set());
    setEditingActivityId(activity.id);
    setIsEditing(true);
    setShowActivityForm(true);
  };

  const handleCancelEdit = () => {
    setNewActivity({ nama: '', allocations: [], status: 'Komitmen', attachments: [], tanggal_pelaksanaan: '' });
    setActivityAttachments([]);
    setNewAttachmentFiles([]);
    setAttachmentsToRemove(new Set());
    setIsEditing(false);
    setEditingActivityId(null);
    setShowActivityForm(false);
  };

  const handleRemoveActivity = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus kegiatan ini?')) {
      setIsSaving(true);
      try {
        await supabaseService.removeActivity(id);
        await attachmentService.deleteActivityAttachment(id).catch(err => {
          console.warn('Failed to remove attachment for activity:', err);
        });
        setActivities(prev => prev.filter(activity => activity.id !== id));
        if (selectedActivity?.id === id) {
          setSelectedActivity(null);
        }
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

  // Calculate level 7 account totals
  const level7Totals = useMemo(() => {
    if (!result) return [];
    
    const totalsMap = new Map();
    
    // Process all rows to find level 7 accounts
    result.finalData.forEach(row => {
      const kode = row[0];
      if (typeof kode === 'string') {
        const parts = kode.split('.');
        if (parts.length === 7) { // Level 7 account code
          const accountCode = parts[6];
          const paguRevisi = Number(row[2]) || 0;
          const realisasi = Number(row[6]) || 0;
          
          if (totalsMap.has(accountCode)) {
            const current = totalsMap.get(accountCode);
            current.paguRevisi += paguRevisi;
            current.realisasi += realisasi;
          } else {
            // Use accountNameMap to get the account name if available
            const accountName = result.accountNameMap?.get(accountCode) || row[1] || `Akun ${accountCode}`;
            totalsMap.set(accountCode, {
              code: accountCode,
              uraian: accountName,
              paguRevisi,
              realisasi,
              persentase: 0,
              sisa: 0
            });
          }
        }
      }
    });
    
    // Calculate percentages and remaining
    const totals = Array.from(totalsMap.values()).map(item => ({
      ...item,
      persentase: item.paguRevisi > 0 ? (item.realisasi / item.paguRevisi) * 100 : 0,
      sisa: item.paguRevisi - item.realisasi
    }));
    
    // Sort by account code
    return totals.sort((a, b) => a.code.localeCompare(b.code));
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
      setDisplayedData(flatData);
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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const uploadedFile = acceptedFiles[0];
      setError('');
      handleFileSelection(uploadedFile);
    }
  }, [handleFileSelection]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    multiple: false,
    onDragEnter: undefined,
    onDragOver: undefined,
    onDragLeave: undefined,
  } as any);

  const handleDownload = () => {
      if (!result) return;
      const originalFileName = file?.name.replace(/\.(xlsx|xls)$/, '') || 'laporan';
      const newFileName = `${originalFileName}_processed.xlsx`;
      downloadExcelFile(result.finalData, newFileName);
  };

  // --- Search Logic ---
  useEffect(() => {
    if (!searchTerm.trim()) {
      setDisplayedData(hierarchicalData);
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
    setDisplayedData(filtered);
  }, [searchTerm, hierarchicalData, maxDepth]);

  // --- Render Logic ---
  if (isInitializing) {
    return <InitializingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
        {showUploadMetadataModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl w-full max-w-lg shadow-xl space-y-6 p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Konfirmasi Unggah Realisasi SAKTI</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Pastikan memilih jenis laporan dan tanggal realisasi sebelum mengunggah.
                  </p>
                </div>
                <button
                  onClick={handleCancelUpload}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">File yang dipilih</p>
                  <p className="mt-1 text-sm text-gray-600 break-words">{pendingUploadFile?.name || '-'}</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="upload-report-type" className="text-sm font-medium text-gray-700">Jenis Laporan</label>
                    <select
                      id="upload-report-type"
                      value={uploadReportType}
                      onChange={(e) => setUploadReportType(e.target.value as 'Akrual' | 'SP2D')}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Akrual">Akrual</option>
                      <option value="SP2D">SP2D</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="upload-report-date" className="text-sm font-medium text-gray-700">Tanggal Realisasi</label>
                    <input
                      id="upload-report-date"
                      type="date"
                      value={uploadReportDate}
                      onChange={(e) => setUploadReportDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {uploadMetadataError && (
                  <p className="text-sm text-red-600">{uploadMetadataError}</p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUpload}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
                >
                  Unggah
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Activity Detail Modal */}
        {selectedActivity && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Detail Kegiatan</h2>
              <button 
                onClick={() => setSelectedActivity(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900 break-words">{selectedActivity.nama}</h3>
                {selectedActivity.status && (
                  <div className="mt-1">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {selectedActivity.status}
                    </span>
                  </div>
                )}
              </div>

              {selectedActivity.attachments && selectedActivity.attachments.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Lampiran</h4>
                  <div className="space-y-2">
                    {selectedActivity.attachments.map(attachment => {
                      const inlinePreview = isInlinePreview(attachment.fileName);
                      const href = inlinePreview ? attachment.filePath : getAttachmentDownloadUrl(attachment);
                      return (
                        <div key={attachment.attachmentId} className="flex items-center justify-between text-sm border border-gray-200 rounded-md px-3 py-2 bg-gray-50">
                          <span className="text-gray-600 break-all pr-4">{attachment.fileName}</span>
                          <a
                            href={href}
                            className="inline-flex items-center px-3 py-1.5 border border-blue-500 text-blue-600 rounded-md hover:bg-blue-50 transition"
                            {...(inlinePreview
                              ? { target: '_blank', rel: 'noopener noreferrer' }
                              : { download: attachment.fileName })}
                          >
                            {inlinePreview ? 'Buka' : 'Unduh'}
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <h4 className="font-medium text-gray-700 mb-2">Alokasi Anggaran</h4>
                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kode</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedActivity.allocations.map((alloc, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{alloc.kode}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                            {formatCurrency(alloc.jumlah || 0)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-medium">
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">Total</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                          {formatCurrency(selectedActivity.allocations.reduce((sum, alloc) => sum + (alloc.jumlah || 0), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  onClick={() => setSelectedActivity(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
                <h2 className="text-xl font-bold text-gray-800">Realisasi Anggaran Unit Kerja</h2>
                {latestReportMeta.reportDate ? (
                  <p className="text-sm text-gray-600">
                    Laporan {latestReportMeta.reportType ?? 'Tidak diketahui'} ·{' '}
                    {new Date(latestReportMeta.reportDate).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC' 
                    })}
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">Informasi Pagu dan Realisasi</p>
                )}
              </div>
              <div className="flex flex-col md:flex-row md:items-center gap-3 w-full md:w-auto">
                <HistoryDropdown />
                <div className="relative group">
                  <button
                    onClick={() => document.getElementById('file-upload-hidden')?.click()}
                    className="inline-flex items-center justify-center px-3 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
                  >
                    Unggah Realisasi SAKTI
                  </button>
                  <div className="invisible group-hover:visible absolute right-0 mt-2 z-10 w-64 p-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-md shadow-lg">
                    Unggah file Excel hasil realisasi SAKTI level item. Pastikan format file sesuai dengan template yang disediakan.
                  </div>
                </div>
                <input
                  id="file-upload-hidden"
                  type="file"
                  className="hidden"
                  accept=".xls,.xlsx"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] ?? null;
                    if (selected) {
                      handleFileSelection(selected);
                    }
                    e.target.value = '';
                  }}
                />
              </div>
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
                      <span className="text-sm font-semibold text-indigo-700">{progressPercentage.toFixed(2)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5"><div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full" style={{ width: `${progressPercentage}%` }}/></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Level 7 Account Totals */}
            {level7Totals.length > 0 && (
              <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div 
                    className="flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors duration-200 rounded-md px-2 py-1"
                    onClick={() => setShowAccountSummary(!showAccountSummary)}
                  >
                    <h3 className="text-lg font-medium text-gray-800">Rekapitulasi per Akun</h3>
                    <svg 
                      className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${showAccountSummary ? 'rotate-180' : ''}`} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tampilkan Anggaran</span>
                    <div className="relative">
                      <select
                        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        defaultValue="realisasi-laporan"
                      >
                        <option value="realisasi-laporan">Realisasi (Sesuai Laporan)</option>
                        <option value="realisasi-outstanding">Realisasi + Outstanding</option>
                        <option value="realisasi-komitmen">Realisasi + Outstanding + Komitmen</option>
                      </select>
                      <span className="absolute inset-y-0 right-3 flex items-center text-gray-400 text-xs italic pointer-events-none">
                        coming soon
                      </span>
                    </div>
                  </div>
                </div>
                {showAccountSummary && (
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {level7Totals.map((item, index) => (
                        <div key={index} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow">
                          <div className="space-y-2">
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-medium text-gray-900 break-words">{item.uraian}</h4>
                                <p className="text-xs text-gray-500">{item.code}</p>
                              </div>
                              <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full ml-2">
                                {item.paguRevisi > 0 ? `${((item.realisasi / item.paguRevisi) * 100).toFixed(2)}%` : '0.00%'}
                              </span>
                            </div>
                            
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div 
                                className="h-full rounded-full transition-all duration-300 ease-out" 
                                style={{ 
                                  width: `${item.paguRevisi > 0 ? Math.min(100, Math.round((item.realisasi / item.paguRevisi) * 100)) : 0}%`,
                                  backgroundColor: item.paguRevisi > 0 ? '#3b82f6' : '#e5e7eb' // Blue if has budget, gray if not
                                }}
                              ></div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-1 text-xs">
                              <div>
                                <p className="text-gray-500">Pagu</p>
                                <p className="font-medium">{item.paguRevisi?.toLocaleString('id-ID') || '0'}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-gray-500">Realisasi</p>
                                <p className="font-medium">{item.realisasi?.toLocaleString('id-ID') || '0'}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-gray-500">Sisa</p>
                                <p className="font-medium">{(item.paguRevisi - item.realisasi)?.toLocaleString('id-ID') || '0'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Data Table with Search and Filter */}
            <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200 mb-6">
              {/* Collapsible Header */}
              <div 
                className="p-4 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors duration-200 flex justify-between items-center"
                onClick={() => setIsTableExpanded(!isTableExpanded)}
              >
                <h3 className="text-lg font-medium text-gray-800">Daftar Kode Akun</h3>
                <svg 
                  className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${isTableExpanded ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              
              {/* Search and Filter Section - Collapsible */}
              <div className={`transition-all duration-200 ${isTableExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                <div className="p-4 border-b border-gray-200">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 w-full">
                    {/* Search and Filter */}
                    <div className="flex-1 w-full flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                        <input
                          type="text"
                          placeholder="Cari kode/uraian..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="block w-full pl-10 pr-8 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
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
                        <label htmlFor="depthSelect" className="text-sm font-medium text-gray-700 mr-2 whitespace-nowrap">Level:</label>
                        <select 
                          id="depthSelect" 
                          value={maxDepth} 
                          onChange={(e) => handleDepthChange(parseInt(e.target.value, 10))} 
                          className="block rounded-md border-gray-300 py-1.5 pl-2 pr-8 text-sm"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    
                    {/* Right-aligned Upload/Download Buttons */}
                    <div className="flex space-x-1.5 w-full sm:w-auto mt-2 sm:mt-0">
                      <button onClick={handleDownload} className="inline-flex items-center justify-center px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors w-1/2 sm:w-auto">Unduh Hasil</button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Table Content */}
              <div className={`overflow-x-auto transition-all duration-200 ${isTableExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
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
                    {displayedData.map((row, rowIndex) => {
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
                            const dataRows = displayedData.filter(row => !row.__hasChildren && !row.__isDataGroup);
                            return dataRows.reduce((sum, row) => sum + (Number(row[2]) || 0), 0).toLocaleString('id-ID');
                          })()}
                        </td>
                        <td className="px-6 py-2 text-right text-sm text-gray-900">
                          {(() => {
                            const dataRows = displayedData.filter(row => !row.__hasChildren && !row.__isDataGroup);
                            return dataRows.reduce((sum, row) => sum + (Number(row[6]) || 0), 0).toLocaleString('id-ID');
                          })()}
                        </td>
                        <td className="px-6 py-2 text-right text-sm text-gray-900">
                          {(() => {
                            const dataRows = displayedData.filter(row => !row.__hasChildren && !row.__isDataGroup);
                            const totalPagu = dataRows.reduce((sum, row) => sum + (Number(row[2]) || 0), 0);
                            const totalRealisasi = dataRows.reduce((sum, row) => sum + (Number(row[6]) || 0), 0);
                            return totalPagu > 0 ? `${((totalRealisasi / totalPagu) * 100).toFixed(2)}%` : '0%';
                          })()}
                        </td>
                        <td className="px-6 py-2 text-right text-sm text-gray-900">
                          {(() => {
                            const dataRows = displayedData.filter(row => !row.__hasChildren && !row.__isDataGroup);
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
            <div className="bg-white shadow-xl rounded-xl overflow-hidden mt-8">
                <div 
                    className="p-4 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors duration-200 flex justify-between items-center"
                    onClick={() => setShowActivities(!showActivities)}
                >
                    <h2 className="text-xl font-semibold text-gray-800">Daftar Kegiatan</h2>
                    <div className="flex items-center space-x-4">
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowActivityForm(true);
                            }} 
                            className="bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700 text-sm"
                        >
                            Tambah Kegiatan
                        </button>
                        <svg 
                            className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${showActivities ? 'rotate-180' : ''}`} 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
                <div className={`transition-all duration-200 ${showActivities ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                    <div className="p-6 space-y-6">
                        <div className="flex flex-wrap items-end gap-4">
                            <div className="space-y-1 flex-1 min-w-[220px]">
                                <label htmlFor="activity-search" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    Cari Nama Kegiatan
                                </label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.6-4.65a6 6 0 11-12 0 6 6 0 0112 0z" />
                                        </svg>
                                    </div>
                                    <input
                                        id="activity-search"
                                        type="text"
                                        value={activitySearchTerm}
                                        onChange={(e) => setActivitySearchTerm(e.target.value)}
                                        placeholder="Masukkan nama kegiatan..."
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="activity-year-filter" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    Tahun
                                </label>
                                <select
                                    id="activity-year-filter"
                                    value={selectedYear.toString()}
                                    onChange={handleYearFilterChange}
                                    disabled={showAllActivities}
                                    className={`border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${showAllActivities ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                >
                                    <option value="all">Semua Tahun</option>
                                    {availableYears.map(year => (
                                        <option key={year} value={year.toString()}>
                                            {year}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="activity-month-filter" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    Bulan
                                </label>
                                <select
                                    id="activity-month-filter"
                                    value={selectedMonth.toString()}
                                    onChange={handleMonthFilterChange}
                                    disabled={showAllActivities}
                                    className={`border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${showAllActivities ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                >
                                    <option value="all">Semua Bulan</option>
                                    {monthOptions.map(option => (
                                        <option key={option.value} value={option.value.toString()}>
                                            {option.label}
                                        </option>
                                    ))}
                                    {hasNoDateActivities && <option value="no-date">Tanpa Tanggal</option>}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="activity-status-filter" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    Status
                                </label>
                                <select
                                    id="activity-status-filter"
                                    value={selectedStatus}
                                    onChange={handleStatusFilterChange}
                                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="all">Semua Status</option>
                                    <option value="Komitmen">Komitmen</option>
                                    <option value="Outstanding">Outstanding</option>
                                    <option value="Terbayar">Terbayar</option>
                                    <option value="tanpa-status">Tanpa Status</option>
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={handleResetFilters}
                                className="text-sm text-blue-600 hover:text-blue-700 underline decoration-dotted disabled:text-gray-400 disabled:no-underline"
                                disabled={showAllActivities}
                            >
                                Bulan sekarang
                            </button>
                            <label className="flex items-center space-x-2 text-sm text-gray-600">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    checked={showAllActivities}
                                    onChange={handleShowAllToggle}
                                />
                                <span>Tampilkan semua kegiatan</span>
                            </label>
                        </div>

                        {totalActivities > 0 ? (
                            <>
                                <div className="space-y-8">
                                    {paginatedActivityGroups.map(group => (
                                        <div key={group.key} className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-lg font-semibold text-gray-800">{group.label}</h3>
                                                <span className="text-xs text-gray-500">
                                                    {totalActivitiesByGroup.get(group.key) ?? group.activities.length} kegiatan
                                                </span>
                                            </div>
                                            <div className="border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full md:min-w-[760px] table-fixed divide-y divide-gray-200">
                                                        <thead className="bg-gray-50">
                                                            <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                                                <th className="px-4 py-3 w-[48%] min-w-[240px]">Nama Kegiatan</th>
                                                                <th className="px-4 py-3 w-24 whitespace-nowrap">Tanggal</th>
                                                                <th className="px-4 py-3 text-right w-32 whitespace-nowrap">Total Alokasi</th>
                                                                <th className="px-4 py-3 w-28 whitespace-nowrap">Status</th>
                                                                <th className="px-4 py-3 w-28 whitespace-nowrap">Lampiran</th>
                                                                <th className="px-4 py-3 text-right w-28 whitespace-nowrap">Aksi</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-100">
                                                            {group.activities.map(activity => {
                                                                const scheduledDate = formatActivityDate(activity.tanggal_pelaksanaan);
                                                                const totalAlokasi = formatCurrency(activity.allocations.reduce((sum, alloc) => sum + (alloc.jumlah || 0), 0));
                                                                return (
                                                                    <tr
                                                                        key={activity.id}
                                                                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                                                                        onClick={() => setSelectedActivity(activity)}
                                                                    >
                                                                        <td className="px-4 py-3 align-top max-w-sm">
                                                                            <div className="flex flex-col space-y-1">
                                                                                <span className="font-medium text-gray-900 break-words leading-snug">
                                                                                    {activity.nama}
                                                                                </span>
                                                                                <span className="text-xs text-gray-500">{activity.allocations.length} alokasi</span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3 align-top text-sm text-gray-600 whitespace-nowrap">
                                                                            {scheduledDate || '-'}
                                                                        </td>
                                                                        <td className="px-4 py-3 align-top text-sm text-gray-900 text-right">
                                                                            {totalAlokasi}
                                                                        </td>
                                                                        <td className="px-4 py-3 align-top">
                                                                            {activity.status ? (
                                                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                                                                                    {activity.status}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-xs text-gray-400 italic">Belum diatur</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-3 align-top text-sm text-gray-600">
                                                                            {activity.attachments && activity.attachments.length > 0 ? (
                                                                                <div className="flex items-center space-x-2">
                                                                                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2v-7a2 2 0 00-.59-1.41l-5-5A2 2 0 0011.59 5H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                                    </svg>
                                                                                    <span className="text-xs text-gray-500">{activity.attachments.length} lampiran</span>
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-xs text-gray-400 italic">Tidak ada</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-3 align-top text-right">
                                                                            <div className="flex justify-end space-x-2">
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleEditActivity(activity);
                                                                                    }}
                                                                                    className="text-blue-500 hover:text-blue-700"
                                                                                    title="Edit kegiatan"
                                                                                >
                                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                                                                    </svg>
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleRemoveActivity(activity.id);
                                                                                    }}
                                                                                    className="text-red-500 hover:text-red-700"
                                                                                    title="Hapus kegiatan"
                                                                                >
                                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 22H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                                                                    </svg>
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-t border-gray-200 pt-4">
                                    <p className="text-sm text-gray-500">
                                        Menampilkan {pageRangeStart}-{pageRangeEnd} dari {totalActivities} kegiatan
                                    </p>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-sm text-gray-500">Baris per halaman</span>
                                            <select
                                                value={String(activitiesPerPage)}
                                                onChange={handlePageSizeChange}
                                                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                {PAGE_SIZE_OPTIONS.map(option => (
                                                    <option key={option} value={String(option)}>
                                                        {option === 'all' ? 'Semua' : option}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <button
                                                type="button"
                                                onClick={() => setActivitiesPage(prev => Math.max(1, prev - 1))}
                                                disabled={activitiesPage === 1 || activitiesPerPage === 'all'}
                                                className={`px-3 py-1.5 rounded-md border text-sm ${
                                                    activitiesPage === 1 || activitiesPerPage === 'all'
                                                        ? 'text-gray-400 border-gray-200 cursor-not-allowed'
                                                        : 'text-gray-700 border-gray-300 hover:bg-gray-100'
                                                }`}
                                            >
                                                Sebelumnya
                                            </button>
                                            <span className="text-sm text-gray-600">
                                                Halaman {activitiesPage} dari {totalPages}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setActivitiesPage(prev => Math.min(totalPages, prev + 1))}
                                                disabled={activitiesPage === totalPages || activitiesPerPage === 'all'}
                                                className={`px-3 py-1.5 rounded-md border text-sm ${
                                                    activitiesPage === totalPages || activitiesPerPage === 'all'
                                                        ? 'text-gray-400 border-gray-200 cursor-not-allowed'
                                                        : 'text-gray-700 border-gray-300 hover:bg-gray-100'
                                                }`}
                                            >
                                                Berikutnya
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <p className="text-gray-500 text-center py-4">
                                {activities.length === 0
                                  ? 'Belum ada kegiatan. Tambahkan kegiatan baru untuk memulai.'
                                  : 'Tidak ada kegiatan untuk filter yang dipilih.'}
                            </p>
                        )}
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* Add Activity Modal */}
        {showActivityForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold">{isEditing ? 'Edit Kegiatan' : 'Tambah Kegiatan Baru'}</h2>
                <button 
                  onClick={handleCancelEdit}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                <div className="space-y-6 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                  {/* Nama Kegiatan */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="nama-kegiatan" className="block text-sm font-medium text-gray-700">Nama Kegiatan</label>
                      <span className="text-xs text-red-500">*Wajib diisi</span>
                    </div>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <input 
                        id="nama-kegiatan"
                        type="text" 
                        value={newActivity.nama} 
                        onChange={(e) => setNewActivity({...newActivity, nama: e.target.value})} 
                        className="block w-full p-2.5 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                        placeholder="Contoh: Pembangunan Jalan Desa"
                        aria-required="true"
                      />
                      {!newActivity.nama && (
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    {!newActivity.nama && (
                      <p className="mt-1 text-xs text-red-600">Nama kegiatan harus diisi</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="space-y-1.5">
                    <label htmlFor="status-kegiatan" className="block text-sm font-medium text-gray-700">Status Kegiatan</label>
                    <div className="relative">
                      <select 
                        id="status-kegiatan"
                        value={newActivity.status || ''} 
                        onChange={(e) => setNewActivity({...newActivity, status: e.target.value})}
                        className="block w-full p-2.5 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white appearance-none"
                        aria-describedby="status-description"
                      >
                        <option value="" disabled>Pilih Status</option>
                        <option value="Komitmen">Komitmen</option>
                        <option value="Outstanding">Outstanding</option>
                        <option value="Terbayar">Terbayar</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                        </svg>
                      </div>
                    </div>
                    <p id="status-description" className="mt-1 text-xs text-gray-500">Pilih status terkini dari kegiatan ini</p>
                  </div>

                  {/* Tanggal Pelaksanaan */}
                  <div className="space-y-1.5">
                    <label htmlFor="tanggal-pelaksanaan" className="block text-sm font-medium text-gray-700">Tanggal Pelaksanaan</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <input
                        id="tanggal-pelaksanaan"
                        type="date"
                        value={newActivity.tanggal_pelaksanaan || ''}
                        onChange={(e) => setNewActivity({...newActivity, tanggal_pelaksanaan: e.target.value})}
                        className="block w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Pilih tanggal pelaksanaan kegiatan</p>
                  </div>

                  {/* Lampiran */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">Lampiran Kegiatan</label>

                    {activityAttachments.length > 0 && (
                      <div className="space-y-2">
                    {activityAttachments.map(attachment => {
                      const isMarked = attachmentsToRemove.has(attachment.attachmentId);
                      const inlinePreview = isInlinePreview(attachment.fileName);
                      const href = inlinePreview ? attachment.filePath : getAttachmentDownloadUrl(attachment);
                      return (
                        <div
                          key={attachment.attachmentId}
                          className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border rounded-md text-sm ${isMarked ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
                        >
                          <div className="space-y-1">
                            <p className={`break-all ${isMarked ? 'line-through text-red-600' : 'text-gray-700'}`}>
                              {attachment.fileName}
                            </p>
                            <p className="text-xs text-gray-500">
                              Diunggah {new Date(attachment.uploadedAt).toLocaleString('id-ID')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={href}
                              className="inline-flex items-center px-3 py-1.5 border border-blue-500 text-blue-600 rounded-md hover:bg-blue-100 transition"
                              {...(inlinePreview
                                ? { target: '_blank', rel: 'noopener noreferrer' }
                                : { download: attachment.fileName })}
                            >
                              {inlinePreview ? 'Buka' : 'Unduh'}
                            </a>
                            <button
                              type="button"
                              onClick={() => toggleAttachmentRemoval(attachment.attachmentId)}
                              className={`text-xs font-medium ${isMarked ? 'text-gray-600 hover:text-gray-700' : 'text-red-600 hover:text-red-700'}`}
                            >
                              {isMarked ? 'Batalkan' : 'Hapus'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                      </div>
                    )}

                    {attachmentsToRemove.size > 0 && (
                      <p className="text-xs text-yellow-600">
                        Lampiran bertanda akan dihapus setelah Anda menyimpan perubahan.
                      </p>
                    )}

                    {newAttachmentFiles.length > 0 && (
                      <div className="space-y-2 text-xs text-gray-600">
                        <p className="font-medium text-gray-700">Lampiran baru:</p>
                        {newAttachmentFiles.map((file, index) => (
                          <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-3 border border-dashed border-blue-200 rounded-md px-3 py-2 bg-blue-50/60">
                            <span className="break-all">{file.name}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveNewAttachment(index)}
                              className="text-red-500 hover:text-red-600"
                            >
                              Hapus
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <input
                        id="activity-attachment"
                        type="file"
                        multiple
                        className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        onChange={(e) => {
                          handleAttachmentSelection(e.target.files);
                          if (e.target) {
                            e.target.value = '';
                          }
                        }}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Anda dapat memilih beberapa file sekaligus. Format yang didukung: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG.
                      </p>
                    </div>
                  </div>

                </div>

                {/* Form Alokasi Anggaran */}
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mt-6">
                  <div className="mb-6">
                    <h3 className="text-base font-semibold text-gray-900">Alokasi Anggaran</h3>
                    <p className="mt-1 text-sm text-gray-500">Tambahkan detail alokasi anggaran untuk kegiatan ini</p>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="grid grid-cols-12 gap-4">
                      {/* Kode Anggaran */}
                      <div className="col-span-12 sm:col-span-4">
                        <label htmlFor="kode-anggaran" className="block text-sm font-medium text-gray-700 mb-1">Kode</label>
                        <div className="relative">
                          <select
                            id="kode-anggaran"
                            value={newAllocation.kode}
                            onChange={(e) => {
                              const selectedOption = e.target.options[e.target.selectedIndex];
                              const uraian = selectedOption.getAttribute('data-uraian') || '';
                              setNewAllocation({
                                ...newAllocation, 
                                kode: e.target.value,
                                uraian: uraian
                              });
                            }}
                            className="block w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
                          >
                            <option value="">Pilih Kode Akun</option>
                            {result?.finalData
                              .filter((row): row is [string, string, ...any] => 
                                Array.isArray(row) && 
                                row.length > 1 && 
                                typeof row[0] === 'string' && 
                                typeof row[1] === 'string'
                              )
                              .filter(([kode]) => kode && kode.trim() !== '')
                              .map(([kode, uraian], index) => (
                                <option 
                                  key={`${kode}-${index}`} 
                                  value={kode}
                                  data-uraian={uraian}
                                >
                                  {kode}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                      
                      {/* Uraian */}
                      <div className="col-span-12 sm:col-span-8">
                        <label htmlFor="uraian" className="block text-sm font-medium text-gray-700 mb-1">Uraian</label>
                        <input
                          id="uraian"
                          type="text"
                          value={newAllocation.uraian || ''}
                          onChange={(e) => setNewAllocation({...newAllocation, uraian: e.target.value})}
                          className="block w-full min-w-[300px] p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          placeholder="Deskripsi alokasi"
                          style={{ minWidth: '100%' }}
                        />
                      </div>
                      
                      {/* Jumlah */}
                      <div className="col-span-12 sm:col-span-4">
                        <label htmlFor="jumlah" className="block text-sm font-medium text-gray-700 mb-1">Jumlah (Rp)</label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 sm:text-sm">Rp</span>
                          </div>
                          <input
                            id="jumlah"
                            type="text"
                            value={newAllocation.formattedJumlah}
                            onChange={handleNumberChange}
                            className="pl-10 block w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            placeholder="0"
                            onKeyDown={(e) => {
                              // Allow: backspace, delete, tab, escape, enter
                              if ([8, 9, 27, 13].includes(e.keyCode) ||
                                // Allow: Ctrl+A, Command+A
                                (e.keyCode === 65 && (e.ctrlKey === true || e.metaKey === true)) ||
                                // Allow: Ctrl+C, Command+C
                                (e.keyCode === 67 && (e.ctrlKey === true || e.metaKey === true)) ||
                                // Allow: Ctrl+V, Command+V
                                (e.keyCode === 86 && (e.ctrlKey === true || e.metaKey === true)) ||
                                // Allow: Ctrl+X, Command+X
                                (e.keyCode === 88 && (e.ctrlKey === true || e.metaKey === true)) ||
                                // Allow: home, end, left, right, down, up
                                (e.keyCode >= 35 && e.keyCode <= 40)) {
                                return;
                              }
                              // Allow only numbers
                              if ((e.keyCode < 48 || e.keyCode > 57) && (e.keyCode < 96 || e.keyCode > 105)) {
                                e.preventDefault();
                              }
                            }}
                            style={{ minWidth: '120px' }}
                            inputMode="numeric"
                          />
                        </div>
                      </div>
                      
                      {/* Tombol Tambah */}
                      <div className="col-span-12 sm:col-span-2 flex items-end">
                        <button
                          type="button"
                          onClick={handleAddAllocation}
                          disabled={!newAllocation.kode || !newAllocation.jumlah}
                          className="w-full h-10 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg className="-ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                          </svg>
                          Tambah
                        </button>
                      </div>
                    </div>
                    
                    {/* Validasi Error */}
                    {(!newAllocation.kode || !newAllocation.jumlah) && (
                      <p className="text-xs text-red-600 -mt-2">
                        {!newAllocation.kode && !newAllocation.jumlah 
                          ? "Kode dan jumlah harus diisi" 
                          : !newAllocation.kode 
                            ? "Kode harus diisi" 
                            : "Jumlah harus diisi"}
                      </p>
                    )}
                  </div>
                  
                  {/* Daftar Alokasi */}
                  {newActivity.allocations.length > 0 && (
                    <div className="mt-6">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-gray-900">Daftar Alokasi</h4>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {newActivity.allocations.length} item
                        </span>
                      </div>
                      
                      <div className="overflow-hidden border border-gray-200 rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kode</th>
                              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uraian</th>
                              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Jumlah</th>
                              <th scope="col" className="relative px-4 py-3">
                                <span className="sr-only">Aksi</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {newActivity.allocations.map((alloc, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {alloc.kode}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                  {alloc.uraian || '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                                  Rp{alloc.jumlah.toLocaleString('id-ID')}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAllocation(idx)}
                                    className="text-red-600 hover:text-red-900 focus:outline-none"
                                    title="Hapus alokasi"
                                  >
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {/* Total */}
                            <tr className="bg-gray-50">
                              <td colSpan={2} className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                Total
                              </td>
                              <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                                Rp{newActivity.allocations.reduce((sum, item) => sum + (item.jumlah || 0), 0).toLocaleString('id-ID')}
                              </td>
                              <td></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Modal Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleAddActivity}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;






