import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useDropzone, type DropzoneOptions } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { ProcessingResult, Activity, ActivityAttachment, BudgetAllocation } from './types';
import { processExcelData, downloadExcelFile, parseExcelFile } from './services/excelProcessor';
import * as supabaseService from './services/supabaseService';
import { useAuth } from './src/contexts/AuthContext';
import * as attachmentService from './services/activityAttachmentService';
import { supabase } from './utils/supabase';
import { fetchAiResponse, getLastSuccessfulModel, type AiChatMessage as AiRequestMessage } from './services/aiService';
import FloatingAIButton from './src/components/FloatingAIButton';
import ConfirmDialog from './src/components/ConfirmDialog';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import Tesseract from 'tesseract.js';
import { useHierarchyTable } from './src/hooks/useHierarchyTable';
import { useProcessedMetrics } from './src/hooks/useProcessedMetrics';
import BudgetOverviewPanel from './src/components/dashboard/BudgetOverviewPanel';
import AccountSummaryPanel from './src/components/dashboard/AccountSummaryPanel';
import MonthlyAnalyticsPanel from './src/components/dashboard/MonthlyAnalyticsPanel';
import TrendAnalyticsPanel from './src/components/dashboard/TrendAnalyticsPanel';
import ActivityCalendarPanel from './src/components/dashboard/ActivityCalendarPanel';
import { useHistoricalData } from './src/hooks/useHistoricalData';

// Add missing function import
const generateRkbPdf = async (activityGroups: any[], selectedYear: number | 'all', selectedMonth: number | 'all' | 'no-date', selectedStatus: Set<string>) => {
  // This is a placeholder implementation
  console.log('Generating RKB PDF...', { activityGroups, selectedYear, selectedMonth, selectedStatus });
  // In a real implementation, this would generate a PDF
  return new Blob(['RKB PDF content'], { type: 'application/pdf' });
};

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

type AiMessage = {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

type AiAutofillStepStatus = 'processing' | 'success' | 'error';

type AiAutofillStep = {
  label: string;
  status: AiAutofillStepStatus;
  detail?: string;
};

const INITIAL_AI_MESSAGE_ID = 'assistant-initial';

const AI_QUICK_PROMPTS = [
  'Berapa total realisasi anggaran saat ini?',
  'Status kegiatan outstanding terbaru?',
  'Sebutkan 5 kegiatan dengan alokasi terbesar.',
  'Berapa jumlah lampiran yang sudah diunggah?'
] as const;

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', { 
    style: 'currency', 
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0 
  }).format(amount);
};

const generateMessageId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto & { randomUUID: () => string }).randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const sanitizeModelOutput = (raw: string): string => {
  if (!raw) return '';
  const cleaned = raw.replace(/<[\uFF5C\|].*?>/g, '').trim();
  return cleaned || raw.trim();
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');

const formatMessageContent = (text: string): string => {
  const escaped = escapeHtml(text);
  const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const withLineBreaks = withBold.replace(/\n/g, '<br />');
  return withLineBreaks;
};

// --- Icon Components ---
const UploadIcon = () => (
  <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
  </svg>
);





const App: React.FC = () => {
  // Auth and navigation hooks (must be called before any conditional returns)
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  // State for activity management
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [newActivity, setNewActivity] = useState<Omit<Activity, 'id'>>({ 
    nama: '', 
    status: 'Rencana', 
    allocations: [],
    attachments: [],
    tanggal_pelaksanaan: '',
    tujuan_kegiatan: '',
    kl_unit_terkait: '',
    penanggung_jawab: '',
    capaian: '',
    pending_issue: '',
    rencana_tindak_lanjut: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [newAllocation, setNewAllocation] = useState<Omit<BudgetAllocation, 'id'> & { pagu?: number; sisa?: number }>({ 
    kode: '', 
    uraian: '',
    jumlah: 0,
    pagu: 0,
    sisa: 0
  });
  const [allocationError, setAllocationError] = useState('');
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activityAttachments, setActivityAttachments] = useState<ActivityAttachment[]>([]);
  const [newAttachmentFiles, setNewAttachmentFiles] = useState<File[]>([]);
  const [attachmentsToRemove, setAttachmentsToRemove] = useState<Set<string>>(new Set());
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'all' | 'no-date'>(() => new Date().getMonth());
  const [showAllActivities, setShowAllActivities] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<Set<string>>(new Set(['all']));
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
  const [budgetView, setBudgetView] = useState('realisasi-laporan');
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const currentMonthIndex = useMemo(() => new Date().getMonth(), []);

  // State for file processing & hierarchy
  const [isProcessing, setIsProcessing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [maxDepth, setMaxDepth] = useState(7);
  const [isTableExpanded, setIsTableExpanded] = useState(true);
  const [showAccountSummary, setShowAccountSummary] = useState(true);
  const [showActivities, setShowActivities] = useState(true);
  const [showCalendar, setShowCalendar] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [error, setError] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAiAutofilling, setIsAiAutofilling] = useState(false);
  const [aiAutofillError, setAiAutofillError] = useState<string | null>(null);
  const [aiAutofillSuccess, setAiAutofillSuccess] = useState<string | null>(null);
  const [aiAutofillSteps, setAiAutofillSteps] = useState<AiAutofillStep[]>([]);

  // State for confirmation dialogs
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'danger' as 'danger' | 'warning' | 'info'
  });

  const {
    activeData,
    activeTotals,
    additionalTotals,
    progressPercentage,
    level7Totals,
  } = useProcessedMetrics({ result, activities, budgetView });

  // Historical data for analytics
  const {
    monthlyReports,
    currentReport,
    allReports,
    isLoading: isHistoricalLoading,
    error: historicalError,
    setCurrentReport,
    refreshData,
    availableAccounts,
    currentMonthData
  } = useHistoricalData(user?.id);

  const {
    hierarchicalData,
    displayedData,
    setDisplayedData,
    toggleNode,
    resetExpansion,
  } = useHierarchyTable({
    data: activeData,
    maxDepth,
    accountNameMap: result?.accountNameMap,
  });
  const getAttachmentDownloadUrl = useCallback(
    (attachment: ActivityAttachment) =>
      `/api/activities/${attachment.activityId}/attachments/${attachment.attachmentId}/download`,
    []
  );
  const isInlinePreview = useCallback((fileName: string) => /\.(pdf|png|jpe?g|gif)$/i.test(fileName), []);

  // State for file processing
  const applyProcessedResult = useCallback((data: {
    id: string;
    result: ProcessingResult;
    lastUpdated: string;
    reportType: string | null;
    reportDate: string | null;
  }) => {
    setResult(data.result);
    setLastUpdated(data.lastUpdated);
    setLatestReportMeta({
      reportType: data.reportType,
      reportDate: data.reportDate,
    });
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastSelectedHistoryId', data.id);
    }
  }, []);

  // State for allocation search
  const [allocationSearch, setAllocationSearch] = useState('');
  const [isAllocationDropdownOpen, setIsAllocationDropdownOpen] = useState(false);
  const allocationDropdownRef = useRef<HTMLDivElement>(null);

  const reportYear = useMemo(() => {
    return latestReportMeta.reportDate 
        ? new Date(latestReportMeta.reportDate).getFullYear() 
        : new Date().getFullYear();
  }, [latestReportMeta.reportDate]);

  const reportMonthName = useMemo(() => {
    if (!latestReportMeta.reportDate) return null;
    const date = new Date(latestReportMeta.reportDate);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('id-ID', { month: 'long' });
  }, [latestReportMeta.reportDate]);

  const previousReportMonthName = useMemo(() => {
    if (!latestReportMeta.reportDate) return null;
    const date = new Date(latestReportMeta.reportDate);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getMonth() === 0) return null;
    const prevDate = new Date(date);
    prevDate.setMonth(prevDate.getMonth() - 1);
    return prevDate.toLocaleDateString('id-ID', { month: 'long' });
  }, [latestReportMeta.reportDate]);

  const isReportJanuary = useMemo(() => reportMonthName?.toLowerCase() === 'januari', [reportMonthName]);

  const periodeLaluLabel = useMemo(() => {
    if (!reportMonthName || isReportJanuary || !previousReportMonthName) return 'Periode Lalu';
    return `Realisasi Januari s.d. ${previousReportMonthName}`;
  }, [reportMonthName, isReportJanuary, previousReportMonthName]);

  const periodeIniLabel = useMemo(() => {
    if (!reportMonthName) return 'Periode Ini';
    return `Realisasi Bulan ${reportMonthName}`;
  }, [reportMonthName]);

  const sdPeriodeLabel = useMemo(() => {
    if (!reportMonthName) return 's.d. Periode';
    if (isReportJanuary) return 'Realisasi Januari';
    return `Realisasi Januari s.d. ${reportMonthName}`;
  }, [reportMonthName, isReportJanuary]);

  const comprehensiveAllocationMap = useMemo(() => {
    const allocationMap = new Map<string, number>();
    activities
        .filter(activity => ['outstanding', 'komitmen'].includes((activity.status || '').toLowerCase()))
        .forEach(activity => {
            activity.allocations.forEach(alloc => {
                const compositeKey = `${alloc.kode}||${alloc.uraian}`;
                allocationMap.set(compositeKey, (allocationMap.get(compositeKey) || 0) + alloc.jumlah);
            });
        });
    return allocationMap;
  }, [activities]);

  const filteredAllocations = useMemo(() => {
    if (!allocationSearch) return [];
    if (!result?.finalData) return [];

    const searchLower = allocationSearch.toLowerCase();
    
    return result.finalData
        .filter(item =>
            (item[0] || '').toLowerCase().includes(searchLower) || (item[1] || '').toLowerCase().includes(searchLower)
        )
        .map(row => {
            const pagu = Number(row[2]) || 0;
            const realisasiLaporan = Number(row[6]) || 0;
            const compositeKey = `${row[0]}||${row[1]}`;
            const totalAlokasiTambahan = comprehensiveAllocationMap.get(compositeKey) || 0;
            const sisa = pagu - (realisasiLaporan + totalAlokasiTambahan);
            
            return {
                kode: row[0],
                uraian: row[1],
                pagu: pagu,
                sisa: sisa
            };
        })
        .slice(0, 50); // Limit to 50 results for performance
  }, [allocationSearch, result?.finalData, comprehensiveAllocationMap]);

  const handleSelectAllocation = (item: { kode: string, uraian: string, pagu: number, sisa: number }) => {
    setNewAllocation(prev => ({ ...prev, kode: item.kode, uraian: item.uraian, pagu: item.pagu, sisa: item.sisa }));
    setAllocationSearch('');
    setIsAllocationDropdownOpen(false);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (allocationDropdownRef.current && !allocationDropdownRef.current.contains(event.target as Node)) {
        setIsAllocationDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Refs
  const historyRef = useRef<HTMLDivElement>(null);
  const aiChatContainerRef = useRef<HTMLDivElement>(null);
  const aiAssistantPanelRef = useRef<HTMLDivElement>(null);
  const scrollToAiPanel = useCallback(() => {
    aiAssistantPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  
  const buildAiDataSnapshot = useCallback((): string => {
    const totalActivitiesCount = activities.length;
    const activitiesWithTotals = activities.map(activity => ({
      activity,
      total: activity.allocations.reduce((sum, alloc) => sum + (alloc.jumlah || 0), 0)
    }));
    const totalAllocationAmount = activitiesWithTotals.reduce((sum, item) => sum + item.total, 0);
    const totalRealisasi = activeTotals[4] || 0;
    const totalPagu = activeTotals[0] || 0;
    const sisaAnggaran = totalPagu - totalRealisasi;
    const attachmentsCount = activities.reduce(
      (sum, activity) => sum + (activity.attachments?.length || 0),
      0
    );
    const statusKeys: Array<'rencana' | 'komitmen' | 'outstanding' | 'terbayar'> = ['rencana', 'komitmen', 'outstanding', 'terbayar'];
    const statusSummary = statusKeys
      .map(status => {
        const count = activities.filter(activity => (activity.status || '').toLowerCase() === status).length;
        const label = status.charAt(0).toUpperCase() + status.slice(1);
        return `${label}: ${count}`;
      })
      .join(', ');

    const topActivities = activitiesWithTotals
      .filter(item => item.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const columnSummary = [
      { label: 'Pagu Revisi', value: activeTotals[0] || 0 },
      { label: 'Lock Anggaran', value: activeTotals[1] || 0 },
      { label: periodeLaluLabel, value: activeTotals[2] || 0 },
      { label: periodeIniLabel, value: activeTotals[3] || 0 },
      { label: sdPeriodeLabel, value: activeTotals[4] || 0 }
    ];

    const budgetEntries = (activeData.length ? activeData : result?.finalData ?? [])
      .filter(row => Array.isArray(row) && row.length >= 7)
      .map(row => {
        const kode = String(row[0] ?? '').trim();
        const kodePrefixMatch = kode.match(/[A-Z]+\.[\dA-Z]+\.[\dA-Z]+\.[\dA-Z]+\.[\dA-Z]+\.[\dA-Z]+\.(\d{6})/);
        const uraian = String(row[1] ?? '').trim();
        const pagu = Number(row[2]) || 0;
        const realisasi = Number(row[6]) || 0;
        return {
          kode,
          uraian,
          pagu,
          realisasi,
          kodeShort: kodePrefixMatch ? kodePrefixMatch[1] : ''
        };
      });

    const realizedEntries = budgetEntries.filter(entry => entry.realisasi > 0);

    const topBudgetRows = (realizedEntries.length ? realizedEntries : budgetEntries)
      .slice()
      .sort((a, b) => {
        if (b.realisasi !== a.realisasi) {
          return b.realisasi - a.realisasi;
        }
        return b.pagu - a.pagu;
      })
      .slice(0, 5);

    const lines: string[] = [
      `- Total kegiatan terdaftar: ${totalActivitiesCount}`,
      `- Total alokasi kegiatan: ${formatCurrency(totalAllocationAmount)}`,
      `- Realisasi kumulatif: ${formatCurrency(totalRealisasi)} dari pagu ${formatCurrency(totalPagu)} (sisa ${formatCurrency(sisaAnggaran)})`,
      `- Sebaran status kegiatan: ${statusSummary}`,
      `- Total lampiran kegiatan: ${attachmentsCount} berkas`
    ];

    lines.push('- Ringkasan kolom laporan:');
    columnSummary.forEach(item => {
      lines.push(`   - ${item.label}: ${formatCurrency(item.value)}`);
    });

    if (topActivities.length > 0) {
      lines.push('- Kegiatan dengan alokasi terbesar:');
      topActivities.forEach(item => {
        const statusLabel = item.activity.status ? ` (status ${item.activity.status})` : '';
        lines.push(`   - ${item.activity.nama}: ${formatCurrency(item.total)}${statusLabel}`);
      });
    }

    if (topBudgetRows.length > 0) {
      lines.push('- Akun dengan realisasi tertinggi:');
      topBudgetRows.forEach(row => {
        const sisa = row.pagu - row.realisasi;
        lines.push(`   - ${row.kode} ${row.uraian}: Pagu ${formatCurrency(row.pagu)}, Realisasi ${formatCurrency(row.realisasi)}, Sisa ${formatCurrency(sisa)}`);
      });
    }

    if (budgetEntries.length > 0) {
      lines.push('- Rincian akun anggaran (kode lengkap | kode pendek | uraian | pagu | realisasi | sisa):');
      budgetEntries.forEach(row => {
        const sisa = row.pagu - row.realisasi;
        lines.push(
          `   - ${row.kode} | ${row.kodeShort || '(tidak ada)'} | ${row.uraian} | ${formatCurrency(row.pagu)} | ${formatCurrency(row.realisasi)} | ${formatCurrency(sisa)}`
        );
      });
    }

    return lines.join('\n');
  }, [activities, activeTotals, result, activeData, periodeLaluLabel, periodeIniLabel, sdPeriodeLabel]);

  const buildAiSystemPrompt = useCallback((): string => {
    const snapshot = buildAiDataSnapshot();
    return [
      'Anda adalah asisten AI yang membantu analisis data anggaran di aplikasi internal. Jawab dalam bahasa Indonesia yang ringkas, spesifik, dan selalu berbasis data yang tersedia.',
      'Gunakan ringkasan berikut sebagai konteks. Hitung sisa anggaran dengan rumus pagu - realisasi bila diperlukan. Jika data untuk suatu kode/uraian tersedia di daftar, gunakan angka tersebut langsung.',
      'Saat pengguna ingin membuat kegiatan baru, jelaskan secara ringkas data yang diperlukan: WAJIB (nama kegiatan, status, tanggal pelaksanaan [format YYYY-MM-DD], setidaknya satu alokasi dengan kode dan jumlah angka positif). OPSIONAL (tujuan, K/L/Unit terkait, penanggung jawab, capaian, pending issue, rencana tindak lanjut, uraian alokasi).',
      'Minta pengguna mengirim seluruh data tersebut sekaligus; jangan menanyakan satu per satu. Jika data wajib belum lengkap atau jumlah alokasi tidak valid, jelaskan dengan sopan bagian mana yang masih perlu dilengkapi.',
      'Untuk pembaruan, arahkan pengguna menyebutkan ID kegiatan yang ada dan hanya field yang ingin diubah.',
      'Jika pengguna merujuk dokumen (PDF, gambar, dan sejenisnya), jelaskan bahwa Anda tidak dapat membaca berkas tersebut dan minta mereka menyalin data relevan ke percakapan.',
      snapshot,
      'Jika informasi yang diminta ada pada ringkasan di atas, gunakan angka tersebut dalam jawaban Anda.',
      'Hanya sampaikan keterbatasan apabila angka yang diminta benar-benar tidak hadir dalam ringkasan. Jangan pernah mengatakan Anda tidak memiliki akses data apabila ringkasan sudah menyediakannya.'
    ].join('\n');
  }, [buildAiDataSnapshot]);

  useEffect(() => {
    if (aiChatContainerRef.current) {
      aiChatContainerRef.current.scrollTop = aiChatContainerRef.current.scrollHeight;
    }
  }, [aiMessages]);

  // State for expanded nodes
  const aiSystemPrompt = useMemo(() => buildAiSystemPrompt(), [buildAiSystemPrompt]);
const Spinner = () => (
  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V2a10 10 0 1010 10h-2a8 8 0 018-8z"></path>
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
    if (!user?.id) {
      setHistory([]);
      return;
    }

    try {
      const historyData = await supabaseService.getAllProcessedResults(user.id);
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
  }, [user?.id]);

  // Delete a history item
  const deleteHistoryItem = useCallback(async (id: string) => {
    // Find the history item to get its details
    const historyItem = history.find(item => item.id === id);
    const fileName = historyItem?.fileName || 'riwayat ini';
    const reportDate = historyItem?.reportDate 
      ? new Date(historyItem.reportDate).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';

    setConfirmDialog({
      isOpen: true,
      title: 'Hapus Riwayat',
      message: `Apakah Anda yakin ingin menghapus riwayat "${fileName}"${reportDate ? ` dari ${reportDate}` : ''}? Tindakan ini tidak dapat dibatalkan.`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        
        if (!user?.id) {
          setError('Sesi pengguna tidak valid. Silakan login ulang.');
          return;
        }

        try {
          // First, try to fetch record to ensure it exists
          const { data: existing, error: fetchError } = await supabase
            .from('processed_results')
            .select('id')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();
            
          if (fetchError) {
            console.error('Error fetching record:', fetchError);
            throw new Error('Gagal memeriksa data yang akan dihapus');
          }
          
          if (!existing) {
            throw new Error('Data tidak ditemukan');
          }
          
          // If we get here, record exists - proceed with deletion
          const { error: deleteError } = await supabase
            .from('processed_results')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

          if (deleteError) {
            console.error('Supabase delete error:', deleteError);
            throw deleteError;
          }
          
          // Update local state directly for immediate UI update
          setHistory(prev => prev.filter(item => item.id !== id));

           const storedId =
            typeof window !== 'undefined' ? localStorage.getItem('lastSelectedHistoryId') : null;

          if (storedId === id) {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('lastSelectedHistoryId');
            }
            const latestData = await supabaseService.getLatestProcessedResult(user.id);
            if (latestData) {
              applyProcessedResult(latestData);
            } else {
              setResult(null);
              setLatestReportMeta({ reportType: null, reportDate: null });
              setLastUpdated('');
            }
            setAiMessages([]);
            setAiInput('');
            setAiError(null);
            setFile(null);
          }
          
          // Also refresh from server to ensure consistency
          loadHistory().catch(err => {
            console.error('Error refreshing history after delete:', err);
          });
        } catch (err) {
          console.error('Error in deleteHistoryItem:', err);
          setError('Gagal menghapus riwayat');
        }
      },
      type: 'danger'
    });
  }, [applyProcessedResult, loadHistory, user?.id, history]);

  // Load a specific historical result
  const loadHistoricalResult = useCallback(async (id: string) => {
    if (!user?.id) {
      setError('Sesi pengguna tidak valid. Silakan login ulang.');
      return;
    }

    try {
      const data = await supabaseService.getProcessedResultById(id, user.id);
      if (!data) {
        throw new Error('Data tidak ditemukan');
      }

      applyProcessedResult(data);
      setFile(null);
      setShowHistory(false);
      setAiMessages([]);
      setAiInput('');
      setAiError(null);
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastSelectedHistoryId', id);
      }
    } catch (err) {
      console.error('Error loading historical result:', err);
      setLatestReportMeta({ reportType: null, reportDate: null });
      setError('Gagal memuat data riwayat yang dipilih.');
      if (typeof window !== 'undefined') {
        localStorage.removeItem('lastSelectedHistoryId');
      }
    }
  }, [applyProcessedResult, user?.id]);

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
      if (!user?.id) return; // Don't load if user is not logged in
      setIsInitializing(true);
      try {
        const [processedResultData, activitiesData, attachmentsMap, maxDepthSetting] = await Promise.all([
          supabaseService.getLatestProcessedResult(user.id),
          supabaseService.getActivities(user.id),
          attachmentService.fetchActivityAttachments().catch((err) => {
            console.error('Error loading attachments:', err);
            return {} as Record<string, ActivityAttachment[]>;
          }),
          supabaseService.getSetting('hierarchyMaxDepth', user.id)
        ]);

        let selectedProcessedData = processedResultData;
        const storedHistoryId =
          typeof window !== 'undefined' ? localStorage.getItem('lastSelectedHistoryId') : null;

        if (storedHistoryId) {
          const storedData = await supabaseService.getProcessedResultById(storedHistoryId, user.id);
          if (storedData) {
            selectedProcessedData = storedData;
          } else if (typeof window !== 'undefined') {
            localStorage.removeItem('lastSelectedHistoryId');
          }
        }

        if (selectedProcessedData) {
          applyProcessedResult(selectedProcessedData);
        } else {
          setResult(null);
          setLatestReportMeta({ reportType: null, reportDate: null });
          setLastUpdated('');
          if (typeof window !== 'undefined') {
            localStorage.removeItem('lastSelectedHistoryId');
          }
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
  }, [applyProcessedResult, user?.id, loadHistory]);

  useEffect(() => {
    if (!user?.id) {
      setHistory([]);
      setActivities([]);
      setResult(null);
      setLatestReportMeta({ reportType: null, reportDate: null });
      setLastUpdated('');
    }
  }, [user?.id]);

  useEffect(() => {
    if (showActivityForm && !isEditing) {
      setNewActivity({ nama: '', allocations: [], status: 'Rencana', attachments: [], tanggal_pelaksanaan: '', tujuan_kegiatan: '', kl_unit_terkait: '', penanggung_jawab: '', capaian: '', pending_issue: '', rencana_tindak_lanjut: '' });
      setActivityAttachments([]);
      setNewAttachmentFiles([]);
      setAttachmentsToRemove(new Set());
      setAiAutofillError(null);
      setAiAutofillSuccess(null);
      setAiAutofillSteps([]);
      setIsAiAutofilling(false);
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
    
    // Update state with numeric value
    setNewAllocation({
      ...newAllocation,
      jumlah: numericValue === '' ? 0 : parseInt(numericValue, 10)
    });
    
    // Update: input value with formatted number (for display)
    e.target.value = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  // --- Activity Form Handlers ---
  const handleAddAllocation = () => {
    if (!newAllocation.kode || newAllocation.jumlah <= 0) {
        setAllocationError('Pastikan akun telah dipilih dan jumlah lebih dari 0.');
        return;
    }
    if (newAllocation.jumlah > (newAllocation.sisa ?? 0)) {
        setAllocationError(`Jumlah alokasi (${formatCurrency(newAllocation.jumlah)}) melebihi sisa anggaran (${formatCurrency(newAllocation.sisa ?? 0)}).`);
        return;
    }
    setAllocationError(''); // Clear error
    setNewActivity(prev => ({ ...prev, allocations: [...prev.allocations, { ...newAllocation }] }));
    setNewAllocation({ kode: '', uraian: '', jumlah: 0, pagu: 0, sisa: 0 });
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

  // --- AI Assistant Handlers ---
  const sendAiPrompt = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    const userMessage: AiMessage = {
      id: generateMessageId(),
      sender: 'user',
      content: trimmed,
      timestamp: new Date().toISOString()
    };

    const conversationWithUser = [...aiMessages, userMessage];

    setAiMessages(conversationWithUser);
    setIsAiProcessing(true);
    setAiError(null);

    const sanitizedHistory = conversationWithUser.filter(message => message.id !== INITIAL_AI_MESSAGE_ID);
    const systemPrompt = buildAiSystemPrompt();

    const payload: AiRequestMessage[] = [
      { role: 'system', content: systemPrompt },
      ...sanitizedHistory.map(message => ({
        role: message.sender,
        content: message.content
      }))
    ];

    try {
      const aiReply = await fetchAiResponse(payload);
      const cleanedReply = sanitizeModelOutput(aiReply);
      const assistantMessage: AiMessage = {
        id: generateMessageId(),
        sender: 'assistant',
        content: cleanedReply,
        timestamp: new Date().toISOString()
      };
      setAiMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('AI assistant error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan saat memanggil layanan AI.';
      setAiError(errorMessage);
      const fallbackMessage: AiMessage = {
        id: generateMessageId(),
        sender: 'assistant',
        content: errorMessage.includes('API key')
          ? 'Konfigurasi API key AI belum lengkap. Periksa variabel lingkungan dan coba lagi.'
          : 'Maaf, terjadi kendala saat menghubungi layanan AI. Silakan coba beberapa saat lagi.',
        timestamp: new Date().toISOString()
      };
      setAiMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleAiSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (isAiProcessing) {
      return;
    }
    const text = aiInput.trim();
    if (!text) {
      return;
    }
    setAiInput('');
    await sendAiPrompt(text);
  };

  const handleQuickPrompt = (prompt: string) => {
    if (isAiProcessing) {
      setAiInput(prompt);
      return;
    }
    setAiInput('');
    void sendAiPrompt(prompt);
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

  const handleStatusChange = (status: string) => {
    setSelectedStatus(prev => {
        const newSet = new Set(prev);

        if (status === 'all') {
            return new Set(['all']);
        }

        newSet.delete('all');

        if (newSet.has(status)) {
            newSet.delete(status);
        } else {
            newSet.add(status);
        }

        if (newSet.size === 0) {
            return new Set(['all']);
        }

        return newSet;
    });
  };

  const handleResetFilters = () => {
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonthIndex);
    setShowAllActivities(false);
    setSelectedStatus(new Set(['all']));
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
        if (!user?.id) {
          setError('Sesi pengguna tidak ditemukan. Silakan login kembali.');
          setIsProcessing(false);
          return;
        }
        try {
          const binaryStr = event.target?.result;
          const data = parseExcelFile(binaryStr as string | ArrayBuffer);
          const processingResult = processExcelData(data);

          await supabaseService.saveProcessedResult(
            processingResult, 
            fileToProcess.name, 
            {
              reportType: metadata.reportType,
              reportDate: metadata.reportDate,
            },
            user.id
          );

          // After saving, fetch latest to ensure consistency
          const latestData = await supabaseService.getLatestProcessedResult(user.id);
          if (latestData) {
            applyProcessedResult(latestData);
          }
          
          // Refresh: history list to include new entry
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
    [applyProcessedResult, loadHistory]
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

  const filteredActivities = useMemo(() => {
    if (!activities.length) return [];

    const normalizedSearch = activitySearchTerm.trim().toLowerCase();
    const matchesSearch = (activity: Activity) =>
      !normalizedSearch || activity.nama.toLowerCase().includes(normalizedSearch);
    const matchesStatus = (activity: Activity) => {
      if (selectedStatus.has('all')) {
        return true;
      }
      const activityStatus = (activity.status || 'tanpa-status').toLowerCase();
      return selectedStatus.has(activityStatus);
    };
    const matchesPeriod = (activity: Activity) => {
      if (showAllActivities) return true;

      const rawDate = activity.tanggal_pelaksanaan;
      const parsedDate = rawDate ? new Date(rawDate) : null;
      const hasValidDate = parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime());

      if (selectedMonth === 'no-date') {
        return !hasValidDate;
      }

      if (!hasValidDate) {
        return selectedMonth === 'all' && selectedYear === 'all';
      }

      const activityMonth = parsedDate.getMonth();
      const activityYear = parsedDate.getFullYear();

      const monthMatches = selectedMonth === 'all' || activityMonth === selectedMonth;
      const yearMatches = selectedYear === 'all' || activityYear === selectedYear;

      return monthMatches && yearMatches;
    };

    const sortedActivities = [...activities].sort((a, b) => {
      const dateA = a.tanggal_pelaksanaan ? new Date(a.tanggal_pelaksanaan).getTime() : 0;
      const dateB = b.tanggal_pelaksanaan ? new Date(b.tanggal_pelaksanaan).getTime() : 0;

      if (dateA && dateB) {
        return dateB - dateA;
      }
      if (dateA) return -1;
      if (dateB) return 1;
      return a.nama.localeCompare(b.nama);
    });

    return sortedActivities.filter(
      activity => matchesSearch(activity) && matchesStatus(activity) && matchesPeriod(activity)
    );
  }, [
    activities,
    activitySearchTerm,
    selectedStatus,
    showAllActivities,
    selectedMonth,
    selectedYear,
  ]);

  const totalActivities = filteredActivities.length;
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

  const paginatedActivities = useMemo(() => {
    if (!filteredActivities.length) return [];
    if (activitiesPerPage === 'all') {
      return filteredActivities;
    }
    const startIndex = (activitiesPage - 1) * activitiesPerPage;
    const endIndex = startIndex + activitiesPerPage;
    return filteredActivities.slice(startIndex, endIndex);
  }, [filteredActivities, activitiesPerPage, activitiesPage]);

  const paginatedActivityGroups = useMemo(() => {
    if (!paginatedActivities.length) {
      return [];
    }
    return [
      {
        key: 'all',
        label: '',
        activities: paginatedActivities,
      },
    ];
  }, [paginatedActivities]);

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
    map.set('all', filteredActivities.length);
    return map;
  }, [filteredActivities.length, filteredActivities]);

  const handleAddActivity = async () => {
    setError(''); // Clear previous errors
    if (!newActivity.nama || !newActivity.tanggal_pelaksanaan) {
      setError('Nama kegiatan dan tanggal pelaksanaan wajib diisi.');
      return;
    }
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
        if (!user?.id) {
          throw new Error('Sesi pengguna tidak valid. Silakan login ulang.');
        }
        await supabaseService.updateActivity(editingActivityId, payload, user.id);
        savedActivity = { ...payload, id: editingActivityId };
      } else {
        if (!user?.id) {
          throw new Error('Sesi pengguna tidak valid. Silakan login kembali.');
        }
        savedActivity = await supabaseService.addActivity(payload, user.id);
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

      setNewActivity({ nama: '', allocations: [], status: 'Rencana', attachments: [], tanggal_pelaksanaan: '', tujuan_kegiatan: '', kl_unit_terkait: '', penanggung_jawab: '', capaian: '', pending_issue: '', rencana_tindak_lanjut: '' });
      setActivityAttachments([]);
      setNewAttachmentFiles([]);
      setAttachmentsToRemove(new Set());
      setAiAutofillError(null);
      setAiAutofillSuccess(null);
      setAiAutofillSteps([]);
      setIsAiAutofilling(false);
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
      status: activity.status || 'Rencana',
      allocations: [...activity.allocations],
      attachments: activity.attachments ?? [],
      tanggal_pelaksanaan: activity.tanggal_pelaksanaan || '',
      tujuan_kegiatan: activity.tujuan_kegiatan || '',
      kl_unit_terkait: activity.kl_unit_terkait || '',
      penanggung_jawab: activity.penanggung_jawab || '',
      capaian: activity.capaian || '',
      pending_issue: activity.pending_issue || '',
      rencana_tindak_lanjut: activity.rencana_tindak_lanjut || ''
    });
    setActivityAttachments(activity.attachments ?? []);
    setNewAttachmentFiles([]);
    setAttachmentsToRemove(new Set());
    setAiAutofillError(null);
    setAiAutofillSuccess(null);
    setAiAutofillSteps([]);
    setIsAiAutofilling(false);
    setEditingActivityId(activity.id);
    setIsEditing(true);
    setShowActivityForm(true);
  };

  const handleCancelEdit = () => {
    setNewActivity({ nama: '', allocations: [], status: 'Rencana', attachments: [], tanggal_pelaksanaan: '', tujuan_kegiatan: '', kl_unit_terkait: '', penanggung_jawab: '', capaian: '', pending_issue: '', rencana_tindak_lanjut: '' });
    setActivityAttachments([]);
    setNewAttachmentFiles([]);
    setAttachmentsToRemove(new Set());
    setAiAutofillError(null);
    setAiAutofillSuccess(null);
    setAiAutofillSteps([]);
    setIsAiAutofilling(false);
    setIsEditing(false);
    setEditingActivityId(null);
    setShowActivityForm(false);
  };

  const handleRemoveActivity = async (id: string, activityName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Hapus Kegiatan',
      message: `Apakah Anda yakin ingin menghapus kegiatan "${activityName}"? Tindakan ini tidak dapat dibatalkan.`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setIsSaving(true);
        try {
          if (!user?.id) {
            throw new Error('Sesi pengguna tidak valid. Silakan login ulang.');
          }
          await supabaseService.removeActivity(id, user.id);
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
      },
      type: 'danger'
    });
  };

  const calculateTotalAllocation = (allocations: BudgetAllocation[]) => {
    return allocations.reduce((sum, item) => sum + item.jumlah, 0);
  };

  const handleDepthChange = async (depth: number) => {
    if (!user?.id) return;
    setMaxDepth(depth);
    resetExpansion();
    try {
      await supabaseService.saveSetting('hierarchyMaxDepth', depth.toString(), user.id);
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
      downloadExcelFile(result.finalData, newFileName, {
        periodeLaluLabel,
        periodeIniLabel,
        sdPeriodeLabel,
      });
  };

  const extractTextFromPdf = useCallback(async (file: File): Promise<string> => {
    try {
      // Use pdfjs-dist for PDF text extraction
      const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
      const workerSrcModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');

      // Ensure the worker version always matches the runtime library version
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrcModule.default;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      const numPages = pdf.numPages;
      
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }
      
      return fullText.trim();
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw new Error('Gagal mengekstrak teks dari PDF. Pastikan file PDF tidak terenkripsi dan dapat dibaca.');
    }
  }, []);

  const handleAutoFillFromPdf = useCallback(async () => {
    setAiAutofillError(null);
    setAiAutofillSuccess(null);

    const pdfFiles = newAttachmentFiles.filter(file => {
      const name = file.name.toLowerCase();
      return file.type === 'application/pdf' || name.endsWith('.pdf');
    });

    if (pdfFiles.length === 0) {
      setAiAutofillSteps([
        {
          label: 'Mengumpulkan teks dari lampiran',
          status: 'error',
          detail: 'Unggah minimal satu file PDF agar AI dapat membaca isi dokumen.',
        },
      ]);
      setAiAutofillError('Unggah minimal satu dokumen PDF terlebih dahulu untuk digunakan oleh AI.');
      return;
    }

    const initialSteps: AiAutofillStep[] = [
      { label: 'Mengumpulkan teks dari lampiran', status: 'processing' },
      { label: 'Mengirim permintaan ke AI', status: 'processing' },
    ];
    setAiAutofillSteps(initialSteps);
    setIsAiAutofilling(true);

    const updateStep = (index: number, patch: Partial<AiAutofillStep>) => {
      setAiAutofillSteps(prev => prev.map((step, idx) => (idx === index ? { ...step, ...patch } : step)));
    };

    try {
      let combinedText = '';
      for (let i = 0; i < pdfFiles.length; i += 1) {
        const file = pdfFiles[i];
        updateStep(0, {
          detail: `Membaca ${file.name} (${i + 1} dari ${pdfFiles.length})`,
        });
        try {
          const extractedText = await extractTextFromPdf(file);
          if (extractedText) {
            combinedText += `\n\n==== ${file.name} ====\n${extractedText}`;
          }
        } catch (extractionError) {
          console.warn(`Gagal mengekstrak teks dari ${file.name}`, extractionError);
        }
      }

      if (!combinedText.trim()) {
        updateStep(0, {
          status: 'error',
          detail: 'Tidak ada teks yang berhasil diambil dari lampiran PDF.',
        });
        throw new Error('Tidak ada teks yang berhasil diambil dari lampiran.');
      }

      updateStep(0, {
        status: 'success',
        detail: `Berhasil mengumpulkan teks dari ${pdfFiles.length} file PDF`,
      });

      const truncated = combinedText.slice(0, 15000);
      const systemMessage =
        'Anda adalah asisten yang mengekstrak informasi kegiatan dari dokumen resmi. ' +
        'Jawab hanya dengan JSON valid tanpa teks tambahan.';

      const userMessage = [
        'Berdasarkan kumpulan dokumen berikut, isi field kegiatan yang tersedia. Gunakan format tanggal YYYY-MM-DD.',
        'Jika informasi tidak ditemukan, biarkan field kosong atau null.',
        'Gunakan struktur JSON berikut:',
        '{',
        '  "nama": string | null,',
        '  "status": string | null,',
        '  "tanggal": string | null,',
        '  "tujuan": string | null,',
        '  "unitTerkait": string | null,',
        '  "penanggungJawab": string | null,',
        '  "capaian": string | null,',
        '  "pendingIssue": string | null,',
        '  "rencanaTindakLanjut": string | null,',
        '  "allocations": [',
        '    { "kode": string, "uraian": string | null, "jumlah": number | null }',
        '  ]',
        '}',
        '',
        'Kumpulan dokumen:',
        truncated,
      ].join('\n');

      updateStep(1, { detail: 'Mengirim permintaan ke model AI...' });

      const aiResponse = await fetchAiResponse([
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ]);
      const modelUsed = getLastSuccessfulModel() ?? 'tidak diketahui';
      console.log('AI autofill menggunakan model:', modelUsed);

      const cleaned = aiResponse.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      setNewActivity(prev => ({
        ...prev,
        nama: parsed.nama ?? prev.nama,
        status: parsed.status ?? prev.status ?? 'Rencana',
        tanggal_pelaksanaan: parsed.tanggal ?? prev.tanggal_pelaksanaan,
        tujuan_kegiatan: parsed.tujuan ?? prev.tujuan_kegiatan,
        kl_unit_terkait: parsed.unitTerkait ?? prev.kl_unit_terkait,
        penanggung_jawab: parsed.penanggungJawab ?? prev.penanggung_jawab,
        capaian: parsed.capaian ?? prev.capaian,
        pending_issue: parsed.pendingIssue ?? prev.pending_issue,
        rencana_tindak_lanjut: parsed.rencanaTindakLanjut ?? prev.rencana_tindak_lanjut,
      }));

      if (Array.isArray(parsed.allocations)) {
        const normalizedAllocations = parsed.allocations
          .map((item: any) => ({
            kode: typeof item.kode === 'string' ? item.kode.trim() : '',
            uraian: typeof item.uraian === 'string' ? item.uraian.trim() : '',
            jumlah: Number(item.jumlah) || 0,
          }))
          .filter(item => item.kode);

        if (normalizedAllocations.length > 0) {
          setNewActivity(prev => ({
            ...prev,
            allocations:
              prev.allocations && prev.allocations.length > 0
                ? prev.allocations
                : normalizedAllocations,
          }));
        }
      }

      updateStep(1, {
        status: 'success',
        detail: `Respons AI diterima. Field telah diisi, mohon ditinjau.`,
      });

      setAiAutofillSuccess(`Field berhasil diisi dari ${pdfFiles.length} dokumen. Mohon tinjau sebelum menyimpan.`);
    } catch (error) {
      console.error('AI autofill error:', error);
      const message = error instanceof Error ? error.message : 'Gagal mengisi form dengan AI.';
      updateStep(1, {
        status: 'error',
        detail: message,
      });
      setAiAutofillError(message);
    } finally {
      setIsAiAutofilling(false);
    }
  }, [extractTextFromPdf, newAttachmentFiles]);

  // --- Search Logic ---
  const searchMatches = useMemo(() => {
    if (!searchTerm.trim()) return [];

    const orGroups = searchTerm.split(/\s+OR\s+/i).map(g => g.trim()).filter(Boolean);
    if (!orGroups.length) return [];

    return activeData
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => {
        const kode = typeof row?.[0] === 'string' ? row[0].trim() : '';
        const segments = kode.split('.').map(segment => segment.trim()).filter(Boolean);
        if (segments.length < 8) {
          return false;
        }

        const kodeLower = kode.toLowerCase();
        const uraianLower = typeof row?.[1] === 'string' ? row[1].toLowerCase() : '';

        return orGroups.some(group => {
          const andTerms = group.split(/\s+AND\s+/i).map(t => t.trim().toLowerCase()).filter(Boolean);
          if (!andTerms.length) return false;
          return andTerms.every(term => kodeLower.includes(term) || uraianLower.includes(term));
        });
      })
      .map(({ row, rowIndex }) => {
        const clonedRow: any = Array.isArray(row) ? [...row] : [];
        const kode = typeof row?.[0] === 'string' ? row[0] : '';

        clonedRow.__hasChildren = false;
        clonedRow.__isDataGroup = false;
        clonedRow.__isLeaf = true;
        clonedRow.__isVisible = true;
        clonedRow.__level = 7;
        clonedRow.__path = kode || `search-${rowIndex}`;

        return clonedRow;
      });
  }, [searchTerm, activeData]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setDisplayedData(hierarchicalData);
      return;
    }
    if (!searchMatches.length) {
      setDisplayedData([]);
      return;
    }
    if (maxDepth < 8) setMaxDepth(8);

    setDisplayedData(searchMatches);
  }, [searchTerm, searchMatches, hierarchicalData, maxDepth]);

  const searchTotals = useMemo(() => {
    if (!searchTerm.trim() || !searchMatches.length) return null;

    const dataRows = searchMatches.filter(row => !row.__hasChildren && !row.__isDataGroup);
    const totalPagu = dataRows.reduce((sum, row) => sum + (Number(row[2]) || 0), 0);
    const totalRealisasi = dataRows.reduce((sum, row) => sum + (Number(row[6]) || 0), 0);
    const persentase = totalPagu > 0 ? (totalRealisasi / totalPagu) * 100 : 0;

    return {
      totalPagu,
      totalRealisasi,
      persentase,
      sisa: totalPagu - totalRealisasi,
    };
  }, [searchTerm, searchMatches]);

  // --- Render Logic ---
  if (isInitializing) {
    return <InitializingSpinner />;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div>
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>SAPA AI - Smart Analytics Platform</span>
                </h1>
                <p className="text-xs text-gray-500">Kelola realisasi dan kegiatan</p>
              </div>
              <div className="flex items-center gap-4">
                {isAdmin && (
                  <button
                    onClick={() => navigate('/users')}
                    className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition"
                  >
                    Kelola User
                  </button>
                )}
                <div className="flex items-center gap-3 border-l pl-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-800">{user?.name}</p>
                    <p className="text-xs text-gray-500">{user?.unit || user?.role}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded-md transition"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

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

              {/* Rencana Details */}
              {selectedActivity.tujuan_kegiatan && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Detail Rencana</h4>
                  <div className="text-sm space-y-2 text-gray-800">
                    <p><span className="font-semibold">Tujuan:</span> {selectedActivity.tujuan_kegiatan}</p>
                    <p><span className="font-semibold">K/L/Unit Terkait:</span> {selectedActivity.kl_unit_terkait}</p>
                    <p><span className="font-semibold">Penanggung Jawab:</span> {selectedActivity.penanggung_jawab}</p>
                  </div>
                </div>
              )}

              {/* Capaian Details */}
              {selectedActivity.capaian && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Detail Realisasi</h4>
                  <div className="text-sm space-y-2 text-gray-800">
                    <p><span className="font-semibold">Capaian:</span> {selectedActivity.capaian}</p>
                    <p><span className="font-semibold">Pending Issue:</span> {selectedActivity.pending_issue}</p>
                    <p><span className="font-semibold">Tindak Lanjut:</span> {selectedActivity.rencana_tindak_lanjut}</p>
                  </div>
                </div>
              )}

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

            <BudgetOverviewPanel
              activeTotals={activeTotals}
              progressPercentage={progressPercentage}
              additionalTotals={additionalTotals}
              budgetView={budgetView}
              formatCurrency={formatCurrency}
            />

            <AccountSummaryPanel
              totals={level7Totals}
              budgetView={budgetView}
              onBudgetViewChange={setBudgetView}
              show={showAccountSummary}
              onToggle={() => setShowAccountSummary(prev => !prev)}
              formatCurrency={formatCurrency}
            />

            {/* Analytics Panels */}
            <MonthlyAnalyticsPanel
              currentReport={currentReport}
              allReports={allReports}
              onAIAnalysis={(analysis) => {
                const aiMessage: AiMessage = {
                  id: generateMessageId(),
                  sender: 'assistant',
                  content: analysis,
                  timestamp: new Date().toISOString()
                };
                setAiMessages(prev => [...prev, aiMessage]);
              }}
            />

            <TrendAnalyticsPanel
              allReports={allReports}
              onAIAnalysis={(analysis) => {
                const aiMessage: AiMessage = {
                  id: generateMessageId(),
                  sender: 'assistant',
                  content: analysis,
                  timestamp: new Date().toISOString()
                };
                setAiMessages(prev => [...prev, aiMessage]);
              }}
            />

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
                        <input
                          type="text"
                          placeholder="Cari kode/uraian..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="block w-full pl-10 pr-16 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                          title="Contoh: a and b atau x or y"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 space-x-2">
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
                              <p className="text-xs text-gray-500 mt-2">- Tidak case-sensitive. Kombinasikan dengan `AND` atau `OR`.</p>
                            </div>
                          </div>
                          <svg className="w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
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
                  <thead className="bg-gray-50 sticky top-0 z-10">
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
                      const showExpandCollapse = row.__hasChildren || row.__isDataGroup;
                      const isGroup = row.__isGroup;
                      const paguRevisi = row[2];
                      const sdPeriode = row[6];
                      const level = Number(row.__level ?? 0);
                      const indent = Math.max(level, 0) * 12;
                      const rawCode = String(row[0] ?? '');
                      const codeSegments = rawCode.split('.');
                      const showFullCode = Boolean(searchTerm.trim());
                      const displayCode = showFullCode
                        ? rawCode
                        : level > 0 && codeSegments.length > 0
                          ? (codeSegments.pop() || rawCode)
                          : rawCode;
                      return (
                        <tr key={`${row.__path}-${rowIndex}`} className={`transition-colors ${isGroup ? 'bg-gray-100 font-medium' : 'odd:bg-white even:bg-slate-50'} hover:bg-blue-50`}>
                          <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            <div className="flex items-center">
                              <div className="flex items-center" style={{ marginLeft: `${indent}px` }}>
                                {showExpandCollapse && (
                                  <button
                                    type="button"
                                    onClick={() => toggleNode(row.__path, row.__isDataGroup)}
                                    className={`mr-2 w-6 h-6 flex items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                                    row.__isExpanded
                                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                                      : 'bg-gray-100 border-gray-300 text-gray-600'
                                  }`}
                                    aria-label={row.__isExpanded ? 'Collapse kode akun' : 'Expand kode akun'}
                                  >
                                    {row.__isExpanded ? '-' : '+'}
                                  </button>
                                )}
                                {!showExpandCollapse && <div className="mr-2 w-6 h-6"></div>}
                                <span>{displayCode}</span>
                              </div>
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

            {/* Calendar Section */}
            {activities.length > 0 && (
              <div className="bg-white shadow-xl rounded-xl overflow-hidden mt-8">
                <div 
                  className="p-4 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors duration-200 flex justify-between items-center"
                  onClick={() => setShowCalendar(!showCalendar)}
                >
                  <h2 className="text-xl font-semibold text-gray-800">Kalender Kegiatan</h2>
                  <svg 
                    className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${showCalendar ? 'rotate-180' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <div className={`transition-all duration-200 ${showCalendar ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                  <ActivityCalendarPanel
                    activities={activities}
                    formatActivityDate={formatActivityDate}
                    onActivityClick={(activity) => setSelectedActivity(activity)}
                  />
                </div>
              </div>
            )}

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
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    Status
                                </label>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                    {(['all', 'rencana', 'komitmen', 'outstanding', 'terbayar'] as const).map(status => {
                                        const label = {
                                            'all': 'Semua',
                                            'rencana': 'Rencana',
                                            'komitmen': 'Komitmen',
                                            'outstanding': 'Outstanding',
                                            'terbayar': 'Terbayar'
                                        }[status];
                                        return (
                                            <label key={status} className="flex items-center space-x-2 text-sm cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    checked={selectedStatus.has(status)}
                                                    onChange={() => handleStatusChange(status)}
                                                />
                                                <span>{label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {totalActivities > 0 ? (
                            <>
                                <div className="space-y-8">
                                    {paginatedActivityGroups.map(group => (
                                        <div key={group.key} className="space-y-3">
                                            {group.label ? (
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-lg font-semibold text-gray-800">{group.label}</h3>
                                                    <span className="text-xs text-gray-500">
                                                        {totalActivitiesByGroup.get(group.key) ?? group.activities.length} kegiatan
                                                    </span>
                                                </div>
                                            ) : null}
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
                                                                        className="odd:bg-white even:bg-slate-50 hover:bg-blue-50 transition-colors cursor-pointer"
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
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                                                                    </svg>
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleRemoveActivity(activity.id, activity.nama);
                                                                                    }}
                                                                                    className="text-red-500 hover:text-red-700"
                                                                                    title="Hapus kegiatan"
                                                                                >
                                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 22H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                                                                    </svg>
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                        <tfoot className="bg-gray-50 font-medium">
                                                            <tr>
                                                                <td className="px-4 py-3 text-right" colSpan={2}>Total Alokasi Halaman Ini</td>
                                                                <td className="px-4 py-3 text-right">
                                                                    {formatCurrency(group.activities.reduce((sum, activity) => 
                                                                        sum + activity.allocations.reduce((allocSum, alloc) => allocSum + (alloc.jumlah || 0), 0),
                                                                    0))}
                                                                </td>
                                                                <td colSpan={3}></td>
                                                            </tr>
                                                        </tfoot>
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
                                  : 'Tidak ada kegiatan untuk filter yang dipilih.'
                                }
                            </p>
                        )}
                    </div>
                </div>
            </div>
          </div>
        )}

        {/* AI Assistant Panel */}
        <div ref={aiAssistantPanelRef} className="mt-8">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Asisten AI Anggaran</h2>
                <p className="text-sm text-gray-500">
                  Ajukan pertanyaan terkait realisasi, alokasi kegiatan, atau lampiran yang sudah diunggah.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                </svg>
                <span>AI memanfaatkan data laporan dan lampiran di projek ini.</span>
              </div>
            </div>

            <div
              ref={aiChatContainerRef}
              className="mt-4 h-80 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4"
            >
              {aiMessages.length === 0 && (
                <div className="text-sm text-gray-500 text-center">
                  Percakapan akan muncul di sini setelah Anda mengirim pertanyaan.
                </div>
              )}
              {aiMessages.map(message => {
                const isUser = message.sender === 'user';
                const timestamp = new Date(message.timestamp).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-3 text-sm shadow-sm ${
                        isUser
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-800'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          {isUser ? 'Anda' : 'AI Anggaran'}
                        </span>
                        <span className={`text-[10px] ${isUser ? 'text-white/80' : 'text-gray-400'}`}>
                          {timestamp}
                        </span>
                      </div>
                      <p
                        className="leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: formatMessageContent(message.content) }}
                      />
                    </div>
                  </div>
                );
              })}
              {isAiProcessing && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
                    <svg
                      className="h-4 w-4 animate-spin text-blue-500"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V2a10 10 0 1010 10h-2a8 8 0 11-16 0z"
                      ></path>
                    </svg>
                    <span>Sedang memproses...</span>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleAiSubmit} className="mt-4">
              <label htmlFor="ai-message" className="sr-only">
                Kirim pertanyaan ke asisten AI
              </label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <textarea
                  id="ai-message"
                  value={aiInput}
                  onChange={(event) => setAiInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleAiSubmit();
                    }
                  }}
                  placeholder="Contoh: Berapa total realisasi anggaran saat ini?"
                  className="min-h-[88px] flex-1 resize-none rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
                  disabled={isAiProcessing}
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isAiProcessing || !aiInput.trim()}
                >
                  {isAiProcessing ? 'Menunggu...' : 'Kirim'}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Tekan Enter untuk mengirim. Gunakan Shift + Enter untuk baris baru.
              </p>
            </form>

            {aiError && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {aiError}
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contoh pertanyaan</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {AI_QUICK_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleQuickPrompt(prompt)}
                    className="rounded-full border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isAiProcessing}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

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
                          <div
                            key={`${file.name}-${file.lastModified}`}
                            className="flex items-center justify-between gap-3 border border-dashed border-blue-200 rounded-md px-3 py-2 bg-blue-50/60"
                          >
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
                      <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
                        <button
                          type="button"
                          onClick={handleAutoFillFromPdf}
                          disabled={isAiAutofilling}
                          className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md border ${
                            isAiAutofilling
                              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                              : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {isAiAutofilling ? (
                            <span className="flex items-center gap-2">
                              <svg
                                className="h-4 w-4 animate-spin text-current"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V2a10 10 0 100 20 10 10 0 01-8-10z"
                                ></path>
                              </svg>
                              <span>Proses AI sedang berjalan...</span>
                            </span>
                          ) : (
                            'Isi Form Otomatis dengan AI'
                          )}
                        </button>
                        <p className="text-xs text-gray-500 max-w-md">
                          Unggah satu atau lebih dokumen PDF sebagai lampiran, lalu gunakan tombol ini agar AI menyalin data ke form.
                        </p>
                      </div>
                      {aiAutofillSteps.length > 0 && (
                        <div className="mt-3 space-y-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-gray-700">
                          {aiAutofillSteps.map((step, index) => (
                            <div key={index} className="flex items-start gap-2">
                              {step.status === 'processing' && (
                                <svg className="h-4 w-4 mt-[2px] animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V2a10 10 0 100 20 10 10 0 01-8-10z"></path>
                                </svg>
                              )}
                              {step.status === 'success' && (
                                <svg className="h-4 w-4 mt-[2px] text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                              {step.status === 'error' && (
                                <svg className="h-4 w-4 mt-[2px] text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                              <div>
                                <p className="font-medium">{step.label}</p>
                                {step.detail && <p className="mt-0.5 text-gray-600">{step.detail}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {aiAutofillError && (
                        <p className="mt-2 text-xs text-red-600">{aiAutofillError}</p>
                      )}
                      {aiAutofillSuccess && (
                        <p className="mt-2 text-xs text-green-600">{aiAutofillSuccess}</p>
                      )}
                    </div>
                  </div>

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

                  <div className="space-y-1.5">
                    <label htmlFor="tanggal-pelaksanaan" className="block text-sm font-medium text-gray-700">
                      Tanggal Pelaksanaan <span className="text-red-500">*</span>
                    </label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <input
                        id="tanggal-pelaksanaan"
                        type="date"
                        value={newActivity.tanggal_pelaksanaan || ''}
                        onChange={(e) => setNewActivity({...newActivity, tanggal_pelaksanaan: e.target.value})}
                        min={`${reportYear}-01-01`}
                        max={`${reportYear}-12-31`}
                        className="block w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Hanya bisa memilih tanggal pada tahun laporan ({reportYear}).</p>
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
                        <option value="Rencana">Rencana</option>
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

                  {/* Alokasi Anggaran */}
                  <div className="space-y-4 pt-4 border-t">
                    <h3 className="text-md font-semibold text-gray-800">Alokasi Anggaran</h3>
                    <div>
                      <label htmlFor="kode-akun-search" className="block text-sm font-medium text-gray-700 mb-1">Akun</label>
                      <div className="relative">
                        <input
                          id="kode-akun-search"
                          type="text"
                          placeholder="Cari kode atau uraian akun..."
                          value={allocationSearch}
                          onChange={(e) => {
                            setAllocationSearch(e.target.value);
                            setIsAllocationDropdownOpen(true);
                          }}
                          onFocus={() => setIsAllocationDropdownOpen(true)}
                          className="block w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                        {isAllocationDropdownOpen && filteredAllocations.length > 0 && (
                          <div ref={allocationDropdownRef} className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {filteredAllocations.map((item, index) => (
                              <div
                                key={index}
                                onClick={() => handleSelectAllocation(item)}
                                className="p-2.5 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100"
                              >
                                <div className="flex justify-between items-center">
                                  <div>
                                    <p className="font-medium text-gray-800">{item.uraian}</p>
                                    <p className="text-xs text-gray-500">{item.kode}</p>
                                  </div>
                                  <div className="text-right flex-shrink-0 ml-4">
                                    <p className="text-xs text-gray-500">Sisa</p>
                                    <p className="font-semibold text-gray-800">{formatCurrency(item.sisa)}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {newAllocation.kode && (
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-sm space-y-1">
                        <p><span className="font-semibold w-20 inline-block">Kode:</span> {newAllocation.kode}</p>
                        <p><span className="font-semibold w-20 inline-block">Uraian:</span> {newAllocation.uraian}</p>
                        <p><span className="font-semibold w-20 inline-block">Pagu:</span> {formatCurrency(newAllocation.pagu ?? 0)}</p>
                        <p><span className="font-semibold w-20 inline-block">Sisa:</span> {formatCurrency(newAllocation.sisa ?? 0)}</p>
                      </div>
                    )}

                    <div>
                      <label htmlFor="jumlah-alokasi" className="block text-sm font-medium text-gray-700 mb-1">Jumlah Alokasi</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 sm:text-sm">Rp</span>
                        <input
                          id="jumlah-alokasi"
                          type="text"
                          value={formatNumber(String(newAllocation.jumlah))}
                          onChange={handleNumberChange}
                          className="block w-full p-2.5 pl-8 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-right"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {allocationError && <p className="text-red-600 text-sm">{allocationError}</p>}

                    <div className="flex justify-end">
                      <button onClick={handleAddAllocation} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md">Tambah Alokasi</button>
                    </div>
                  </div>

                  {/* Daftar Alokasi */}
                  {newActivity.allocations.length > 0 && (
                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex items-center justify-between">
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
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
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

                  {/* Additional Details Section */}
                  <div className="space-y-4 pt-4 border-t">
                      <h3 className="text-md font-semibold text-gray-800">Detail Tambahan</h3>
                      <div>
                        <label htmlFor="tujuan-kegiatan" className="block text-sm font-medium text-gray-700">Tujuan Kegiatan</label>
                        <textarea id="tujuan-kegiatan" value={newActivity.tujuan_kegiatan} onChange={(e) => setNewActivity({...newActivity, tujuan_kegiatan: e.target.value})} rows={3} className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md sm:text-sm"></textarea>
                      </div>
                      <div>
                        <label htmlFor="kl-unit-terkait" className="block text-sm font-medium text-gray-700">K/L/Unit Terkait</label>
                        <input id="kl-unit-terkait" type="text" value={newActivity.kl_unit_terkait} onChange={(e) => setNewActivity({...newActivity, kl_unit_terkait: e.target.value})} className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md sm:text-sm" />
                      </div>
                      <div>
                        <label htmlFor="penanggung-jawab" className="block text-sm font-medium text-gray-700">Penanggung Jawab</label>
                        <input id="penanggung-jawab" type="text" value={newActivity.penanggung_jawab} onChange={(e) => setNewActivity({...newActivity, penanggung_jawab: e.target.value})} className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md sm:text-sm" />
                      </div>
                      <div>
                        <label htmlFor="capaian" className="block text-sm font-medium text-gray-700">Capaian</label>
                        <textarea id="capaian" value={newActivity.capaian} onChange={(e) => setNewActivity({...newActivity, capaian: e.target.value})} rows={3} className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md sm:text-sm"></textarea>
                      </div>
                      <div>
                        <label htmlFor="pending-issue" className="block text-sm font-medium text-gray-700">Pending Issue</label>
                        <textarea id="pending-issue" value={newActivity.pending_issue} onChange={(e) => setNewActivity({...newActivity, pending_issue: e.target.value})} rows={3} className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md sm:text-sm"></textarea>
                      </div>
                      <div>
                        <label htmlFor="rencana-tindak-lanjut" className="block text-sm font-medium text-gray-700">Rencana Tindak Lanjut</label>
                        <textarea id="rencana-tindak-lanjut" value={newActivity.rencana_tindak_lanjut} onChange={(e) => setNewActivity({...newActivity, rencana_tindak_lanjut: e.target.value})} rows={3} className="mt-1 block w-full p-2.5 border border-gray-300 rounded-md sm:text-sm"></textarea>
                      </div>
                  </div>

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
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <FloatingAIButton onOpenAiPanel={scrollToAiPanel} />
      
      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        type={confirmDialog.type}
      />
    </div>
  );
};

export default App;
