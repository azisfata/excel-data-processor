export type ExcelRow = unknown[];
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

export interface ProcessedResultRow {
  id: string;
  file_name: string | null;
  processed_data: ExcelData | null;
  totals: number[] | null;
  account_name_map: Record<string, string> | null;
  report_type: string | null;
  report_date: string | null;
  created_at: string;
  user_id: string;
}

export interface SupabaseAllocationRow {
  id: string;
  kode: string;
  uraian: string | null;
  jumlah: number;
}

export interface SupabaseActivityRow {
  id: string;
  nama: string;
  status: string | null;
  tanggal_pelaksanaan: string | null;
  tujuan_kegiatan: string | null;
  kl_unit_terkait: string | null;
  penanggung_jawab: string | null;
  capaian: string | null;
  pending_issue: string | null;
  rencana_tindak_lanjut: string | null;
  user_id: string;
  allocations?: SupabaseAllocationRow[] | null;
}

export interface AiMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
