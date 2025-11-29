import { io, Socket } from 'socket.io-client'
import { getConfig } from './config'

interface RemotePeer {
  userId: string
  peerId: string
  socketId: string
  peerConnection: RTCPeerConnection
  stream: MediaStream | null
  isInitiator: boolean
}

export class MultiPeerWebRTCClient {
  private socket: Socket | null = null
  private localStream: MediaStream | null = null
  private remotePeers: Map<string, RemotePeer> = new Map()
  private roomId: string
  private userId: string
  private signalingUrl: string
  private config: ReturnType<typeof getConfig>
  private isNegotiating: Set<string> = new Set()

  // Callbacks
  private onLocalStreamCallback?: (stream: MediaStream) => void
  private onRemoteStreamCallback?: (userId: string, stream: MediaStream) => void
  private onRemoteStreamRemovedCallback?: (userId: string) => void
  private onUserJoinedCallback?: (userId: string) => void
  private onUserLeftCallback?: (userId: string) => void
  private onErrorCallback?: (error: string) => void
  private onMessageCallback?: (userId: string, message: string, timestamp: Date) => void

  constructor(roomId: string, userId: string, signalingUrl?: string) {
    this.roomId = roomId
    this.userId = userId
    this.config = getConfig()
    this.signalingUrl = signalingUrl || this.config.signalingUrl
  }

  // Event handlers
  onLocalStream(callback: (stream: MediaStream) => void) {
    this.onLocalStreamCallback = callback
  }

  onRemoteStream(callback: (userId: string, stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback
  }

  onRemoteStreamRemoved(callback: (userId: string) => void) {
    this.onRemoteStreamRemovedCallback = callback
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

  onMessage(callback: (userId: string, message: string, timestamp: Date) => void) {
    this.onMessageCallback = callback
  }

  // Get RTC configuration
  private getRTCConfiguration(): RTCConfiguration {
    const iceServers: RTCIceServer[] = []
    const config = getConfig()

    iceServers.push({ urls: 'stun:stun.l.google.com:19302' })
    iceServers.push({ urls: 'stun:stun1.l.google.com:19302' })

    if (config.stunServer && config.stunServer.trim() !== '' && !config.stunServer.includes('stun.l.google.com')) {
      iceServers.push({ urls: config.stunServer })
    }

    if (config.turnServer && config.turnServer.trim() !== '') {
      const turnConfig: RTCIceServer = { urls: config.turnServer }
      if (config.turnUsername && config.turnUsername.trim() !== '') {
        turnConfig.username = config.turnUsername
      }
      if (config.turnPassword && config.turnPassword.trim() !== '') {
        turnConfig.credential = config.turnPassword
      }
      iceServers.push(turnConfig)
    }

    return { iceServers }
  }

  // Initialize connection
  async initialize() {
    try {
      console.log('🚀 Starting multi-peer WebRTC initialization...')
      
      // Step 1: Get user media
      await this.getUserMedia()
      
      // Step 2: Connect to signaling server
      await this.connectToSignaling()
      
      console.log('✅ Multi-peer WebRTC initialization complete')
    } catch (error: any) {
      console.error('❌ Error initializing WebRTC:', error)
      this.onErrorCallback?.(`Failed to initialize: ${error.message || error}`)
      throw error
    }
  }

  // Get user media
  async getUserMedia() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser')
      }

      console.log('📹 Requesting camera and microphone...')
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true },
      })

      this.localStream = stream
      this.onLocalStreamCallback?.(stream)
      console.log('✅ Camera and microphone access granted')
      
      return stream
    } catch (error: any) {
      const errorMessage = error.name === 'NotAllowedError' 
        ? 'Camera/microphone permission denied. Please allow access.'
        : error.message || 'Failed to access camera/microphone'
      this.onErrorCallback?.(errorMessage)
      throw new Error(errorMessage)
    }
  }

  // Connect to signaling server
  private async connectToSignaling() {
    return new Promise<void>((resolve, reject) => {
      console.log(`🔌 Connecting to signaling server: ${this.signalingUrl}`)
      
      this.socket = io(this.signalingUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      })

      this.setupSocketListeners()

      if (this.socket.connected) {
        console.log('✅ Socket already connected')
        this.joinRoom()
        resolve()
        return
      }

      const connectHandler = () => {
        console.log('✅ Socket connected')
        this.joinRoom()
        resolve()
      }

      const errorHandler = (error: Error) => {
        console.error('❌ Socket connection error:', error)
        reject(new Error(`Failed to connect: ${error.message}`))
      }

      this.socket.on('connect', connectHandler)
      this.socket.on('connect_error', errorHandler)

      setTimeout(() => {
        this.socket?.off('connect', connectHandler)
        this.socket?.off('connect_error', errorHandler)
        reject(new Error('Connection timeout - Is signaling server running?'))
      }, 10000)
    })
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

    this.socket.on('room-joined', async (data: { users: Array<{ userId: string; peerId: string; socketId: string }> }) => {
      console.log('🏠 Joined room, existing users:', data.users)
      
      // Create peer connections for existing users
      for (const user of data.users) {
        if (user.userId !== this.userId) {
          await this.createPeerConnection(user.userId, user.peerId, user.socketId, true)
        }
      }
    })

    this.socket.on('user-joined', async (data: { userId: string; peerId: string; socketId: string }) => {
      console.log('👤 User joined:', data.userId)
      this.onUserJoinedCallback?.(data.userId)
      
      // Create peer connection for new user
      await this.createPeerConnection(data.userId, data.peerId, data.socketId, true)
    })

    this.socket.on('user-left', (data: { userId: string }) => {
      console.log('👋 User left:', data.userId)
      this.removePeerConnection(data.userId)
      this.onUserLeftCallback?.(data.userId)
    })

    this.socket.on('offer', async (data: { offer: RTCSessionDescriptionInit; from: string; targetPeerId?: string }) => {
      console.log('📥 Received offer from:', data.from)
      const peer = this.remotePeers.get(data.from)
      if (peer) {
        await this.handleOffer(peer, data.offer)
      }
    })

    this.socket.on('answer', async (data: { answer: RTCSessionDescriptionInit; from: string; targetPeerId?: string }) => {
      console.log('📥 Received answer from:', data.from)
      const peer = this.remotePeers.get(data.from)
      if (peer) {
        await this.handleAnswer(peer, data.answer)
      }
    })

    this.socket.on('ice-candidate', async (data: { candidate: RTCIceCandidateInit; from: string }) => {
      const peer = this.remotePeers.get(data.from)
      if (peer && data.candidate) {
        try {
          await peer.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
        } catch (error) {
          console.warn('Failed to add ICE candidate:', error)
        }
      }
    })

    this.socket.on('new-message', (data: { userId: string; content: string; createdAt: string | Date }) => {
      const timestamp = typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt
      this.onMessageCallback?.(data.userId, data.content, timestamp)
    })

    this.socket.on('error', (error: { message: string }) => {
      console.error('❌ Signaling error:', error)
      this.onErrorCallback?.(error.message)
    })
  }

  // Create peer connection for a remote user
  private async createPeerConnection(userId: string, peerId: string, socketId: string, isInitiator: boolean) {
    // Don't create if already exists
    if (this.remotePeers.has(socketId)) {
      console.log('Peer connection already exists for:', socketId)
      return
    }

    console.log(`🔗 Creating peer connection for ${userId} (initiator: ${isInitiator})`)
    
    const peerConnection = new RTCPeerConnection(this.getRTCConfiguration())
    
    // Add local tracks if available
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream!)
      })
    }

    // Handle remote track
    peerConnection.ontrack = (event) => {
      console.log(`📹 Received remote track from ${userId}:`, event.track.kind)
      const remotePeer = this.remotePeers.get(socketId)
      if (remotePeer && event.streams && event.streams[0]) {
        remotePeer.stream = event.streams[0]
        this.onRemoteStreamCallback?.(userId, event.streams[0])
      }
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('ice-candidate', {
          roomId: this.roomId,
          candidate: event.candidate.toJSON(),
          targetPeerId: peerId,
        })
      }
    }

    // Handle connection state
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔌 Connection state for ${userId}:`, peerConnection.connectionState)
      if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
        const peer = this.remotePeers.get(socketId)
        if (peer && peer.stream) {
          this.onRemoteStreamRemovedCallback?.(userId)
        }
      }
    }

    // Store peer
    const peer: RemotePeer = {
      userId,
      peerId,
      socketId,
      peerConnection,
      stream: null,
      isInitiator,
    }
    
    this.remotePeers.set(socketId, peer)

    // Create offer if we're the initiator
    if (isInitiator) {
      await this.createOffer(peer)
    }
  }

  // Create offer
  private async createOffer(peer: RemotePeer) {
    if (this.isNegotiating.has(peer.socketId)) {
      console.log('Already negotiating with:', peer.userId)
      return
    }

    try {
      this.isNegotiating.add(peer.socketId)
      
      // Check connection state
      if (peer.peerConnection.signalingState === 'stable' && 
          peer.peerConnection.iceConnectionState === 'new') {
        // Safe to create offer
        const offer = await peer.peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
        
        await peer.peerConnection.setLocalDescription(offer)

        if (this.socket) {
          this.socket.emit('offer', {
            roomId: this.roomId,
            offer: offer,
            targetPeerId: peer.peerId,
          })
          console.log(`📤 Sent offer to ${peer.userId}`)
        }
      }
    } catch (error) {
      console.error(`Error creating offer for ${peer.userId}:`, error)
    } finally {
      this.isNegotiating.delete(peer.socketId)
    }
  }

  // Handle offer
  private async handleOffer(peer: RemotePeer, offer: RTCSessionDescriptionInit) {
    if (this.isNegotiating.has(peer.socketId)) {
      console.log('Already handling offer from:', peer.userId)
      return
    }

    try {
      this.isNegotiating.add(peer.socketId)

      // Check if we can set remote description
      const currentState = peer.peerConnection.signalingState
      
      if (currentState === 'stable' || currentState === 'have-local-offer') {
        await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        
        const answer = await peer.peerConnection.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
        
        await peer.peerConnection.setLocalDescription(answer)

        if (this.socket) {
          this.socket.emit('answer', {
            roomId: this.roomId,
            answer: answer,
            targetPeerId: peer.peerId,
          })
          console.log(`📤 Sent answer to ${peer.userId}`)
        }
      } else {
        console.warn(`Cannot handle offer from ${peer.userId}, signaling state: ${currentState}`)
      }
    } catch (error) {
      console.error(`Error handling offer from ${peer.userId}:`, error)
      // Try to recover by recreating the connection
      this.onErrorCallback?.(`Connection error with ${peer.userId}: ${error}`)
    } finally {
      this.isNegotiating.delete(peer.socketId)
    }
  }

  // Handle answer
  private async handleAnswer(peer: RemotePeer, answer: RTCSessionDescriptionInit) {
    try {
      const currentState = peer.peerConnection.signalingState
      
      if (currentState === 'have-local-offer') {
        await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
        console.log(`✅ Set remote description from ${peer.userId}`)
      } else {
        console.warn(`Cannot handle answer from ${peer.userId}, signaling state: ${currentState}`)
      }
    } catch (error: any) {
      console.error(`Error handling answer from ${peer.userId}:`, error)
      // Don't throw - log and continue
      if (error.message?.includes('stable')) {
        console.log('Connection already established with:', peer.userId)
      } else {
        this.onErrorCallback?.(`Error handling answer: ${error.message}`)
      }
    }
  }

  // Join room
  private joinRoom() {
    if (!this.socket) return
    console.log(`🚪 Joining room: ${this.roomId}`)
    this.socket.emit('join-room', {
      roomId: this.roomId,
      userId: this.userId,
    })
  }

  // Send chat message
  sendMessage(message: string) {
    if (!this.socket) return
    this.socket.emit('send-message', {
      roomId: this.roomId,
      userId: this.userId,
      content: message,
    })
  }

  // Remove peer connection
  private removePeerConnection(userId: string) {
    const peer = Array.from(this.remotePeers.values()).find(p => p.userId === userId)
    if (peer) {
      peer.peerConnection.close()
      if (peer.stream) {
        peer.stream.getTracks().forEach(track => track.stop())
      }
      this.remotePeers.delete(peer.socketId)
      console.log(`🗑️ Removed peer connection for ${userId}`)
    }
  }

  // Toggle camera
  toggleCamera(): boolean {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        
        // Update all peer connections
        this.remotePeers.forEach(peer => {
          const sender = peer.peerConnection.getSenders().find(s => s.track?.kind === 'video')
          if (sender && sender.track) {
            sender.track.enabled = videoTrack.enabled
          }
        })
        
        return videoTrack.enabled
      }
    }
    return false
  }

  // Toggle microphone
  toggleMicrophone(): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        
        // Update all peer connections
        this.remotePeers.forEach(peer => {
          const sender = peer.peerConnection.getSenders().find(s => s.track?.kind === 'audio')
          if (sender && sender.track) {
            sender.track.enabled = audioTrack.enabled
          }
        })
        
        return audioTrack.enabled
      }
    }
    return false
  }

  // Share screen
  async shareScreen(): Promise<void> {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const videoTrack = screenStream.getVideoTracks()[0]

      // Replace video track in all peer connections
      this.remotePeers.forEach(peer => {
        const sender = peer.peerConnection.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          sender.replaceTrack(videoTrack)
        }
      })

      // Update local stream
      if (this.localStream) {
        const oldVideoTrack = this.localStream.getVideoTracks()[0]
        if (oldVideoTrack) {
          this.localStream.removeTrack(oldVideoTrack)
          oldVideoTrack.stop()
        }
        this.localStream.addTrack(videoTrack)
        this.onLocalStreamCallback?.(this.localStream)
      }

      videoTrack.onended = () => {
        this.stopScreenShare()
      }
    } catch (error) {
      console.error('Error sharing screen:', error)
      throw error
    }
  }

  // Stop screen share
  private async stopScreenShare() {
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      const cameraVideoTrack = cameraStream.getVideoTracks()[0]

      // Replace screen track with camera track
      this.remotePeers.forEach(peer => {
        const sender = peer.peerConnection.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          sender.replaceTrack(cameraVideoTrack)
        }
      })

      // Update local stream
      if (this.localStream) {
        const oldVideoTrack = this.localStream.getVideoTracks().find(t => t.kind === 'video')
        if (oldVideoTrack) {
          this.localStream.removeTrack(oldVideoTrack)
          oldVideoTrack.stop()
        }
        this.localStream.addTrack(cameraVideoTrack)
        this.onLocalStreamCallback?.(this.localStream)
      }
    } catch (error) {
      console.error('Error stopping screen share:', error)
    }
  }

  // Disconnect
  disconnect() {
    // Close all peer connections
    this.remotePeers.forEach(peer => {
      peer.peerConnection.close()
      if (peer.stream) {
        peer.stream.getTracks().forEach(track => track.stop())
      }
    })
    this.remotePeers.clear()

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
    }

    // Leave room and disconnect socket
    if (this.socket) {
      this.socket.emit('leave-room', {
        roomId: this.roomId,
        userId: this.userId,
      })
      this.socket.disconnect()
      this.socket = null
    }

    console.log('🔌 Disconnected from all peers')
  }

  // Get all connected user IDs
  getConnectedUsers(): string[] {
    return Array.from(this.remotePeers.values())
      .filter(peer => peer.peerConnection.connectionState === 'connected')
      .map(peer => peer.userId)
  }
}

