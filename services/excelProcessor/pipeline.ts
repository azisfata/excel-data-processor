import { ExcelData, ProcessingResult } from '../../types';
import { normalizeCodeAndDescription, deriveAccountNameMap, isSixDigitSegment } from '../../utils/dataNormalization';

declare var XLSX: any;

interface ProcessingStep {
  name: string;
  duration?: number;
  data?: any;
}

interface ProcessingContext {
  steps: ProcessingStep[];
  startTime: number;
}

/**
 * Helper function to check for empty cells
 */
const isEmpty = (val: any): boolean => val === null || val === undefined || val === '';

/**
 * Track processing step with timing
 */
function trackStep(context: ProcessingContext, name: string, fn: () => any): any {
  const startTime = performance.now();
  const data = fn();
  const duration = performance.now() - startTime;
  
  context.steps.push({ name, duration });
  return data;
}

/**
 * Step 1: Parse Excel file
 */
export function parseExcelFile(binaryStr: string | ArrayBuffer): ExcelData {
  if (!binaryStr) {
    throw new Error("File content is empty.");
  }
  
  const workbook = XLSX.read(binaryStr, { type: 'binary', cellFormula: false, cellHTML: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: undefined });
}

/**
 * Step 2: Clean and prepare data
 */
function cleanAndPrepareData(data: ExcelData): ExcelData {
  // Remove footer note
  const stringToRemove = '*Lock Pagu adalah jumlah pagu yang sedang dalam proses usulan revisi DIPA atau POK.';
  let df = data.filter(row => !row.some(cell => String(cell).includes(stringToRemove)));

  // Find header row and slice data
  const headerKeyword = "Program Dukungan Manajemen";
  let headerIndex = -1;
  
  for(let i = 0; i < df.length; i++) {
    if(df[i].some(cell => String(cell).includes(headerKeyword))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    console.warn("Peringatan: Header 'Program Dukungan Manajemen' tidak ditemukan.");
  } else {
    df = df.slice(headerIndex);
  }
  
  // Remove empty columns
  if(df.length > 0) {
    const columnsToRemove = new Set<number>();
    const colCount = Math.max(0, ...df.map(r => r.length));

    for (let j = 0; j < colCount; j++) {
      const isColumnEmpty = df.every(row => isEmpty(row[j]));
      if (isColumnEmpty) {
        columnsToRemove.add(j);
      }
    }

    if (columnsToRemove.size > 0) {
      df = df.map(row => row.filter((_, colIndex) => !columnsToRemove.has(colIndex)));
    }
  }

  return df;
}

/**
 * Step 3: Restructure data and build hierarchical codes
 */
function restructureAndBuildHierarchy(data: ExcelData): ExcelData {
  // Shift data to fill empty cells in first two columns
  let df = data.map(rowArray => {
    const row = [...rowArray];
    
    // Rule 1: If col 1 is empty, fill with first non-empty from left
    if (isEmpty(row[0])) {
      for (let i = 1; i < row.length; i++) {
        if (!isEmpty(row[i])) {
          row[0] = row[i];
          row[i] = undefined;
          break;
        }
      }
    }

    // Rule 2: If col 2 is empty, fill with first non-numeric from left
    if (isEmpty(row[1])) {
      for (let i = 2; i < row.length; i++) {
        const val = row[i];
        if (!isEmpty(val) && !Number.isFinite(val)) {
          row[1] = val;
          row[i] = undefined;
          break;
        }
      }
    }

    // Rule 3: If col 2 is still empty, move value from col 1
    if (isEmpty(row[1])) {
      row[1] = row[0];
      row[0] = undefined;
    }
    
    return row;
  });

  // Build hierarchical codes
  const trace: string[] = [];
  const MAX_TRACE_SIZE = 7;
  const newCodes: string[] = [];

  for (const row of df) {
    const value = row[0];
    
    if (!isEmpty(value)) {
      let valueStr = String(value);
      if (valueStr.endsWith('.0')) {
        valueStr = valueStr.slice(0, -2);
      }
      
      newCodes.push(valueStr);
      
      const itemsToAdd = valueStr.includes('.') ? valueStr.split('.') : [valueStr];
      
      for (const item of itemsToAdd) {
        if (!trace.includes(item)) {
          if (trace.length < MAX_TRACE_SIZE) {
            trace.push(item);
          } else {
            if (item.length === 6 && /^\d+$/.test(item)) {
              trace[6] = item;
            } else if (item.length === 3 && /^\d+$/.test(item)) {
              trace[4] = item;
            } else if (item.length === 2 && /^\d[a-zA-Z]$/.test(item)) {
              trace[5] = item;
            }
          }
        }
      }
    } else {
      newCodes.push(trace.join('.'));
    }
  }

  df.forEach((row, index) => {
    if (index < newCodes.length) {
      row[0] = newCodes[index];
    }
  });

  return df;
}

/**
 * Step 4: Remove unnecessary columns
 */
function removeUnnecessaryColumns(data: ExcelData): ExcelData {
  // Remove columns 19 and 20 (indices 18, 19)
  const dataWithColsRemoved = data.map(row => {
    return row.filter((_, colIndex) => colIndex !== 18 && colIndex !== 19);
  });

  // Remove columns 3 through 13 (indices 2 to 12)
  const dataWithColsRemoved2 = dataWithColsRemoved.map(row => {
    return row.filter((_, colIndex) => {
      const isColumnToDelete = colIndex >= 2 && colIndex <= 12;
      return !isColumnToDelete;
    });
  });

  return dataWithColsRemoved2;
}

/**
 * Step 5: Filter data and calculate totals
 */
function filterAndCalculateTotals(data: ExcelData): { finalData: ExcelData; totals: number[] } {
  const filteredData = data.filter(row => {
    const kodeStr = typeof row[0] === 'string' ? row[0].trim() : '';
    if (!kodeStr) return false;

    const segments = kodeStr
      .split('.')
      .map(segment => segment.trim())
      .filter(Boolean);

    if (segments.length < 8) return false;

    const lastSegment = segments[segments.length - 1] || '';
    return isSixDigitSegment(lastSegment);
  });

  const totals: number[] = [];
  const columnsToSum = [2, 3, 4, 5, 6];
  
  columnsToSum.forEach(colIndex => {
    const total = filteredData.reduce((sum, row) => {
      const rawValue = row[colIndex];
      let value = 0;

      if (typeof rawValue === 'number' && isFinite(rawValue)) {
        value = rawValue;
      } else if (typeof rawValue === 'string' && rawValue.trim() !== '') {
        const formattedStr = rawValue.replace(/\./g, '').replace(/,/g, '.');
        const parsed = parseFloat(formattedStr);
        if (!isNaN(parsed)) {
          value = parsed;
        }
      }
      return sum + value;
    }, 0);
    totals.push(total);
  });

  return { finalData: filteredData, totals };
}

/**
 * Main processing pipeline with step-by-step execution and timing
 */
export function processExcelData(data: ExcelData): ProcessingResult {
  const context: ProcessingContext = {
    steps: [],
    startTime: performance.now()
  };

  try {
    // Step 1: Clean and prepare data
    const cleanedData = trackStep(context, 'Clean and Prepare Data', () => 
      cleanAndPrepareData(data)
    );
    
    if (!cleanedData || cleanedData.length === 0) {
      throw new Error("Pembersihan data awal gagal atau data kosong.");
    }

    // Step 2: Restructure and build hierarchy
    const structuredData = trackStep(context, 'Restructure and Build Hierarchy', () => 
      restructureAndBuildHierarchy(cleanedData)
    );

    // Step 3: Remove unnecessary columns
    const dataWithColsRemoved = trackStep(context, 'Remove Columns', () => 
      removeUnnecessaryColumns(structuredData)
    );

    // Step 4: Normalize data
    const normalizedData = trackStep(context, 'Normalize Data', () => 
      normalizeCodeAndDescription(dataWithColsRemoved)
    );

    // Step 5: Filter and calculate totals
    const { finalData, totals } = trackStep(context, 'Filter and Calculate Totals', () => 
      filterAndCalculateTotals(normalizedData)
    );

    // Generate account name map
    const accountNameMap = trackStep(context, 'Generate Account Map', () => 
      deriveAccountNameMap(normalizedData)
    );

    const totalDuration = performance.now() - context.startTime;
    
    console.log('Processing Pipeline Results:', {
      totalDuration: `${totalDuration.toFixed(2)}ms`,
      steps: context.steps.map(step => ({
        name: step.name,
        duration: `${step.duration?.toFixed(2)}ms`
      })),
      inputRows: data.length,
      outputRows: finalData.length
    });

    return { 
      finalData,
      totals,
      processedDataForPreview: finalData.slice(0, 100),
      accountNameMap
    };

  } catch (error) {
    const totalDuration = performance.now() - context.startTime;
    console.error('Processing Pipeline Error:', {
      error: error instanceof Error ? error.message : String(error),
      totalDuration: `${totalDuration.toFixed(2)}ms`,
      completedSteps: context.steps.length,
      steps: context.steps
    });
    throw error;
  }
}
