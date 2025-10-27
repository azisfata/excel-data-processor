import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Bar, Doughnut } from 'react-chartjs-2';
import { MonthlyReport, getLevel7DataForMonth } from '../../../services/historicalDataService';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  ChartDataLabels
);

const formatToShortCurrency = (value: number): string => {
  if (!Number.isFinite(value)) {
    return 'Rp 0';
  }

  const absValue = Math.abs(value);

  if (absValue >= 1_000_000_000) {
    const normalized = value / 1_000_000_000;
    const formatted = normalized.toLocaleString('id-ID', {
      minimumFractionDigits: Math.abs(normalized) < 10 ? 1 : 0,
      maximumFractionDigits: Math.abs(normalized) < 10 ? 1 : 0,
    });
    return `Rp ${formatted} M`;
  }

  if (absValue >= 1_000_000) {
    const normalized = value / 1_000_000;
    const formatted = normalized.toLocaleString('id-ID', {
      minimumFractionDigits: Math.abs(normalized) < 10 ? 1 : 0,
      maximumFractionDigits: Math.abs(normalized) < 10 ? 1 : 0,
    });
    return `Rp ${formatted} Jt`;
  }

  if (absValue >= 1_000) {
    const normalized = value / 1_000;
    const formatted = normalized.toLocaleString('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return `Rp ${formatted} Rb`;
  }

  return `Rp ${value.toLocaleString('id-ID')}`;
};

interface MonthlyAnalyticsPanelProps {
  currentReport: MonthlyReport | null;
  _allReports: MonthlyReport[];
  onAIAnalysis: (analysis: string) => void;
}

const MonthlyAnalyticsPanel: React.FC<MonthlyAnalyticsPanelProps> = ({
  currentReport,
  _allReports,
  onAIAnalysis,
}) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [compositionView, setCompositionView] = useState<'realisasi' | 'pagu'>('realisasi');

  // Data untuk bulan ini saja
  const currentMonthData = useMemo(() => {
    if (!currentReport) return [];
    return getLevel7DataForMonth(currentReport);
  }, [currentReport]);

  // Data untuk pie chart komposisi (realisasi atau pagu berdasarkan pilihan user)
  const compositionData = useMemo(() => {
    if (!currentMonthData.length) return null;

    // Group by uraian dan ambil top 8
    const composition = new Map<string, number>();
    currentMonthData.forEach(item => {
      if (!item || !item.uraian) return;

      let value = 0;
      if (compositionView === 'realisasi') {
        value = item.realisasi || 0;
        if (value <= 0) return; // Skip yang tidak ada realisasi
      } else {
        value = item.pagu || 0;
        if (value <= 0) return; // Skip yang tidak ada pagu
      }

      const existing = composition.get(item.uraian) || 0;
      composition.set(item.uraian, existing + value);
    });

    // Ambil semua data yang sudah diurutkan
    const allSorted = Array.from(composition.entries()).sort(([, a], [, b]) => b - a);

    // Ambil 10 teratas untuk ditampilkan
    const top10 = allSorted.slice(0, 10);

    // Hitung "Lainnya" dari sisa data yang sudah diurutkan
    const others = allSorted.slice(10).reduce((sum, [, value]) => sum + value, 0);

    // Gabungkan 10 teratas dengan "Lainnya"
    const finalData = [...top10];
    if (others > 0) {
      finalData.push(['Lainnya', others]);
    }

    return finalData;
  }, [currentMonthData, compositionView]);

  // Data agregasi anggaran per uraian akun - Tampilkan semua uraian tanpa pembatasan
  const sisaAnggaranTerbanyak = useMemo(() => {
    if (!currentMonthData.length) return [];

    const groupedByUraian = new Map<
      string,
      {
        uraian: string;
        pagu: number;
        realisasi: number;
        sisa: number;
        persentase: number;
      }
    >();

    currentMonthData.forEach(item => {
      if (!item || !item.uraian) return;

      const pagu = item.pagu || 0;
      const realisasi = item.realisasi || 0;

      const existing = groupedByUraian.get(item.uraian);
      if (existing) {
        existing.pagu += pagu;
        existing.realisasi += realisasi;
      } else {
        groupedByUraian.set(item.uraian, {
          uraian: item.uraian,
          pagu,
          realisasi,
          sisa: 0,
          persentase: 0,
        });
      }
    });

    // Tampilkan semua uraian tanpa pembatasan, hanya filter yang memiliki pagu > 0
    return Array.from(groupedByUraian.values())
      .map(item => {
        const sisa = item.pagu - item.realisasi;
        const persentase = item.pagu > 0 ? (item.realisasi / item.pagu) * 100 : 0;
        return {
          ...item,
          sisa: sisa > 0 ? sisa : 0,
          persentase,
        };
      })
      .filter(item => item.pagu > 0) // Hanya filter yang memiliki pagu, tanpa batasan jumlah
      .sort((a, b) => b.pagu - a.pagu);
  }, [currentMonthData]);

  // Alias agar nama variabel lama tetap ada jika masih dipakai di bagian lain
  const anggaranPerUraian = sisaAnggaranTerbanyak;

  // Generate AI analysis untuk bulan ini
  const generateMonthlyAnalysis = () => {
    if (!currentReport || !currentMonthData.length) {
      onAIAnalysis('Tidak ada data untuk dianalisis pada bulan ini.');
      return;
    }

    const totalPagu = currentMonthData.reduce((sum, item) => sum + (item?.pagu || 0), 0);
    const totalRealisasi = currentMonthData.reduce((sum, item) => sum + (item?.realisasi || 0), 0);
    const totalSisa = totalPagu - totalRealisasi;
    const avgPersentase =
      currentMonthData.reduce((sum, item) => sum + (item?.persentase || 0), 0) /
      currentMonthData.length;

    // Kategorisasi kesehatan penyerapan
    const healthyItems = currentMonthData.filter(item => item && item.persentase >= 75).length;
    const warningItems = currentMonthData.filter(
      item => item && item.persentase >= 50 && item.persentase < 75
    ).length;
    const criticalItems = currentMonthData.filter(item => item && item.persentase < 50).length;

    // Identifikasi kantong sisa besar
    const largeSisa = currentMonthData
      .filter(item => item && item.sisa > 100000000) // > 100 juta
      .sort((a, b) => (b?.sisa || 0) - (a?.sisa || 0))
      .slice(0, 5);

    const analysis = `
📊 **ANALISIS PENYERAPAN ANGGARAN - ${currentReport.reportType} ${new Date(currentReport.reportDate).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}**

🔍 **Tingkat Kesehatan Penyerapan:**
- Total Pagu: Rp ${totalPagu.toLocaleString('id-ID')}
- Total Realisasi: Rp ${totalRealisasi.toLocaleString('id-ID')} (${((totalRealisasi / totalPagu) * 100).toFixed(1)}%)
- Sisa Anggaran: Rp ${totalSisa.toLocaleString('id-ID')}
- Rata-rata Persentase: ${avgPersentase.toFixed(1)}%

📈 **Distribusi Kesehatan Akun:**
- Sehat (≥75%): ${healthyItems} akun
- Perhatian (50-74%): ${warningItems} akun  
- Kritis (&lt;50%): ${criticalItems} akun

💰 **Kantong Sisa Anggaran Terbesar:**
${largeSisa
  .map(
    (item, index) =>
      `${index + 1}. ${item.uraian || 'N/A'}: Rp ${(item.sisa || 0).toLocaleString('id-ID')} (${(((item.sisa || 0) / (item.pagu || 1)) * 100).toFixed(1)}% sisa)`
  )
  .join('\n')}

🎯 **Insight & Rekomendasi:**
- ${
      avgPersentase >= 75
        ? '✅ Penyerapan anggaran overall SANGAT BAIK'
        : avgPersentase >= 50
          ? '⚠️ Penyerapan anggaran cukup baik, namun perlu ditingkatkan'
          : '❌ Penyerapan anggaran perlu perhatian serius'
    }
- ${criticalItems > 0 ? `🚨 Ada ${criticalItems} akun dengan penyerapan kritis yang perlu immediate action` : '✅ Tidak ada akun dengan penyerapan kritis'}
- ${largeSisa.length > 0 ? `💡 Fokus pada optimasi ${largeSisa.length} akun dengan sisa anggaran terbesar` : '✅ Tidak ada kantong sisa anggaran yang signifikan'}
    `.trim();

    onAIAnalysis(analysis);
  };

  // Chart configurations dengan datalabel plugin
  const topBottomChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          padding: 15,
          font: {
            size: 11,
          },
        },
      },
      datalabels: {
        // Tampilkan datalabel hanya untuk dataset Realisasi
        display: (context: any) => context.datasetIndex === 1,
        // Formatter untuk datalabel
        formatter: (value: any, context: any) => {
          const originalData = context.chart.data.originalData as any[];
          if (originalData && originalData[context.dataIndex]) {
            const dataItem = originalData[context.dataIndex];
            const nominalJT = (value / 1000000).toFixed(1);
            const persentase = dataItem.persentase || 0;
            const countInfo = dataItem.count > 1 ? ` (${dataItem.count} item)` : '';
            return `Rp ${nominalJT}JT\n(${persentase}%)${countInfo}`;
          }
          return '';
        },
        // Posisi datalabel di atas batang
        anchor: 'end',
        align: 'top',
        // Styling
        font: {
          weight: 'bold',
          size: 11,
        },
        // Warna teks
        color: '#374151',
        // Background datalabel
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
        borderRadius: 4,
        padding: 4,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const rawValue = context.parsed.y;
            const originalData = context.chart.data.originalData as any[];
            const dataItem = originalData && originalData[context.dataIndex];

            if (label === 'Target (Pagu)') {
              return `Target: Rp ${rawValue.toLocaleString('id-ID')}`;
            } else if (label === 'Realisasi' && dataItem) {
              const persentase = dataItem.persentase || 0;
              const countInfo = dataItem.count > 1 ? ` (${dataItem.count} item digabung)` : '';
              return [
                `Realisasi: Rp ${rawValue.toLocaleString('id-ID')} (${persentase.toFixed(1)}%)${countInfo}`,
              ];
            }
            return `${label}: Rp ${rawValue.toLocaleString('id-ID')}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value: any) {
            // Format dalam jutaan untuk readability
            if (value >= 1000000000) {
              return `Rp ${(value / 1000000000).toFixed(1)}M`;
            } else if (value >= 1000000) {
              return `Rp ${(value / 1000000).toFixed(0)}JT`;
            }
            return `Rp ${(value / 1000).toFixed(0)}K`;
          },
        },
      },
      x: {
        // Kosongkan label sumbu X karena info sudah di atas batang
        ticks: {
          callback: function (_value: any, index: number, _values: any[]) {
            // Di sini `values` adalah array nilai sumbu X, bukan data AccountLevel7Data
            // Kita harus mengakses data dari chart object
            const chart = this.chart;
            if (chart && chart.data && chart.data.originalData) {
              const originalData = chart.data.originalData as any[];
              if (originalData && originalData[index]) {
                const item = originalData[index];
                // Truncate nama jika terlalu panjang
                return item.uraian && item.uraian.length > 20
                  ? item.uraian.substring(0, 20) + '...'
                  : item.uraian || '';
              }
            }
            // Jika tidak ada data original, fallback ke string kosong
            return '';
          },
        },
      },
    },
  };

  const topBottomChartData = (data: any[], label: string) => {
    const isTop = label.includes('Top');
    return {
      labels: data.map(item => {
        // Kosongkan label karena info akan ditampilkan di atas batang
        // Tambahkan pengecekan agar tidak mengakses properti dari item yang null/undefined
        return item && item.uraian && item.uraian.length > 20
          ? item.uraian.substring(0, 20) + '...'
          : item?.uraian || '';
      }),
      datasets: [
        {
          label: 'Target (Pagu)',
          data: data.map(item => item.pagu),
          backgroundColor: isTop ? 'rgba(156, 163, 175, 0.7)' : 'rgba(156, 163, 175, 0.7)',
          borderColor: isTop ? 'rgb(156, 163, 175)' : 'rgb(156, 163, 175)',
          borderWidth: 1,
          order: 2,
        },
        {
          label: 'Realisasi',
          data: data.map(item => item.realisasi),
          backgroundColor: isTop ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)',
          borderColor: isTop ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
          borderWidth: 1,
          order: 1,
        },
      ],
      // Store original data for tooltip calculations
      originalData: data,
    } as any;
  };

  const compositionChartData = compositionData
    ? {
        labels: compositionData.map(([name]) => name),
        datasets: [
          {
            data: compositionData.map(([, value]) => value),
            backgroundColor: [
              '#3B82F6',
              '#10B981',
              '#F59E0B',
              '#EF4444',
              '#8B5CF6',
              '#EC4899',
              '#14B8A6',
              '#F97316',
              '#6B7280',
              '#FCD34D',
            ],
            borderWidth: 1,
          },
        ],
      }
    : null;

  const compositionChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw as number;
            const total = context.dataset.data.reduce((sum: number, val: number) => sum + val, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `Rp ${value.toLocaleString('id-ID')} (${percentage}%)`;
          },
        },
      },
      datalabels: {
        // Tampilkan persentase di tengah potongan pie
        display: true,
        formatter: (value: any, context: any) => {
          const total = context.dataset.data.reduce((sum: number, val: number) => sum + val, 0);
          const percentage = ((value / total) * 100).toFixed(1);
          return `${percentage}%`;
        },
        // Posisi di tengah potongan pie
        align: 'center',
        anchor: 'center',
        // Styling
        font: {
          weight: 'bold',
          size: 12,
        },
        // Warna teks
        color: '#FFFFFF',
        // Background datalabel
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 4,
        padding: 4,
        // Konfigurasi untuk menampilkan garis penghubung jika label tidak muat
        // Jika potongan terlalu kecil, label akan ditampilkan di luar dengan garis penghubung
        shouldDisplay: (context: any) => {
          // Hitung persentase untuk menentukan apakah potongan cukup besar
          const value = context.raw as number;
          const total = context.dataset.data.reduce((sum: number, val: number) => sum + val, 0);
          const percentage = (value / total) * 100;

          // Jika persentase < 5%, tampilkan di luar dengan garis penghubung
          if (percentage < 5) {
            return false;
          }
          return true;
        },
        // Fallback untuk label yang tidak muat di tengah
        // Jika shouldDisplay: false, Chart.js akan otomatis menampilkan di luar dengan garis penghubung
        // Kita perlu mengatur warna garis penghubung
        connectorColor: '#374151',
        connectorWidth: 1,
      },
    },
  };

  const anggaranChartData = useMemo(() => {
    if (!anggaranPerUraian.length) return null;

    // Function to determine color based on percentage
    const getHealthColor = (percentage: number) => {
      if (percentage >= 75) return '#10B981'; // Green - Sehat
      if (percentage >= 50) return '#F59E0B'; // Yellow - Warning
      return '#EF4444'; // Red - Kritis
    };

    const getHealthColorLight = (percentage: number) => {
      if (percentage >= 75) return '#34D399'; // Light Green
      if (percentage >= 50) return '#FCD34D'; // Light Yellow
      return '#F87171'; // Light Red
    };

    // Tampilkan semua uraian tanpa batasan
    return {
      labels: anggaranPerUraian.map(item => item.uraian),
      datasets: [
        {
          label: 'Realisasi',
          data: anggaranPerUraian.map(item => item.realisasi),
          backgroundColor: anggaranPerUraian.map(item => getHealthColorLight(item.persentase)),
          borderColor: anggaranPerUraian.map(item => getHealthColor(item.persentase)),
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 32,
          datalabels: {
            display: (context: any) => {
              const value = context.dataset.data[context.dataIndex] as number;
              return value > 0;
            },
            formatter: (_value: number, context: any) => {
              const originalData = (context.chart.data as any).originalData?.[context.dataIndex];
              if (!originalData || !originalData.pagu) {
                return '';
              }
              const percentage =
                originalData.pagu > 0 ? (originalData.realisasi / originalData.pagu) * 100 : 0;
              return `${percentage.toFixed(0)}%`;
            },
            color: '#FFFFFF',
            anchor: 'center',
            align: 'center',
            font: {
              weight: 'bold',
              size: 12,
            },
            textStroke: '1px rgba(0,0,0,0.3)',
            textStrokeColor: 'rgba(0,0,0,0.3)',
            clip: false,
          },
        },
        {
          label: 'Sisa',
          data: anggaranPerUraian.map(item => item.sisa),
          backgroundColor: '#E5E7EB',
          borderColor: '#9CA3AF',
          borderWidth: 2,
          borderRadius: 0,
          borderSkipped: false,
          maxBarThickness: 32,
          datalabels: {
            display: false, // Hide labels for better readability
          },
        },
      ],
      originalData: anggaranPerUraian,
    } as any;
  }, [anggaranPerUraian]);

  const anggaranChartOptions = useMemo(() => {
    return {
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          right: 60,
          left: 10,
          top: 10,
          bottom: 10,
        },
      },
      scales: {
        x: {
          stacked: true,
          beginAtZero: true,
          grid: {
            drawBorder: false,
            color: 'rgba(156, 163, 175, 0.1)',
          },
          ticks: {
            callback: (value: any) => {
              const numericValue =
                typeof value === 'string' ? parseFloat(value) : (value as number);
              if (!Number.isFinite(numericValue)) {
                return value;
              }
              return formatToShortCurrency(numericValue);
            },
            font: {
              size: 11,
              weight: '500',
            },
            color: '#6B7280',
          },
        },
        y: {
          stacked: true,
          grid: {
            display: false,
            drawBorder: false,
          },
          ticks: {
            callback: (_value: any, index: number) => {
              const label = anggaranPerUraian[index]?.uraian || '';
              // Tampilkan label lengkap tanpa pemotongan untuk memastikan semua uraian terlihat
              return label;
            },
            font: {
              size: 11, // Sedikit lebih kecil untuk mengakomodasi lebih banyak data
              weight: '500',
            },
            color: '#374151',
            // Auto-skip dinonaktifkan untuk memastikan semua label ditampilkan
            autoSkip: false,
            maxRotation: 0,
            minRotation: 0,
          },
        },
      },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            usePointStyle: true,
            boxWidth: 12,
            padding: 20,
            font: {
              size: 12,
              weight: '600',
            },
            // Add custom legend items for health status
            generateLabels: function (chart: any) {
              const data = chart.data;
              return [
                {
                  text: 'Realisasi',
                  fillStyle: '#22C55E',
                  strokeStyle: '#16A34A',
                  lineWidth: 2,
                  pointStyle: 'rect',
                  hidden: false,
                  index: 0,
                },
                {
                  text: 'Sisa Anggaran',
                  fillStyle: '#E5E7EB',
                  strokeStyle: '#9CA3AF',
                  lineWidth: 1,
                  pointStyle: 'rect',
                  hidden: false,
                  index: 1,
                },
              ];
            },
          },
        },
        datalabels: {
          display: false, // We'll handle this in the dataset
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#FFFFFF',
          bodyColor: '#E5E7EB',
          borderColor: '#374151',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          displayColors: true,
          callbacks: {
            title: (items: any[]) => {
              const firstItem = items[0];
              const original = firstItem?.chart?.data?.originalData?.[firstItem.dataIndex] || null;
              return original
                ? {
                    label: original.uraian,
                    health:
                      original.persentase >= 75
                        ? '🟢 Sehat'
                        : original.persentase >= 50
                          ? '🟡 Perhatian'
                          : '🔴 Kritis',
                  }
                : '';
            },
            label: (context: any) => {
              const label = context.dataset.label || '';
              const value = context.parsed.x;
              if (label === 'Realisasi') {
                return `Realisasi: Rp ${value.toLocaleString('id-ID')}`;
              }
              return `Sisa: Rp ${value.toLocaleString('id-ID')}`;
            },
            afterBody: (items: any[]) => {
              const firstItem = items[0];
              const original = firstItem?.chart?.data?.originalData?.[firstItem.dataIndex] || null;
              if (!original) {
                return [];
              }
              const persentase = original.pagu > 0 ? (original.realisasi / original.pagu) * 100 : 0;
              const healthStatus =
                persentase >= 75
                  ? 'Sehat (≥75%)'
                  : persentase >= 50
                    ? 'Perhatian (50-74%)'
                    : 'Kritis (&lt;50%)';
              return [
                '',
                `📊 Total Pagu: Rp ${original.pagu.toLocaleString('id-ID')}`,
                `💰 Total Realisasi: Rp ${original.realisasi.toLocaleString('id-ID')}`,
                `💸 Sisa Anggaran: Rp ${original.sisa.toLocaleString('id-ID')}`,
                `📈 Persentase: ${persentase.toFixed(1)}%`,
                `🏥 Status: ${healthStatus}`,
              ];
            },
          },
        },
      },
      interaction: {
        intersect: true,
        mode: 'nearest',
      },
      animation: {
        duration: 750,
        easing: 'easeInOutQuart' as const,
      },
    } as any;
  }, [anggaranPerUraian]);

  if (!currentReport) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center text-gray-500">
          <p>Pilih laporan bulanan untuk melihat analisis grafik</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div
        className="p-4 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setExpandedSection(expandedSection === 'monthly' ? null : 'monthly')}
      >
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-800">
            📊 Analisis Bulanan -{' '}
            {new Date(currentReport.reportDate).toLocaleDateString('id-ID', {
              month: 'long',
              year: 'numeric',
            })}
          </h3>
          <svg
            className={`w-5 h-5 text-gray-500 transform transition-transform ${expandedSection === 'monthly' ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div
        className={`transition-all duration-200 ${expandedSection === 'monthly' ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}
      >
        <div className="p-6 space-y-6">
          {/* Visualisasi Anggaran per Uraian */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-lg font-semibold text-gray-800 mb-1">
                  📊 Penyerapan Anggaran per Uraian
                </h4>
                <p className="text-sm text-gray-600">
                  Monitoring realisasi anggaran dengan indikator kesehatan penyerapan
                  {anggaranPerUraian.length > 0 && (
                    <span className="ml-2 font-medium text-blue-600">
                      (Menampilkan {anggaranPerUraian.length} uraian)
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 text-xs">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-1"></div>
                    <span className="text-gray-600">Sehat (≥75%)</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full mr-1"></div>
                    <span className="text-gray-600">Warning (50-74%)</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-red-500 rounded-full mr-1"></div>
                    <span className="text-gray-600">Kritis (&lt;50%)</span>
                  </div>
                </div>
              </div>
            </div>

            {anggaranChartData ? (
              <div className="relative">
                <div className="h-[600px] bg-gradient-to-br from-gray-50 to-white rounded-lg p-4 border border-gray-100 overflow-auto">
                  <Bar
                    data={anggaranChartData}
                    options={anggaranChartOptions}
                    key={`anggaran-chart-${anggaranPerUraian.length}`}
                  />
                </div>

                {/* Summary Statistics */}
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-green-600 font-medium">Sehat</p>
                        <p className="text-2xl font-bold text-green-700">
                          {anggaranPerUraian.filter(item => item.persentase >= 75).length}
                        </p>
                      </div>
                      <div className="bg-green-100 rounded-full p-2">
                        <svg
                          className="w-5 h-5 text-green-600"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-yellow-600 font-medium">Perhatian</p>
                        <p className="text-2xl font-bold text-yellow-700">
                          {
                            anggaranPerUraian.filter(
                              item => item.persentase >= 50 && item.persentase < 75
                            ).length
                          }
                        </p>
                      </div>
                      <div className="bg-yellow-100 rounded-full p-2">
                        <svg
                          className="w-5 h-5 text-yellow-600"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-red-600 font-medium">Kritis</p>
                        <p className="text-2xl font-bold text-red-700">
                          {anggaranPerUraian.filter(item => item.persentase < 50).length}
                        </p>
                      </div>
                      <div className="bg-red-100 rounded-full p-2">
                        <svg
                          className="w-5 h-5 text-red-600"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <svg
                  className="w-16 h-16 text-gray-400 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <p className="text-lg font-medium text-gray-600 mb-1">Tidak ada data anggaran</p>
                <p className="text-sm text-gray-500">
                  Upload file laporan untuk melihat visualisasi penyerapan anggaran
                </p>
              </div>
            )}
          </div>

          {/* Komposisi Anggaran */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-md font-semibold text-blue-800">
                💰 Komposisi {compositionView === 'realisasi' ? 'Realisasi' : 'Pagu'} Anggaran
                <span className="text-sm font-normal text-gray-600 ml-2">
                  (
                  {compositionView === 'realisasi'
                    ? 'Uang kita paling banyak habis untuk apa?'
                    : 'Uang kita dialokasikan untuk apa?'}
                  )
                </span>
              </h4>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Tampilkan:</label>
                <select
                  value={compositionView}
                  onChange={e => setCompositionView(e.target.value as 'realisasi' | 'pagu')}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="realisasi">Realisasi</option>
                  <option value="pagu">Pagu</option>
                </select>
              </div>
            </div>
            {compositionChartData ? (
              <div className="h-80">
                <Doughnut
                  data={compositionChartData}
                  options={compositionChartOptions}
                  key={`composition-chart-${compositionData?.length || 0}-${compositionView}`}
                />
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-500">
                <p>Tidak ada data {compositionView}</p>
              </div>
            )}
          </div>

          {/* AI Analysis Button */}
          <div className="flex justify-center">
            <button
              onClick={generateMonthlyAnalysis}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              Analisis dengan AI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyAnalyticsPanel;
