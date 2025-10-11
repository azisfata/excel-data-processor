
import { supabase } from '../utils/supabase';
import { ProcessingResult, Activity } from '../types';

// --- Processed Results ---

/**
 * Fetches all processed results from Supabase, ordered by creation date (newest first).
 * @returns An array of objects containing the result data and metadata.
 */
export async function getAllProcessedResults() {
  const { data, error } = await supabase
    .from('processed_results')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching processed results:', error);
    return [];
  }

  return data.map(item => {
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

    return {
      id: item.id,
      fileName: item.file_name || 'File tanpa nama',
      createdAt: item.created_at,
      formattedDate,
      result: {
        finalData: item.processed_data,
        totals: item.totals,
        processedDataForPreview: item.processed_data?.slice(0, 100) || [],
        accountNameMap: item.account_name_map ? new Map(Object.entries(item.account_name_map)) : new Map()
      }
    };
  });
}

/**
 * Fetches the most recent processed Excel data from Supabase.
 * @returns An object containing the latest result and the update timestamp, or null if none found.
 */
export async function getLatestProcessedResult(): Promise<{ result: ProcessingResult; lastUpdated: string } | null> {
  const { data, error } = await supabase
    .from('processed_results')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    result: {
      finalData: data.processed_data,
      totals: data.totals,
      processedDataForPreview: data.processed_data?.slice(0, 100) || [],
      accountNameMap: data.account_name_map ? new Map(Object.entries(data.account_name_map)) : new Map()
    },
    lastUpdated: new Date(data.created_at).toLocaleString('id-ID')
  };
}

/**
 * Saves a new processed result to the Supabase database.
 * @param result The processing result object.
 * @param fileName The name of the original file.
 */
export async function saveProcessedResult(result: ProcessingResult, fileName: string): Promise<void> {
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
        account_name_map: accountNameMapObj
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
export async function getActivities(): Promise<Activity[]> {
    const { data, error } = await supabase
        .from('activities')
        .select(`
            id,
            nama,
            status,
            tanggal_pelaksanaan,
            allocations (
                id,
                kode,
                jumlah
            )
        `)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching activities:', error);
        return [];
    }

    return data.map((activity: any) => ({
        id: activity.id,
        nama: activity.nama,
        status: activity.status || 'draft',
        tanggal_pelaksanaan: activity.tanggal_pelaksanaan || null,
        attachments: [],
        allocations: activity.allocations.map((alloc: any) => ({
            kode: alloc.kode,
            jumlah: alloc.jumlah,
        })),
    }));
}


/**
 * Adds a new activity and its associated allocations to the database.
 * @param newActivity The activity data to add (without an id).
 * @returns The newly created activity with its ID.
 */
export async function addActivity(newActivity: Omit<Activity, 'id'>): Promise<Activity> {
    const { data: activityData, error: activityError } = await supabase
        .from('activities')
        .insert({ 
            nama: newActivity.nama,
            status: newActivity.status || 'draft',  // Default status 'draft' jika tidak diset
            tanggal_pelaksanaan: newActivity.tanggal_pelaksanaan || null
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
export async function updateActivity(id: string, updatedActivity: Omit<Activity, 'id'>): Promise<Activity> {
    // Update the activity
    const { error: activityError } = await supabase
        .from('activities')
        .update({ 
            nama: updatedActivity.nama,
            status: updatedActivity.status || 'draft',
            tanggal_pelaksanaan: updatedActivity.tanggal_pelaksanaan || null
        })
        .match({ id });

    if (activityError) {
        console.error('Error updating activity:', activityError);
        throw new Error('Gagal memperbarui kegiatan.');
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
export async function removeActivity(id: string): Promise<void> {
    const { error } = await supabase
        .from('activities')
        .delete()
        .match({ id });

    if (error) {
        console.error('Error removing activity:', error);
        throw new Error('Gagal menghapus kegiatan.');
    }
}


// --- User Settings ---

/**
 * Fetches a specific setting value from the database.
 * @param key The key of the setting to retrieve.
 * @returns The value of the setting, or null if not found.
 */
export async function getSetting(key: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('user_settings')
        .select('value')
        .eq('key', key)
        .single();

    if (error || !data) {
        if (error && error.code !== 'PGRST116') {
            console.error(`Error fetching setting '${key}':`, error);
        }
        return null;
    }
    return data.value;
}

/**
 * Saves or updates a setting in the database.
 * @param key The key of the setting.
 * @param value The value to save.
 */
export async function saveSetting(key: string, value: string): Promise<void> {
    const { error } = await supabase
        .from('user_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() });

    if (error) {
        console.error(`Error saving setting '${key}':`, error);
        throw new Error('Gagal menyimpan pengaturan.');
    }
}
