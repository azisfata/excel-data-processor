#!/bin/bash

# Production Startup Script for Excel Data Processor
# This script sets up and starts the application using PM2

echo "🚀 Starting Excel Data Processor in Production Mode..."

# Check if .env file exists, if not copy from production template
if [ ! -f .env ]; then
    echo "📋 Creating .env file from template..."
    cp .env.production .env
    echo "⚠️  Please edit .env file with your actual configuration values!"
    echo "   Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"
    echo "   Required: GEMINI_API_KEY, JWT_SECRET"
    echo ""
    read -p "Press Enter after configuring .env file..."
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 globally..."
    npm install -g pm2
fi

# Stop any existing processes
echo "🛑 Stopping existing processes..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Start the application with PM2
echo "▶️  Starting application with PM2..."
pm2 start ecosystem.config.cjs

# Save PM2 configuration for auto-restart on server reboot
echo "💾 Saving PM2 configuration..."
pm2 save

# Enable PM2 startup script (runs on server boot)
echo "🔄 Enabling PM2 startup script..."
pm2 startup

echo ""
echo "✅ Application started successfully!"
echo ""
echo "📊 PM2 Status:"
pm2 status
echo ""
echo "🌐 Application URLs:"
echo "   Frontend: http://localhost:${FRONTEND_PORT:-5173}"
echo "   Auth API: http://localhost:${AUTH_SERVER_PORT:-3002}"
echo "   Activity API: http://localhost:${ACTIVITY_SERVER_PORT:-3001}"
echo "   WhatsApp Webhook: http://localhost:${WHATSAPP_SERVER_PORT:-3003}"
echo ""
echo "📝 Logs are available in the 'logs/' directory"
echo "🔧 Use 'pm2 logs' to view real-time logs"
echo "🔄 Use 'pm2 restart all' to restart all processes"
echo "⏹️  Use 'pm2 stop all' to stop all processes"
