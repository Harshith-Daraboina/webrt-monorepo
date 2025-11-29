import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import logger from './utils/logger';

dotenv.config();

// WebRTC type definitions for Node.js (these are browser types, so we define them here)
interface RTCSessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

interface RTCIceCandidateInit {
  candidate?: string;
  sdpMLineIndex?: number | null;
  sdpMid?: string | null;
  usernameFragment?: string | null;
}

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

// In-memory room tracking (works without database)
const roomMembers = new Map<string, Map<string, { userId: string; socketId: string; peerId: string }>>();

// CORS: Allow localhost and network IP
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true)
      
      // Allow localhost and network IP
      if (
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('http://10.0.5.43')
      ) {
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
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Join a room
  socket.on('join-room', async (data: { roomId: string; userId: string }) => {
    try {
      const { roomId, userId } = data;
      
      logger.info(`User ${userId} attempting to join room ${roomId}`);

      // Initialize room if it doesn't exist in memory
      if (!roomMembers.has(roomId)) {
        roomMembers.set(roomId, new Map());
        logger.info(`Created new room in memory: ${roomId}`);
      }

      const roomUsers = roomMembers.get(roomId)!;
      
      // Check room capacity (max 10 users)
      if (roomUsers.size >= 10) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      // Generate peer ID
      const peerId = uuidv4();

      // Join socket room
      socket.join(roomId);

      // Store user in memory
      roomUsers.set(socket.id, {
        userId,
        socketId: socket.id,
        peerId,
      });

      // Try to save to database (optional - don't fail if it doesn't work)
      try {
        // Try to create room if it doesn't exist
        await prisma.room.upsert({
          where: { id: roomId },
          update: {},
          create: {
            id: roomId,
            name: `Room ${roomId}`,
            createdBy: userId,
            maxParticipants: 10,
            status: 'ACTIVE',
          },
        });

        // Try to create/update session
        await prisma.session.upsert({
          where: {
            id: `${userId}-${roomId}`,
          },
          update: {
            socketId: socket.id,
            peerId,
            status: 'CONNECTED',
            joinedAt: new Date(),
          },
          create: {
            userId,
            roomId,
            socketId: socket.id,
            peerId,
            status: 'CONNECTED',
          },
        }).catch(() => {
          // Ignore database errors - in-memory tracking is enough
        });
      } catch (dbError) {
        logger.warn('Database operation failed, using in-memory only:', dbError);
        // Continue without database - use in-memory tracking
      }

      // Get all other users in the room (from memory)
      const otherUsers = Array.from(roomUsers.values())
        .filter(u => u.socketId !== socket.id)
        .map(u => ({
          userId: u.userId,
          peerId: u.peerId,
          socketId: u.socketId,
        }));

      // Notify others in the room about new user
      socket.to(roomId).emit('user-joined', {
        userId,
        peerId,
        socketId: socket.id,
      });

      // Send room info to the joining user (other users only)
      socket.emit('room-joined', {
        roomId,
        users: otherUsers,
      });

      logger.info(`User ${userId} joined room ${roomId}. Total users: ${roomUsers.size}`);
    } catch (error) {
      logger.error('Error joining room:', error);
      socket.emit('error', { message: `Failed to join room: ${error}` });
    }
  });

  // Handle WebRTC signaling - broadcast to all in room
  socket.on('offer', (data: { roomId: string; offer: RTCSessionDescriptionInit; targetPeerId?: string }) => {
    logger.info(`📤 Offer from ${socket.id} in room ${data.roomId}`);
    socket.to(data.roomId).emit('offer', {
      offer: data.offer,
      from: socket.id,
      targetPeerId: data.targetPeerId,
    });
  });

  socket.on('answer', (data: { roomId: string; answer: RTCSessionDescriptionInit; targetPeerId?: string }) => {
    logger.info(`📤 Answer from ${socket.id} in room ${data.roomId}`);
    socket.to(data.roomId).emit('answer', {
      answer: data.answer,
      from: socket.id,
      targetPeerId: data.targetPeerId,
    });
  });

  socket.on('ice-candidate', (data: { roomId: string; candidate: RTCIceCandidateInit; targetPeerId?: string }) => {
    socket.to(data.roomId).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id,
      targetPeerId: data.targetPeerId,
    });
  });

  // Handle chat messages
  socket.on('send-message', async (data: { roomId: string; userId: string; content: string }) => {
    try {
      // Try to save message to database (optional)
      try {
        const message = await prisma.message.create({
          data: {
            userId: data.userId,
            roomId: data.roomId,
            content: data.content,
            type: 'TEXT',
          },
          include: { user: true },
        });

        io.to(data.roomId).emit('new-message', message);
      } catch (dbError) {
        // If database fails, still broadcast the message
        io.to(data.roomId).emit('new-message', {
          userId: data.userId,
          roomId: data.roomId,
          content: data.content,
          type: 'TEXT',
          createdAt: new Date(),
        });
      }
    } catch (error) {
      logger.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Leave room
  socket.on('leave-room', async (data: { roomId: string; userId: string }) => {
    try {
      const { roomId, userId } = data;
      
      socket.leave(roomId);

      // Remove from memory
      const roomUsers = roomMembers.get(roomId);
      if (roomUsers) {
        roomUsers.delete(socket.id);
        logger.info(`Removed user from room ${roomId}. Remaining: ${roomUsers.size}`);
        
        // Clean up empty rooms
        if (roomUsers.size === 0) {
          roomMembers.delete(roomId);
          logger.info(`Deleted empty room: ${roomId}`);
        }
      }

      // Try to update database (optional)
      try {
        await prisma.session.updateMany({
          where: {
            userId,
            roomId,
          },
          data: {
            status: 'DISCONNECTED',
            leftAt: new Date(),
          },
        });
      } catch (dbError) {
        // Ignore database errors
      }

      socket.to(roomId).emit('user-left', {
        userId,
        socketId: socket.id,
      });

      logger.info(`User ${userId} left room ${roomId}`);
    } catch (error) {
      logger.error('Error leaving room:', error);
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    try {
      // Remove from all rooms in memory
      for (const [roomId, users] of roomMembers.entries()) {
        if (users.has(socket.id)) {
          const user = users.get(socket.id);
          users.delete(socket.id);
          
          // Notify others in the room
          socket.to(roomId).emit('user-left', {
            userId: user?.userId || 'unknown',
            socketId: socket.id,
          });

          // Clean up empty rooms
          if (users.size === 0) {
            roomMembers.delete(roomId);
          }

          logger.info(`User ${user?.userId} left room ${roomId} on disconnect`);
        }
      }

      // Try to update database (optional)
      try {
        await prisma.session.updateMany({
          where: {
            socketId: socket.id,
            status: 'CONNECTED',
          },
          data: {
            status: 'DISCONNECTED',
            leftAt: new Date(),
          },
        });
      } catch (dbError) {
        // Ignore database errors
      }

      logger.info(`Client disconnected: ${socket.id}`);
    } catch (error) {
      logger.error('Error handling disconnect:', error);
    }
  });
});

const PORT = parseInt(process.env.SIGNALING_PORT || '3001', 10);
const HOST = process.env.SIGNALING_HOST || '0.0.0.0'; // Bind to all interfaces for network access

httpServer.listen(PORT, HOST, () => {
  logger.info(`✅ Signaling server running on ${HOST}:${PORT}`);
  logger.info(`   - Local: http://localhost:${PORT}`);
  logger.info(`   - Network: http://10.0.5.43:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    prisma.$disconnect();
    process.exit(0);
  });
});
