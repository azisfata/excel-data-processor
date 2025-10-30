
import { supabase } from '@/utils/supabase';
import {
  ProcessingResult,
  Activity,
  ExcelData,
  BudgetAllocation,
  ProcessedResultRow,
  SupabaseActivityRow,
  SupabaseAllocationRow,
} from '@/types';
import {
  normalizeCodeAndDescription,
  deriveAccountNameMap,
  cloneExcelData,
} from '@/utils/dataNormalization';

// --- Processed Results ---

function buildProcessingResult(row: ProcessedResultRow): ProcessingResult {
  const clonedData: ExcelData = cloneExcelData(row.processed_data);
  const normalizedData = normalizeCodeAndDescription(clonedData);
  const totals = Array.isArray(row.totals) ? row.totals : [];
  const accountNameEntries = row.account_name_map ? Object.entries(row.account_name_map) : [];
  const baseMap = new Map<string, string>(accountNameEntries);
  const derivedMap = deriveAccountNameMap(normalizedData);

  derivedMap.forEach((value, key) => {
    if (!baseMap.has(key)) {
      baseMap.set(key, value);
    }
  });

  return {
    finalData: normalizedData,
    totals,
    processedDataForPreview: normalizedData.slice(0, 100),
    accountNameMap: baseMap,
  };
}

/**
 * Fetches all processed results from Supabase, ordered by creation date (newest first).
 * @returns An array of objects containing the result data and metadata.
 */
export async function getAllProcessedResults(userId: string) {
  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from('processed_results')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching processed results:', error);
    return [];
  }

  if (!data) {
    return [];
  }

  const rows = data as ProcessedResultRow[];

  return rows.map(item => {
    const now = new Date(item.created_at);
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    };
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    };
    const dateStr = now.toLocaleDateString('id-ID', dateOptions);
    const timeStr = now.toLocaleTimeString('id-ID', timeOptions);
    const formattedDate = `${dateStr} pukul ${timeStr}`;

    const processingResult = buildProcessingResult(item);

    return {
      id: item.id,
      fileName: item.file_name || 'File tanpa nama',
      createdAt: item.created_at,
      formattedDate,
      reportType: item.report_type || null,
      reportDate: item.report_date || null,
      result: processingResult
    };
  });
}

/**
 * Fetches the most recent processed Excel data from Supabase.
 * @returns An object containing the latest result and the update timestamp, or null if none found.
 */
export async function getLatestProcessedResult(userId: string): Promise<{
  id: string;
  result: ProcessingResult;
  lastUpdated: string;
  reportType: string | null;
  reportDate: string | null;
} | null> {
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from('processed_results')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching latest processed result:', error);
    return null;
  }

  if (!data || data.length === 0) {
    return null; // No results found, which is normal for a new user
  }

  const [latestResult] = data as ProcessedResultRow[];

  const processingResult = buildProcessingResult(latestResult);

  return {
    id: latestResult.id,
    result: processingResult,
    lastUpdated: new Date(latestResult.created_at).toLocaleString('id-ID'),
    reportType: latestResult.report_type || null,
    reportDate: latestResult.report_date || null
  };
}

/**
 * Fetches the most recent processed Excel data from Supabase based on report_date.
 * @returns An object containing the latest result by report_date and the update timestamp, or null if none found.
 */
export async function getLatestProcessedResultByReportDate(userId: string): Promise<{
  id: string;
  result: ProcessingResult;
  lastUpdated: string;
  reportType: string | null;
  reportDate: string | null;
} | null> {
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from('processed_results')
    .select('*')
    .eq('user_id', userId)
    .not('report_date', 'is', null)
    .order('report_date', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching latest processed result by report_date:', error);
    return null;
  }

  if (!data || data.length === 0) {
    // Fallback to getLatestProcessedResult if no report_date found
    return getLatestProcessedResult(userId);
  }

  const [latestResult] = data as ProcessedResultRow[];

  const processingResult = buildProcessingResult(latestResult);

  return {
    id: latestResult.id,
    result: processingResult,
    lastUpdated: new Date(latestResult.created_at).toLocaleString('id-ID'),
    reportType: latestResult.report_type || null,
    reportDate: latestResult.report_date || null
  };
}

export async function getProcessedResultById(id: string, userId: string): Promise<{
  id: string;
  result: ProcessingResult;
  lastUpdated: string;
  reportType: string | null;
  reportDate: string | null;
} | null> {
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from('processed_results')
    .select('*')
    .match({ id, user_id: userId })
    .single();

  if (error || !data) {
    return null;
  }

  const record = data as ProcessedResultRow;

  const processingResult = buildProcessingResult(record);

  return {
    id: record.id,
    result: processingResult,
    lastUpdated: new Date(record.created_at).toLocaleString('id-ID'),
    reportType: record.report_type || null,
    reportDate: record.report_date || null
  };
}

/**
 * Saves a new processed result to the Supabase database.
 * @param result The processing result object.
 * @param fileName The name of the original file.
 */
export async function saveProcessedResult(
  result: ProcessingResult,
  fileName: string,
  options: { reportType: string; reportDate: string },
  userId: string
): Promise<void> {
  if (!userId) {
    throw new Error('Sesi pengguna tidak valid. Silakan login ulang.');
  }

  // Convert Map to plain object for storage
  const accountNameMapObj = result.accountNameMap ? 
    Object.fromEntries(result.accountNameMap) : {};

  const { error } = await supabase
    .from('processed_results')
    .insert([
      {
        file_name: fileName,
        processed_data: result.finalData,
        totals: result.totals,
        account_name_map: accountNameMapObj,
        report_type: options.reportType,
        report_date: options.reportDate,
        user_id: userId
      },
    ]);

  if (error) {
    console.error('Error saving processed result:', error);
    throw error;
  }
}

// --- Activities and Allocations ---

/**
 * Fetches all activities along with their nested allocations.
 * @returns An array of activities.
 */
export async function getActivities(userId: string): Promise<Activity[]> {
    if (!userId) {
        return [];
    }

    const { data, error } = await supabase
        .from('activities')
        .select(`
            id,
            nama,
            status,
            tanggal_pelaksanaan,
            tujuan_kegiatan,
            kl_unit_terkait,
            penanggung_jawab,
            capaian,
            pending_issue,
            rencana_tindak_lanjut,
            allocations ( 
                id,
                kode,
                uraian,
                jumlah
            )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching activities:', error);
        return [];
    }

    if (!data) {
        return [];
    }

        const rows = data as SupabaseActivityRow[];

    return rows.map(activity => {
        const allocations = (activity.allocations ?? []) as SupabaseAllocationRow[];

        return {
            id: activity.id,
            nama: activity.nama,
            status: activity.status || 'draft',
            tanggal_pelaksanaan: activity.tanggal_pelaksanaan || null,
            tujuan_kegiatan: activity.tujuan_kegiatan || null,
            kl_unit_terkait: activity.kl_unit_terkait || null,
            penanggung_jawab: activity.penanggung_jawab || null,
            capaian: activity.capaian || null,
            pending_issue: activity.pending_issue || null,
            rencana_tindak_lanjut: activity.rencana_tindak_lanjut || null,
            attachments: [],
            allocations: allocations.map((alloc): BudgetAllocation => ({
                kode: alloc.kode,
                uraian: alloc.uraian || '',
                jumlah: alloc.jumlah,
            })),
        };
    });
}


/**
 * Adds a new activity and its associated allocations to the database.
 * @param newActivity The activity data to add (without an id).
 * @param userId The ID of the user creating the activity.
 * @returns The newly created activity with its ID.
 */
export async function addActivity(newActivity: Omit<Activity, 'id'>, userId: string): Promise<Activity> {
    if (!userId) {
        throw new Error('Sesi pengguna tidak valid. Silakan login ulang.');
    }

    const { data: activityData, error: activityError } = await supabase
        .from('activities')
        .insert({ 
            nama: newActivity.nama,
            status: newActivity.status || 'draft',  // Default status 'draft' jika tidak diset
            tanggal_pelaksanaan: newActivity.tanggal_pelaksanaan || null,
            tujuan_kegiatan: newActivity.tujuan_kegiatan,
            kl_unit_terkait: newActivity.kl_unit_terkait,
            penanggung_jawab: newActivity.penanggung_jawab,
            capaian: newActivity.capaian,
            pending_issue: newActivity.pending_issue,
            rencana_tindak_lanjut: newActivity.rencana_tindak_lanjut,
            user_id: userId
        })
        .select()
        .single();

    if (activityError || !activityData) {
        console.error('Error creating activity:', activityError);
        throw new Error('Gagal membuat kegiatan baru.');
    }

    const newActivityId = activityData.id;

    if (newActivity.allocations.length > 0) {
        const allocationsToInsert = newActivity.allocations.map(alloc => ({
            activity_id: newActivityId,
            kode: alloc.kode,
            uraian: alloc.uraian,
            jumlah: alloc.jumlah,
        }));

        const { error: allocationError } = await supabase
            .from('allocations')
            .insert(allocationsToInsert);

        if (allocationError) {
            console.error('Error adding allocations:', allocationError);
            await supabase.from('activities').delete().match({ id: newActivityId });
            throw new Error('Gagal menambahkan alokasi untuk kegiatan.');
        }
    }
    
    return {
        ...newActivity,
        id: newActivityId,
        attachments: newActivity.attachments ?? [],
    };
}

/**
 * Updates an existing activity and its allocations in the database.
 * @param id The ID of the activity to update.
 * @param updatedActivity The updated activity data.
 * @returns The updated activity.
 */
export async function updateActivity(id: string, updatedActivity: Omit<Activity, 'id'>, userId: string): Promise<Activity> {
    if (!userId) {
        throw new Error('Sesi pengguna tidak valid. Silakan login ulang.');
    }

    // Update the activity and ensure ownership
    const { data: updatedRows, error: activityError } = await supabase
        .from('activities')
        .update({ 
            nama: updatedActivity.nama,
            status: updatedActivity.status || 'draft',
            tanggal_pelaksanaan: updatedActivity.tanggal_pelaksanaan || null,
            tujuan_kegiatan: updatedActivity.tujuan_kegiatan,
            kl_unit_terkait: updatedActivity.kl_unit_terkait,
            penanggung_jawab: updatedActivity.penanggung_jawab,
            capaian: updatedActivity.capaian,
            pending_issue: updatedActivity.pending_issue,
            rencana_tindak_lanjut: updatedActivity.rencana_tindak_lanjut
        })
        .eq('id', id)
        .eq('user_id', userId)
        .select('id');

    if (activityError) {
        console.error('Error updating activity:', activityError);
        throw new Error('Gagal memperbarui kegiatan.');
    }

    if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Kegiatan tidak ditemukan atau Anda tidak memiliki akses.');
    }

    // Delete existing allocations
    const { error: deleteAllocationsError } = await supabase
        .from('allocations')
        .delete()
        .match({ activity_id: id });

    if (deleteAllocationsError) {
        console.error('Error removing old allocations:', deleteAllocationsError);
        throw new Error('Gagal memperbarui alokasi kegiatan.');
    }

    // Add new allocations if any
    if (updatedActivity.allocations.length > 0) {
        const allocationsToInsert = updatedActivity.allocations.map(alloc => ({
            activity_id: id,
            kode: alloc.kode,
            uraian: alloc.uraian,
            jumlah: alloc.jumlah,
        }));

        const { error: allocationError } = await supabase
            .from('allocations')
            .insert(allocationsToInsert);

        if (allocationError) {
            console.error('Error adding new allocations:', allocationError);
            throw new Error('Gagal menambahkan alokasi untuk kegiatan.');
        }
    }
    
    return {
        ...updatedActivity,
        id,
        attachments: updatedActivity.attachments ?? [],
    };
}

/**
 * Removes an activity from the database.
 * @param id The UUID of the activity to remove.
 */
export async function removeActivity(id: string, userId: string): Promise<void> {
    if (!userId) {
        throw new Error('Sesi pengguna tidak valid. Silakan login ulang.');
    }

    const { data, error } = await supabase
        .from('activities')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .select('id');

    if (error) {
        console.error('Error removing activity:', error);
        throw new Error('Gagal menghapus kegiatan.');
    }

    if (!data || data.length === 0) {
        throw new Error('Kegiatan tidak ditemukan atau Anda tidak memiliki akses.');
    }
}


// --- User Settings ---

/**
 * Fetches a specific setting value from the database.
 * @param key The key of the setting to retrieve.
 * @returns The value of the setting, or null if not found.
 */
export async function getSetting(key: string, userId: string): Promise<string | null> {
    if (!userId) return null;
    const { data, error } = await supabase
        .from('user_settings')
        .select('value')
        .eq('key', key)
        .eq('user_id', userId)
        .limit(1);

    if (error) {
        console.error(`Error fetching setting '${key}':`, error);
        return null;
    }

    if (!data || data.length === 0) {
        return null; // Gracefully return null if setting not found
    }

    return data[0].value;
}

/**
 * Saves or updates a setting in the database for a specific user.
 * @param key The key of the setting.
 * @param value The value to save.
 * @param userId The ID of the user.
 */
export async function saveSetting(key: string, value: string, userId: string): Promise<void> {
    if (!userId) throw new Error('User ID is required to save a setting.');
    const { error } = await supabase
        .from('user_settings')
        .upsert({ key, value, user_id: userId, updated_at: new Date().toISOString() });

    if (error) {
        console.error(`Error saving setting '${key}':`, error);
        throw new Error('Gagal menyimpan pengaturan.');
    }
}








