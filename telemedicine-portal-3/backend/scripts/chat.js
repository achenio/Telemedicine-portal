const socket = new WebSocket('ws://localhost:8080'); // Cambia con il tuo dominio se deployato

const username = prompt("Enter your username:");
const recipient = prompt("Who do you want to chat with?");

socket.addEventListener('open', () => {
  socket.send(JSON.stringify({ type: 'register', username }));
});

document.getElementById('send-message').addEventListener('click', () => {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (message) {
    socket.send(JSON.stringify({
      type: 'message',
      to: recipient,
      from: username,
      message
    }));
    appendMessage(message, 'user');
    input.value = '';
  }
});

socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  appendMessage(`${data.from}: ${data.message}`, 'bot');
});

function appendMessage(text, who) {
  const el = document.createElement('div');
  el.textContent = text;
  el.className = who === 'user' ? 'message user' : 'message bot';
  document.getElementById('messages').appendChild(el);
}
