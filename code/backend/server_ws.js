const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { db } = require('./db'); // Assuming you have a db connection module
const JWT_SECRET = 'your-secret-key-here';

const wss = new WebSocket.Server({ port: 8080 });

// Store connected clients
const clients = new Map();

// Heartbeat interval to check for dead connections
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const heartbeat = new Map();

wss.on('connection', (ws, req) => {
  // Get token from query string
  const token = new URL(`http://localhost${req.url}`).searchParams.get('token');
  
  if (!token) {
    ws.close(1008, 'Authentication required');
    return;
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    const userType = decoded.user_type;

    // Only allow doctors and patients to connect
    if (userType !== 'doctor' && userType !== 'patient') {
      ws.close(1008, 'Unauthorized user type');
      return;
    }

    // Add client to map
    clients.set(userId, ws);
    console.log(`User ${userId} (${userType}) connected`);

    // Set up heartbeat
    heartbeat.set(ws, Date.now());
    ws.isAlive = true;

    // Message handler
    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message);
        
        // Validate message structure
        if (!msg.receiver_id || !msg.content) {
          console.warn(`Invalid message format from user ${userId}`);
          return;
        }

        // Prevent sending to self
        if (msg.receiver_id === userId) {
          console.warn(`User ${userId} attempted to send message to self`);
          return;
        }

        // Save message to database
        try {
          await db.run(
            `INSERT INTO messages (sender_id, receiver_id, content, sender_type) 
             VALUES (?, ?, ?, ?)`,
            [userId, msg.receiver_id, msg.content, userType]
          );
        } catch (dbError) {
          console.error('Error saving message to DB:', dbError);
          // Continue to send message even if DB fails
        }

        // Forward message to recipient if connected
        if (clients.has(msg.receiver_id)) {
          const receiverWs = clients.get(msg.receiver_id);
          const messageData = {
            sender_id: userId,
            content: msg.content,
            timestamp: new Date().toISOString()
          };

          // Check if receiver connection is still alive
          if (receiverWs.readyState === WebSocket.OPEN) {
            receiverWs.send(JSON.stringify(messageData));
          } else {
            console.log(`Receiver ${msg.receiver_id} connection not open`);
            clients.delete(msg.receiver_id);
          }
        }
      } catch (e) {
        console.error('Error processing message:', e);
      }
    });

    // Handle connection close
    ws.on('close', () => {
      clients.delete(userId);
      heartbeat.delete(ws);
      console.log(`User ${userId} disconnected`);
    });

    // Handle errors
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

  // Ping all clients
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

// Handle pongs
wss.on('pong', (ws) => {
  heartbeat.set(ws, Date.now());
  ws.isAlive = true;
});

// Cleanup on server close
wss.on('close', () => {
  clearInterval(interval);
  clients.clear();
  heartbeat.clear();
});

console.log('WebSocket server running on ws://localhost:8080');
