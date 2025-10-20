import React, { useState, useEffect, useCallback } from 'react';
import AIChatModal from './AIChatModal';

const STORAGE_KEY = 'aiLastInteraction';
const TEN_MINUTES_MS = 10 * 60 * 1000;

interface FloatingAIButtonProps {
  systemPrompt?: string;
}

const FloatingAIButton: React.FC<FloatingAIButtonProps> = ({ systemPrompt }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const markInteraction = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  }, []);

  useEffect(() => {
    const checkForNewMessages = () => {
      const lastInteraction = localStorage.getItem(STORAGE_KEY);
      if (!lastInteraction) {
        setHasNewMessages(false);
        return;
      }

      const timeDiff = Date.now() - Number(lastInteraction);
      setHasNewMessages(!isOpen && timeDiff > TEN_MINUTES_MS);
    };

    checkForNewMessages();
    const interval = setInterval(checkForNewMessages, 30_000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleToggleModal = () => {
    setIsOpen(prev => {
      const next = !prev;
      if (next) {
        setHasNewMessages(false);
        markInteraction();
      }
      return next;
    });
  };

  const handleCloseModal = () => {
    setIsOpen(false);
    markInteraction();
  };

  const handleNewMessage = () => {
    setHasNewMessages(false);
    markInteraction();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <AIChatModal 
          onClose={handleCloseModal} 
          onNewMessage={handleNewMessage}
          systemPrompt={systemPrompt}
        />
      )}

      <button 
        type="button"
        onClick={handleToggleModal}
        className={`relative w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl flex items-center justify-center hover:bg-blue-700 transition-all duration-300 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-blue-300 ${hasNewMessages ? 'ring-4 ring-blue-200 animate-pulse' : ''}`}
        title={isOpen ? 'Tutup percakapan AI' : 'Buka percakapan AI'}
        aria-pressed={isOpen}
      >
        <svg 
          className="w-6 h-6" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" 
          />
        </svg>
        {hasNewMessages && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-semibold">
            !
          </span>
        )}
      </button>
    </div>
  );
};

export default FloatingAIButton;
