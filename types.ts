export type ExcelRow = any[];
export type ExcelData = ExcelRow[];

export interface ProcessingResult {
  finalData: ExcelData;
  totals: (number | string)[];
  processedDataForPreview: ExcelData;
}