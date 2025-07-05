import express from 'express';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = 5501;
const JWT_SECRET = 'your-secret-key-here';

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

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

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

        const user = {
          id: this.lastID,
          username,
          user_type,
          nome,
          cognome
        };

        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });

        res.json({ 
          success: true, 
          userId: this.lastID,
          token,
          user
        });
      }
    );

  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

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

      const tokenUser = {
        id: user.id,
        username: user.username,
        user_type: user.user_type,
        nome: user.nome,
        cognome: user.cognome
      };

      const token = jwt.sign(tokenUser, JWT_SECRET, { expiresIn: '1h' });

      res.json({
        token,
        user: tokenUser
      });
    });
  });
});

app.get('/user-data', authenticateToken, (req, res) => {
  db.get('SELECT * FROM utenti WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(404).json({ error: "User not found" });

    const { password_hash, ...userData } = user;
    res.json(userData);
  });
});

app.put('/users/:id', authenticateToken, (req, res) => {
  const { nome, cognome, email, telefono, luogo_nascita, specialization } = req.body;
  const userId = req.params.id;

  if (req.user.id != userId) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (!nome || !cognome) {
    return res.status(400).json({ error: "First and last name are required" });
  }

  db.run(
    `UPDATE utenti SET 
      nome = ?, 
      cognome = ?, 
      email = ?, 
      telefono = ?, 
      luogo_nascita = ?,
      specialization = ?
     WHERE id = ?`,
    [nome, cognome, email || null, telefono || null, luogo_nascita || null, specialization || null, userId],
    function(err) {
      if (err) return res.status(500).json({ error: "Database error" });
      db.get('SELECT * FROM utenti WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(500).json({ error: "Failed to fetch updated user" });
        const { password_hash, ...userData } = user;
        res.json(userData);
      });
    }
  );
});

app.get('/doctors', (req, res) => {
  db.all('SELECT id, nome, cognome, specialization FROM utenti WHERE user_type = "doctor"', (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(rows);
  });
});

app.post('/appointments', authenticateToken, (req, res) => {
  const { doctor_id, date, time } = req.body;
  const user_id = req.user.id;
  const username = req.user.username;

  if (!doctor_id || !date || !time) {
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

// Updated GET /appointments with filters and pagination
app.get('/appointments', authenticateToken, (req, res) => {
  const user_id = req.user.id;
  const { date, status, page = 1, limit = 10, order = 'asc' } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const whereClauses = [`a.user_id = ?`, `a.status != 'cancelled'`];
  const params = [user_id];

  if (date) {
    whereClauses.push('a.date = ?');
    params.push(date);
  }

  if (status) {
    whereClauses.push('a.status = ?');
    params.push(status);
  }

  const where = whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : '';

  db.all(
    `SELECT a.*, d.nome as doctor_nome, d.cognome as doctor_cognome, d.specialization
     FROM appointments a
     JOIN utenti d ON a.doctor_id = d.id
     ${where}
     ORDER BY a.date ${order.toUpperCase()}, a.time ${order.toUpperCase()}
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset],
    (err, appointments) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json({ page: parseInt(page), limit: parseInt(limit), appointments });
    }
  );
});

// Updated GET /doctor/appointments with filters and pagination
app.get('/doctor/appointments', authenticateToken, (req, res) => {
  const doctorId = req.user.id;
  const { date, status, page = 1, limit = 10, order = 'asc' } = req.query;

  if (req.user.user_type !== 'doctor') {
    return res.status(403).json({ error: "Only doctors can access this endpoint" });
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const whereClauses = [`a.doctor_id = ?`];
  const params = [doctorId];

  if (date) {
    whereClauses.push('a.date = ?');
    params.push(date);
  }

  if (status) {
    whereClauses.push('a.status = ?');
    params.push(status);
  }

  const where = whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : '';

  db.all(
    `SELECT a.id, a.date, a.time, a.status,
            u.nome, u.cognome, u.codice_fiscale, u.telefono
     FROM appointments a
     JOIN utenti u ON a.user_id = u.id
     ${where}
     ORDER BY a.date ${order.toUpperCase()}, a.time ${order.toUpperCase()}
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset],
    (err, appointments) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json({ page: parseInt(page), limit: parseInt(limit), appointments });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
