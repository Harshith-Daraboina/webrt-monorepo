# 🚀 Deployment Guide

## ⚠️ Important: Architecture for Deployment

**Vercel can ONLY deploy the Next.js frontend. The signaling server MUST be deployed separately.**

### Architecture:
1. **Next.js Web App** → Deploy to Vercel (Frontend)
2. **Signaling Server** → Deploy to Railway/Render/Fly.io (WebSocket server)
3. **Database** → Already using MongoDB Atlas (Cloud)

---

## Part 1: Deploy Signaling Server

The signaling server needs a platform that supports:
- Long-running processes
- WebSocket connections
- Persistent connections

### Option A: Railway (Recommended)

1. **Create Railway Account**: https://railway.app
2. **Create New Project**:
   ```bash
   cd webrtc/apps/signaling
   ```
3. **Install Railway CLI**:
   ```bash
   npm i -g @railway/cli
   railway login
   ```
4. **Initialize Railway**:
   ```bash
   railway init
   ```
5. **Set Environment Variables in Railway Dashboard**:
   ```
   DATABASE_URL=your-mongodb-url
   SIGNALING_PORT=3001
   SIGNALING_HOST=0.0.0.0
   SIGNALING_CORS_ORIGIN=https://your-vercel-app.vercel.app
   NODE_ENV=production
   ```
6. **Deploy**:
   ```bash
   railway up
   ```
7. **Get your Railway URL** (e.g., `https://your-app.railway.app`)

### Option B: Render

1. **Create Render Account**: https://render.com
2. **Create New Web Service**
3. **Connect your GitHub repo**
4. **Settings**:
   - Root Directory: `webrtc/apps/signaling`
   - Build Command: `npm install`
   - Start Command: `npm start` (add `"start": "node dist/index.js"` to package.json)
5. **Environment Variables**:
   - Same as Railway above
6. **Deploy**

### Option C: Fly.io

1. **Install Fly CLI**: `curl -L https://fly.io/install.sh | sh`
2. **Login**: `fly auth login`
3. **Create app**: `fly apps create your-signaling-server`
4. **Deploy**: `fly deploy`

---

## Part 2: Deploy Next.js App to Vercel

### Step 1: Prepare for Deployment

Create `vercel.json` in the `webrtc/apps/web` directory:

```json
{
  "buildCommand": "cd ../.. && npm run build --workspace=web",
  "outputDirectory": "apps/web/.next",
  "framework": "nextjs",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/"
    }
  ]
}
```

### Step 2: Update package.json for Production

Make sure your `apps/web/package.json` has:

```json
{
  "scripts": {
    "build": "next build",
    "start": "next start"
  }
}
```

### Step 3: Deploy to Vercel

#### Option A: Using Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
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
   - Link to existing project? No
   - Project name: `webrtc-video-app`
   - Directory: `./`
   - Override settings? No

6. **Set Environment Variables** (after first deploy):
   ```bash
   vercel env add NEXT_PUBLIC_SIGNALING_URL
   # Enter: https://your-signaling-server.railway.app (or your signaling URL)
   
   vercel env add NEXT_PUBLIC_NETWORK_IP
   # Enter: (leave empty or your server IP)
   
   vercel env add NEXT_PUBLIC_STUN_SERVER
   # Enter: stun:stun.l.google.com:19302
   ```

7. **Redeploy with env vars**:
   ```bash
   vercel --prod
   ```

#### Option B: Using Vercel Dashboard

1. **Go to**: https://vercel.com
2. **Import Git Repository**:
   - Connect your GitHub/GitLab/Bitbucket
   - Select your repository
3. **Configure Project**:
   - Root Directory: `webrtc/apps/web`
   - Framework Preset: Next.js
   - Build Command: `cd ../.. && npm install && npm run build --workspace=web`
   - Output Directory: `apps/web/.next`
4. **Add Environment Variables**:
   ```
   NEXT_PUBLIC_SIGNALING_URL=https://your-signaling-server.railway.app
   NEXT_PUBLIC_STUN_SERVER=stun:stun.l.google.com:19302
   ```
5. **Deploy**

---

## Part 3: Update Configuration

### Update Signaling Server CORS

After deploying both, update your signaling server's CORS to allow your Vercel domain:

```typescript
// In apps/signaling/src/index.ts
cors: {
  origin: [
    'https://your-app.vercel.app',
    'http://localhost:3000', // for local dev
  ],
}
```

### Update Next.js Config

Make sure `next.config.ts` exposes environment variables:

```typescript
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SIGNALING_URL: process.env.NEXT_PUBLIC_SIGNALING_URL,
    NEXT_PUBLIC_STUN_SERVER: process.env.NEXT_PUBLIC_STUN_SERVER,
  },
}
```

---

## Part 4: Production Build Setup

### Update Signaling Server package.json

Add production start script:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  }
}
```

### Create Railway/Render Configuration

For Railway, create `railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## Part 5: Environment Variables Checklist

### Vercel Environment Variables:
- ✅ `NEXT_PUBLIC_SIGNALING_URL` - Your signaling server URL
- ✅ `NEXT_PUBLIC_STUN_SERVER` - STUN server URL
- ✅ `NEXT_PUBLIC_TURN_SERVER` - (Optional) TURN server
- ✅ `NEXT_PUBLIC_TURN_USERNAME` - (Optional)
- ✅ `NEXT_PUBLIC_TURN_PASSWORD` - (Optional)

### Signaling Server Environment Variables:
- ✅ `DATABASE_URL` - MongoDB connection string
- ✅ `SIGNALING_PORT` - Port (usually 3001)
- ✅ `SIGNALING_HOST` - 0.0.0.0
- ✅ `SIGNALING_CORS_ORIGIN` - Your Vercel app URL
- ✅ `NODE_ENV` - production

---

## Quick Deploy Commands

### Deploy to Vercel:
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

## Troubleshooting

### Issue: WebSocket connection fails
- ✅ Check CORS settings on signaling server
- ✅ Verify signaling server URL is correct
- ✅ Check if signaling server is running

### Issue: Build fails on Vercel
- ✅ Check root directory is `webrtc/apps/web`
- ✅ Verify build command includes workspace setup
- ✅ Check all dependencies are in package.json

### Issue: Environment variables not working
- ✅ Variables must start with `NEXT_PUBLIC_` for client-side access
- ✅ Redeploy after adding env vars
- ✅ Check variable names match exactly

---

## Cost Estimate

- **Vercel**: Free tier (Hobby) - Perfect for this app
- **Railway**: $5/month for hobby plan
- **Render**: Free tier available (with limitations)
- **Fly.io**: Free tier available

**Total**: Free to ~$5/month

---

## Next Steps After Deployment

1. ✅ Test WebRTC connection
2. ✅ Test with multiple users
3. ✅ Monitor signaling server logs
4. ✅ Set up custom domain (optional)
5. ✅ Configure HTTPS (automatic on Vercel)

Good luck with your deployment! 🚀

