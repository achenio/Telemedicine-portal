require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const app = express();

const PORT = process.env.VIDEO_PORT || 3000;

app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000, // 60 secondi
  pingInterval: 25000 // 25 secondi
});

const rooms = {};

// Middleware per il logging delle connessioni
io.use((socket, next) => {
  console.log(`New connection attempt from ${socket.id}`);
  next();
});

io.on('connection', socket => {
  console.log('User connected:', socket.id);
  
  // Invia un heartbeat ogni 20 secondi per mantenere la connessione
  const heartbeatInterval = setInterval(() => {
    socket.emit('heartbeat');
  }, 20000);

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
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
    console.log(`Received request to join room ${room} from ${userName} (${socket.id})`);
    
    if (!room || !userName) {
      console.log('Validation failed - missing room or userName');
      return callback({ error: "Room code and user name are required" });
    }

    // Normalizza il room code (rimuove spazi e converte in maiuscolo)
    room = room.trim().toUpperCase();
    
    if (!rooms[room]) {
      rooms[room] = {
        participants: {},
        count: 0,
        createdAt: new Date()
      };
      console.log(`Room ${room} created by ${socket.id}`);
    }

    if (rooms[room].count >= 2) {
      console.log(`Room ${room} is full`);
      return callback({ error: "Room is full (max 2 participants)" });
    }

    // Aggiungi il partecipante
    rooms[room].participants[socket.id] = {
      id: socket.id,
      name: userName,
      joinedAt: new Date()
    };
    rooms[room].count++;
    socket.join(room);
    
    console.log(`${userName} joined room ${room}. Now ${rooms[room].count} participants`);

    // Prepara la risposta
    const response = {
      status: rooms[room].count === 1 ? "created" : "joined",
      room: room,
      participants: rooms[room].participants
    };

    // Notifica il client chiamante
    callback(response);

    // Se è il secondo partecipante, notifica tutti
    if (rooms[room].count === 2) {
      io.to(room).emit('ready', response);
      console.log(`Room ${room} is ready with 2 participants`);
    }
  });

  socket.on('offer', (data, callback) => {
    console.log(`Offer received in room ${data.roomId} from ${socket.id} to ${data.target}`);
    
    if (!data.roomId || !data.target || !data.offer) {
      return callback({ error: "Invalid offer data" });
    }

    const targetSocket = io.sockets.sockets.get(data.target);
    if (targetSocket) {
      targetSocket.emit('offer', {
        sender: socket.id,
        offer: data.offer,
        roomId: data.roomId
      });
      callback({ status: "offer forwarded" });
    } else {
      console.log(`Target socket ${data.target} not found`);
      callback({ error: "Participant not found" });
    }
  });

  socket.on('answer', (data, callback) => {
    console.log(`Answer received in room ${data.roomId} from ${socket.id} to ${data.target}`);
    
    if (!data.roomId || !data.target || !data.answer) {
      return callback({ error: "Invalid answer data" });
    }

    const targetSocket = io.sockets.sockets.get(data.target);
    if (targetSocket) {
      targetSocket.emit('answer', {
        sender: socket.id,
        answer: data.answer,
        roomId: data.roomId
      });
      callback({ status: "answer forwarded" });
    } else {
      console.log(`Target socket ${data.target} not found`);
      callback({ error: "Participant not found" });
    }
  });

  socket.on('candidate', (data, callback) => {
    console.log(`ICE candidate received in room ${data.roomId} from ${socket.id} to ${data.target}`);
    
    if (!data.roomId || !data.target || !data.candidate) {
      return callback({ error: "Invalid candidate data" });
    }

    const targetSocket = io.sockets.sockets.get(data.target);
    if (targetSocket) {
      targetSocket.emit('candidate', {
        sender: socket.id,
        candidate: data.candidate,
        roomId: data.roomId
      });
      callback({ status: "candidate forwarded" });
    } else {
      console.log(`Target socket ${data.target} not found`);
      callback({ error: "Participant not found" });
    }
  });

  socket.on('chat', (data, callback) => {
    console.log(`Chat message in room ${data.roomId} from ${socket.id}`);
    
    if (!data.roomId || !data.message) {
      return callback({ error: "Invalid chat data" });
    }

    io.to(data.roomId).emit('chat_message', {
      sender: data.sender || socket.id,
      message: data.message,
      roomId: data.roomId,
      timestamp: new Date()
    });
    
    callback({ status: "message delivered" });
  });

  socket.on('leave', (room, callback) => {
    console.log(`${socket.id} is leaving room ${room}`);
    
    if (!room) {
      return callback({ error: "Room code is required" });
    }

    if (rooms[room]) {
      delete rooms[room].participants[socket.id];
      rooms[room].count--;
      
      if (rooms[room].count === 0) {
        delete rooms[room];
        console.log(`Room ${room} deleted (no more participants)`);
      }
      
      socket.leave(room);
      socket.to(room).emit('participant_left', { 
        socketId: socket.id,
        participants: rooms[room]?.participants || {}
      });
      
      callback({ status: "left room" });
    } else {
      callback({ error: "Room not found" });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});