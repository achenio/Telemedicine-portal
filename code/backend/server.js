import express from 'express';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch';
import url from 'url';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

// ==================== Configuration ====================
const app = express();
const PORT = 5501;
const JWT_SECRET = 'your-secret-key-here';

// Email configuration
const CLIENT_ID = 'b4ebe754-d2ce-412a-bee5-c06f87a50cd2';
const CLIENT_SECRET = 'dVh8Q~hTU07Kf4otVIy-zfOl~37PlyxHJdNJNawp';
const TENANT_ID = '97a29f68-d5d4-46b2-b6b3-c1436a513f32';
const REDIRECT_URI = 'http://localhost:5501/auth/email/callback';
const FROM_EMAIL = 'noreply@telemedicineportal.run.place';
const RESET_PASSWORD_SUBJECT = 'Reset Your Password - Telemedicine Portal';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_PATH = path.join(__dirname, 'token.json');

// File upload configuration
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ==================== Middleware Setup ====================
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File upload middleware
const upload = multer({
  dest: uploadsDir,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// ==================== Database Setup ====================
const db = new sqlite3.Database('./utenti.db', (err) => {
  if (err) {
    console.error("DB Error:", err);
    process.exit(1);
  }
  console.log('Connected to SQLite DB.');
});

// Initialize database tables
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
      specialization TEXT,
      bio TEXT,
      specialties TEXT,
      rating REAL DEFAULT 0,
      two_factor_secret TEXT,
      two_factor_backup_codes TEXT
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
      payment_method TEXT,
      insurance_package TEXT,
      FOREIGN KEY(user_id) REFERENCES utenti(id),
      FOREIGN KEY(doctor_id) REFERENCES utenti(id)
    )
  `);

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

  db.run(`
    CREATE TABLE IF NOT EXISTS reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY(user_id) REFERENCES utenti(id)
    )
  `);

  // Aggiungi colonna two_factor_secret se non esiste
  db.run(`
    ALTER TABLE utenti ADD COLUMN two_factor_secret TEXT;
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding two_factor_secret column:', err);
    }
  });

  // Aggiungi colonna two_factor_backup_codes se non esiste
  db.run(`
    ALTER TABLE utenti ADD COLUMN two_factor_backup_codes TEXT;
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding two_factor_backup_codes column:', err);
    }
  });
});

// ==================== Email Template Function ====================
function getEmailTemplate(title, content) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
      <style>
        :root {
          --bg: #fefefe;
          --text: #1c1c1e;
          --subtext: #555;
          --primary: #007aff;
          --card: #ffffff;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: var(--bg);
          color: var(--text);
          line-height: 1.6;
          overflow-x: hidden;
          padding: 20px;
        }

        .header {
          position: relative;
          background-color: var(--card);
          padding: 2rem 1.5rem;
          text-align: center;
          border-radius: 16px 16px 0 0;
        }

        .header h1 {
          font-size: 2rem;
          margin-bottom: 1rem;
          color: var(--primary);
        }

        .content {
          background-color: var(--card);
          padding: 2rem;
          border-radius: 0 0 16px 16px;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05);
        }

        .button {
          display: inline-block;
          padding: 0.8rem 1.5rem;
          background-color: var(--primary);
          color: white;
          text-decoration: none;
          border-radius: 25px;
          font-weight: bold;
          margin: 1rem 0;
        }

        .button:hover {
          background-color: #005fcc;
        }

        .footer {
          text-align: center;
          margin-top: 2rem;
          color: var(--subtext);
          font-size: 0.9rem;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Telemedicine Portal</h1>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Telemedicine Portal. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;
}

// ==================== Email Token Management ====================
function loadToken() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    }
    return {};
  } catch (err) {
    console.error('Error loading token:', err);
    return {};
  }
}

function saveToken(data) {
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving token:', err);
  }
}

function isTokenExpired(tokenData) {
  if (!tokenData || !tokenData.expires_at) return true;
  return Date.now() > (tokenData.expires_at - 60000); // expires 1 min before
}

async function getAccessToken() {
  let tokenData = loadToken();

  if (!tokenData.refresh_token) {
    throw new Error("No refresh token available. Please authenticate first by visiting /auth/email");
  }

  if (!isTokenExpired(tokenData)) {
    return tokenData.access_token;
  }

  console.log("Refreshing access token...");

  try {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: tokenData.refresh_token,
      redirect_uri: REDIRECT_URI,
      scope: 'https://graph.microsoft.com/.default'
    });

    const response = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Token refresh error: ${JSON.stringify(data)}`);
    }

    tokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokenData.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000)
    };

    saveToken(tokenData);
    console.log("Token refreshed successfully");
    return tokenData.access_token;
  } catch (err) {
    console.error('Error refreshing token:', err);
    throw err;
  }
}

// ==================== Password Reset Functions ====================
async function generateResetToken(userId) {
  // Delete any existing tokens for this user
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM reset_tokens WHERE user_id = ?', [userId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  // Generate new token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000); // 1 hour
  
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, resetToken, expiresAt.toISOString()],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  return resetToken;
}

async function verifyResetToken(userId, token) {
  const tokenRecord = await new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM reset_tokens WHERE user_id = ? AND token = ? AND expires_at > ?',
      [userId, token, new Date().toISOString()],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
  
  return !!tokenRecord;
}

async function sendResetPasswordEmail(email, resetLink) {
  try {
    const accessToken = await getAccessToken();

    const emailContent = {
      message: {
        subject: RESET_PASSWORD_SUBJECT,
        body: {
          contentType: "HTML",
          content: getEmailTemplate(
            'Password Reset Request',
            `
              <h2>Password Reset Request</h2>
              <p>You requested to reset your password for your Telemedicine Portal account.</p>
              <p>Click the button below to set a new password:</p>
              <a href="${resetLink}" class="button">Reset Password</a>
              <p>This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
              <p style="font-size: 0.8em; color: var(--subtext);">Or copy and paste this link into your browser: ${resetLink}</p>
            `
          )
        },
        toRecipients: [{
          emailAddress: { address: email }
        }],
        from: {
          emailAddress: { address: FROM_EMAIL }
        }
      },
      saveToSentItems: "true"
    };

    const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailContent)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Email sending failed: ${JSON.stringify(error)}`);
    }

    return true;
  } catch (error) {
    console.error('Error sending reset password email:', error);
    throw error;
  }
}

// ==================== Email Authentication Routes ====================
app.get('/auth/email', (req, res) => {
  const authUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_mode=query` +
    `&scope=https%3A%2F%2Fgraph.microsoft.com%2Fmail.send%20offline_access` +
    `&state=12345`;
  
  res.redirect(authUrl);
});

app.get('/auth/email/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`Error: ${error_description || error}`);
  }

  if (!code) {
    return res.status(400).send('Authorization code missing');
  }

  try {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: 'https://graph.microsoft.com/mail.send offline_access'
    });

    const response = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
    }

    const tokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000)
    };

    saveToken(tokenData);
    
    res.send(`
      <html>
        <head>
          <title>Email Authentication Successful</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: green; font-size: 24px; }
            .btn { 
              display: inline-block; 
              margin-top: 20px; 
              padding: 10px 20px; 
              background-color: #4CAF50; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
            }
          </style>
        </head>
        <body>
          <div class="success">✅ Email authentication successful!</div>
          <p>You can now close this window or return to the application.</p>
          <a href="http://localhost:5500" class="btn">Return to App</a>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(500).send(`
      <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: red; font-size: 24px; }
          </style>
        </head>
        <body>
          <div class="error">❌ Authentication failed</div>
          <p>${err.message}</p>
        </body>
      </html>
    `);
  }
});

// Send email function (HTML version) with better error handling
async function sendEmail(to, subject, htmlContent) {
  try {
    let accessToken;
    try {
      accessToken = await getAccessToken();
    } catch (err) {
      if (err.message.includes('No refresh token available')) {
        throw new Error('Email not configured. Please authenticate first by visiting /auth/email');
      }
      throw err;
    }

    const email = {
      message: {
        subject: subject,
        body: {
          contentType: "HTML",
          content: htmlContent
        },
        toRecipients: [
          {
            emailAddress: {
              address: to
            }
          }
        ],
        from: {
          emailAddress: {
            address: FROM_EMAIL
          }
        }
      },
      saveToSentItems: "true"
    };

    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(email)
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(`Email send error: ${JSON.stringify(error)}`);
    }

    console.log('Email sent successfully to:', to);
    return true;
  } catch (err) {
    console.error('Error sending email:', err.message);
    throw err;
  }
}

// ==================== Password Reset Routes ====================
app.post('/auth/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM utenti WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      return res.status(200).json({
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    const resetToken = await generateResetToken(user.id);
    const resetLink = `http://localhost:5500/frontend/reset_password.html?token=${resetToken}&id=${user.id}`;

    await sendResetPasswordEmail(user.email, resetLink);

    res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been sent'
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Error processing password reset request' });
  }
});

app.post('/auth/reset-password', async (req, res) => {
  try {
    const { userId, token, newPassword } = req.body;
    const isValidToken = await verifyResetToken(userId, token);
    
    if (!isValidToken) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM utenti WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE utenti SET password_hash = ? WHERE id = ?',
        [hashedPassword, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM reset_tokens WHERE user_id = ? AND token = ?',
        [userId, token],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

app.get('/reset-password', (req, res) => {
    const { token, id } = req.query;
    if (!token || !id) {
        return res.status(400).json({ error: 'Invalid reset link' });
    }
    
    verifyResetToken(id, token).then(isValid => {
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }
        
        // Restituisci solo un JSON confermando che il token è valido
        res.json({ valid: true });
    }).catch(err => {
        res.status(500).json({ error: 'Server error' });
    });
});

// ==================== 2FA Routes ====================

// Genera segreto e QR code per 2FA
app.post('/2fa/setup', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Genera un segreto temporaneo
    const secret = speakeasy.generateSecret({
      name: `Telemedicine Portal (${user.username})`,
      issuer: 'Telemedicine Portal'
    });
    
    // Genera QR code come data URL
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    
    res.json({
      secret: secret.base32,
      qrCodeUrl,
      manualEntryCode: secret.base32
    });
    
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ error: 'Failed to setup 2FA' });
  }
});

// Verifica e attiva 2FA
app.post('/2fa/verify', authenticateToken, async (req, res) => {
  try {
    const { token, secret } = req.body;
    const user = req.user;
    
    // Verifica il token
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 1
    });
    
    if (!verified) {
      return res.status(400).json({ error: 'Invalid 2FA code' });
    }
    
    // Genera codici di backup
    const backupCodes = Array.from({ length: 10 }, () => 
      crypto.randomBytes(5).toString('hex').toUpperCase()
    );
    
    // Hash dei codici di backup
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => bcrypt.hash(code, 10))
    );
    
    // Salva il segreto e i codici di backup nel database
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE utenti SET two_factor_secret = ?, two_factor_backup_codes = ? WHERE id = ?',
        [secret, JSON.stringify(hashedBackupCodes), user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    res.json({ 
      success: true, 
      message: '2FA activated successfully',
      backupCodes // Invia i codici in chiaro solo questa volta
    });
    
  } catch (err) {
    console.error('2FA verify error:', err);
    res.status(500).json({ error: 'Failed to activate 2FA' });
  }
});

// Disattiva 2FA
app.post('/2fa/disable', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Rimuovi il segreto e i codici di backup dal database
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE utenti SET two_factor_secret = NULL, two_factor_backup_codes = NULL WHERE id = ?',
        [user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    res.json({ success: true, message: '2FA disabled successfully' });
    
  } catch (err) {
    console.error('2FA disable error:', err);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// Verifica token 2FA durante il login
app.post('/2fa/validate', async (req, res) => {
  try {
    const { username, token } = req.body;
    
    if (!username || !token) {
      return res.status(400).json({ error: 'Username and token required' });
    }
    
    // Ottieni l'utente e il suo segreto 2FA
    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, username, two_factor_secret, two_factor_backup_codes FROM utenti WHERE username = ?',
        [username],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    if (!user.two_factor_secret) {
      return res.status(400).json({ error: '2FA not enabled for this user' });
    }
    
    // Prima verifica con il codice TOTP normale
    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token: token,
      window: 1
    });
    
    if (verified) {
      return res.json({ success: true, message: '2FA verification successful' });
    }
    
    // Se il codice TOTP non è valido, verifica i codici di backup
    if (user.two_factor_backup_codes) {
      const backupCodes = JSON.parse(user.two_factor_backup_codes);
      
      for (const hashedCode of backupCodes) {
        const match = await bcrypt.compare(token, hashedCode);
        if (match) {
          // Rimuovi il codice di backup usato
          const updatedCodes = backupCodes.filter(code => code !== hashedCode);
          
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE utenti SET two_factor_backup_codes = ? WHERE id = ?',
              [JSON.stringify(updatedCodes), user.id],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          
          return res.json({ 
            success: true, 
            message: '2FA verification successful (backup code used)',
            remainingBackupCodes: updatedCodes.length
          });
        }
      }
    }
    
    return res.status(400).json({ error: 'Invalid 2FA code' });
    
  } catch (err) {
    console.error('2FA validation error:', err);
    res.status(500).json({ error: 'Failed to validate 2FA code' });
  }
});

// Genera nuovi codici di backup
app.post('/2fa/regenerate-backup-codes', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.two_factor_secret) {
      return res.status(400).json({ error: '2FA not enabled for this user' });
    }
    
    // Genera 10 nuovi codici di backup
    const backupCodes = Array.from({ length: 10 }, () => 
      crypto.randomBytes(5).toString('hex').toUpperCase()
    );
    
    // Hash dei nuovi codici di backup
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => bcrypt.hash(code, 10))
    );
    
    // Salva i nuovi codici nel database
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE utenti SET two_factor_backup_codes = ? WHERE id = ?',
        [JSON.stringify(hashedBackupCodes), user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    res.json({ 
      success: true, 
      message: 'Backup codes regenerated',
      backupCodes // Invia i nuovi codici in chiaro
    });
    
  } catch (err) {
    console.error('Regenerate backup codes error:', err);
    res.status(500).json({ error: 'Failed to regenerate backup codes' });
  }
});

// ==================== Authentication Middleware ====================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Token verification error:', err);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    // Verifica se è un token parziale che richiede 2FA
    if (user.requires2FA) {
      return res.status(403).json({ 
        error: '2FA required',
        requires2FA: true
      });
    }
    
    req.user = user;
    next();
  });
}

function checkUserType(allowedTypes) {
  return (req, res, next) => {
    if (!allowedTypes.includes(req.user.user_type)) {
      return res.status(403).json({ error: `Access restricted to ${allowedTypes.join(', ')} users` });
    }
    next();
  };
}

// ==================== Error Handling Middleware ====================
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// ==================== User Routes ====================
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT * FROM utenti WHERE username = ?', [username], (err, user) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    bcrypt.compare(password, user.password_hash, async (err, match) => {
      if (err) {
        console.error('Password comparison error:', err);
        return res.status(500).json({ error: 'Password verification error' });
      }
      if (!match) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      // Verifica se l'utente ha 2FA abilitato
      if (user.two_factor_secret) {
        // Restituisci un token parziale che indica che è richiesta la 2FA
        const tempToken = jwt.sign(
          { 
            id: user.id,
            username: user.username,
            requires2FA: true 
          }, 
          JWT_SECRET, 
          { expiresIn: '5m' }
        );
        
        return res.json({
          requires2FA: true,
          tempToken
        });
      }

      // Se non c'è 2FA, procedi con il login normale
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

app.post('/login/complete', async (req, res) => {
  try {
    const { tempToken, twoFAToken } = req.body;
    
    if (!tempToken || !twoFAToken) {
      return res.status(400).json({ error: 'Temporary token and 2FA token required' });
    }
    
    // Verifica il token temporaneo
    const decoded = jwt.verify(tempToken, JWT_SECRET);
    
    if (!decoded.requires2FA || !decoded.id) {
      return res.status(400).json({ error: 'Invalid temporary token' });
    }
    
    // Ottieni l'utente e verifica il token 2FA
    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM utenti WHERE id = ?',
        [decoded.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.two_factor_secret) {
      return res.status(400).json({ error: '2FA not enabled for this user' });
    }
    
    // Verifica il token 2FA
    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token: twoFAToken,
      window: 1
    });
    
    if (!verified) {
      // Se il codice TOTP non è valido, verifica i codici di backup
      if (user.two_factor_backup_codes) {
        const backupCodes = JSON.parse(user.two_factor_backup_codes);
        
        for (const hashedCode of backupCodes) {
          const match = await bcrypt.compare(twoFAToken, hashedCode);
          if (match) {
            // Rimuovi il codice di backup usato
            const updatedCodes = backupCodes.filter(code => code !== hashedCode);
            
            await new Promise((resolve, reject) => {
              db.run(
                'UPDATE utenti SET two_factor_backup_codes = ? WHERE id = ?',
                [JSON.stringify(updatedCodes), user.id],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            
            // Procedi con il login
            break;
          }
        }
        
        if (!match) {
          return res.status(400).json({ error: 'Invalid 2FA code' });
        }
      } else {
        return res.status(400).json({ error: 'Invalid 2FA code' });
      }
    }
    
    // Se tutto è corretto, genera il token finale
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
    
  } catch (err) {
    console.error('Login completion error:', err);
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(400).json({ error: 'Invalid token' });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Temporary token expired' });
    }
    
    res.status(500).json({ error: 'Login completion failed' });
  }
});

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
      nome, 
      cognome, 
      codice_fiscale, 
      luogo_nascita || null, 
      data_nascita || null,
      email || null, 
      telefono || null, 
      username, 
      password_hash, 
      user_type, 
      specialization || null,
      function(err) {
        if (err) {
          console.error('Registration error:', err);
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

        if (email) {
          const welcomeEmail = getEmailTemplate(
            'Welcome to Telemedicine Portal',
            `
              <h2>Welcome to Telemedicine Portal!</h2>
              <p>Dear ${nome} ${cognome},</p>
              <p>Your registration has been completed successfully.</p>
              <p>Your login details:</p>
              <ul>
                <li><strong>Username:</strong> ${username}</li>
                <li><strong>Account type:</strong> ${user_type}</li>
              </ul>
              <p>You can access your account at: <a href="http://localhost:5500/frontend/dashboard.html">http://localhost:5500/frontend/dashboard.html</a></p>
              <p>Thank you for choosing our service!</p>
              <a href="http://localhost:5500/frontend/dashboard.html" class="button">Access Your Account</a>
            `
          );
          
          sendEmail(email, 'Welcome to Telemedicine Portal', welcomeEmail)
            .catch(err => console.error('Error sending welcome email:', err));
        }

        res.json({ 
          success: true, 
          userId: this.lastID,
          token,
          user
        });
      }
    );
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get('/user-data', authenticateToken, (req, res) => {
  db.get('SELECT * FROM utenti WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { password_hash, two_factor_secret, two_factor_backup_codes, ...userData } = user;
    
    // Aggiungi flag per indicare se 2FA è abilitato
    userData.twoFactorEnabled = !!two_factor_secret;
    
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
      if (err) {
        console.error('Update user error:', err);
        return res.status(500).json({ error: "Database error" });
      }
      
      db.get('SELECT * FROM utenti WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
          console.error('Fetch updated user error:', err);
          return res.status(500).json({ error: "Failed to fetch updated user" });
        }
        const { password_hash, two_factor_secret, two_factor_backup_codes, ...userData } = user;
        res.json(userData);
      });
    }
  );
});

// ==================== Doctor Routes ====================
app.get('/doctors', (req, res) => {
  db.all("SELECT id, nome, cognome, specialization, bio, specialties, rating FROM utenti WHERE user_type='doctor'", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ==================== Appointment Routes ====================
app.post('/appointments', authenticateToken, upload.single('medical_report'), async (req, res) => {
  try {
    const { doctor_id, date, time, payment_method, insurance_package } = req.body;
    const user_id = req.user.id;
    const username = req.user.username;

    if (!doctor_id || !date || !time || !payment_method) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (payment_method === 'insurance' && !insurance_package) {
      return res.status(400).json({ error: "Insurance package required when payment method is insurance" });
    }

    if (user_id == doctor_id) {
      return res.status(403).json({ error: "Cannot book an appointment with yourself" });
    }

    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM utenti WHERE id = ?', [user_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const doctor = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM utenti WHERE id = ? AND user_type = "doctor"', [doctor_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!doctor) {
      return res.status(400).json({ error: "Invalid doctor" });
    }

    const existing = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM appointments 
         WHERE doctor_id = ? AND date = ? AND time = ? 
         AND status IN ('booked', 'confirmed')`,
        [doctor_id, date, time],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (existing) {
      return res.status(409).json({ error: "Time slot already booked" });
    }

    let medicalReportUrl = null;
    if (req.file) {
      try {
        const ext = path.extname(req.file.originalname || '.pdf');
        const newFilename = `report_${Date.now()}_${user_id}${ext}`;
        const newPath = path.join(uploadsDir, newFilename);
        
        await fs.promises.rename(req.file.path, newPath);
        medicalReportUrl = `/uploads/${newFilename}`;
      } catch (err) {
        console.error('File upload error:', err);
        return res.status(500).json({ error: "Failed to save medical report" });
      }
    }

    const result = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO appointments 
         (user_id, username, date, time, doctor_id, doctor_name, status, medical_report_url, payment_method, insurance_package) 
         VALUES (?, ?, ?, ?, ?, ?, 'booked', ?, ?, ?)`,
        [
          user_id, 
          username, 
          date, 
          time, 
          doctor_id, 
          `${doctor.nome} ${doctor.cognome}`,
          medicalReportUrl,
          payment_method,
          payment_method === 'insurance' ? insurance_package : null
        ],
        function(err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });

    try {
      if (user.email) {
        const patientEmailContent = getEmailTemplate(
          'Appointment Booked',
          `
            <h2>Appointment Booked</h2>
            <p>Dear ${user.nome} ${user.cognome},</p>
            <p>Your appointment has been successfully booked.</p>
            <p><strong>Appointment details:</strong></p>
            <ul>
              <li><strong>Doctor:</strong> ${doctor.nome} ${doctor.cognome}</li>
              <li><strong>Date:</strong> ${date}</li>
              <li><strong>Time:</strong> ${time}</li>
              <li><strong>Payment method:</strong> ${payment_method}${payment_method === 'insurance' ? ` (${insurance_package})` : ''}</li>
            </ul>
            <p>You can view your appointments in your profile.</p>
            <a href="http://localhost:5500/frontend/bookings.html" class="button">View Appointments</a>
          `
        );
        
        await sendEmail(user.email, 'Appointment Confirmation', patientEmailContent);
      }

      if (doctor.email) {
        const doctorEmailContent = getEmailTemplate(
          'New Appointment Booked',
          `
            <h2>New Appointment Booked</h2>
            <p>Dr. ${doctor.cognome},</p>
            <p>A new appointment has been booked with you.</p>
            <p><strong>Appointment details:</strong></p>
            <ul>
              <li><strong>Patient:</strong> ${user.nome} ${user.cognome}</li>
              <li><strong>Date:</strong> ${date}</li>
              <li><strong>Time:</strong> ${time}</li>
            </ul>
            <a href="http://localhost:5500/frontend/doctor-appointments.html" class="button">View Appointment</a>
          `
        );
        
        await sendEmail(doctor.email, 'New Appointment Booked', doctorEmailContent);
      }
    } catch (err) {
      console.error('Email send error:', err);
    }

    res.json({ 
      success: true, 
      appointmentId: result.lastID, 
      medical_report_url: medicalReportUrl 
    });

  } catch (err) {
    console.error('Book appointment error:', err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get('/appointments', authenticateToken, (req, res) => {
  const user_id = req.user.id;
  const { date, status, page = 1, limit = 10, order = 'asc' } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const whereClauses = [`a.user_id = ?`];
  const params = [user_id];

  if (date) {
    whereClauses.push('a.date = ?');
    params.push(date);
  }

  if (status) {
    whereClauses.push('a.status = ?');
    params.push(status);
  } else {
    whereClauses.push(`a.status != 'cancelled'`);
  }

  const where = whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : '';

// Modifica la query per includere le note
  db.all(
    `SELECT a.*, d.nome as doctor_nome, d.cognome as doctor_cognome, d.specialization
    FROM appointments a
    JOIN utenti d ON a.doctor_id = d.id
    ${where}
    ORDER BY a.date ${order.toUpperCase()}, a.time ${order.toUpperCase()}
    LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset],
    (err, appointments) => {
      if (err) {
        console.error('Get appointments error:', err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json({ 
        page: parseInt(page), 
        limit: parseInt(limit), 
        appointments 
      });
    }
  );
});

app.get('/doctor/appointments', authenticateToken, checkUserType(['doctor']), (req, res) => {
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
      if (err) {
        console.error('Get doctor appointments error:', err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json(appointments);
    }
  );
});

app.get('/patient/doctors-with-conversations', authenticateToken, checkUserType(['patient']), (req, res) => {
  db.all(
    `SELECT DISTINCT u.id, u.nome, u.cognome, u.specialization
     FROM messages m
     JOIN utenti u ON m.sender_id = u.id OR m.receiver_id = u.id
     WHERE (m.sender_id = ? OR m.receiver_id = ?) 
     AND u.user_type = 'doctor'
     UNION
     SELECT DISTINCT u.id, u.nome, u.cognome, u.specialization
     FROM appointments a
     JOIN utenti u ON a.doctor_id = u.id
     WHERE a.user_id = ? AND u.user_type = 'doctor'
     ORDER BY cognome, nome`,
    [req.user.id, req.user.id, req.user.id],
    (err, doctors) => {
      if (err) {
        console.error('Get doctors with conversations error:', err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json(doctors);
    }
  );
});

app.delete('/appointments/:id', authenticateToken, async (req, res) => {
  const appointmentId = req.params.id;
  const userId = req.user.id;

  try {
    const appointment = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM appointments WHERE id = ?', [appointmentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (appointment.user_id !== userId && appointment.doctor_id !== userId) {
      return res.status(403).json({ error: "Unauthorized to cancel this appointment" });
    }

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE appointments SET status = "cancelled" WHERE id = ?',
        [appointmentId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM utenti WHERE id = ?', [appointment.user_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const doctor = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM utenti WHERE id = ?', [appointment.doctor_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    try {
      if (user && user.email) {
        const patientEmailContent = getEmailTemplate(
          'Appointment Cancelled',
          `
            <h2>Appointment Cancelled</h2>
            <p>Dear ${user.nome} ${user.cognome},</p>
            <p>Your appointment with Dr. ${doctor.cognome} has been cancelled.</p>
            <p><strong>Appointment details:</strong></p>
            <ul>
              <li><strong>Date:</strong> ${appointment.date}</li>
              <li><strong>Time:</strong> ${appointment.time}</li>
            </ul>
            <p>You can book a new appointment from your profile.</p>
            <a href="http://localhost:5500/frontend/appointments.html" class="button">Book New Appointment</a>
          `
        );
        
        await sendEmail(user.email, 'Appointment Cancelled', patientEmailContent);
      }

      if (doctor && doctor.email) {
        const doctorEmailContent = getEmailTemplate(
          'Appointment Cancelled',
          `
            <h2>Appointment Cancelled</h2>
            <p>Dr. ${doctor.cognome},</p>
            <p>The appointment with ${user.nome} ${user.cognome} has been cancelled.</p>
            <p><strong>Appointment details:</strong></p>
            <ul>
              <li><strong>Date:</strong> ${appointment.date}</li>
              <li><strong>Time:</strong> ${appointment.time}</li>
            </ul>
          `
        );
        
        await sendEmail(doctor.email, 'Appointment Cancelled', doctorEmailContent);
      }
    } catch (err) {
      console.error('Email send error:', err);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Cancel appointment error:', err);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch('/appointments/:id', authenticateToken, checkUserType(['doctor']), async (req, res) => {
  const { status } = req.body;
  const appointmentId = req.params.id;
  const userId = req.user.id;

  if (!status || !['confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const appointment = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM appointments WHERE id = ?', [appointmentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (appointment.doctor_id !== userId) {
      return res.status(403).json({ error: "Only the assigned doctor can update appointment status" });
    }

    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE appointments SET status = ? WHERE id = ?',
        [status, appointmentId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    try {
      const user = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM utenti WHERE id = ?', [appointment.user_id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (user && user.email) {
        let subject = '';
        let content = '';
        
        if (status === 'confirmed') {
          subject = 'Appointment Confirmed';
          content = getEmailTemplate(
            'Appointment Confirmed',
            `
              <h2>Appointment Confirmed</h2>
              <p>Dear ${user.nome} ${user.cognome},</p>
              <p>Dr. ${req.user.cognome} has confirmed your appointment.</p>
              <p><strong>Appointment details:</strong></p>
              <ul>
                <li><strong>Date:</strong> ${appointment.date}</li>
                <li><strong>Time:</strong> ${appointment.time}</li>
              </ul>
              <a href="http://localhost:5500/frontend/appointments.html" class="button">View Appointment</a>
            `
          );
        } else if (status === 'completed') {
          subject = 'Appointment Completed';
          content = getEmailTemplate(
            'Appointment Completed',
            `
              <h2>Appointment Completed</h2>
              <p>Dear ${user.nome} ${user.cognome},</p>
              <p>Your appointment with Dr. ${req.user.cognome} has been completed.</p>
              <p>You can view the medical report in your profile.</p>
              <a href="http://localhost:5500/frontend/appointments.html" class="button">View Report</a>
            `
          );
        }
        
        if (subject && content) {
          await sendEmail(user.email, subject, content);
        }
      }
    } catch (err) {
      console.error('Email send error:', err);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Update appointment status error:', err);
    res.status(500).json({ error: "Server error" });
  }
});

// ==================== Messaging Routes ====================
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
      if (err) {
        console.error('Send message error:', err);
        return res.status(500).json({ error: "Database error" });
      }
      
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
      if (err) {
        console.error('Get conversation error:', err);
        return res.status(500).json({ error: "Database error" });
      }
      
      db.run(
        `UPDATE messages SET is_read = TRUE 
         WHERE receiver_id = ? AND sender_id = ? AND is_read = FALSE`,
        [userId, otherUserId],
        (err) => {
          if (err) console.error('Mark messages as read error:', err);
        }
      );
      
      res.json(messages);
    }
  );
});

app.get('/messages/unread-count', authenticateToken, (req, res) => {
  db.get(
    `SELECT COUNT(*) as unread_count 
     FROM messages 
     WHERE receiver_id = ? AND is_read = FALSE`,
    [req.user.id],
    (err, row) => {
      if (err) {
        console.error('Get unread count error:', err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json({ unread_count: row ? row.unread_count : 0 });
    }
  );
});

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
      if (err) {
        console.error('Get conversations error:', err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json(conversations || []);
    }
  );
});

// ==================== Doctor Patient Routes ====================
app.get('/doctor/patients', authenticateToken, checkUserType(['doctor']), (req, res) => {
  db.all(
    `SELECT DISTINCT u.id, u.nome, u.cognome, u.codice_fiscale, u.email, u.telefono
     FROM appointments a
     JOIN utenti u ON a.user_id = u.id
     WHERE a.doctor_id = ? AND u.user_type = 'patient'`,
    [req.user.id],
    (err, patients) => {
      if (err) {
        console.error('Get doctor patients error:', err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json(patients || []);
    }
  );
});

// ==================== Dashboard Routes ====================
app.get('/dashboard-stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.user_type;
// Add to your server.js
app.get('/health-check', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
    // Ottieni il conteggio degli appuntamenti in programma
    const upcomingAppointments = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count FROM appointments 
         WHERE (user_id = ? OR (doctor_id = ? AND user_type = 'doctor'))
         AND status IN ('booked', 'confirmed')
         AND date >= date('now')`,
        [userId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.count : 0);
        }
      );
    });

    // Ottieni il conteggio dei messaggi non letti
    const unreadMessages = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count FROM messages 
         WHERE receiver_id = ? AND is_read = FALSE`,
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.count : 0);
        }
      );
    });

    // Per pazienti: ottieni prescrizioni pendenti (esempio)
    const pendingPrescriptions = await new Promise((resolve, reject) => {
      if (userType === 'patient') {
        db.get(
          `SELECT COUNT(*) as count FROM prescriptions 
           WHERE patient_id = ? AND status = 'pending'`,
          [userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.count : 0);
          }
        );
      } else {
        resolve(0); // Per i dottori, questo valore non è rilevante
      }
    });

    // Saldo pendente (esempio)
    const outstandingBalance = await new Promise((resolve, reject) => {
      if (userType === 'patient') {
        db.get(
          `SELECT SUM(amount) as total FROM payments 
           WHERE user_id = ? AND status = 'pending'`,
          [userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row && row.total ? row.total : 0);
          }
        );
      } else {
        resolve(0); // Per i dottori, questo valore non è rilevante
      }
    });

    res.json({
      upcomingAppointments,
      unreadMessages,
      pendingPrescriptions,
      outstandingBalance
    });

  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

// Route per ottenere i dettagli completi dell'utente
app.get('/user/profile', authenticateToken, (req, res) => {
  db.get(
    `SELECT id, nome, cognome, email, telefono, user_type, specialization, bio 
     FROM utenti WHERE id = ?`,
    [req.user.id],
    (err, user) => {
      if (err) {
        console.error('User profile error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    }
  );
});

// Route per ottenere gli appuntamenti recenti
app.get('/user/recent-appointments', authenticateToken, (req, res) => {
  const limit = parseInt(req.query.limit) || 3;
  
  db.all(
    `SELECT a.*, d.specialization, d.nome as doctor_nome, d.cognome as doctor_cognome
     FROM appointments a
     JOIN utenti d ON a.doctor_id = d.id
     WHERE a.user_id = ? AND a.status IN ('booked', 'confirmed')
     ORDER BY a.date ASC, a.time ASC
     LIMIT ?`,
    [req.user.id, limit],
    (err, appointments) => {
      if (err) {
        console.error('Recent appointments error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ appointments });
    }
  );
});

// Serve uploaded PDF files
app.use('/uploads', express.static(uploadsDir));

// Start
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`[First time only] To setup email authentication, visit: http://localhost:${PORT}/auth/email`);
});