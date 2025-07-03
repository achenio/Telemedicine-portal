from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import torch
from flask_cors import CORS

# Add these imports for transformers
from transformers import AutoModelForCausalLM, AutoTokenizer

app = Flask(__name__)
CORS(app)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///telemedicine.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)

class Appointment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.DateTime, nullable=False)
    description = db.Column(db.String(200), nullable=False)

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('passwaord')
    if not username or not password:
        return jsonify({"message": "Username and password required."}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"message": "Username already exists."}), 400
    hashed_password = generate_password_hash(password)
    user = User(username=username, password=hashed_password)
    db.session.add(user)
    db.session.commit()
    return jsonify({"user_id": user.id}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data['username']).first()
    if user and check_password_hash(user.password, data['password']):
        return jsonify({'message': 'Login successful!', 'user_id': user.id})
    return jsonify({'message': 'Invalid credentials!'}), 401

@app.route('/api/appointments', methods=['POST'])
def book_appointment():
    data = request.get_json()
    user = User.query.get(data['user_id'])
    if not user:
        return jsonify({'message': 'User not found!'}), 404
    try:
        new_appointment = Appointment(
            user_id=data['user_id'],
            date=datetime.strptime(data['date'], '%Y-%m-%d %H:%M:%S'),
            description=data['description']
        )
        db.session.add(new_appointment)
        db.session.commit()
        return jsonify({'message': 'Appointment booked successfully!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error booking appointment: {str(e)}'}), 400

@app.route('/api/appointments', methods=['GET'])
def get_appointments():
    user_id = request.args.get('user_id')
    print("Received user_id:", user_id)
    if user_id:
        appointments = Appointment.query.filter_by(user_id=user_id).all()
    else:
        appointments = Appointment.query.all()
    print("Found appointments:", appointments)
    output = []
    for appointment in appointments:
        appointment_data = {
            'id': appointment.id,
            'user_id': appointment.user_id,
            'date': appointment.date.strftime('%Y-%m-%d %H:%M:%S'),
            'description': appointment.description
        }
        output.append(appointment_data)
    print("Returning:", output)
    return jsonify({'appointments': output})

# Load the model and tokenizer once at startup
tokenizer = AutoTokenizer.from_pretrained("microsoft/DialoGPT-medium")
model = AutoModelForCausalLM.from_pretrained("microsoft/DialoGPT-medium")

@app.route('/api/ai-chat', methods=['POST'])
def ai_chat():
    data = request.get_json()
    user_message = data.get('message', '')
    if not user_message:
        return jsonify({"reply": "No message received."}), 400

    try:
        # Encode the user message and generate a reply
        input_ids = tokenizer.encode(user_message + tokenizer.eos_token, return_tensors='pt').to(model.device)
        with torch.no_grad():
            output_ids = model.generate(
                input_ids,
                max_length=input_ids.shape[1] + 100,
                pad_token_id=tokenizer.eos_token_id,
                do_sample=True,
                top_k=50,
                top_p=0.95
            )
        # Decode and extract the reply (skip the input prompt)
        reply = tokenizer.decode(output_ids[:, input_ids.shape[-1]:][0], skip_special_tokens=True)
        return jsonify({"reply": reply.strip()})
    except Exception as e:
        return jsonify({"reply": f"AI error: {str(e)}"}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    message = data.get('message', '')
    if not message:
        return jsonify({'reply': 'No message received.'}), 400
    # Echo the message back for now
    return jsonify({'reply': f"You said: {message}"})

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)