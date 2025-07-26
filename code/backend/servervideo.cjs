require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('../frontend')); // Serve frontend files

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = {};

io.on('connection', socket => {
  console.log('Nuovo utente connesso:', socket.id);
  
  socket.on('create or join', room => {
    if (!rooms[room]) {
      rooms[room] = [];
      socket.join(room);
      socket.emit('created', room);
      console.log(`Stanza ${room} creata da ${socket.id}`);
    } else if (rooms[room].length < 2) {
      rooms[room].push(socket.id);
      socket.join(room);
      socket.emit('joined', room);
      io.to(room).emit('ready');
      console.log(`${socket.id} si è unito alla stanza ${room}`);
    } else {
      socket.emit('full', room);
      console.log(`Stanza ${room} piena, ${socket.id} non può unirsi`);
    }
  });
  
  socket.on('offer', data => {
    socket.to(data.roomId).emit('offer', data);
    console.log(`Offerta inviata nella stanza ${data.roomId}`);
  });
  
  socket.on('answer', data => {
    socket.to(data.roomId).emit('answer', data);
    console.log(`Risposta inviata nella stanza ${data.roomId}`);
  });
  
  socket.on('candidate', data => {
    socket.to(data.roomId).emit('candidate', data);
    console.log(`ICE candidate inviato nella stanza ${data.roomId}`);
  });
  
  socket.on('leave', room => {
    socket.leave(room);
    socket.to(room).emit('leave');
    console.log(`${socket.id} ha lasciato la stanza ${room}`);
    
    if (rooms[room]) {
      rooms[room] = rooms[room].filter(id => id !== socket.id);
      
      if (rooms[room].length === 0) {
        delete rooms[room];
        console.log(`Stanza ${room} eliminata`);
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Utente disconnesso:', socket.id);
    Object.keys(rooms).forEach(room => {
      rooms[room] = rooms[room].filter(id => id !== socket.id);
      if (rooms[room].length === 0) delete rooms[room];
    });
  });
});

const PORT = process.env.VIDEO_PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server videochiamata in ascolto sulla porta ${PORT}`);
});