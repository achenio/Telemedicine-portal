document.addEventListener("DOMContentLoaded", function() {
    const appointmentForm = document.getElementById("appointment-form");
    const chatForm = document.getElementById("chat-form");
    const videoCallButton = document.getElementById("start-video-call");
    const chatInput = document.getElementById("chat-input");
    const messagesContainer = document.getElementById("messages");

    appointmentForm.addEventListener("submit", function(event) {
        event.preventDefault();
        const formData = new FormData(appointmentForm);
        fetch("/api/appointments", {
            method: "POST",
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            alert("Appointment booked successfully!");
            appointmentForm.reset();
        })
        .catch(error => {
            console.error("Error booking appointment:", error);
        });
    });

    chatForm.addEventListener("submit", function(event) {
        event.preventDefault();
        const message = chatInput.value;
        fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: message })
        })
        .then(response => response.json())
        .then(data => {
            messagesContainer.innerHTML += `<div class="chat-message user">${data.message}</div>`;
            chatInput.value = "";
        })
        .catch(error => {
            console.error("Error sending message:", error);
        });
    });

    videoCallButton.addEventListener("click", function() {
        window.open("/video-call", "_blank");
    });
});