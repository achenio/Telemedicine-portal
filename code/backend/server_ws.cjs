const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('utenti.db');

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const express = require('express');
const app = express();

const JWT_SECRET = 'your-secret-key-here';
const ENCRYPTION_KEY = 'abcdefghilmnopqrstuv123456789012'; // 32 caratteri
const IV_LENGTH = 16;

const wss = new WebSocket.Server({ port: 8080 });
const clients = new Map();
const heartbeat = new Map();
const HEARTBEAT_INTERVAL = 30000; // 30 secondi

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final()
  ]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const parts = text.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
  const decrypted = Buffer.concat([
    decipher.update(encryptedText),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

wss.on('connection', (ws, req) => {
  const token = new URL(`http://localhost${req.url}`).searchParams.get('token');
  if (!token) {
    ws.close(1008, 'Authentication required');
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    const userType = decoded.user_type;

    if (userType !== 'doctor' && userType !== 'patient') {
      ws.close(1008, 'Unauthorized user type');
      return;
    }

    clients.set(userId, ws);
    heartbeat.set(ws, Date.now());
    ws.isAlive = true;

    console.log(`User ${userId} (${userType}) connected`);

    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message);

        if (!msg.receiver_id || !msg.content) {
          console.warn(`Invalid message format from user ${userId}`);
          return;
        }
        if (msg.receiver_id === userId) {
          console.warn(`User ${userId} attempted to send message to self`);
          return;
        }

        try {
          const encryptedContent = encrypt(msg.content);
          const decryptedContent = decrypt(encryptedContent);
          console.log(`Messaggio originale: ${msg.content}`);
          console.log(`Messaggio criptato: ${encryptedContent}`);
          console.log(`Messaggio decriptato: ${decryptedContent}`);

          db.run(
            `INSERT INTO messages (sender_id, receiver_id, content, timestamp, is_read, sender_type)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, msg.receiver_id, encryptedContent, new Date().toISOString(), 0, userType],
            (err) => {
              if (err) console.error('Error saving message to DB:', err);
              else console.log(`Salvato: ${msg.content} -> ${encryptedContent}`);
            }
          );
        } catch (dbError) {
          console.error('Error encrypting/saving message:', dbError);
        }

        if (clients.has(msg.receiver_id)) {
          const receiverWs = clients.get(msg.receiver_id);
          const messageData = {
            sender_id: userId,
            content: msg.content, // testo in chiaro
            timestamp: new Date().toISOString(),
          };
          if (receiverWs.readyState === WebSocket.OPEN) {
            receiverWs.send(JSON.stringify(messageData));
          } else {
            clients.delete(msg.receiver_id);
          }
        }
      } catch (e) {
        console.error('Error processing message:', e);
      }
    });

    ws.on('close', () => {
      clients.delete(userId);
      heartbeat.delete(ws);
      console.log(`User ${userId} disconnected`);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for user ${userId}:`, error);
      clients.delete(userId);
      heartbeat.delete(ws);
    });
  } catch (e) {
    console.error('Authentication error:', e);
    ws.close(1008, 'Invalid token');
  }
});

// Heartbeat check
const interval = setInterval(() => {
  const now = Date.now();
  heartbeat.forEach((lastPing, ws) => {
    if (now - lastPing > HEARTBEAT_INTERVAL) {
      ws.isAlive = false;
      ws.terminate();
      heartbeat.delete(ws);
    }
  });
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      const userId = [...clients.entries()].find(([_, client]) => client === ws)?.[0];
      console.log(`Terminating dead connection for user ${userId}`);
      clients.delete(userId);
      heartbeat.delete(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, HEARTBEAT_INTERVAL);

wss.on('pong', (ws) => {
  heartbeat.set(ws, Date.now());
  ws.isAlive = true;
});

wss.on('close', () => {
  clearInterval(interval);
  clients.clear();
  heartbeat.clear();
});

console.log('WebSocket server running on ws://localhost:8080');

// EXPRESS API
app.get('/messages', (req, res) => {
  db.all('SELECT * FROM messages', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    const messages = rows.map(row => {
      let decryptedContent;
      try {
        decryptedContent = decrypt(row.content);
      } catch (e) {
        decryptedContent = '[Errore decriptazione]';
      }
      console.log(`DB Criptato: ${row.content} | DB Decriptato: ${decryptedContent}`);
      return {
        ...row,
        content: decryptedContent
      };
    });
    res.json(messages);
  });
});

app.get('/messages/conversation/:patientId', (req, res) => {
  const patientId = req.params.patientId;
  db.all(
    'SELECT * FROM messages WHERE (sender_id = ? OR receiver_id = ?) ORDER BY timestamp ASC',
    [patientId, patientId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      const messages = rows.map(row => {
        let decryptedContent;
        try {
          decryptedContent = decrypt(row.content);
        } catch (e) {
          decryptedContent = '[Errore decriptazione]';
        }
        console.log(`DB Criptato: ${row.content} | DB Decriptato: ${decryptedContent}`);
        return {
          ...row,
          content: decryptedContent
        };
      });
      res.json(messages);
    }
  );
});

app.get('/all-users', (req, res) => {
  db.all('SELECT id, nome, cognome, codice_fiscale, user_type FROM users WHERE user_type = "patient" OR user_type = "doctor"', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

app.listen(3001, () => {
  console.log('Express API listening on http://localhost:3001');
});
