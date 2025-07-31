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
- **Backend:** Node.js with Express and WebSocket for real-time chat, FLASK CORS to allow real-time payments on the platform 
- **Database:** SQLite to manage user profiles, payment registration, and secure chat history
- **Security:** WebSocket encryption for chat, password hashing, input validation  

---
## 🗄️  Database Architecture
The telemedicine portal database is structured into five main tables:

- **users** – Stores user information including patients and healthcare professionals.  
- **appointments** – Manages scheduling and details of medical appointments.  
- **messages** – Handles real-time encrypted chat between users and professionals.  
- **payments** – Logs transaction details related to medical services.  
- **sqlite_sequence** – Internal table used by SQLite to keep track of AUTOINCREMENT values.

This relational model ensures secure, organized, and efficient handling of sensitive healthcare data.
### 🔒 Security: Encryption, Hashing, and Decryption

Security is a core aspect of the telemedicine portal, ensuring all sensitive data is protected at rest and in transit.


#### 🔐 Passwords and User Data

- User passwords are securely stored using the **bcrypt** hashing algorithm.
- During registration:
  - Passwords are hashed with a **unique salt** before being saved.
- During login:
  - The provided password is hashed and **compared** to the stored hash.


#### 💳 Banking Data Protection

- Sensitive data such as **card numbers, CVCs, and IBANs** are also hashed with **bcrypt**.
- 🔒 **Plain-text storage is never allowed.**
- Hashing:
  - Prevents data reconstruction.
  - Enables validation of submitted values.


#### 💬 End-to-End Encrypted Chat

- Messages between users and healthcare professionals are encrypted using **AES-256-CBC**.
- Encryption is handled on the **server side (Node.js)**:
  - Each message is encrypted with a **32-character symmetric key** and a **random IV**.
  - Stored format: `iv_hex:encrypted_hex`
- 📁 Even with unauthorized database access, **chat content remains unreadable**.


#### 🧠 Python-Based Decryption API

- A separate **Flask microservice** handles decryption:

  ```text
  GET /api/decrypted-messages/<user_id>

| **Users**                                             | **Appointments**                                         | **Messages**                                               | **Payments**                                            | **sqlite_sequence**                                          |
| ----------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| ![Users Screenshot](/screenshots/users.png)            | ![Appointments Screenshot](/screenshots/appointments.png)  | ![Messages Screenshot](/screenshots/messanges_encrypted.png) | ![Payments Screenshot](/screenshots/payments.png)         | ![sqlite_sequence Screenshot](/screenshots/sqlite_sequence.png) |




---
## Features Detail

### Appointment Booking

- Users can select available time slots and book medical consultations.  
- Booking data is stored securely on the server.

### Secure Chat

- Real-time encrypted chat between users and healthcare professionals.  
- WebSocket-based communication ensures instant messaging.  
- Multiple clients can connect and exchange messages.  
![Screenshot](/screenshots/Secure_chat_encrypted.jpg)



### AI Chat Popup

- Floating, closable AI assistant popup available on main page.  
- Provides quick answers to symptoms or common healthcare questions.

### User Registration and Login

- Secure forms to register with personal data and login credentials.  
- Backend validates unique constraints on email, username, and ID codes.  
- Passwords are securely hashed before storage.

---
