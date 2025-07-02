import express from 'express';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import cors from 'cors';

const app = express();
const PORT = 5501;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./utenti.db', (err) => {
  if (err) console.error("DB Error:", err);
  else console.log('Connected to SQLite DB.');
});

// Crea tabella utenti (aggiunge username e password_hash)
db.run(`
CREATE TABLE IF NOT EXISTS utenti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cognome TEXT NOT NULL,
  codice_fiscale TEXT UNIQUE NOT NULL,
  luogo_nascita TEXT,
  data_nascita TEXT,
  email TEXT UNIQUE,
  telefono TEXT UNIQUE,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
)
`);

// --- REGISTER ---
app.post('/register', (req, res) => {
  const {
    nome, cognome, codice_fiscale, luogo_nascita,
    data_nascita, email, telefono, username, password
  } = req.body;

  if (!username || !password || !nome || !cognome || !codice_fiscale) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).json({ error: "Server error hashing password." });

    const sql = `INSERT INTO utenti 
      (nome, cognome, codice_fiscale, luogo_nascita, data_nascita, email, telefono, username, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [nome, cognome, codice_fiscale, luogo_nascita || null, data_nascita || null, email || null, telefono || null, username, hash], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: "Username, email, codice fiscale or telefono already exists." });
        }
        return res.status(500).json({ error: "Database error." });
      }
      res.json({ success: true, message: "User registered successfully." });
    });
  });
});

// --- LOGIN ---
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required." });

  db.get('SELECT * FROM utenti WHERE username = ?', [username], (err, row) => {
    if (err) return res.status(500).json({ error: "Database error." });
    if (!row) return res.status(401).json({ error: "Invalid username or password." });

    bcrypt.compare(password, row.password_hash, (err, result) => {
      if (err) return res.status(500).json({ error: "Server error." });
      if (!result) return res.status(401).json({ error: "Invalid username or password." });

      // Login successful, qui puoi creare sessione JWT o simili
      res.json({ success: true, message: "Login successful." });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
