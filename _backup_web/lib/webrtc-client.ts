import { io, Socket } from 'socket.io-client'
import { getConfig } from './config'

export class WebRTCClient {
  private socket: Socket | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private peerConnection: RTCPeerConnection | null = null
  private roomId: string
  private userId: string
  private signalingUrl: string
  private config: ReturnType<typeof getConfig>

  // STUN/TURN servers configuration - built dynamically to avoid empty URLs
  private getRTCConfiguration(): RTCConfiguration {
    const iceServers: RTCIceServer[] = []
    const config = getConfig()

    // Always add Google's public STUN servers (works without configuration)
    iceServers.push({ urls: 'stun:stun.l.google.com:19302' })
    iceServers.push({ urls: 'stun:stun1.l.google.com:19302' })

    // Add custom STUN server if provided and different from default
    if (config.stunServer && 
        config.stunServer.trim() !== '' && 
        !config.stunServer.includes('stun.l.google.com')) {
      iceServers.push({ urls: config.stunServer })
    }

    // Add TURN server only if URL is provided and valid (not empty)
    if (config.turnServer && config.turnServer.trim() !== '') {
      const turnConfig: RTCIceServer = {
        urls: config.turnServer,
      }

      // Add credentials only if provided
      if (config.turnUsername && config.turnUsername.trim() !== '') {
        turnConfig.username = config.turnUsername
      }
      if (config.turnPassword && config.turnPassword.trim() !== '') {
        turnConfig.credential = config.turnPassword
      }

      iceServers.push(turnConfig)
    }

    console.log('🔧 ICE Servers configured:', iceServers.map(s => ({ urls: s.urls })))
    return { iceServers }
  }

  // Callbacks
  private onLocalStreamCallback?: (stream: MediaStream) => void
  private onRemoteStreamCallback?: (stream: MediaStream) => void
  private onUserJoinedCallback?: (userId: string) => void
  private onUserLeftCallback?: (userId: string) => void
  private onErrorCallback?: (error: string) => void

  constructor(roomId: string, userId: string, signalingUrl?: string) {
    this.roomId = roomId
    this.userId = userId
    this.config = getConfig()
    this.signalingUrl = signalingUrl || this.config.signalingUrl
  }

  // Initialize connection
  async initialize() {
    try {
      console.log('🚀 Starting WebRTC initialization...')
      
      // Step 1: Get user media FIRST (so user sees camera immediately)
      console.log('📹 Requesting camera/microphone access...')
      await this.getUserMedia()
      console.log('✅ Camera/microphone access granted')

      // Step 2: Create peer connection (needed before socket connection)
      this.createPeerConnection()
      console.log('✅ Peer connection created')

      // Step 3: Connect to signaling server
      console.log(`🔌 Connecting to signaling server: ${this.signalingUrl}`)
      this.socket = io(this.signalingUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      })

      // Setup socket event listeners FIRST
      this.setupSocketListeners()

      // Wait for socket connection
      await new Promise<void>((resolve, reject) => {
        if (!this.socket) {
          reject(new Error('Socket not initialized'))
          return
        }

        if (this.socket.connected) {
          console.log('✅ Socket already connected')
          resolve()
          return
        }

        const connectHandler = () => {
          console.log('✅ Socket connected, proceeding with room join')
          resolve()
        }

        const errorHandler = (error: Error) => {
          console.error('❌ Socket connection error:', error)
          reject(new Error(`Failed to connect to signaling server: ${error.message}`))
        }

        this.socket.on('connect', connectHandler)
        this.socket.on('connect_error', errorHandler)

        // Timeout after 10 seconds
        const timeoutId = setTimeout(() => {
          this.socket?.off('connect', connectHandler)
          this.socket?.off('connect_error', errorHandler)
          reject(new Error('Connection timeout - Is signaling server running on port 3001?'))
        }, 10000)

        // Clean up on success
        this.socket.once('connect', () => {
          clearTimeout(timeoutId)
        })
      })

      // Step 4: Join the room (now that socket is connected)
      console.log(`🏠 Joining room: ${this.roomId}`)
      this.joinRoom()
      
      console.log('✅ WebRTC initialization complete')
    } catch (error: any) {
      console.error('❌ Error initializing WebRTC:', error)
      const errorMessage = error?.message || String(error)
      this.onErrorCallback?.(`Failed to initialize: ${errorMessage}`)
      throw error
    }
  }

  // Get user media (camera and microphone)
  async getUserMedia() {
    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Edge.')
      }

      console.log('📹 Requesting camera and microphone permissions...')
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user', // Front-facing camera
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      console.log('✅ Camera and microphone access granted')
      console.log('📹 Stream tracks:', stream.getTracks().map(t => `${t.kind}:${t.label}`))

      this.localStream = stream
      
      // Immediately show the stream to user
      this.onLocalStreamCallback?.(stream)

      // Add tracks to peer connection (if it exists, otherwise will be added later)
      if (this.peerConnection && this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          if (this.peerConnection && this.localStream) {
            this.peerConnection.addTrack(track, this.localStream)
            console.log(`✅ Added ${track.kind} track to peer connection`)
          }
        })
      } else {
        console.log('⚠️ Peer connection not ready yet, tracks will be added after connection')
      }

      return stream
    } catch (error: any) {
      console.error('❌ Error getting user media:', error)
      
      let errorMessage = 'Failed to access camera/microphone'
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Camera/microphone permission denied. Please allow access in your browser settings.'
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = 'No camera/microphone found. Please connect a camera and microphone.'
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = 'Camera/microphone is being used by another application. Please close other apps using your camera.'
      } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        errorMessage = 'Camera settings not supported. Trying with basic settings...'
        // Try again with basic settings
        try {
          const basicStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          this.localStream = basicStream
          this.onLocalStreamCallback?.(basicStream)
          return basicStream
        } catch (retryError) {
          errorMessage = 'Camera access failed even with basic settings.'
        }
      } else {
        errorMessage = `Camera/microphone error: ${error.message || error.name || 'Unknown error'}`
      }
      
      this.onErrorCallback?.(errorMessage)
      throw new Error(errorMessage)
    }
  }

  // Create RTCPeerConnection
  private createPeerConnection() {
    const config = this.getRTCConfiguration()
    console.log('🔧 RTC Configuration:', config)
    this.peerConnection = new RTCPeerConnection(config)

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('📹 Received remote track:', event.track.kind)
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0]
        this.onRemoteStreamCallback?.(event.streams[0])
      }
    }

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        console.log('🧊 Sending ICE candidate')
        this.socket.emit('ice-candidate', {
          roomId: this.roomId,
          candidate: event.candidate.toJSON(),
        })
      }
    }

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log('🔌 Connection state:', this.peerConnection?.connectionState)
      if (this.peerConnection?.connectionState === 'failed') {
        this.onErrorCallback?.('Peer connection failed')
      }
    }

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('🧊 ICE connection state:', this.peerConnection?.iceConnectionState)
    }
  }

  // Setup socket event listeners
  private setupSocketListeners() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('✅ Connected to signaling server')
    })

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from signaling server')
    })

    this.socket.on('room-joined', async (data: { users: Array<{ userId: string; peerId: string }> }) => {
      console.log('🏠 Joined room, users:', data.users)
      // Create offer if there are other users
      if (data.users.length > 0) {
        await this.createOffer()
      }
    })

    this.socket.on('user-joined', async (data: { userId: string; peerId: string }) => {
      console.log('👤 User joined:', data.userId)
      this.onUserJoinedCallback?.(data.userId)
      // Create offer for the new user
      await this.createOffer()
    })

    this.socket.on('user-left', (data: { userId: string }) => {
      console.log('👋 User left:', data.userId)
      this.onUserLeftCallback?.(data.userId)
    })

    this.socket.on('offer', async (data: { offer: RTCSessionDescriptionInit }) => {
      console.log('📥 Received offer')
      await this.handleOffer(data.offer)
    })

    this.socket.on('answer', async (data: { answer: RTCSessionDescriptionInit }) => {
      console.log('📥 Received answer')
      await this.handleAnswer(data.answer)
    })

    this.socket.on('ice-candidate', async (data: { candidate: RTCIceCandidateInit }) => {
      console.log('🧊 Received ICE candidate')
      await this.handleIceCandidate(data.candidate)
    })

    this.socket.on('error', (error: { message: string }) => {
      console.error('❌ Signaling error:', error)
      this.onErrorCallback?.(error.message)
    })
  }

  // Join room
  private joinRoom() {
    if (!this.socket) return

    console.log('🚪 Joining room:', this.roomId)
    this.socket.emit('join-room', {
      roomId: this.roomId,
      userId: this.userId,
    })
  }

  // Create offer
  private async createOffer() {
    if (!this.peerConnection) return

    try {
      const offer = await this.peerConnection.createOffer()
      await this.peerConnection.setLocalDescription(offer)

      if (this.socket) {
        console.log('📤 Sending offer')
        this.socket.emit('offer', {
          roomId: this.roomId,
          offer: offer,
        })
      }
    } catch (error) {
      console.error('Error creating offer:', error)
      this.onErrorCallback?.(`Failed to create offer: ${error}`)
    }
  }

  // Handle offer
  private async handleOffer(offer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await this.peerConnection.createAnswer()
      await this.peerConnection.setLocalDescription(answer)

      if (this.socket) {
        console.log('📤 Sending answer')
        this.socket.emit('answer', {
          roomId: this.roomId,
          answer: answer,
        })
      }
    } catch (error) {
      console.error('Error handling offer:', error)
      this.onErrorCallback?.(`Failed to handle offer: ${error}`)
    }
  }

  // Handle answer
  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
    } catch (error) {
      console.error('Error handling answer:', error)
      this.onErrorCallback?.(`Failed to handle answer: ${error}`)
    }
  }

  // Handle ICE candidate
  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peerConnection) return

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      console.error('Error handling ICE candidate:', error)
    }
  }

  // Toggle camera
  toggleCamera() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        return videoTrack.enabled
      }
    }
    return false
  }

  // Toggle microphone
  toggleMicrophone() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        return audioTrack.enabled
      }
    }
    return false
  }

  // Share screen
  async shareScreen() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })

      // Replace video track
      if (this.peerConnection && this.localStream) {
        const videoTrack = screenStream.getVideoTracks()[0]
        const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === 'video')
        if (sender && videoTrack) {
          await sender.replaceTrack(videoTrack)
        }
      }

      // Handle screen share stop
      screenStream.getVideoTracks()[0].onended = () => {
        this.getUserMedia() // Restore camera
      }

      return screenStream
    } catch (error) {
      console.error('Error sharing screen:', error)
      this.onErrorCallback?.(`Failed to share screen: ${error}`)
      throw error
    }
  }

  // Event callbacks
  onLocalStream(callback: (stream: MediaStream) => void) {
    this.onLocalStreamCallback = callback
  }

  onRemoteStream(callback: (stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback
  }

  onUserJoined(callback: (userId: string) => void) {
    this.onUserJoinedCallback = callback
  }

  onUserLeft(callback: (userId: string) => void) {
    this.onUserLeftCallback = callback
  }

  onError(callback: (error: string) => void) {
    this.onErrorCallback = callback
  }

  // Cleanup
  async disconnect() {
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
      this.localStream = null
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }

    // Disconnect socket
    if (this.socket) {
      this.socket.emit('leave-room', {
        roomId: this.roomId,
        userId: this.userId,
      })
      this.socket.disconnect()
      this.socket = null
    }

    console.log('🧹 Cleaned up WebRTC connection')
  }
}


