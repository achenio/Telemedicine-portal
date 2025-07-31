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

// Configurazione migliorata per più partecipanti
const MAX_PARTICIPANTS = 10; // Aumentato da 2 a 10
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478?transport=udp' },
  // Aggiungi il tuo server TURN qui se disponibile
  // { urls: 'turn:your-turn-server.com:3478', username: 'username', credential: 'password' }
];

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
          createdAt: new Date(),
          iceServers: ICE_SERVERS // Fornisce i server ICE a tutti i partecipanti
        };
      } 

      rooms[room].participants[socket.id] = userName;
      rooms[room].count++;
      socket.join(room);
      
      const response = {
        status: rooms[room].count === 1 ? "created" : "joined",
        room: room,
        participants: rooms[room].participants,
        iceServers: rooms[room].iceServers // Invia i server ICE al client
      };

      callback?.(response);

      if (rooms[room].count > 1) {
        socket.to(room).emit('participant_joined', {
          socketId: socket.id,
          name: userName,
          participants: rooms[room].participants
        });
        
        // Invia a tutti i partecipanti la lista aggiornata
        io.to(room).emit('participants_updated', {
          participants: rooms[room].participants
        });
      }
    } catch (error) {
      console.error('Error in create_or_join:', error);
      callback?.({ error: "Internal server error" });
    }
  });

  // Nuovo handler per la negoziazione semplificata
  socket.on('relay_signal', ({ to, signal }) => {
    const targetSocket = getSocketById(to);
    if (targetSocket) {
      targetSocket.emit('signal', { from: socket.id, signal });
    }
  });

  // Gestione semplificata delle offerte/risposte/candidati
  socket.on('offer', (data) => {
    const targetSocket = getSocketById(data.target);
    if (targetSocket) {
      targetSocket.emit('offer', {
        sender: socket.id,
        offer: data.offer,
        roomId: data.roomId
      });
    }
  });

  socket.on('answer', (data) => {
    const targetSocket = getSocketById(data.target);
    if (targetSocket) {
      targetSocket.emit('answer', {
        sender: socket.id,
        answer: data.answer,
        roomId: data.roomId
      });
    }
  });

  socket.on('candidate', (data) => {
    const targetSocket = getSocketById(data.target);
    if (targetSocket) {
      targetSocket.emit('candidate', {
        sender: socket.id,
        candidate: data.candidate,
        roomId: data.roomId
      });
    }
  });

  // Chat centralizzata via server invece che peer-to-peer
  socket.on('chat', (data) => {
    if (!data.roomId || !data.message) return;
    
    // Verifica che il mittente sia nella stanza
    if (rooms[data.roomId]?.participants[socket.id]) {
      io.to(data.roomId).emit('chat_message', {
        sender: socket.id,
        senderName: rooms[data.roomId].participants[socket.id],
        message: data.message,
        timestamp: new Date()
      });
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
      
      // Invia a tutti i partecipanti la lista aggiornata
      if (rooms[room]) {
        io.to(room).emit('participants_updated', {
          participants: rooms[room].participants
        });
      }
      
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