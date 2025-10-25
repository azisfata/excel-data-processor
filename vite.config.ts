import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Determine which .env file to load based on mode
    let envFile = '';
    if (mode === 'production') {
        envFile = '.env.prod';
    } else if (mode === 'development') {
        envFile = '.env.loc';
    }
    
    const env = loadEnv(mode, '.', envFile);
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.JWT_SECRET': JSON.stringify(env.JWT_SECRET)
      },
      plugins: [react()],
      server: {
        host: true,
        allowedHosts: true,
        proxy: {
          '/api': {
            target: `http://localhost:${env.AUTH_SERVER_PORT || 3002}`,
            changeOrigin: true
          },
          '/activity-uploads': {
            target: `http://localhost:${env.ACTIVITY_SERVER_PORT || 3001}`,
            changeOrigin: true
          }
        }
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
