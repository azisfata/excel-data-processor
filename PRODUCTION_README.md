# 🚀 Production Deployment Guide - Excel Data Processor

## Prerequisites

Before deploying to production, ensure you have:

1. **Node.js 18+** installed
2. **PM2** installed globally: `npm install -g pm2`
3. **Built frontend**: Run `npm run build` (already done)
4. **Production environment variables** configured in `.env` file

## Quick Start

### 1. Configure Environment Variables

```bash
# Copy the production template
cp .env.production .env

# Edit .env with your actual values:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - GEMINI_API_KEY
# - JWT_SECRET (generate secure random string)
# - CORS_ORIGIN (your production domain)
```

### 2. Start Production Application

```bash
# Option 1: Use the startup script
npm start
# or
./start-production.sh

# Option 2: Use PM2 directly
pm2 start ecosystem.config.js
```

### 3. Verify Deployment

Check if all services are running:

```bash
# Check PM2 status
pm2 status

# View real-time logs
pm2 logs

# Check specific service logs
pm2 logs excel-processor-frontend
pm2 logs excel-processor-auth-server
pm2 logs excel-processor-activity-server
```

## Production Architecture

```
┌─────────────────────────────────────┐
│     PM2 Process Manager             │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐ │
│  │   Frontend (Serve)              │ │
│  │   Port: 5173                    │ │
│  └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐ │
│  │   Auth Server                   │ │
│  │   Port: 3002                    │ │
│  └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐ │
│  │   Activity Upload Server        │ │
│  │   Port: 3001                    │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Available NPM Scripts

```bash
# Production Management
npm start          # Start all services with PM2
npm stop           # Stop all services
npm run pm2:status # Check PM2 process status
npm run pm2:logs   # View all logs
npm run pm2:restart # Restart all services

# Development
npm run dev        # Start development servers
npm run build      # Build for production

# Utilities
npm run create-admin # Create initial admin user
npm run check-env    # Validate environment configuration
```

## PM2 Management Commands

```bash
# Process Management
pm2 start ecosystem.config.js    # Start all processes
pm2 stop all                     # Stop all processes
pm2 restart all                  # Restart all processes
pm2 delete all                   # Delete all processes

# Monitoring
pm2 status                       # Show process status
pm2 logs                         # Show all logs
pm2 logs --lines 50              # Show last 50 lines
pm2 monit                        # Real-time monitoring

# Auto-restart on reboot
pm2 save                         # Save current processes
pm2 startup                      # Enable auto-start on boot
```

## Logs and Monitoring

- **Log files**: Stored in `logs/` directory
- **PM2 logs**: Available via `pm2 logs` command
- **Process monitoring**: Use `pm2 monit` for real-time stats
- **Error tracking**: Each service has separate log files

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJ...` |
| `GEMINI_API_KEY` | Google Gemini AI API key | `AIza...` |
| `JWT_SECRET` | JWT signing secret | `random-64-char-string` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CORS_ORIGIN` | Production domain for CORS | `http://localhost:3000` |
| `NODE_ENV` | Node environment | `production` |
| `ACTIVITY_SERVER_PORT` | Activity server port | `3001` |

## Security Considerations

1. **Environment Variables**: Never commit `.env` file to version control
2. **JWT Secret**: Generate a cryptographically secure random string
3. **CORS**: Configure `CORS_ORIGIN` for your production domain
4. **Service Role Key**: Keep `SUPABASE_SERVICE_ROLE_KEY` secure (server-side only)

## Troubleshooting

### Common Issues

**PM2 not found:**
```bash
npm install -g pm2
```

**Port conflicts:**
```bash
# Check what's using the ports
netstat -tulpn | grep :3001
netstat -tulpn | grep :3002
netstat -tulpn | grep :5173

# Kill conflicting processes
kill -9 <PID>
```

**Environment variables not loading:**
```bash
# Check .env file exists and has correct format
cat .env

# Restart PM2 processes
pm2 restart all
```

**Build errors:**
```bash
# Clean build
rm -rf dist/
npm run build
```

## Production Checklist

- [ ] Environment variables configured
- [ ] Frontend built (`dist/` folder exists)
- [ ] PM2 installed globally
- [ ] Logs directory created
- [ ] Initial admin user created (if needed)
- [ ] Firewall configured for required ports
- [ ] Reverse proxy configured (nginx/apache)
- [ ] SSL certificate installed (for HTTPS)
- [ ] Domain DNS configured
- [ ] Database backups configured

## Support

For issues or questions:
1. Check PM2 logs: `pm2 logs`
2. Verify environment variables: `npm run check-env`
3. Check process status: `pm2 status`
4. Review application logs in `logs/` directory
