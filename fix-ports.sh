#!/bin/bash
# Script to fix port conflicts and start services on correct ports

echo "🔍 Checking ports 3000, 3001..."

# Function to kill process on port
kill_port() {
    local port=$1
    local pid=$(lsof -ti :$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo "⚠️  Port $port is in use by PID $pid"
        echo "   Killing process..."
        kill -9 $pid 2>/dev/null
        sleep 1
        echo "✅ Port $port is now free"
    else
        echo "✅ Port $port is free"
    fi
}

# Kill processes on ports
kill_port 3000
kill_port 3001

echo ""
echo "🚀 Ports are ready!"
echo ""
echo "Now start your services:"
echo "  Terminal 1: cd apps/signaling && npm run dev"
echo "  Terminal 2: cd apps/web && npm run dev"
echo ""


