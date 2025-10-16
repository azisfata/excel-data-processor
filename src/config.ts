// src/config.ts
const getBaseUrl = (): string => {
  // Check for environment variable first
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    // Production: use current domain
    return `${window.location.protocol}//${window.location.host}`;
  } else {
    // Development: use environment variable or default to localhost
    return import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:3002';
  }
};

export const API_CONFIG = {
  AUTH_SERVER_URL: getBaseUrl(),
  ACTIVITY_SERVER_URL: import.meta.env.VITE_ACTIVITY_SERVER_URL || 'http://localhost:3001',
};