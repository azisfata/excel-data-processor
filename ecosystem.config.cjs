const { config } = require('dotenv');

// Load environment variables from .env file
const envConfig = config({ path: '.env' }).parsed;

// Helper function to get environment variable with fallback
const getEnvVar = (key, fallback) => envConfig?.[key] || fallback;

module.exports = {
  apps: [
    {
      name: 'excel-processor-frontend',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: './dist',
        PM2_SERVE_PORT: getEnvVar('FRONTEND_PORT', 5173),
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html',
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      error_file: './logs/frontend-err.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend.log',
      time: true
    },
    {
      name: 'excel-processor-auth-server',
      script: 'server/auth-server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        AUTH_SERVER_PORT: getEnvVar('AUTH_SERVER_PORT', 3002),
        // Pass all environment variables to the server
        ...envConfig
      },
      error_file: './logs/auth-err.log',
      out_file: './logs/auth-out.log',
      log_file: './logs/auth.log',
      time: true
    },
    {
      name: 'excel-processor-activity-server',
      script: 'server/activity-upload-server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        ACTIVITY_SERVER_PORT: getEnvVar('ACTIVITY_SERVER_PORT', 3001),
        // Pass all environment variables to the server
        ...envConfig
      },
      error_file: './logs/activity-err.log',
      out_file: './logs/activity-out.log',
      log_file: './logs/activity.log',
      time: true
    },
    {
      name: 'excel-processor-whatsapp-webhook',
      script: 'server/webhook-server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        WHATSAPP_SERVER_PORT: getEnvVar('WHATSAPP_SERVER_PORT', 3003),
        ...envConfig
      },
      error_file: './logs/webhook-err.log',
      out_file: './logs/webhook-out.log',
      log_file: './logs/webhook.log',
      time: true
    }
  ]
};
