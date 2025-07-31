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

const rooms = {};

function getSocketById(socketId) {
  return io.sockets.sockets.get(socketId);
}

io.on('connection', socket => {
  console.log('User connected:', socket.id);
  
  const heartbeatInterval = setInterval(() => {
    socket.emit('heartbeat');
  }, 20000);

  socket.on('error', (error) => {
    console.error(`Socket error (${socket.id}):`, error);
  });

  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id} (${reason})`);
    clearInterval(heartbeatInterval);
    
    Object.keys(rooms).forEach(room => {
      if (rooms[room].participants[socket.id]) {
        delete rooms[room].participants[socket.id];
        rooms[room].count--;
        
        if (rooms[room].count === 0) {
          delete rooms[room];
          console.log(`Room ${room} deleted (no more participants)`);
        } else {
          io.to(room).emit('participant_left', { 
            socketId: socket.id,
            participants: rooms[room].participants
          });
        }
      }
    });
  });

  socket.on('create_or_join', (room, userName, callback) => {
    try {
      console.log(`Join request: ${userName} (${socket.id}) to ${room}`);

      const MAX_PARTICIPANTS = 2;
      room = room.trim().toUpperCase();
      
      if (!room || !userName) {
        return callback?.({ error: "Room code and user name are required" });
      }

      if (rooms[room]?.count >= MAX_PARTICIPANTS) {
        return callback?.({ error: `Room is full (max ${MAX_PARTICIPANTS} participants)` });
      }

      if (!rooms[room]) {
        rooms[room] = {
          participants: {},
          count: 0,
          createdAt: new Date()
        };
      } 

      rooms[room].participants[socket.id] = userName;
      rooms[room].count++;
      socket.join(room);
      
      const response = {
        status: rooms[room].count === 1 ? "created" : "joined",
        room: room,
        participants: rooms[room].participants
      };

      callback?.(response);

      if (rooms[room].count > 1) {
        socket.to(room).emit('participant_joined', {
          socketId: socket.id,
          name: userName,
          participants: rooms[room].participants
        });
        
        io.to(room).emit('ready', {
          room: room,
          participants: rooms[room].participants
        });
      }
    } catch (error) {
      console.error('Error in create_or_join:', error);
      callback?.({ error: "Internal server error" });
    }
  });

  socket.on('offer', (data, callback) => {
    try {
      console.log(`Offer from ${socket.id} to ${data.target}`);
      
      const targetSocket = getSocketById(data.target);
      if (!targetSocket) {
        return callback?.({ error: "Participant not found" });
      }

      targetSocket.emit('offer', {
        sender: socket.id,
        offer: data.offer,
        roomId: data.roomId
      });
      
      callback?.({ status: "offer forwarded" });
    } catch (error) {
      console.error('Error handling offer:', error);
      callback?.({ error: "Internal server error" });
    }
  });

  socket.on('answer', (data, callback) => {
    try {
      console.log(`Answer from ${socket.id} to ${data.target}`);
      
      const targetSocket = getSocketById(data.target);
      if (!targetSocket) {
        return callback?.({ error: "Participant not found" });
      }

      targetSocket.emit('answer', {
        sender: socket.id,
        answer: data.answer,
        roomId: data.roomId
      });
      
      callback?.({ status: "answer forwarded" });
    } catch (error) {
      console.error('Error handling answer:', error);
      callback?.({ error: "Internal server error" });
    }
  });

  socket.on('candidate', (data, callback) => {
    try {
      console.log(`ICE candidate from ${socket.id} to ${data.target}`);
      
      const targetSocket = getSocketById(data.target);
      if (!targetSocket) {
        return callback?.({ error: "Participant not found" });
      }

      targetSocket.emit('candidate', {
        sender: socket.id,
        candidate: data.candidate,
        roomId: data.roomId
      });
      
      callback?.({ status: "candidate forwarded" });
    } catch (error) {
      console.error('Error handling candidate:', error);
      callback?.({ error: "Internal server error" });
    }
  });

  socket.on('chat', (data, callback) => {
    try {
      if (!data.roomId || !data.message) {
        return callback?.({ error: "Invalid chat data" });
      }

      io.to(data.roomId).emit('chat_message', {
        sender: data.sender || socket.id,
        message: data.message,
        roomId: data.roomId,
        timestamp: new Date()
      });
      
      callback?.({ status: "message delivered" });
    } catch (error) {
      console.error('Error handling chat:', error);
      callback?.({ error: "Internal server error" });
    }
  });

  socket.on('leave', (room, callback) => {
    try {
      room = room?.trim().toUpperCase();
      if (!room || !rooms[room]) {
        return callback?.({ error: "Invalid room" });
      }

      delete rooms[room].participants[socket.id];
      rooms[room].count--;
      
      if (rooms[room].count === 0) {
        delete rooms[room];
      }
      
      socket.leave(room);
      socket.to(room).emit('participant_left', { 
        socketId: socket.id,
        participants: rooms[room]?.participants || {}
      });
      
      callback?.({ status: "left room" });
    } catch (error) {
      console.error('Error handling leave:', error);
      callback?.({ error: "Internal server error" });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});