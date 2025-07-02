from flask import Flask, request, jsonify
import sqlite3
from werkzeug.security import generate_password_hash

app = Flask(__name__)
DB = "utenti.db"

def init_db():
    conn = sqlite3.connect(DB)
    cursor = conn.cursor()
    cursor.execute('''
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
    ''')
    conn.commit()
    conn.close()

@app.route('/register', methods=['POST'])
def register():
    data = request.json

    # Campi obbligatori
    required = ['nome', 'cognome', 'codice-fiscale', 'data-nascita', 'email', 'telefono', 'username', 'password']
    if not all(field in data and data[field] for field in required):
        return jsonify({'error': 'Tutti i campi obbligatori devono essere compilati.'}), 400

    try:
        conn = sqlite3.connect(DB)
        cursor = conn.cursor()

        # Hash della password
        password_hash = generate_password_hash(data['password'])

        cursor.execute('''
            INSERT INTO utenti (nome, cognome, codice_fiscale, luogo_nascita, data_nascita, email, telefono, username, password_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['nome'],
            data['cognome'],
            data['codice-fiscale'],
            data.get('luogo-nascita', ''),
            data['data-nascita'],
            data['email'],
            data['telefono'],
            data['username'],
            password_hash
        ))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Utente registrato con successo!'}), 201
    except sqlite3.IntegrityError as e:
        # Potresti migliorare l'analisi dell'errore per specificare il campo duplicato
        return jsonify({'error': 'Codice fiscale, email, telefono o username già registrati.'}), 409
    except Exception as e:
        return jsonify({'error': f'Errore interno: {str(e)}'}), 500

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
