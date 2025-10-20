export type ExcelRow = any[];
export type ExcelData = ExcelRow[];

export interface BudgetAllocation {
  kode: string;
  uraian: string;
  jumlah: number;
}

export interface ActivityAttachment {
  attachmentId: string;
  activityId: string;
  fileName: string;
  storedFileName: string;
  filePath: string;
  uploadedAt: string;
}

export interface Activity {
  id: string;
  nama: string;
  status?: string;
  tanggal_pelaksanaan?: string;
  tujuan_kegiatan?: string;
  kl_unit_terkait?: string;
  penanggung_jawab?: string;
  capaian?: string;
  pending_issue?: string;
  rencana_tindak_lanjut?: string;
  allocations: BudgetAllocation[];
  attachments: ActivityAttachment[];
}

export interface ProcessingResult {
  finalData: ExcelData;
  totals: number[];
  processedDataForPreview: ExcelData;
  accountNameMap: Map<string, string>;
}

export interface AiMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
