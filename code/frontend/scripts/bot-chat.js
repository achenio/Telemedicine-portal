document.addEventListener('DOMContentLoaded', () => {
  const chatMessages = document.getElementById('chatMessages');
  const userInput = document.getElementById('userInput');
  const sendButton = document.getElementById('sendButton');

  // Funzione per aggiungere un messaggio alla chat
  function addMessage(content, isUser = false) {
    const div = document.createElement('div');
    div.className = 'chat-message ' + (isUser ? 'user' : 'bot');
    div.textContent = content;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Funzione per ottenere risposta dal bot
  async function getBotResponse(userMessage) {
    try {
      const res = await fetch('http://localhost:4000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });
      const data = await res.json();
      // Risposta di default se non arriva nulla di valido
      if (!data.reply || typeof data.reply !== 'string' || !data.reply.trim()) {
        return "Sorry, I couldn't understand.";
      }
      return data.reply;
    } catch (error) {
      return "Sorry, I couldn't understand.";
    }
  }

  // Gestione invio messaggio
  async function handleSendMessage() {
    const message = userInput.value.trim();
    if (!message) return;
    addMessage(message, true);
    userInput.value = '';
    addMessage('Thinking...', false);
    const botResponse = await getBotResponse(message);
    chatMessages.lastChild.textContent = botResponse;
  }

  // Event listeners
  sendButton.addEventListener('click', handleSendMessage);
  userInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') handleSendMessage();
  });

  // Messaggio iniziale
  addMessage("Hello! I'm your AI assistant. How can I help you today?");
});