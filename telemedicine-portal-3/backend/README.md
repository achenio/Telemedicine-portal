# Telemedicine Portal Backend

This document provides an overview of the backend for the Telemedicine Portal application. The backend is responsible for handling API requests, managing user authentication, and facilitating appointment bookings.

## Setup Instructions

1. **Clone the Repository**
   ```
   git clone https://github.com/yourusername/telemedicine-portal.git
   cd telemedicine-portal/backend
   ```

2. **Install Dependencies**
   Ensure you have Python installed. Then, install the required packages using pip:
   ```
   pip install -r requirements.txt
   ```

3. **Run the Application**
   Start the backend server:
   ```
   python app.py
   ```

   The server will be running at `http://localhost:5000`.

## API Endpoints

### User Authentication

- **POST /api/login**
  - Request body: `{ "username": "string", "password": "string" }`
  - Description: Authenticates a user and returns a token.

- **POST /api/register**
  - Request body: `{ "username": "string", "password": "string" }`
  - Description: Registers a new user.

### Appointment Booking

- **GET /api/appointments**
  - Description: Retrieves a list of appointments for the authenticated user.

- **POST /api/appointments**
  - Request body: `{ "user_id": "integer", "date": "string", "description": "string" }`
  - Description: Books a new appointment.

## Usage Examples

### Login Example
```bash
curl -X POST http://localhost:5000/api/login -H "Content-Type: application/json" -d '{"username": "user", "password": "pass"}'
```

### Book Appointment Example
```bash
curl -X POST http://localhost:5000/api/appointments -H "Content-Type: application/json" -d '{"user_id": 1, "date": "2023-10-01 10:00:00", "description": "Consultation with Dr. Smith"}'
```

## License

This project is licensed under the MIT License. See the LICENSE file for details.