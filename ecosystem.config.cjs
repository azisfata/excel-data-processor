module.exports = {
  apps: [
    {
      name: 'excel-processor-frontend',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: './dist',
        PM2_SERVE_PORT: 5173,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html'
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
        PORT: 3002
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
        ACTIVITY_SERVER_PORT: 3001
      },
      error_file: './logs/activity-err.log',
      out_file: './logs/activity-out.log',
      log_file: './logs/activity.log',
      time: true
    }
  ]
};
