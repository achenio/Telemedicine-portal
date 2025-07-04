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

// Crea tabelle
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
      user_type TEXT NOT NULL CHECK(user_type IN ('patient', 'doctor', 'admin')),
      specialization TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      doctor_id INTEGER NOT NULL,
      doctor_name TEXT NOT NULL,
      status TEXT DEFAULT 'booked' CHECK(status IN ('booked', 'confirmed', 'cancelled', 'completed')),
      FOREIGN KEY(user_id) REFERENCES utenti(id),
      FOREIGN KEY(doctor_id) REFERENCES utenti(id)
    )
  `);
});

// REGISTER
app.post('/register', async (req, res) => {
  try {
    const { nome, cognome, codice_fiscale, luogo_nascita, data_nascita, email, telefono, username, password, user_type, specialization } = req.body;

    if (!nome || !cognome || !codice_fiscale || !username || !password || !user_type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!['patient', 'doctor', 'admin'].includes(user_type)) {
      return res.status(400).json({ error: "Invalid user_type" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const stmt = db.prepare(`
      INSERT INTO utenti 
      (nome, cognome, codice_fiscale, luogo_nascita, data_nascita, email, telefono, username, password_hash, user_type, specialization) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      nome, cognome, codice_fiscale, luogo_nascita || null, data_nascita || null,
      email || null, telefono || null, username, password_hash, user_type, specialization || null,
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: "User with this username, codice fiscale, email or phone already exists" });
          }
          return res.status(500).json({ error: "Database error" });
        }
        res.json({ success: true, userId: this.lastID });
      }
    );

  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// LOGIN
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT * FROM utenti WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'User not found' });

    bcrypt.compare(password, user.password_hash, (err, match) => {
      if (err) return res.status(500).json({ error: 'Password verification error' });
      if (!match) return res.status(401).json({ error: 'Invalid password' });

      res.json({
        user: {
          id: user.id,
          username: user.username,
          user_type: user.user_type,
          nome: user.nome,
          cognome: user.cognome,
        }
      });
    });
  });
});

// LISTA DOTTORI
app.get('/doctors', (req, res) => {
  db.all('SELECT id, nome, cognome, specialization FROM utenti WHERE user_type = "doctor"', (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(rows);
  });
});

// PRENOTAZIONE APPUNTAMENTO
app.post('/appointments', (req, res) => {
  const { user_id, doctor_id, date, time, username } = req.body;

  if (!user_id || !doctor_id || !date || !time || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (user_id == doctor_id) {
    return res.status(403).json({ error: "Cannot book an appointment with yourself" });
  }

  db.get('SELECT * FROM utenti WHERE id = ?', [user_id], (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(400).json({ error: "User not found" });

    db.get('SELECT * FROM utenti WHERE id = ? AND user_type = "doctor"', [doctor_id], (err, doctor) => {
      if (err || !doctor) return res.status(400).json({ error: "Invalid doctor" });

      db.get(
        `SELECT id FROM appointments 
         WHERE doctor_id = ? AND date = ? AND time = ? 
         AND status IN ('booked', 'confirmed')`,
        [doctor_id, date, time],
        (err, existing) => {
          if (err) return res.status(500).json({ error: "Database error" });
          if (existing) return res.status(409).json({ error: "Time slot already booked" });

          db.run(
            `INSERT INTO appointments (user_id, username, date, time, doctor_id, doctor_name, status) 
             VALUES (?, ?, ?, ?, ?, ?, 'booked')`,
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
});

// GET APPUNTAMENTI PAZIENTE (my bookings)
app.get('/appointments', (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ error: "Username required" });

  db.get('SELECT id FROM utenti WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(404).json({ error: "User not found" });

    db.all(
      `SELECT a.*, d.nome as doctor_nome, d.cognome as doctor_cognome 
       FROM appointments a
       JOIN utenti d ON a.doctor_id = d.id
       WHERE a.user_id = ? AND a.status != 'cancelled'
       ORDER BY a.date, a.time`,
      [user.id],
      (err, appointments) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(appointments);
      }
    );
  });
});

// GET APPUNTAMENTI DOTTORI (tutti gli stati)
app.get('/doctor/appointments', (req, res) => {
  const doctorId = req.query.doctorId;
  if (!doctorId) return res.status(400).json({ error: "Doctor ID required" });

  db.all(
    `SELECT a.id, a.date, a.time, a.status,
            u.nome, u.cognome, u.codice_fiscale
     FROM appointments a
     JOIN utenti u ON a.user_id = u.id
     WHERE a.doctor_id = ?
     ORDER BY a.date, a.time`,
    [doctorId],
    (err, appointments) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(appointments);
    }
  );
});

// AGGIORNA STATO APPUNTAMENTO
app.patch('/appointments/:id', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['booked', 'confirmed', 'cancelled', 'completed'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  db.run(
    `UPDATE appointments SET status = ? WHERE id = ?`,
    [status, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: "Database error" });
      if (this.changes === 0) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      res.json({ success: true });
    }
  );
});

// CANCELLA APPUNTAMENTO (soft delete)
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

// ADMIN: tutte le prenotazioni
app.get('/admin/all-appointments', (req, res) => {
  db.all(`
    SELECT a.id, a.date, a.time, a.status,
           u.nome AS patient_nome, u.cognome AS patient_cognome, u.username AS patient_username,
           d.nome AS doctor_nome, d.cognome AS doctor_cognome, d.username AS doctor_username
    FROM appointments a
    JOIN utenti u ON a.user_id = u.id
    JOIN utenti d ON a.doctor_id = d.id
    ORDER BY a.date, a.time
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(rows);
  });
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
