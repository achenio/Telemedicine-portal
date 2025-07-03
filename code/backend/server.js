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

// Crea tabella utenti
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

// Crea tabella appuntamenti
db.run(`
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  doctor_id TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  status TEXT DEFAULT 'booked',
  FOREIGN KEY(user_id) REFERENCES utenti(id)
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

      res.json({ 
        success: true, 
        message: "Login successful.",
        user: {
          id: row.id,
          username: row.username,
          nome: row.nome,
          cognome: row.cognome
        }
      });
    });
  });
});

// --- APPOINTMENTS ---
const doctors = [
  { id: 'dr_smith', name: 'Dr. Smith (Cardiology)' },
  { id: 'dr_johnson', name: 'Dr. Johnson (Neurology)' },
  { id: 'dr_williams', name: 'Dr. Williams (Pediatrics)' }
];

// Prenota appuntamento
app.post('/appointments', (req, res) => {
  const { username, date, time, doctor } = req.body;
  
  if (!username || !date || !time || !doctor) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  // Verifica se il dottore esiste
  const selectedDoctor = doctors.find(d => d.id === doctor);
  if (!selectedDoctor) {
    return res.status(400).json({ error: "Invalid doctor selection." });
  }

  // Verifica se l'utente esiste
  db.get('SELECT id FROM utenti WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: "Database error." });
    if (!user) return res.status(404).json({ error: "User not found." });

    // Verifica se esiste già un appuntamento allo stesso orario
    db.get(
      `SELECT id FROM appointments 
       WHERE date = ? AND time = ? AND doctor_id = ? AND status = 'booked'`,
      [date, time, doctor],
      (err, existing) => {
        if (err) return res.status(500).json({ error: "Database error." });
        if (existing) {
          return res.status(409).json({ error: "This time slot is already booked." });
        }

        // Crea l'appuntamento
        db.run(
          `INSERT INTO appointments 
           (user_id, username, date, time, doctor_id, doctor_name) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [user.id, username, date, time, doctor, selectedDoctor.name],
          function(err) {
            if (err) return res.status(500).json({ error: "Database error." });
            res.json({ 
              success: true, 
              message: "Appointment booked successfully.",
              appointmentId: this.lastID
            });
          }
        );
      }
    );
  });
});

// Ottieni appuntamenti per utente
app.get('/appointments', (req, res) => {
  const { username } = req.query;
  
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }

  db.all(
    `SELECT id, date, time, doctor_name 
     FROM appointments 
     WHERE username = ? AND status = 'booked'
     ORDER BY date, time`,
    [username],
    (err, appointments) => {
      if (err) return res.status(500).json({ error: "Database error." });
      res.json(appointments);
    }
  );
});

// Cancella appuntamento
app.delete('/appointments/:id', (req, res) => {
  const { id } = req.params;

  db.run(
    `UPDATE appointments SET status = 'cancelled' WHERE id = ?`,
    [id],
    function(err) {
      if (err) return res.status(500).json({ error: "Database error." });
      if (this.changes === 0) {
        return res.status(404).json({ error: "Appointment not found." });
      }
      res.json({ success: true, message: "Appointment cancelled." });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});