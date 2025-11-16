import React from 'react';
import type { Level7SummaryItem } from '../../hooks/useProcessedMetrics';

interface AccountSummaryPanelProps {
  totals: Level7SummaryItem[];
  budgetView: string;
  onBudgetViewChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  formatCurrency: (value: number) => string;
}

const AccountSummaryPanel: React.FC<AccountSummaryPanelProps> = ({
  totals,
  budgetView,
  onBudgetViewChange,
  show,
  onToggle,
  formatCurrency,
}) => {
  if (totals.length === 0) {
    return null;
  }

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200 dark:bg-slate-900 dark:border-slate-700">
      <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 dark:bg-slate-900 dark:border-slate-700">
        <button
          type="button"
          className="flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors duration-200 rounded-md px-2 py-1 w-full lg:w-auto dark:hover:bg-slate-800"
          onClick={onToggle}
        >
          <h3 className="text-lg font-medium text-gray-800 dark:text-slate-100">
            Rekapitulasi per Akun
          </h3>
          <svg
            className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${
              show ? 'rotate-180' : ''
            } dark:text-slate-300`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide dark:text-slate-300">
            Tampilkan Anggaran
          </span>
          <div className="relative">
            <select
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-900/60 dark:border-slate-700 dark:text-slate-100"
              value={budgetView}
              onChange={event => onBudgetViewChange(event.target.value)}
            >
              <option value="realisasi-laporan">Realisasi (Sesuai Laporan)</option>
              <option value="realisasi-outstanding">Realisasi + Outstanding</option>
              <option value="realisasi-komitmen">Realisasi + Outstanding + Komitmen</option>
            </select>
          </div>
        </div>
      </div>

      {show && (
        <div className="p-6 space-y-6 dark:bg-slate-900">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {totals.map(item => {
              const realisasiPercent =
                item.paguRevisi > 0
                  ? Math.min(100, Math.round((item.realisasi / item.paguRevisi) * 100))
                  : 0;

              return (
                <div
                  key={item.code}
                  className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow dark:bg-slate-900/70 dark:border-slate-700"
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900 break-words dark:text-slate-100">
                          {item.uraian}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{item.code}</p>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full ml-2 bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-500/15 dark:text-blue-100 dark:border-blue-400/40">
                        {item.paguRevisi > 0
                          ? `${((item.realisasi / item.paguRevisi) * 100).toFixed(2)}%`
                          : '0.00%'}
                      </span>
                    </div>

                    <div className="w-full bg-gray-100 rounded-full h-1.5 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(59,130,246,0.35)]"
                        style={{
                          width: `${realisasiPercent}%`,
                          backgroundColor: item.paguRevisi > 0 ? '#3b82f6' : '#e5e7eb',
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <div>
                        <p className="text-gray-500 dark:text-slate-400">Pagu</p>
                        <p className="font-medium dark:text-slate-100">
                          {item.paguRevisi?.toLocaleString('id-ID') || '0'}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-500 dark:text-slate-400">Realisasi</p>
                        <p className="font-medium dark:text-slate-100">
                          {item.realisasi?.toLocaleString('id-ID') || '0'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-500 dark:text-slate-400">Sisa</p>
                        <p className="font-medium dark:text-slate-100">
                          {item.sisa?.toLocaleString('id-ID') || '0'}
                        </p>
                      </div>
                    </div>

                    {budgetView !== 'realisasi-laporan' &&
                      (item.outstanding > 0 || item.komitmen > 0) && (
                        <div className="mt-2 pt-2 border-t border-gray-100 flex justify-around text-xs text-center dark:border-slate-800">
                          {(budgetView === 'realisasi-outstanding' ||
                            budgetView === 'realisasi-komitmen') &&
                            item.outstanding > 0 && (
                              <div>
                                <p className="text-gray-500 dark:text-slate-400">Outstanding</p>
                                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                                  {formatCurrency(item.outstanding)}
                                </p>
                              </div>
                            )}
                          {budgetView === 'realisasi-komitmen' && item.komitmen > 0 && (
                            <div>
                              <p className="text-gray-500 dark:text-slate-400">Komitmen</p>
                              <p className="font-medium text-orange-800 dark:text-orange-200">
                                {formatCurrency(item.komitmen)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSummaryPanel;
