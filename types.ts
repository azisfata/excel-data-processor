export type ExcelRow = any[];
export type ExcelData = ExcelRow[];

export interface BudgetAllocation {
  kode: string;
  uraian?: string;
  jumlah: number;
}

export interface Activity {
  id: string;
  nama: string;
  status?: string;
  allocations: BudgetAllocation[];
}

export interface ProcessingResult {
  finalData: ExcelData;
  totals: number[];
  processedDataForPreview: ExcelData;
  accountNameMap: Map<string, string>;
}