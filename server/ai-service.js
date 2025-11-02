const DEFAULT_MODEL = 'models/gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

let lastSuccessfulModel = null;

const resolveEnv = key => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return undefined;
};

const mapRoleToGeminiRole = role => {
  return role === 'assistant' ? 'model' : 'user';
};

const buildGeminiPayload = messages => {
  const systemMessage = messages.find(message => message.role === 'system');
  const conversation = messages.filter(message => message.role !== 'system');

  const contents = conversation.map(message => ({
    role: mapRoleToGeminiRole(message.role),
    parts: [{ text: message.content }]
  }));

  const payload = { contents };

  if (systemMessage) {
    payload.systemInstruction = {
      role: 'system',
      parts: [{ text: systemMessage.content }]
    };
  }

  return payload;
};

const getApiKey = () => {
  const key =
    resolveEnv('GEMINI_API_KEY') ||
    resolveEnv('VITE_GEMINI_API_KEY');

  if (!key) {
    throw new Error('Gemini API key belum dikonfigurasi. Set GEMINI_API_KEY atau VITE_GEMINI_API_KEY.');
  }
  return key;
};

const attemptRequest = async (model, apiKey, payload, signal) => {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = 'Tidak dapat membaca detail error dari layanan AI.';
      }
    }
    throw new Error(`Permintaan ke layanan AI gagal (${response.status}). ${detail}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.map(part => part?.text ?? '').join('').trim() ?? '';
};

export const fetchAiResponse = async messages => {
  const apiKey = getApiKey();

  const modelId = resolveEnv('VITE_GEMINI_MODEL') || resolveEnv('GEMINI_MODEL') || DEFAULT_MODEL;
  const baseModel = modelId.startsWith('models/') ? modelId : `models/${modelId}`;
  const fallbackList = (resolveEnv('VITE_GEMINI_FALLBACK_MODELS') || resolveEnv('GEMINI_FALLBACK_MODELS') || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => (entry.startsWith('models/') ? entry : `models/${entry}`));

  const candidates = [baseModel, ...fallbackList.filter(model => model !== baseModel)];

  const timeoutMs = Number(resolveEnv('VITE_GEMINI_TIMEOUT_MS') || resolveEnv('GEMINI_TIMEOUT_MS') || '20000');
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId;

  if (controller) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    let lastError = null;
    const payload = buildGeminiPayload(messages);

    for (const candidate of candidates) {
      try {
        const contentText = await attemptRequest(candidate, apiKey, payload, controller?.signal ?? undefined);
        if (!contentText) {
          throw new Error('Respon AI kosong.');
        }
        lastSuccessfulModel = candidate;
        return contentText;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;
        const message = err.message.toLowerCase();
        if (
          message.includes('quota') ||
          message.includes('exceeded') ||
          message.includes('rate') ||
          message.includes('429') ||
          message.includes('503') ||
          err.name === 'AbortError'
        ) {
          continue;
        }
        throw err;
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('Tidak dapat memproses permintaan menggunakan layanan AI.');
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Terjadi kesalahan saat memanggil layanan AI.');
    if (err.name === 'AbortError') {
      throw new Error('Permintaan ke layanan AI melebihi batas waktu.');
    }
    throw err;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const getLastSuccessfulModel = () => lastSuccessfulModel;
