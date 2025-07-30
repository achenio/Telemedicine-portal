from flask import Flask, jsonify
import sqlite3
from Crypto.Cipher import AES
import base64
import binascii
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

ENCRYPTION_KEY = b'abcdefghilmnopqrstuv123456789012'  # 32 bytes

def decrypt_message(encrypted):
    try:
        iv_hex, encrypted_hex = encrypted.split(':')
        iv = binascii.unhexlify(iv_hex)
        encrypted_bytes = binascii.unhexlify(encrypted_hex)
        cipher = AES.new(ENCRYPTION_KEY, AES.MODE_CBC, iv)
        decrypted = cipher.decrypt(encrypted_bytes)
        pad_len = decrypted[-1]
        return decrypted[:-pad_len].decode('utf-8')
    except Exception as e:
        return '[Errore decriptazione]'

@app.route('/api/decrypted-messages/<int:user_id>', methods=['GET'])
def get_decrypted_messages(user_id):
    conn = sqlite3.connect('utenti.db')
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, sender_id, receiver_id, content, timestamp FROM messages WHERE sender_id=? OR receiver_id=? ORDER BY timestamp ASC",
        (user_id, user_id)
    )
    rows = cursor.fetchall()
    conn.close()
    messages = []
    for row in rows:
        decrypted = decrypt_message(row[3])
        messages.append({
            'id': row[0],
            'sender_id': row[1],
            'receiver_id': row[2],
            'content': decrypted,
            'timestamp': row[4]
        })
    return jsonify(messages)

if __name__ == '__main__':
    app.run(port=5005, debug=True)