export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3.1:free';

const resolveEnv = (key: string): string | undefined => {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[key];
};

export const fetchAiResponse = async (messages: AiChatMessage[]): Promise<string> => {
  const apiKey =
    resolveEnv('VITE_OPENROUTER_API_KEY') ??
    resolveEnv('API_KEY') ??
    resolveEnv('VITE_API_KEY');

  if (!apiKey) {
    throw new Error('AI API key belum dikonfigurasi. Tambahkan VITE_OPENROUTER_API_KEY pada berkas .env.');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  if (typeof window !== 'undefined') {
    headers['HTTP-Referer'] = window.location.origin;
    const title = (document?.title || '').trim();
    if (title) {
      headers['X-Title'] = title;
    }
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: resolveEnv('VITE_OPENROUTER_MODEL') ?? DEFAULT_MODEL,
      messages
    })
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
        detail = '';
      }
    }
    const hint = detail ? ` Detail: ${detail}` : '';
    throw new Error(`Permintaan ke layanan AI gagal (${response.status}).${hint}`);
  }

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Respon AI tidak mengandung jawaban yang dapat dibaca.');
  }

  return content.trim();
};
