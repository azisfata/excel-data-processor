import type { Activity } from '@/types';

export const ACTION_BLOCK_REGEX = /<action>([\s\S]*?)<\/action>/i;

export type AiActionType = 'create_activity' | 'update_activity';

export interface AiAllocationInput {
  kode: string;
  jumlah: number;
  uraian?: string | null;
}

export interface AiActionData {
  activity: Partial<Activity>;
  allocations?: AiAllocationInput[];
  activityId?: string;
}

export interface PendingAiAction {
  type: AiActionType;
  summary: string;
  data: AiActionData;
}

type ActivityStringField =
  | 'nama'
  | 'status'
  | 'tanggal_pelaksanaan'
  | 'tujuan_kegiatan'
  | 'kl_unit_terkait'
  | 'penanggung_jawab'
  | 'capaian'
  | 'pending_issue'
  | 'rencana_tindak_lanjut';

const ACTIVITY_FIELD_KEYS: ActivityStringField[] = [
  'nama',
  'status',
  'tanggal_pelaksanaan',
  'tujuan_kegiatan',
  'kl_unit_terkait',
  'penanggung_jawab',
  'capaian',
  'pending_issue',
  'rencana_tindak_lanjut',
];

const normalizeAiAction = (
  raw: any
): { type: AiActionType; summary?: string; data: AiActionData } | null => {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type;
  if (type !== 'create_activity' && type !== 'update_activity') {
    return null;
  }

  const data = raw.data;
  const activityInput =
    data && typeof data === 'object' && typeof data.activity === 'object' ? data.activity : {};
  const normalizedActivity: Partial<Activity> = {};

  for (const field of ACTIVITY_FIELD_KEYS) {
    const value = activityInput?.[field];
    if (value === undefined || value === null) continue;
    if (field === 'tanggal_pelaksanaan') {
      const dateString = String(value).trim();
      if (dateString) {
        (normalizedActivity as Record<ActivityStringField, string | null>)[field] =
          dateString.slice(0, 10);
      }
    } else {
      const textValue = String(value).trim();
      if (textValue) {
        (normalizedActivity as Record<ActivityStringField, string | null>)[field] = textValue;
      }
    }
  }

  const allocationsInput = Array.isArray(data?.allocations) ? data.allocations : [];
  const normalizedAllocations: AiAllocationInput[] = allocationsInput
    .map((item: any) => {
      if (!item || typeof item !== 'object') return null;
      const kode = item.kode !== undefined && item.kode !== null ? String(item.kode).trim() : '';
      const jumlahNumber = typeof item.jumlah === 'number' ? item.jumlah : Number(item.jumlah);
      if (!kode || Number.isNaN(jumlahNumber)) {
        return null;
      }
      const uraian =
        item.uraian !== undefined && item.uraian !== null ? String(item.uraian).trim() : undefined;
      return { kode, jumlah: jumlahNumber, uraian };
    })
    .filter((item): item is AiAllocationInput => Boolean(item));

  const actionData: AiActionData = { activity: normalizedActivity };
  if (normalizedAllocations.length) {
    actionData.allocations = normalizedAllocations;
  }

  const activityIdCandidate =
    data?.activityId ?? data?.activity_id ?? activityInput?.id ?? activityInput?.activityId;
  if (typeof activityIdCandidate === 'string' && activityIdCandidate.trim()) {
    actionData.activityId = activityIdCandidate.trim();
  }

  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : undefined;

  return {
    type,
    summary,
    data: actionData,
  };
};

export const generateActionSummary = (action: {
  type: AiActionType;
  data: AiActionData;
  summary?: string;
}): string => {
  const { activity, allocations, activityId } = action.data;
  const lines: string[] = [];
  lines.push(`Nama: ${activity.nama ?? '(belum diisi)'}`);
  if (activity.status) lines.push(`Status: ${activity.status}`);
  if (activity.tanggal_pelaksanaan) lines.push(`Tanggal: ${activity.tanggal_pelaksanaan}`);
  if (activity.tujuan_kegiatan) lines.push(`Tujuan: ${activity.tujuan_kegiatan}`);
  if (activity.kl_unit_terkait) lines.push(`K/L/Unit: ${activity.kl_unit_terkait}`);
  if (activity.penanggung_jawab) lines.push(`Penanggung jawab: ${activity.penanggung_jawab}`);
  if (activity.capaian) lines.push(`Capaian: ${activity.capaian}`);
  if (activity.pending_issue) lines.push(`Pending issue: ${activity.pending_issue}`);
  if (activity.rencana_tindak_lanjut)
    lines.push(`Rencana tindak lanjut: ${activity.rencana_tindak_lanjut}`);

  if (allocations && allocations.length) {
    lines.push('Alokasi:');
    allocations.forEach((alloc, index) => {
      const detail = alloc.uraian ? ` (${alloc.uraian})` : '';
      lines.push(`  ${index + 1}. ${alloc.kode} - ${alloc.jumlah}${detail}`);
    });
  } else {
    lines.push('Alokasi: (tidak ada)');
  }

  if (action.type === 'update_activity') {
    lines.push(`Target activity ID: ${activityId ?? '(tidak disebutkan)'}`);
  }

  const title =
    action.type === 'create_activity'
      ? 'Ringkasan usulan kegiatan baru'
      : 'Ringkasan pembaruan kegiatan';
  return `${title}:\n- ${lines.join('\n- ')}`;
};

export const extractAiAction = (
  text: string
): { cleanedText: string; action?: PendingAiAction } => {
  const match = text.match(ACTION_BLOCK_REGEX);
  if (!match) {
    return { cleanedText: text.trim() };
  }

  const jsonPayload = match[1].trim();
  let parsedAction: PendingAiAction | undefined;
  try {
    if (jsonPayload) {
      const parsed = JSON.parse(jsonPayload);
      const normalized = normalizeAiAction(parsed);
      if (normalized) {
        const summary =
          normalized.summary && normalized.summary.length > 0
            ? normalized.summary
            : generateActionSummary(normalized);
        parsedAction = {
          type: normalized.type,
          summary,
          data: normalized.data,
        };
      }
    }
  } catch (error) {
    console.warn('Gagal mengurai action AI:', error);
  }

  const cleanedText = `${text.slice(0, match.index)}${text.slice(
    match.index + match[0].length
  )}`.trim();

  return parsedAction ? { cleanedText, action: parsedAction } : { cleanedText };
};
