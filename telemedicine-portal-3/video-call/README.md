# Video Call Functionality Documentation

## Overview
The video call module of the Telemedicine Portal enables users to conduct secure video consultations with healthcare professionals. This module utilizes WebRTC technology to facilitate real-time communication between clients and servers.

## Features
- Real-time video and audio communication
- User authentication and session management
- Support for multiple users in a single call
- Secure connection using encryption

## Setup Instructions
1. Ensure you have Java Development Kit (JDK) installed on your machine.
2. Navigate to the `video-call` directory.
3. Compile the server and client Java files:
   ```
   javac server.java client.java
   ```
4. Start the server:
   ```
   java server
   ```
5. In a separate terminal, start the client:
   ```
   java client
   ```

## Usage
- Users can initiate a video call by connecting to the server using the client application.
- Follow the prompts in the client application to join or create a video call session.
- Ensure that your device has a working camera and microphone for optimal performance.

## Dependencies
- Java SE Development Kit
- WebRTC library (if applicable)

## Troubleshooting
- Ensure that your firewall settings allow the application to communicate over the network.
- Check that your camera and microphone permissions are enabled for the application.

## Contact
For any issues or feature requests, please contact the development team at [support@telemedicine-portal.com].