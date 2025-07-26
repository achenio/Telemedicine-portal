require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const HF_API_KEY = process.env.HF_API_KEY || 'your-huggingface-api-key';
const HF_API_URL = 'https://api-inference.huggingface.co/models/facebook/blenderbot-3B';

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ reply: "Sorry, I couldn't understand." });

    const response = await axios.post(
      'https://api-inference.huggingface.co/models/gpt2',
      { inputs: message },
      { headers: { 'Authorization': `Bearer ${HF_API_KEY}` }, timeout: 10000 }
    );

    // Migliora l'estrazione della risposta
    let reply = "Sorry, I couldn't understand.";
    if (response.data && Array.isArray(response.data) && response.data[0]?.generated_text) {
      reply = response.data[0].generated_text.trim();
      // Se la risposta è identica alla domanda, probabilmente il modello non ha risposto
      if (!reply || reply.toLowerCase() === message.toLowerCase()) {
        reply = "Sorry, I couldn't understand.";
      }
    }
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ reply: "Sorry, I couldn't understand." });
  }
});

const PORT = process.env.BOT_PORT || 4000;
app.listen(PORT, () => console.log(`Bot server running on port ${PORT}`));