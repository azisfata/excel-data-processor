export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const DEFAULT_MODEL = 'models/gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

let lastSuccessfulModel: string | null = null;

export const getLastSuccessfulModel = (): string | null => lastSuccessfulModel;

const resolveEnv = (key: string): string | undefined => {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[key];
};

const mapRoleToGeminiRole = (role: AiChatMessage['role']): 'user' | 'model' => {
  return role === 'assistant' ? 'model' : 'user';
};

const buildGeminiPayload = (messages: AiChatMessage[]) => {
  const systemMessage = messages.find(message => message.role === 'system');
  const conversation = messages.filter(message => message.role !== 'system');

  const contents = conversation.map(message => ({
    role: mapRoleToGeminiRole(message.role),
    parts: [{ text: message.content }],
  }));

  const payload: Record<string, unknown> = { contents };

  if (systemMessage) {
    payload.systemInstruction = {
      role: 'system',
      parts: [{ text: systemMessage.content }],
    };
  }

  return payload;
};

const getApiKey = (): string => {
  const key =
    resolveEnv('VITE_GEMINI_API_KEY') ?? resolveEnv('GEMINI_API_KEY') ?? resolveEnv('VITE_API_KEY');
  if (!key) {
    throw new Error(
      'AI API key Gemini belum dikonfigurasi. Tambahkan VITE_GEMINI_API_KEY pada berkas .env.'
    );
  }
  return key;
};

const parseError = async (response: Response): Promise<Error> => {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error?.message || JSON.stringify(body);
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = 'Gagal membaca detail error dari respon.';
    }
  }
  const hint = detail ? ` Detail: ${detail}` : '';
  return new Error(`Permintaan ke layanan AI gagal (${response.status}).${hint}`);
};

const attemptRequest = async (
  model: string,
  apiKey: string,
  payload: Record<string, unknown>,
  signal: AbortSignal | null
) => {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const data = await response.json();
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('')
      .trim() ?? ''
  );
};

export const fetchAiResponse = async (messages: AiChatMessage[]): Promise<string> => {
  const apiKey =
    resolveEnv('VITE_GEMINI_API_KEY') ?? resolveEnv('GEMINI_API_KEY') ?? resolveEnv('VITE_API_KEY');

  if (!apiKey) {
    throw new Error(
      'AI API key Gemini belum dikonfigurasi. Tambahkan VITE_GEMINI_API_KEY pada berkas .env.'
    );
  }

  const modelId = resolveEnv('VITE_GEMINI_MODEL') ?? DEFAULT_MODEL;
  const baseModel = modelId.startsWith('models/') ? modelId : `models/${modelId}`;
  const fallbackList =
    resolveEnv('VITE_GEMINI_FALLBACK_MODELS')
      ?.split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
      .map(entry => (entry.startsWith('models/') ? entry : `models/${entry}`)) ?? [];

  const candidates = [baseModel, ...fallbackList.filter(model => model !== baseModel)];

  const timeoutMs = Number(resolveEnv('VITE_GEMINI_TIMEOUT_MS') ?? '20000');
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (controller) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    let lastError: Error | null = null;
    const payload = buildGeminiPayload(messages);

    for (const candidate of candidates) {
      try {
        const contentText = await attemptRequest(
          candidate,
          apiKey,
          payload,
          controller?.signal ?? null
        );
        if (!contentText) {
          throw new Error('Respon AI tidak mengandung jawaban yang dapat dibaca.');
        }
        lastSuccessfulModel = candidate;
        return contentText;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const message = lastError?.message?.toLowerCase() ?? '';
        console.warn(`[AI] Model ${candidate} gagal: ${lastError?.message ?? 'unknown error'}`);

        // If the error is related to quota, rate limits, or server overload, try the next model.
        // Otherwise, fail fast.
        if (
          message.includes('quota') ||
          message.includes('exceeded') ||
          message.includes('rate') ||
          message.includes('429') ||
          message.includes('503') ||
          message.includes('overload') ||
          (error as Error).name === 'AbortError' // Also continue on timeout
        ) {
          continue;
        }
        // For other errors (e.g., invalid API key, bad request), throw immediately.
        throw lastError;
      }
    }
    if (lastError) {
      console.error(
        '[AI] Seluruh model fallback gagal. Mengembalikan error terakhir:',
        lastError.message
      );
    }
    throw lastError ?? new Error('Tidak dapat memproses permintaan menggunakan layanan AI.');
  } catch (error) {
    const err = error as Error;
    if (err.name === 'AbortError') {
      throw new Error('Permintaan ke layanan AI melebihi batas waktu. Silakan coba lagi.');
    }
    throw err instanceof Error ? err : new Error('Terjadi kesalahan saat memanggil layanan AI.');
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};
