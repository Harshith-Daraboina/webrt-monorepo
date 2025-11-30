# Video Not Visible Between Laptops - Debug Guide

## Issue: Video not showing on other laptop

### 1. Check Network Connectivity

Both laptops must be on the same network and able to reach each other.

**On Host Laptop (where servers run):**
```bash
# Check IP address
ip addr show | grep "inet " | grep -v 127.0.0.1

# Should show: 10.0.5.43 (or your network IP)
```

**On Other Laptop:**
- Try accessing: http://10.0.5.43:3000 (web app)
- Try accessing: http://10.0.5.43:3001 (signaling server - should show connection)

### 2. Check Browser Console

On both laptops, open browser console (F12) and check for:
- ✅ "Connected to signaling server"
- ✅ "Local stream received"
- ✅ "Remote stream received"
- ✅ "Received remote track"
- ❌ Any error messages

### 3. Check Video Stream Status

Look for these console messages:
- `📹 Local stream received` - Your camera is working
- `📹 Remote stream received from [userId]` - Other person's video received
- `📹 Received remote track` - Video tracks are coming through
- `✅ Video playing` - Videos are displaying

### 4. Common Issues

**Issue: "Connection timeout"**
- Signaling server not accessible
- Check firewall settings
- Verify server is running on 0.0.0.0:3001

**Issue: "No remote video"**
- WebRTC connection not established
- Check ICE connection state in console
- May need TURN server for NAT traversal

**Issue: "Black video screen"**
- Video tracks received but not playing
- Check autoplay restrictions
- Click on video to enable playback

### 5. Test Steps

1. **Host Laptop:**
   - Start signaling: `cd signaling && npm run dev`
   - Start web app: `cd web && npm run dev`
   - Join room, allow camera

2. **Other Laptop:**
   - Open: http://10.0.5.43:3000
   - Join same room ID
   - Allow camera
   - Check console for connection status

3. **Check Status:**
   - Both should show "✅ 2 participant(s) in room"
   - Both should see each other's videos
   - Green dots on active videos

