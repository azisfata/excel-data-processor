import { useState, useEffect, useCallback } from 'react';
import {
  getMonthlyReports,
  MonthlyReport,
  getAllLevel7Accounts,
  getLevel7DataForMonth,
} from '../../services/historicalDataService';
import { AccountLevel7Data } from '../../types';

export interface UseHistoricalDataReturn {
  monthlyReports: MonthlyReport[];
  currentReport: MonthlyReport | null;
  allReports: MonthlyReport[];
  isLoading: boolean;
  error: string | null;
  setCurrentReport: (report: MonthlyReport | null) => void;
  refreshData: () => Promise<void>;
  availableAccounts: Array<{ kode: string; uraian: string }>;
  currentMonthData: AccountLevel7Data[];
}

export const useHistoricalData = (userId: string | undefined): UseHistoricalDataReturn => {
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReport[]>([]);
  const [currentReport, setCurrentReport] = useState<MonthlyReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const reports = await getMonthlyReports(userId);
      setMonthlyReports(reports);

      // Set current report to the latest one if not already set
      if (!currentReport && reports.length > 0) {
        setCurrentReport(reports[reports.length - 1]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data historis');
    } finally {
      setIsLoading(false);
    }
  }, [userId, currentReport]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Get all reports for trend analysis
  const allReports = monthlyReports;

  // Get available accounts across all reports
  const availableAccounts = getAllLevel7Accounts(allReports);

  // Get current month data
  const currentMonthData = currentReport ? getLevel7DataForMonth(currentReport) : [];

  return {
    monthlyReports,
    currentReport,
    allReports,
    isLoading,
    error,
    setCurrentReport,
    refreshData,
    availableAccounts,
    currentMonthData,
  };
};
