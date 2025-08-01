const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8, // 100MB
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = 3010;
const MAX_PARTICIPANTS = 10;

// Room state management
const rooms = new Map();

// Middleware for authentication
io.use((socket, next) => {
  const { userName, clientType } = socket.handshake.auth;
  if (!userName) {
    return next(new Error("Username is required"));
  }
  socket.userName = userName;
  socket.clientType = clientType || 'web';
  next();
});

// Connection handler
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id} (${socket.userName})`);
  
  // Heartbeat handling
  socket.on('heartbeat', () => {
    socket.emit('heartbeat');
  });

  // Room management
  socket.on('create_or_join', (roomId, userName, callback) => {
    try {
      if (!roomId) {
        return callback({ error: "Room ID is required" });
      }

      if (!rooms.has(roomId)) {
        // Create new room
        rooms.set(roomId, {
          participants: new Map(),
          createdAt: new Date()
        });
        console.log(`Room ${roomId} created by ${socket.id}`);
      }

      const room = rooms.get(roomId);
      if (room.participants.size >= MAX_PARTICIPANTS) {
        return callback({ error: `Room is full (max ${MAX_PARTICIPANTS} participants)` });
      }

      // Add participant to room
      room.participants.set(socket.id, {
        id: socket.id,
        name: userName,
        joinedAt: new Date()
      });

      // Join the socket room
      socket.join(roomId);
      socket.currentRoom = roomId;

      // Notify others in the room
      const participants = {};
      room.participants.forEach((participant, id) => {
        participants[id] = participant.name;
      });

      if (room.participants.size === 1) {
        // First participant - created room
        socket.emit('created', { 
          room: roomId, 
          participants,
          socketId: socket.id
        });
      } else {
        // Notify existing participants about new joiner
        socket.to(roomId).emit('participant_joined', {
          socketId: socket.id,
          name: userName
        });
        
        // Send list of existing participants to new joiner
        socket.emit('joined', { 
          room: roomId, 
          participants,
          socketId: socket.id
        });
        
        // Update all participants list
        io.to(roomId).emit('participants_updated', {
          participants
        });
      }

      callback({ success: true, roomId });
    } catch (error) {
      console.error('Error in create_or_join:', error);
      callback({ error: error.message });
    }
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    const { target, offer, roomId } = data;
    if (target && roomId && rooms.has(roomId)) {
      socket.to(target).emit('offer', {
        sender: socket.id,
        offer,
        roomId
      });
    }
  });

  socket.on('answer', (data) => {
    const { target, answer, roomId } = data;
    if (target && roomId && rooms.has(roomId)) {
      socket.to(target).emit('answer', {
        sender: socket.id,
        answer,
        roomId
      });
    }
  });

  socket.on('candidate', (data) => {
    const { target, candidate, roomId } = data;
    if (target && roomId && rooms.has(roomId)) {
      socket.to(target).emit('candidate', {
        sender: socket.id,
        candidate,
        roomId
      });
    }
  });

  // Chat messages
  socket.on('chat', (data) => {
    const { roomId, message } = data;
    if (roomId && rooms.has(roomId)) {
      io.to(roomId).emit('chat_message', {
        sender: socket.id,
        message,
        timestamp: new Date()
      });
    }
  });

  // Leave room
  socket.on('leave', (roomId, callback) => {
    try {
      if (roomId && rooms.has(roomId)) {
        const room = rooms.get(roomId);
        
        if (room.participants.has(socket.id)) {
          // Remove participant from room
          room.participants.delete(socket.id);
          
          // Notify others
          socket.to(roomId).emit('participant_left', {
            socketId: socket.id,
            name: socket.userName
          });
          
          // Update participants list
          const participants = {};
          room.participants.forEach((participant, id) => {
            participants[id] = participant.name;
          });
          
          io.to(roomId).emit('participants_updated', {
            participants
          });
          
          // Clean up empty rooms
          if (room.participants.size === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (no participants)`);
          }
        }
        
        socket.leave(roomId);
        delete socket.currentRoom;
      }
      
      callback({ success: true });
    } catch (error) {
      console.error('Error leaving room:', error);
      callback({ error: error.message });
    }
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    
    if (socket.currentRoom) {
      const roomId = socket.currentRoom;
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        
        if (room.participants.has(socket.id)) {
          // Remove participant from room
          room.participants.delete(socket.id);
          
          // Notify others
          socket.to(roomId).emit('participant_left', {
            socketId: socket.id,
            name: socket.userName
          });
          
          // Update participants list
          const participants = {};
          room.participants.forEach((participant, id) => {
            participants[id] = participant.name;
          });
          
          io.to(roomId).emit('participants_updated', {
            participants
          });
          
          // Clean up empty rooms
          if (room.participants.size === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (no participants)`);
          }
        }
      }
    }
  });

  // Error handling
  socket.on('error', (error) => {
    console.error(`Socket error (${socket.id}):`, error);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    rooms: rooms.size,
    participants: Array.from(rooms.values()).reduce((acc, room) => acc + room.participants.size, 0)
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Clean up empty rooms periodically
setInterval(() => {
  const now = new Date();
  let cleaned = 0;
  
  rooms.forEach((room, roomId) => {
    if (room.participants.size === 0) {
      // Check if room is older than 1 hour
      if (now - room.createdAt > 3600000) {
        rooms.delete(roomId);
        cleaned++;
      }
    }
  });
  
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} empty rooms`);
  }
}, 3600000); // Run every hour

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  io.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  io.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});