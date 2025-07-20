from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import bcrypt

app = Flask(__name__)
CORS(app)

@app.route('/payments', methods=['POST'])
def add_payment():
    data = request.json
    # Crittografa i dati sensibili
    salt = bcrypt.gensalt()
    card_number = bcrypt.hashpw(data.get('card_number','').encode(), salt) if data.get('card_number') else None
    card_cvc = bcrypt.hashpw(data.get('card_cvc','').encode(), salt) if data.get('card_cvc') else None
    bank_iban = bcrypt.hashpw(data.get('bank_iban','').encode(), salt) if data.get('bank_iban') else None

    conn = sqlite3.connect('utenti.db')
    c = conn.cursor()
    c.execute("""
      INSERT INTO payments (
        user_id, appointment_id, method, amount, insurance_package,
        card_number, card_holder, card_expiry, card_cvc,
        bank_iban, bank_holder
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
      data['user_id'], data['appointment_id'], data['method'], data['amount'], data.get('insurance_package'),
      card_number, data.get('card_holder'), data.get('card_expiry'), card_cvc,
      bank_iban, data.get('bank_holder')
    ))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(port=5502)

conn = sqlite3.connect('utenti.db')
c = conn.cursor()
c.execute("""
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  appointment_id INTEGER NOT NULL,
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  insurance_package TEXT,
  card_number TEXT,
  card_holder TEXT,
  card_expiry TEXT,
  card_cvc TEXT,
  bank_iban TEXT,
  bank_holder TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")
conn.commit()
conn.close()