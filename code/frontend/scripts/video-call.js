document.addEventListener('DOMContentLoaded', () => {
  const localVideo = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');
  const startCallBtn = document.getElementById('startCall');
  const endCallBtn = document.getElementById('endCall');
  const toggleMicBtn = document.getElementById('toggleMic');
  const toggleCamBtn = document.getElementById('toggleCam');
  const joinRoomBtn = document.getElementById('joinRoom');
  const roomIdInput = document.getElementById('roomId');
  const notification = document.getElementById('notification');

  let localStream;
  let peerConnection;
  let socket;
  let roomId;
  let isMicOn = true;
  let isCamOn = true;

  // Connect to Socket.io server
  socket = io('http://localhost:3000');

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  function showNotification(msg, type = 'info') {
    notification.textContent = msg;
    notification.style.color = type === 'error' ? '#dc3545' : '#0071e3';
    setTimeout(() => { notification.textContent = ''; }, 4000);
  }

  async function initPeerConnection() {
    peerConnection = new RTCPeerConnection(iceServers);

    peerConnection.onicecandidate = event => {
      if (event.candidate) {
        socket.emit('candidate', { candidate: event.candidate, roomId });
      }
    };

    peerConnection.ontrack = event => {
      remoteVideo.srcObject = event.streams[0];
    };

    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    }
  }

  function generateRoomId() {
    return 'room-' + Math.random().toString(36).substr(2, 9);
  }

  startCallBtn.addEventListener('click', async () => {
    roomId = roomIdInput.value.trim() || generateRoomId();
    roomIdInput.value = roomId; // Mostra l'ID generato all'utente
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
      await initPeerConnection();

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit('create or join', roomId);
      socket.emit('offer', { offer, roomId });

      startCallBtn.disabled = true;
      endCallBtn.disabled = false;
      showNotification('Call started');
    } catch (error) {
      showNotification('Error starting call: ' + error.message, 'error');
    }
  });

  endCallBtn.addEventListener('click', () => {
    if (peerConnection) peerConnection.close();
    peerConnection = null;
    remoteVideo.srcObject = null;
    startCallBtn.disabled = false;
    endCallBtn.disabled = true;
    showNotification('Call ended');
    if (roomId) socket.emit('leave', roomId);
  });

  joinRoomBtn.addEventListener('click', async () => {
    roomId = roomIdInput.value.trim() || generateRoomId();
    roomIdInput.value = roomId; // Mostra l'ID generato all'utente
    socket.emit('create or join', roomId);
  });

  toggleMicBtn.addEventListener('click', () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      isMicOn = !isMicOn;
      toggleMicBtn.textContent = isMicOn ? 'Mic' : 'Unmute';
    }
  });

  toggleCamBtn.addEventListener('click', () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      isCamOn = !isCamOn;
      toggleCamBtn.textContent = isCamOn ? 'Camera' : 'Show';
    }
  });

  // Socket.io event handlers
  socket.on('created', room => showNotification(`Room ${room} created. Waiting for participant...`));
  socket.on('joined', room => showNotification(`Joined room ${room}. Waiting for offer...`));
  socket.on('full', room => showNotification(`Room ${room} is full`, 'error'));
  socket.on('ready', async () => {
    if (!peerConnection) {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
      await initPeerConnection();
    }
  });
  socket.on('offer', async data => {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
      await initPeerConnection();
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('answer', { answer, roomId: data.roomId });
      startCallBtn.disabled = true;
      endCallBtn.disabled = false;
    } catch (error) {
      showNotification('Error handling offer: ' + error.message, 'error');
    }
  });
  socket.on('answer', async data => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  });
  socket.on('candidate', async data => {
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (error) {
        showNotification('Error adding ICE candidate: ' + error.message, 'error');
      }
    }
  });
  socket.on('leave', () => {
    if (peerConnection) peerConnection.close();
    peerConnection = null;
    remoteVideo.srcObject = null;
    startCallBtn.disabled = false;
    endCallBtn.disabled = true;
    showNotification('Participant left');
  });

  window.addEventListener('beforeunload', () => {
    if (roomId) socket.emit('leave', roomId);
  });
});