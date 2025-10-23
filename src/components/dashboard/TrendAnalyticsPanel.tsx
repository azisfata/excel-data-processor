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
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { 
  MonthlyReport, 
  MonthlyTrendData, 
  AccountTrendData,
  createMonthlyTrendData,
  createAccountTrendData,
  getAllLevel7Accounts,
  createMonthlyCompositionData,
  createCumulativeData
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
  Legend
);

interface TrendAnalyticsPanelProps {
  allReports: MonthlyReport[];
  onAIAnalysis: (analysis: string) => void;
}

const TrendAnalyticsPanel: React.FC<TrendAnalyticsPanelProps> = ({
  allReports,
  onAIAnalysis
}) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [viewType, setViewType] = useState<'total' | 'account'>('total');

  // Process data untuk tren
  const monthlyTrendData = useMemo(() => {
    if (!allReports.length) return [];
    return createMonthlyTrendData(allReports);
  }, [allReports]);

  const accountTrendData = useMemo(() => {
    if (!selectedAccount || !allReports.length) return null;
    return createAccountTrendData(allReports, selectedAccount);
  }, [allReports, selectedAccount]);

  const availableAccounts = useMemo(() => {
    if (!allReports.length) return [];
    return getAllLevel7Accounts(allReports);
  }, [allReports]);

  const compositionData = useMemo(() => {
    if (!allReports.length) return [];
    return createMonthlyCompositionData(allReports);
  }, [allReports]);

  const cumulativeData = useMemo(() => {
    if (!allReports.length) return [];
    return createCumulativeData(allReports);
  }, [allReports]);

  // Generate AI analysis untuk tren
  const generateTrendAnalysis = () => {
    if (!allReports.length) {
      onAIAnalysis('Tidak ada data historis untuk dianalisis.');
      return;
    }

    if (allReports.length < 2) {
      onAIAnalysis('Membutuhkan minimal 2 bulan data untuk analisis tren.');
      return;
    }

    // Analisis tren penyerapan
    const trendAnalysis = monthlyTrendData.map((data, index) => {
      if (index === 0) return { ...data, change: 0, changePercent: 0 };
      const prevData = monthlyTrendData[index - 1];
      const change = data.totalRealisasi - prevData.totalRealisasi;
      const changePercent = prevData.totalRealisasi > 0 ? (change / prevData.totalRealisasi) * 100 : 0;
      return { ...data, change, changePercent };
    });

    // Identifikasi pola belanja
    const spendingPattern = trendAnalysis.map(data => ({
      month: data.month,
      year: data.year,
      realisasi: data.totalRealisasi,
      persentase: data.persentase
    }));

    // Hitung velocity (kecepatan penyerapan)
    const avgMonthlyAbsorption = trendAnalysis.reduce((sum, data) => sum + data.totalRealisasi, 0) / trendAnalysis.length;
    const maxAbsorption = Math.max(...trendAnalysis.map(data => data.totalRealisasi));
    const minAbsorption = Math.min(...trendAnalysis.map(data => data.totalRealisasi));
    const volatility = ((maxAbsorption - minAbsorption) / avgMonthlyAbsorption) * 100;

    // Forecast sederhana (linear trend)
    const lastThreeMonths = trendAnalysis.slice(-3);
    const avgGrowth = lastThreeMonths.length > 1 
      ? (lastThreeMonths[lastThreeMonths.length - 1].totalRealisasi - lastThreeMonths[0].totalRealisasi) / (lastThreeMonths.length - 1)
      : 0;
    
    const nextMonthForecast = trendAnalysis.length > 0 
      ? trendAnalysis[trendAnalysis.length - 1].totalRealisasi + avgGrowth
      : 0;

    // Identifikasi dormant items
    const dormantAccounts = availableAccounts.filter(account => {
      const accountData = createAccountTrendData(allReports, account.kode);
      if (!accountData) return true;
      return accountData.data.every(d => d.realisasi === 0);
    });

    const analysis = `
📈 **ANALISIS TREN BULANAN - ${allReports.length} BULAN DATA**

📊 **Tren Penyerapan Anggaran:**
- Rata-rata Penyerapan/Bulan: Rp ${avgMonthlyAbsorption.toLocaleString('id-ID')}
- Penyerapan Tertinggi: Rp ${maxAbsorption.toLocaleString('id-ID')}
- Penyerapan Terendah: Rp ${minAbsorption.toLocaleString('id-ID')}
- Volatilitas: ${volatility.toFixed(1)}% ${volatility > 50 ? '(Tinggi)' : volatility > 25 ? '(Sedang)' : '(Rendah)'}

🔍 **Pola Belanja (Spending Pattern):**
${spendingPattern.map(data => 
  `- ${data.month} ${data.year}: Rp ${data.realisasi.toLocaleString('id-ID')} (${data.persentase.toFixed(1)}%)`
).join('\n')}

📈 **Analisis Kecepatan Penyerapan (Absorption Velocity):**
- ${avgGrowth > 0 ? '📈 Tren Positif' : avgGrowth < 0 ? '📉 Tren Negatif' : '➡️ Tren Stabil'}
- Pertumbuhan rata-rata: Rp ${avgGrowth.toLocaleString('id-ID')}/bulan
- ${volatility > 50 ? '⚠️ Volatilitas tinggi - pola belanja tidak konsisten' : 
    volatility > 25 ? '⚠️ Volatilitas sedang - perlu monitoring' : 
    '✅ Volatilitas rendah - pola belanja stabil'}

🎯 **Peramalan Sederhana:**
- Forecast bulan depan: Rp ${nextMonthForecast.toLocaleString('id-ID')}
- ${nextMonthForecast > avgMonthlyAbsorption ? '📈 Diperkirakan meningkat' : 
    nextMonthForecast < avgMonthlyAbsorption ? '📉 Diperkirakan menurun' : 
    '➡️ Diperkirakan stabil'}

🔕 **Akun "Tidur" (Dormant Items):**
- Total akun tanpa realisasi: ${dormantAccounts.length} dari ${availableAccounts.length} akun
- ${dormantAccounts.length > 0 ? 
    `⚠️ Perlu review: ${dormantAccounts.slice(0, 5).map(a => a.uraian).join(', ')}${dormantAccounts.length > 5 ? '...' : ''}` : 
    '✅ Tidak ada akun tidur signifikan'}

💡 **Rekomendasi Strategis:**
- ${volatility > 50 ? '🎯 Prioritaskan stabilisasi pola belanja bulanan' : 
    volatility > 25 ? '🎯 Monitoring lebih ketat pada fluktuasi belanja' : 
    '✅ Pertahankan konsistensi belanja'}
- ${avgGrowth < 0 ? '🚨 Segera evaluasi penyebab penurunan tren' : 
    avgGrowth > 0 ? '📈 Manfaatkan momentum tren positif' : 
    '🎯 Cari opportunities untuk meningkatkan penyerapan'}
- ${dormantAccounts.length > availableAccounts.length * 0.3 ? 
    '🔍 Review ulang akun-akun yang tidak pernah terpakai' : 
    '✅ Utilisasi akun sudah optimal'}
    `.trim();

    onAIAnalysis(analysis);
  };

  // Chart configurations
  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label.includes('Rp')) {
              return `${label}: Rp ${value.toLocaleString('id-ID')}`;
            }
            return `${label}: ${value.toFixed(1)}%`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => {
            return `Rp ${(value / 1000000).toFixed(0)}M`;
          }
        }
      }
    }
  };

  const stackedBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.parsed.y;
            return `${context.dataset.label}: Rp ${value.toLocaleString('id-ID')}`;
          }
        }
      }
    },
    scales: {
      x: {
        stacked: true,
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `Rp ${(value / 1000000).toFixed(0)}M`
        }
      }
    }
  };

  // Data untuk grafik garis tren realisasi
  const trendLineData = viewType === 'total' ? {
    labels: monthlyTrendData.map(d => `${d.month} ${d.year}`),
    datasets: [
      {
        label: 'Total Realisasi (Rp)',
        data: monthlyTrendData.map(d => d.totalRealisasi),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.1
      }
    ]
  } : accountTrendData ? {
    labels: accountTrendData.data.map(d => `${d.month} ${d.year}`),
    datasets: [
      {
        label: 'Realisasi Akun (Rp)',
        data: accountTrendData.data.map(d => d.realisasi),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.1
      }
    ]
  } : null;

  // Data untuk grafik garis ganda kumulatif vs target
  const cumulativeLineData = {
    labels: cumulativeData.map(d => `${d.month}/${d.year}`),
    datasets: [
      {
        label: 'Realisasi Kumulatif (Rp)',
        data: cumulativeData.map(d => d.cumulative),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.1
      },
      {
        label: 'Target Kumulatif (Rp)',
        data: cumulativeData.map(d => d.targetCumulative),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderDash: [5, 5],
        tension: 0.1
      }
    ]
  };

  // Data untuk stacked bar komposisi belanja
  const stackedBarData = useMemo(() => {
    if (!compositionData.length) return null;

    // Get all unique categories across all months
    const allCategories = new Set<string>();
    compositionData.forEach(month => {
      month.composition.forEach(([category]) => {
        allCategories.add(category);
      });
    });

    const categories = Array.from(allCategories);
    const colors = [
      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
      '#EC4899', '#14B8A6', '#F97316', '#6B7280', '#84CC16'
    ];

    return {
      labels: compositionData.map(d => `${d.month} ${d.year}`),
      datasets: categories.map((category, index) => ({
        label: category,
        data: compositionData.map(month => {
          const found = month.composition.find(([cat]) => cat === category);
          return found ? found[1] : 0;
        }),
        backgroundColor: colors[index % colors.length],
        borderColor: colors[index % colors.length],
        borderWidth: 1
      }))
    };
  }, [compositionData]);

  if (!allReports.length) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center text-gray-500">
          <p>Butuh minimal 2 laporan bulanan untuk melihat analisis tren</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div 
        className="p-4 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setExpandedSection(expandedSection === 'trend' ? null : 'trend')}
      >
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-800">
            📈 Analisis Tren Bulanan ({allReports.length} bulan)
          </h3>
          <svg 
            className={`w-5 h-5 text-gray-500 transform transition-transform ${expandedSection === 'trend' ? 'rotate-180' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div className={`transition-all duration-200 ${expandedSection === 'trend' ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="p-6 space-y-6">
          {/* View Selector */}
          <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Tampilkan:</label>
              <select
                value={viewType}
                onChange={(e) => setViewType(e.target.value as 'total' | 'account')}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm"
              >
                <option value="total">Total Anggaran</option>
                <option value="account">Akun Tertentu</option>
              </select>
            </div>
            
            {viewType === 'account' && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Akun:</label>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm min-w-[300px]"
                >
                  <option value="">Pilih akun...</option>
                  {availableAccounts.map(account => (
                    <option key={account.kode} value={account.kode}>
                      {account.uraian}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Grafik Garis: Tren Realisasi Bulanan */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="text-md font-semibold text-blue-800 mb-4">
              📈 Tren Realisasi Bulanan
              <span className="text-sm font-normal text-gray-600 ml-2">
                ({viewType === 'total' ? 'Total anggaran' : 'Akun tertentu'})
              </span>
            </h4>
            {trendLineData && (
              <div className="h-80">
                <Line data={trendLineData} options={lineChartOptions} />
              </div>
            )}
          </div>

          {/* Grafik Garis Ganda: Laju Serapan Kumulatif vs Target */}
          <div className="bg-purple-50 rounded-lg p-4">
            <h4 className="text-md font-semibold text-purple-800 mb-4">
              📊 Laju Serapan Kumulatif vs Target
            </h4>
            <div className="h-80">
              <Line data={cumulativeLineData} options={lineChartOptions} />
            </div>
          </div>

          {/* Grafik Batang Bertumpuk: Komposisi Belanja Bulanan */}
          <div className="bg-orange-50 rounded-lg p-4">
            <h4 className="text-md font-semibold text-orange-800 mb-4">
              🍰 Komposisi Belanja Bulanan
              <span className="text-sm font-normal text-gray-600 ml-2">
                (Top 10 kategori per bulan)
              </span>
            </h4>
            {stackedBarData ? (
              <div className="h-80">
                <Bar data={stackedBarData} options={stackedBarOptions} />
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-500">
                <p>Tidak ada data komposisi</p>
              </div>
            )}
          </div>

          {/* AI Analysis Button */}
          <div className="flex justify-center">
            <button
              onClick={generateTrendAnalysis}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Analisis Tren dengan AI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrendAnalyticsPanel;
