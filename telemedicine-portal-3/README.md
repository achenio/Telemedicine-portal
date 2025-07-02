# Telemedicine Portal

The Telemedicine Portal is a comprehensive web application designed to facilitate remote healthcare services. It provides features for booking appointments, secure chat, and video consultations, ensuring a seamless experience for both patients and healthcare providers.

## Features

- **User Authentication**: Secure registration and login for users.
- **Appointment Booking**: Users can easily book appointments with healthcare providers.
- **Secure Chat**: Real-time messaging functionality for communication between patients and providers.
- **Video Call Integration**: Conduct secure video consultations using WebRTC technology.

## Project Structure

```
telemedicine-portal
├── backend
│   ├── app.py
│   ├── requirements.txt
│   └── README.md
├── chat
│   ├── chat_client.c
│   ├── chat_server.c
│   └── README.md
├── frontend
│   ├── index.html
│   ├── scripts
│   │   └── main.js
│   ├── styles
│   │   └── main.css
│   └── README.md
├── video-call
│   ├── client.java
│   ├── server.java
│   └── README.md
└── README.md
```

## Setup Instructions

1. **Clone the Repository**
   ```
   git clone <repository-url>
   cd telemedicine-portal
   ```

2. **Backend Setup**
   - Navigate to the `backend` directory:
     ```
     cd backend
     ```
   - Install dependencies:
     ```
     pip install -r requirements.txt
     ```
   - Run the backend application:
     ```
     python app.py
     ```

3. **Chat Setup**
   - Navigate to the `chat` directory:
     ```
     cd chat
     ```
   - Compile the chat server and client:
     ```
     gcc chat_server.c -o chat_server
     gcc chat_client.c -o chat_client
     ```
   - Run the chat server:
     ```
     ./chat_server
     ```
   - Run the chat client in another terminal:
     ```
     ./chat_client
     ```

4. **Frontend Setup**
   - Navigate to the `frontend` directory:
     ```
     cd frontend
     ```
   - Open `index.html` in a web browser to view the application.

5. **Video Call Setup**
   - Navigate to the `video-call` directory:
     ```
     cd video-call
     ```
   - Compile the video call server and client:
     ```
     javac server.java client.java
     ```
   - Run the video call server:
     ```
     java server
     ```
   - Run the video call client in another terminal:
     ```
     java client
     ```

## Contact

For support or inquiries, please contact the development team at [support@telemedicine-portal.com].