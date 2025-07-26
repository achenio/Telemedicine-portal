// server.js
import express from 'express';
import { Sequelize, DataTypes } from 'sequelize';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import url from 'url';

dotenv.config();

// Configurazione
const CONFIG = {
  // Microsoft Graph API
  clientId: 'b4ebe754-d2ce-412a-bee5-c06f87a50cd2',
  clientSecret: 'dVh8Q~hTU07Kf4otVIy-zfOl~37PlyxHJdNJNawp',
  tenantId: '97a29f68-d5d4-46b2-b6b3-c1436a513f32',
  redirectUri: 'http://localhost:3000/callback',
  tokenPath: './token.json',
  fromEmail: 'noreply@telemedicineportal.run.place',
  resetPasswordSubject: 'Reset Your Password - Telemedicine Portal'
};

// Setup SQLite database
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false
});

// Definizione modelli
const User = sequelize.define('User', {
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

const Token = sequelize.define('Token', {
  token: {
    type: DataTypes.STRING,
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  }
});

// Relazioni
User.hasMany(Token);
Token.belongsTo(User);

// Setup Express
const app = express();
app.use(cors());
app.use(express.json());

// Helper per la gestione del token OAuth
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadToken() {
  if (fs.existsSync(CONFIG.tokenPath)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.tokenPath, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveToken(data) {
  fs.writeFileSync(CONFIG.tokenPath, JSON.stringify(data, null, 2));
}

function isTokenExpired(tokenData) {
  if (!tokenData || !tokenData.expires_at) return true;
  return Date.now() > (tokenData.expires_at - 60000); // 1 minuto prima
}

async function getAccessToken() {
  let tokenData = loadToken();

  if (!tokenData.refresh_token) {
    throw new Error("No refresh token available");
  }

  if (!isTokenExpired(tokenData)) {
    return tokenData.access_token;
  }

  const params = new URLSearchParams({
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: tokenData.refresh_token,
    redirect_uri: CONFIG.redirectUri,
    scope: 'https://graph.microsoft.com/.default'
  });

  const response = await fetch(`https://login.microsoftonline.com/${CONFIG.tenantId}/oauth2/v2.0/token`, {
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
  return tokenData.access_token;
}

// Servizio Email
async function sendResetPasswordEmail(email, resetLink) {
  try {
    const accessToken = await getAccessToken();

    const emailContent = {
      message: {
        subject: CONFIG.resetPasswordSubject,
        body: {
          contentType: "HTML",
          content: `
            <p>You have requested to reset your password for the Telemedicine Portal.</p>
            <p>Please click the following link to reset your password:</p>
            <p><a href="${resetLink}">${resetLink}</a></p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          `
        },
        toRecipients: [{
          emailAddress: { address: email }
        }],
        from: {
          emailAddress: { address: CONFIG.fromEmail }
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

// Genera token di reset
async function generateResetToken(userId) {
  // Elimina token esistenti per questo utente
  await Token.destroy({ where: { UserId: userId } });
  
  // Genera nuovo token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000); // 1 ora
  
  await Token.create({
    token: resetToken,
    expiresAt,
    UserId: userId
  });

  return resetToken;
}

// Verifica token di reset
async function verifyResetToken(userId, token) {
  const tokenRecord = await Token.findOne({
    where: {
      token,
      UserId: userId,
      expiresAt: { [Sequelize.Op.gt]: new Date() }
    }
  });
  
  return !!tokenRecord;
}

// Controller per il reset password
app.post('/api/auth/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      return res.status(200).json({
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    const resetToken = await generateResetToken(user.id);
    const resetLink = `${req.headers.origin}/reset-password?token=${resetToken}&id=${user.id}`;
    await sendResetPasswordEmail(user.email, resetLink);

    res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been sent'
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Error processing password reset request' });
  }
});

// Controller per conferma reset password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { userId, token, newPassword } = req.body;
    const isValidToken = await verifyResetToken(userId, token);
    
    if (!isValidToken) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await user.update({ password: hashedPassword });

    await Token.destroy({ where: { UserId: userId, token } });
    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

// Sincronizza il database e avvia il server
sequelize.sync()
  .then(() => {
    console.log('Database connected and synced');
    const PORT = process.env.PORT || 5501;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database connection error:', err);
  });