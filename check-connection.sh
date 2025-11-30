#!/bin/bash
echo "=== WebRTC Connection Diagnostics ==="
echo ""

echo "1. Checking signaling server..."
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo "   ✅ Signaling server is responding on port 3001"
else
  echo "   ❌ Signaling server is NOT responding on port 3001"
  echo "      Run: cd signaling && npm run dev"
fi
echo ""

echo "2. Checking web app..."
if curl -s http://localhost:3000 | grep -q "WebRTC\|Next.js" > /dev/null 2>&1; then
  echo "   ✅ Web app is running on port 3000"
else
  echo "   ❌ Web app is NOT responding on port 3000"
  echo "      Run: cd web && npm run dev"
fi
echo ""

echo "3. Checking ports..."
echo "   Port 3001 (signaling): $(netstat -tuln 2>/dev/null | grep :3001 || ss -tuln 2>/dev/null | grep :3001 || echo 'Not listening')"
echo "   Port 3000 (web): $(netstat -tuln 2>/dev/null | grep :3000 || ss -tuln 2>/dev/null | grep :3000 || echo 'Not listening')"
echo ""

echo "4. Network IP check..."
if ping -c 1 10.0.5.43 > /dev/null 2>&1; then
  echo "   ✅ Network IP 10.0.5.43 is reachable"
else
  echo "   ⚠️  Network IP 10.0.5.43 is not reachable (might be normal if not on network)"
fi
echo ""

echo "=== Quick Fix Commands ==="
echo "Start signaling: cd webrtc/signaling && npm run dev"
echo "Start web app: cd webrtc/web && npm run dev"
