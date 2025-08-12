export type ExcelRow = any[];
export type ExcelData = ExcelRow[];

export interface BudgetAllocation {
  kode: string;
  jumlah: number;
}

export interface Activity {
  id: string;
  nama: string;
  allocations: BudgetAllocation[];
}

export interface ProcessingResult {
  finalData: ExcelData;
  totals: number[];
  processedDataForPreview: ExcelData;
}