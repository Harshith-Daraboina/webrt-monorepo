#!/bin/bash
# Script to kill processes on ports 3000, 3001, 3002

echo "Checking ports 3000, 3001, 3002..."

for port in 3000 3001 3002; do
    PID=$(lsof -ti :$port 2>/dev/null)
    if [ ! -z "$PID" ]; then
        echo "Port $port is in use by PID $PID"
        read -p "Kill process on port $port? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kill -9 $PID
            echo "✅ Killed process on port $port"
        fi
    else
        echo "✅ Port $port is free"
    fi
done

echo "Done!"
