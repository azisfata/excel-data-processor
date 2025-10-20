import React, { useState, useRef, useEffect, useMemo } from 'react';
import { fetchAiResponse, type AiChatMessage as AiRequestMessage } from '@/services/aiService';

type AiMessage = {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

interface AIChatModalProps {
  onClose: () => void;
  onNewMessage: () => void;
  systemPrompt?: string;
}

const buildDefaultSystemPrompt = (): string => [
  'Anda adalah asisten AI yang membantu analisis data anggaran di aplikasi internal.',
  'Jawab dalam bahasa Indonesia yang ringkas, spesifik, dan berbasis data yang diberikan pengguna.',
  'Jika tidak memiliki informasi yang cukup, jelaskan data apa yang dibutuhkan.'
].join('\n');

const AIChatModal: React.FC<AIChatModalProps> = ({ onClose, onNewMessage, systemPrompt }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const resolvedSystemPrompt = useMemo(
    () => (systemPrompt && systemPrompt.trim().length > 0 ? systemPrompt : buildDefaultSystemPrompt()),
    [systemPrompt]
  );

  // Fungsi untuk generate ID pesan unik
  const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Sinkronkan dengan onNewMessage parent
  useEffect(() => {
    if (messages.length > 0) {
      onNewMessage();
    }
  }, [messages, onNewMessage]);

  // Auto scroll ke bawah
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Sanitasi output model
  const sanitizeOutput = (raw: string): string => {
    if (!raw) return '';
    const cleaned = raw.replace(/<[\\uFF5C\\|].*?>/g, '').trim();
    return cleaned || raw.trim();
  };

  // Format konten pesan
  const formatContent = (text: string): string => {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const withLineBreaks = withBold.replace(/\n/g, '<br />');
    return withLineBreaks;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMessage: AiMessage = {
      id: generateMessageId(),
      sender: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    // Tambahkan pesan pengguna ke daftar
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsProcessing(true);
    setError(null);

    try {
      // Bangun payload permintaan
      const payload: AiRequestMessage[] = [
        { role: 'system', content: resolvedSystemPrompt },
        ...newMessages.map(msg => ({
          role: msg.sender,
          content: msg.content
        }))
      ];

      // Kirim permintaan ke AI
      const aiReply = await fetchAiResponse(payload);
      const cleanedReply = sanitizeOutput(aiReply);

      const assistantMessage: AiMessage = {
        id: generateMessageId(),
        sender: 'assistant',
        content: cleanedReply,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('AI chat modal error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan saat memanggil layanan AI.';
      setError(errorMessage);

      const fallbackMessage: AiMessage = {
        id: generateMessageId(),
        sender: 'assistant',
        content: errorMessage.includes('API key')
          ? 'Konfigurasi API key AI belum lengkap. Periksa variabel lingkungan dan coba lagi.'
          : 'Maaf, terjadi kendala saat menghubungi layanan AI. Silakan coba beberapa saat lagi.',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed bottom-24 right-6 z-50 w-96 max-w-full">
      <div className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden flex flex-col h-[500px] max-h-[80vh]">
        {/* Header */}
        <div className="bg-blue-600 text-white p-3 flex justify-between items-center">
          <h3 className="font-semibold">AI Analyst</h3>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-200 focus:outline-none"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p>Belum ada percakapan. Kirim pesan pertama Anda!</p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                <button
                  onClick={() => setInput('Berapa total realisasi anggaran saat ini?')}
                  className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
                >
                  Total realisasi?
                </button>
                <button
                  onClick={() => setInput('Tampilkan kegiatan dengan alokasi terbesar')}
                  className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
                >
                  Kegiatan terbesar?
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map(message => {
                const isUser = message.sender === 'user';
                const timestamp = formatTime(message.timestamp);

                return (
                  <div 
                    key={message.id} 
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                        isUser
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-800'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          {isUser ? 'Anda' : 'AI'}
                        </span>
                        <span className={`text-[10px] ${isUser ? 'text-white/80' : 'text-gray-400'}`}>
                          {timestamp}
                        </span>
                      </div>
                      <p
                        className="leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
                      />
                    </div>
                  </div>
                );
              })}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                    <svg
                      className="h-4 w-4 animate-spin text-blue-500"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V2a10 10 0 1010 10h-2a8 8 0 11-16 0z"
                      ></path>
                    </svg>
                    <span>Sedang memproses...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3 bg-white">
          {error && (
            <div className="mb-2 text-xs text-red-600 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanyakan tentang data anggaran..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isProcessing}
            />
            <button
              type="submit"
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isProcessing || !input.trim()}
            >
              Kirim
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AIChatModal;
