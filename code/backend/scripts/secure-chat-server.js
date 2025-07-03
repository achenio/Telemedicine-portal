// Mappa utenti registrati: { username: socket }
const clients = new Map();

wss.on("connection", (ws) => {
  let userName = null;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);

      // Prima registrazione dell'utente
      if (msg.type === "register") {
        userName = msg.username;
        clients.set(userName, ws);
        console.log(`✅ ${userName} connected`);
        return;
      }

      // Inoltro messaggio ad altro utente
      if (msg.type === "message" && msg.to) {
        const recipient = clients.get(msg.to);
        if (recipient && recipient.readyState === WebSocket.OPEN) {
          recipient.send(
            JSON.stringify({
              type: "message",
              from: userName,
              message: msg.message,
            })
          );
        }
      }
    } catch (err) {
      console.error("❌ Invalid message:", err);
    }
  });

  ws.on("close", () => {
    if (userName) {
      clients.delete(userName);
      console.log(`❌ ${userName} disconnected`);
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🔐 Secure Chat WebSocket server running at ws://localhost:${PORT}`);
});
