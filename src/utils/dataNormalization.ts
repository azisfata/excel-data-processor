import type { ExcelData, ExcelRow } from '@/types';

const DESCRIPTION_PREFIX_REGEX = /^(\d{6})\.\s*(.+)$/;
const SIX_DIGIT_CODE_REGEX = /^\d{6}$/;

const cloneRow = (row: ExcelRow): ExcelRow => (Array.isArray(row) ? [...row] : []);

export const getLastSegmentFromCode = (code: string): string => {
  if (!code) return '';
  const segments = code.split('.').map(segment => segment.trim()).filter(Boolean);
  return segments.length ? segments[segments.length - 1] : '';
};

export const getSegmentAtLevel = (code: string, levelIndex: number): string => {
  if (!code) return '';
  const segments = code.split('.').map(segment => segment.trim()).filter(Boolean);
  return segments[levelIndex] ?? '';
};

export const getLevel7Segment = (code: string): string => getSegmentAtLevel(code, 6);

export const isSixDigitSegment = (segment: string): boolean => SIX_DIGIT_CODE_REGEX.test(segment);

export function normalizeCodeAndDescription(data: ExcelData): ExcelData {
  return data.map(rowArray => {
    const row = cloneRow(rowArray);
    const description = typeof row[1] === 'string' ? row[1].trim() : '';
    const match = DESCRIPTION_PREFIX_REGEX.exec(description);

    if (!match) {
      return row;
    }

    const [, sixDigitCode, cleanedDescription] = match;
    const codeStr = typeof row[0] === 'string' ? row[0].trim() : '';
    const segments = codeStr
      ? codeStr.split('.').map(segment => segment.trim()).filter(Boolean)
      : [];

    if (!segments.length) {
      segments.push(sixDigitCode);
    } else if (segments[segments.length - 1] !== sixDigitCode) {
      segments.push(sixDigitCode);
    }

    row[0] = segments.join('.');
    row[1] = cleanedDescription.trim();
    return row;
  });
}

export function deriveAccountNameMap(data: ExcelData): Map<string, string> {
  const map = new Map<string, string>();

  data.forEach(row => {
    const codeStr = typeof row[0] === 'string' ? row[0].trim() : '';
    const description = typeof row[1] === 'string' ? row[1].trim() : '';
    if (!codeStr || !description) return;

    const lastSegment = getLastSegmentFromCode(codeStr);
    if (!lastSegment) return;

    if (!map.has(lastSegment)) {
      map.set(lastSegment, description);
    }
  });

  return map;
}

export function cloneExcelData(data: ExcelData | null | undefined): ExcelData {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map(cloneRow);
}
