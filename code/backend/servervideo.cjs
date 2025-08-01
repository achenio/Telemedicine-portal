require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const PORT = process.env.VIDEO_PORT || 3010;

app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket']
});

// Room management
const rooms = {};
const MAX_PARTICIPANTS = 10;
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  // Heartbeat mechanism
  const heartbeatInterval = setInterval(() => {
    socket.emit('heartbeat');
  }, 20000);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    clearInterval(heartbeatInterval);
    
    // Clean up room participation
    Object.keys(rooms).forEach(roomId => {
      if (rooms[roomId].participants[socket.id]) {
        const userName = rooms[roomId].participants[socket.id];
        delete rooms[roomId].participants[socket.id];
        rooms[roomId].count--;
        
        if (rooms[roomId].count === 0) {
          delete rooms[roomId];
        } else {
          io.to(roomId).emit('participant_left', {
            socketId: socket.id,
            userName
          });
        }
      }
    });
  });

  // Enhanced create_or_join with safe callback handling
  socket.on('create_or_join', (data, callback) => {
    try {
      // Validate callback is a function
      if (typeof callback !== 'function') {
        console.warn('No callback provided for create_or_join');
        callback = () => {}; // Create empty function as fallback
      }

      const { roomId, userName } = data || {};
      
      if (!roomId || !userName) {
        return callback({ error: "Room ID and user name are required" });
      }

      const normalizedRoomId = roomId.trim().toUpperCase();
      const normalizedUserName = userName.trim();

      // Check if room exists or create new
      if (!rooms[normalizedRoomId]) {
        rooms[normalizedRoomId] = {
          participants: {},
          count: 0,
          chatHistory: []
        };
      }

      const room = rooms[normalizedRoomId];

      // Check if room is full
      if (room.count >= MAX_PARTICIPANTS) {
        return callback({ error: `Room is full (max ${MAX_PARTICIPANTS} participants)` });
      }

      // Check if username is taken
      if (Object.values(room.participants).includes(normalizedUserName)) {
        return callback({ error: "Username already taken in this room" });
      }

      // Add participant to room
      room.participants[socket.id] = normalizedUserName;
      room.count++;
      socket.join(normalizedRoomId);

      const response = {
        status: room.count === 1 ? "created" : "joined",
        roomId: normalizedRoomId,
        participants: room.participants,
        iceServers: ICE_SERVERS,
        chatHistory: room.chatHistory
      };

      callback(response);

      // Notify other participants if not the first one
      if (room.count > 1) {
        socket.to(normalizedRoomId).emit('participant_joined', {
          socketId: socket.id,
          name: normalizedUserName
        });
      }

    } catch (error) {
      console.error('Error in create_or_join:', error);
      if (typeof callback === 'function') {
        callback({ error: "Internal server error" });
      }
    }
  });

  // WebRTC signaling handlers
  socket.on('offer', (data) => {
    const { target, offer, roomId } = data || {};
    if (!target || !offer || !roomId) return;

    const targetSocket = io.sockets.sockets.get(target);
    if (targetSocket) {
      targetSocket.emit('offer', {
        sender: socket.id,
        offer,
        roomId
      });
    }
  });

  socket.on('answer', (data) => {
    const { target, answer, roomId } = data || {};
    if (!target || !answer || !roomId) return;

    const targetSocket = io.sockets.sockets.get(target);
    if (targetSocket) {
      targetSocket.emit('answer', {
        sender: socket.id,
        answer,
        roomId
      });
    }
  });

  socket.on('ice_candidate', (data) => {
    const { target, candidate, roomId } = data || {};
    if (!target || !candidate || !roomId) return;

    const targetSocket = io.sockets.sockets.get(target);
    if (targetSocket) {
      targetSocket.emit('ice_candidate', {
        sender: socket.id,
        candidate,
        roomId
      });
    }
  });

  // Chat functionality
  socket.on('chat_message', (data) => {
    const { roomId, message } = data || {};
    if (!roomId || !message) return;

    const room = rooms[roomId];
    if (!room || !room.participants[socket.id]) return;

    const chatMessage = {
      sender: socket.id,
      senderName: room.participants[socket.id],
      message,
      timestamp: new Date()
    };

    // Store message
    room.chatHistory.push(chatMessage);
    if (room.chatHistory.length > 100) {
      room.chatHistory.shift();
    }

    // Broadcast to room
    io.to(roomId).emit('chat_message', chatMessage);
  });

  // Screen sharing
  socket.on('screen_share_started', (data) => {
    const { roomId } = data || {};
    if (!roomId) return;

    const room = rooms[roomId];
    if (!room || !room.participants[socket.id]) return;

    io.to(roomId).emit('screen_share_status', {
      sender: socket.id,
      senderName: room.participants[socket.id],
      isSharing: true
    });
  });

  socket.on('screen_share_ended', (data) => {
    const { roomId } = data || {};
    if (!roomId) return;

    const room = rooms[roomId];
    if (!room || !room.participants[socket.id]) return;

    io.to(roomId).emit('screen_share_status', {
      sender: socket.id,
      senderName: room.participants[socket.id],
      isSharing: false
    });
  });

  // Error handling middleware
  socket.on('error', (error) => {
    console.error(`Socket error (${socket.id}):`, error);
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});