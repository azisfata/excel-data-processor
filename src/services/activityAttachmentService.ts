import type { ActivityAttachment } from '@/types';

const BASE_URL = '/api/activities';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchActivityAttachments(): Promise<Record<string, ActivityAttachment[]>> {
  const response = await fetch(`${BASE_URL}/attachments`);
  return handleResponse<Record<string, ActivityAttachment[]>>(response);
}

export async function uploadActivityAttachment(
  activityId: string,
  file: File
): Promise<ActivityAttachment> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${BASE_URL}/${activityId}/attachment`, {
    method: 'POST',
    body: formData,
  });

  return handleResponse<ActivityAttachment>(response);
}

export async function uploadActivityAttachments(
  activityId: string,
  files: File[]
): Promise<ActivityAttachment[]> {
  if (!files.length) {
    return [];
  }
  const uploaded: ActivityAttachment[] = [];
  for (const file of files) {
    const result = await uploadActivityAttachment(activityId, file);
    uploaded.push(result);
  }
  return uploaded;
}

export async function deleteActivityAttachment(
  activityId: string,
  attachmentId?: string
): Promise<void> {
  const endpoint = attachmentId
    ? `${BASE_URL}/${activityId}/attachment/${attachmentId}`
    : `${BASE_URL}/${activityId}/attachment`;

  const response = await fetch(endpoint, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Gagal menghapus lampiran (status ${response.status})`);
  }
}
