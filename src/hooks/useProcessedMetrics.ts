import { useMemo } from 'react';
import { Activity, ProcessingResult } from '../../types';
import { getLevel7Segment, isSixDigitSegment } from '../../utils/dataNormalization';

interface UseProcessedMetricsParams {
  result: ProcessingResult | null;
  activities: Activity[];
  budgetView: string;
}

export interface Level7SummaryItem {
  code: string;
  uraian: string;
  paguRevisi: number;
  realisasi: number;
  outstanding: number;
  komitmen: number;
  persentase: number;
  sisa: number;
}

interface ProcessedMetrics {
  activeData: any[];
  activeTotals: number[];
  additionalTotals: { outstanding: number; komitmen: number };
  progressPercentage: number;
  level7Totals: Level7SummaryItem[];
}

export function useProcessedMetrics({
  result,
  activities,
  budgetView,
}: UseProcessedMetricsParams): ProcessedMetrics {
  const activeData = useMemo(() => {
    if (!result?.finalData) return [];

    if (budgetView === 'realisasi-laporan') {
      return result.finalData;
    }

    const allocationMap = new Map<string, number>();
    const targetStatuses =
      budgetView === 'realisasi-outstanding' ? ['outstanding'] : ['outstanding', 'komitmen'];

    activities
      .filter(activity => targetStatuses.includes((activity.status || '').toLowerCase()))
      .forEach(activity => {
        activity.allocations.forEach(alloc => {
          const compositeKey = `${alloc.kode}||${alloc.uraian}`;
          allocationMap.set(compositeKey, (allocationMap.get(compositeKey) || 0) + alloc.jumlah);
        });
      });

    if (allocationMap.size === 0) {
      return result.finalData;
    }

    return result.finalData.map(row => {
      const rowKode = row[0];
      const rowUraian = row[1];
      const compositeKey = `${rowKode}||${rowUraian}`;
      const additionalAmount = allocationMap.get(compositeKey);

      if (additionalAmount) {
        const newRow = [...row];
        const newRealisasi = (Number(newRow[6]) || 0) + additionalAmount;
        newRow[6] = newRealisasi;
        return newRow;
      }
      return row;
    });
  }, [activities, budgetView, result?.finalData]);

  const activeTotals = useMemo(() => {
    if (!activeData || activeData.length === 0) return [0, 0, 0, 0, 0];
    const columnsToSum = [2, 3, 4, 5, 6];
    return columnsToSum.map(colIndex =>
      activeData.reduce((sum, row) => sum + (Number(row[colIndex]) || 0), 0)
    );
  }, [activeData]);

  const additionalTotals = useMemo(() => {
    let totalOutstanding = 0;
    let totalKomitmen = 0;

    activities.forEach(activity => {
      const activityTotal = activity.allocations.reduce((sum, alloc) => sum + alloc.jumlah, 0);
      if ((activity.status || '').toLowerCase() === 'outstanding') {
        totalOutstanding += activityTotal;
      }
      if ((activity.status || '').toLowerCase() === 'komitmen') {
        totalKomitmen += activityTotal;
      }
    });

    return { outstanding: totalOutstanding, komitmen: totalKomitmen };
  }, [activities]);

  const progressPercentage = useMemo(() => {
    if (!activeTotals || typeof activeTotals[0] !== 'number' || activeTotals[0] <= 0) return 0;
    if (typeof activeTotals[4] !== 'number') return 0;
    return (activeTotals[4] / activeTotals[0]) * 100;
  }, [activeTotals]);

  const level7Totals = useMemo<Level7SummaryItem[]>(() => {
    if (!result) return [];

    const outstandingMap = new Map<string, number>();
    const komitmenMap = new Map<string, number>();

    activities.forEach(activity => {
      const status = (activity.status || '').toLowerCase();
      if (status !== 'outstanding' && status !== 'komitmen') return;

      activity.allocations.forEach(alloc => {
        const level7Code = getLevel7Segment(alloc.kode);
        if (!level7Code || !isSixDigitSegment(level7Code)) return;

        if (status === 'outstanding') {
          outstandingMap.set(level7Code, (outstandingMap.get(level7Code) || 0) + alloc.jumlah);
        } else if (status === 'komitmen') {
          komitmenMap.set(level7Code, (komitmenMap.get(level7Code) || 0) + alloc.jumlah);
        }
      });
    });

    const totalsMap = new Map<
      string,
      { code: string; uraian: string; paguRevisi: number; realisasiLaporan: number }
    >();

    result.finalData.forEach(row => {
      const kode = row[0];
      if (typeof kode !== 'string') return;

      const accountCode = getLevel7Segment(kode);
      if (!accountCode || !isSixDigitSegment(accountCode)) return;

      const paguRevisi = Number(row[2]) || 0;
      const realisasiLaporan = Number(row[6]) || 0;

      if (totalsMap.has(accountCode)) {
        const current = totalsMap.get(accountCode)!;
        current.paguRevisi += paguRevisi;
        current.realisasiLaporan += realisasiLaporan;
      } else {
        const accountName = result.accountNameMap?.get(accountCode) || row[1] || `Akun ${accountCode}`;
        totalsMap.set(accountCode, {
          code: accountCode,
          uraian: accountName,
          paguRevisi,
          realisasiLaporan,
        });
      }
    });

    return Array.from(totalsMap.values())
      .map(item => {
        const outstandingAmount = outstandingMap.get(item.code) || 0;
        const komitmenAmount = komitmenMap.get(item.code) || 0;

        let finalRealisasi = item.realisasiLaporan;
        if (budgetView === 'realisasi-outstanding' || budgetView === 'realisasi-komitmen') {
          finalRealisasi += outstandingAmount;
        }
        if (budgetView === 'realisasi-komitmen') {
          finalRealisasi += komitmenAmount;
        }

        return {
          code: item.code,
          uraian: item.uraian,
          paguRevisi: item.paguRevisi,
          realisasi: finalRealisasi,
          outstanding: outstandingAmount,
          komitmen: komitmenAmount,
          persentase: item.paguRevisi > 0 ? (finalRealisasi / item.paguRevisi) * 100 : 0,
          sisa: item.paguRevisi - finalRealisasi,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [activities, budgetView, result]);

  return {
    activeData,
    activeTotals,
    additionalTotals,
    progressPercentage,
    level7Totals,
  };
}
