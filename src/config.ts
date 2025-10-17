// src/config.ts
const getBaseUrl = (): string => {
  // Gunakan environment variable VITE_AUTH_SERVER_URL untuk production
  return import.meta.env.VITE_AUTH_SERVER_URL || 'http://localhost:3002';
};

const getActivityBaseUrl = (): string => {
  // Gunakan environment variable VITE_ACTIVITY_SERVER_URL untuk production
  return import.meta.env.VITE_ACTIVITY_SERVER_URL || 'http://localhost:3001';
};

export const API_CONFIG = {
  AUTH_SERVER_URL: getBaseUrl(),
  ACTIVITY_SERVER_URL: getActivityBaseUrl(),
};