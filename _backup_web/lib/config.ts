// WebRTC Configuration Helper
// Safely access environment variables in browser/client context

export const getConfig = () => {
  // Browser-safe environment variable access
  const getEnv = (key: string, defaultValue: string = ''): string => {
    if (typeof window === 'undefined') {
      // Server-side
      return process.env[key] || defaultValue
    }
    
    // Client-side: Check if Next.js injected env vars
    const value = process.env[key]
    return value || defaultValue
  }

  // Socket.IO uses http:// (not ws://) - it handles WebSocket upgrade internally
  let signalingUrl = getEnv('NEXT_PUBLIC_SIGNALING_URL', 'http://localhost:3001')
  
  // Auto-fix: Convert ws:// to http:// for Socket.IO
  if (signalingUrl.startsWith('ws://')) {
    console.warn('⚠️ Converting ws:// to http:// for Socket.IO')
    signalingUrl = signalingUrl.replace('ws://', 'http://')
  }
  if (signalingUrl.startsWith('wss://')) {
    console.warn('⚠️ Converting wss:// to https:// for Socket.IO')
    signalingUrl = signalingUrl.replace('wss://', 'https://')
  }

  return {
    signalingUrl,
    stunServer: getEnv('NEXT_PUBLIC_STUN_SERVER', 'stun:stun.l.google.com:19302'),
    turnServer: getEnv('NEXT_PUBLIC_TURN_SERVER', ''),
    turnUsername: getEnv('NEXT_PUBLIC_TURN_USERNAME', ''),
    turnPassword: getEnv('NEXT_PUBLIC_TURN_PASSWORD', ''),
  }
}

