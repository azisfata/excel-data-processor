import React from 'react';

interface BudgetOverviewPanelProps {
  activeTotals: number[];
  progressPercentage: number;
  additionalTotals: { outstanding: number; komitmen: number };
  budgetView: string;
  formatCurrency: (value: number) => string;
}

const BudgetOverviewPanel: React.FC<BudgetOverviewPanelProps> = ({
  activeTotals,
  progressPercentage,
  additionalTotals,
  budgetView,
  formatCurrency,
}) => {
  const paguRevisi = activeTotals[0] || 0;
  const realisasi = activeTotals[4] || 0;
  const sisa = paguRevisi - realisasi;

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-t-4 border-t-blue-500">
            <p className="text-sm font-medium text-gray-500">Pagu Revisi</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {formatCurrency(paguRevisi)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-t-4 border-t-green-500">
            <p className="text-sm font-medium text-gray-500">Realisasi</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{formatCurrency(realisasi)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-t-4 border-t-gray-400">
            <p className="text-sm font-medium text-gray-500">Sisa Anggaran</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{formatCurrency(sisa)}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Capaian Realisasi</span>
              <span className="text-sm font-semibold text-indigo-700">
                {progressPercentage.toFixed(2)}%
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>

            {(budgetView === 'realisasi-outstanding' || budgetView === 'realisasi-komitmen') &&
              (additionalTotals.outstanding > 0 || additionalTotals.komitmen > 0) && (
                <div className="mt-3 flex justify-center items-center gap-x-6 gap-y-2 flex-wrap">
                  {(budgetView === 'realisasi-outstanding' ||
                    budgetView === 'realisasi-komitmen') &&
                    additionalTotals.outstanding > 0 && (
                      <div className="text-sm text-gray-600">
                        <span className="font-semibold text-yellow-800">Outstanding:</span>{' '}
                        {formatCurrency(additionalTotals.outstanding)}
                      </div>
                    )}
                  {budgetView === 'realisasi-komitmen' && additionalTotals.komitmen > 0 && (
                    <div className="text-sm text-gray-600">
                      <span className="font-semibold text-orange-800">Komitmen:</span>{' '}
                      {formatCurrency(additionalTotals.komitmen)}
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BudgetOverviewPanel;
