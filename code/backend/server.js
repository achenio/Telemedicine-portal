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

// Create tables
db.serialize(() => {
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
    password_hash TEXT NOT NULL,
    user_type TEXT NOT NULL CHECK(user_type IN ('patient', 'doctor')),
    specialization TEXT
  )`);

  db.run(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    doctor_id INTEGER NOT NULL,
    doctor_name TEXT NOT NULL,
    status TEXT DEFAULT 'booked',
    FOREIGN KEY(user_id) REFERENCES utenti(id),
    FOREIGN KEY(doctor_id) REFERENCES utenti(id)
  )`);
});

// Registration endpoint
app.post('/register', (req, res) => {
  const { nome, cognome, codice_fiscale, user_type, specialization, ...rest } = req.body;

  // Log tutto ciò che arriva
  console.log("Registering user with data:", req.body);

  // Controllo tipo utente
  if (!['patient', 'doctor'].includes(user_type)) {
    return res.status(400).json({ error: "Invalid user type" });
  }

  // Controllo specializzazione se è un dottore
  const specializationValue = (user_type === 'doctor') 
    ? (specialization || '').trim() 
    : null;

  if (user_type === 'doctor' && !specializationValue) {
    return res.status(400).json({ error: "Specialization required for doctors" });
  }

  // Crea hash della password
  bcrypt.hash(req.body.password, 10, (err, hash) => {
    if (err) {
      console.error("Bcrypt error:", err);
      return res.status(500).json({ error: "Server error during password hashing" });
    }

    const sql = `INSERT INTO utenti (
      nome, cognome, codice_fiscale, user_type, specialization, password_hash, 
      luogo_nascita, data_nascita, email, telefono, username
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      nome.trim(),
      cognome.trim(),
      codice_fiscale.trim(),
      user_type,
      specializationValue,
      hash,
      rest.luogo_nascita?.trim() || null,
      rest.data_nascita || null,
      rest.email?.trim() || null,
      rest.telefono?.trim() || null,
      rest.username.trim()
    ];

    console.log("Inserting user with values:", values);

    db.run(sql, values, function(err) {
      if (err) {
        console.error("DB insert error:", err.message);
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: "Username/email/codice fiscale already exists" });
        }
        return res.status(500).json({ error: "Database error: " + err.message });
      }

      res.json({
        success: true,
        user: {
          id: this.lastID,
          username: rest.username,
          user_type
        }
      });
    });
  });
});

// Login endpoint
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM utenti WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    bcrypt.compare(password, user.password_hash, (err, result) => {
      if (err || !result) return res.status(401).json({ error: "Invalid credentials" });
      
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          nome: user.nome,
          cognome: user.cognome,
          user_type: user.user_type
        }
      });
    });
  });
});

// Get doctors endpoint
app.get('/doctors', (req, res) => {
  db.all(
    `SELECT id, nome, cognome, specialization FROM utenti WHERE user_type = 'doctor'`,
    (err, doctors) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(doctors);
    }
  );
});

// Book appointment endpoint
app.post('/appointments', (req, res) => {
  const { user_id, doctor_id, date, time, username } = req.body;

  if (!user_id || !doctor_id || !date || !time || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  db.get('SELECT * FROM utenti WHERE id = ? AND user_type = "doctor"', [doctor_id], (err, doctor) => {
    if (err || !doctor) return res.status(400).json({ error: "Invalid doctor" });

    // Check if the time slot is available
    db.get(
      `SELECT id FROM appointments 
       WHERE doctor_id = ? AND date = ? AND time = ? AND status = 'booked'`,
      [doctor_id, date, time],
      (err, existing) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (existing) return res.status(409).json({ error: "Time slot already booked" });

        // Book the appointment
        db.run(
          `INSERT INTO appointments 
          (user_id, username, date, time, doctor_id, doctor_name) 
          VALUES (?, ?, ?, ?, ?, ?)`,
          [user_id, username, date, time, doctor_id, `${doctor.nome} ${doctor.cognome}`],
          function(err) {
            if (err) return res.status(500).json({ error: "Database error" });
            res.json({ success: true, appointmentId: this.lastID });
          }
        );
      }
    );
  });
});

// Get doctor appointments endpoint
app.get('/doctor/appointments', (req, res) => {
  const doctorId = req.query.doctorId;
  if (!doctorId) return res.status(400).json({ error: "Doctor ID required" });

  db.all(
    `SELECT a.id, a.date, a.time, u.nome, u.cognome, u.codice_fiscale
     FROM appointments a
     JOIN utenti u ON a.user_id = u.id
     WHERE a.doctor_id = ? AND a.status = 'booked'
     ORDER BY a.date, a.time`,
    [doctorId],
    (err, appointments) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(appointments);
    }
  );
});

// Cancel appointment endpoint
app.delete('/appointments/:id', (req, res) => {
  db.run(
    `UPDATE appointments SET status = 'cancelled' WHERE id = ?`,
    [req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json({ success: true });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});