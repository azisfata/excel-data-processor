const rawAuthUrl = (import.meta.env.VITE_AUTH_SERVER_URL || '').trim();
const authServerPort = import.meta.env.VITE_AUTH_SERVER_PORT || '3002';

const normalizedAuthUrl =
  rawAuthUrl.length > 0 ? rawAuthUrl.replace(/\/$/, '') : `http://localhost:${authServerPort}`;

export const AUTH_API_BASE_URL = `${normalizedAuthUrl}/api`;

export const getAuthApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${AUTH_API_BASE_URL}/${normalizedPath}`;
};
