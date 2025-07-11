import express from 'express';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = 5501;
const JWT_SECRET = 'your-secret-key-here';

app.use(cors());
app.use(express.json());

// Assicurati che la cartella uploads esista
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configurazione upload file
const upload = multer({
  dest: uploadsDir,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  }
});

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
      medical_report_url TEXT,
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

// Endpoint per il login
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

// Endpoint per la registrazione
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

// Endpoint per ottenere i dati dell'utente
app.get('/user-data', authenticateToken, (req, res) => {
  db.get('SELECT * FROM utenti WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(404).json({ error: "User not found" });

    const { password_hash, ...userData } = user;
    res.json(userData);
  });
});

// Endpoint per aggiornare i dati dell'utente
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

// Endpoint per ottenere la lista dei dottori
app.get('/doctors', (req, res) => {
  db.all('SELECT id, nome, cognome, specialization FROM utenti WHERE user_type = "doctor"', (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(rows);
  });
});

// Endpoint per creare un appuntamento con upload file
app.post('/appointments', authenticateToken, upload.single('medical_report'), (req, res) => {
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

          let medicalReportUrl = null;
          if (req.file) {
            const ext = path.extname(req.file.originalname);
            const newFilename = `report_${Date.now()}_${user_id}${ext}`;
            const newPath = path.join(uploadsDir, newFilename);
            fs.renameSync(req.file.path, newPath);
            medicalReportUrl = `/code/backend/uploads/${newFilename}`; // <-- Percorso corretto
          }

          db.run(
            `INSERT INTO appointments (user_id, username, date, time, doctor_id, doctor_name, status, medical_report_url) 
             VALUES (?, ?, ?, ?, ?, ?, 'booked', ?)`,
            [user_id, username, date, time, doctor_id, `${doctor.nome} ${doctor.cognome}`, medicalReportUrl],
            function(err) {
              if (err) return res.status(500).json({ error: "Database error" });
              res.json({ success: true, appointmentId: this.lastID, medical_report_url: medicalReportUrl });
            }
          );
        }
      );
    });
  });
});

// Endpoint per ottenere gli appuntamenti del paziente
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

// Endpoint per ottenere gli appuntamenti del dottore (versione corretta)
app.get('/doctor/appointments', authenticateToken, (req, res) => {
  if (req.user.user_type !== 'doctor') {
    return res.status(403).json({ error: "Only doctors can access this endpoint" });
  }

  const doctorId = req.user.id;
  const { date, status, page = 1, limit = 10, order = 'asc' } = req.query;

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
    `SELECT a.*, u.nome, u.cognome, u.codice_fiscale, u.telefono
     FROM appointments a
     JOIN utenti u ON a.user_id = u.id
     ${where}
     ORDER BY a.date ${order.toUpperCase()}, a.time ${order.toUpperCase()}
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset],
    (err, appointments) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(appointments); // Modificato per restituire direttamente l'array
    }
  );
});

// Aggiungi questo endpoint per ottenere i dottori con cui il paziente ha interagito
app.get('/patient/doctors-with-conversations', authenticateToken, (req, res) => {
  if (req.user.user_type !== 'patient') {
    return res.status(403).json({ error: "Only patients can access this endpoint" });
  }

  db.all(`
    SELECT DISTINCT u.id, u.nome, u.cognome, u.specialization
    FROM messages m
    JOIN utenti u ON m.sender_id = u.id OR m.receiver_id = u.id
    WHERE (m.sender_id = ? OR m.receiver_id = ?) 
    AND u.user_type = 'doctor'
    UNION
    SELECT DISTINCT u.id, u.nome, u.cognome, u.specialization
    FROM appointments a
    JOIN utenti u ON a.doctor_id = u.id
    WHERE a.user_id = ? AND u.user_type = 'doctor'
    ORDER BY cognome, nome
  `, [req.user.id, req.user.id, req.user.id], (err, doctors) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(doctors);
  });
});

// Endpoint per cancellare un appuntamento
app.delete('/appointments/:id', authenticateToken, (req, res) => {
  const appointmentId = req.params.id;
  const userId = req.user.id;

  db.get('SELECT * FROM appointments WHERE id = ?', [appointmentId], (err, appointment) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });

    if (appointment.user_id !== userId && appointment.doctor_id !== userId) {
      return res.status(403).json({ error: "Unauthorized to cancel this appointment" });
    }

    db.run(
      'UPDATE appointments SET status = "cancelled" WHERE id = ?',
      [appointmentId],
      function(err) {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ success: true });
      }
    );
  });
});


// Endpoint per aggiornare lo stato di un appuntamento
app.patch('/appointments/:id', authenticateToken, (req, res) => {
  const { status } = req.body;
  const appointmentId = req.params.id;
  const userId = req.user.id;

  if (!status || !['confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  db.get('SELECT * FROM appointments WHERE id = ?', [appointmentId], (err, appointment) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });

    // Solo il dottore può cambiare lo stato
    if (appointment.doctor_id !== userId) {
      return res.status(403).json({ error: "Only the assigned doctor can update appointment status" });
    }

    db.run(
      'UPDATE appointments SET status = ? WHERE id = ?',
      [status, appointmentId],
      function(err) {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ success: true });
      }
    );
  });
});
// Aggiungi questa parte al server.js prima dell'avvio del server

// Creazione tabella messaggi
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE,
    sender_type TEXT NOT NULL CHECK(sender_type IN ('patient', 'doctor')),
    FOREIGN KEY(sender_id) REFERENCES utenti(id),
    FOREIGN KEY(receiver_id) REFERENCES utenti(id)
  )
`);

// Endpoint per inviare un messaggio
app.post('/messages', authenticateToken, (req, res) => {
  const { receiver_id, content } = req.body;
  const sender_id = req.user.id;
  
  if (!receiver_id || !content) {
    return res.status(400).json({ error: "Receiver ID and content are required" });
  }

  db.run(
    `INSERT INTO messages (sender_id, receiver_id, content, sender_type) 
     VALUES (?, ?, ?, ?)`,
    [sender_id, receiver_id, content, req.user.user_type],
    function(err) {
      if (err) return res.status(500).json({ error: "Database error" });
      
      res.json({
        id: this.lastID,
        sender_id,
        receiver_id,
        content,
        timestamp: new Date().toISOString()
      });
    }
  );
});

// Endpoint per ottenere i messaggi di una conversazione
app.get('/messages/conversation/:otherUserId', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const otherUserId = req.params.otherUserId;

  db.all(
    `SELECT id, sender_id, content, timestamp, sender_type
     FROM messages
     WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
     ORDER BY timestamp ASC`,
    [userId, otherUserId, otherUserId, userId],
    (err, messages) => {
      if (err) return res.status(500).json({ error: "Database error" });
      
      // Segna i messaggi come letti
      db.run(
        `UPDATE messages SET is_read = TRUE 
         WHERE receiver_id = ? AND sender_id = ? AND is_read = FALSE`,
        [userId, otherUserId]
      );
      
      res.json(messages);
    }
  );
});

// Endpoint per ottenere il conteggio dei messaggi non letti
app.get('/messages/unread-count', authenticateToken, (req, res) => {
  db.get(
    `SELECT COUNT(*) as unread_count 
     FROM messages 
     WHERE receiver_id = ? AND is_read = FALSE`,
    [req.user.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json({ unread_count: row.unread_count });
    }
  );
});

// Endpoint per ottenere le conversazioni
app.get('/messages/conversations', authenticateToken, (req, res) => {
  db.all(
    `SELECT 
       CASE 
         WHEN sender_id = ? THEN receiver_id 
         ELSE sender_id 
       END as other_user_id,
       MAX(timestamp) as last_message_time,
       SUM(CASE WHEN receiver_id = ? AND is_read = FALSE THEN 1 ELSE 0 END) as unread_count
     FROM messages
     WHERE sender_id = ? OR receiver_id = ?
     GROUP BY other_user_id
     ORDER BY last_message_time DESC`,
    [req.user.id, req.user.id, req.user.id, req.user.id],
    (err, conversations) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(conversations);
    }
  );
});

// Add this endpoint to server.js to get only patients with appointments for a doctor
app.get('/doctor/patients', authenticateToken, (req, res) => {
  if (req.user.user_type !== 'doctor') {
    return res.status(403).json({ error: "Only doctors can access this endpoint" });
  }

  db.all(
    `SELECT DISTINCT u.id, u.nome, u.cognome, u.codice_fiscale, u.email, u.telefono
     FROM appointments a
     JOIN utenti u ON a.user_id = u.id
     WHERE a.doctor_id = ? AND u.user_type = 'patient'`,
    [req.user.id],
    (err, patients) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(patients);
    }
  );
});

// Servi i file PDF caricati con percorso accessibile da /uploads/filename.pdf
app.use('/uploads', express.static(uploadsDir));


// Avvio del server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
