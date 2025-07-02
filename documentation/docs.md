# Telemedicine Portal Documentation

## Overview

Telemedicine Portal is a modern web application designed to provide remote healthcare services. It enables users to:

- Book and manage medical appointments online.  
- Communicate securely with healthcare professionals via encrypted chat.  
- Access AI-powered support for quick symptom checking and guidance.  
- Register and login with secure user authentication backed by a database.

---

## Technologies Used

- **Frontend:** HTML5, CSS3, JavaScript  
- **Backend:** Node.js with Express and WebSocket for real-time chat  
- **Database:** SQLite for user registration and authentication  
- **Security:** WebSocket encryption for chat, password hashing, input validation  

---

## Features Detail

### Appointment Booking

- Users can select available time slots and book medical consultations.  
- Booking data is stored securely on the server.

### Secure Chat

- Real-time encrypted chat between users and healthcare professionals.  
- WebSocket-based communication ensures instant messaging.  
- Multiple clients can connect and exchange messages.

### AI Chat Popup

- Floating, closable AI assistant popup available on main page.  
- Provides quick answers to symptoms or common healthcare questions.

### User Registration and Login

- Secure forms to register with personal data and login credentials.  
- Backend validates unique constraints on email, username, and ID codes.  
- Passwords are securely hashed before storage.

---
