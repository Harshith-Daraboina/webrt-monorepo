# 🚀 Deploy to Vercel - Complete Guide

## ⚠️ Important Architecture Note

**Vercel can ONLY deploy the Next.js frontend.**
**The signaling server MUST be deployed separately** to a platform that supports WebSocket connections.

---

## 📋 Deployment Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  Next.js App    │  ────▶  │ Signaling Server │  ────▶  │  MongoDB Atlas  │
│   (Vercel)      │         │  (Railway/etc)   │         │    (Cloud)      │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

---

## Part 1: Deploy Signaling Server First

You need to deploy the signaling server to a platform that supports WebSocket connections.

### Option A: Railway (Recommended - Easy)

1. **Sign up**: https://railway.app
2. **Install Railway CLI**:
   ```bash
   npm i -g @railway/cli
   railway login
   ```
3. **Deploy signaling server**:
   ```bash
   cd webrtc/apps/signaling
   railway init
   railway up
   ```
4. **Set environment variables in Railway dashboard**:
   ```
   DATABASE_URL=your-mongodb-url
   SIGNALING_PORT=3001
   SIGNALING_HOST=0.0.0.0
   NODE_ENV=production
   ```
5. **Note your Railway URL** (e.g., `https://your-app.railway.app`)

### Option B: Render

1. **Sign up**: https://render.com
2. **Create new Web Service**
3. **Settings**:
   - Root Directory: `apps/signaling`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
4. **Add environment variables** (same as Railway)
5. **Deploy**

### Option C: Fly.io

```bash
cd webrtc/apps/signaling
fly launch
fly deploy
```

---

## Part 2: Deploy Next.js App to Vercel

### Step 1: Prepare Your Code

Make sure your code is pushed to GitHub/GitLab/Bitbucket.

### Step 2: Deploy via Vercel Dashboard (Easiest)

1. **Go to**: https://vercel.com
2. **Sign up/Login** with GitHub
3. **Click "Add New Project"**
4. **Import your Git repository**
5. **Configure Project**:
   ```
   Framework Preset: Next.js
   Root Directory: webrtc/apps/web
   Build Command: cd ../.. && npm install && npm run build --workspace=web
   Output Directory: (leave default - .next)
   Install Command: cd ../.. && npm install
   ```
6. **Add Environment Variables**:
   ```
   NEXT_PUBLIC_SIGNALING_URL=https://your-signaling-server.railway.app
   NEXT_PUBLIC_STUN_SERVER=stun:stun.l.google.com:19302
   NEXT_PUBLIC_NETWORK_IP=your-network-ip (if needed)
   ```
7. **Click "Deploy"**

### Step 3: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login**:
   ```bash
   vercel login
   ```

3. **Navigate to web app**:
   ```bash
   cd webrtc/apps/web
   ```

4. **Deploy**:
   ```bash
   vercel
   ```

5. **Follow prompts**:
   - Set up and deploy? Yes
   - Which scope? (select your account)
   - Link to existing project? No
   - Project name: `webrtc-video-app`
   - Directory: `./`
   - Override settings? No

6. **Add environment variables**:
   ```bash
   vercel env add NEXT_PUBLIC_SIGNALING_URL production
   # Enter: https://your-signaling-server.railway.app
   
   vercel env add NEXT_PUBLIC_STUN_SERVER production
   # Enter: stun:stun.l.google.com:19302
   ```

7. **Redeploy with production env vars**:
   ```bash
   vercel --prod
   ```

---

## Part 3: Update CORS Settings

After deploying both services, update your signaling server's CORS to allow your Vercel domain.

**In `apps/signaling/src/index.ts`**, update:

```typescript
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      
      const allowedOrigins = [
        'https://your-app.vercel.app',  // Your Vercel URL
        'http://localhost:3000',        // For local dev
      ]
      
      if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
        callback(null, true)
      } else {
        logger.warn(`CORS blocked origin: ${origin}`)
        callback(new Error('Not allowed by CORS'))
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
```

**Then redeploy your signaling server**.

---

## Part 4: Environment Variables Checklist

### For Vercel (Next.js App):
✅ `NEXT_PUBLIC_SIGNALING_URL` - Your signaling server URL (e.g., `https://xxx.railway.app`)
✅ `NEXT_PUBLIC_STUN_SERVER` - `stun:stun.l.google.com:19302`
✅ `NEXT_PUBLIC_TURN_SERVER` - (Optional) Your TURN server
✅ `NEXT_PUBLIC_TURN_USERNAME` - (Optional)
✅ `NEXT_PUBLIC_TURN_PASSWORD` - (Optional)

### For Signaling Server (Railway/Render/etc):
✅ `DATABASE_URL` - MongoDB connection string
✅ `SIGNALING_PORT` - `3001` (or use platform's PORT)
✅ `SIGNALING_HOST` - `0.0.0.0`
✅ `SIGNALING_CORS_ORIGIN` - Your Vercel URL
✅ `NODE_ENV` - `production`

---

## Part 5: Production Build Setup

### Update Signaling Server for Production

Make sure `apps/signaling/package.json` has:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  }
}
```

### Build TypeScript before deploying:

The signaling server needs to compile TypeScript. Make sure:

1. **`tsconfig.json` exists** in `apps/signaling/`
2. **Build command** runs `npm run build`
3. **Start command** runs `npm start`

---

## Quick Deploy Commands

### Deploy Next.js to Vercel:
```bash
cd webrtc/apps/web
vercel --prod
```

### Deploy Signaling Server to Railway:
```bash
cd webrtc/apps/signaling
railway up
```

---

## Testing After Deployment

1. ✅ Open your Vercel URL
2. ✅ Check browser console for connection errors
3. ✅ Try creating a room
4. ✅ Test with multiple browser tabs
5. ✅ Check signaling server logs

---

## Troubleshooting

### Issue: "Connection timeout" after deployment
- ✅ Check `NEXT_PUBLIC_SIGNALING_URL` is correct
- ✅ Verify signaling server is running
- ✅ Check CORS allows your Vercel domain
- ✅ Test signaling server URL directly: `curl https://your-server.railway.app/health`

### Issue: Build fails on Vercel
- ✅ Check Root Directory is `webrtc/apps/web`
- ✅ Verify build command includes workspace setup
- ✅ Check package.json has all dependencies

### Issue: Environment variables not working
- ✅ Must start with `NEXT_PUBLIC_` for client-side access
- ✅ Redeploy after adding env vars
- ✅ Check variable names match exactly

### Issue: WebSocket connection fails
- ✅ Verify signaling server supports WebSocket (not just HTTP)
- ✅ Check platform allows WebSocket connections
- ✅ Railway and Render support WebSocket by default

---

## Cost Estimate

- **Vercel**: Free tier (Hobby plan) - Perfect for this!
- **Railway**: $5/month (Hobby) or Free tier with limits
- **Render**: Free tier available
- **Fly.io**: Free tier available

**Total**: Free to ~$5/month

---

## After Deployment

1. ✅ Test WebRTC connection between users
2. ✅ Test with different browsers
3. ✅ Monitor signaling server logs
4. ✅ Set up custom domain (optional)
5. ✅ Configure analytics (optional)

---

## Example URLs After Deployment

- **Frontend (Vercel)**: `https://webrtc-video-app.vercel.app`
- **Signaling Server (Railway)**: `https://webrtc-signaling.railway.app`
- **Health Check**: `https://webrtc-signaling.railway.app/health`

Good luck! 🚀

