#!/bin/bash

# Production Stop Script for Excel Data Processor
# This script stops the PM2-managed application

echo "⏹️  Stopping Excel Data Processor..."

# Stop all PM2 processes
echo "🛑 Stopping all PM2 processes..."
pm2 stop all

# Delete all PM2 processes
echo "🗑️  Deleting all PM2 processes..."
pm2 delete all

echo ""
echo "✅ Application stopped successfully!"
echo ""
echo "📊 PM2 Status:"
pm2 status
echo ""
echo "🔄 To restart, run: ./scripts/start-production.sh"
echo "▶️  To start again, run: ./scripts/start-production.sh"
