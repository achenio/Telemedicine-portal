import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const port = 1239;

// 🔐 Inserisci le tue credenziali sandbox PayPal
const PAYPAL_CLIENT_ID = 'Addsl8iI8tBYlJu5RQE9sK7Ap9v2V1hSOrj9YsDPQAttyuaR-CC6NkPed15aITKZS-7i_B8SHf7QppB9';
const PAYPAL_CLIENT_SECRET = 'EK4BxneFfg3jOrhmRWZTXUaD3FJh0EzW9oZ-AvMh8jNuQb2RvVqLeNyjZxi443KM9jzNRhwThAJdaZBV';
const PAYPAL_API = 'https://api-m.sandbox.paypal.com'; // per sandbox

app.use(cors());
app.use(express.json());

// 🔁 Ottieni token di accesso da PayPal
async function getAccessToken() {
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  return data.access_token;
}

// 📦 Crea ordine PayPal
app.post('/create-order', async (req, res) => {
  const { amount } = req.body;

  if (!amount || isNaN(amount)) {
    return res.status(400).json({ error: 'Importo non valido' });
  }

  try {
    const accessToken = await getAccessToken();

    const order = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'EUR',
              value: amount.toString(),
            },
          },
        ],
      }),
    });

    const data = await order.json();

    if (!data.id) {
      return res.status(500).json({ error: 'Errore nella creazione dell\'ordine', details: data });
    }

    res.json({ id: data.id });
  } catch (err) {
    console.error('Errore nel backend:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

app.listen(port, () => {
  console.log(`✅ Server backend attivo su http://localhost:${port}`);
});
