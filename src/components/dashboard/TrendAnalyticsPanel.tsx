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
  Filler,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Bar, Line } from 'react-chartjs-2';
import {
  MonthlyReport,
  createMonthlyTrendData,
  createAccountTrendData,
  getAllLevel7Accounts,
  createMonthlyCompositionData,
} from '../../../services/historicalDataService';
import { AccountLevel7Data } from '../../../types';

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
  Filler,
  ChartDataLabels
);

interface TrendAnalyticsPanelProps {
  allReports: MonthlyReport[];
  onAIAnalysis: (analysis: string) => void;
}

const formatShortCurrency = (value: number): string => {
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1_000_000_000_000) {
    return `Rp ${(value / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '')}TRN`;
  }
  if (absoluteValue >= 1_000_000_000) {
    return `Rp ${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}MLR`;
  }
  if (absoluteValue >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}JT`;
  }
  if (absoluteValue >= 1_000) {
    return `Rp ${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return `Rp ${value.toLocaleString('id-ID')}`;
};

const TrendAnalyticsPanel: React.FC<TrendAnalyticsPanelProps> = ({ allReports, onAIAnalysis }) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [selectedUraian, setSelectedUraian] = useState<string>('');
  const [viewType, setViewType] = useState<'total' | 'account'>('total');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  // Process data untuk tren
  const monthlyTrendData = useMemo(() => {
    if (!allReports.length) return [];
    return createMonthlyTrendData(allReports);
  }, [allReports]);

  const accountTrendData = useMemo(() => {
    if (!selectedUraian || !allReports.length) return null;
    const data = createAccountTrendData(allReports, selectedUraian);
    return data;
  }, [allReports, selectedUraian]);

  const availableAccounts = useMemo(() => {
    if (!allReports.length) return [];
    const accounts = getAllLevel7Accounts(allReports);
    return accounts;
  }, [allReports]);

  const compositionData = useMemo(() => {
    if (!allReports.length) return [];
    return createMonthlyCompositionData(allReports);
  }, [allReports]);


  // Generate AI analysis untuk tren
  const generateTrendAnalysis = () => {
    if (!allReports.length) {
      const analysis = 'Tidak ada data historis untuk dianalisis.';
      setAiAnalysis(analysis);
      onAIAnalysis(analysis);
      return;
    }

    if (allReports.length < 2) {
      const analysis = 'Membutuhkan minimal 2 bulan data untuk analisis tren.';
      setAiAnalysis(analysis);
      onAIAnalysis(analysis);
      return;
    }

    // Analisis tren penyerapan
    const trendAnalysis = monthlyTrendData.map((data, index) => {
      if (index === 0) return { ...data, change: 0, changePercent: 0 };
      const prevData = monthlyTrendData[index - 1];
      const change = data.totalRealisasi - prevData.totalRealisasi;
      const changePercent =
        prevData.totalRealisasi > 0 ? (change / prevData.totalRealisasi) * 100 : 0;
      return { ...data, change, changePercent };
    });

    // Identifikasi pola belanja
    const spendingPattern = trendAnalysis.map(data => ({
      month: data.month,
      year: data.year,
      realisasi: data.totalRealisasi,
      persentase: data.persentase,
    }));

    // Hitung velocity (kecepatan penyerapan)
    const avgMonthlyAbsorption =
      trendAnalysis.reduce((sum, data) => sum + data.totalRealisasi, 0) / trendAnalysis.length;
    const maxAbsorption = Math.max(...trendAnalysis.map(data => data.totalRealisasi));
    const minAbsorption = Math.min(...trendAnalysis.map(data => data.totalRealisasi));
    const volatility = ((maxAbsorption - minAbsorption) / avgMonthlyAbsorption) * 100;

    // Forecast sederhana (linear trend)
    const lastThreeMonths = trendAnalysis.slice(-3);
    const avgGrowth =
      lastThreeMonths.length > 1
        ? (lastThreeMonths[lastThreeMonths.length - 1].totalRealisasi -
            lastThreeMonths[0].totalRealisasi) /
          (lastThreeMonths.length - 1)
        : 0;

    const nextMonthForecast =
      trendAnalysis.length > 0
        ? trendAnalysis[trendAnalysis.length - 1].totalRealisasi + avgGrowth
        : 0;

    // Identifikasi dormant items
    const dormantAccounts = availableAccounts.filter(account => {
      const accountData = createAccountTrendData(allReports, account.uraian);
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
${spendingPattern
  .map(
    data =>
      `- ${data.month} ${data.year}: Rp ${data.realisasi.toLocaleString('id-ID')} (${data.persentase.toFixed(1)}%)`
  )
  .join('\n')}

📈 **Analisis Kecepatan Penyerapan (Absorption Velocity):**
- ${avgGrowth > 0 ? '📈 Tren Positif' : avgGrowth < 0 ? '📉 Tren Negatif' : '➡️ Tren Stabil'}
- Pertumbuhan rata-rata: Rp ${avgGrowth.toLocaleString('id-ID')}/bulan
- ${
      volatility > 50
        ? '⚠️ Volatilitas tinggi - pola belanja tidak konsisten'
        : volatility > 25
          ? '⚠️ Volatilitas sedang - perlu monitoring'
          : '✅ Volatilitas rendah - pola belanja stabil'
    }

🎯 **Peramalan Sederhana:**
- Forecast bulan depan: Rp ${nextMonthForecast.toLocaleString('id-ID')}
- ${
      nextMonthForecast > avgMonthlyAbsorption
        ? '📈 Diperkirakan meningkat'
        : nextMonthForecast < avgMonthlyAbsorption
          ? '📉 Diperkirakan menurun'
          : '➡️ Diperkirakan stabil'
    }

🔕 **Akun "Tidur" (Dormant Items):**
- Total akun tanpa realisasi: ${dormantAccounts.length} dari ${availableAccounts.length} akun
- ${
      dormantAccounts.length > 0
        ? `⚠️ Perlu review: ${dormantAccounts
            .slice(0, 5)
            .map(a => a.uraian)
            .join(', ')}${dormantAccounts.length > 5 ? '...' : ''}`
        : '✅ Tidak ada akun tidur signifikan'
    }

💡 **Rekomendasi Strategis:**
- ${
      volatility > 50
        ? '🎯 Prioritaskan stabilisasi pola belanja bulanan'
        : volatility > 25
          ? '🎯 Monitoring lebih ketat pada fluktuasi belanja'
          : '✅ Pertahankan konsistensi belanja'
    }
- ${
      avgGrowth < 0
        ? '🚨 Segera evaluasi penyebab penurunan tren'
        : avgGrowth > 0
          ? '📈 Manfaatkan momentum tren positif'
          : '🎯 Cari opportunities untuk meningkatkan penyerapan'
    }
- ${
      dormantAccounts.length > availableAccounts.length * 0.3
        ? '🔍 Review ulang akun-akun yang tidak pernah terpakai'
        : '✅ Utilisasi akun sudah optimal'
    }
    `.trim();

    setAiAnalysis(analysis);
    onAIAnalysis(analysis);
  };

  // Chart configurations
  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            weight: 500 as any
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#ddd',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label.includes('Rp')) {
              return `${label}: Rp ${value.toLocaleString('id-ID')}`;
            }
            return `${label}: ${value.toFixed(1)}%`;
          },
        },
      },
      datalabels: {
        display: true,
        align: 'top' as const,
        anchor: 'end' as const,
        offset: 8,
        font: {
          size: 10,
          weight: 'bold' as any
        },
        formatter: (value: number) => {
          return formatShortCurrency(value);
        },
        color: (context: any) => {
          return context.dataset.borderColor;
        },
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        borderRadius: 4,
        padding: 4
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          }
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          callback: (value: any) => {
            return formatShortCurrency(Number(value));
          },
          font: {
            size: 11
          }
        },
      },
    },
    elements: {
      point: {
        radius: 4,
        hoverRadius: 6,
        borderWidth: 2
      },
      line: {
        borderWidth: 3,
        tension: 0.3
      }
    }
  };

  const stackedBarOptions = {
    responsive: true,
  maintainAspectRatio: false,
  layout: {
    padding: {
      top: 28,
    },
  },
  plugins: {
    legend: {
      position: 'top' as const,
    },
    tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.parsed.y;
            return `${context.dataset.label}: Rp ${value.toLocaleString('id-ID')}`;
          },
        },
      },
      datalabels: {
        display: (context: any) => {
          const datasets = context?.chart?.data?.datasets || [];
          const total = compositionData?.[context.dataIndex]?.totalRealisasiBulanIni || 0;
          return datasets.length > 0 && context.datasetIndex === datasets.length - 1 && total > 0;
        },
        formatter: (_value: number, context: any) => {
          const total = compositionData?.[context.dataIndex]?.totalRealisasiBulanIni || 0;
          return total > 0 ? formatShortCurrency(total) : '';
        },
        anchor: 'end',
        align: 'top',
        offset: 10,
        color: '#7C2D12',
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        borderColor: '#FDBA74',
        borderWidth: 1,
        borderRadius: 6,
        padding: {
          top: 4,
          bottom: 4,
          left: 8,
          right: 8,
        },
        font: {
          weight: 'bold' as const,
          size: 11,
        },
        clip: false,
        clamp: true,
        textAlign: 'center' as const,
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
          callback: (value: any) => formatShortCurrency(Number(value)),
        },
      },
    },
  };

  // Data untuk grafik garis tren realisasi
  const trendLineData =
    viewType === 'total'
      ? {
          labels: monthlyTrendData.map(d => `${d.month} ${d.year}`),
          datasets: [
            {
              label: 'Total Realisasi (Rp)',
              data: monthlyTrendData.map(d => d.totalRealisasi),
              borderColor: '#3B82F6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderWidth: 3,
              pointBackgroundColor: '#3B82F6',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: '#3B82F6',
              tension: 0.3,
              fill: true,
            },
          ],
        }
      : accountTrendData
        ? {
            labels: accountTrendData.data.map(d => `${d.month} ${d.year}`),
            datasets: [
              {
                label: 'Realisasi Akun (Rp)',
                data: accountTrendData.data.map(d => d.realisasi),
                borderColor: '#22C55E',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: '#22C55E',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#22C55E',
                tension: 0.3,
                fill: true,
              },
            ],
          }
        : null;


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
      '#3B82F6',
      '#10B981',
      '#F59E0B',
      '#EF4444',
      '#8B5CF6',
      '#EC4899',
      '#14B8A6',
      '#F97316',
      '#6B7280',
      '#84CC16',
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
        borderWidth: 1,
      })),
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
            📈 Analisis Tren Bulanan (Sesuai Laporan - {allReports.length} bulan)
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
      <div
        className={`transition-all duration-200 ${expandedSection === 'trend' ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}
      >
        <div className="p-6 space-y-6">
          {/* View Selector */}
          <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Tampilkan:</label>
              <select
                value={viewType}
                onChange={e => setViewType(e.target.value as 'total' | 'account')}
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
                  value={selectedUraian}
                  onChange={e => setSelectedUraian(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm min-w-[300px]"
                >
                  <option value="">Pilih akun...</option>
                  {availableAccounts.map(account => (
                    <option key={account.uraian} value={account.uraian}>
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
                <Line
                  data={trendLineData}
                  options={lineChartOptions}
                  plugins={[ChartDataLabels]}
                  key={`trend-line-chart-${monthlyTrendData.length}`}
                />
              </div>
            )}
          </div>


          {/* Grafik Batang Bertumpuk: Komposisi Belanja Bulanan */}
          <div className="bg-orange-50 rounded-lg p-4">
            <h4 className="text-md font-semibold text-orange-800 mb-4">
              🍰 Komposisi Belanja Bulanan
              <span className="text-sm font-normal text-gray-600 ml-2">
                (Realisasi tiap bulan)
              </span>
            </h4>
            {stackedBarData ? (
              <div className="h-80">
                <Bar
                  data={stackedBarData}
                  options={stackedBarOptions}
                  plugins={[ChartDataLabels]}
                  key={`stacked-bar-chart-${compositionData.length}`}
                />
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              Analisis Tren dengan AI
            </button>
          </div>

          {/* AI Analysis Result */}
          {aiAnalysis && (
            <div className="mt-6 p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200 shadow-sm max-h-96 overflow-y-auto">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-base font-semibold text-gray-800 mb-2">Hasil Analisis AI</h4>
                  <div className="text-gray-700 leading-relaxed text-xs">
                    {aiAnalysis.split('\n').map((line, index) => {
                      // Process bold text (**text**)
                      const processedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                      
                      // Check if line contains bullet points
                      if (line.trim().startsWith('-')) {
                        return (
                          <div key={index} className="mb-1" dangerouslySetInnerHTML={{ __html: `• ${processedLine.substring(1).trim()}` }} />
                        );
                      }
                      
                      // Check if line is a header (contains ** at start and end)
                      if (line.includes('**') && !line.trim().startsWith('-')) {
                        return (
                          <div key={index} className="mb-2 font-semibold text-gray-900" dangerouslySetInnerHTML={{ __html: processedLine }} />
                        );
                      }
                      
                      // Regular line
                      return (
                        <div key={index} className="mb-1" dangerouslySetInnerHTML={{ __html: processedLine }} />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrendAnalyticsPanel;
