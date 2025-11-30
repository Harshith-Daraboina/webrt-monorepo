# WebRTC Video Conferencing

Simple, standalone WebRTC video conferencing application.

## 📁 Project Structure

```
webrtc/
├── signaling/     # Node.js signaling server (WebSocket)
└── web/          # Next.js frontend application
```

## 🚀 Quick Start

### 1. Start Signaling Server

```bash
cd signaling
npm install
npm run dev
```

Server runs on: `http://localhost:3001`

### 2. Start Web Application

```bash
cd web
npm install
npm run dev
```

App runs on: `http://localhost:3000`

## 📝 Environment Variables

### Signaling Server (`signaling/.env`)
```
DATABASE_URL=your-mongodb-url
SIGNALING_PORT=3001
SIGNALING_HOST=0.0.0.0
```

### Web App (`web/.env`)
```
NEXT_PUBLIC_SIGNALING_URL=http://localhost:3001
NEXT_PUBLIC_STUN_SERVER=stun:stun.l.google.com:19302
```

## 🎯 Features

- ✅ Multi-user video conferencing
- ✅ Real-time chat
- ✅ Screen sharing
- ✅ Camera/Microphone controls
- ✅ Participants panel
- ✅ Grid layout switching
- ✅ Network accessible

## 📦 Deployment

See `DEPLOY_VERCEL.md` for deployment instructions.

