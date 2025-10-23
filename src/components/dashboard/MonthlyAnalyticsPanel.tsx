import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import { 
  MonthlyReport, 
  AccountLevel7Data, 
  MonthlyTrendData, 
  getLevel7DataForMonth,
  getAllLevel7Accounts 
} from '../../../services/historicalDataService';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface MonthlyAnalyticsPanelProps {
  currentReport: MonthlyReport | null;
  allReports: MonthlyReport[];
  onAIAnalysis: (analysis: string) => void;
}

const MonthlyAnalyticsPanel: React.FC<MonthlyAnalyticsPanelProps> = ({
  currentReport,
  allReports,
  onAIAnalysis
}) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Data untuk bulan ini saja
  const currentMonthData = useMemo(() => {
    if (!currentReport) return [];
    return getLevel7DataForMonth(currentReport);
  }, [currentReport]);

  // Top 5 dan Bottom 5 penyerapan anggaran (berdasarkan level 7 code)
  const { top5, bottom5 } = useMemo(() => {
    if (!currentMonthData.length) return { top5: [], bottom5: [] };
    
    // Group by level 7 code dan jumlahkan pagu/realisasi
    const groupedByLevel7 = new Map<string, {
      kode: string;
      uraian: string;
      totalPagu: number;
      totalRealisasi: number;
      persentase: number;
      sisa: number;
    }>();
    
    currentMonthData.forEach(item => {
      if (item.pagu <= 0) return; // Skip yang tidak ada pagu
      
      const existing = groupedByLevel7.get(item.kode);
      if (existing) {
        existing.totalPagu += item.pagu;
        existing.totalRealisasi += item.realisasi;
      } else {
        groupedByLevel7.set(item.kode, {
          kode: item.kode,
          uraian: item.uraian,
          totalPagu: item.pagu,
          totalRealisasi: item.realisasi,
          persentase: item.persentase,
          sisa: item.sisa
        });
      }
    });
    
    // Hitung ulang persentase dan sisa untuk setiap group
    const aggregatedData = Array.from(groupedByLevel7.values()).map(item => ({
      kode: item.kode,
      uraian: item.uraian,
      pagu: item.totalPagu,
      realisasi: item.totalRealisasi,
      persentase: item.totalPagu > 0 ? (item.totalRealisasi / item.totalPagu) * 100 : 0,
      sisa: item.totalPagu - item.totalRealisasi
    }));
    
    const sorted = aggregatedData.sort((a, b) => b.persentase - a.persentase);
    
    return {
      top5: sorted.slice(0, 5),
      bottom5: sorted.slice(-5).reverse()
    };
  }, [currentMonthData]);

  // Data untuk pie chart komposisi realisasi
  const compositionData = useMemo(() => {
    if (!currentMonthData.length) return null;
    
    // Group by uraian dan ambil top 8
    const composition = new Map<string, number>();
    currentMonthData.forEach(item => {
      if (item.realisasi > 0) {
        const existing = composition.get(item.uraian) || 0;
        composition.set(item.uraian, existing + item.realisasi);
      }
    });
    
    const sorted = Array.from(composition.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8);
    
    // Group sisanya sebagai "Lainnya"
    const others = sorted.slice(8).reduce((sum, [,value]) => sum + value, 0);
    if (others > 0) {
      sorted.push(['Lainnya', others]);
    }
    
    return sorted;
  }, [currentMonthData]);

  // Generate AI analysis untuk bulan ini
  const generateMonthlyAnalysis = () => {
    if (!currentReport || !currentMonthData.length) {
      onAIAnalysis('Tidak ada data untuk dianalisis pada bulan ini.');
      return;
    }

    const totalPagu = currentMonthData.reduce((sum, item) => sum + item.pagu, 0);
    const totalRealisasi = currentMonthData.reduce((sum, item) => sum + item.realisasi, 0);
    const totalSisa = totalPagu - totalRealisasi;
    const avgPersentase = currentMonthData.reduce((sum, item) => sum + item.persentase, 0) / currentMonthData.length;
    
    // Kategorisasi kesehatan penyerapan
    const healthyItems = currentMonthData.filter(item => item.persentase >= 75).length;
    const warningItems = currentMonthData.filter(item => item.persentase >= 50 && item.persentase < 75).length;
    const criticalItems = currentMonthData.filter(item => item.persentase < 50).length;
    
    // Identifikasi kantong sisa besar
    const largeSisa = currentMonthData
      .filter(item => item.sisa > 100000000) // > 100 juta
      .sort((a, b) => b.sisa - a.sisa)
      .slice(0, 5);

    const analysis = `
📊 **ANALISIS PENYERAPAN ANGGARAN - ${currentReport.reportType} ${new Date(currentReport.reportDate).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}**

🔍 **Tingkat Kesehatan Penyerapan:**
- Total Pagu: Rp ${totalPagu.toLocaleString('id-ID')}
- Total Realisasi: Rp ${totalRealisasi.toLocaleString('id-ID')} (${((totalRealisasi/totalPagu)*100).toFixed(1)}%)
- Sisa Anggaran: Rp ${totalSisa.toLocaleString('id-ID')}
- Rata-rata Persentase: ${avgPersentase.toFixed(1)}%

📈 **Distribusi Kesehatan Akun:**
- Sehat (≥75%): ${healthyItems} akun
- Perhatian (50-74%): ${warningItems} akun  
- Kritis (<50%): ${criticalItems} akun

💰 **Kantong Sisa Anggaran Terbesar:**
${largeSisa.map((item, index) => 
  `${index + 1}. ${item.uraian}: Rp ${item.sisa.toLocaleString('id-ID')} (${((item.sisa/item.pagu)*100).toFixed(1)}% sisa)`
).join('\n')}

🎯 **Insight & Rekomendasi:**
- ${avgPersentase >= 75 ? '✅ Penyerapan anggaran overall SANGAT BAIK' : 
    avgPersentase >= 50 ? '⚠️ Penyerapan anggaran cukup baik, namun perlu ditingkatkan' : 
    '❌ Penyerapan anggaran perlu perhatian serius'}
- ${criticalItems > 0 ? `🚨 Ada ${criticalItems} akun dengan penyerapan kritis yang perlu immediate action` : '✅ Tidak ada akun dengan penyerapan kritis'}
- ${largeSisa.length > 0 ? `💡 Fokus pada optimasi ${largeSisa.length} akun dengan sisa anggaran terbesar` : '✅ Tidak ada kantong sisa anggaran yang signifikan'}
    `.trim();

    onAIAnalysis(analysis);
  };

  // Chart configurations
  const topBottomChartOptions = {
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
            size: 11
          }
        }
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label === 'Target (Pagu)') {
              return `Target: Rp ${value.toLocaleString('id-ID')}`;
            } else if (label === 'Realisasi') {
              const index = context.dataIndex;
              const item = context.chart.data.datasets[0].data[index] as AccountLevel7Data;
              const persentase = item.persentase || 0;
              return [
                `Realisasi: Rp ${value.toLocaleString('id-ID')}`,
                `Persentase: ${persentase.toFixed(1)}%`
              ];
            }
            return `${label}: Rp ${value.toLocaleString('id-ID')}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => {
            // Format dalam jutaan untuk readability
            if (value >= 1000000000) {
              return `Rp ${(value / 1000000000).toFixed(1)}M`;
            } else if (value >= 1000000) {
              return `Rp ${(value / 1000000).toFixed(0)}JT`;
            }
            return `Rp ${(value / 1000).toFixed(0)}K`;
          }
        }
      }
    }
  };

  const topBottomChartData = (data: AccountLevel7Data[], label: string) => {
    const isTop = label.includes('Top');
    return {
      labels: data.map(item => item.uraian.length > 25 ? item.uraian.substring(0, 25) + '...' : item.uraian),
      datasets: [
        {
          label: 'Target (Pagu)',
          data: data.map(item => item.pagu),
          backgroundColor: isTop ? 'rgba(156, 163, 175, 0.7)' : 'rgba(156, 163, 175, 0.7)',
          borderColor: isTop ? 'rgb(156, 163, 175)' : 'rgb(156, 163, 175)',
          borderWidth: 1,
          order: 2
        },
        {
          label: 'Realisasi',
          data: data.map(item => item.realisasi),
          backgroundColor: isTop ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)',
          borderColor: isTop ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
          borderWidth: 1,
          order: 1
        }
      ],
      // Store original data for tooltip calculations
      originalData: data
    } as any;
  };

  const compositionChartData = compositionData ? {
    labels: compositionData.map(([name]) => name),
    datasets: [
      {
        data: compositionData.map(([, value]) => value),
        backgroundColor: [
          '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
          '#EC4899', '#14B8A6', '#F97316', '#6B7280'
        ],
        borderWidth: 1
      }
    ]
  } : null;

  const compositionChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw as number;
            const total = context.dataset.data.reduce((sum: number, val: number) => sum + val, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `Rp ${value.toLocaleString('id-ID')} (${percentage}%)`;
          }
        }
      }
    }
  };

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
            📊 Analisis Bulanan - {new Date(currentReport.reportDate).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
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
      <div className={`transition-all duration-200 ${expandedSection === 'monthly' ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="p-6 space-y-6">
          {/* Top 5 & Bottom 5 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top 5 */}
            <div className="bg-green-50 rounded-lg p-4">
              <h4 className="text-md font-semibold text-green-800 mb-4">🏆 Top 5 Penyerapan Terbaik</h4>
              {top5.length > 0 ? (
                <div className="h-64">
                  <Bar data={topBottomChartData(top5, 'Top')} options={topBottomChartOptions} />
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  <p>Tidak ada data penyerapan</p>
                </div>
              )}
            </div>

            {/* Bottom 5 */}
            <div className="bg-red-50 rounded-lg p-4">
              <h4 className="text-md font-semibold text-red-800 mb-4">⚠️ 5 Penyerapan Terendah</h4>
              {bottom5.length > 0 ? (
                <div className="h-64">
                  <Bar data={topBottomChartData(bottom5, 'Bottom')} options={topBottomChartOptions} />
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  <p>Tidak ada data penyerapan</p>
                </div>
              )}
            </div>
          </div>

          {/* Komposisi Realisasi */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="text-md font-semibold text-blue-800 mb-4">
              💰 Komposisi Realisasi Anggaran
              <span className="text-sm font-normal text-gray-600 ml-2">
                (Uang kita paling banyak habis untuk apa?)
              </span>
            </h4>
            {compositionChartData ? (
              <div className="h-80">
                <Doughnut data={compositionChartData} options={compositionChartOptions} />
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-500">
                <p>Tidak ada data realisasi</p>
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
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
